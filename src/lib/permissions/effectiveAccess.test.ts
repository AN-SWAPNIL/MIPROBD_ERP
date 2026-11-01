import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "../../types/index.js";
import {
  canAccessEmployeeHub,
  canAccessSettings,
  canAssignRole,
  canGrantCapability,
  canManageTargetUser,
  canManageUserAccess,
  canViewEmployeeDirectory,
  canViewManagedEmployeeActivity,
  getMarketingEmployeeScope,
  hasEffectivePermission,
  hasCapability,
  isSuperAdmin,
  normalizePermissionOverrides
} from "./effectiveAccess.js";

test("active Super Admin owns all access; delegated denies, pending accounts and titles cannot impersonate owner authority", () => {
  const owner = user({ role: "Super Admin", capabilities: [], permissionOverrides: [{ permission: "accounts", action: "post", effect: "DENY" }] });
  assert.equal(isSuperAdmin(owner), true); assert.equal(hasEffectivePermission(owner, "accounts", "post"), true); assert.equal(hasCapability(owner, "approve_payroll"), true); assert.equal(canManageUserAccess(owner), true);
  for (const status of ["Pending", "Inactive"] as const) { assert.equal(isSuperAdmin({ ...owner, status }), false); assert.equal(hasEffectivePermission({ ...owner, status }, "settings"), false); assert.equal(hasCapability({ ...owner, status }, "approve_ledger"), false); assert.equal(canManageUserAccess({ ...owner, status }), false); }
  const staff = user({ role: "Sales Executive", title: "Super Admin", capabilities: [] });
  assert.equal(isSuperAdmin(staff), false); assert.equal(hasCapability(staff, "approve_ledger"), false); assert.equal(hasEffectivePermission(staff, "settings"), false);
});

function user(overrides: Partial<User> = {}): User {
  return {
    id: "test-user",
    name: "Test User",
    email: "test@mipro.local",
    role: "Import Officer",
    title: "Officer",
    department: "Import",
    phone: "",
    avatarUrl: "",
    status: "Active",
    capabilities: [],
    permissionOverrides: [],
    ...overrides
  };
}

test("role defaults are used when no override exists", () => {
  const officer = user();
  assert.equal(hasEffectivePermission(officer, "import", "view"), true);
  assert.equal(hasEffectivePermission(officer, "reports", "view"), false);
});

test("delegated access managers cannot propagate accounting, payroll or stock-control authority", () => {
  const sensitive = ["manage_ledger", "approve_ledger", "view_payroll", "manage_payroll", "approve_payroll", "approve_stock_control"] as const;
  const manager = user({ role: "Managing Director", capabilities: ["manage_user_access", ...sensitive] });
  for (const capability of sensitive) {
    assert.equal(canGrantCapability(manager, capability), false);
    assert.equal(canGrantCapability(user({ role: "Super Admin" }), capability), true);
  }
});

test("Managing Director can open the connected Sales customer view", () => {
  const director = user({ role: "Managing Director" });
  assert.equal(hasEffectivePermission(director, "sales", "view"), true);
  assert.equal(hasEffectivePermission(director, "customers", "view"), true);
});

test("marketing role defaults separate employee work, management review and export", () => {
  const executive = user({ role: "Sales Executive" });
  const manager = user({ role: "Sales Manager" });
  const director = user({ role: "Managing Director" });
  const accounts = user({ role: "Accounts" });
  assert.equal(hasEffectivePermission(executive, "marketing", "create"), true);
  assert.equal(hasEffectivePermission(executive, "marketing", "export"), false);
  assert.equal(hasEffectivePermission(manager, "marketing", "approve"), true);
  assert.equal(hasEffectivePermission(manager, "marketing", "export"), true);
  assert.equal(hasEffectivePermission(director, "marketing", "view"), true);
  assert.equal(hasEffectivePermission(director, "marketing", "create"), false);
  assert.equal(hasEffectivePermission(accounts, "marketing", "view"), false);
});

test("ALLOW adds access and DENY removes role-default access", () => {
  const officer = user({ permissionOverrides: [{ permission: "reports", action: "view", effect: "ALLOW" }] });
  const manager = user({ role: "Sales Manager", permissionOverrides: [{ permission: "reports", action: "export", effect: "DENY" }] });
  assert.equal(hasEffectivePermission(officer, "reports", "view"), true);
  assert.equal(hasEffectivePermission(manager, "reports", "view"), true);
  assert.equal(hasEffectivePermission(manager, "reports", "export"), false);
});

