import test from "node:test";
import assert from "node:assert/strict";
import { stockVariance } from "./control-math.js";
import { stockControlInput, stockControlPageInput, stockControlRevisionInput } from "../../src/domains/inventory/controlContracts.js";
import { reportPresentation } from "../../src/domains/reports/reportPresentation.js";
import type { PersistentReport } from "../../src/domains/reports/persistentContracts.js";

test("physical losses consume authoritative cumulative saved cost, not rounded unit price", () => {
  const original = { originalQuantity: "3", originalValueBdt: "10.01" };
  assert.deepEqual(stockVariance({ ...original, bookQuantity: "3", bookValueBdt: "10.01", countedQuantity: "2" }), { deltaQuantity: "-1.0000", valueBdt: "3.34" });
  assert.deepEqual(stockVariance({ ...original, bookQuantity: "2", bookValueBdt: "6.67", countedQuantity: "1" }), { deltaQuantity: "-1.0000", valueBdt: "3.33" });
  assert.deepEqual(stockVariance({ ...original, bookQuantity: "1", bookValueBdt: "3.34", countedQuantity: "0" }), { deltaQuantity: "-1.0000", valueBdt: "3.34" });
});
test("surplus requires explicit cost and does not inflate the old batch's origin", () => {
  const base = { originalQuantity: "10", originalValueBdt: "10.10", bookQuantity: "8", bookValueBdt: "8.08", countedQuantity: "10" };
  assert.deepEqual(stockVariance(base), { deltaQuantity: "2.0000", valueBdt: null });
  assert.deepEqual(stockVariance({ ...base, unitCostBdt: "1.50" }), { deltaQuantity: "2.0000", valueBdt: "3.00" });
  assert.deepEqual(stockVariance({ ...base, unitCostBdt: "0" }), { deltaQuantity: "2.0000", valueBdt: "0.00" });
  assert.throws(() => stockVariance({ ...base, unitCostBdt: "-1" }));
  assert.throws(() => stockVariance({ ...base, unitCostBdt: "9999999999999999999999" }));
});
test("zero variance creates no synthetic cost and fractional/large values stay exact", () => {
  const original = { originalQuantity: "0.0003", originalValueBdt: "0.02", bookQuantity: "0.0003", bookValueBdt: "0.02" };
  assert.deepEqual(stockVariance({ ...original, countedQuantity: "0.0003" }), { deltaQuantity: "0.0000", valueBdt: "0.00" });
  assert.deepEqual(stockVariance({ ...original, countedQuantity: "0.0002" }), { deltaQuantity: "-0.0001", valueBdt: "0.01" });
  for (const countedQuantity of ["-1", "NaN", "Infinity"]) assert.throws(() => stockVariance({ ...original, countedQuantity }));
});
test("stock control contracts reject identity/total forgery and mixed source semantics", () => {
  const base = { kind: "Physical Count", countDate: "2026-10-29", reason: "Physical count investigated", inspection: "Independent physical recount", proofReference: "COUNT-001", lines: [{ batchId: "b", countedQuantity: "8" }] };
  assert.ok(stockControlInput.safeParse(base).success); assert.ok(stockControlRevisionInput.safeParse({ ...base, version: 1 }).success);
  for (const input of [{ ...base, totalBdt: "1" }, { ...base, createdBy: "someone" }, { ...base, lines: [...base.lines, ...base.lines] }, { ...base, lines: [{ batchId: "b", quantity: "1" }] }, { ...base, lines: [{ batchId: "b", countedQuantity: "1e4" }] }, { ...base, lines: [{ batchId: "b", countedQuantity: "-1" }] }]) assert.equal(stockControlInput.safeParse(input).success, false);
  assert.ok(stockControlInput.safeParse({ ...base, kind: "Write-off", lines: [{ batchId: "b", holdId: "h", quantity: "1" }] }).success);
  assert.equal(stockControlInput.safeParse({ ...base, kind: "Write-off", lines: [{ batchId: "b", quantity: "1", unitCostBdt: "999" }] }).success, false);
  assert.ok(stockControlInput.safeParse({ ...base, kind: "Condition Release", lines: [{ batchId: "b" }] }).success);
  assert.equal(stockControlInput.safeParse({ ...base, kind: "Condition Release", lines: [{ batchId: "b", quantity: "1" }] }).success, false);
  assert.equal(stockControlPageInput.safeParse({ page: 0 }).success, false);
  assert.deepEqual(stockControlPageInput.parse({ kind: "Write-off", holdId: "hold-1" }), { search: "", page: 1, kind: "Write-off", holdId: "hold-1" });
  assert.equal(stockControlPageInput.safeParse({ holdId: "" }).success, false);
});

test("stock control presentation groups every review fact without exposing hidden costs", () => {
  const report: PersistentReport = { id: "stock-count-variance", title: "Count", generatedAt: "2026-10-29", from: "2026-10-29", to: "2026-10-29", grouping: "Daily", basis: "Test", page: 1, pageSize: 25, rowCount: 1, totals: { value: "-0.01" }, options: {}, optionsTruncated: false, filters: {}, notes: [], columns: [{ key: "value", label: "Impact", format: "money" }], rows: [{ reference: "STK-001", kind: "Physical Count", status: "Posted", date: "2026-10-29", posted_date: "2026-10-29", product: "Dialyzer", batch: "B1", lot: "L1", original_condition: "Saleable", unit: "pcs", book: "3.0000", counted: "2.0000", variance: "-1.0000", proposed_value: "0.01", value: "-0.01", inspection: "Recounted", reason: "Investigated", proof: "COUNT-1", preparer: "Maker", verifier: "Verifier", approver: "Approver" }] };
  const grouped = reportPresentation(report); assert.equal(grouped.columns.length, 6); assert.equal(grouped.totals.value, "-0.01"); assert.equal(grouped.rows[0].value, "-0.01"); assert.ok(grouped.rows[0].physical_variance.includes("Variance: -1")); assert.ok(grouped.rows[0].inspection_evidence.includes("COUNT-1")); assert.ok(grouped.rows[0].independent_review.includes("Verified: Verifier"));
  const hidden = reportPresentation({ ...report, columns: [], rows: report.rows.map(({ proposed_value: _review, value: _value, ...row }) => { void _review; void _value; return row; }), totals: {} });
  assert.equal(hidden.columns.length, 5); assert.ok(!hidden.rows[0].physical_variance.includes("BDT"));
});
