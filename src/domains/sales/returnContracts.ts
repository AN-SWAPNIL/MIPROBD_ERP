import { z } from "zod";
import { controlMoney } from "../controls/contracts.js";
import { stockConditions } from "../inventory/controlContracts.js";

const id = z.string().min(1).max(200);
const positiveQuantity = z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,4})?$/).refine((s) => /[1-9]/.test(s), "Quantity must be positive");
export const returnInput = z.object({
  deliveryId: id, invoiceId: id.optional(), kind: z.enum(["Invoiced Return", "Uninvoiced Refusal"]),
  receivedDate: z.iso.date(), reason: z.string().trim().min(5).max(1000), inspection: z.string().trim().min(5).max(2000), proofReference: z.string().trim().min(3).max(200),
  lines: z.array(z.object({ deliveryLineId: id, quantity: positiveQuantity, condition: z.enum(stockConditions), location: z.string().trim().min(1).max(120) }).strict()).min(1).max(50)
}).strict().superRefine((v, ctx) => {
  if ((v.kind === "Invoiced Return") !== Boolean(v.invoiceId)) ctx.addIssue({ code: "custom", path: ["invoiceId"], message: "An invoiced return requires its original approved invoice; a refusal has no invoice credit" });
  if (new Set(v.lines.map((l) => l.deliveryLineId)).size !== v.lines.length) ctx.addIssue({ code: "custom", path: ["lines"], message: "Select each delivered line once" });
});
export const returnRevisionInput = returnInput.safeExtend({ version: z.number().int().positive() });
export const returnPageInput = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), search: z.string().trim().max(120).default(""), orderId: id.optional() }).strict();
export const returnVersionInput = z.object({ version: z.number().int().positive() }).strict();
export const returnSettlementInput = z.object({ kind: z.enum(["Refund", "Apply Credit"]), amountBdt: controlMoney.refine((s) => /[1-9]/.test(s), "Amount must be positive"), accountId: id.optional(), invoiceId: id.optional(),receivableEntryId:id.optional(), reason: z.string().trim().min(5).max(1000), proofReference: z.string().trim().min(3).max(200) }).strict().superRefine((v, ctx) => {
  const targets=Number(Boolean(v.invoiceId))+Number(Boolean(v.receivableEntryId));
  if (v.kind === "Refund" ? !v.accountId || targets!==0 : targets!==1 || Boolean(v.accountId)) ctx.addIssue({ code: "custom", message: "A refund requires an account; credit application requires exactly one invoice or opening receivable" });
});
export const returnLineSchema = z.object({ id: z.string(), deliveryLineId: z.string(), productId: z.string(), productName: z.string(), productCode: z.string(), unit: z.string(), batchNumber: z.string(), lotNumber: z.string(), expiryDate: z.string(), quantity: z.string(), condition: z.enum(stockConditions), location: z.string(), creditBdt: z.string().optional(), discountBdt: z.string().optional(), costBdt: z.string().optional(), targetBatchId: z.string().nullable() });
export const returnRowSchema = z.object({ id: z.string(), number: z.string(), kind: z.enum(["Invoiced Return", "Uninvoiced Refusal"]), customerId: z.string(), customerName: z.string(), orderId: z.string(), orderNumber: z.string(), deliveryId: z.string(), challanNumber: z.string(), invoiceId: z.string().nullable(), invoiceNumber: z.string().nullable(), receivedDate: z.string(), postedDate: z.string().nullable(), state: z.enum(["Draft", "Submitted", "Posted", "Superseded"]), version: z.number().int(), creditBdt: z.string().optional(), costBdt: z.string().optional(), createdBy: z.string(), createdByName: z.string() });
export const returnSettlementSchema = z.object({ id: z.string(), number: z.string(), kind: z.enum(["Refund", "Apply Credit"]), amountBdt: z.string(), accountId: z.string().nullable(), accountName: z.string().nullable(), invoiceId: z.string().nullable(),receivableEntryId:z.string().nullable(), invoiceNumber: z.string().nullable(), state: z.enum(["Submitted", "Posted"]), version: z.number().int(), date: z.string().nullable(), approvalId: z.string(), approvalState: z.string(), policyActive: z.boolean(), createdBy: z.string(), reason: z.string(), proofReference: z.string() });
export const returnSchema = returnRowSchema.extend({ reason: z.string(), inspection: z.string(), proofReference: z.string(), revisionOfId: z.string().nullable(), approvalId: z.string().nullable(), approvalState: z.string().nullable(), policyActive: z.boolean(), availableCreditBdt: z.string().optional(), refundableBdt: z.string().optional(), appliedBdt: z.string().nullable().optional(), lines: z.array(returnLineSchema), settlements: z.array(returnSettlementSchema) });
export const returnPageSchema = z.object({ rows: z.array(returnRowSchema), page: z.number().int(), pageSize: z.number().int(), total: z.number().int() });
export const returnSourcePageSchema = z.object({ rows:z.array(z.object({id:z.string(),challanNumber:z.string(),customerName:z.string(),date:z.string(),orderId:z.string()})),page:z.number().int(),pageSize:z.number().int(),total:z.number().int() });
export const returnTargetPageSchema = z.object({ rows:z.array(z.object({id:z.string(),invoiceNumber:z.string(),kind:z.enum(["Invoice","Opening Due"]),due:z.string()})),page:z.number().int(),pageSize:z.number().int(),total:z.number().int() });
export const returnSourceSchema = z.object({ id: z.string(), challanNumber: z.string(), customerName: z.string(), orderId: z.string(), invoiceId: z.string().nullable(), invoiceNumber: z.string().nullable(), invoiceStatus: z.string().nullable(), lines: z.array(z.object({ id: z.string(), productName: z.string(), batchNumber: z.string(), lotNumber: z.string(), expiryDate: z.string(), delivered: z.string(), returned: z.string(), returnable: z.string(), unit: z.string(), location: z.string() })) });
export type ReturnInput = z.infer<typeof returnInput>;
export type ReturnDto = z.infer<typeof returnSchema>;
export type ReturnLineSnapshot = { productId: string; productCode: string; productName: string; unit: string; batchNumber: string; lotNumber: string; manufacturingDate: string; expiryDate: string; warehouse: string; deliveredQuantity: string; invoiceQuantity: string; originalCostBdt: string; originalCreditBdt: string; originalDiscountBdt: string; previousQuantity: string; previousInvoiceQuantity: string; previousCostBdt: string; previousCreditBdt: string; previousDiscountBdt: string };
