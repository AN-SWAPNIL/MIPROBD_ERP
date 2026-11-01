import { z } from "zod";

const numeric = z.string().regex(/^-?\d+(\.\d+)?$/);
const path = z.string().regex(/^\/backend(?:\/[a-zA-Z0-9/_-]+)?(?:\?[^\s]*)?$/);
export const dashboardPayload = z.object({
  generatedAt: z.iso.datetime(), from: z.iso.date(), to: z.iso.date(), operationalDate: z.iso.date(),
  metrics: z.array(z.object({ id: z.string(), label: z.string(), value: numeric, format: z.enum(["money", "integer"]), basis: z.string(), path })).max(6),
  trend: z.array(z.object({ date: z.iso.date(), sales: numeric, collections: numeric })),
  queues: z.array(z.object({
    id: z.string(), title: z.string(), path, columns: z.array(z.object({ key: z.string(), label: z.string(), format: z.enum(["text", "money", "quantity"]).default("text") })),
    rows: z.array(z.record(z.string(), z.string())).max(8), total: numeric
  })), notes: z.array(z.string())
}).strict();
export type DashboardPayload = z.infer<typeof dashboardPayload>;
