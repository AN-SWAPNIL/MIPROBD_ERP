import assert from "node:assert/strict";
import test from "node:test";
import type { AllocationMethod, ImportCostLine, ImportItem } from "../erp.types.js";
import { calculateLandedCost } from "./costing.js";

const items: ImportItem[] = [
  { id: "item-a", productId: "a", productCode: "A", productName: "Product A", quantity: "10", unit: "pcs", currency: "USD", fobUnitForeign: "1", exchangeRate: "100", fobTotalBdt: "1000.00", cbmPerCarton: "1", cartonCount: "1", totalCbm: "1" },
  { id: "item-b", productId: "b", productCode: "B", productName: "Product B", quantity: "30", unit: "pcs", currency: "USD", fobUnitForeign: "1", exchangeRate: "100", fobTotalBdt: "3000.00", cbmPerCarton: "1", cartonCount: "3", totalCbm: "3" }
];

function cost(method: AllocationMethod, overrides: Partial<ImportCostLine> = {}): ImportCostLine {
  return {
    id: "cost-1",
    name: "Test Cost",
    category: "Test",
    amountForeign: "100.00",
    currency: "BDT",
    exchangeRate: "1",
    amountBdt: "100.00",
    allocationMethod: method,
    appliesToItemIds: [],
    enteredBy: "Tester",
    createdAt: "2026-08-23T00:00:00.000Z",
    ...overrides
  };
}

test("allocates common cost by CBM and reconciles exactly", () => {
  const result = calculateLandedCost("imp", items, [cost("CBM")]);
  assert.deepEqual(result.validationErrors, []);
  assert.deepEqual(result.allocations.map((row) => row.allocatedBdt), ["25.00", "75.00"]);
  assert.equal(result.totalAdditionalCostBdt, "100.00");
});

test("allocates by FOB value", () => {
  const result = calculateLandedCost("imp", items, [cost("FOB_VALUE")]);
  assert.deepEqual(result.allocations.map((row) => row.allocatedBdt), ["25.00", "75.00"]);
});

test("allocates by quantity", () => {
  const result = calculateLandedCost("imp", items, [cost("QUANTITY")]);
  assert.deepEqual(result.allocations.map((row) => row.allocatedBdt), ["25.00", "75.00"]);
});

test("allocates a product-specific assessed duty only to its selected item", () => {
  const result = calculateLandedCost("imp", items, [cost("PRODUCT_SPECIFIC", { appliesToItemIds: ["item-b"] })]);
  assert.deepEqual(result.validationErrors, []);
  assert.equal(result.allocations.length, 1);
  assert.equal(result.allocations[0].importItemId, "item-b");
  assert.equal(result.allocations[0].allocatedBdt, "100.00");
});

test("accepts an exact manual split and rejects a mismatch", () => {
  const accepted = calculateLandedCost("imp", items, [cost("MANUAL", { manualSplits: [{ importItemId: "item-a", amountBdt: "33.33" }, { importItemId: "item-b", amountBdt: "66.67" }] })]);
  assert.deepEqual(accepted.validationErrors, []);
  assert.equal(accepted.totalAdditionalCostBdt, "100.00");
  const rejected = calculateLandedCost("imp", items, [cost("MANUAL", { manualSplits: [{ importItemId: "item-a", amountBdt: "20.00" }, { importItemId: "item-b", amountBdt: "70.00" }] })]);
  assert.match(rejected.validationErrors[0], /manual split must equal/i);
  assert.equal(rejected.totalAdditionalCostBdt, "0.00");
});

test("converts foreign currency using the captured exchange rate", () => {
  const result = calculateLandedCost("imp", items, [cost("FOB_VALUE", { amountForeign: "10.00", currency: "USD", exchangeRate: "120.00" })]);
  assert.equal(result.totalAdditionalCostBdt, "1200.00");
  assert.equal(result.totalShipmentCostBdt, "5200.00");
});

test("rejects a zero allocation denominator", () => {
  const zeroCbm = items.map((item) => ({ ...item, totalCbm: "0" }));
  const result = calculateLandedCost("imp", zeroCbm, [cost("CBM")]);
  assert.match(result.validationErrors[0], /basis total must be greater than zero/i);
});

test("assigns residual poisha deterministically by item ID", () => {
  const equalItems = ["item-c", "item-a", "item-b"].map((id) => ({ ...items[0], id, productId: id, productCode: id, productName: id, quantity: "1", fobTotalBdt: "1.00", totalCbm: "1" }));
  const result = calculateLandedCost("imp", equalItems, [cost("QUANTITY", { amountForeign: "0.01", amountBdt: "0.01" })]);
  const allocation = Object.fromEntries(result.allocations.map((row) => [row.importItemId, row.allocatedBdt]));
  assert.equal(allocation["item-a"], "0.01");
  assert.equal(allocation["item-b"], "0.00");
  assert.equal(allocation["item-c"], "0.00");
  assert.equal(result.totalAdditionalCostBdt, "0.01");
});

test("zero quantity is reported without producing invalid per-unit strings", () => {
  const invalid = [{ ...items[0], quantity: "0" }];
  const result = calculateLandedCost("imp", invalid, []);
  assert.match(result.validationErrors[0], /quantity must be greater than zero/i);
  assert.equal(result.products[0].finalPerUnitBdt, "1000.00");
});

test("foreign manual splits reconcile against the rounded BDT amount", () => {
  const result = calculateLandedCost("imp", items, [cost("MANUAL", { currency: "USD", amountForeign: "10", exchangeRate: "120.1234", manualSplits: [{ importItemId: "item-a", amountBdt: "300.00" }, { importItemId: "item-b", amountBdt: "901.23" }] })]);
  assert.deepEqual(result.validationErrors, []);
  assert.equal(result.totalAdditionalCostBdt, "1201.23");
});

test("rejects negative, duplicate, overprecise and unknown manual allocations", () => {
  for (const manualSplits of [
    [{ importItemId: "item-a", amountBdt: "-1" }, { importItemId: "item-b", amountBdt: "101" }],
    [{ importItemId: "item-a", amountBdt: "50" }, { importItemId: "item-a", amountBdt: "50" }],
    [{ importItemId: "item-a", amountBdt: "50.001" }, { importItemId: "item-b", amountBdt: "49.999" }],
    [{ importItemId: "missing", amountBdt: "100" }]
  ]) assert.ok(calculateLandedCost("imp", items, [cost("MANUAL", { manualSplits })]).validationErrors.length);
  assert.match(calculateLandedCost("imp", items, [cost("QUANTITY", { appliesToItemIds: ["missing"] })]).validationErrors[0], /unknown product/);
});

test("rejects invalid exchange rates and negative allocation weights", () => {
  assert.match(calculateLandedCost("imp", items, [cost("QUANTITY", { currency: "USD", exchangeRate: "0" })]).validationErrors[0], /exchange rate/);
  assert.match(calculateLandedCost("imp", [{ ...items[0], totalCbm: "-1" }, items[1]], [cost("CBM")]).validationErrors[0], /non-negative/);
});

test("keeps a high-precision unit cost separately from the two-decimal display", () => {
  const result = calculateLandedCost("imp", [{ ...items[0], quantity: "3", fobTotalBdt: "100.00" }], []);
  assert.equal(result.products[0].finalPerUnitBdt, "33.33");
  assert.equal(result.products[0].authoritativeUnitCostBdt, "33.3333333333");
  assert.equal(result.totalShipmentCostBdt, "100.00");
});
