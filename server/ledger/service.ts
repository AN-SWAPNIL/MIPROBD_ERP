import { desc, eq, inArray, sql } from "drizzle-orm";
import { approvalPolicies, approvalRequests, ledgerAccounts, ledgerConfigurations, ledgerJournals, ledgerLines, ledgerPeriods, ledgerSourceEvents } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import { ledgerJournalSchema, type LedgerJournalDto, type LedgerLineInput, type LedgerPostingPlan, type LedgerPostingRole } from "../../src/domains/ledger/contracts.js";
import { businessDate } from "../../src/lib/date.js";
import { canReadPayroll } from "../../src/domains/ledger/access.js";
import { audit, digest } from "../foundation/context.js";
import { HttpError } from "../foundation/errors.js";
import { newId, nextNumber } from "../operations/common.js";
import { D } from "../trading/money.js";
import { balancedLines } from "./money.js";

export async function lockLedger(tx: Transaction) { await tx.execute(sql`select pg_advisory_xact_lock(77612023)`); }
export async function checkLedgerDate(tx: Transaction, date: string) {
  if (date > businessDate()) throw new HttpError(422, "Future-dated ledger postings are not allowed.");
  const [period] = await tx.select().from(ledgerPeriods).orderBy(desc(ledgerPeriods.throughDate)).limit(1);
  if (period && date <= period.throughDate) throw new HttpError(409, "The accounting period is closed. Use an approved current-period correction.");
}
export async function readJournal(tx: Transaction, id: string, user: User): Promise<LedgerJournalDto> {
  const [row] = await tx.select().from(ledgerJournals).where(eq(ledgerJournals.id, id));
  if (!row || row.confidential && !canReadPayroll(user)) throw new HttpError(404, "Journal not found in your authorized records.");
  const lines = await tx.select().from(ledgerLines).where(eq(ledgerLines.journalId, id)).orderBy(ledgerLines.position);
  const [approval] = row.approvalId ? await tx.select({ request: approvalRequests, policy: approvalPolicies }).from(approvalRequests).innerJoin(approvalPolicies, eq(approvalRequests.policyId, approvalPolicies.id)).where(eq(approvalRequests.id, row.approvalId)) : [];
  return ledgerJournalSchema.parse({ id: row.id, number: row.number, date: row.date, reference: row.reference, description: row.description, type: row.type, state: row.state, version: row.version, totalBdt: row.totalBdt, approvalId: row.approvalId, approvalState: approval?.request.state ?? null, policyActive: Boolean(approval && approval.policy.state === "Approved" && approval.policy.version === approval.request.policyVersion), createdBy: row.createdBy, confidential: row.confidential, proofReference: row.proofReference, reversalOfId: row.reversalOfId, revisionOfId: row.revisionOfId, lines: lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, note: l.note })) });
}
export function journalHash(row: LedgerJournalDto) { return digest(JSON.stringify({ date: row.date, reference: row.reference, description: row.description, type: row.type, proofReference: row.proofReference, confidential: row.confidential, lines: row.lines })); }
export async function validateLedgerAccounts(tx: Transaction, lines: LedgerLineInput[], allowInactive = false) {
  const ids = [...new Set(lines.map((l) => l.accountId))].sort();
  const accounts = await tx.select().from(ledgerAccounts).where(inArray(ledgerAccounts.id, ids)).orderBy(ledgerAccounts.id).for("share");
  if (accounts.length !== ids.length || !allowInactive && accounts.some((a) => !a.active)) throw new HttpError(422, "Every journal line requires an active chart account.");
}
export async function insertJournal(tx: Transaction, user: User, input: { date: string; reference: string; description: string; type: string; proofReference: string; lines: LedgerLineInput[]; sourceKey?: string; configurationId?: string; reversalOfId?: string; revisionOfId?: string; confidential?: boolean; posted?: boolean }) {
  if (input.date > businessDate()) throw new HttpError(422, "Future-dated journals are not allowed.");
  const balanced = balancedLines(input.lines); await validateLedgerAccounts(tx, balanced.lines, Boolean(input.reversalOfId));
  const id = newId("journal"); const number = await nextNumber(tx, "JV", input.date);
  await tx.insert(ledgerJournals).values({ id, number, date: input.date, reference: input.reference, description: input.description, type: input.type, proofReference: input.proofReference, totalBdt: balanced.totalBdt, sourceKey: input.sourceKey, configurationId: input.configurationId, reversalOfId: input.reversalOfId, revisionOfId: input.revisionOfId, confidential: input.confidential ?? false, state: input.posted ? "Posted" : "Draft", createdBy: user.id, postedBy: input.posted ? user.id : null, postedAt: input.posted ? new Date() : null });
  await tx.insert(ledgerLines).values(balanced.lines.map((line, position) => ({ ...line, id: newId("journal-line"), journalId: id, position })));
  return id;
}
export async function postLedgerEvent(tx: Transaction, user: User, id: string) {
  await lockLedger(tx);
  const [event] = await tx.select().from(ledgerSourceEvents).where(eq(ledgerSourceEvents.id, id)).for("update");
  if (!event) throw new HttpError(404, "Ledger source not found.");
  if (event.state !== "Deferred") return event.journalId;
  const [config] = await tx.select().from(ledgerConfigurations).where(eq(ledgerConfigurations.state, "Approved"));
  if (!config) {
    if (process.env.NODE_ENV === "production" || process.env.ERP_REQUIRE_LEDGER_CONFIGURATION === "true") throw new HttpError(409, "Operational posting requires an approved general-ledger configuration in this environment.");
    return null;
  }
  if (event.date < config.data.effectiveFrom) {
    await tx.update(ledgerSourceEvents).set({ state: "Excluded", configurationId: config.id, reason: "Before approved cutover; reconcile through independently approved opening journals" }).where(eq(ledgerSourceEvents.id, id)); return null;
  }
  await checkLedgerDate(tx, event.date);
  if (!event.plan.length) throw new HttpError(409, "This historical or ambiguous source needs a separately approved journal; it cannot be automatically inferred.");
  const lines = event.plan.map((line): LedgerLineInput => {
    const accountId = line.role === "Cash" ? config.data.cashMappings.find((m) => m.cashAccountId === line.cashAccountId)?.accountId : config.data.mappings.find((m) => m.role === line.role)?.accountId;
    if (!accountId) throw new HttpError(409, "The approved ledger configuration lacks this source's account mapping.");
    return { accountId, debit: line.debit, credit: line.credit, note: line.note ?? "" };
  });
  const journalId = await insertJournal(tx, user, { date: event.date, reference: event.reference, description: event.description, type: "Automatic", proofReference: event.sourceKey, sourceKey: event.sourceKey, configurationId: config.id, confidential: event.confidential, posted: true, lines });
  await tx.update(ledgerSourceEvents).set({ state: "Posted", journalId, configurationId: config.id, reason: "Posted from saved operational source" }).where(eq(ledgerSourceEvents.id, id));
  await audit(tx, user.id, "Automatic ledger journal posted", "Ledger Journal", journalId, { sourceKey: event.sourceKey });
  return journalId;
}
export async function recordLedgerEvent(tx: Transaction, user: User, input: { sourceKey: string; date: string; reference: string; description: string; plan: LedgerPostingPlan; confidential?: boolean }) {
  if (!input.plan.length) {
    const [config] = await tx.select().from(ledgerConfigurations).where(eq(ledgerConfigurations.state, "Approved"));
    if (config && input.date >= config.data.effectiveFrom || !config && (process.env.NODE_ENV === "production" || process.env.ERP_REQUIRE_LEDGER_CONFIGURATION === "true")) throw new HttpError(409, "This source needs an independently approved accounting workflow. Its counterpart must not be inferred after ledger cutover.");
  }
  const existing = await tx.select({ id: ledgerSourceEvents.id }).from(ledgerSourceEvents).where(eq(ledgerSourceEvents.sourceKey, input.sourceKey));
  if (existing.length) return postLedgerEvent(tx, user, existing[0].id);
  const id = newId("ledger-source"); await tx.insert(ledgerSourceEvents).values({ ...input, id, createdBy: user.id, reason: input.plan.length ? "Awaiting approved ledger configuration" : "Requires independently approved source reconciliation" });
  // Deferred sources do not fabricate opening equity. Once configured, new supported postings are atomic with GL.
  return input.plan.length ? postLedgerEvent(tx, user, id) : null;
}
export function twoSidedPlan(debit: LedgerPostingRole, credit: LedgerPostingRole, amount: string, cashAccountId?: string): LedgerPostingPlan {
  if (new D(amount).isZero()) return [];
  return [{ role: debit, debit: new D(amount).toFixed(2), credit: "0.00", ...(debit === "Cash" ? { cashAccountId } : {}) }, { role: credit, debit: "0.00", credit: new D(amount).toFixed(2), ...(credit === "Cash" ? { cashAccountId } : {}) }];
}
export async function recordAccountLedger(tx: Transaction, user: User, row: { id: string; sourceType: string; direction: "In" | "Out"; accountId: string; amount: string; date: string; voucherNumber: string; reversalOfId?: string | null }) {
  if (row.reversalOfId) {
    const [original] = await tx.select().from(ledgerJournals).where(eq(ledgerJournals.sourceKey, `account:${row.reversalOfId}`));
    if (original) {
      await lockLedger(tx); await checkLedgerDate(tx, row.date);
      const originalLines = await tx.select().from(ledgerLines).where(eq(ledgerLines.journalId, original.id)).orderBy(ledgerLines.position);
      const journalId = await insertJournal(tx, user, { date: row.date, reference: row.voucherNumber, description: "Reversal of saved cash-source journal", type: "Automatic Reversal", proofReference: `account:${row.id}`, sourceKey: `account:${row.id}`, configurationId: original.configurationId ?? undefined, reversalOfId: original.id, confidential: original.confidential, posted: true, lines: originalLines.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit, note: "Compensating reversal" })) });
      await tx.insert(ledgerSourceEvents).values({ id: newId("ledger-source"), sourceKey: `account:${row.id}`, date: row.date, reference: row.voucherNumber, description: "Saved-source compensating reversal", plan: [], confidential: original.confidential, state: "Posted", reason: "Reversed original accounts, not today's mappings", journalId, configurationId: original.configurationId, createdBy: user.id }); return;
    }
  }
  const counterpart: Partial<Record<string, LedgerPostingRole>> = { Collection: "Receivables", "Return Refund": "Receivables", Expense: "Operating Expense", "Supplier Payment": "Payables", "Import Cost": "Inventory Clearing", "Company Loan": "Company Loans", "Payroll Payment":"Payroll Payable","Payroll Advance":"Employee Advances","Payroll Loan":"Employee Loans" };
  const role = counterpart[row.sourceType]; const plan = role ? twoSidedPlan(row.direction === "In" ? "Cash" : role, row.direction === "In" ? role : "Cash", row.amount, row.accountId) : [];
  await recordLedgerEvent(tx, user, { sourceKey: `account:${row.id}`, date: row.date, reference: row.voucherNumber, description: `${row.sourceType} cash/bank source`, plan,confidential:row.sourceType.startsWith("Payroll ") });
}
export async function recordStockLedger(tx: Transaction, user: User, row: { id: string; type: string; valueBdt: string; date: string; reference: string; adjustmentSign?: number | null }) {
  if (row.type === "Opening") return;
  if (new D(row.valueBdt).isZero()) return;
  const plan = row.type === "Receive" ? twoSidedPlan("Inventory", "Inventory Clearing", row.valueBdt) : row.type === "Dispatch" ? twoSidedPlan("COGS", "Inventory", row.valueBdt) : row.type === "Return" ? twoSidedPlan("Inventory", "COGS", row.valueBdt) : row.adjustmentSign === 1 ? twoSidedPlan("Inventory", "Stock Gain", row.valueBdt) : row.adjustmentSign === -1 ? twoSidedPlan("Stock Loss", "Inventory", row.valueBdt) : [];
  await recordLedgerEvent(tx, user, { sourceKey: `stock:${row.id}`, date: row.date, reference: row.reference, description: `Stock ${row.type.toLowerCase()} from saved valuation`, plan });
}
export async function recordInvoiceLedger(tx: Transaction, user: User, row: { id: string; invoiceNumber: string; total: string; date: string }, reversal = false) {
  if (new D(row.total).isZero()) return;
  if (reversal) {
    const [original] = await tx.select().from(ledgerJournals).where(eq(ledgerJournals.sourceKey, `invoice:${row.id}`));
    if (original) {
      await lockLedger(tx); await checkLedgerDate(tx, businessDate());
      const lines = await tx.select().from(ledgerLines).where(eq(ledgerLines.journalId, original.id)).orderBy(ledgerLines.position);
      const journalId = await insertJournal(tx, user, { date: businessDate(), reference: row.invoiceNumber, description: "Cancelled invoice: compensating original accounts", type: "Automatic Reversal", proofReference: `invoice-reversal:${row.id}`, sourceKey: `invoice-reversal:${row.id}`, configurationId: original.configurationId ?? undefined, reversalOfId: original.id, posted: true, lines: lines.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit, note: "Invoice cancellation" })) });
      await tx.insert(ledgerSourceEvents).values({ id: newId("ledger-source"), sourceKey: `invoice-reversal:${row.id}`, date: businessDate(), reference: row.invoiceNumber, description: "Invoice cancellation: original accounts reversed", plan: [], state: "Posted", reason: "Compensating original journal", journalId, configurationId: original.configurationId, createdBy: user.id }); return;
    }
  }
  await recordLedgerEvent(tx, user, { sourceKey: `${reversal ? "invoice-reversal" : "invoice"}:${row.id}`, date: reversal ? businessDate() : row.date, reference: row.invoiceNumber, description: reversal ? "Cancellation of historical invoice" : "Approved sales invoice", plan: reversal ? twoSidedPlan("Sales Returns", "Receivables", row.total) : twoSidedPlan("Receivables", "Sales", row.total) });
}
