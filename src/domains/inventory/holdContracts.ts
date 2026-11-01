import { z } from "zod";

const quantity = z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,4})?$/).refine((s) => /[1-9]/.test(s), "Enter a positive quantity");
const evidence = { reason: z.string().trim().min(5).max(1000), proofReference: z.string().trim().min(3).max(200) };
export const holdInput = z.object({ batchId: z.string().min(1).max(200), quantity, condition: z.enum(["Quarantine", "Damaged"]), ...evidence }).strict();
export const holdReleaseInput = z.object({ quantity, ...evidence }).strict();
export const holdPostInput = z.object({ version: z.number().int().positive() }).strict();
export const holdPageInput = z.object({ search: z.string().trim().max(120).default(""), holdId: z.string().min(1).max(200).optional(), page: z.coerce.number().int().min(1).max(10000).default(1), state: z.enum(["open", "all"]).default("open") }).strict();
export const holdRowSchema = z.object({ id: z.string(), number: z.string(), batchId: z.string(), productId: z.string(), productName: z.string(), batchNumber: z.string(), lotNumber: z.string(), unit: z.string(), condition: z.enum(["Quarantine", "Damaged"]), date: z.string(), quantity: z.string(), releasedQuantity: z.string(), writtenOffQuantity: z.string(), supplierReturnedQuantity: z.string().default("0"), outstandingQuantity: z.string(), valueBdt: z.string().optional(), reason: z.string(), proofReference: z.string(), createdByName: z.string() });
export const holdPageSchema = z.object({ rows: z.array(holdRowSchema), page: z.number().int(), pageSize: z.number().int(), total: z.number().int() });
export const holdReleaseRowSchema = z.object({ id: z.string(), number: z.string(), holdId: z.string(), quantity: z.string(), valueBdt: z.string().optional(), reason: z.string(), proofReference: z.string(), state: z.enum(["Submitted", "Posted"]), version: z.number().int(), date: z.string().nullable(), createdByName: z.string(), approvalId: z.string(), approvalState: z.enum(["Submitted", "Verified", "Approved", "Rejected", "Posted"]), policyActive: z.boolean() });
export const releasePageInput = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }).strict();
export const releasePageSchema = z.object({ rows: z.array(holdReleaseRowSchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });
export type HoldRow = z.infer<typeof holdRowSchema>;
