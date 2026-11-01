import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { build, preview } from "vite";
import { chromium, type Page } from "@playwright/test";
import { signOutWorkspace } from "./workspace-browser.js";
import { businessDate } from "../src/lib/date.js";
import type { hostedHarness } from "../server/testing/hosted.js";

export async function prepareHoldBrowserBundle() {
  process.env.VITE_BACKEND_MODE = "foundation"; process.env.VITE_DEMO_MODE = "false"; const nodeEnv = process.env.NODE_ENV;
  try { await build({ logLevel: "warn", build: { outDir: "artifacts/backend/stock-hold-build", emptyOutDir: true } }); }
  finally { if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv; }
}
export async function checkStockHoldBrowser(h: Awaited<ReturnType<typeof hostedHarness>>, people: { email: string; token: string }[], product: { id: string; name: string }, batchNumber: string) {
  const origin = "http://localhost:5196";
  const web = await preview({ logLevel: "warn", build: { outDir: "artifacts/backend/stock-hold-build" }, preview: { host: "localhost", port: 5196, strictPort: true, proxy: { "/api": { target: new URL(h.bases[0]).origin, changeOrigin: true } } } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const posted = async (page: Page, path: string, action: () => Promise<unknown>) => {
    const waiting = page.waitForResponse((r) => new URL(r.url()).pathname === `/api${path}` && r.request().method() === "POST"); await action(); const response = await waiting; const result = await response.json(); assert.ok(response.ok(), `${path}: ${result.message}`); return result.data;
  };
  const login = async (page: Page, index: number) => {
    await page.goto(`${origin}/login`); await page.getByLabel("Email", { exact: true }).fill(people[index].email); await page.getByLabel("Password", { exact: true }).fill(h.password);
    await posted(page, "/auth/login", () => page.getByRole("button", { name: "Sign In", exact: true }).click()); await page.waitForURL("**/backend");
  };
  const logout = async (page: Page) => {
    const waiting = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/logout" && r.request().method() === "POST"); await signOutWorkspace(page); assert.ok((await waiting).ok()); await page.waitForURL("**/login");
  };
  try {
    await mkdir("artifacts/backend/stock-holds", { recursive: true });
    for (const [name, width] of [["desktop", 1440], ["mobile", 390]] as const) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.setDefaultTimeout(45000); const faults: string[] = [];
      page.on("pageerror", (e) => faults.push(e.name)); page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400) faults.push(`${r.status()} ${new URL(r.url()).pathname}`); });
      const capture = async (label: string) => {
        await page.waitForLoadState("networkidle");
        assert.ok(await page.locator("html").evaluate((el) => el.scrollWidth <= el.clientWidth + 2), `${label}: document fits ${width}`);
        assert.ok(await page.locator("body").evaluate((el) => el.scrollWidth <= el.clientWidth + 2), `${label}: body fits ${width}`);
        await page.screenshot({ path: `artifacts/backend/stock-holds/${label}-${name}.png`, fullPage: true });
      };
      try {
        await login(page, 0); await page.goto(`${origin}/backend/inventory`); await page.getByRole("tab", { name: "Batches", exact: true }).click();
        await page.getByRole("textbox", { name: "Search inventory", exact: true }).fill(product.name);
        await page.getByRole("button", { name: `Hold ${batchNumber}`, exact: true }).click();
        await page.getByLabel("Quantity to hold", { exact: true }).fill("0.25"); await page.getByLabel("Evidence reference", { exact: true }).fill(`DEV TEST ${name} QA`); await page.getByLabel("Hold reason", { exact: true }).fill(`DEV TEST ${name} partial inspection`); await capture("hold-editor");
        const hold = await posted(page, "/inventory/holds", () => page.getByRole("button", { name: "Place Hold", exact: true }).click()); await page.getByRole("dialog").waitFor({ state: "hidden" }); await capture("inventory");
        await page.goto(`${origin}/backend/inventory/holds?hold=${hold.id}`); await page.getByLabel("Release quantity", { exact: true }).fill("0.10"); await page.getByLabel("Inspection evidence reference", { exact: true }).fill(`DEV TEST ${name} inspected`); await page.getByLabel("Inspection outcome / reason", { exact: true }).fill(`DEV TEST ${name} physical inspection passed`); await capture("release-editor");
        const submitted = await posted(page, `/inventory/holds/${hold.id}/releases`, () => page.getByRole("button", { name: "Submit Release", exact: true }).click());
        const releases = await h.expect(`/inventory/holds/${hold.id}/releases`, people[0].token); const source = releases.rows.find((r: { id: string }) => r.id === submitted.id); assert.ok(source);
        await page.getByRole("button", { name: "Close", exact: true }).click(); await logout(page);
        for (const [index, action] of [[1, "verify"], [2, "approve"]] as const) {
          await login(page, index); await page.goto(`${origin}/backend/approvals?domain=Stock`); const row = page.getByRole("row").filter({ hasText: source.number });
          await row.getByRole("button", { name: action === "verify" ? "Verify" : "Approve", exact: true }).click(); await page.getByLabel("Decision reason / evidence", { exact: true }).fill(`DEV TEST ${name} independent ${action}`);
          await posted(page, `/controls/approvals/${source.approvalId}/${action}`, () => page.getByRole("button", { name: "Confirm", exact: true }).click()); await logout(page);
        }
        await login(page, 0); await page.goto(`${origin}/backend/inventory/holds?hold=${hold.id}`); await posted(page, `/inventory/releases/${source.id}/post`, () => page.getByRole("button", { name: "Post Release", exact: true }).click()); await page.getByText("Posted", { exact: true }).waitFor(); await capture("approved-release");
        await page.getByRole("button", { name: "Close", exact: true }).click(); await page.getByRole("textbox", { name: "Search stock holds", exact: true }).fill(product.name); await capture("hold-register");
        await page.goto(`${origin}/backend/reports/stock-holds?from=${businessDate()}&to=${businessDate()}&product=${product.id}`); await page.getByRole("button", { name: "Print Preview", exact: true }).waitFor(); await capture("report"); await page.getByRole("button", { name: "Print Preview", exact: true }).click(); await page.locator(".letterhead-sheet:visible").first().waitFor();
        for (const mode of ["With Background", "Without Background"] as const) { await page.getByRole("tab", { name: mode, exact: true }).click(); await page.screenshot({ path: `artifacts/backend/stock-holds/print-${mode === "With Background" ? "digital" : "preprinted"}-${name}.png`, fullPage: true }); }
        assert.deepEqual(faults, []); await logout(page); await page.close(); console.log(`Stock holds browser ${name}: hold, independent inspection/approval/release, report and two print modes passed.`);
      } catch (error) { await page.screenshot({ path: `artifacts/backend/stock-holds/failure-${name}.png`, fullPage: true }).catch(() => {}); console.error("Stock hold browser state", { viewport: name, path: new URL(page.url()).pathname, faults }); throw error; }
    }
  } finally { await browser.close(); if ("closeAllConnections" in web.httpServer) web.httpServer.closeAllConnections(); await new Promise<void>((resolve) => web.httpServer.close(() => resolve())); }
}
