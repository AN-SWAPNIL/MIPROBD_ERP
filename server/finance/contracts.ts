import { z } from "zod";
import { decimalInput } from "../operations/contracts.js";
import { D, money } from "../trading/money.js";

const text = z.string().trim().max(200);
const note = z.string().trim().max(3000);
export const categoryInput = z.object({ name: text.min(2), active: z.boolean().default(true) });
export const categoryUpdate = z.object({ name: text.min(2).optional(), active: z.boolean().optional(), version: z.number().int().positive() });
export const expenseInput = z.object({
  date: z.iso.date(), categoryId: text.min(1), subtype: z.enum(["General", "TA/DA"]),
  expenseFor: z.enum(["Employee", "Office", "Warehouse", "Company / General"]), employeeId: text.optional(),
  amount: decimalInput(2).optional(), taAmount: decimalInput(2).optional(), daAmount: decimalInput(2).optional(),
  paidFromAccountId: text.min(1), remarks: note.min(1), attachmentDocumentId: z.uuid().optional()
});
export function expenseAmounts(input: z.infer<typeof expenseInput>) {
  const ta = input.subtype === "TA/DA" ? money(input.taAmount ?? "0") : null;
  const da = input.subtype === "TA/DA" ? money(input.daAmount ?? "0") : null;
  const amount = input.subtype === "TA/DA" ? new D(ta!).plus(da!) : new D(input.amount ?? "0");
  if (amount.lte(0) || amount.gte("1e22")) throw new Error("Enter a supported positive expense amount. TA and DA cannot both be zero.");
  return { amount: money(amount), taAmount: ta, daAmount: da };
}
export const settlementInput = z.object({
  date: z.iso.date(), supplierId: text.min(1), importId: text.optional(), reference: text.min(1),
  entryType: z.enum(["Obligation", "Payment"]), amount: decimalInput(2, true), accountId: text.optional(),
  paymentReference: text.default(""), notes: note.default("")
}).refine((v) => v.entryType !== "Payment" || Boolean(v.accountId), "Select a payment account");
export const positionInput = z.object({
  asOfDate: z.iso.date(), category: z.enum(["Owner Capital", "Fixed Assets", "Accumulated Depreciation", "Statutory Payables", "Other Receivables", "Other Payables", "Opening Retained Earnings"]),
  label: text.min(1), amount: decimalInput(2, true), reference: text.min(1), notes: note.default("")
});