test("DENY wins malformed duplicates and normalization is deterministic", () => {
  const duplicate = [
    { permission: "reports", action: "view", effect: "ALLOW" as const },
    { permission: "reports", action: "view", effect: "DENY" as const }
  ];
  const normalized = normalizePermissionOverrides(duplicate);
  assert.deepEqual(normalized, [{ permission: "reports", action: "view", effect: "DENY" }]);
  assert.equal(hasEffectivePermission(user({ permissionOverrides: duplicate }), "reports", "view"), false);
});

test("inactive users never retain effective access", () => {
  assert.equal(hasEffectivePermission(user({ status: "Inactive" }), "import", "view"), false);
});

test("delegated employee managers can manage lower roles but not self or administrators", () => {
  const manager = user({ id: "manager", role: "Sales Manager", capabilities: ["manage_users"], permissionOverrides: [
    { permission: "users", action: "view", effect: "ALLOW" },
    { permission: "users", action: "create", effect: "ALLOW" },
    { permission: "users", action: "edit", effect: "ALLOW" }
  ] });
  assert.equal(canManageTargetUser(manager, user({ id: "employee", role: "Sales Executive" })), true);
  assert.equal(canManageTargetUser(manager, manager), false);
  assert.equal(canManageTargetUser(manager, user({ id: "owner", role: "Super Admin" })), false);
  assert.equal(canManageTargetUser(manager, user({ id: "peer", role: "Sales Manager" })), false);
  assert.equal(canManageTargetUser({ ...manager, permissionOverrides: [...manager.permissionOverrides!, {permission:"users",action:"view",effect:"DENY"}] }, user({id:"employee",role:"Sales Executive"})), false);
});

test("access authority cannot be propagated by a non-Super-Admin", () => {
  const accessManager = user({ role: "Managing Director", capabilities: ["manage_user_access", "manage_users"] });
  assert.equal(canGrantCapability(accessManager, "manage_user_access"), false);
  assert.equal(canAssignRole(accessManager, "Super Admin"), false);
});

test("employee hub composes directory, access and team-management authority", () => {
  const lifecycleManager = user({
    role: "Accounts",
    capabilities: ["manage_users"],
    permissionOverrides: [{ permission: "users", action: "view", effect: "ALLOW" }]
  });
  const accessManager = user({ role: "Import Officer", capabilities: ["manage_user_access"] });
  const salesManager = user({ role: "Sales Manager" });
  const salesExecutive = user({ role: "Sales Executive" });

  assert.equal(canViewEmployeeDirectory(lifecycleManager), true);
  assert.equal(canAccessEmployeeHub(lifecycleManager), true);
  assert.equal(canAccessSettings(lifecycleManager), false, "users:view alone must not expose generic Settings");
  assert.equal(canManageUserAccess(accessManager), true);
  assert.equal(canAccessEmployeeHub(accessManager), false, "A capability alone cannot grant module view access");
  assert.equal(canAccessEmployeeHub(user({ role: "Super Admin", permissionOverrides: [{permission:"users",action:"view",effect:"DENY"},{permission:"marketing",action:"view",effect:"DENY"}] })), true);
  assert.equal(canViewManagedEmployeeActivity(salesManager), true);
  assert.equal(canAccessEmployeeHub(salesManager), true);
  assert.equal(canViewManagedEmployeeActivity(salesExecutive), false);
  assert.equal(canAccessEmployeeHub(salesExecutive), false);
});

test("marketing scope follows effective access and never turns a deny into role access", () => {
  assert.equal(getMarketingEmployeeScope(user({ role: "Super Admin" })), "ALL");
  assert.equal(getMarketingEmployeeScope(user({ role: "Managing Director" })), "ALL");
  assert.equal(getMarketingEmployeeScope(user({ role: "Sales Manager" })), "TEAM");
  assert.equal(getMarketingEmployeeScope(user({ role: "Sales Executive" })), "SELF");
  assert.equal(getMarketingEmployeeScope(user({ role: "Accounts" })), "NONE");
  assert.equal(getMarketingEmployeeScope(user({
    role: "Sales Manager",
    permissionOverrides: [{ permission: "marketing", action: "view", effect: "DENY" }]
  })), "NONE");
  assert.equal(getMarketingEmployeeScope(user({
    role: "Import Officer",
    permissionOverrides: [{ permission: "marketing", action: "view", effect: "ALLOW" }]
  })), "SELF");
});
