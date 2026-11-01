import type { Context } from "./context.js";
import { HttpError } from "./errors.js";

type PendingEmployee = { email: string; name: string; authUserId: string | null };
type DeliveryResult = { sent: boolean; authUserId: string | null; retryable?: boolean; failureCode?: string };

export async function deliverInvitation(ctx: Pick<Context, "admin" | "publicClient" | "config">, employee: PendingEmployee): Promise<DeliveryResult> {
  const redirectTo = `${ctx.config.origin}/reset-password`;
  if (employee.authUserId) {
    const { data, error } = await ctx.admin.auth.admin.getUserById(employee.authUserId);
    if (error || !data.user || data.user.email?.toLowerCase() !== employee.email.toLowerCase()) throw new HttpError(409, "The linked authentication account needs administrator review.");
    if (data.user.email_confirmed_at) {
      // A confirmed Pending identity can have an expired setup link. Do not recreate it.
      const { error: deliveryError } = await ctx.publicClient().auth.resetPasswordForEmail(employee.email, { redirectTo });
      return { sent: !deliveryError, authUserId: employee.authUserId, ...(deliveryError ? { retryable: !deliveryError.status || deliveryError.status === 429 || deliveryError.status >= 500, failureCode: deliveryError.status === 429 ? "PROVIDER_LIMIT" : "DELIVERY_FAILED" } : {}) };
    }
  }
  // Supabase reissues invitations for existing unconfirmed identities.
  const { data, error } = await ctx.admin.auth.admin.inviteUserByEmail(employee.email, { redirectTo, data: { name: employee.name } });
  if (error || !data.user) return { sent: false, authUserId: employee.authUserId, retryable: !error?.status || error.status === 429 || error.status >= 500, failureCode: error?.status === 429 ? "PROVIDER_LIMIT" : "DELIVERY_FAILED" };
  if (employee.authUserId && data.user.id !== employee.authUserId) throw new HttpError(409, "Invitation identity mismatch; contact an administrator.");
  return { sent: true, authUserId: data.user.id };
}
