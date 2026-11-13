import assert from "node:assert/strict";
import test from "node:test";
import type { ImportCase } from "../erp.types.js";
import { importConfirmationSource, importStepActions, importSteps, importWorkflow } from "./workflow.js";

function record(overrides: Partial<ImportCase> = {}): ImportCase {
  return { id: "imp", draftReference: "IMP-1", primaryReference: "LC-1", supplierId: "supplier", supplierName: "Supplier", poNumber: "PO-1", poDate: "2026-11-01", piNumber: "PI-1", piDate: "2026-11-02", paymentMode: "LC", lcNumber: "LC-1", currency: "USD", exchangeRate: "120", rateDate: "2026-11-02", rateSource: "Bank", status: "Draft", milestone: "Draft", costingStatus: "Not Started", warehouseStatus: "Not Ready", items: [{ id: "i", productId: "p", productCode: "P", productName: "Product", quantity: "10", unit: "pcs", currency: "USD", fobUnitForeign: "2", exchangeRate: "120", fobTotalBdt: "2400", cbmPerCarton: "1", cartonCount: "1", totalCbm: "1" }], costs: [], documents: [], createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", ...overrides };
}
test("all ten tabs have a real action and guided confirmations advance the current required step", () => {
  assert.equal(importSteps.length, 10); assert.equal(importStepActions.length, 10);
  for (let count = 0; count < 3; count++) {
    const flow = importWorkflow(record({ confirmedSteps: Array.from({ length: count }, (_, i) => i), status: "LC/TT Opened" }));
    assert.equal(flow.currentStep, count);
    assert.equal(flow.steps[count].reasons.length, 0);
    assert.ok(flow.steps[count + 1].reasons.includes("Complete the earlier import steps first."));
  }
  assert.equal(importWorkflow(record({ status: "LC/TT Opened", confirmedSteps: [0, 1, 2] })).currentStep, 3);
});
test("legacy shipment statuses preserve progress and point to the next input tab", () => {
  for (const [status, expected] of [["In Production", 4], ["Shipped", 5], ["At Port", 6], ["Costing", 7], ["Cost Finalized", 8], ["Partially Received", 8], ["Received", 9]] as const) assert.equal(importWorkflow(record({ status })).currentStep, expected);
});
test("completion validation uses actual prerequisites, allows optional documents and zero additional costs", () => {
  assert.ok(importWorkflow(record({ piDate: "" })).steps[1].reasons.length);
  assert.ok(importWorkflow(record({ status: "PI Received", paymentMode: "Pending" })).steps[2].reasons.length);
  assert.ok(importWorkflow(record({ status: "In Production" })).steps[4].reasons.some(s => s.includes("bill of lading")));
  assert.equal(importWorkflow(record({ status: "Shipped", documents: [] })).steps[5].reasons.length, 0);
  assert.equal(importWorkflow(record({ status: "At Port", costs: [] })).steps[6].reasons.length, 0);
  assert.ok(importWorkflow(record({ status: "At Port" }), false).steps[6].reasons.length);
  assert.ok(importWorkflow(record({ status: "Costing", items: [] })).steps[7].reasons.length);
  assert.ok(importWorkflow(record({ status: "Cost Finalized" })).steps[9].reasons.length);
  assert.equal(importWorkflow(record({ status: "Cost Finalized", costingStatus: "Finalized", snapshot: undefined }), false).steps[8].reasons.length, 0, "Warehouse receiving must not require a private cost snapshot in the browser");
});
test("confirmations bind the saved PO, PI and payment facts; later edits invalidate dependent confirmations", () => {
  const before = record(), changed = record({ poNumber: "PO-2" });
  for (const step of [0, 1, 2]) assert.notEqual(importConfirmationSource(before, step), importConfirmationSource(changed, step));
  const priced = record({ items: [{ ...before.items[0], fobUnitForeign: "3" }] });
  assert.equal(importConfirmationSource(before, 0), importConfirmationSource(priced, 0));
  assert.notEqual(importConfirmationSource(before, 1), importConfirmationSource(priced, 1));
  assert.notEqual(importConfirmationSource(before, 2), importConfirmationSource(priced, 2));
  for (const status of ["Closed", "Cancelled"] as const) assert.ok(importWorkflow(record({ status })).steps.every(s => s.reasons.includes("This case is read-only.")));
});
test("reopening a closed case returns only closure to pending, not costing or receiving", () => {
  const closed = record({ status: "Closed", costingStatus: "Finalized", warehouseStatus: "Received", confirmedSteps: [0, 1, 2] });
  const reopened = { ...closed, status: "Received" as const, milestone: "Received" as const };
  assert.ok(importWorkflow(closed).steps.every(step => step.completed));
  const flow = importWorkflow(reopened);
  assert.equal(flow.currentStep, 9); assert.ok(flow.steps.slice(0, 9).every(step => step.completed));
  assert.equal(flow.steps[9].completed, false); assert.deepEqual(flow.steps[9].reasons, []);
  assert.equal(reopened.costingStatus, "Finalized"); assert.equal(reopened.warehouseStatus, "Received");
});
