import { z } from "zod";
import { ledgerAccountSchema, ledgerCashSchema, ledgerMappingRoles, ledgerRoleKind, type LedgerConfigurationData } from "./contracts.js";

const selectionSchema = z.object({ key: z.string().min(1).max(200), accountId: z.string().min(1).max(100) }).strict();
export const ledgerStarterInput = z.object({ effectiveFrom: z.iso.date(), proofReference: z.string().trim().min(3).max(200), acknowledgeDraft: z.literal(true), selections: z.array(selectionSchema).max(120).optional() }).strict().refine(v => new Set(v.selections?.map(s => s.key)).size === (v.selections?.length ?? 0), { path: ["selections"], message: "Choose each account purpose only once." });
const codes = ["1100", "1110", "1120", "2100", "1130", "4100", "4110", "5100", "5110", "5120", "4200", "5130", "2110", "1140", "1150", "2120", "2130", "1160"];
const purposes: Record<string, string> = {
  Inventory: "Value of goods held in stock.", "Inventory Clearing": "Temporary counterpart for stock receipt and import-cost entries; not a supplier payment.",
  Receivables: "Customer amounts billed but not yet collected.", Payables: "Recorded amounts owed to suppliers.", "Supplier Advances": "Supplier advances awaiting settlement.",
  Sales: "Sales income from posted invoices.", "Sales Returns": "Sales reductions from approved customer credits.", COGS: "Original saved cost of goods dispatched to customers.",
  "Operating Expense": "Office and other operating expenses, separate from landed cost.", "Stock Loss": "Approved stock shortages and damage losses.", "Stock Gain": "Approved surplus stock adjustments.",
  "Payroll Expense": "Approved salary and commission expense.", "Payroll Payable": "Approved payroll amounts still unpaid.", "Employee Advances": "Recoverable employee salary advances.",
  "Employee Loans": "Recoverable employee loan balances.", "Payroll Deductions": "Amounts withheld from approved payroll.", "Company Loans": "Recorded company borrowing.", "Supplier Claims": "Approved claims against suppliers.",
  "equity:Owner Capital": "Owner investment account; creating it does not enter capital.", "equity:Retained Earnings": "Retained profit account; creating it does not enter an opening balance."
};
export const ledgerPurposeDescription = (key: string) => purposes[key] ?? "Separate ledger account for this saved cash or bank account.";
export function ledgerSetupReviewIssues(data: LedgerConfigurationData, chart: z.infer<typeof ledgerAccountSchema>[], cash: z.infer<typeof ledgerCashSchema>[]) {
  const issues: string[] = [];
  for (const mapping of data.mappings) {
    const account = chart.find(a => a.id === mapping.accountId);
    if (!account?.active || account.kind !== ledgerRoleKind(mapping.role)) issues.push(`${mapping.role} needs an active ${ledgerRoleKind(mapping.role)} account.`);
  }
  for (const account of cash.filter(a => a.active)) if (!data.cashMappings.some(m => m.cashAccountId === account.id)) issues.push(`Assign a ledger account to ${account.name} before approval.`);
  for (const mapping of data.cashMappings) {
    const account = chart.find(a => a.id === mapping.accountId);
    if (!cash.some(a => a.id === mapping.cashAccountId) || !account?.active || account.kind !== "Asset" || data.mappings.some(m => m.accountId === mapping.accountId)) issues.push("Each saved cash/bank account needs its own active Asset account, separate from stock and other controls.");
  }
  return [...new Set(issues)];
}
export function ledgerStarterRows(cash: z.infer<typeof ledgerCashSchema>[]) {
  if (cash.filter(c => c.active).length > 100) throw new Error("Use New Setup Version when there are more than 100 payment accounts.");
  return [
    ...ledgerMappingRoles.map((role, index) => ({ key: role, role, cashAccountId: undefined as string | undefined, code: codes[index], name: role, kind: ledgerRoleKind(role) })),
    ...[{ code: "3100", name: "Owner Capital" }, { code: "3200", name: "Retained Earnings" }].map(a => ({ ...a, key: `equity:${a.name}`, kind: "Equity" as const, role: undefined, cashAccountId: undefined as string | undefined })),
    ...cash.filter(c => c.active).sort((a, b) => a.id.localeCompare(b.id)).map((c, index) => ({ key: `cash:${c.id}`, role: undefined, cashAccountId: c.id, code: String(120001 + index), name: `Cash / Bank - ${c.name}`.slice(0, 120), kind: "Asset" as const }))
  ];
}
export function ledgerStarterProposal(chart: z.infer<typeof ledgerAccountSchema>[], cash: z.infer<typeof ledgerCashSchema>[], selections: z.infer<typeof selectionSchema>[] = []) {
  const desired = ledgerStarterRows(cash);
  if (new Set(selections.map(s => s.key)).size !== selections.length || selections.some(s => !desired.some(a => a.key === s.key))) throw new Error("Account choices must match the company's actual setup purposes and active payment accounts.");
  const rows = desired.map(account => {
    const choice = selections.find(s => s.key === account.key);
    if (choice) {
      const selected = chart.find(a => a.id === choice.accountId);
      if (!selected?.active || selected.kind !== account.kind) throw new Error(`${account.name}: choose an active ${account.kind} account.`);
      return { ...account, code: selected.code, name: selected.name, existingId: selected.id };
    }
    const existing = chart.find(a => a.code.toLowerCase() === account.code.toLowerCase());
    if (existing && (!existing.active || existing.kind !== account.kind || existing.name !== account.name)) throw new Error(`Account code ${account.code} already has another purpose. Choose an existing account for ${account.name}.`);
    return { ...account, existingId: existing?.id };
  });
  if (new Set(rows.map(a => a.code.toLowerCase())).size !== rows.length || new Set(rows.filter(a => a.existingId).map(a => a.existingId)).size !== rows.filter(a => a.existingId).length) throw new Error("Each purpose needs a separate ledger account. Do not reuse a stock or control account for cash/bank.");
  return rows;
}
