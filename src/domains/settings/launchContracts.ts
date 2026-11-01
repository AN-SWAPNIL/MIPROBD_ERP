import { z } from "zod";
export const launchCheckSchema = z.object({ id: z.string(), title: z.string(), status: z.enum(["Ready", "Blocked", "Review"]), detail: z.string(), path: z.string().optional() });
export const launchChecksSchema = z.object({ checkedAt: z.string(), productionCertified: z.literal(false), checks: z.array(launchCheckSchema) });
export type LaunchCheck = z.infer<typeof launchCheckSchema>;
