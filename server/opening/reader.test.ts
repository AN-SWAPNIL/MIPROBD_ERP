import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import { profileWorkbook } from "./workbook.js";

test("buffer-only workbook reader preserves formulas, rich text, dates, merges and 1904 source cells", async () => {
  for (const date1904 of [false, true]) {
    const workbook = new ExcelJS.Workbook(); workbook.properties.date1904 = date1904;
    const sheet = workbook.addWorksheet("Source");
    sheet.getCell("A1").value = "Literal"; sheet.getCell("B1").value = 12.34;
    sheet.getCell("A2").value = new Date("2026-11-01T00:00:00.000Z"); sheet.getCell("A2").numFmt = "yyyy-mm-dd";
    sheet.getCell("B2").value = { formula: "B1*2", result: 24.68 };
    sheet.getCell("B3").value = { sharedFormula: "B2", result: 24.68 };
    sheet.getCell("A4").value = { richText: [{ text: "Source" }, { text: " evidence", font: { bold: true } }] };
    sheet.getCell("A5").value = true; sheet.mergeCells("A6:B6"); sheet.getCell("A6").value = "Merged";
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    assert.deepEqual(await profileWorkbook(bytes), await profileWorkbook(bytes, ExcelJS));
  }
});
test("production XLSX reader does not load filesystem archive/glob modules", () => {
  const result = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import {createRequire} from 'node:module';
    await import('./server/opening/excel-reader.ts');
    const require=createRequire(import.meta.url);
    const blocked=new Set(['archiver','archiver-utils','glob','minimatch','fstream','unzipper']);
    const unsafe=Object.keys(require.cache).filter(path=>{const parts=path.split(String.fromCharCode(92)).join('/').split('/');return parts.some((part,index)=>part==='node_modules'&&blocked.has(parts[index+1]));});
    if(unsafe.length)process.exit(1);
    console.log('BUFFERED_READER_ISOLATED');
  `], { encoding: "utf8", timeout: 30000 });
  assert.match(result, /BUFFERED_READER_ISOLATED/);
});
