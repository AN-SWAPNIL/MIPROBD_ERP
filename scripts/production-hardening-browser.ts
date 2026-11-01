import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { build, preview } from "vite";
import { chromium, expect } from "@playwright/test";
import { openWorkspace, signOutWorkspace } from "./workspace-browser.js";

export async function prepareProductionHardeningBrowser() {
  process.env.VITE_BACKEND_MODE = "foundation"; process.env.VITE_DEMO_MODE = "false";
  const previous = process.env.NODE_ENV;
  try { await build({ logLevel: "warn", build: { outDir: "artifacts/backend/production-hardening-build", emptyOutDir: true } }); }
  finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
}
export async function productionHardeningBrowser(apiBase: string, email: string, password: string, customerId: string, productId: string, search: string, peer: string) {
  process.env.VITE_BACKEND_MODE = "foundation"; process.env.VITE_DEMO_MODE = "false";
  const origin = process.env.APP_URL!;
  assert.equal(new URL(origin).hostname, "localhost");
  const web = await preview({ logLevel: "warn", build: { outDir: "artifacts/backend/production-hardening-build" }, preview: { host: "localhost", port: Number(new URL(origin).port), strictPort: true, proxy: { "/api": { target: new URL(apiBase).origin, changeOrigin: true, localAddress: peer } } } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  await mkdir("artifacts/backend/production-hardening", { recursive: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.setDefaultTimeout(30000);
      const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
      const capture = async (name: string) => {
        await page.waitForLoadState("networkidle");
        assert.ok(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 2), `${name} must fit ${width}px`);
        await page.screenshot({ path: `artifacts/backend/production-hardening/${name}-${width}.png`, fullPage: await page.getByRole("dialog").count() === 0 });
      };
      try {
        await page.goto(origin + "/login", { waitUntil: "domcontentloaded" });
        await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password);
        await page.getByRole("button", { name: "Sign In", exact: true }).click(); await page.waitForURL("**/backend");
        await openWorkspace(page, "Sales"); await page.getByRole("heading", { name: "Customers", exact: true }).waitFor();
        await page.getByText(/records \| Page 1 of/).waitFor();
        const bodyRows = page.locator("tbody tr"); assert.ok((await bodyRows.count()) <= 25);
        const first = await bodyRows.first().innerText();
        await page.getByRole("button", { name: "Next page", exact: true }).click();
        await page.getByText(/records \| Page 2 of/).waitFor(); assert.notEqual(await bodyRows.first().innerText(), first);
        await capture("sales-customers");
        await page.getByRole("tab", { name: "Quotations & Orders", exact: true }).click();
        for (const register of ["Quotations", "Orders", "Invoices"]) {
          await page.getByRole("tab", { name: register, exact: true }).click(); await page.getByRole("heading", { name: register === "Orders" ? "Sales orders" : register === "Invoices" ? "Sales invoices" : register, exact: true }).waitFor();
          await page.getByText(/records \| Page 1 of/).waitFor(); await capture(`sales-${register.toLowerCase()}`);
        }
        await page.getByRole("button", { name: "New Quotation", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("Search Customer", { exact: true }).fill(search);
        await dialog.getByLabel("Customer", { exact: true }).locator(`option[value="${customerId}"]`).waitFor({ state: "attached" });
        await dialog.getByLabel("Customer", { exact: true }).selectOption(customerId);
        await dialog.getByLabel("Search Product variant", { exact: true }).fill(search);
        await dialog.getByLabel("Product variant", { exact: true }).locator(`option[value="${productId}"]`).waitFor({ state: "attached" });
        await dialog.getByLabel("Product variant", { exact: true }).selectOption(productId);
        await expect(dialog.getByLabel("Product variant", { exact: true })).toBeEnabled();
        await expect(dialog.getByLabel("Product variant", { exact: true })).toHaveValue(productId);
        await capture("quotation-pickers");
        const saved = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/quotations" && response.request().method() === "POST");
        await dialog.getByRole("button", { name: "Save Quotation", exact: true }).click();
        const response = await saved; assert.ok(response.ok(), "The paged quotation form must save"); const quote = (await response.json()).data;
        await dialog.waitFor({ state: "hidden" });
        const quoteRow = page.getByRole("row").filter({ hasText: quote.quotationNumber });
        await quoteRow.getByRole("button", { name: "Print Preview", exact: true }).click();
        await page.locator(".letterhead-sheet:visible").first().waitFor();
        for (const mode of ["With Background", "Without Background"]) { await page.getByRole("tab", { name: mode, exact: true }).click(); await capture(mode === "With Background" ? "quotation-digital" : "quotation-preprinted"); }
        await page.goto(origin + "/backend/sales?view=orders");
        await page.getByRole("row").filter({ hasText: quote.quotationNumber }).getByRole("button", { name: "Convert", exact: true }).click();
        const conversion = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/quotations/${quote.id}/convert` && r.request().method() === "POST");
        await page.getByRole("dialog").getByLabel("Delivery Instruction", { exact: true }).fill("DEV TEST rollback-only receiving desk");
        await page.getByRole("dialog").getByRole("button", { name: "Create Sales Order", exact: true }).click();
        const converted = await conversion; assert.ok(converted.ok()); const order = (await converted.json()).data;
        await page.getByRole("button", { name: order.orderNumber, exact: true }).click();
        await page.getByTestId("sales-order-workspace").waitFor(); await capture("converted-order");
        await page.getByRole("button", { name: "Back to Sales", exact: true }).click();
        await page.getByRole("tab", { name: "Collections", exact: true }).click(); await page.getByText(/records \| Page 1 of/).waitFor();
        await page.getByRole("button", { name: "Record Collection", exact: true }).click();
        await page.getByRole("dialog").getByLabel("Customer", { exact: true }).waitFor(); await capture("collection-pickers");
        await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
        await openWorkspace(page, "Settings"); await page.getByRole("button", { name: "Launch Checks", exact: true }).click();
        await page.getByRole("heading", { name: "Release checklist", exact: true }).waitFor();
        await page.getByRole("heading", { name: "Clean company environment", exact: true }).waitFor(); await capture("launch-checks");
        assert.deepEqual(errors, []); await signOutWorkspace(page); await page.waitForURL("**/login");
      } catch (error) { await capture("failed").catch(() => undefined); throw error; }
      finally { await page.close(); }
    }
    console.log("Built frontend passes 1440px/390px login, paged registers/selectors, saved quotation/order conversion, both prints and launch checks; synthetic business records roll back.");
  } finally {
    await browser.close();
    if ("closeAllConnections" in web.httpServer) web.httpServer.closeAllConnections();
    await new Promise<void>((resolve) => web.httpServer.close(() => resolve()));
  }
}
