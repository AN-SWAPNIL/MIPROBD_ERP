import { z } from "zod";

export const invitationState = z.enum(["Queued", "Processing", "Sent", "Review", "Cancelled"]);
export const invitationListInput = z.object({ state: invitationState.optional(), page: z.coerce.number().int().min(1).max(10000).default(1) }).strict();
export const invitationActionInput = z.object({ updatedAt: z.iso.datetime() }).strict();
export const invitationJobSchema = z.object({ id: z.uuid(), employeeId: z.string(), employeeName: z.string(), state: invitationState,
  employeeStatus: z.enum(["Active", "Pending", "Inactive"]), canCancel: z.boolean(), canDelete: z.boolean(),
  attempts: z.number().int(), nextAttemptAt: z.string(), lastCode: z.string(), sentAt: z.string().nullable(), updatedAt: z.string() });
export const invitationListSchema = z.object({ rows: z.array(invitationJobSchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });
export type InvitationJob = z.infer<typeof invitationJobSchema>;
