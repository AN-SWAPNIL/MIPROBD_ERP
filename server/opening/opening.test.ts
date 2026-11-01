import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { zipSync, strToU8 } from "fflate";
import { openingDraftData, type OpeningData, type WorkbookProfile } from "../../src/domains/opening/contracts.js";
import { previewOpening } from "./validation.js";
import { profileWorkbook } from "./workbook.js";
const profile: WorkbookProfile = { sha256: "a".repeat(64), parser: "test", dateSystem: "1900", sheets: [{ name: "Stock", rows: 1, columns: 1, cells: [{ address: "A1", type: "Number", value: 3, format: "" }] }], stockCandidates: [], totals: [], issues: [] };
const valid = (): OpeningData => openingDraftData.parse({ asOfDate: "2026-10-28", proofReference: "APPROVED-COUNT-001", lines: [{ id: "one", kind: "Stock", entityId: "p1", sourceSheet: "Stock", sourceCell: "A1", sourceReference: "PURCHASE-COST-001", quantity: "3", unitCostBdt: "33.3333333333", lot: "L1", batch: "B1", manufacturingDate: "2026-01-01", expiryDate: "2028-01-01", location: "A1", condition: "Saleable" }], exceptionResolutions: [] });
test("opening cost is quantity times approved cost, saved once to poisha; not selling price", () => {
  const result = previewOpening(valid(), profile, "2026-10-28"); assert.equal(result.canApprove, true); assert.equal(result.totals.stockCostBdt, "100.00"); assert.equal(result.totals.stockLines, 1);
  const data = valid(); data.lines[0].unitCostBdt = undefined; assert.equal(previewOpening(data, profile, "2026-10-28").canApprove, false);
  data.lines[0].unitCostBdt = "1.005"; data.lines[0].quantity = "1"; assert.equal(previewOpening(data, profile, "2026-10-28").totals.stockCostBdt, "1.01");
  data.lines[0].quantity = "99999999999.9950"; data.lines[0].unitCostBdt = "1.0000000001";
  assert.equal(previewOpening(data, profile, "2026-10-28").totals.stockCostBdt, "100000000009.99", "Keep 48-digit precision before final poisha rounding");
});
test("opening validation rejects missing provenance, bad dates, forged totals and duplicate positions", () => {
  for (const patch of [{ entityId: "" }, { quantity: "0" }, { unitCostBdt: "0" }, { expiryDate: "2026-01-01" }, { sourceCell: "B1" }, { sourceReference: "" }, { amountBdt: "1" }, { condition: "Expired" as const }]) {
    const data = valid(); Object.assign(data.lines[0], patch); assert.equal(previewOpening(data, profile, "2026-10-28").canApprove, false, JSON.stringify(patch));
  }
  const data = valid(); data.lines.push({ ...data.lines[0], id: "second" }); assert.equal(previewOpening(data, profile, "2026-10-28").canApprove, false);
  data.lines[1].id = "one"; assert.equal(openingDraftData.safeParse(data).success, false);
  assert.equal(previewOpening(valid(), profile, "2026-10-27").canApprove, false);
});
test("opening financial controls are separate and explicit source exceptions block approval", () => {
  const data = valid(); data.lines = ["Customer Due", "Supplier Due", "Supplier Advance", "Cash Bank"].map((kind, index) => ({ ...data.lines[0], id: String(index), sourceReference: `SOURCE-${index}`, kind: kind as OpeningData["lines"][number]["kind"], quantity: undefined, unitCostBdt: undefined, condition: undefined, amountBdt: "12.34", originalDocumentDate: "2026-09-01", dueDate: "2026-10-01" }));
  const result = previewOpening(data, profile, "2026-10-28"); assert.equal(result.canApprove, true); assert.equal(result.totals.stockCostBdt, "0.00"); assert.equal(result.totals.customerDueBdt, "12.34"); assert.equal(result.totals.supplierAdvanceBdt, "12.34");
  const source = { ...profile, issues: [{ code: "CONFLICT", severity: "Blocker" as const, sheet: "Stock", cells: ["A1"], message: "Reconcile scopes" }] };
  assert.equal(previewOpening(data, source, "2026-10-28").canApprove, false);
  data.exceptionResolutions = [{ code: "CONFLICT", explanation: "Draft", proofReference: "" }]; assert.equal(openingDraftData.safeParse(data).success, true); assert.equal(previewOpening(data, source, "2026-10-28").canApprove, false);
  data.exceptionResolutions = [{ code: "CONFLICT", explanation: "Verified different cutover scopes", proofReference: "SIGNED-RECON-001" }]; assert.equal(previewOpening(data, source, "2026-10-28").canApprove, true);
});
test("XLSX profiling preserves formula/cache/date provenance and never evaluates formulas", async () => {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Evidence");
  sheet.getCell("A1").value = 3; sheet.getCell("B1").value = { formula: "A1*2", result: 6 }; sheet.getCell("C1").value = { formula: "A1*3" };
  sheet.getCell("D1").value = new Date("2026-10-28T00:00:00Z"); sheet.mergeCells("A2:B2"); sheet.getCell("A2").value = "Merged source";
  const result = await profileWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()));
  assert.equal(result.sheets[0].cells.find((c) => c.address === "B1")?.formula, "A1*2"); assert.equal(result.sheets[0].cells.find((c) => c.address === "B1")?.cached, 6);
  assert.equal(result.sheets[0].cells.find((c) => c.address === "C1")?.cached, null); assert.equal(result.sheets[0].cells.find((c) => c.address === "D1")?.type, "Date");
  assert.equal(result.sheets[0].cells.filter((c) => c.value === "Merged source").length, 1); assert.equal(result.issues.length, 1);
});
test("opening invoice dates and original FIFO receipt dates are explicit and validated", () => {
  const data = valid(); data.lines[0].receivedDate = "2026-09-01";
  assert.equal(previewOpening(data, profile, "2026-10-28").canApprove, true);
  for (const date of ["2025-12-31", "2026-10-29"]) { data.lines[0].receivedDate = date; assert.equal(previewOpening(data, profile, "2026-10-28").canApprove, false); }
  data.lines = [{ ...valid().lines[0], kind: "Customer Due", quantity: undefined, unitCostBdt: undefined, condition: undefined, amountBdt: "12.34" }];
  assert.equal(previewOpening(data, profile, "2026-10-28").canApprove, false);
  Object.assign(data.lines[0], { originalDocumentDate: "2026-09-01", dueDate: "2026-09-30" });
  assert.equal(previewOpening(data, profile, "2026-10-28").canApprove, true);
  data.lines[0].dueDate = "2026-08-31"; assert.equal(previewOpening(data, profile, "2026-10-28").canApprove, false);
});
test("XLSX reader rejects oversized expansion, external packages and malformed files", async () => {
  for (const bytes of [strToU8("not a workbook"), zipSync({ "xl/workbook.xml": strToU8("x"), "[Content_Types].xml": strToU8("x"), "xl/externalLinks/externalLink1.xml": strToU8("x") }), zipSync({ "huge.xml": new Uint8Array(9 * 1024 * 1024) })]) await assert.rejects(profileWorkbook(bytes));
});
