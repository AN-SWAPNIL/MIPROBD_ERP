import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { hostedHarness } from "../server/testing/hosted.js";

process.env.APP_URL = "http://localhost:5198";
process.env.VITE_BACKEND_MODE = "foundation"; process.env.VITE_DEMO_MODE = "false";
const h = await hostedHarness("ledger-layout"); const chart: string[] = [];
let user: Awaited<ReturnType<typeof h.employee>> | undefined;
let web: Awaited<ReturnType<typeof createServer>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  user = await h.employee("Super Admin", ["view_sensitive_cost"]);
  for (const kind of ["Asset", "Equity"] as const) chart.push((await h.expect("/ledger/accounts", user.token, { code: `L-${kind}-${h.suffix.slice(0, 8)}`, name: `DEV TEST layout ${kind} ${h.suffix}`, kind }, 201)).id);
  web = await createServer({ cacheDir: "node_modules/.vite-ledger-layout", server: { host: "localhost", port: 5198, strictPort: true, proxy: { "/api": { target: new URL(h.bases[0]).origin, changeOrigin: true } } } }); await web.listen();
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 1000 } }); page.setDefaultTimeout(30000);
  await page.goto("http://localhost:5198/login"); await page.getByLabel("Email", { exact: true }).fill(user.email); await page.getByLabel("Password", { exact: true }).fill(h.password); await page.getByRole("button", { name: "Sign In", exact: true }).click(); await page.waitForURL("**/backend");
  await page.goto("http://localhost:5198/backend/accounts/ledger/journals/new"); await page.getByRole("heading", { name: "New Journal", exact: true }).waitFor();
  await page.getByLabel("Reference", { exact: true }).fill("DEV TEST mobile focus reference"); await page.getByLabel("Evidence reference", { exact: true }).fill("DEV TEST layout only"); await page.getByLabel("Description", { exact: true }).fill("DEV TEST no journal is saved");
  await page.getByLabel("Account line 1", { exact: true }).selectOption(chart[0]); await page.getByLabel("Account line 2", { exact: true }).selectOption(chart[1]); await page.getByLabel("debit line 1", { exact: true }).fill("1.01"); await page.getByLabel("credit line 2", { exact: true }).fill("1.01");
  const size = { viewport: page.viewportSize()!.width, document: await page.locator("html").evaluate((html) => html.scrollWidth), body: await page.locator("body").evaluate((body) => body.scrollWidth), frame: (await page.locator(".erp-table-frame").boundingBox())?.width };
  await mkdir("artifacts/backend/ledger", { recursive: true }); const path = "artifacts/backend/ledger/journal-focus-mobile.png"; await page.screenshot({ path, fullPage: true });
  const screenshot = await sharp(path).metadata(); console.log("Ledger mobile focus layout", { ...size, screenshotWidth: screenshot.width });
  assert.ok(size.document <= size.viewport + 2); assert.ok(size.body <= size.viewport + 2); assert.equal(screenshot.width, 390);
  console.log("Focused mobile journal fields stay within the viewport; only the line table scrolls. No journal or money was posted.");
} finally {
  await browser?.close(); await web?.close();
  if (user) for (const id of chart) await h.expect(`/ledger/accounts/${id}/archive`, user.token, {});
  await h.close();
}
