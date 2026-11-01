import { eq, sql } from "drizzle-orm";
import { approvalPolicies, approvalRequests, employees, stockControlLines, stockControlPostings, stockControls } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import { stockControlSchema, type StockControlDto } from "../../src/domains/inventory/controlContracts.js";
import { hasCapability } from "../../src/lib/permissions/effectiveAccess.js";
import { D } from "../trading/money.js";
import { HttpError } from "../foundation/errors.js";

export async function loadStockControl(tx: Transaction, id: string) {
  const [row] = await tx.select().from(stockControls).where(eq(stockControls.id, id)); if (!row) throw new HttpError(404, "Stock control document not found.");
  const lines = await tx.select().from(stockControlLines).where(eq(stockControlLines.controlId, row.id)).orderBy(stockControlLines.position);
  return { row, lines };
}
export function controlBlockers({ row, lines }: Awaited<ReturnType<typeof loadStockControl>>) {
  const blockers: string[] = [];
  for (const l of lines) {
    if (l.valueBdt === null) blockers.push(`${l.snapshot.productCode}: evidenced surplus unit cost is missing.`);
    if (new D(l.deltaQuantity).gt(0) && !l.surplusCondition) blockers.push(`${l.snapshot.productCode}: choose the surplus stock condition.`);
    if (row.kind === "Physical Count" && new D(l.countedQuantity).lt(l.heldQuantity)) blockers.push(`${l.snapshot.productCode}: count is below held quantity. Investigate and dispose of the affected hold separately.`);
  }
  return blockers;
}
export async function assertFreshControl(tx: Transaction, record: Awaited<ReturnType<typeof loadStockControl>>) {
  for (const line of record.lines) {
    const [{ fingerprint }] = (await tx.execute<{ fingerprint: string }>(sql`select erp_private.stock_control_fingerprint(${line.batchId}) fingerprint`)).rows;
    if (fingerprint !== line.fingerprint) throw new HttpError(409, "Stock or condition controls changed after this snapshot. Create a reviewed revision with a fresh physical count.");
  }
  const blockers = controlBlockers(record); if (blockers.length) throw new HttpError(422, blockers.join(" "));
}
export async function readStockControl(tx: Transaction, id: string, user: User): Promise<StockControlDto> {
  const record = await loadStockControl(tx, id); const { row, lines } = record;
  const [author] = await tx.select({ name: employees.name }).from(employees).where(eq(employees.id, row.createdBy));
  const [approval] = row.approvalId ? await tx.select({ request: approvalRequests, policy: approvalPolicies }).from(approvalRequests).innerJoin(approvalPolicies, eq(approvalPolicies.id, approvalRequests.policyId)).where(eq(approvalRequests.id, row.approvalId)) : [];
  const postings = await tx.select().from(stockControlPostings).where(sql`${stockControlPostings.lineId} in (select id from erp_private.stock_control_lines where control_id=${id})`);
  const cost = hasCapability(user, "view_sensitive_cost");
  return stockControlSchema.parse({ id, number: row.number, kind: row.kind, countDate: row.countDate, state: row.state, version: row.version, ...(cost ? { totalBdt: row.totalBdt } : {}), createdBy: row.createdBy, createdByName: author.name, postedDate: row.postedDate, lineCount: lines.length,
    reason: row.reason, inspection: row.inspection, proofReference: row.proofReference, revisionOfId: row.revisionOfId, approvalId: row.approvalId, approvalState: approval?.request.state ?? null, policyActive: Boolean(approval && approval.policy.state === "Approved" && approval.policy.version === approval.request.policyVersion), blockers: controlBlockers(record),
    lines: lines.map((l) => ({ id: l.id, batchId: l.batchId, ...l.snapshot, bookQuantity: l.bookQuantity, countedQuantity: l.countedQuantity, deltaQuantity: l.deltaQuantity, heldQuantity: l.heldQuantity, holdId: l.holdId, surplusCondition: l.surplusCondition,
      ...(cost ? { unitCostBdt: l.unitCostBdt, valueBdt: l.valueBdt, bookValueBdt: l.bookValueBdt } : {}), targetBatchId: postings.find((p) => p.lineId === l.id)?.batchId ?? null, movementId: postings.find((p) => p.lineId === l.id)?.movementId ?? null })) });
}
