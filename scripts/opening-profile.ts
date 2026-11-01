import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { profileWorkbook } from "../server/opening/workbook.js";

async function main() {
  const path = process.argv[2]; if (!path?.toLowerCase().endsWith(".xlsx")) throw new Error("Supply a local XLSX path. This command only profiles; it never posts or modifies it.");
  const bytes = await readFile(path); const profile = await profileWorkbook(bytes);
  const folder = new URL("../artifacts/opening/", import.meta.url); await mkdir(folder, { recursive: true });
  await writeFile(new URL(`${profile.sha256}-${Date.now()}.json`, folder), JSON.stringify(profile, null, 2), { flag: "wx", mode: 0o600 });
  if (createHash("sha256").update(await readFile(path)).digest("hex") !== profile.sha256) throw new Error("Source changed during profiling; discard this review.");
  console.log(JSON.stringify({ sha256: profile.sha256, parser: profile.parser, sheets: profile.sheets.map((s) => ({ name: s.name, populatedRows: s.rows, cells: s.cells.length })), stockCandidates: profile.stockCandidates.length, missingQuantities: profile.stockCandidates.filter((c) => c.quantity === undefined).length, totals: profile.totals, blockers: profile.issues.filter((i) => i.severity === "Blocker").map((i) => i.code), privateProfile: "artifacts/opening (not committed)", posted: false }, null, 2));
}
main().catch(() => { console.error("Read-only workbook profiling failed; check format/size/path. No source or ERP records were changed."); process.exitCode = 1; });
