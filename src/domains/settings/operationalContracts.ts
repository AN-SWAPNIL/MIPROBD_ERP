import { z } from "zod";

const text = z.string().trim().max(500);
export const settingReason = z.string().trim().min(5).max(1000);
export const allocationChoice = z.enum(["CBM", "FOB_VALUE", "QUANTITY", "PRODUCT_SPECIFIC", "MANUAL"]);
export const importCostCategory = z.enum(["Freight", "Customs Duty", "Bank Charge", "Insurance", "Port / C&F", "Local Transport", "Labour", "Other Import Cost"]);
export const warehouseData = z.object({
  id: z.literal("main"), name: z.literal("Main Warehouse"), address: text,
  contactPerson: text, phone: text, locations: z.array(z.string().trim().min(1).max(80)).max(200), active: z.literal(true)
}).strict().superRefine((value, ctx) => {
  if (new Set(value.locations.map((v) => v.toLowerCase())).size !== value.locations.length)
    ctx.addIssue({ code: "custom", path: ["locations"], message: "BIN locations must be unique." });
});
export const presetData = z.object({
  name: z.string().trim().min(2).max(120), category: importCostCategory,
  suggestedAllocationMethod: allocationChoice.optional(), requiresExplicitChoice: z.literal(true), active: z.boolean()
}).strict();
export const decisionData = z.object({
  title: z.string(), question: z.string(), currentBehavior: z.string(), blocks: z.array(z.string()), sourceReference: z.string(),
  status: z.enum(["Pending Client Confirmation", "Confirmed"]), resolutionValue: z.string(), resolutionNotes: z.string(),
  confirmedBy: z.string().nullable(), confirmedAt: z.string().nullable()
}).strict();
export const warehouseRecord = warehouseData.safeExtend({ version: z.number().int().positive() });
export const presetRecord = presetData.extend({ id: z.string(), version: z.number().int().positive() });
export const decisionRecord = decisionData.extend({ id: z.string(), version: z.number().int().positive() });
export const warehouseInput = z.object({ version: z.number().int().positive(), data: warehouseData, reason: settingReason }).strict();
export const presetInput = z.object({ data: presetData, reason: settingReason, version: z.number().int().positive().optional() }).strict();
export const decisionInput = z.object({
  version: z.number().int().positive(), status: z.enum(["Pending Client Confirmation", "Confirmed"]),
  resolutionValue: z.string().trim().max(500), resolutionNotes: z.string().trim().max(3000), reason: settingReason
}).strict().superRefine((value, ctx) => {
  if (value.status === "Confirmed" && (value.resolutionValue.length < 2 || value.resolutionNotes.length < 5))
    ctx.addIssue({ code: "custom", path: ["resolutionNotes"], message: "Record the agreed decision and its approval evidence." });
});
export type WarehouseData = z.infer<typeof warehouseData>;
export type PresetData = z.infer<typeof presetData>;
export type DecisionData = z.infer<typeof decisionData>;
