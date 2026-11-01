import test from "node:test";
import assert from "node:assert/strict";
import { formatMoney, formatQuantity } from "./precise.js";

test("cost screens retain poisha and fractional quantities without Number precision loss", () => {
  assert.equal(formatMoney("1911.23"), "BDT 1,911.23");
  assert.equal(formatMoney("200.78"), "BDT 200.78");
  assert.equal(formatMoney("-0.01"), "BDT -0.01");
  assert.equal(formatQuantity("0.1234"), "0.1234");
  assert.equal(formatQuantity("12.0000"), "12");
  assert.equal(formatMoney("12345678901234567890.12").replaceAll(",", ""), "BDT 12345678901234567890.12");
});
