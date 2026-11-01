import type { User } from "../../types/index.js";
import { hasCapability, hasEffectivePermission, isSuperAdmin } from "../../lib/permissions/effectiveAccess.js";
import { canReadLedger, canReadPayroll } from "../ledger/access.js";
import type { ControlDomain } from "./contracts.js";
export function canReadApprovalDomain(user: User | null | undefined, domain: ControlDomain) {
  if (isSuperAdmin(user)) return true;
  if (domain === "Ledger") return canReadLedger(user);
  if (domain.startsWith("Payroll")) return canReadPayroll(user);
  return hasEffectivePermission(user, "inventory") || domain === "Returns" && hasEffectivePermission(user, "sales") || domain === "Rejections" && (hasEffectivePermission(user, "import") || hasEffectivePermission(user, "accounts"));
}
export function canDecideApproval(user: User | null | undefined, domain: ControlDomain) {
  return canReadApprovalDomain(user, domain) && (user?.role === "Super Admin" || hasCapability(user, domain === "Ledger" ? "approve_ledger" : domain.startsWith("Payroll") ? "approve_payroll" : "approve_stock_control"));
}
export function canReadApprovalAmount(user: User | null | undefined, domain: ControlDomain) {
  if (isSuperAdmin(user)) return true;
  return domain.startsWith("Payroll") ? canReadPayroll(user) : hasCapability(user, "view_sensitive_cost");
}
