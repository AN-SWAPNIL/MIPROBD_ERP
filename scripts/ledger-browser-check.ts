import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { build, preview } from "vite";
import { chromium, type Page } from "@playwright/test";
import { signOutWorkspace } from "./workspace-browser.js";
import { businessDate } from "../src/lib/date.js";

export async function prepareLedgerBrowserBundle() {
  process.env.VITE_BACKEND_MODE = "foundation"; process.env.VITE_DEMO_MODE = "false";
  const nodeEnv = process.env.NODE_ENV;
  try { await build({ logLevel: "warn", build: { outDir: "artifacts/backend/ledger-build", emptyOutDir: true } }); }
  finally { if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv; }
}
export async function ledgerBrowserCheck(apiBase: string, password: string, people: { id: string; email: string }[], debitId: string, creditId: string, suffix: string) {
  const origin = "http://localhost:5197";
  const web = await preview({ logLevel: "warn", build: { outDir: "artifacts/backend/ledger-build" }, preview: { host: "localhost", port: 5197, strictPort: true, proxy: { "/api": { target: new URL(apiBase).origin, changeOrigin: true } } } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  async function posted(page: Page, path: string, click: () => Promise<unknown>) {
    const pending = page.waitForResponse((r) => new URL(r.url()).pathname === `/api${path}` && r.request().method() === "POST", { timeout: 45000 });
    await click(); const response = await pending; const body = await response.json(); assert.equal(response.ok(), true, `${path}: ${body.message}`); return body.data;
  }
  async function login(page: Page, index: number) {
    if (new URL(page.url()).pathname !== "/login") await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Email", { exact: true }).fill(people[index].email); await page.getByLabel("Password", { exact: true }).fill(password);
    await posted(page, "/auth/login", () => page.getByRole("button", { name: "Sign In", exact: true }).click()); await page.waitForURL("**/backend", { timeout: 45000 });
  }
  async function logout(page: Page) {
    const pending = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/logout" && r.request().method() === "POST");
    await signOutWorkspace(page); assert.equal((await pending).ok(), true); await page.waitForURL("**/login");
  }
  try {
    await mkdir("artifacts/backend/ledger", { recursive: true });
    for (const [name, width] of [["desktop", 1440], ["mobile", 390]] as const) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.setDefaultTimeout(45000);
      const faults: string[] = []; page.on("pageerror", (e) => faults.push(e.name));
      page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400) faults.push(`${r.status()} ${new URL(r.url()).pathname}`); });
      const capture = async (label: string) => {
        await page.waitForLoadState("networkidle");
        assert.equal(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 2), true, `${label} must fit ${width}px`);
        assert.equal(await page.locator("html").evaluate((html) => html.scrollWidth <= html.clientWidth + 2), true, `${label} must not widen the document`);
        await page.screenshot({ path: `artifacts/backend/ledger/${label}-${name}.png`, fullPage: true });
        console.log(`Ledger browser: ${name} ${label}`);
      };
      try {
      await login(page, 0);
      await page.goto(`${origin}/backend/accounts/ledger`); await page.getByRole("heading", { name: "General Ledger", exact: true }).waitFor(); await page.getByRole("tab", { name: "Journals", exact: true }).waitFor(); await capture("journals");
      for (const tab of ["Chart of Accounts", "Source Posting Queue", "Posting Mapping", "Closed Periods"]) {
        await page.getByRole("tab", { name: tab, exact: true }).click(); await page.waitForLoadState("networkidle"); await capture(tab.toLowerCase().replaceAll(" ", "-"));
      }
      await page.goto(`${origin}/backend/settings/approvals`); await page.getByRole("heading", { name: "Approval Policies", exact: true }).waitFor(); await page.getByRole("button", { name: "New Policy", exact: true }).click(); await page.getByRole("dialog").waitFor(); await capture("policy-editor"); await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.goto(`${origin}/backend/accounts/ledger/journals/new`); await page.getByRole("heading", { name: "New Journal", exact: true }).waitFor();
      const reference = `DEV TEST browser ${name} ${suffix}`;
      await page.getByLabel("Reference", { exact: true }).fill(reference); await page.getByLabel("Evidence reference", { exact: true }).fill("DEV TEST synthetic browser evidence"); await page.getByLabel("Description", { exact: true }).fill(`DEV TEST browser journal ${name}`);
      await page.getByLabel("Account line 1", { exact: true }).selectOption(debitId); await page.getByLabel("Account line 2", { exact: true }).selectOption(creditId);
      await page.getByLabel("debit line 1", { exact: true }).fill("1.01"); await page.getByLabel("credit line 2", { exact: true }).fill("1.01"); await capture("journal-editor");
      const draft = await posted(page, "/ledger/journals", () => page.getByRole("button", { name: "Save Draft", exact: true }).click());
      await page.waitForURL(`**/journals/${draft.id}`);
      const submitted = await posted(page, `/ledger/journals/${draft.id}/submit`, () => page.getByRole("button", { name: "Submit for Approval", exact: true }).click());
      await logout(page); await login(page, 1); await page.getByRole("button", { name: "Approvals", exact: true }).click();
      let row = page.getByRole("row").filter({ hasText: draft.number }); await row.getByRole("button", { name: "Verify", exact: true }).click();
      await page.getByLabel("Decision reason / evidence", { exact: true }).fill("DEV TEST verified browser evidence");
      await posted(page, `/controls/approvals/${submitted.approvalId}/verify`, () => page.getByRole("button", { name: "Confirm", exact: true }).click());
      await logout(page); await login(page, 2); await page.getByRole("button", { name: "Approvals", exact: true }).click();
      row = page.getByRole("row").filter({ hasText: draft.number }); await row.getByRole("button", { name: "Approve", exact: true }).click();
      await page.getByLabel("Decision reason / evidence", { exact: true }).fill("DEV TEST independent browser approval");
      await posted(page, `/controls/approvals/${submitted.approvalId}/approve`, () => page.getByRole("button", { name: "Confirm", exact: true }).click());
      await page.waitForLoadState("networkidle"); await capture("approvals"); await logout(page); await login(page, 0);
      await page.goto(`${origin}/backend/accounts/ledger/journals/${draft.id}`); await posted(page, `/ledger/journals/${draft.id}/post`, () => page.getByRole("button", { name: "Post Approved Journal", exact: true }).click());
      await page.getByText("Posted", { exact: true }).waitFor(); await capture("posted-journal");
      await page.goto(`${origin}/backend/reports/ledger-trial-balance?from=${businessDate()}&to=${businessDate()}`);
      await page.getByRole("button", { name: "Print Preview", exact: true }).waitFor(); await capture("trial-balance");
      await page.getByRole("button", { name: "Print Preview", exact: true }).click(); await page.locator(".letterhead-sheet:visible").first().waitFor();
      await page.getByRole("tab", { name: "With Background", exact: true }).click();
      assert.equal(await page.locator(".letterhead-sheet:visible").first().getAttribute("data-letterhead-mode"), "digital");
      await page.screenshot({ path: `artifacts/backend/ledger/print-digital-${name}.png`, fullPage: true });
      await page.getByRole("tab", { name: "Without Background", exact: true }).click();
      assert.equal(await page.locator(".letterhead-sheet:visible").first().getAttribute("data-letterhead-mode"), "preprinted");
      await page.screenshot({ path: `artifacts/backend/ledger/print-preprinted-${name}.png`, fullPage: true });
      assert.deepEqual(faults, [], "No browser/API errors in the ledger workflow"); await logout(page); await page.close();
      } catch (error) {
        await page.screenshot({ path: `artifacts/backend/ledger/failure-${name}.png`, fullPage: true }).catch(() => {});
        console.error("Ledger browser state", { viewport: name, path: new URL(page.url()).pathname, headings: await page.getByRole("heading").allTextContents(), faults });
        throw error;
      }
    }
    console.log("Built foundation frontend desktop/390px: real login, navigation, journal preparation, independent review/approval/posting and both report print modes passed. Accounting test data rolls back.");
  } finally { await browser.close(); if ("closeAllConnections" in web.httpServer) web.httpServer.closeAllConnections(); await new Promise<void>((resolve) => web.httpServer.close(() => resolve())); }
}
