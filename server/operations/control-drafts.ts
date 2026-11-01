import { eq, sql } from "drizzle-orm";
import { products, stockControlLines, stockControls, stockHolds } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import type { StockControlInput, StockControlSnapshot } from "../../src/domains/inventory/controlContracts.js";
import { hasCapability } from "../../src/lib/permissions/effectiveAccess.js";
import { businessDate } from "../../src/lib/date.js";
import { audit, digest } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { D, sum } from "../trading/money.js";
import { newId, nextNumber } from "./common.js";
import { lockStockBatches } from "./stock-locks.js";
import { stockVariance } from "./control-math.js";
import { heldAt } from "./hold-query.js";
import type { loadStockControl } from "./control-records.js";

export async function draftStockControl(tx: Transaction, user: User, input: StockControlInput, previous?: Awaited<ReturnType<typeof loadStockControl>>) {
  if (input.countDate > businessDate()) throw new HttpError(422, "A count or inspection cannot be future-dated.");
  const batches = await lockStockBatches(tx, input.lines.map((l) => l.batchId)); const id = newId("stock-control");
  const lines: typeof stockControlLines.$inferInsert[] = [];
  for (const [position, l] of input.lines.entries()) {
    const batch = batches.find((b) => b.id === l.batchId)!;
    const [product] = await tx.select().from(products).where(eq(products.id, batch.productId));
    const [facts] = (await tx.execute<{ fingerprint: string; held: string; lastDate: string }>(sql`select erp_private.stock_control_fingerprint(${batch.id}) fingerprint,${heldAt(sql`${batch.id}`, sql`${businessDate()}::date`)}::text held,
      greatest(coalesce((select max(date) from erp_private.stock_movements where batch_id=${batch.id}),${batch.receivedDate}::date),coalesce((select max(p.date) from erp_private.stock_control_postings p join erp_private.stock_control_lines l on l.id=p.line_id where l.batch_id=${batch.id}),${batch.receivedDate}::date))::text "lastDate"`)).rows;
    if (input.countDate < facts.lastDate) throw new HttpError(422, "Count/inspection date cannot precede the latest saved stock or condition posting.");
    const oldLine = previous?.lines.find((p) => p.batchId === batch.id);
    if (l.unitCostBdt !== undefined) assertAllowed(hasCapability(user, "view_sensitive_cost") && hasCapability(user, "edit_sensitive_cost"), "Only an authorized cost reviewer may supply surplus unit cost.");
    const unitCostBdt = l.unitCostBdt ?? oldLine?.unitCostBdt ?? null;
    let countedQuantity = l.countedQuantity ?? batch.quantityAvailable;
    if (input.kind === "Write-off") {
      let available = batch.quantityAvailable;
      if (l.holdId) {
        const [hold] = await tx.select().from(stockHolds).where(eq(stockHolds.id, l.holdId));
        if (!hold || hold.batchId !== batch.id) throw new HttpError(422, "Write-off hold must belong to this batch.");
        available = (await tx.execute<{ available: string }>(sql`select erp_private.stock_hold_outstanding(${hold.id},${businessDate()}::date)::text available`)).rows[0].available;
      } else if (batch.condition === "Saleable") throw new HttpError(422, "Protect affected saleable units with a hold before preparing their write-off.");
      if (new D(l.quantity!).gt(available) || new D(l.quantity!).gt(batch.quantityAvailable)) throw new HttpError(409, "Write-off exceeds the remaining held or physical quantity.");
      countedQuantity = new D(batch.quantityAvailable).minus(l.quantity!).toFixed(4);
    }
    if (input.kind === "Condition Release" && (batch.condition === "Saleable" || new D(batch.quantityAvailable).lte(0) || batch.expiryDate < businessDate())) throw new HttpError(422, "Only recognized, non-empty, unexpired batches held by their base condition may be inspected for whole-batch release.");
    const variance = stockVariance({ originalQuantity: batch.quantityReceived, originalValueBdt: batch.receivedValueBdt, bookQuantity: batch.quantityAvailable, bookValueBdt: batch.availableValueBdt, countedQuantity, unitCostBdt });
    const snapshot: StockControlSnapshot = { productId: batch.productId, productName: product.name, productCode: product.code, unit: product.unit, batchNumber: batch.batchNumber, lotNumber: batch.lotNumber, condition: batch.condition, originalQuantity: batch.quantityReceived, originalValueBdt: batch.receivedValueBdt, manufacturingDate: batch.manufacturingDate, expiryDate: batch.expiryDate, receivedDate: batch.receivedDate, warehouse: batch.warehouse, location: batch.location };
    lines.push({ ...variance, id: newId("stock-control-line"), controlId: id, position, batchId: batch.id, holdId: l.holdId ?? null, bookQuantity: batch.quantityAvailable, countedQuantity: new D(countedQuantity).toFixed(4), bookValueBdt: batch.availableValueBdt, heldQuantity: facts.held, unitCostBdt: new D(variance.deltaQuantity).gt(0) ? unitCostBdt : null, surplusCondition: new D(variance.deltaQuantity).gt(0) ? l.surplusCondition ?? oldLine?.surplusCondition ?? null : null, fingerprint: facts.fingerprint, snapshot });
  }
  const totalBdt = lines.some((l) => l.valueBdt === null) ? null : sum(lines.map((l) => input.kind === "Condition Release" ? l.bookValueBdt : l.valueBdt!)).toFixed(2);
  const prepared = [...new Set([...(previous?.row.preparerIds ?? []), user.id])]; if (prepared.length > 100) throw new HttpError(422, "This document has too many preparer revisions; create a new independently reviewed count.");
  const data = { kind: input.kind, countDate: input.countDate, reason: input.reason, inspection: input.inspection, proofReference: input.proofReference, totalBdt, lines, preparerIds: prepared };
  await tx.insert(stockControls).values({ id, kind: input.kind, countDate: input.countDate, reason: input.reason, inspection: input.inspection, proofReference: input.proofReference, number: await nextNumber(tx, "STK", businessDate()), totalBdt, payloadHash: digest(JSON.stringify(data)), preparerIds: prepared, revisionOfId: previous?.row.id ?? null, createdBy: user.id });
  await tx.insert(stockControlLines).values(lines);
  await audit(tx, user.id, "Stock control draft prepared", "Stock Control", id, { kind: input.kind, lineCount: lines.length, revisionOfId: previous?.row.id ?? null });
  return id;
}
