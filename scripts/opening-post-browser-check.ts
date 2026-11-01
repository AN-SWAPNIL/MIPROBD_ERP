import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium, expect as baseExpect } from "@playwright/test";
import ExcelJS from "exceljs";
import { hostedHarness } from "../server/testing/hosted.js";
const expect = baseExpect.configure({ timeout: 30000 });

async function main() {
  process.env.APP_URL = "http://localhost:5196"; process.env.VITE_BACKEND_MODE = "foundation"; process.env.VITE_DEMO_MODE = "false";
  const h = await hostedHarness("open-browser");
  const web = await createServer({ cacheDir: "node_modules/.vite-opening-post-test", server: { port: 5196, host: "localhost", strictPort: true, proxy: { "/api": { target: new URL(h.bases[0]).origin, changeOrigin: true, localAddress: h.peer } } } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    await web.listen(); await mkdir("artifacts/backend/opening-post", { recursive: true });
    const admin = await h.employee("Super Admin", ["view_sensitive_cost"]); const approver = await h.employee("Super Admin", ["view_sensitive_cost"]);
    for (const width of [1440, 390]) {
      const product = await h.expect("/products", admin.token, { code: `DEV-OPEN-${width}-${h.suffix}`, name: `DEV TEST Opening ${width} ${h.suffix}`, family: "Dialyzer", variant: "Opening", unit: "pcs" }, 201);
      const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Opening"); sheet.getCell("A1").value = `DEV TEST ${width} ${h.suffix}`; sheet.getCell("B7").value = 3;
      const bytes = Buffer.from(await book.xlsx.writeBuffer()); const reserved = await h.expect("/opening/sources/upload", admin.token, { fileName: `DEV TEST ${width}.xlsx`, sizeBytes: bytes.length }, 201);
      assert.equal((await fetch(reserved.signedUrl, { method: "PUT", headers: { "Content-Type": reserved.mimeType }, body: bytes })).ok, true);
      const source = await h.expect(`/opening/sources/${reserved.id}/complete`, admin.token, {});
      let draft = await h.expect("/opening/drafts", admin.token, { name: `DEV TEST Browser ${width}`, sourceId: source.id, data: { asOfDate: "2026-10-01", proofReference: "DEV TEST signed count", lines: [{ id: "stock", kind: "Stock", entityId: product.id, sourceSheet: "Opening", sourceCell: "B7", sourceReference: `DEV TEST ${width} ${h.suffix}`, quantity: "3", unitCostBdt: "33.3333333333", lot: "DEV TEST", batch: `DEV-BROWSER-${width}-${h.suffix}`, condition: "Quarantine", manufacturingDate: "2026-01-01", expiryDate: "2028-12-31", receivedDate: "2026-09-01", location: "DEV-OPEN" }], exceptionResolutions: [] } }, 201);
      draft = await h.expect(`/opening/drafts/${draft.id}/validate`, admin.token, { version: draft.version }); assert.equal(draft.state, "Validated");
      draft = await h.expect(`/opening/drafts/${draft.id}/preview`, admin.token, { version: draft.version });
      draft = await h.expect(`/opening/drafts/${draft.id}/approve`, approver.token, { version: draft.version });
      const page = await browser.newPage({ viewport: { width, height: 1000 } }); const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("response", (r) => { if (new URL(r.url()).pathname.startsWith("/api/") && r.status() >= 400) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
      const capture = async (name: string) => {
        assert.deepEqual(errors, []); assert.ok(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 2), `${name} fits ${width}px`);
        await page.screenshot({ path: `artifacts/backend/opening-post/${name}-${width}.png`, fullPage: true }); console.log(`Opening browser verified ${name} at ${width}px.`);
      };
      await page.goto("http://localhost:5196/login"); await page.getByLabel("Email", { exact: true }).fill(admin.email); await page.getByLabel("Password", { exact: true }).fill(h.password); await page.getByRole("button", { name: "Sign In", exact: true }).click(); await page.waitForURL("**/backend");
      await page.goto(`http://localhost:5196/backend/settings/opening/${draft.id}`);
      await expect(page.getByText("Approved, not posted", { exact: true })).toBeVisible(); await capture("approved");
      await page.getByRole("button", { name: "Post Opening Balances", exact: true }).click(); await expect(page.getByRole("dialog")).toBeVisible(); await capture("confirmation");
      await page.getByRole("button", { name: "Confirm Posting", exact: true }).click();
      await expect(page.getByText("Source-to-journal reconciliation", { exact: true })).toBeVisible(); await expect(page.getByRole("cell", { name: "Matched", exact: true })).toBeVisible(); await capture("posted");
      await page.getByRole("button", { name: "Confirm Reconciliation", exact: true }).click(); await expect(page.getByText("Posted and reconciled", { exact: true })).toBeVisible(); await capture("reconciled");
      await page.goto("http://localhost:5196/backend/inventory"); await page.getByLabel("Search inventory", { exact: true }).fill(product.code);
      await expect(page.getByText(product.name, { exact: true })).toBeVisible(); await capture("stock");
      await page.getByRole("tab", { name: "Batches", exact: true }).click(); await expect(page.getByText("Opening Stock", { exact: true })).toBeVisible(); await expect(page.getByText("Quarantine", { exact: true })).toBeVisible(); await expect(page.getByText("Issue first", { exact: true })).toHaveCount(0); await capture("condition");
      await page.getByRole("tab", { name: "Movements", exact: true }).click(); await expect(page.getByRole("cell", { name: "Opening", exact: true })).toBeVisible(); await capture("movement");
      const result = await h.expect(`/opening/drafts/${draft.id}/reconciliation`, admin.token); assert.equal(result.matches, true); assert.equal(result.rows[0].postedBdt, "100.00");
      await page.close();
    }
  } finally { await browser.close(); await web.close(); await h.close(); }
}
main().catch((error) => { console.error("Opening browser check failed", { name: error?.name, code: error?.code ?? "CHECK_FAILED", detail: String(error?.message ?? "").split("\n").slice(0, 4).join(" ").replace(/https?:\/\/\S+/g, "[URL]").replace(/T![a-f0-9]+/g, "[TEST PASSWORD]") }); process.exitCode = 1; });
