import { z } from "zod";
export const openingKinds = ["Stock", "Customer Due", "Supplier Due", "Supplier Advance", "Cash Bank"] as const;
const amount = (scale: number) => z.string().regex(new RegExp(`^(0|[1-9]\\d{0,11})(\\.\\d{1,${scale}})?$`), "Enter a non-negative decimal without commas");
export const openingLineInput = z.object({
  id: z.string().min(1).max(100), kind: z.enum(openingKinds), entityId: z.string().max(200).default(""),
  sourceSheet: z.string().min(1).max(100), sourceCell: z.string().regex(/^[A-Z]{1,3}[1-9]\d{0,5}$/),
  sourceReference: z.string().trim().max(250).default(""), quantity: amount(4).optional(), unitCostBdt: amount(10).optional(),
  amountBdt: amount(2).optional(), condition: z.enum(["Saleable", "Quarantine", "Damaged", "Expired"]).optional(),
  originalDocumentDate: z.union([z.iso.date(), z.literal("")]).optional(), dueDate: z.union([z.iso.date(), z.literal("")]).optional(),
  receivedDate: z.union([z.iso.date(), z.literal("")]).optional(),
  lot: z.string().max(100).default(""), batch: z.string().max(100).default(""), manufacturingDate: z.union([z.iso.date(), z.literal("")]).default(""),
  expiryDate: z.union([z.iso.date(), z.literal("")]).default(""), location: z.string().max(100).default(""), note: z.string().max(1000).default("")
}).strict();
export const openingDraftData = z.object({ asOfDate: z.iso.date(), proofReference: z.string().trim().max(250),
  lines: z.array(openingLineInput).min(1).max(500), exceptionResolutions: z.array(z.object({ code: z.string().min(1).max(200), explanation: z.string().trim().max(1000), proofReference: z.string().trim().max(250) }).strict()).max(100)
}).strict().superRefine((value, ctx) => {
  if (new Set(value.lines.map((row) => row.id)).size !== value.lines.length) ctx.addIssue({ code: "custom", path: ["lines"], message: "Line IDs must be unique" });
  if (new Set(value.exceptionResolutions.map((row) => row.code)).size !== value.exceptionResolutions.length) ctx.addIssue({ code: "custom", path: ["exceptionResolutions"], message: "Resolve each exception once" });
});
export type OpeningLine = z.infer<typeof openingLineInput>;
export type OpeningData = z.infer<typeof openingDraftData>;
export type SourceCell = { address: string; type: string; value: string | number | boolean | null; formula?: string; sharedFormula?: string; cached?: string | number | boolean | null; format: string; mergedMaster?: string };
export type SourceIssue = { code: string; severity: "Blocker" | "Warning"; sheet: string; cells: string[]; message: string };
export type WorkbookProfile = {
  sha256: string; parser: string; dateSystem: "1900" | "1904";
  sheets: { name: string; rows: number; columns: number; cells: SourceCell[] }[];
  stockCandidates: { sheet: string; cell: string; productLabel: string; model: string; lot: string; manufacturing: string; expiry: string; quantity?: string }[];
  totals: { sheet: string; label: string; cells: string[]; sales?: string; paid?: string; due?: string; difference?: string }[];
  issues: SourceIssue[];
};
export type OpeningPreview = { validationVersion: 1; canApprove: boolean; blockers: { lineId?: string; message: string }[];
  totals: { stockLines: number; stockCostBdt: string; customerDueBdt: string; supplierDueBdt: string; supplierAdvanceBdt: string; cashBankBdt: string };
  lines: { id: string; kind: OpeningLine["kind"]; costValueBdt?: string; amountBdt?: string }[] };
export type OpeningDraft = { id: string; sourceId: string; name: string; state: "Draft" | "Validated" | "Previewed" | "Approved" | "Posted" | "Reconciled"; version: number; data: OpeningData; preview: OpeningPreview | null; createdBy: string; preparedBy: string; approvedBy: string | null; updatedAt: string; entityLabels?: Record<string, string> };
export type OpeningSource = { id: string; fileName: string; sha256: string | null; sizeBytes: number; state: "Pending" | "Ready"; createdAt: string; profile?: WorkbookProfile };
export type OpeningReconciliation = { draftId: string; state: OpeningDraft["state"]; matches: boolean; expectedLines: number; postedLines: number; rows: { lineId: string; kind: OpeningLine["kind"]; reference: string; expectedBdt: string; postedBdt: string; matches: boolean }[] };
