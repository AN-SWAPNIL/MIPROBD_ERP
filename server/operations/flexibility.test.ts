import test from "node:test";
import assert from "node:assert/strict";
import { paymentPayload, activePaymentFields } from "../../src/domains/imports/paymentPayload.js";
import { commercialInput, decimalInput, updateImportInput, validateCommercial } from "./contracts.js";
import { decimalPreview } from "../../src/lib/decimalInput.js";
import { uploadSchema } from "../foundation/contracts.js";
import { optionInput } from "../../src/domains/masters/contracts.js";
import { validateProductImage } from "../../src/domains/masters/options.js";
import { purchaseInput, purchaseValuation } from "../../src/domains/inventory/purchaseContracts.js";
import { responseIssues, validationMessage } from "../../src/lib/api/validation.js";
import { inspectMasterImage } from "../foundation/product-images.js";
import sharp from "sharp";
import { sumLcAmounts, withLcAmountTotal } from "../../src/domains/imports/lcAmounts.js";

const base = { poNumber: "PO-TEST", poDate: "2026-11-01", currency: "EUR", exchangeRate: "130", rateDate: "2026-11-01", rateSource: "Bank" };
const empty = { lcNumber: "", lcAmount: "", lcBankAmount: "", lcOtherAmount: "", lcOpenDate: "", lcExpiryDate: "", ttReference: "", ttAmount: "", ttDate: "" };
test("invalid numeric inputs never throw during validation or enter live Decimal previews", () => {
  for (const value of ["", "abc", "-1", "1e1000000", "NaN", "Infinity", "1000000000000", "1.1234567"]) {
    assert.equal(decimalInput(6, true).safeParse(value).success, false, value);
    assert.equal(decimalPreview(value, 6), "0", value);
  }
  assert.equal(decimalInput(6, true).safeParse("0").success, false);
  assert.equal(decimalInput(6, true).safeParse("0.000001").success, true);
  assert.throws(() => sumLcAmounts("1e1000000", "1"), /without scientific notation/);
  const invalid = purchaseInput.safeParse({ supplierId: "sup", reference: "INV", receivedDate: "2026-11-01", currency: "BDT", exchangeRate: "1", lines: [{ productId: "prd", quantity: "abc", unitPrice: "1e1000000", lotNumber: "L", batchNumber: "B", manufacturingDate: "2026-01-01", expiryDate: "2027-01-01", location: "A1" }] });
  assert.equal(invalid.success, false);
  if (!invalid.success) assert.ok(invalid.error.issues.some((issue) => issue.path.join(".") === "lines.0.quantity"));
});
for (const mode of ["LC", "TT", "Pending"] as const) test(`${mode}: empty inactive payment controls are omitted and active optional amounts may be blank`, () => {
  const payload = paymentPayload({ ...base, ...empty, paymentMode: mode, ...(mode === "LC" ? { lcNumber: "LC-123" } : mode === "TT" ? { ttReference: "TT-123" } : {}) });
  const saved = validateCommercial(commercialInput.parse(payload));
  assert.equal(saved.paymentMode, mode);
  assert.equal("lcAmount" in payload, false); assert.equal("ttAmount" in payload, false); assert.equal("lcBankAmount" in payload, false); assert.equal("lcOtherAmount" in payload, false);
  if (mode === "LC") { assert.equal(saved.lcNumber, "LC-123"); assert.equal(saved.ttReference, undefined); }
  if (mode === "TT") { assert.equal(saved.ttReference, "TT-123"); assert.equal(saved.lcNumber, undefined); }
  if (mode === "Pending") { assert.equal(saved.lcNumber, undefined); assert.equal(saved.ttReference, undefined); }
});
test("payment mode changes clear obsolete references but unrelated partial edits retain saved values", () => {
  const old = { ...base, paymentMode: "LC", lcNumber: "LC-123", lcAmount: "200", ttReference: "old", ttAmount: "5" };
  const patch = updateImportInput.parse(paymentPayload({ notes: "Follow up" }));
  const retained = activePaymentFields({ ...old, ...patch }); assert.equal(retained.lcAmount, "200"); assert.equal(retained.ttReference, undefined);
  const switched = activePaymentFields({ ...old, ...paymentPayload({ paymentMode: "TT", ttReference: "TT-456", lcNumber: "stale", lcAmount: "" }) });
  assert.equal(switched.lcNumber, undefined); assert.equal(switched.ttReference, "TT-456");
  const pending = activePaymentFields({ ...old, paymentMode: "Pending" }); assert.equal(pending.lcAmount, undefined);
});
test("invalid active amounts and dates identify the actual field", () => {
  assert.throws(() => commercialInput.parse(paymentPayload({ ...base, paymentMode: "LC", lcNumber: "LC-1", lcAmount: "-5" })), (e: unknown) => Boolean(e && typeof e === "object" && "issues" in e && (e.issues as { path: string[] }[]).some((v) => v.path[0] === "lcAmount")));
  assert.throws(() => validateCommercial(commercialInput.parse({ ...base, paymentMode: "TT" })), /TT \/ shipment reference/);
  assert.throws(() => validateCommercial(commercialInput.parse({ ...base, paymentMode: "LC", lcNumber: "LC-1", lcOpenDate: "2026-11-02", lcExpiryDate: "2026-11-01" })), /LC expiry/);
  assert.deepEqual(paymentPayload(null as unknown as { paymentMode?: string }), null);
});
test("uploaded product images are strictly smaller than 1 MB in both client and server", () => {
  for (const size of [1, 999_999]) { validateProductImage({ type: "image/png", size }); assert.equal(uploadSchema.safeParse({ purpose: "product-image", fileName: "product.png", mimeType: "image/png", sizeBytes: size }).success, true); }
  for (const size of [0, 1_000_000, 1_048_576]) { assert.throws(() => validateProductImage({ type: "image/png", size })); assert.equal(uploadSchema.safeParse({ purpose: "product-image", fileName: "product.png", mimeType: "image/png", sizeBytes: size }).success, false); }
  assert.throws(() => validateProductImage({ type: "image/svg+xml", size: 100 }));
  assert.equal(uploadSchema.safeParse({ purpose: "product-image", employeeId: "other", fileName: "a.jpg", mimeType: "image/jpeg", sizeBytes: 100 }).success, false);
});
test("only editable reference lists accept custom options, not roles or workflow states", () => {
  for (const kind of ["unit", "country", "document-type", "import-cost-category"]) assert.equal(optionInput.safeParse({ kind, value: "New option" }).success, true);
  assert.equal(optionInput.safeParse({ kind: "currency", value: "GBP" }).success, true);
  for (const input of [{ kind: "role", value: "Owner" }, { kind: "payment-mode", value: "Other" }, { kind: "currency", value: "US" }]) assert.equal(optionInput.safeParse(input).success, false);
});
test("purchase valuation uses quantity, supplied unit price and currency snapshot with exact BDT rounding", () => {
  assert.deepEqual(purchaseValuation({ quantity: "3", unitPrice: "0.335" }, "BDT", "99"), { totalBdt: "1.01", unitCostBdt: "0.3366666667" });
  assert.equal(purchaseValuation({ quantity: "2.5", unitPrice: "10" }, "GBP", "150.123456").totalBdt, "3753.09");
  assert.equal(purchaseValuation({ quantity: "999999999999", unitPrice: "999999999.99" }, "BDT", "1").totalBdt, "999999999989000000000.01");
  assert.throws(() => purchaseValuation({ quantity: "0.0001", unitPrice: "0.000001" }, "BDT", "1"), /at least/);
});
test("purchase receipt validates per-line batch identity and chronology", () => {
  const line = { productId: "prd-1", quantity: "2", unitPrice: "30", lotNumber: "LOT-1", batchNumber: "BATCH-1", manufacturingDate: "2026-10-01", expiryDate: "2027-01-01", location: "A1" };
  const header = { supplierId: "sup-1", reference: "INV-1", receivedDate: "2026-11-01", currency: "BDT", exchangeRate: "1" };
  assert.equal(purchaseInput.safeParse({ ...header, lines: [line] }).success, true);
  const invalid = purchaseInput.safeParse({ ...header, lines: [line, { ...line, expiryDate: "2026-01-01" }] });
  assert.equal(invalid.success, false); if (!invalid.success) { assert.ok(invalid.error.issues.some((i) => i.path.join(".") === "lines.1.expiryDate")); assert.ok(invalid.error.issues.some((i) => i.path.join(".") === "lines.1.batchNumber")); }
});
test("API validation details survive serialization and identify nested input rows", () => {
  const issues = responseIssues([{ field: "lines.1.quantity", message: "Must be positive" }, null, { secret: "not a field" }]);
  assert.equal(issues.length, 1); assert.equal(validationMessage("Invalid request", issues), "Lines 2 / quantity: Must be positive");
});
test("master image uploads decode actual bytes instead of trusting an extension or signature", async () => {
  const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#008ca8" } }).png().toBuffer();
  const result = await inspectMasterImage(bytes, "image/png"); assert.equal(result.width, 32); assert.match(result.sha256, /^[a-f0-9]{64}$/);
  await assert.rejects(inspectMasterImage(bytes, "image/jpeg"), /valid/);
  await assert.rejects(inspectMasterImage(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"), /valid/);
});
test("LC bank and other amounts add exactly in one currency; submitted totals are not authoritative", () => {
  assert.equal(sumLcAmounts("0.10", "0.20"), "0.30");
  assert.equal(sumLcAmounts("999999999998.91", "0.08"), "999999999998.99");
  const record = validateCommercial(commercialInput.parse({ ...base, paymentMode: "LC", lcNumber: "LC-1", lcBankAmount: "800.10", lcOtherAmount: "200.20", lcAmount: "0.01" }));
  assert.equal(record.lcAmount, "1000.30"); assert.equal(record.lcBankAmount, "800.10"); assert.equal(record.lcOtherAmount, "200.20");
  assert.equal(withLcAmountTotal({ paymentMode: "LC", lcBankAmount: "75" }).lcAmount, "75.00");
  const legacy = { paymentMode: "LC", lcAmount: "1000.30" }; assert.deepEqual(withLcAmountTotal(legacy), legacy);
});
test("LC split validates each field, bounds the total and is omitted when changing to TT or Pending", () => {
  for (const key of ["lcBankAmount", "lcOtherAmount"]) {
    const invalid = commercialInput.safeParse({ ...base, paymentMode: "LC", lcNumber: "LC-1", [key]: "-1" }); assert.equal(invalid.success, false);
    if (!invalid.success) assert.ok(invalid.error.issues.some((i) => i.path.join(".") === key));
  }
  assert.throws(() => validateCommercial(commercialInput.parse({ ...base, paymentMode: "LC", lcNumber: "LC-1", lcBankAmount: "999999999999", lcOtherAmount: "1" })), /Bank amount plus other amount/);
  for (const paymentMode of ["TT", "Pending"]) {
    const result = activePaymentFields(paymentPayload({ paymentMode, lcBankAmount: "900.10", lcOtherAmount: "99.90", lcAmount: "1000.00", ttReference: "TT-1" }));
    assert.equal(result.lcBankAmount, undefined); assert.equal(result.lcOtherAmount, undefined); assert.equal(result.lcAmount, undefined);
  }
});
