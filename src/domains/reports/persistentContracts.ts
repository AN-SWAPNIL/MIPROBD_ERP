import { z } from "zod";

export const ReportFormatSchema = z.enum(["text", "money", "quantity", "integer"]);
export const PersistentColumnSchema = z.object({ key: z.string(), label: z.string(), format: ReportFormatSchema, align: z.enum(["left", "right"]).optional() });
export const ReportCatalogueEntrySchema = z.object({ id: z.string(), title: z.string(), category: z.enum(["sales", "customers", "suppliers", "inventory", "accounts", "employees", "controls"]), description: z.string(), keywords: z.array(z.string()), filters: z.array(z.string()), supportsGrouping: z.boolean(), available: z.boolean(), pendingReason: z.string().optional() });
export const PersistentReportSchema = z.object({
  id: z.string(), title: z.string(), generatedAt: z.string(), from: z.string(), to: z.string(), grouping: z.enum(["Daily", "Weekly", "Monthly", "Yearly"]),
  basis: z.string(), columns: z.array(PersistentColumnSchema), rows: z.array(z.record(z.string(), z.string())),
  totals: z.record(z.string(), z.string()), rowCount: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive(),
  options: z.record(z.string(), z.array(z.object({ value: z.string(), label: z.string() }))), optionsTruncated: z.boolean(),
  filters: z.record(z.string(), z.string()), notes: z.array(z.string())
});
export type ReportCatalogueEntry = z.infer<typeof ReportCatalogueEntrySchema>;
export type PersistentReport = z.infer<typeof PersistentReportSchema>;
export type PersistentColumn = z.infer<typeof PersistentColumnSchema>;
export type PersistentReportQuery = { from: string; to: string; grouping?: "Daily" | "Weekly" | "Monthly" | "Yearly"; page?: number; pageSize?: number } & Record<string, string | number | undefined>;
