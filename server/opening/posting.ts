import { and, eq, inArray, sql } from "drizzle-orm";
import { D as Decimal } from "../trading/money.js";
import { accountTransactions, cashAccounts, customerEntries, customers, openingDrafts, openingPositions, openingSources, products, stockBatches, stockMovements, supplierSettlements, suppliers } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import type { OpeningData, OpeningReconciliation } from "../../src/domains/opening/contracts.js";
import { businessDate } from "../../src/lib/date.js";
import { audit, digest } from "../foundation/context.js";
import { HttpError } from "../foundation/errors.js";
import { newId } from "../operations/common.js";
import { postAccountEntry } from "../trading/accounts.js";
import { previewOpening } from "./validation.js";

export async function openingReadiness(tx: Transaction, data: OpeningData) {
  const rows = (await tx.execute<{ message: string | null }>(sql`with lines as (select * from jsonb_to_recordset(${JSON.stringify(data.lines)}::jsonb) as l(kind text,"entityId" text,batch text,"sourceReference" text)), checks as (
    select case
      when kind='Cash Bank' and (exists(select 1 from erp_private.account_transactions a where a.account_id=l."entityId") or (select count(*) from lines x where x.kind='Cash Bank' and x."entityId"=l."entityId")>1) then 'A cash/bank account already has journals or appears more than once. Its opening cannot be added again.'
      when kind='Stock' and exists(select 1 from erp_private.stock_batches b where lower(btrim(b.batch_number))=lower(btrim(l.batch))) then 'A batch is already recorded. Opening stock must not duplicate it.'
      when kind='Customer Due' and exists(select 1 from erp_private.customer_entries e where e.customer_id=l."entityId" and e.type in ('Opening Due','Invoice') and lower(btrim(e.reference))=lower(btrim(l."sourceReference"))) then 'An original customer invoice reference is already recorded.'
      when kind in ('Supplier Due','Supplier Advance') and exists(select 1 from erp_private.supplier_settlements s where s.supplier_id=l."entityId" and lower(btrim(s.reference))=lower(btrim(l."sourceReference"))) then 'A supplier reference already has recorded activity. Reconcile it instead of adding another opening.'
      else null end message from lines l) select distinct message from checks where message is not null order by message`)).rows;
  return rows.map((r) => r.message!);
}

export async function reconcileOpening(tx: Transaction, id: string): Promise<OpeningReconciliation> {
  const [draft] = await tx.select().from(openingDrafts).where(eq(openingDrafts.id, id));
  if (!draft) throw new HttpError(404, "Opening draft not found.");
  const journals = await tx.select({ position: openingPositions, batch: stockBatches, movement: stockMovements, customer: customerEntries, cash: accountTransactions, supplier: supplierSettlements })
    .from(openingPositions).leftJoin(stockBatches, eq(stockBatches.openingPositionId, openingPositions.id))
    .leftJoin(stockMovements, and(eq(stockMovements.batchId, stockBatches.id), eq(stockMovements.type, "Opening")))
    .leftJoin(customerEntries, eq(customerEntries.openingPositionId, openingPositions.id))
    .leftJoin(accountTransactions, eq(accountTransactions.openingPositionId, openingPositions.id))
    .leftJoin(supplierSettlements, eq(supplierSettlements.openingPositionId, openingPositions.id)).where(eq(openingPositions.draftId, id));
  const byLine = new Map(journals.map((j) => [j.position.lineId, j]));
  const rows: OpeningReconciliation["rows"] = [];
  for (const line of draft.data.lines) {
    const journal = byLine.get(line.id); const position = journal?.position;
    const expectedBdt = line.kind === "Stock" ? new Decimal(line.quantity ?? "0").mul(line.unitCostBdt ?? "0").toFixed(2) : new Decimal(line.amountBdt ?? "0").toFixed(2);
    let postedBdt = "0.00"; let matches = false;
    if (position) {
      if (line.kind === "Stock") {
        const batch = journal!.batch; const movement = journal!.movement;
        postedBdt = batch?.receivedValueBdt ?? "0.00";
        matches = Boolean(batch && movement && batch.productId === line.entityId && new Decimal(batch.quantityReceived).eq(line.quantity!) && new Decimal(movement.quantityDelta!).eq(line.quantity!) && new Decimal(movement.valueDeltaBdt!).eq(expectedBdt));
      } else if (line.kind === "Customer Due") {
        const entry = journal!.customer;
        postedBdt = entry?.debit ?? "0.00"; matches = entry?.customerId === line.entityId && entry.type === "Opening Due";
      } else if (line.kind === "Cash Bank") {
        const entry = journal!.cash;
        postedBdt = entry?.amount ?? "0.00"; matches = entry?.accountId === line.entityId && entry.direction === "In" && entry.sourceType === "Opening Balance";
      } else {
        const entry = journal!.supplier;
        postedBdt = entry?.amount ?? "0.00"; matches = entry?.supplierId === line.entityId && entry.entryType === (line.kind === "Supplier Due" ? "Obligation" : "Opening Advance");
      }
    }
    rows.push({ lineId: line.id, kind: line.kind, reference: line.sourceReference, expectedBdt, postedBdt, matches: matches && new Decimal(postedBdt).eq(expectedBdt) && Boolean(position && new Decimal(position.amountBdt).eq(expectedBdt)) });
  }
  return { draftId: id, state: draft.state, expectedLines: draft.data.lines.length, postedLines: journals.length, matches: journals.length === draft.data.lines.length && rows.every((r) => r.matches), rows };
}

