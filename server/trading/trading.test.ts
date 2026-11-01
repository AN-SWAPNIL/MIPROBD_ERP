import test from "node:test";
import assert from "node:assert/strict";
import { calculateSalesLine, convertInput, customerInput, quotationInput, quotationUpdate, salesTotals } from "./contracts.js";
import { assertSalesOwner, checkVersion } from "./records.js";
import type { User } from "../../src/types/index.js";
import { allocateOutstanding, cumulativeShare, D } from "./money.js";

test("sales uses decimal strings, canonical variants and absolute line discounts", () => {
  const line = { productId: "p1", quantity: "1.0050", unitPrice: "1.00", discount: "0.01" };
  const value = calculateSalesLine(line);
  assert.deepEqual(value, { quantity: "1.0050", unitPrice: "1.00", discount: "0.01", lineTotal: "1.00" });
  assert.deepEqual(salesTotals([value, calculateSalesLine({ ...line, quantity: "2", discount: "0" })]), { subtotal: "3.01", discountTotal: "0.01", total: "3.00" });
  assert.throws(() => calculateSalesLine({ ...line, discount: "1.02" }), /Discount/);
  const input = { customerId: "c1", date: "2026-10-24", validityDays: 30, lines: [line], total: "0.01", status: "Converted" };
  assert.equal("total" in quotationInput.parse(input), false);
  assert.equal("status" in quotationInput.parse(input), false);
  assert.equal(quotationInput.safeParse({ ...input, lines: [line, line] }).success, false);
  assert.equal(quotationInput.safeParse({ ...input, lines: [{ ...line, quantity: 2 }] }).success, false);
  assert.equal(customerInput.safeParse({ name: "Test", type: "Hospital", currentDue: "100" }).success, true);
  assert.equal("currentDue" in customerInput.parse({ name: "Test", type: "Hospital", currentDue: "100" }), false);
});

test("sales calculations preserve large fractional values and reject storage overflow", () => {
  assert.equal(calculateSalesLine({ productId: "p1", quantity: "9999999999.9999", unitPrice: "999999999999.99", discount: "0.01" }).lineTotal, "9999999999999799999999.99");
  assert.throws(() => calculateSalesLine({ productId: "p1", quantity: "999999999999", unitPrice: "999999999999", discount: "0" }), /precision/);
});

test("production edits/conversion require a current version and do not expand own-record access", () => {
  assert.equal(quotationUpdate.safeParse({ remarks: "Update" }).success, false);
  assert.deepEqual(quotationUpdate.parse({ version: 1, remarks: "Updated" }), { version: 1, remarks: "Updated" });
  assert.equal(convertInput.safeParse({ deliveryInstruction: "Reception" }).success, false);
  assert.throws(() => checkVersion(2, 1), /Reload/);
  const executive = { id: "one", role: "Sales Executive", status: "Active" } as User;
  assert.doesNotThrow(() => assertSalesOwner(executive, "one"));
  assert.throws(() => assertSalesOwner(executive, "two"), /assigned sales/);
  assert.throws(() => assertSalesOwner(executive, null), /assigned sales/);
});

test("partial dispatch revenue, discount and cost reconcile to their saved totals", () => {
  for (const [total, expected] of [["100", ["33.33", "33.34", "33.33"]], ["0.01", ["0.00", "0.01", "0.00"]], ["0.14", ["0.05", "0.04", "0.05"]]] as const) {
    let value = new D(0); const portions: string[] = [];
    for (let n = 0; n < 3; n++) { const portion = cumulativeShare(total, "3", String(n), value.toString(), "1"); portions.push(portion); value = value.plus(portion); }
    assert.deepEqual(portions, expected); assert.equal(value.toFixed(2), new D(total).toFixed(2));
  }
  assert.throws(() => cumulativeShare("100", "3", "2", "66.67", "2"), /quantity/);
  assert.throws(() => cumulativeShare("100", "0", "0", "0", "1"), /quantity/);
});

test("receipt allocation settles oldest eligible receivables with stable ID tie-breaking", () => {
  const entries = [{ id: "b", date: "2026-10-24", outstanding: "10.01" }, { id: "a", date: "2026-10-24", outstanding: "5.01" }, { id: "old", date: "2026-10-23", outstanding: "1.00" }];
  assert.deepEqual(allocateOutstanding("10.00", entries), [{ entryId: "old", amount: "1.00" }, { entryId: "a", amount: "5.01" }, { entryId: "b", amount: "3.99" }]);
  assert.throws(() => allocateOutstanding("16.03", entries), /exceeds/);
  assert.throws(() => allocateOutstanding("0", entries), /positive/);
});
