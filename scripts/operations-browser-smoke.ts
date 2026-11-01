import { openWorkspace, signOutWorkspace } from "./workspace-browser.js";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { businessDate } from "../src/lib/date.js";

export async function operationsBrowserSmoke(apiBase: string, email: string, password: string, importId: string, warehouseEmail: string, receivingImportId?: string, localAddress?: string) {
  process.env.VITE_BACKEND_MODE = "foundation";
  process.env.VITE_DEMO_MODE = "false";
  const origin = process.env.BACKEND_BROWSER_WEB_URL ?? process.env.APP_URL ?? "http://localhost:5173";
  if (new URL(origin).hostname !== "localhost") throw new Error("Use a local development origin for this test.");
  const web = process.env.BACKEND_BROWSER_WEB_URL ? null : await createServer({ cacheDir: "node_modules/.vite-backend-operations-test", server: { port: Number(new URL(origin).port), host: "localhost", strictPort: true, proxy: { "/api": { target: new URL(apiBase).origin, changeOrigin: true, localAddress } } } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    await web?.listen(); await mkdir("artifacts/backend", { recursive: true });
    for (const [name, width] of [["desktop", 1440], ["mobile", 390]] as const) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.setDefaultTimeout(12000);
      page.setDefaultNavigationTimeout(20000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => { if (response.url().includes("/api/") && response.status() >= 400) { const error = `${response.status()} ${new URL(response.url()).pathname}`; errors.push(error); console.error(error); } });
      async function login(userEmail: string) {
        if (new URL(page.url()).pathname !== "/login") await page.goto(origin + "/login");
        await page.getByLabel("Email", { exact: true }).fill(userEmail);
        await page.getByLabel("Password", { exact: true }).fill(password);
        await page.getByRole("button", { name: "Sign In", exact: true }).click();
        await page.waitForURL("**/backend", { timeout: 30000 });
        await page.getByTestId("persistent-dashboard").waitFor();
      }
      async function capture(label: string) {
        assert.equal(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 2), true, `${label} must fit ${width}px`);
        await page.screenshot({ path: `artifacts/backend/operations-${label}-${name}.png`, fullPage: true });
      }
      await login(email);
      await openWorkspace(page, "Settings");
      await page.getByPlaceholder("Search name or reference").fill("DEV TEST");
      await page.getByRole("button", { name: /^Edit DEV TEST Dialyzer A/ }).last().waitFor();
      await capture("masters");
      await page.getByRole("button", { name: /^Edit DEV TEST Dialyzer A/ }).last().click();
      await page.getByLabel("Product code", { exact: true }).waitFor();
      await capture("product-editor");
      assert.equal(await page.locator("form").evaluate((form) => (form as unknown as { checkValidity: () => boolean }).checkValidity()), true, "Product form must be valid before saving");
      const [saved] = await Promise.all([
        page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes("/api/products/"), { timeout: 35000 }),
        page.getByRole("button", { name: "Save", exact: true }).click()
      ]);
      assert.equal(saved.status(), 200, "Product save should succeed");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      console.log(`Browser ${name}: product saved, opening imports`);
      await openWorkspace(page, "Imports");
      await page.getByRole("heading", { name: "Imports", exact: true }).waitFor();
      await capture("imports");
      console.log(`Browser ${name}: import register loaded`);
      await page.goto(`${origin}/backend/imports/${importId}`);
      await page.getByText("5. Landed-Cost Result", { exact: true }).waitFor();
      await page.getByText("DEV TEST Supplier", { exact: false }).first().waitFor();
      await capture("costing");
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByText("DEV TEST Supplier", { exact: false }).first().waitFor();
      await openWorkspace(page, "Inventory");
      await page.getByRole("heading", { name: "Inventory", exact: true }).waitFor();
      await page.getByPlaceholder("Search inventory").fill("DEV TEST");
      await page.getByText("Available stock", { exact: true }).waitFor();
      await capture("stock");
      await page.getByRole("tab", { name: /^Batches/ }).click();
      await page.getByText("Batch register", { exact: true }).waitFor();
      await capture("batches");
      await signOutWorkspace(page);
      await page.waitForURL("**/login");
      await login(warehouseEmail);
      assert.equal(await page.getByRole("link", { name: "Settings", exact: true }).count(), 0);
      // Use SPA navigation, not page.goto: a reload would conceal identity-cache leaks.
      const stockLoaded = page.waitForResponse((response) => response.url().includes("/api/inventory/stock") && response.status() === 200);
      await openWorkspace(page, "Inventory");
      await stockLoaded;
      await page.getByText("Expiry attention", { exact: true }).waitFor();
      assert.equal(await page.getByText("Inventory valuation", { exact: true }).count(), 0);
      await capture("warehouse-stock");
      await openWorkspace(page, "Imports");
      await page.getByRole("heading", { name: "Imports", exact: true }).waitFor();
      await page.goto(`${origin}/backend/settings`);
      await page.getByRole("heading", { name: "Access denied", exact: true }).waitFor();
      await page.goto(`${origin}/backend/imports/${importId}`);
      await page.getByText("DEV TEST Supplier", { exact: false }).first().waitFor();
      assert.equal(await page.getByRole("button", { name: "Finalize Snapshot", exact: true }).count(), 0);
      await capture("warehouse");
      if (receivingImportId) {
        await page.goto(`${origin}/backend/imports/${receivingImportId}`);
        await page.getByRole("button", { name: "Receive to Warehouse", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Receive to warehouse", exact: true });
        const line = dialog.locator("fieldset").first();
        const warehouse = line.getByLabel("Warehouse", { exact: true });
        await warehouse.waitFor(); assert.equal(await warehouse.inputValue(), "Main Warehouse");
        assert.equal(await warehouse.getAttribute("readonly"), "", "Warehouse identity is inherited, not freely editable");
        await line.getByLabel("Received Qty", { exact: true }).fill("1");
        await line.getByLabel("Lot Number", { exact: true }).fill(`DEV-TEST-UI-LOT-${name}`);
        await line.getByLabel("Batch Number", { exact: true }).fill(`DEV-TEST-UI-${name}-${Date.now()}`);
        const manufactured = new Date(businessDate() + "T00:00:00Z"); manufactured.setUTCDate(manufactured.getUTCDate() - 1);
        const expiry = new Date(businessDate() + "T00:00:00Z"); expiry.setUTCFullYear(expiry.getUTCFullYear() + 2);
        await line.getByLabel("Manufacturing Date", { exact: true }).fill(manufactured.toISOString().slice(0, 10));
        await line.getByLabel("Expiry Date", { exact: true }).fill(expiry.toISOString().slice(0, 10));
        await line.getByLabel("BIN / Rack Location", { exact: true }).fill("DEV-TEST-BIN");
        await capture("receiving-form");
        const posted = page.waitForResponse((r) => r.url().endsWith(`/imports/${receivingImportId}/receive`) && r.request().method() === "POST", { timeout: 35000 });
        await dialog.getByRole("button", { name: "Post Warehouse Receipt", exact: true }).click();
        assert.equal((await posted).status(), 201); await dialog.waitFor({ state: "hidden" }); await capture("received");
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log("Persisted import/master/inventory browser checks passed at desktop and 390px, including warehouse direct-URL denial.");
  } catch (error) {
    for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: "artifacts/backend/operations-failed.png", fullPage: true }).catch(() => undefined);
    console.error("Operations browser check failed:", error instanceof Error ? error.message : "Unknown browser failure");
    throw error;
  } finally {
    await browser.close();
    if (web?.httpServer && "closeAllConnections" in web.httpServer) web.httpServer.closeAllConnections();
    await web?.close();
  }
}
