import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { User } from "../../src/types/index.js";
import type { PersistentColumn } from "../../src/domains/reports/persistentContracts.js";
import { businessDate } from "../../src/lib/date.js";
import { HttpError } from "../foundation/errors.js";

export const reportFilterKeys = ["salesperson", "customer", "product", "family", "supplier", "employee", "account", "territory", "status", "order", "lead", "captureQuality", "reviewStatus", "stockControl", "returnId", "payrollRun", "supplierClaim"] as const;
export const queryInput = z.object({
  from: z.iso.date(), to: z.iso.date(), grouping: z.enum(["Daily", "Weekly", "Monthly", "Yearly"]).default("Daily"),
  page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(10).max(100).default(50),
  ...Object.fromEntries(reportFilterKeys.map((key) => [key, z.string().trim().max(200).optional()]))
}).strict().superRefine((value, ctx) => {
  if (value.from > value.to || value.to > businessDate() || Date.parse(value.to) - Date.parse(value.from) > 3660 * 86400000) ctx.addIssue({ code: "custom", path: ["from"], message: "Use a valid period of at most ten years, ending no later than today." });
});
export type Query = z.infer<typeof queryInput> & Partial<Record<(typeof reportFilterKeys)[number], string>>;
export type Dimension = { id: string; label: string };
export type Spec = { base: SQL; result: SQL; columns: (PersistentColumn & { total?: boolean })[]; dimensions: Record<string, Dimension>; basis: string; notes?: string[]; inventoryJournal?: boolean };
export const text = (key: string, label: string): PersistentColumn => ({ key, label, format: "text" });
export const money = (key: string, label: string, total = true): PersistentColumn & { total: boolean } => ({ key, label, format: "money", align: "right", total });
export const qty = (key: string, label: string): PersistentColumn => ({ key, label, format: "quantity", align: "right" });
export const count = (key: string, label: string): PersistentColumn => ({ key, label, format: "integer", align: "right" });
export const raw = sql.raw;
export const dim = (id: string, label = id): Dimension => ({ id, label });
export const own = (user: User, alias: string, column = "owner_id") => user.role === "Sales Executive" ? sql`${sql.identifier(alias)}.${sql.identifier(column)} = ${user.id}` : sql`true`;
export const between = (column: SQL, q: Query) => sql`${column} between ${q.from}::date and ${q.to}::date`;
export const period = (q: Query, field = "date") => q.grouping === "Daily" ? sql`${sql.identifier(field)}::text` : sql`to_char(date_trunc(${raw(q.grouping === "Weekly" ? "'week'" : q.grouping === "Monthly" ? "'month'" : "'year'")}, ${sql.identifier(field)}::date), ${raw(q.grouping === "Yearly" ? "'YYYY'" : q.grouping === "Monthly" ? "'YYYY-MM'" : "'YYYY-MM-DD'")})`;

export function filtered(spec: Spec, q: Query, allowed: string[]) {
  const clauses: SQL[] = [];
  for (const key of reportFilterKeys) {
    const value = q[key]; if (!value) continue;
    const dimension = spec.dimensions[key];
    if (!dimension || !allowed.includes(key)) throw new HttpError(422, `The ${key} filter is not supported by this report.`);
    clauses.push(sql`${sql.identifier(dimension.id)}::text = ${value}`);
  }
  return clauses.length ? sql.join(clauses, sql` and `) : sql`true`;
}

export function csvCell(value: string, format: PersistentColumn["format"] = "text") {
  const numeric = format !== "text" && /^-?\d+(\.\d+)?$/.test(value);
  // Formula prefixes may be hidden after control characters in imported text.
  // eslint-disable-next-line no-control-regex
  const guarded = !numeric && /^[\s\u0000-\u001f]*[=+@\-\uff1d\uff0b\uff0d\uff20]|^[\t\r\n]/u.test(value) ? `\t${value}` : value;
  return `"${guarded.replaceAll('"', '""')}"`;
}
