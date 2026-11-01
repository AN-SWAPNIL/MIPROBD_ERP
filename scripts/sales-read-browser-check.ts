import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { hostedHarness } from "../server/testing/hosted.js";
import { openWorkspace, signOutWorkspace } from "./workspace-browser.js";
const expect = baseExpect.configure({ timeout: 30000 });
async function main() {
  process.env.APP_URL = "http://localhost:5199"; process.env.VITE_BACKEND_MODE = "foundation"; process.env.VITE_DEMO_MODE = "false";
  const h = await hostedHarness("sales-read");
  const web = await createServer({ cacheDir: "node_modules/.vite-sales-read-check", server: { port: 5199, host: "localhost", strictPort: true, proxy: { "/api": { target: new URL(h.bases[0]).origin, changeOrigin: true, localAddress: h.peer } } } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    await web.listen(); await mkdir("artifacts/backend/update13", { recursive: true }); const user = await h.employee("Super Admin");
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.setDefaultTimeout(30000); const failures: string[] = [];
      page.on("pageerror", () => failures.push("Browser runtime error"));
      page.on("response", (r) => { if (new URL(r.url()).pathname.startsWith("/api/") && r.status() >= 400) failures.push(`${r.status()} ${new URL(r.url()).pathname}`); });
      await page.goto("http://localhost:5199/login"); await page.getByLabel("Email", { exact: true }).fill(user.email); await page.getByLabel("Password", { exact: true }).fill(h.password); await page.getByRole("button", { name: "Sign In", exact: true }).click(); await page.waitForURL("**/backend");
      const loaded = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/sales/overview"); const start = Date.now(); await openWorkspace(page, "Sales");
      const response = await loaded; console.log(`Sales snapshot HTTP ${response.status()} after ${Date.now() - start}ms at ${width}px.`); assert.equal(response.status(), 200);
      await expect(page.getByRole("heading", { name: "Sales & Marketing", exact: true })).toBeVisible(); await page.getByRole("tab", { name: /^Collections/ }).click();
      await expect(page.getByRole("heading", { name: "Collection register", exact: true })).toBeVisible();
      assert.ok(await page.locator("body").evaluate((b) => b.scrollWidth <= b.clientWidth + 2)); assert.deepEqual(failures, []);
      await page.screenshot({ path: `artifacts/backend/update13/sales-snapshot-${width}.png`, fullPage: true }); await signOutWorkspace(page); await page.waitForURL("**/login"); await page.close();
    }
  } finally { await browser.close(); if (web.httpServer && "closeAllConnections" in web.httpServer) web.httpServer.closeAllConnections(); await web.close(); await h.close(); }
}
main().catch((error) => { const code = error?.cause?.code ?? error?.code; console.error("Sales read-browser check failed", { type: error?.name, code: typeof code === "string" && /^[A-Z0-9_]+$/.test(code) ? code : "BROWSER_OR_DEPENDENCY" }); process.exitCode = 1; });
