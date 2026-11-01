import { openWorkspace, signOutWorkspace } from "./workspace-browser.js";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect as baseExpect } from "@playwright/test";
import { createServer } from "vite";
import type { Role } from "../src/types/index.js";
const expect = baseExpect.configure({ timeout: 30000 });

export async function dashboardBrowserSmoke(apiBase: string, actors: { email: string; role: Role }[], password: string, localAddress?: string) {
  process.env.VITE_BACKEND_MODE = "foundation"; process.env.VITE_DEMO_MODE = "false";
  const web = await createServer({ cacheDir: "node_modules/.vite-dashboard-test", server: { port: 5198, host: "localhost", strictPort: true, proxy: { "/api": { target: new URL(apiBase).origin, changeOrigin: true, localAddress } } } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    await web.listen(); await mkdir("artifacts/backend", { recursive: true });
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await context.newPage(); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(90000);
      const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => { const path = new URL(response.url()).pathname; if (path.startsWith("/api/") && response.status() >= 400) errors.push(`${response.status()} ${path}`); });
      const capture = async (label: string) => {
        assert.deepEqual(errors, [], label); assert.ok(await page.locator("body").evaluate((b) => b.scrollWidth <= b.clientWidth + 2), `${label} fits ${width}px`);
        await page.screenshot({ path: `artifacts/backend/dashboard-${label}-${width}.png`, fullPage: true });
      };
      for (const actor of actors) {
        await page.goto("http://localhost:5198/login", { waitUntil: "networkidle" });
        await page.getByLabel("Email", { exact: true }).fill(actor.email); await page.getByLabel("Password", { exact: true }).fill(password);
        await page.getByRole("button", { name: "Sign In", exact: true }).click(); await page.waitForURL("**/backend");
        await expect(page.getByTestId("persistent-dashboard").locator("dl dt").first()).toBeVisible();
        await capture(actor.role.toLowerCase().replaceAll(" ", "-"));
        if (actor.role === "Warehouse Manager" || actor.role === "Import Officer") await expect(page.getByTestId("dashboard-trend")).toHaveCount(0);
        else await expect(page.getByTestId("dashboard-trend").getByRole("application")).toBeVisible();
        if (actor.role === "Super Admin") {
          await openWorkspace(page, "Settings");
          await page.getByRole("button", { name: "Operational Settings", exact: true }).click();
          await expect(page.getByLabel("Contact Person", { exact: true })).toBeVisible(); await capture("warehouse-settings");
          await page.getByRole("tab", { name: "Cost Presets", exact: true }).click(); await expect(page.getByRole("button", { name: "Add Preset", exact: true })).toBeVisible();
          await page.getByRole("button", { name: "Add Preset", exact: true }).click(); const dialog = page.getByRole("dialog", { name: "New Cost Preset", exact: true });
          const name = `DEV TEST browser freight ${width} ${Date.now()}`;
          await dialog.getByLabel("Preset name", { exact: true }).fill(name); await dialog.getByLabel("Suggested Allocation Basis", { exact: true }).selectOption("CBM");
          await dialog.getByLabel("Reason for Change", { exact: true }).fill("DEV TEST browser preset creation"); await dialog.getByRole("button", { name: "Save Changes", exact: true }).click();
          const row = page.getByRole("row").filter({ hasText: name }); await expect(row).toBeVisible(); await capture("cost-presets");
          await row.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
          const edit = page.getByRole("dialog", { name: "Edit Cost Preset", exact: true }); await edit.getByLabel("Active", { exact: true }).uncheck(); await edit.getByLabel("Reason for Change", { exact: true }).fill("DEV TEST deactivate reserved browser preset"); await edit.getByRole("button", { name: "Save Changes", exact: true }).click();
          await expect(row).toContainText("Inactive");
          await page.getByRole("tab", { name: "Client Confirmation Queue", exact: true }).click(); await expect(page.getByRole("heading", { name: "Opening balances and cutover", exact: true })).toBeVisible(); await capture("client-decisions");
        }
        await signOutWorkspace(page);
      }
      await context.close(); console.log(`Dashboard/settings browser QA passed at ${width}px for all seven roles.`);
    }
  } catch (error) { for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: "artifacts/backend/dashboard-failed.png", fullPage: true }).catch(() => undefined); throw error; }
  finally { await browser.close(); if (web.httpServer && "closeAllConnections" in web.httpServer) web.httpServer.closeAllConnections(); await web.close(); }
}
