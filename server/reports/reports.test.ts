import assert from "node:assert/strict";
import test from "node:test";
import { csvCell, queryInput } from "./common.js";
import { reportDisplay } from "../../src/domains/reports/reportDisplay.js";
import { periodFor } from "../../src/domains/reports/reportPeriod.js";
import { expiryStatusAt } from "../../src/domains/inventory/expiry.js";

test("report dates/filters are strict and bounded", () => {
  assert.equal(queryInput.safeParse({ from: "2026-01-01", to: "2026-02-01" }).success, true);
  for (const change of [{ from: "2026-02-30" }, { from: "2026-03-01" }, { to: "2099-01-01" }, { page: 0 }, { pageSize: 10001 }, { unknown: "1" }, { customer: ["a", "b"] }, { from: "2000-01-01" }]) assert.equal(queryInput.safeParse({ from: "2026-01-01", to: "2026-02-01", ...change }).success, false);
});

test("CSV escapes delimiters and guards text formulas without corrupting signed amounts", () => {
  assert.equal(csvCell('One,"two"\nthree'), '"One,""two""\nthree"');
  for (const value of ["=1+1", "+SUM(A1)", " @x", "-2+3", "\tcmd", "\rtest", "＝1+1"]) assert.ok(csvCell(value).startsWith('"\t'));
  assert.equal(csvCell("-0.01", "money"), '"-0.01"');
  assert.equal(csvCell("-2+3", "money"), '"\t-2+3"');
});

test("report display keeps decimal precision and explicit column semantics", () => {
  assert.equal(reportDisplay("9007199254740993.01", "money").replaceAll(",", ""), "BDT 9007199254740993.01");
  assert.equal(reportDisplay("0.3000", "quantity"), "0.3");
  assert.equal(reportDisplay("-1", "integer"), "-1");
  assert.equal(reportDisplay("=untrusted", "text"), "=untrusted");
});

test("report calendar uses Monday weeks and real leap-month boundaries", () => {
  assert.deepEqual(periodFor("last-week", "2026-10-24"), { from: "2026-10-12", to: "2026-10-18" });
  assert.deepEqual(periodFor("last-month", "2024-03-03"), { from: "2024-02-01", to: "2024-02-29" });
});

test("reports and Inventory share expiry alert boundaries", () => {
  const asOf = "2026-01-01";
  for (const [days, status] of [[-1,"Expired"], [0,"1 Month Alert"], [31,"1 Month Alert"], [32,"3 Month Alert"], [92,"3 Month Alert"], [93,"6 Month Alert"], [183,"6 Month Alert"], [184,"Normal"]] as const) {
    const expiry = new Date(`${asOf}T00:00:00Z`); expiry.setUTCDate(expiry.getUTCDate()+days);
    assert.equal(expiryStatusAt(expiry.toISOString().slice(0,10), asOf), status);
  }
});
