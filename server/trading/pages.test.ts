import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "../../src/types/index.js";
import { salesPageInput, salesKinds } from "../../src/domains/sales/pageContracts.js";
import { assertSalesKind } from "./pages.js";

test("sales pages bound query sizes and reject untrusted filters or malformed dates", () => {
  assert.equal(salesPageInput.parse({ kind: "orders" }).pageSize, 25);
  for (const input of [{ kind: "orders", pageSize: 1000 }, { kind: "customers", page: 0 }, { kind: "invoices", asOf: "2026-02-30" }, { kind: "accounts", accountType: "All" }, { kind: "orders", ownerId: "another-user" }, { kind: "products", search: "x".repeat(121) }]) assert.equal(salesPageInput.safeParse(input).success, false);
});
test("sales page access preserves warehouse pricing privacy and direct-role denial", () => {
  const employee = (role: User["role"]) => ({ id: "test", role, status: "Active" } as User);
  for (const kind of ["customers", "quotations", "invoices", "collections", "accounts"] as const) assert.throws(() => assertSalesKind(employee("Warehouse Manager"), kind));
  const delegatedWarehouse = { ...employee("Warehouse Manager"), permissionOverrides: [{ permission: "sales", action: "view", effect: "ALLOW" }] } as User;
  for (const kind of ["orders", "deliveries", "products"] as const) assertSalesKind(delegatedWarehouse, kind);
  for (const kind of salesKinds) assert.throws(() => assertSalesKind(employee("Import Officer"), kind));
  for (const kind of salesKinds) assert.throws(() => assertSalesKind({ ...employee("Super Admin"), status: "Inactive" }, kind));
  assertSalesKind(employee("Managing Director"), "customers");
  assertSalesKind(employee("Sales Executive"), "orders");
});
