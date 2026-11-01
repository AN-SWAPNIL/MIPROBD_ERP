import test from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "decimal.js";
import { fifoPreview, receiptValue } from "./inventory.js";
import { createImportInput, costInput, receiptInput, updateImportInput } from "./contracts.js";

test("partial receipt values reconcile without multiplying the rounded unit display", () => {
  let value = "0";
  const portions: string[] = [];
  for (let count = 0; count < 3; count++) {
    const portion = receiptValue("100", "3", String(count), value, "1");
    portions.push(portion); value = new Decimal(value).plus(portion).toFixed(2);
  }
  assert.deepEqual(portions, ["33.33", "33.34", "33.33"]);
  assert.equal(value, "100.00");
  assert.equal(receiptValue("100", "3", "0", "0", "2"), "66.67");
});

const batch = (id: string, receivedDate: string, expiryDate = "2028-01-01") => ({ id, productId: "p1", quantityAvailable: "2", batchNumber: id, lotNumber: id, receivedDate, expiryDate });
test("FIFO excludes held/damaged stock even when it is older and unexpired", () => {
  const rows = [ { ...batch("hold", "2026-01-01"), condition: "Quarantine" as const }, { ...batch("damage", "2026-02-01"), condition: "Damaged" as const }, { ...batch("normal", "2026-03-01"), condition: "Saleable" as const } ];
  const result = fifoPreview("p1", "2", "2026-10-29", rows);
  assert.deepEqual(result.allocations.map((r) => r.batchId), ["normal"]);
  assert.equal(result.requiresOverride, false); assert.equal(result.availableQuantity, "2.0000");
  assert.throws(() => fifoPreview("p1", "1", "2026-10-29", rows, "hold"), /unavailable/);
  const opening = { ...batch("opening", "2026-09-01"), availableFromDate: "2026-10-01" };
  assert.throws(() => fifoPreview("p1", "1", "2026-09-30", [opening]), /Only 0/);
  assert.equal(fifoPreview("p1", "1", "2026-10-01", [opening]).allocations[0].batchId, "opening");
});
test("FIFO uses eligible received dates, spans batches and explains newer-batch preference", () => {
  const rows = [batch("new", "2026-10-02"), batch("old", "2026-10-01"), batch("expired", "2026-09-01", "2026-10-01"), batch("future", "2026-11-01")];
  const result = fifoPreview("p1", "3", "2026-10-24", rows);
  assert.deepEqual(result.allocations.map((row) => [row.batchId, row.quantity]), [["old", "2.0000"], ["new", "1.0000"]]);
  assert.equal(result.availableQuantity, "4.0000");
  assert.equal(result.requiresOverride, false);
  assert.equal(fifoPreview("p1", "1", "2026-10-24", rows, "new").requiresOverride, true);
  assert.throws(() => fifoPreview("p1", "5", "2026-10-24", rows), /Only 4/);
  assert.throws(() => fifoPreview("p1", "1", "2026-10-24", rows, "expired"), /expired/);
  assert.throws(() => fifoPreview("p1", "0", "2026-10-24", rows), /positive/);
});

test("partial commercial updates do not reset absent payment and exchange-rate fields", () => {
  assert.deepEqual(updateImportInput.parse({ notes: "Updated note" }), { notes: "Updated note" });
});

test("business inputs enforce decimal strings and ignore submitted calculated values", () => {
  const cost = { name: "Freight", category: "Freight", currency: "USD", amountForeign: "10", exchangeRate: "120.1", allocationMethod: "QUANTITY", amountBdt: "0.01" };
  assert.equal("amountBdt" in costInput.parse(cost), false);
  assert.equal(costInput.safeParse({ ...cost, amountForeign: 10 }).success, false);
  assert.equal(costInput.safeParse({ ...cost, exchangeRate: "0" }).success, false);
  assert.equal(costInput.safeParse({ ...cost, amountForeign: "1e10" }).success, false);
  assert.equal(receiptInput.safeParse({ receivedDate: "2026-10-24", lines: [] }).success, false);
  assert.equal(createImportInput.safeParse({ supplierId: "sup-1", poNumber: "PO-1", poDate: "2026-10-24", items: [] }).success, false);
});
