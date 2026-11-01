import test from "node:test";
import assert from "node:assert/strict";
import type { User } from "../../src/types/index.js";
import { dashboardAccess, dashboardInput } from "./router.js";
import { businessDate } from "../../src/lib/date.js";
import { decisionInput, presetInput, warehouseInput } from "../../src/domains/settings/operationalContracts.js";

test("dashboard scopes require source access, with independent profit and warehouse protection", () => {
  const user = (role: User["role"], overrides: User["permissionOverrides"] = []) => ({ id: "test", status: "Active", role, permissionOverrides: overrides } as User);
  const warehouse = dashboardAccess(user("Warehouse Manager", [{ permission: "sales", action: "view", effect: "ALLOW" }, { permission: "accounts", action: "view", effect: "ALLOW" }]));
  assert.equal(warehouse.sales, false); assert.equal(warehouse.accounts, false); assert.equal(warehouse.customers, false); assert.equal(warehouse.inventory, true);
  const importer = dashboardAccess(user("Import Officer")); assert.equal(importer.sales, false); assert.equal(importer.imports, true);
  const sales = dashboardAccess(user("Sales Executive")); assert.equal(sales.sales, true); assert.equal(sales.accounts, false); assert.equal(sales.profit, false);
  assert.equal(dashboardAccess(user("Super Admin", [{ permission: "sales", action: "view", effect: "DENY" }])).profit, true);
  assert.equal(dashboardAccess(user("Managing Director", [{ permission: "sales", action: "view", effect: "DENY" }])).profit, false);
});
test("dashboard validates bounded real business-date periods and rejects unknown scope arguments", () => {
  const today = businessDate(); const valid = { from: today.slice(0, 7) + "-01", to: today };
  assert.ok(dashboardInput.safeParse(valid).success);
  for (const change of [{ from: "2020-01-01" }, { from: "2999-01-01" }, { to: "2999-01-01" }, { from: "2026-02-30" }, { role: "Super Admin" }, { employee: "another" }]) assert.equal(dashboardInput.safeParse({ ...valid, ...change }).success, false);
});
test("operational settings require versions, explicit allocation and non-ambiguous client approval evidence", () => {
  const warehouse = { version: 1, reason: "Confirmed warehouse contact", data: { id: "main", name: "Main Warehouse", address: "", contactPerson: "", phone: "", locations: ["A-01"], active: true } };
  assert.ok(warehouseInput.safeParse(warehouse).success);
  for (const data of [{ ...warehouse.data, name: "Another Warehouse" }, { ...warehouse.data, active: false }, { ...warehouse.data, locations: ["A-01", "a-01"] }]) assert.equal(warehouseInput.safeParse({ ...warehouse, data }).success, false);
  const preset = { reason: "Client-approved suggestion", data: { name: "Ocean Freight", category: "Freight", suggestedAllocationMethod: "CBM", requiresExplicitChoice: true, active: true } };
  assert.ok(presetInput.safeParse(preset).success); assert.equal(presetInput.safeParse({ ...preset, data: { ...preset.data, requiresExplicitChoice: false } }).success, false);
  const decision = { version: 1, status: "Confirmed", resolutionValue: "Approved", resolutionNotes: "Client meeting confirmation", reason: "Approval recorded" };
  assert.ok(decisionInput.safeParse(decision).success); assert.equal(decisionInput.safeParse({ ...decision, resolutionNotes: "" }).success, false); assert.equal(decisionInput.safeParse({ ...decision, confirmedBy: "forged" }).success, false);
});
