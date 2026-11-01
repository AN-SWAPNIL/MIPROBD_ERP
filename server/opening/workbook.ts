import ExcelJS from "./excel-reader.js";
import type { Cell, Row } from "exceljs";
import { unzipSync, zipSync } from "fflate";
import { createHash } from "node:crypto";
import { Decimal } from "decimal.js";
import type { SourceCell, WorkbookProfile } from "../../src/domains/opening/contracts.js";
import { HttpError } from "../foundation/errors.js";

export const maximumWorkbookBytes = 8 * 1024 * 1024;
export const openingMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const scalar = (value: unknown): SourceCell["value"] => value === undefined || value === null ? null : value instanceof Date ? value.toISOString() : typeof value === "number" || typeof value === "boolean" ? value : typeof value === "string" ? value.slice(0, 4000) : JSON.stringify(value).slice(0, 4000);
export async function profileWorkbook(bytes: Uint8Array, reader = ExcelJS): Promise<WorkbookProfile> {
  if (bytes.length > maximumWorkbookBytes || bytes[0] !== 80 || bytes[1] !== 75) throw new HttpError(422, "Use an XLSX workbook of at most 8 MB.");
  const names = new Set<string>(); let expanded = 0;
  let files: ReturnType<typeof unzipSync>;
  try {
    files = unzipSync(bytes, { filter(entry) {
      expanded += entry.originalSize;
      if (names.has(entry.name) || names.size >= 300 || expanded > 32 * 1024 * 1024 || entry.originalSize > 8 * 1024 * 1024 || !/^[A-Za-z0-9_[\] .\-/]+$/.test(entry.name) || entry.name.split("/").includes("..") || /vbaProject|externalLinks|embeddings/i.test(entry.name)) throw new Error("Unsupported archive");
      names.add(entry.name); return true;
    } });
    if (!files["xl/workbook.xml"] || !files["[Content_Types].xml"]) throw new Error("Not an XLSX workbook");
  } catch { throw new HttpError(422, "Workbook is malformed, too large when expanded, or contains unsupported embedded/external content."); }
  const workbook = new reader.Workbook();
  try {
    // Rebuild from bounded extraction so the XML reader cannot trust conflicting ZIP local headers.
    // ExcelJS's legacy Buffer declaration differs from current Node typings; the runtime takes a Node Buffer.
    await workbook.xlsx.load(Buffer.from(zipSync(files, { level: 0 })) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch { throw new HttpError(422, "Workbook could not be read. Save a standard XLSX copy with cached formula results."); }
  if (workbook.worksheets.length > 20) throw new HttpError(422, "At most 20 worksheets are supported.");
  const profile: WorkbookProfile = { sha256: createHash("sha256").update(bytes).digest("hex"), parser: "exceljs@4.4.0/mipro-profile-v1", dateSystem: workbook.properties.date1904 ? "1904" : "1900", sheets: [], stockCandidates: [], totals: [], issues: [] };
  let count = 0;
  for (const sheet of workbook.worksheets) {
    const cells: SourceCell[] = []; let lastRow = 0; let lastCol = 0;
    sheet.eachRow((row) => row.eachCell((cell) => {
      if (cell.master.address !== cell.address) return;
      if (++count > 30000 || Number(cell.row) > 5000 || Number(cell.col) > 100) throw new HttpError(422, "Workbook exceeds 30,000 populated cells, 5,000 rows or 100 columns.");
      lastRow = Math.max(lastRow, Number(cell.row)); lastCol = Math.max(lastCol, Number(cell.col));
      const value = cell.value; const record: SourceCell = { address: cell.address, type: value instanceof Date ? "Date" : reader.ValueType[cell.type], value: scalar(value), format: cell.numFmt ?? "" };
      if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value)) {
        record.formula = "formula" in value ? value.formula : undefined; record.sharedFormula = "sharedFormula" in value ? value.sharedFormula : undefined;
        record.cached = scalar(value.result); record.value = null;
        if (record.cached === null) profile.issues.push({ code: `CACHE:${sheet.name}:${cell.address}`, severity: "Warning", sheet: sheet.name, cells: [cell.address], message: "Formula has no cached result. No formula is recalculated by this parser." });
      }
      cells.push(record);
    }));
    profile.sheets.push({ name: sheet.name, rows: lastRow, columns: lastCol, cells });
  }
  const stock = workbook.getWorksheet("Stock List");
  if (stock) stock.eachRow((row, n) => {
    if (!/model\s*no/i.test(row.getCell("B").text)) return;
    const product = stock.getRow(n + 1); const opening = stock.getRow(n + 3); const quantity = opening.getCell("H").value;
    const candidate = { sheet: stock.name, cell: `H${n + 3}`, model: product.getCell("B").text, productLabel: product.getCell("C").text,
      lot: product.getCell("E").text, manufacturing: product.getCell("F").text, expiry: product.getCell("G").text,
      quantity: typeof quantity === "number" && Number.isFinite(quantity) ? String(quantity) : undefined };
    profile.stockCandidates.push(candidate);
    if (candidate.quantity === undefined) profile.issues.push({ code: `QTY:${candidate.cell}`, severity: "Blocker", sheet: stock.name, cells: [candidate.cell], message: "Opening stock quantity is missing or is not a numeric literal." });
  });
  if (profile.stockCandidates.length) {
    profile.issues.push({ code: "STOCK_COST_MISSING", severity: "Blocker", sheet: "Stock List", cells: [], message: "The stock source does not establish approved purchase/landed costs. Sales rates must not be used as book cost." });
    const seen = new Map<string, string>();
    for (const row of profile.stockCandidates) { const key = `${row.model.trim().toLowerCase()}:${row.lot.trim()}`; const previous = seen.get(key);
      if (previous) profile.issues.push({ code: `DUPLICATE:${row.cell}`, severity: "Blocker", sheet: "Stock List", cells: [previous, row.cell], message: "Repeated model/lot candidate: determine whether it is a duplicate or a distinct stock condition/source." });
      seen.set(key, row.cell);
    }
  }
  const numeric = (cell: Cell) => { const value = cell.value; const scalar = value && typeof value === "object" && "result" in value ? value.result : value; return typeof scalar === "number" && Number.isFinite(scalar) ? new Decimal(scalar).toFixed(2) : undefined; };
  const ledger = workbook.getWorksheet("Monthly Ledger"); let month = "Unknown month"; const columns = { sales: "", paid: "", due: "" };
  if (ledger) ledger.eachRow((row) => {
    row.eachCell((cell) => { if (cell.master.address !== cell.address) return; const text = cell.text.trim(); const col = cell.address.replace(/\d+$/, "");
      if (/^month:/i.test(text)) month = text.replace(/^month:\s*/i, "");
      if (/^total amount$/i.test(text)) columns.sales = col;
      if (/^paid amount$/i.test(text)) columns.paid = col;
      if (/^dues? amount$/i.test(text)) columns.due = col;
    });
    if (!Array.isArray(row.values) || !row.values.some((v) => typeof v === "string" && /^total$/i.test(v.trim())) || !columns.sales) return;
    const sales = numeric(row.getCell(columns.sales)); const paid = numeric(row.getCell(columns.paid)); const due = numeric(row.getCell(columns.due));
    const cells = [columns.sales, columns.paid, columns.due].filter(Boolean).map((col) => `${col}${row.number}`);
    const difference = sales !== undefined && paid !== undefined && due !== undefined ? new Decimal(sales).minus(paid).minus(due).toFixed(2) : undefined;
    profile.totals.push({ sheet: ledger.name, label: month, cells, sales, paid, due, difference });
    if (difference === undefined || difference !== "0.00") profile.issues.push({ code: `TOTAL:${ledger.name}:${row.number}`, severity: "Blocker", sheet: ledger.name, cells, message: "Reported sales do not reconcile to paid plus due, or a required total is missing." });
  });
  for (const [name, salesCol, paidCol, dueCol] of [["All Party Account", "D", "E", "F"], ["Due Lists", "", "", "D"]]) {
    const sheet = workbook.getWorksheet(name); if (!sheet) continue;
    sheet.eachRow((row) => { if (!Array.isArray(row.values) || !row.values.some((v) => typeof v === "string" && /^total$/i.test(v.trim()))) return;
      profile.totals.push({ sheet: name, label: "Source total", cells: [salesCol, paidCol, dueCol].filter(Boolean).map((c) => `${c}${row.number}`), sales: salesCol ? numeric(row.getCell(salesCol)) : undefined, paid: paidCol ? numeric(row.getCell(paidCol)) : undefined, due: numeric(row.getCell(dueCol)) });
    });
  }
  const party = workbook.getWorksheet("All Party Account");
  if (party && !profile.totals.some((t) => t.sheet === party.name)) {
    let totalRow: Row | undefined;
    party.eachRow((row) => { if (!row.getCell("C").value && numeric(row.getCell("D")) !== undefined && numeric(row.getCell("E")) !== undefined && numeric(row.getCell("F")) !== undefined) totalRow = row; });
    if (totalRow) profile.totals.push({ sheet: party.name, label: "Final D:F total candidate", cells: ["D", "E", "F"].map((col) => `${col}${totalRow!.number}`), sales: numeric(totalRow.getCell("D")), paid: numeric(totalRow.getCell("E")), due: numeric(totalRow.getCell("F")) });
  }
  const accountDue = profile.totals.find((t) => t.sheet === "All Party Account")?.due; const listDue = profile.totals.find((t) => t.sheet === "Due Lists")?.due;
  for (const total of profile.totals.filter((row) => row.sheet === "All Party Account")) if (total.sales !== undefined && total.paid !== undefined && total.due !== undefined) {
    total.difference = new Decimal(total.sales).minus(total.paid).minus(total.due).toFixed(2);
    if (total.difference !== "0.00") profile.issues.push({ code: "PARTY_TOTAL_MISMATCH", severity: "Blocker", sheet: total.sheet, cells: total.cells, message: "Party-account sales do not equal paid plus due; verify source formulas and payment allocation." });
  }
  if (accountDue !== undefined && listDue !== undefined && accountDue !== listDue) profile.issues.push({ code: "DUE_SCOPE_CONFLICT", severity: "Blocker", sheet: "All Party Account / Due Lists", cells: [], message: `Source due totals differ (${accountDue} versus ${listDue}). Record the authoritative cutover scope and proof; never insert a balancing entry.` });
  return profile;
}
