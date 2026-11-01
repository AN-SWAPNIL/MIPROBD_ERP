import { openWorkspace } from "./workspace-browser.js";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

export async function printBackendBrowserSmoke(apiBase: string, email: string, password: string, records: [string, string, string][], options: { readOnly?: boolean } = {}) {
  process.env.VITE_BACKEND_MODE = "foundation"; process.env.VITE_DEMO_MODE = "false";
  const origin = process.env.APP_URL ?? "http://localhost:5193";
  if (new URL(origin).hostname !== "localhost") throw new Error("Use a local development origin.");
  const web = await createServer({ cacheDir: "node_modules/.vite-backend-print-test", server: { port: Number(new URL(origin).port), host: "localhost", strictPort: true, proxy: { "/api": { target: new URL(apiBase).origin, changeOrigin: true } } } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const observedErrors: string[] = [];
  try {
    await web.listen(); await mkdir("artifacts/backend", { recursive: true });
    for (const [name, width] of [["desktop", 1440], ["mobile", 390]] as const) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(90000);
      const errors: string[] = []; page.on("pageerror", (error) => { errors.push(error.message); observedErrors.push(error.message); });
      page.on("response", (response) => { if (new URL(response.url()).pathname.startsWith("/api/") && response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
      const capture = async (label: string) => {
        assert.equal(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 2), true, `${label}: no page overflow at ${width}px`);
        assert.equal(await page.getByText(/NaN|undefined BDT/).count(), 0);
        await page.screenshot({ path: `artifacts/backend/print-${label}-${name}.png`, fullPage: true });
      };
      await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
      await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign In", exact: true }).click(); await page.waitForURL("**/backend");
      await openWorkspace(page, "Settings");
      await page.getByRole("button", { name: "Company Stationery", exact: true }).click();
      await page.getByRole("button", { name: "Save Stationery", exact: true }).waitFor();
      await capture("settings");
      if (!options.readOnly) {
        const saved = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/settings/print" && response.request().method() === "PATCH");
        await page.getByRole("button", { name: "Save Stationery", exact: true }).click(); assert.equal((await saved).status(), 200);
      }
      for (const [type, id, amount] of records) {
        await page.goto(`${origin}/backend/print/${type}/${id}`, { waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: "Print / Save PDF", exact: true }).waitFor();
        const sheet = page.locator(".letterhead-sheet.print-sheet"); await sheet.first().waitFor();
        assert.ok((await sheet.first().innerText()).includes(`BDT ${amount}`), `${type} must preserve the saved decimal amount`);
        await page.getByRole("tab", { name: "With Background", exact: true }).click();
        assert.equal(await sheet.first().getAttribute("data-letterhead-mode"), "digital");
        const artwork = await sheet.first().evaluate((element) => element.ownerDocument.defaultView!.getComputedStyle(element).backgroundImage);
        assert.match(artwork, /letterhead\.jpg/);
        const asset = await page.request.get(new URL(/url\(["']?(.*?)["']?\)/.exec(artwork)![1], origin).href); assert.equal(asset.status(), 200); assert.ok((await asset.body()).length > 10000);
        await capture(`${type}-digital`);
        await page.emulateMedia({ media: "print" });
        assert.equal(await page.locator(".app-header").evaluate((element) => element.ownerDocument.defaultView!.getComputedStyle(element).display), "none");
        assert.equal(await page.locator(".backend-content-shell").evaluate((element) => element.ownerDocument.defaultView!.getComputedStyle(element).padding), "0px");
        for (const heading of await page.locator(".print-sheet .transaction-print-flow thead").all()) assert.equal(await heading.evaluate((element) => element.ownerDocument.defaultView!.getComputedStyle(element).display), "table-row-group", "Only the explicit continuation heading should print");
        const dimensions = await sheet.first().evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, contentHeight: element.scrollHeight }));
        assert.ok(Math.abs(dimensions.width - 793.7) < 2 && Math.abs(dimensions.height - 1122.5) < 2, `${type}: A4 dimensions`);
        assert.ok(dimensions.contentHeight <= dimensions.height + 2, `${type}: print content must not be clipped`);
        if (name === "desktop") {
          const pdf = await page.pdf({ path: `artifacts/backend/print-${type}.pdf`, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false }); assert.ok(pdf.length > 10000);
          await page.screenshot({ path: `artifacts/backend/print-${type}-paper.png`, fullPage: true });
        }
        await page.emulateMedia({ media: "screen" });
        await page.waitForTimeout(300);
        await page.getByRole("tab", { name: "Without Background", exact: true }).click();
        assert.equal(await sheet.first().getAttribute("data-letterhead-mode"), "preprinted");
        assert.equal(await sheet.first().evaluate((element) => element.ownerDocument.defaultView!.getComputedStyle(element).backgroundImage), "none");
        await capture(`${type}-preprinted`);
        console.log(`Print ${name}: ${type} checked in both modes.`);
      }
      const quote = records.find(([type]) => type === "quotation");
      if (quote) {
        // Layout-only stress case derived from the test's real, authorized saved quotation.
        await page.route(`**/api/print/records/quotation/${quote[1]}`, async (route) => {
          const response = await route.fetch(); const body = await response.json();
          const record = body.data.record; const line = record.lines[0];
          await route.fulfill({ response, json: { ...body, data: { ...body.data, record: { ...record, lines: Array.from({ length: 40 }, (_, index) => ({ ...line, id: `page-line-${index}`, productCode: `PAGE-${String(index + 1).padStart(2, "0")}`, productName: `Pagination dialyzer line ${String(index + 1).padStart(2, "0")}` })), subtotal: "148.00", discountTotal: "0.40", total: "147.60" } } } });
        });
        await page.goto(`${origin}/backend/print/quotation/${quote[1]}`, { waitUntil: "domcontentloaded" });
        const pages = page.locator(".letterhead-sheet.print-sheet"); await pages.nth(2).waitFor();
        assert.ok(await pages.count() >= 3, "Long quotations must continue on multiple A4 pages");
        assert.equal(await pages.last().locator("[data-repeated-header]").count(), 1, "Continuation product rows must repeat their column headings");
        await pages.last().screenshot({ path: `artifacts/backend/print-continuation-last-${name}.png` });
        if (name === "desktop") {
          await page.emulateMedia({ media: "print" });
          await page.pdf({ path: "artifacts/backend/print-continuation.pdf", preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
          await page.emulateMedia({ media: "screen" });
        }
      }
      assert.deepEqual(errors, []); await page.close();
      console.log(`Persistent printing ${name}: stationery and ${records.length} documents in both modes passed.`);
    }
  } catch (error) {
    console.error("Print browser errors:", observedErrors);
    for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: "artifacts/backend/print-failed.png", fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    await browser.close(); if (web.httpServer && "closeAllConnections" in web.httpServer) web.httpServer.closeAllConnections(); await web.close();
  }
}
