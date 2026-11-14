import { Decimal } from "decimal.js";
import type { ImportCase } from "../erp.types.js";
import { calculateLandedCost } from "./costing.js";

export const importSteps = ["PO / Draft", "PI & Products", "LC / TT", "Production", "Shipment", "Documents", "Costs & Allocation", "Landed Cost", "Receiving", "Activity & Closure"] as const;
export const importStepActions = ["Mark PO Complete", "Mark PI Received", "Mark LC / TT Opened", "Mark In Production", "Mark Shipped", "Mark At Port", "Mark Costing", "Mark Cost Finalized", "Receive to Warehouse", "Close Case"] as const;
const through: Record<ImportCase["status"], number> = { Draft: -1, "PI Received": 0, "LC/TT Opened": 1, "In Production": 3, Shipped: 4, "At Port": 5, Costing: 6, "Cost Finalized": 7, "Partially Received": 7, Received: 8, Closed: 9, Cancelled: -1 };
const positive = (value: string) => { try { const n = new Decimal(value); return n.isFinite() && n.gt(0); } catch { return false; } };
export const confirmationEpoch = (events: { action: string; details: Record<string, unknown> }[], step: number) => events.filter(e => e.action === "Import stage retracted" && typeof e.details.step === "number" && e.details.step <= step).length;
export const retractedImportStatus = (step: number): ImportCase["status"] => (["Draft", "Draft", "PI Received", "LC/TT Opened", "In Production", "Shipped", "At Port", "Costing"] as const)[step];

type StageEvent = { action: string; details: Record<string, unknown> };
export const importReviewEpoch = (events: StageEvent[], step: number) => confirmationEpoch(events.filter(e => e.details.reviewOnly === true), step);
export function pendingImportReviews(events: StageEvent[]) {
  return [3, 4, 5, 6].filter(step => {
    const epoch = importReviewEpoch(events, step);
    return epoch > 0 && !events.some(e => e.action === "Import stage confirmed" && e.details.step === step && e.details.reviewEpoch === epoch);
  });
}

export function importConfirmationSource(record: ImportCase, step: number): string {
  if (step === 0) return JSON.stringify([record.supplierId, record.poNumber, record.poDate]);
  if (step === 1) return JSON.stringify([importConfirmationSource(record, 0), record.piNumber, record.piDate, record.items.map(i => [i.id, i.productId, i.quantity, i.currency, i.fobUnitForeign, i.exchangeRate, i.totalCbm]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))]);
  return JSON.stringify([importConfirmationSource(record, 1), record.paymentMode, record.paymentMode === "LC" ? record.lcNumber : record.ttReference]);
}

export function importWorkflow(record: ImportCase, canSeeCost = true) {
  const completed = importSteps.map((_, index) => !record.pendingReviewSteps?.includes(index) && (index < 3 && record.confirmedSteps !== undefined ? record.confirmedSteps.includes(index) : index <= through[record.status]));
  const missing: string[][] = importSteps.map(() => []);
  if (!record.supplierId || !record.poNumber.trim() || !record.poDate) missing[0].push("Save the supplier, PO number and PO date.");
  if (!record.piNumber?.trim() || !record.piDate) missing[1].push("Enter the PI number and PI date.");
  if (!record.items.length || record.items.some(i => !positive(i.quantity))) missing[1].push("Add at least one product with a positive quantity.");
  if (record.paymentMode === "Pending" || !(record.paymentMode === "LC" ? record.lcNumber?.trim() : record.ttReference?.trim())) missing[2].push("Select LC or TT and save its reference.");
  if (!record.blNumber?.trim() || !record.etd) missing[4].push("Enter the bill of lading and departure date in Shipment.");
  if (!canSeeCost) missing[6].push("An authorized cost reviewer must complete costing.");
  else {
    if (!record.items.length || record.items.some(i => !positive(i.quantity) || !positive(i.fobUnitForeign) || !positive(i.exchangeRate))) missing[6].push("Complete positive product quantities, FOB prices and exchange rates in PI & Products.");
    else missing[6].push(...calculateLandedCost(record.id, record.items, record.costs).validationErrors);
  }
  missing[7] = [...missing[6]];
  if (record.costingStatus !== "Finalized") missing[8].push("Finalize the landed-cost snapshot first.");
  if (record.status !== "Received" && record.status !== "Closed") missing[9].push("Receive or reject all outstanding quantities before closing.");
  if (completed.slice(0, 7).some(done => !done)) missing[9].push("Complete all outstanding import reviews before closing.");
  const current = completed.findIndex(done => !done);
  return { currentStep: current < 0 ? 9 : current, steps: importSteps.map((label, index) => ({ label, completed: completed[index], reasons: [
    ...(!completed[index] && completed.slice(0, index).some(done => !done) ? ["Complete the earlier import steps first."] : []),
    ...missing[index], ...(["Closed", "Cancelled"].includes(record.status) ? ["This case is read-only."] : [])
  ] })) };
}
