import type { Capability } from "../../domains/erp.types.js";
import type { PermissionAction, PermissionEffect, PermissionKey, Role, User, UserPermissionOverride } from "../../types/index.js";
import { permissionActions, permissionMatrix, roleRank, settingsEntryPermissions } from "./definitions.js";

export function hasRolePermission(role: Role, permission: PermissionKey, action: PermissionAction = "view") {
  return Boolean(permissionMatrix[role][permission]?.includes(action));
}

export function isSuperAdmin(user: User | null | undefined) {
  return user?.status === "Active" && user.role === "Super Admin";
}

export function getPermissionOverride(user: User, permission: PermissionKey, action: PermissionAction): PermissionEffect | undefined {
  const matches = (user.permissionOverrides ?? []).filter((override) => override.permission === permission && override.action === action);
  if (matches.some((override) => override.effect === "DENY")) return "DENY";
  if (matches.some((override) => override.effect === "ALLOW")) return "ALLOW";
  return undefined;
}

export function hasEffectivePermission(user: User | null | undefined, permission: PermissionKey, action: PermissionAction = "view") {
  if (!user || user.status !== "Active") return false;
  if (isSuperAdmin(user)) return true;
  const override = getPermissionOverride(user, permission, action);
  if (override === "DENY") return false;
  if (override === "ALLOW") return true;
  return hasRolePermission(user.role, permission, action);
}

export function normalizePermissionOverrides(overrides: UserPermissionOverride[] = []) {
  const byKey = new Map<string, UserPermissionOverride>();
  for (const override of overrides) {
    const key = `${override.permission}:${override.action}`;
    const current = byKey.get(key);
    if (!current || override.effect === "DENY") byKey.set(key, { ...override });
  }
  return [...byKey.values()].sort((left, right) => `${left.permission}:${left.action}`.localeCompare(`${right.permission}:${right.action}`));
}

export function hasCapability(user: User | null | undefined, capability: Capability) {
  return isSuperAdmin(user) || Boolean(user?.status === "Active" && user.capabilities?.includes(capability));
}

export function canAccessSettings(user: User | null | undefined) {
  return settingsEntryPermissions.some((permission) => hasEffectivePermission(user, permission, "view"));
}

export type MarketingEmployeeScope = "NONE" | "SELF" | "TEAM" | "ALL";

export function getMarketingEmployeeScope(user: User | null | undefined): MarketingEmployeeScope {
  if (!hasEffectivePermission(user, "marketing", "view")) return "NONE";
  if (user?.role === "Super Admin" || user?.role === "Managing Director") return "ALL";
  if (user?.role === "Sales Manager") return "TEAM";
  return "SELF";
}

export function canViewEmployeeDirectory(user: User | null | undefined) {
  return hasEffectivePermission(user, "users", "view");
}

export function canManageUserAccess(user: User | null | undefined) {
  return isSuperAdmin(user) || hasCapability(user, "manage_user_access");
}

export function canViewManagedEmployeeActivity(user: User | null | undefined) {
  const scope = getMarketingEmployeeScope(user);
  return scope === "TEAM" || scope === "ALL";
}

export function canAccessEmployeeHub(user: User | null | undefined) {
  return canViewEmployeeDirectory(user) || canViewManagedEmployeeActivity(user);
}

export function canManageEmployees(user: User | null | undefined, action: Extract<PermissionAction, "view" | "create" | "edit">) {
  return hasEffectivePermission(user, "users", "view") && hasEffectivePermission(user, "users", action) && (user?.role === "Super Admin" || hasCapability(user, "manage_users"));
}

export function canManageTargetUser(actor: User, target: User) {
  if (!canManageEmployees(actor, "edit") || actor.id === target.id) return false;
  if (actor.role === "Super Admin") return true;
  return target.role !== "Super Admin" && roleRank[actor.role] > roleRank[target.role];
}

export function canAssignRole(actor: User, targetRole: Role) {
  if (actor.role === "Super Admin") return true;
  if (!hasCapability(actor, "manage_user_access") || targetRole === "Super Admin" || roleRank[actor.role] <= roleRank[targetRole]) return false;
  return Object.entries(permissionMatrix[targetRole]).every(([permission, actions]) =>
    (actions ?? []).every((action) => hasEffectivePermission(actor, permission as PermissionKey, action))
  );
}

export function canGrantCapability(actor: User, capability: Capability) {
  if (actor.role === "Super Admin") return true;
  if (!hasCapability(actor, "manage_user_access") || ["manage_user_access", "manage_ledger", "approve_ledger", "view_payroll", "manage_payroll", "approve_payroll", "approve_stock_control"].includes(capability)) return false;
  return hasCapability(actor, capability);
}

export function canGrantPermission(actor: User, permission: PermissionKey, action: PermissionAction, effect: PermissionEffect) {
  if (actor.role === "Super Admin") return true;
  if (!hasCapability(actor, "manage_user_access")) return false;
  if (effect === "DENY") return true;
  return hasEffectivePermission(actor, permission, action);
}

export function roleDefaultRows(role: Role) {
  return Object.entries(permissionMatrix[role]).flatMap(([permission, actions]) =>
    permissionActions.map((action) => ({ permission: permission as PermissionKey, action, allowed: actions?.includes(action) ?? false }))
  );
}
