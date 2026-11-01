import { signOutWorkspace } from "./workspace-browser.js";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium, type Page } from "@playwright/test";

export async function financeBackendBrowserSmoke(apiBase: string, email: string, password: string, accountId: string, categoryId: string, supplierId: string, suffix: string, mdEmail: string, salesEmail: string) {
  process.env.VITE_BACKEND_MODE = "foundation"; process.env.VITE_DEMO_MODE = "false";
  const origin = process.env.APP_URL ?? "http://localhost:5191";
  if (new URL(origin).hostname !== "localhost") throw new Error("Use a local development origin for this test.");
  const web = await createServer({ cacheDir: "node_modules/.vite-backend-finance-test", server: { port: Number(new URL(origin).port), host: "localhost", strictPort: true, proxy: { "/api": { target: new URL(apiBase).origin, changeOrigin: true } } } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  async function posted(page: Page, path: string, action: () => Promise<unknown>) {
    const pending = page.waitForResponse((response) => new URL(response.url()).pathname === `/api${path}` && response.request().method() === "POST", { timeout: 35000 });
    await action(); const response = await pending; const json = await response.json(); assert.equal(response.ok(), true, `${path}: ${json.message}`); return json.data;
  }
  try {
    await web.listen(); await mkdir("artifacts/backend", { recursive: true });
    for (const [name, width] of [["desktop", 1440], ["mobile", 390]] as const) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.setDefaultTimeout(20000); page.setDefaultNavigationTimeout(45000);
      const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
      const requests: string[] = [];
      page.on("response", (response) => { if (response.url().includes("/api/")) { requests.push(`${response.request().method()} ${new URL(response.url()).pathname} ${response.status()}`); if (requests.length > 25) requests.shift(); } });
      page.on("response", (response) => { if (response.url().includes("/api/") && response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
      async function login(userEmail: string) {
        if (new URL(page.url()).pathname !== "/login") await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
        await page.getByLabel("Email", { exact: true }).fill(userEmail); await page.getByLabel("Password", { exact: true }).fill(password);
        await page.getByRole("button", { name: "Sign In", exact: true }).click(); await page.waitForURL("**/backend", { timeout: 30000 });
      }
      async function capture(label: string) {
        assert.equal(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 2), true, `${label} must fit ${width}px`);
        assert.equal(await page.getByText(/NaN|undefined BDT/).count(), 0);
        await page.screenshot({ path: `artifacts/backend/finance-${label}-${name}.png`, fullPage: true });
      }
      async function reverse(kind: "expenses" | "supplier-settlements" | "financial-position" | "account-transactions", id: string, button: string) {
        await page.getByRole("button", { name: button, exact: true }).click();
        const dialog = page.getByRole("dialog"); await dialog.getByLabel("Reversal Reason", { exact: true }).fill("DEV TEST browser posting correction");
        await posted(page, `/${kind}/${id}/reverse`, () => dialog.getByRole("button", { name: "Post Reversal", exact: true }).click());
        await dialog.waitFor({ state: "hidden" });
      }
      page.on("close", () => { if (errors.length) console.error(`Finance browser ${name} API errors:`, errors); });
      await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" }); await login(email);
      await page.getByRole("link", { name: "Expenses & Accounts", exact: true }).click();
      await page.getByRole("button", { name: "Post Expense", exact: true }).click();
      let dialog = page.getByRole("dialog");
      await dialog.getByLabel("Expense Category", { exact: true }).selectOption(categoryId);
      await dialog.getByLabel("Expense Subtype", { exact: true }).selectOption("TA/DA");
      await dialog.getByTestId("employee-picker").getByRole("button").click();
      await page.getByPlaceholder("Search name, ID, designation...").fill("DEV TEST finance Sales Executive");
      await page.getByRole("option").filter({ hasText: "DEV TEST finance Sales Executive" }).click();
      await dialog.getByLabel("TA Amount", { exact: true }).fill("0.10"); await dialog.getByLabel("DA Amount", { exact: true }).fill("0.20");
      await dialog.getByLabel("Paid From", { exact: true }).selectOption(accountId);
      const reference = `DEV TEST Browser ${name} ${suffix}`;
      await dialog.getByLabel("Remarks", { exact: true }).fill(reference);
      const filename = `finance-${name}-${suffix}.png`;
      await dialog.locator('input[type="file"]').setInputFiles({ name: filename, mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6YV8AAAAASUVORK5CYII=", "base64") });
      await capture("expense-editor");
      const expense = await posted(page, "/expenses", () => dialog.getByRole("button", { name: "Post Expense", exact: true }).click());
      assert.equal(expense.amount, "0.30"); assert.equal(expense.attachment.fileName, filename); await dialog.waitFor({ state: "hidden" });
      await page.getByLabel("Search account records", { exact: true }).fill(reference); await capture("expense");
      await page.getByRole("button", { name: `View ${filename}`, exact: true }).click();
      await page.getByTestId("document-viewer").getByRole("img", { name: filename, exact: true }).waitFor();
      await page.getByTestId("document-viewer").getByRole("button", { name: "Close document viewer", exact: true }).last().click();
      await reverse("expenses", expense.id, `Reverse expense ${expense.id}`);
      console.log(`Finance browser ${name}: private evidence and expense reversal passed`);
      await page.getByRole("tab", { name: /^Suppliers & Position/ }).click();
      await page.getByLabel("Search account records", { exact: true }).fill("");
      await page.getByRole("button", { name: "Supplier Entry", exact: true }).click(); dialog = page.getByRole("dialog");
      await dialog.getByLabel("Supplier", { exact: true }).selectOption(supplierId);
      await dialog.getByLabel("Import / PO / Reference", { exact: true }).fill(reference);
      await dialog.getByLabel("Amount (BDT)", { exact: true }).fill("5.00");
      const obligation = await posted(page, "/supplier-settlements", () => dialog.getByRole("button", { name: "Post Supplier Entry", exact: true }).click()); await dialog.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Supplier Entry", exact: true }).click(); dialog = page.getByRole("dialog");
      await dialog.getByLabel("Supplier", { exact: true }).selectOption(supplierId); await dialog.getByLabel("Entry Type", { exact: true }).selectOption("Payment");
      await dialog.getByLabel("Import / PO / Reference", { exact: true }).fill(reference);
      await dialog.getByLabel("Amount (BDT)", { exact: true }).fill("2.01"); await dialog.getByLabel("Payment Account", { exact: true }).selectOption(accountId);
      await dialog.getByLabel("Payment Reference", { exact: true }).fill("TEST BANK TRANSFER");
      const payment = await posted(page, "/supplier-settlements", () => dialog.getByRole("button", { name: "Post Supplier Entry", exact: true }).click()); await dialog.waitFor({ state: "hidden" });
      console.log(`Finance browser ${name}: supplier obligation and payment posted`);
      await page.getByLabel("Search account records", { exact: true }).fill(reference); await capture("supplier-ledger");
      await reverse("supplier-settlements", payment.id, `Reverse supplier entry ${payment.id}`);
      await reverse("supplier-settlements", obligation.id, `Reverse supplier entry ${obligation.id}`);
      await page.getByRole("button", { name: "Position Entry", exact: true }).click(); dialog = page.getByRole("dialog");
      await dialog.getByLabel("Label", { exact: true }).fill(reference); await dialog.getByLabel("Source Reference", { exact: true }).fill(reference);
      await dialog.getByLabel("Amount (BDT)", { exact: true }).fill("20.02");
      const position = await posted(page, "/financial-position", () => dialog.getByRole("button", { name: "Post Position Entry", exact: true }).click()); await dialog.waitFor({ state: "hidden" });
      await reverse("financial-position", position.id, `Reverse position entry ${position.id}`);
      await page.getByRole("tab", { name: /^Account Ledger/ }).click(); await page.getByLabel("Search account records", { exact: true }).fill(reference);
      await page.getByRole("button", { name: "Post Voucher", exact: true }).click(); dialog = page.getByRole("dialog");
      await dialog.getByLabel("Cash / Bank Account", { exact: true }).selectOption(accountId);
      await dialog.getByLabel("Party / Employee", { exact: true }).fill(reference); await dialog.getByLabel("Amount", { exact: true }).fill("1.01");
      await dialog.getByLabel("Description", { exact: true }).fill(reference);
      const voucher = await posted(page, "/account-transactions", () => dialog.getByRole("button", { name: "Post Debit Voucher", exact: true }).click()); await dialog.waitFor({ state: "hidden" });
      await reverse("account-transactions", voucher.id, `Reverse ${voucher.voucherNumber}`); await capture("vouchers");
      await signOutWorkspace(page); await page.waitForURL("**/login");
      await login(mdEmail); await page.getByRole("link", { name: "Expenses & Accounts", exact: true }).click();
      await page.getByRole("heading", { name: "Expenses & Accounts", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Post Expense", exact: true }).count(), 0); await capture("md-readonly");
      await signOutWorkspace(page); await page.waitForURL("**/login"); await login(salesEmail);
      assert.equal(await page.getByRole("link", { name: "Expenses & Accounts", exact: true }).count(), 0);
      await page.goto(`${origin}/backend/accounts`, { waitUntil: "domcontentloaded" }); await page.getByRole("heading", { name: "Access denied", exact: true }).waitFor();
      assert.deepEqual(errors, [], requests.join("\n")); await page.close(); console.log(`Persisted finance browser ${name}: expense/evidence, supplier, position, voucher and role boundaries passed.`);
    }
  } catch (error) {
    for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: "artifacts/backend/finance-failed.png", fullPage: false }).catch(() => undefined);
    throw error;
  } finally {
    await browser.close(); if (web.httpServer && "closeAllConnections" in web.httpServer) web.httpServer.closeAllConnections(); await web.close();
  }
}
