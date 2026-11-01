import type { User } from "../../types/index.js";
import { hasCapability, hasEffectivePermission, isSuperAdmin } from "../../lib/permissions/effectiveAccess.js";
export function canReadLedger(user: User | null | undefined) { return isSuperAdmin(user) || Boolean(hasEffectivePermission(user, "accounts") && hasCapability(user, "view_sensitive_cost") && (hasCapability(user, "manage_ledger") || hasCapability(user, "approve_ledger"))); }
export function canManageLedger(user: User | null | undefined) { return canReadLedger(user) && hasEffectivePermission(user, "accounts", "post") && (user?.role === "Super Admin" || hasCapability(user, "manage_ledger")); }
export function canReadPayroll(user: User | null | undefined) { return Boolean(user?.status === "Active" && (user.role === "Super Admin" || hasCapability(user, "view_payroll"))); }
export function canManagePayroll(user: User | null | undefined) { return canReadPayroll(user) && (user?.role === "Super Admin" || hasCapability(user, "manage_payroll")); }
