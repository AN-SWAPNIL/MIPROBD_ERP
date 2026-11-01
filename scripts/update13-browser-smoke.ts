import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium, expect as baseExpect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { hostedHarness } from "../server/testing/hosted.js";
import { navSections } from "../src/lib/permissions/matrix.js";
import { canAccessEmployeeHub, hasEffectivePermission } from "../src/lib/permissions/effectiveAccess.js";
import { employees } from "../database/schema.js";
import { eq } from "drizzle-orm";
import { toUser } from "../server/foundation/context.js";
const expect = baseExpect.configure({ timeout: 30000 });

async function main() {
  process.env.APP_URL = "http://localhost:5198"; process.env.VITE_BACKEND_MODE = "foundation"; process.env.VITE_DEMO_MODE = "false";
  const h = await hostedHarness("update13-browser");
  const web = await createServer({ cacheDir: "node_modules/.vite-update13-test", server: { port: 5198, host: "localhost", strictPort: true, proxy: { "/api": { target: new URL(h.bases[0]).origin, changeOrigin: true, localAddress: h.peer } } } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    await web.listen(); await mkdir("artifacts/backend/update13", { recursive: true });
    const admin = await h.employee("Super Admin", ["view_sensitive_cost"]);
    const login = async (page: Page, email: string) => { await page.goto("http://localhost:5198/login"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(h.password); await page.getByRole("button", { name: "Sign In", exact: true }).click(); await page.waitForURL("**/backend"); await expect(page.getByTestId("persistent-dashboard")).toBeVisible(); };
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(60000);
      const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => { if (new URL(response.url()).pathname.startsWith("/api/") && response.status() >= 400) { const failure = `${response.status()} ${new URL(response.url()).pathname}`; errors.push(failure); console.log("Browser API failure:", failure); } });
      const capture = async (name: string) => { await expect(page.locator("main h1").first()).toBeVisible(); await expect(page.getByText("Loading data", { exact: true })).toHaveCount(0); await expect(page.getByText("Could not load this workspace", { exact: true })).toHaveCount(0); assert.deepEqual(errors, [], name); assert.ok(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 2), `${name} fits ${width}px`); await page.screenshot({ path: `artifacts/backend/update13/${name}-${width}.png`, fullPage: true }); console.log(`Browser verified ${name} at ${width}px.`); };
      await login(page, admin.email); await capture("dashboard");
      if (width === 390) { await page.getByRole("button", { name: "Open navigation", exact: true }).click(); await expect(page.locator("nav:visible")).toBeVisible(); await page.keyboard.press("Escape"); await expect(page.locator("nav:visible")).toHaveCount(0); }
      await page.goto("http://localhost:5198/backend/inventory"); await expect(page.getByText("Stock by product", { exact: true })).toBeVisible(); await expect(page.getByText("Loading workspace")).toHaveCount(0); await capture("inventory-stock");
      await page.getByRole("tab", { name: "Batches", exact: true }).click(); await expect(page.getByText("Batch register", { exact: true })).toBeVisible(); await capture("inventory-batches");
      await page.getByLabel("Search inventory", { exact: true }).fill(h.suffix); await expect(page.getByText("No inventory matches these filters.")).toBeVisible(); await page.getByLabel("Search inventory", { exact: true }).fill("");
      await page.getByRole("tab", { name: "Movements", exact: true }).click(); await expect(page.getByText("Stock movement journal", { exact: true })).toBeVisible(); await capture("inventory-movements");
      await page.goto("http://localhost:5198/backend/employees/invitations"); await expect(page.getByRole("heading", { name: "Invitation Delivery", exact: true })).toBeVisible(); await capture("invitation-queue");
      await page.goto("http://localhost:5198/backend/settings/opening"); await expect(page.getByRole("heading", { name: "Opening Data", exact: true })).toBeVisible(); await capture("opening-list");
      const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("DEV TEST Source"); sheet.getCell("A1").value = `DEV TEST ${width} ${h.suffix}`; sheet.getCell("B7").value = 3;
      const completed = page.waitForResponse((r) => /\/api\/opening\/sources\/[^/]+\/complete$/.test(new URL(r.url()).pathname));
      await page.getByLabel("Upload opening workbook", { exact: true }).setInputFiles({ name: `DEV TEST ${width}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(await workbook.xlsx.writeBuffer()) });
      assert.equal((await completed).status(), 200); await expect(page.getByRole("button", { name: "Prepare Opening Draft", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Inspect Source Cells", exact: true }).click(); await expect(page.getByRole("cell", { name: "B7", exact: true })).toBeVisible(); await capture("opening-source");
      await page.getByRole("button", { name: "Prepare Opening Draft", exact: true }).click(); await page.waitForURL("**/backend/settings/opening/*");
      await page.getByRole("button", { name: "Validate", exact: true }).click(); await expect(page.getByText(/validation issues$/)).toBeVisible(); await capture("opening-validation");
      await page.getByRole("button", { name: "Edit opening line 1", exact: true }).click(); await expect(page.getByText("Opening Position", { exact: true })).toBeVisible(); await page.getByLabel("Find ERP master", { exact: true }).fill("DEV TEST"); await capture("opening-editor"); await page.getByRole("dialog", { name: "Opening Position" }).getByRole("button", { name: "Close", exact: true }).click();
      for (const [path, label] of [["imports", "imports"], ["sales", "sales"], ["accounts", "accounts"], ["reports", "reports"], ["employees", "employees"], ["settings", "settings"]]) { await page.goto(`http://localhost:5198/backend/${path}`); await capture(label); }
      await page.getByRole("button", { name: "Account menu", exact: true }).click(); await page.getByRole("button", { name: "Profile & settings", exact: true }).click(); await expect(page.getByRole("heading", { name: "Profile & Security Settings", exact: true })).toBeVisible(); await capture("profile");
      await page.getByRole("button", { name: "Account menu", exact: true }).click(); await page.getByRole("button", { name: "Sign out", exact: true }).last().click(); await page.waitForURL("**/login"); await page.close();
      console.log(`Verified real login, shared navigation, source upload/review, inventory and ERP routes at ${width}px.`);
    }
    for (const role of ["Managing Director", "Import Officer", "Warehouse Manager", "Accounts", "Sales Manager", "Sales Executive"] as const) {
      const actor = await h.employee(role); const [record] = await h.ctx.db.select().from(employees).where(eq(employees.id, actor.id)); const user = toUser(record);
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); await login(page, actor.email);
      const expected = navSections.flatMap((s) => s.items).filter((item) => item.path === "/app/settings" ? ["products", "suppliers", "settings", "accounts"].some((p) => hasEffectivePermission(user, p as "products" | "suppliers" | "settings" | "accounts")) : item.path === "/app/employees" ? canAccessEmployeeHub(user) : item.path === "/app/sales" ? hasEffectivePermission(user, "sales") || hasEffectivePermission(user, "marketing") : hasEffectivePermission(user, item.permission));
      assert.equal(await page.locator("nav:visible a").count(), expected.length);
      for (const item of expected) await expect(page.locator("nav:visible").getByRole("link", { name: item.label, exact: true })).toBeVisible();
      if (!hasEffectivePermission(user, "inventory")) { await page.goto("http://localhost:5198/backend/inventory"); await expect(page.getByRole("heading", { name: /Access/i })).toBeVisible(); }
      await page.close(); console.log(`Verified ${role} navigation and direct-route boundary.`);
    }
  } finally { await browser.close(); await web.close(); await h.close(); }
}
main().catch((error) => { const first = String(error?.message ?? "Verification failed").split("\n").slice(0, 5).join(" ").replace(/https?:\/\/\S+/g, "[URL]").replace(/T![a-f0-9]+/g, "[TEST PASSWORD]"); console.error("Update 13 browser verification failed", { name: error?.name, first }); process.exitCode = 1; });
