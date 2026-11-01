import { openWorkspace, signOutWorkspace } from "./workspace-browser.js";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium, type Page } from "@playwright/test";

export async function salesBackendBrowserSmoke(apiBase: string, email: string, password: string, productId: string, accountId: string, suffix: string, onCustomer: (id: string) => void) {
  process.env.VITE_BACKEND_MODE = "foundation";
  process.env.VITE_DEMO_MODE = "false";
  const origin = process.env.APP_URL ?? "http://localhost:5187";
  if (new URL(origin).hostname !== "localhost") throw new Error("Use a local development origin for this test.");
  const web = await createServer({ cacheDir: "node_modules/.vite-backend-sales-test", server: { port: Number(new URL(origin).port), host: "localhost", strictPort: true, proxy: { "/api": { target: new URL(apiBase).origin, changeOrigin: true } } } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  async function posted(page: Page, path: string, action: () => Promise<unknown>) {
    const pending = page.waitForResponse((response) => new URL(response.url()).pathname === `/api${path}` && response.request().method() === "POST", { timeout: 35000 });
    await action(); const response = await pending;
    const json = await response.json(); assert.equal(response.ok(), true, `${path}: ${json.message}`); return json.data;
  }
  try {
    await web.listen(); await mkdir("artifacts/backend", { recursive: true });
    const viewports = process.env.BACKEND_BROWSER_ONLY_MOBILE === "true" ? [["mobile", 390]] as const : [["desktop", 1440], ["mobile", 390]] as const;
    for (const [name, width] of viewports) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(45000);
      const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => { if (response.url().includes("/api/") && response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
      async function capture(label: string) {
        assert.equal(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 2), true, `${label} must fit ${width}px`);
        assert.equal(await page.getByText(/NaN|undefined BDT/).count(), 0);
        await page.screenshot({ path: `artifacts/backend/sales-${label}-${name}.png`, fullPage: true });
      }
      await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
      await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign In", exact: true }).click(); await page.waitForURL("**/backend", { timeout: 30000 });
      await openWorkspace(page, "Sales");
      await page.getByRole("button", { name: "New Customer", exact: true }).click();
      let dialog = page.getByRole("dialog");
      const customerName = `DEV TEST Browser ${name} ${suffix}`;
      await dialog.getByLabel("Customer / Organization", { exact: true }).fill(customerName);
      await dialog.getByLabel("Contact Person", { exact: true }).fill("Test receiving officer");
      await dialog.getByLabel("Phone", { exact: true }).fill("01234567890");
      await dialog.getByLabel("Address", { exact: true }).fill("Test hospital receiving desk");
      const customer = await posted(page, "/customers", () => dialog.getByRole("button", { name: "Save Customer", exact: true }).click()); onCustomer(customer.id);
      await dialog.waitFor({ state: "hidden" });
      await page.getByLabel("Search sales records", { exact: true }).fill(customerName);
      await page.getByRole("button", { name: `Create quotation for ${customerName}`, exact: true }).click();
      dialog = page.getByRole("dialog");
      await dialog.getByLabel("Search Product variant", { exact: true }).fill(suffix);
      await dialog.getByLabel("Product variant", { exact: true }).locator(`option[value="${productId}"]`).waitFor({ state: "attached" });
      await dialog.getByLabel("Product variant", { exact: true }).selectOption(productId);
      await dialog.getByLabel("Quantity", { exact: true }).fill("0.3");
      await dialog.getByLabel("Unit price", { exact: true }).fill("12.34");
      await dialog.getByLabel("Discount", { exact: true }).fill("0.01");
      await capture("quotation");
      const quote = await posted(page, "/quotations", () => dialog.getByRole("button", { name: "Save Quotation", exact: true }).click());
      assert.equal(quote.total, "3.69"); await dialog.waitFor({ state: "hidden" });
      const quoteRow = page.getByRole("row").filter({ hasText: quote.quotationNumber });
      await quoteRow.getByRole("button", { name: "Convert", exact: true }).click();
      dialog = page.getByRole("dialog"); await dialog.getByLabel("Delivery Instruction", { exact: true }).fill("Deliver to test receiving desk");
      const order = await posted(page, `/quotations/${quote.id}/convert`, () => dialog.getByRole("button", { name: "Create Sales Order", exact: true }).click());
      await dialog.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: order.orderNumber, exact: true }).click();
      await page.getByTestId("sales-order-workspace").waitFor();
      await page.getByRole("button", { name: "New Delivery", exact: true }).click();
      dialog = page.getByRole("dialog"); await dialog.getByLabel(/Delivery Qty/).fill("0.1");
      const delivery = await posted(page, "/deliveries", () => dialog.getByRole("button", { name: "Validate FIFO & Dispatch", exact: true }).click());
      await dialog.waitFor({ state: "hidden" }); assert.equal(delivery.lines[0].quantity, "0.1000");
      await page.getByRole("button", { name: "New Delivery", exact: true }).click();
      dialog = page.getByRole("dialog");
      assert.equal(await dialog.getByLabel(/Delivery Qty/).inputValue(), "0.2000", "Partial quantity must not inherit binary floating-point noise");
      await posted(page, "/deliveries", () => dialog.getByRole("button", { name: "Validate FIFO & Dispatch", exact: true }).click());
      await dialog.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Create Invoice", exact: true }).click();
      dialog = page.getByRole("dialog"); await dialog.getByRole("checkbox").first().check();
      const invoice = await posted(page, "/invoices", () => dialog.getByRole("button", { name: "Create Draft Invoice", exact: true }).click());
      await dialog.waitFor({ state: "hidden" }); assert.equal(invoice.total, "3.69");
      await posted(page, `/invoices/${invoice.id}/approve`, () => page.getByRole("button", { name: "Approve", exact: true }).click());
      await page.getByRole("button", { name: "Record Collection", exact: true }).click();
      dialog = page.getByRole("dialog");
      await dialog.getByLabel("Search Deposit Account", { exact: true }).fill(suffix);
      await dialog.getByLabel("Deposit Account", { exact: true }).locator(`option[value="${accountId}"]`).waitFor({ state: "attached" });
      await dialog.getByLabel("Deposit Account", { exact: true }).selectOption(accountId);
      await dialog.getByLabel("Amount", { exact: true }).fill("3.69");
      await dialog.getByLabel("Payment Reference", { exact: true }).fill("TEST BROWSER");
      const receipt = await posted(page, "/collections", () => dialog.getByRole("button", { name: "Post Collection", exact: true }).click());
      await dialog.waitFor({ state: "hidden" }); assert.equal(receipt.amount, "3.69");
      await page.getByRole("button", { name: "Record Collection", exact: true }).waitFor({ state: "hidden" });
      await capture("order-paid");
      await page.getByRole("button", { name: "Back to Sales", exact: true }).click();
      await page.getByRole("tab", { name: /^Collections/ }).click();
      await page.getByLabel("Search sales records", { exact: true }).fill(receipt.receiptNumber);
      await page.getByRole("row").filter({ hasText: receipt.receiptNumber }).getByRole("button", { name: "Reverse Receipt", exact: true }).click();
      dialog = page.getByRole("dialog"); await dialog.getByLabel("Cancellation Reason", { exact: true }).fill("Browser test receipt reversal");
      await posted(page, `/collections/${receipt.id}/reverse`, () => dialog.getByRole("button", { name: "Reverse Receipt", exact: true }).click());
      await dialog.waitFor({ state: "hidden" });
      await page.getByRole("row").filter({ hasText: receipt.receiptNumber }).getByText("Reversed", { exact: true }).waitFor();
      await capture("receipt-reversed");
      await signOutWorkspace(page); await page.waitForURL("**/login");
      assert.deepEqual(errors, []); await page.close();
      console.log(`Persisted sales browser ${name}: quotation to collection and reversal passed.`);
    }
  } catch (error) {
    for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: "artifacts/backend/sales-failed.png", fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    await browser.close();
    if (web.httpServer && "closeAllConnections" in web.httpServer) web.httpServer.closeAllConnections();
    await web.close();
  }
}
