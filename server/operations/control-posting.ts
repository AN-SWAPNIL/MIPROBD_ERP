import { eq } from "drizzle-orm";
import { stockBatches, stockConditionEvents, stockControlPostings, stockControls, stockHoldWriteoffs, stockMovements } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import { businessDate } from "../../src/lib/date.js";
import { consumeApproval } from "../controls/service.js";
import { audit } from "../foundation/context.js";
import { HttpError } from "../foundation/errors.js";
import { recordStockLedger } from "../ledger/service.js";
import { D } from "../trading/money.js";
import { newId } from "./common.js";
import { assertFreshControl, loadStockControl } from "./control-records.js";
import { lockStockBatches } from "./stock-locks.js";

export async function postStockControl(tx: Transaction, user: User, id: string, version: number) {
  const initial = await loadStockControl(tx, id);
  await lockStockBatches(tx, initial.lines.map((l) => l.batchId));
  const [row] = await tx.select().from(stockControls).where(eq(stockControls.id, id)).for("update");
  if (row.state === "Posted") return id;
  if (row.version !== version || row.state !== "Submitted" || !row.approvalId) throw new HttpError(409, "Only the current submitted, independently approved document can post.");
  await assertFreshControl(tx, { row, lines: initial.lines });
  await consumeApproval(tx, user, row.approvalId, { domain: "Stock", resourceType: "Stock Control", resourceId: id, payloadHash: row.payloadHash });
  const date = businessDate();
  // The header guard checks the original snapshot before any quantity/value mutation.
  await tx.update(stockControls).set({ state: "Posted", version: row.version + 1, postedDate: date, postedBy: user.id, postedAt: new Date() }).where(eq(stockControls.id, id));
  const movements: typeof stockMovements.$inferInsert[] = [];
  for (const line of initial.lines) {
    const delta = new D(line.deltaQuantity); let batchId = line.batchId; let movementId: string | null = null;
    if (delta.gt(0)) {
      if (line.unitCostBdt === null || line.valueBdt === null || !line.surplusCondition) throw new HttpError(422, "Surplus source cost/condition is incomplete.");
      batchId = newId("correction-batch");
      await tx.insert(stockBatches).values({ id: batchId, productId: line.snapshot.productId, correctionLineId: line.id, sourceReference: row.number, lotNumber: line.snapshot.lotNumber, batchNumber: `${row.number}-${line.position + 1}`, manufacturingDate: line.snapshot.manufacturingDate, expiryDate: line.snapshot.expiryDate, receivedDate: row.countDate, condition: line.surplusCondition,
        quantityReceived: delta.toFixed(4), quantityAvailable: delta.toFixed(4), landedCostPerUnit: line.unitCostBdt, receivedValueBdt: line.valueBdt, availableValueBdt: line.valueBdt, warehouse: line.snapshot.warehouse, location: line.snapshot.location });
    } else if (delta.lt(0)) {
      await tx.update(stockBatches).set({ quantityAvailable: line.countedQuantity, availableValueBdt: new D(line.bookValueBdt).minus(line.valueBdt!).toFixed(2) }).where(eq(stockBatches.id, line.batchId));
      if (row.kind === "Write-off" && line.holdId) await tx.insert(stockHoldWriteoffs).values({ id: newId("hold-writeoff"), holdId: line.holdId, lineId: line.id, quantity: delta.abs().toFixed(4), date });
    }
    if (!delta.isZero()) {
      movementId = newId("movement");
      const movement = { id: movementId, batchId, type: "Adjustment" as const, quantity: delta.abs().toFixed(4), valueBdt: line.valueBdt!, adjustmentSign: delta.gt(0) ? 1 : -1, date, reference: row.number, createdBy: user.id, createdByName: user.name };
      await tx.insert(stockMovements).values(movement); movements.push(movement);
    }
    if (row.kind === "Condition Release") await tx.insert(stockConditionEvents).values({ id: newId("condition-release"), lineId: line.id, batchId, date });
    await tx.insert(stockControlPostings).values({ id: newId("control-posting"), lineId: line.id, batchId, movementId, date, createdBy: user.id });
  }
  for (const movement of movements) await recordStockLedger(tx, user, movement);
  await audit(tx, user.id, "Approved stock control posted", "Stock Control", id, { kind: row.kind, reference: row.number, lineCount: initial.lines.length });
  return id;
}
