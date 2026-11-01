import { D as Decimal } from "../trading/money.js";
import { openingDraftData, type OpeningData, type OpeningPreview, type WorkbookProfile } from "../../src/domains/opening/contracts.js";

export function previewOpening(input: OpeningData, profile: WorkbookProfile, today: string): OpeningPreview {
  const data = openingDraftData.parse(input);
  const result: OpeningPreview = { validationVersion: 1, canApprove: false, blockers: [], totals: { stockLines: 0, stockCostBdt: "0.00", customerDueBdt: "0.00", supplierDueBdt: "0.00", supplierAdvanceBdt: "0.00", cashBankBdt: "0.00" }, lines: [] };
  const block = (message: string, lineId?: string) => result.blockers.push({ lineId, message });
  if (data.asOfDate > today) block("The opening date cannot be in the future.");
  if (!data.proofReference.trim()) block("An authoritative opening proof reference is required.");
  const resolved = new Set(data.exceptionResolutions.filter((row) => row.explanation.trim().length >= 10 && row.proofReference.trim()).map((row) => row.code));
  for (const issue of profile.issues) if (issue.severity === "Blocker" && !resolved.has(issue.code)) block(`Resolve source exception ${issue.code}: ${issue.message}`);
  for (const code of resolved) if (!profile.issues.some((row) => row.code === code)) block(`Unknown source exception ${code}.`);
  const duplicates = new Set<string>();
  for (const line of data.lines) {
    const key = line.kind === "Stock" ? `${line.kind}:${line.batch.trim().toLowerCase()}` : line.kind === "Cash Bank" ? `${line.kind}:${line.entityId}` : `${line.kind.startsWith("Supplier") ? "Supplier" : line.kind}:${line.entityId}:${line.sourceReference.trim().toLowerCase()}`;
    if (duplicates.has(key)) block("Duplicate source position; combine it or establish distinct invoice/batch provenance.", line.id); duplicates.add(key);
    if (!line.entityId) block("Select the exact ERP product, customer, supplier or cash/bank account.", line.id);
    const source = profile.sheets.find((row) => row.name === line.sourceSheet);
    if (!source?.cells.some((cell) => cell.address === line.sourceCell)) block("Source cell must exist in this immutable workbook.", line.id);
    if (!line.sourceReference.trim()) block("A proof/invoice/source reference is required.", line.id);
    if (line.kind === "Stock") {
      result.totals.stockLines++;
      if (!line.quantity || new Decimal(line.quantity).lte(0)) block("Stock quantity must be greater than zero.", line.id);
      if (!line.unitCostBdt || new Decimal(line.unitCostBdt).lte(0)) block("Approved unit cost is required; sales price is not inventory cost.", line.id);
      if (!line.condition || !line.lot.trim() || !line.batch.trim() || !line.location.trim()) block("Stock needs condition, lot, batch and warehouse location.", line.id);
      if (!line.manufacturingDate || !line.expiryDate || line.expiryDate <= line.manufacturingDate || line.manufacturingDate > data.asOfDate) block("Manufacturing and expiry dates must be valid for the count date.", line.id);
      if (line.expiryDate && line.expiryDate < data.asOfDate && line.condition !== "Expired") block("Expired stock cannot be marked saleable, damaged or quarantine.", line.id);
      if (line.condition === "Expired" && line.expiryDate >= data.asOfDate) block("Expired condition conflicts with the opening count date.", line.id);
      if (line.amountBdt !== undefined) block("Stock value is calculated from quantity and approved unit cost; do not submit an override total.", line.id);
      if (line.receivedDate && (line.receivedDate > data.asOfDate || line.receivedDate < line.manufacturingDate)) block("Original receipt date must fall between manufacturing and the opening count date.", line.id);
      const costValueBdt = new Decimal(line.quantity ?? "0").mul(line.unitCostBdt ?? "0").toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
      if (new Decimal(costValueBdt).gt("999999999999.99")) block("Stock value exceeds supported financial precision.", line.id);
      result.lines.push({ id: line.id, kind: line.kind, costValueBdt }); result.totals.stockCostBdt = new Decimal(result.totals.stockCostBdt).plus(costValueBdt).toFixed(2);
    } else {
      if (!line.amountBdt || new Decimal(line.amountBdt).lte(0)) block("Opening financial amount must be greater than zero.", line.id);
      if (line.kind === "Customer Due" && (!line.originalDocumentDate || !line.dueDate || line.originalDocumentDate > data.asOfDate || line.dueDate < line.originalDocumentDate)) block("Customer dues require the original invoice date and a due date on or after it.", line.id);
      if (line.quantity !== undefined || line.unitCostBdt !== undefined || line.condition !== undefined) block("Financial positions cannot carry stock quantities, costs or conditions.", line.id);
      const total = line.kind === "Customer Due" ? "customerDueBdt" : line.kind === "Supplier Due" ? "supplierDueBdt" : line.kind === "Supplier Advance" ? "supplierAdvanceBdt" : "cashBankBdt";
      const amountBdt = new Decimal(line.amountBdt ?? "0").toFixed(2); result.totals[total] = new Decimal(result.totals[total]).plus(amountBdt).toFixed(2);
      result.lines.push({ id: line.id, kind: line.kind, amountBdt });
    }
  }
  result.canApprove = result.blockers.length === 0; return result;
}