export async function postOpening(tx: Transaction, id: string, version: number, user: User) {
  const [draft] = await tx.select().from(openingDrafts).where(eq(openingDrafts.id, id)).for("update");
  if (!draft) throw new HttpError(404, "Opening draft not found.");
  // The immutable draft ID is the posting idempotency key, including retries by a different authorized session.
  if (["Posted", "Reconciled"].includes(draft.state)) return draft;
  if (draft.version !== version) throw new HttpError(409, "Opening draft changed; reload before posting.");
  if (draft.state !== "Approved" || !draft.approvedBy) throw new HttpError(409, "Independently approve the opening preview before posting.");
  const [source] = await tx.select().from(openingSources).where(eq(openingSources.id, draft.sourceId));
  if (!source?.profile || source.state !== "Ready") throw new HttpError(409, "Immutable source evidence is unavailable.");
  const preview = previewOpening(draft.data, source.profile, businessDate());
  if (!preview.canApprove || digest(JSON.stringify({ sha256: source.sha256, data: draft.data, preview })) !== draft.previewHash) throw new HttpError(409, "Approved data no longer validates. Prepare a new reviewed schedule.");
  // Stable master locking also serializes competing drafts and normal receipts/collections/payments.
  const supplierNames = new Map<string, string>();
  for (const [kinds, table] of [[["Customer Due"], customers], [["Supplier Due", "Supplier Advance"], suppliers], [["Stock"], products], [["Cash Bank"], cashAccounts]] as const) {
    const ids = [...new Set(draft.data.lines.filter((l) => (kinds as readonly string[]).includes(l.kind)).map((l) => l.entityId))].sort();
    if (!ids.length) continue;
    const records = await tx.select({ id: table.id, active: table.active, name: table.name }).from(table).where(inArray(table.id, ids)).orderBy(table.id).for("update");
    if (records.length !== ids.length || records.some((r) => !r.active)) throw new HttpError(409, "An approved master is missing or inactive.");
    if (table === suppliers) for (const row of records) supplierNames.set(row.id, row.name);
  }
  const blockers = await openingReadiness(tx, draft.data);
  if (blockers.length) throw new HttpError(409, blockers[0]);
  const positions: (typeof openingPositions.$inferInsert)[] = []; const batches: (typeof stockBatches.$inferInsert)[] = []; const movements: (typeof stockMovements.$inferInsert)[] = [];
  const receivables: (typeof customerEntries.$inferInsert)[] = []; const settlements: (typeof supplierSettlements.$inferInsert)[] = [];
  const cash: { line: OpeningData["lines"][number]; positionId: string; amountBdt: string }[] = [];
  const amounts = new Map(preview.lines.map((p) => [p.id, p]));
  for (const line of draft.data.lines) {
    const amount = amounts.get(line.id)!; const positionId = newId("opening");
    const amountBdt = amount.costValueBdt ?? amount.amountBdt!;
    positions.push({ id: positionId, draftId: id, sourceId: source.id, lineId: line.id, kind: line.kind, entityId: line.entityId, sourceReference: line.sourceReference.trim(), sourceSheet: line.sourceSheet, sourceCell: line.sourceCell, asOfDate: draft.data.asOfDate, amountBdt, snapshot: line, postedBy: user.id });
    if (line.kind === "Stock") {
      const batchId = newId("batch");
      batches.push({ id: batchId, productId: line.entityId, openingPositionId: positionId, sourceReference: line.sourceReference, lotNumber: line.lot.trim(), batchNumber: line.batch.trim(), condition: line.condition!, manufacturingDate: line.manufacturingDate, expiryDate: line.expiryDate, receivedDate: line.receivedDate || draft.data.asOfDate, quantityReceived: line.quantity!, quantityAvailable: line.quantity!, landedCostPerUnit: line.unitCostBdt!, receivedValueBdt: amountBdt, availableValueBdt: amountBdt, warehouse: "Main Warehouse", location: line.location.trim() });
      movements.push({ id: newId("movement"), batchId, type: "Opening", quantity: line.quantity!, valueBdt: amountBdt, date: draft.data.asOfDate, reference: line.sourceReference, createdBy: user.id, createdByName: user.name });
    } else if (line.kind === "Customer Due") {
      receivables.push({ id: newId("customer-entry"), openingPositionId: positionId, customerId: line.entityId, date: draft.data.asOfDate, type: "Opening Due", sourceId: positionId, reference: line.sourceReference, debit: amountBdt, credit: "0", remarks: `Original invoice: ${line.originalDocumentDate}; due: ${line.dueDate}. ${line.note}`, createdBy: user.id });
    } else if (line.kind === "Cash Bank") {
      cash.push({ line, positionId, amountBdt });
    } else {
      settlements.push({ id: newId("settlement"), openingPositionId: positionId, date: draft.data.asOfDate, supplierId: line.entityId, supplierName: supplierNames.get(line.entityId)!, reference: line.sourceReference, entryType: line.kind === "Supplier Due" ? "Obligation" : "Opening Advance", amount: amountBdt, notes: line.note, createdByUserId: user.id, createdByName: user.name });
    }
  }
  await tx.insert(openingPositions).values(positions);
  if (batches.length) await tx.insert(stockBatches).values(batches);
  if (movements.length) await tx.insert(stockMovements).values(movements);
  if (receivables.length) await tx.insert(customerEntries).values(receivables);
  if (settlements.length) await tx.insert(supplierSettlements).values(settlements);
  for (const { line, positionId, amountBdt } of cash) await postAccountEntry(tx, user, { openingPositionId: positionId, accountId: line.entityId, date: draft.data.asOfDate, direction: "In", amount: amountBdt, sourceType: "Opening Balance", sourceId: positionId, reference: line.sourceReference, description: "Approved source-aware opening balance", remarks: line.note });
  const reconciliation = await reconcileOpening(tx, id);
  if (!reconciliation.matches) throw new HttpError(409, "Opening journals did not reconcile. The entire posting was rolled back.");
  const [posted] = await tx.update(openingDrafts).set({ state: "Posted", version: draft.version + 1, updatedAt: new Date() }).where(eq(openingDrafts.id, id)).returning();
  await audit(tx, user.id, "Opening schedule posted", "Opening Draft", id, { sourceHash: source.sha256, approvedBy: draft.approvedBy, lines: reconciliation.postedLines, totals: preview.totals });
  return posted;
}
