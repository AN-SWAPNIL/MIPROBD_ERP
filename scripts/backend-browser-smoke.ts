import { openWorkspace, signOutWorkspace } from "./workspace-browser.js";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

export async function backendBrowserSmoke(apiBase: string, email: string, password: string) {
  process.env.VITE_BACKEND_MODE = "foundation";
  process.env.VITE_DEMO_MODE = "false";
  const origin = process.env.APP_URL ?? "http://localhost:5173";
  const port = Number(new URL(origin).port || 80);
  const web = await createServer({ server: { port, host: "localhost", strictPort: true, proxy: { "/api": { target: new URL(apiBase).origin, changeOrigin: true } } } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    await web.listen();
    await mkdir("artifacts/backend", { recursive: true });
    for (const [name, width] of [["desktop", 1440], ["mobile", 390]] as const) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin + "/login");
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await page.waitForURL("**/backend", { timeout: 20000 });
      await page.getByTestId("persistent-dashboard").waitFor();
      assert.equal(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 2), true);
      await page.screenshot({ path: `artifacts/backend/foundation-${name}.png`, fullPage: true });
      await openWorkspace(page, "Profile & Security");
      await page.getByRole("heading", { name: "Profile & Security Settings" }).waitFor();
      await page.getByLabel("Full Name", { exact: true }).fill(`Backend Browser ${name}`);
      await page.getByRole("button", { name: "Save Profile", exact: true }).click();
      await page.getByText("Profile saved", { exact: true }).waitFor();
      await page.reload();
      await page.getByRole("heading", { name: "Profile & Security Settings" }).waitFor();
      assert.equal(await page.getByLabel("Full Name", { exact: true }).inputValue(), `Backend Browser ${name}`);
      await page.screenshot({ path: `artifacts/backend/profile-${name}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      await signOutWorkspace(page);
      await page.waitForURL("**/login");
      await page.close();
    }
    console.log("Real backend browser login/profile/reload/logout passed at desktop and 390px widths.");
  } finally { await browser.close(); await web.close(); }
}
