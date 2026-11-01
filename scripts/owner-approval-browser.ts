import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "@playwright/test";
import { preview } from "vite";
import { signOutWorkspace } from "./workspace-browser.js";

export async function ownerApprovalBrowser(apiBase: string, owner: { email: string }, password: string, debitId: string, creditId: string) {
  const origin = "http://localhost:5197";
  const web = await preview({ logLevel: "warn", build: { outDir: "artifacts/backend/ledger-build" }, preview: { host: "localhost", port: 5197, strictPort: true, proxy: { "/api": { target: new URL(apiBase).origin, changeOrigin: true } } } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const output = "artifacts/backend/owner-approval"; await mkdir(output, { recursive: true });
  async function posted(page: Page, path: string, click: () => Promise<unknown>) {
    const pending = page.waitForResponse(r => new URL(r.url()).pathname === `/api${path}` && r.request().method() === "POST");
    await click(); const response = await pending; const body = await response.json();
    assert.equal(response.ok(), true, `${path}: ${body.message}`); return body.data;
  }
  try {
    for (const [name, width] of [["desktop", 1440], ["mobile", 390]] as const) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.setDefaultTimeout(45000);
      const faults: string[] = []; page.on("pageerror", e => faults.push(e.name));
      page.on("response", r => { if (r.url().includes("/api/") && r.status() >= 400) faults.push(`${r.status()} ${new URL(r.url()).pathname}`); });
      const capture = async (label: string) => {
        await page.waitForLoadState("networkidle");
        assert.equal(await page.locator("html").evaluate(el => el.scrollWidth <= el.clientWidth + 2), true, `${label} fits ${width}px`);
        await page.screenshot({ path: `${output}/${label}-${name}.png`, fullPage: true });
      };
      try {
        await page.goto(`${origin}/login`);
        await page.getByLabel("Email", { exact: true }).fill(owner.email); await page.getByLabel("Password", { exact: true }).fill(password);
        await posted(page, "/auth/login", () => page.getByRole("button", { name: "Sign In", exact: true }).click());
        await page.waitForURL("**/backend");
        await page.goto(`${origin}/backend/settings/approvals`);
        const ownPolicy = page.getByRole("row").filter({ hasText: "DEV TEST browser own draft" });
        await ownPolicy.getByRole("button", { name: "Approve", exact: true }).waitFor(); await capture("own-policy");
        await page.goto(`${origin}/backend/accounts/ledger/journals/new`);
        await page.getByLabel("Reference", { exact: true }).fill(`DEV TEST browser owner ${name}`);
        await page.getByLabel("Evidence reference", { exact: true }).fill("DEV TEST rollback-only");
        await page.getByLabel("Description", { exact: true }).fill(`DEV TEST own decision ${name}`);
        await page.getByLabel("Account line 1", { exact: true }).selectOption(debitId); await page.getByLabel("Account line 2", { exact: true }).selectOption(creditId);
        await page.getByLabel("debit line 1", { exact: true }).fill("1.01"); await page.getByLabel("credit line 2", { exact: true }).fill("1.01");
        const journal = await posted(page, "/ledger/journals", () => page.getByRole("button", { name: "Save Draft", exact: true }).click());
        await page.waitForURL(`**/journals/${journal.id}`);
        const submitted = await posted(page, `/ledger/journals/${journal.id}/submit`, () => page.getByRole("button", { name: "Submit for Approval", exact: true }).click());
        await page.getByRole("button", { name: "Approvals", exact: true }).click();
        const row = page.getByRole("row").filter({ hasText: journal.number });
        await row.getByRole("button", { name: "Approve", exact: true }).waitFor(); await capture("self-approve");
        await row.getByRole("button", { name: "Approve", exact: true }).click();
        await page.getByLabel("Decision reason / evidence", { exact: true }).fill("DEV TEST Super Admin own reviewed source");
        await posted(page, `/controls/approvals/${submitted.approvalId}/approve`, () => page.getByRole("button", { name: "Confirm", exact: true }).click());
        await row.getByText("Approved", { exact: true }).waitFor();
        await row.getByRole("button", { name: `History ${journal.number}`, exact: true }).click();
        const history = page.getByRole("dialog");
        await history.getByText("Super Admin authority:", { exact: false }).first().waitFor();
        assert.equal(await history.getByText("Super Admin authority:", { exact: false }).count(), 2); await capture("decision-history");
        await history.getByRole("button", { name: "Close", exact: true }).click();
        await page.goto(`${origin}/backend/accounts/ledger/journals/${journal.id}`);
        await posted(page, `/ledger/journals/${journal.id}/post`, () => page.getByRole("button", { name: "Post Approved Journal", exact: true }).click());
        await page.getByText("Posted", { exact: true }).waitFor(); await capture("posted-journal");
        assert.deepEqual(faults, []); await signOutWorkspace(page); await page.waitForURL("**/login");
        console.log(`Owner browser: ${name} own policy action, self-approval, two-event history and posted journal passed`);
      } catch (error) { await page.screenshot({ path: `${output}/failure-${name}.png`, fullPage: true }).catch(() => {}); throw error; }
      finally { await page.close(); }
    }
  } finally { await browser.close(); if ("closeAllConnections" in web.httpServer) web.httpServer.closeAllConnections(); await new Promise<void>(resolve => web.httpServer.close(() => resolve())); }
}
