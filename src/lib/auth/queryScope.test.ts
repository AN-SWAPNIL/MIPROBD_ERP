import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { queryScope } from "./queryScope.js";
import type { User } from "../../types/index.js";

const user: User = { id: "one", name: "One", email: "one@example.invalid", role: "Super Admin", status: "Active", title: "", department: "", phone: "", avatarUrl: "", capabilities: ["view_sensitive_cost"] };

test("identity, status, role and effective permission changes isolate query subtrees", () => {
  for (const changed of [{ ...user, id: "two" }, { ...user, status: "Inactive" as const }, { ...user, role: "Warehouse Manager" as const }, { ...user, capabilities: [] }, { ...user, permissionOverrides: [{ permission: "inventory" as const, action: "view" as const, effect: "DENY" as const }] }]) {
    assert.notEqual(queryScope(user), queryScope(changed));
  }
  assert.notEqual(queryScope(user), queryScope(null));
  assert.equal(queryScope({ ...user, name: "Updated name" }), queryScope(user));
  assert.equal(queryScope({ ...user, capabilities: ["view_sensitive_cost", "view_sensitive_cost"] }), queryScope(user));
});

test("fresh scoped clients cannot serve the previous user's sensitive query result", async () => {
  const previous = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
  previous.setQueryData(["inventory", "stock"], [{ inventoryValue: "950000.00" }]);
  const next = new QueryClient();
  let reads = 0;
  const value = await next.fetchQuery({ queryKey: ["inventory", "stock"], queryFn: async () => { reads++; return [{ availableQuantity: "10" }]; } });
  assert.equal(reads, 1);
  assert.equal("inventoryValue" in value[0], false);
  previous.clear(); next.clear();
});
