import { z } from "zod";
export const stockControlKinds = ["Physical Count", "Write-off", "Condition Release"] as const;
export const stockConditions = ["Saleable", "Quarantine", "Damaged", "Expired"] as const;
const id = z.string().min(1).max(200);
const quantity = z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,4})?$/);
const cost = z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,10})?$/);
export const stockControlInput = z.object({
  kind: z.enum(stockControlKinds), countDate: z.iso.date(), reason: z.string().trim().min(5).max(1000),
  inspection: z.string().trim().min(5).max(2000), proofReference: z.string().trim().min(3).max(200),
  lines: z.array(z.object({ batchId: id, countedQuantity: quantity.optional(), quantity: quantity.optional(), holdId: id.optional(), unitCostBdt: cost.optional(), surplusCondition: z.enum(stockConditions).optional() }).strict()).min(1).max(50)
}).strict().superRefine((v, ctx) => {
  if (new Set(v.lines.map((l) => l.batchId)).size !== v.lines.length) ctx.addIssue({ code: "custom", path: ["lines"], message: "Include each batch once per document" });
  for (const [index, l] of v.lines.entries()) {
    if (v.kind === "Physical Count" && (l.countedQuantity === undefined || l.quantity !== undefined || l.holdId)) ctx.addIssue({ code: "custom", path: ["lines", index], message: "A physical count needs the counted quantity, not a write-off source" });
    if (v.kind === "Write-off" && (!l.quantity || !/[1-9]/.test(l.quantity) || l.countedQuantity !== undefined || l.unitCostBdt !== undefined || l.surplusCondition)) ctx.addIssue({ code: "custom", path: ["lines", index], message: "Write-offs need a positive quantity; cost comes only from saved stock" });
    if (v.kind === "Condition Release" && (l.quantity !== undefined || l.countedQuantity !== undefined || l.holdId || l.unitCostBdt !== undefined || l.surplusCondition)) ctx.addIssue({ code: "custom", path: ["lines", index], message: "Condition release must not change quantity or cost" });
  }
});
export type StockControlInput = z.infer<typeof stockControlInput>;
export const stockControlPageInput = z.object({ search: z.string().trim().max(120).default(""), kind: z.enum(stockControlKinds).optional(), holdId: id.optional(), page: z.coerce.number().int().min(1).max(10000).default(1) }).strict();
export const stockControlVersionInput = z.object({ version: z.number().int().positive() }).strict();
export const stockControlRevisionInput = stockControlInput.safeExtend({ version: z.number().int().positive() });
export const stockControlLineSchema = z.object({
  id: z.string(), batchId: z.string(), productId: z.string(), productName: z.string(), productCode: z.string(), unit: z.string(), batchNumber: z.string(), lotNumber: z.string(),
  manufacturingDate: z.iso.date(), expiryDate: z.iso.date(), receivedDate: z.iso.date(), warehouse: z.string(), location: z.string(),
  bookQuantity: z.string(), countedQuantity: z.string(), deltaQuantity: z.string(), heldQuantity: z.string(), condition: z.enum(stockConditions),
  holdId: z.string().nullable(), unitCostBdt: z.string().nullable().optional(), valueBdt: z.string().nullable().optional(), bookValueBdt: z.string().optional(), surplusCondition: z.enum(stockConditions).nullable(),
  targetBatchId: z.string().nullable(), movementId: z.string().nullable()
});
export const stockControlRowSchema = z.object({ id: z.string(), number: z.string(), kind: z.enum(stockControlKinds), countDate: z.string(), state: z.enum(["Draft", "Submitted", "Posted", "Superseded"]), version: z.number().int(), totalBdt: z.string().nullable().optional(), createdBy: z.string(), createdByName: z.string(), postedDate: z.string().nullable(), lineCount: z.number().int() });
export const stockControlPageSchema = z.object({ rows: z.array(stockControlRowSchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });
export const stockControlSchema = stockControlRowSchema.extend({ reason: z.string(), inspection: z.string(), proofReference: z.string(), revisionOfId: z.string().nullable(), approvalId: z.string().nullable(), approvalState: z.enum(["Submitted", "Verified", "Approved", "Rejected", "Posted"]).nullable(), policyActive: z.boolean(), blockers: z.array(z.string()), lines: z.array(stockControlLineSchema) });
export type StockControlDto = z.infer<typeof stockControlSchema>;
export type StockControlSnapshot = { productId: string; productName: string; productCode: string; unit: string; batchNumber: string; lotNumber: string; condition: typeof stockConditions[number]; originalQuantity: string; originalValueBdt: string; manufacturingDate: string; expiryDate: string; receivedDate: string; warehouse: string; location: string };
