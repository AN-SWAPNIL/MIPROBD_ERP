import { z } from "zod";
import { approvalStates, controlMoney } from "../controls/contracts.js";
export const ledgerAccountKinds = ["Asset", "Liability", "Equity", "Income", "Expense"] as const;
export const ledgerAccountInput = z.object({ code: z.string().trim().regex(/^[A-Za-z0-9.-]{1,30}$/), name: z.string().trim().min(2).max(120), kind: z.enum(ledgerAccountKinds) }).strict();
export const ledgerLineInput = z.object({ accountId: z.string().min(1).max(100), debit: controlMoney.default("0"), credit: controlMoney.default("0"), note: z.string().trim().max(300).default("") }).strict();
export const ledgerJournalInput = z.object({ date: z.iso.date(), reference: z.string().trim().min(3).max(160), proofReference: z.string().trim().min(3).max(200), description: z.string().trim().min(5).max(1000), type: z.enum(["Opening", "Adjustment"]), lines: z.array(ledgerLineInput).min(2).max(100) }).strict();
export const ledgerMappingRoles = ["Inventory", "Inventory Clearing", "Receivables", "Payables", "Supplier Advances", "Sales", "Sales Returns", "COGS", "Operating Expense", "Stock Loss", "Stock Gain", "Payroll Expense", "Payroll Payable", "Employee Advances", "Employee Loans", "Payroll Deductions", "Company Loans", "Supplier Claims"] as const;
export function ledgerRoleKind(role: typeof ledgerMappingRoles[number]): typeof ledgerAccountKinds[number] {
  if (["Inventory", "Inventory Clearing", "Receivables", "Supplier Advances", "Employee Advances", "Employee Loans", "Supplier Claims"].includes(role)) return "Asset";
  if (["Payables", "Payroll Payable", "Payroll Deductions", "Company Loans"].includes(role)) return "Liability";
  if (["Sales", "Sales Returns", "Stock Gain"].includes(role)) return "Income";
  return "Expense";
}
export const ledgerConfigurationInput = z.object({ effectiveFrom: z.iso.date(), proofReference: z.string().trim().min(3).max(200), mappings: z.array(z.object({ role: z.enum(ledgerMappingRoles), accountId: z.string().min(1) }).strict()).min(ledgerMappingRoles.length-1).max(ledgerMappingRoles.length), cashMappings: z.array(z.object({ cashAccountId: z.string().min(1), accountId: z.string().min(1) }).strict()).max(100) }).strict().superRefine((v, ctx) => {
  if (ledgerMappingRoles.filter(r=>r!=="Supplier Claims").some(role=>!v.mappings.some(m=>m.role===role))) ctx.addIssue({code:"custom",path:["mappings"],message:"Every established posting role is required"});
  if (new Set(v.mappings.map((r) => r.role)).size !== v.mappings.length) ctx.addIssue({ code: "custom", path: ["mappings"], message: "Configure each posting role once" });
  if (new Set(v.mappings.map((r) => r.accountId)).size !== v.mappings.length) ctx.addIssue({ code: "custom", path: ["mappings"], message: "Each posting role requires a separate chart account" });
  if (new Set(v.cashMappings.map((r) => r.cashAccountId)).size !== v.cashMappings.length || new Set(v.cashMappings.map((r) => r.accountId)).size !== v.cashMappings.length) ctx.addIssue({ code: "custom", path: ["cashMappings"], message: "Each bank/cash account needs its own unique ledger account" });
});
export type LedgerLineInput = z.infer<typeof ledgerLineInput>;
export type LedgerConfigurationData = z.infer<typeof ledgerConfigurationInput>;
export type LedgerPostingRole = typeof ledgerMappingRoles[number] | "Cash";
export type LedgerPostingPlan = { role: LedgerPostingRole; cashAccountId?: string; debit: string; credit: string; note?: string }[];
export const ledgerAccountSchema = ledgerAccountInput.extend({ id: z.string(), active: z.boolean() });
export const ledgerJournalSchema = z.object({ id: z.string(), number: z.string(), date: z.string(), reference: z.string(), description: z.string(), type: z.string(), state: z.enum(["Draft", "Submitted", "Posted", "Rejected", "Superseded"]), version: z.number().int(), totalBdt: z.string(), approvalId: z.string().nullable(), approvalState: z.enum(approvalStates).nullable(), policyActive: z.boolean(), createdBy: z.string(), confidential: z.boolean(), lines: z.array(ledgerLineInput), proofReference: z.string(), reversalOfId: z.string().nullable(), revisionOfId: z.string().nullable() });
export type LedgerJournalDto = z.infer<typeof ledgerJournalSchema>;
export const ledgerReportInput = z.object({ from: z.iso.date(), to: z.iso.date(), accountId: z.string().max(100).optional(), page: z.coerce.number().int().positive().max(10000).default(1) }).strict().refine((v) => v.from <= v.to, "End date must follow start date");
export const ledgerJournalListSchema = z.object({ rows: z.array(ledgerJournalSchema.pick({ id: true, number: true, date: true, description: true, reference: true, type: true, state: true, totalBdt: true, version: true })), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });
export const ledgerConfigurationSchema = z.object({ id: z.string(), data: ledgerConfigurationInput, state: z.enum(["Draft", "Approved", "Retired"]), version: z.number().int(), createdBy: z.string(), approvedBy: z.string().nullable() });
export const ledgerStatusSchema = z.object({ strictPosting: z.boolean(), configurationId: z.string().nullable(), cutover: z.string().nullable(), deferred: z.number().int(), periods: z.array(z.object({ id: z.string(), throughDate: z.string(), reason: z.string() })) });
export const ledgerCashSchema = z.object({ id: z.string(), name: z.string(), active: z.boolean() });
export const ledgerSourceSchema = z.object({ id: z.string(), sourceKey: z.string(), date: z.string(), reference: z.string(), description: z.string(), state: z.enum(["Deferred", "Posted", "Excluded"]), reason: z.string(), journalId: z.string().nullable(), confidential: z.boolean() });
export const ledgerSourceListSchema = z.object({ rows: z.array(ledgerSourceSchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });
