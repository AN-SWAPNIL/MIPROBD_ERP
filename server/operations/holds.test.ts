import test from "node:test";
import assert from "node:assert/strict";
import { heldQuantity, holdReviewValue, saleableQuantity } from "./hold-math.js";
import { fifoPreview } from "./inventory.js";
import { holdInput, holdPageInput, holdReleaseInput } from "../../src/domains/inventory/holdContracts.js";

test("holds reserve units without subtracting physical stock or changing cost", () => {
  assert.equal(heldQuantity("7", "2"), "5.0000");
  assert.equal(saleableQuantity("10", "5"), "5.0000");
  assert.throws(() => heldQuantity("2", "2.0001")); assert.throws(() => saleableQuantity("2", "3"));
  assert.equal(holdReviewValue("10.01", "3", "1"), "3.34");
  assert.equal(holdReviewValue("999999999999999999999.99", "1", "1"), "999999999999999999999.99");
  for (const quantity of ["0", "-1", "NaN", "4"]) assert.throws(() => holdReviewValue("10", "3", quantity));
});
test("FIFO allocates only unheld units and expiry still blocks an inspected release", () => {
  const batch = { id: "old", productId: "p", batchNumber: "B", lotNumber: "L", receivedDate: "2026-01-01", expiryDate: "2027-01-01", quantityAvailable: "10", eligibleQuantity: "3", condition: "Saleable" as const };
  const newer = { ...batch, id: "new", receivedDate: "2026-02-01", eligibleQuantity: "8" };
  const result = fifoPreview("p", "5", "2026-03-01", [newer, batch]);
  assert.deepEqual(result.allocations.map((a) => a.quantity), ["3.0000", "2.0000"]);
  assert.equal(result.availableQuantity, "11.0000");
  assert.throws(() => fifoPreview("p", "12", "2026-03-01", [newer, batch]));
  assert.throws(() => fifoPreview("p", "1", "2027-02-01", [batch]));
  assert.throws(() => fifoPreview("p", "1", "2026-03-01", [{ ...batch, lastControlDate: "2026-04-01" }]));
});
test("hold inputs bound quantities, evidence, pagination and extra fields", () => {
  const input = { batchId: "batch", quantity: "0.0001", condition: "Quarantine", reason: "Inspection needed", proofReference: "QA-001" };
  assert.ok(holdInput.safeParse(input).success);
  for (const quantity of ["0", "0.0000", "-1", "1e3", "1.00001", "100000000000000"]) assert.equal(holdInput.safeParse({ ...input, quantity }).success, false);
  assert.equal(holdInput.safeParse({ ...input, role: "Super Admin" }).success, false);
  assert.equal(holdReleaseInput.safeParse({ quantity: "1", reason: "ok", proofReference: "QA" }).success, false);
  assert.equal(holdPageInput.safeParse({ page: 0 }).success, false);
});
