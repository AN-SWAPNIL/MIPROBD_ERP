import type { User as AuthUser } from "@supabase/supabase-js";
import type { Session, User } from "../../src/types/index.js";
import { hasCapability } from "../../src/lib/permissions/effectiveAccess.js";

export function privilegedIdentity(user: User) {
  return ["Super Admin", "Managing Director", "Accounts"].includes(user.role) || (["manage_user_access", "manage_ledger", "approve_ledger", "view_payroll", "manage_payroll", "approve_payroll", "approve_stock_control"] as const).some((capability) => hasCapability(user, capability));
}
// Call only after the provider has validated this exact token with getUser/refresh/verify.
export function sessionSecurity(user: User, authUser: Pick<AuthUser, "factors">, verifiedToken: string, requirePrivileged: boolean): NonNullable<Session["security"]> {
  let assurance: "aal1" | "aal2" = "aal1";
  try { if (JSON.parse(Buffer.from(verifiedToken.split(".")[1], "base64url").toString("utf8")).aal === "aal2") assurance = "aal2"; } catch { /* Missing assurance never grants second-factor access. */ }
  const enrolled = (authUser.factors ?? []).some((factor) => factor.status === "verified");
  return { assurance, enrolled, required: enrolled || requirePrivileged && privilegedIdentity(user) };
}
