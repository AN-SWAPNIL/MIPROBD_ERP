import { openWorkspace } from "./workspace-browser.js";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium, expect as browserExpect } from "@playwright/test";

export async function reportBackendBrowserSmoke(apiBase: string, email: string, password: string, customerId: string, from: string, to: string) {
  process.env.VITE_BACKEND_MODE = "foundation"; process.env.VITE_DEMO_MODE = "false";
  const web = await createServer({ cacheDir: "node_modules/.vite-backend-report-test", server: { port: 5195, host: "localhost", strictPort: true, proxy: { "/api": { target: new URL(apiBase).origin, changeOrigin: true } } } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    await web.listen(); await mkdir("artifacts/backend", { recursive: true });
    for (const width of [1440,390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(90000);
      const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => { if (new URL(response.url()).pathname.startsWith("/api/") && response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
      const capture = async (label: string) => {
        assert.equal(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth+2), true, `${label}: no page overflow at ${width}px`);
        await page.screenshot({ path: `artifacts/backend/report-${label}-${width}.png`, fullPage: true });
      };
      await page.goto("http://localhost:5195/login", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password);
      const loginResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/login" && response.request().method() === "POST");
      await page.getByRole("button", { name: "Sign In", exact: true }).click(); assert.equal((await loginResponse).status(), 200); await page.waitForURL("**/backend");
      await openWorkspace(page, "Reports"); await page.getByTestId("report-catalogue").waitFor();
      await page.getByLabel("Search reports").fill("sales summary"); await page.getByRole("button").filter({ hasText: "Sales Summary" }).first().waitFor(); await capture("catalogue");
      await page.goto(`http://localhost:5195/backend/reports/sales-summary?from=${from}&to=${to}&customer=${encodeURIComponent(customerId)}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Print Preview", exact: true }).waitFor();
      assert.equal(await page.getByRole("combobox", { name: "Customer / Buyer", exact: true }).inputValue(), customerId);
      await page.getByRole("combobox", { name: "Group by", exact: true }).selectOption("Monthly");
      await page.getByRole("button", { name: "Generate Report", exact: true }).click(); await page.waitForURL("**grouping=Monthly**");
      await page.getByRole("button", { name: "Print Preview", exact: true }).waitFor(); await capture("summary");
      const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Export CSV", exact: true }).click(); assert.match((await download).suggestedFilename(), /^sales-summary/);
      await page.getByRole("button", { name: "Print Preview", exact: true }).click();
      const printButton = page.getByRole("button", { name: "Print / Save PDF", exact: true });
      await browserExpect(printButton).toBeEnabled();
      const sheet = page.locator(".print-sheet"); assert.ok((await sheet.first().innerText()).includes("Monthly"));
      for (const mode of ["With Background", "Without Background"]) {
        await page.getByRole("tab", { name: mode, exact: true }).click(); await sheet.first().waitFor();
        await browserExpect(printButton).toBeEnabled();
        await capture(mode === "With Background" ? "digital" : "preprinted");
        await page.emulateMedia({ media: "print" });
        const dims = await sheet.first().evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, content: element.scrollHeight }));
        assert.ok(Math.abs(dims.width-793.7)<2 && Math.abs(dims.height-1122.5)<2 && dims.content<=dims.height+2);
        assert.equal(await sheet.first().locator("[data-report-page-edge]").getAttribute("data-report-page-edge"), "1.5mm-left-0.2mm-right");
        if (width === 1440) await page.pdf({ path: `artifacts/backend/report-${mode === "With Background" ? "digital" : "preprinted"}.pdf`, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
        await page.emulateMedia({ media: "screen" });
      }
      if (width === 1440) {
        // Layout-only continuation test derived from this authorized report; no extra business rows are written.
        await page.route("**/api/reports/sales-summary/print?**", async (route) => {
          const response = await route.fetch(); const body = await response.json();
          const rows = Array.from({ length: 100 }, (_, index) => ({ ...body.data.rows[0], date: `LAYOUT-${String(index+1).padStart(3,"0")}` }));
          await route.fulfill({ response, json: { ...body, data: { ...body.data, rows, rowCount: 100, pageSize: 100 } } });
        });
        await page.reload({ waitUntil: "domcontentloaded" }); await browserExpect(printButton).toBeEnabled();
        assert.ok(await sheet.count() >= 3, "Long reports must continue on measured A4 pages");
        assert.ok(await sheet.locator("[data-repeated-header]").count() >= 1, "Report continuation pages repeat their column headings");
        await page.getByRole("tab", { name: "With Background", exact: true }).click(); await browserExpect(printButton).toBeEnabled();
        await page.emulateMedia({ media: "print" });
        await page.pdf({ path: "artifacts/backend/report-continuation.pdf", preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
        await sheet.last().screenshot({ path: "artifacts/backend/report-continuation-last.png" });
        await page.emulateMedia({ media: "screen" });
      }
      assert.deepEqual(errors, []); await page.close();
      console.log(`Persistent reports: catalogue, filters, CSV and both A4 modes passed at ${width}px.`);
    }
  } catch (error) {
    for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: "artifacts/backend/report-failed.png", fullPage: true }).catch(() => undefined);
    throw error;
  } finally { await browser.close(); if (web.httpServer && "closeAllConnections" in web.httpServer) web.httpServer.closeAllConnections(); await web.close(); }
}
