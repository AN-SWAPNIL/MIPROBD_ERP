import type { Role, User } from "../../src/types/index.js";
import { canAssignRole, canManageEmployees, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";

export const deletedInvitationCode = "REMOVED_BY_ADMIN";
export function invitationActions(actor: User, target: { employeeId: string; requestedBy: string; role: Role; employeeStatus: "Pending" | "Active" | "Inactive"; state: string; lastCode: string }) {
  const allowed = actor.id !== target.employeeId && canManageEmployees(actor, "create") && canAssignRole(actor, target.role)
    && (actor.role === "Super Admin" || target.requestedBy === actor.id) && target.lastCode !== deletedInvitationCode;
  return { canCancel: allowed && target.employeeStatus === "Pending", canDelete: allowed && hasEffectivePermission(actor, "users", "delete") && target.state === "Cancelled" && target.employeeStatus === "Inactive" };
}

export const maximumInvitationAttempts = 5;
export function invitationFailure(attempt: number, retryable: boolean, now: Date) {
  return { state: retryable && attempt < maximumInvitationAttempts ? "Queued" as const : "Review" as const,
    nextAttemptAt: new Date(now.getTime() + Math.min(3600, 60 * 2 ** Math.max(0, attempt - 1)) * 1000) };
}
