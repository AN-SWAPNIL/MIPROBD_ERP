import test from "node:test";
import assert from "node:assert/strict";
import { inventoryPageInput } from "../../src/domains/inventory/pageContracts.js";
test("inventory paging accepts bounded filters and rejects unchecked query parameters", () => {
  assert.deepEqual(inventoryPageInput.parse({}), { page: 1, pageSize: 25, search: "", expiry: "all", eligibleOnly: "false" });
  for (const input of [{ pageSize: 101 }, { page: 0 }, { page: 1.5 }, { search: "a".repeat(121) }, { expiry: "unknown" }, { role: "Super Admin" }]) assert.equal(inventoryPageInput.safeParse(input).success, false);
});
