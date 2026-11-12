/// <reference lib="dom" />
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

export async function lcSplitBrowserCheck(input: { apiBase: string; peer: string; email: string; password: string; importId: string; picturedCode: string }) {
  const origin = "http://localhost:5182";
  process.env.VITE_BACKEND_MODE = "foundation";
  process.env.VITE_DEMO_MODE = "false";
  const web = await createServer({ cacheDir: "node_modules/.vite-lc-browser", server: { host: "localhost", port: 5182, strictPort: true, proxy: { "/api": { target: new URL(input.apiBase).origin, changeOrigin: true, localAddress: input.peer } } } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  await mkdir("artifacts/backend/lc-split", { recursive: true });
  try {
    await web.listen();
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      try {
        const page = await context.newPage(); page.setDefaultTimeout(25_000); const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${origin}/login`);
        await page.getByLabel("Email", { exact: true }).fill(input.email);
        await page.getByLabel("Password", { exact: true }).fill(input.password);
        await page.getByRole("button", { name: "Sign In", exact: true }).click();
        await page.waitForURL("**/backend");
        await page.goto(`${origin}/backend/imports/${input.importId}`);
        await page.getByRole("button", { name: "Edit shipment", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "LC / TT and shipment", exact: true });
        await dialog.getByLabel("Bank amount (USD)", { exact: true }).fill("800.10");
        await dialog.getByLabel("Other amount (USD)", { exact: true }).fill("200.20");
        assert.equal(await dialog.getByLabel("LC total", { exact: true }).textContent(), "1000.30");
        const capture = async (name: string) => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true, `${name} must fit ${width}px`);
          await page.screenshot({ path: `artifacts/backend/lc-split/${name}-${width}.png`, fullPage: true });
        };
        await capture("editor");
        const response = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/imports/${input.importId}` && r.request().method() === "PATCH");
        await dialog.getByRole("button", { name: "Save Changes", exact: true }).click();
        assert.equal((await response).status(), 200);
        await dialog.waitFor({ state: "hidden" });
        await page.reload();
        await page.getByRole("heading", { name: "LC / TT", exact: true }).waitFor();
        for (const value of ["1000.30", "800.10", "200.20"]) await page.getByText(value, { exact: true }).waitFor();
        await capture("saved-split");
        await page.goto(`${origin}/backend/settings?view=products`);
        await page.getByPlaceholder("Search name or reference").fill(input.picturedCode);
        const thumbnail = page.getByRole("row").filter({ hasText: input.picturedCode }).locator("img");
        await thumbnail.waitFor();
        await thumbnail.evaluate((node) => {
          const img = node as HTMLImageElement;
          return img.complete && img.naturalWidth > 0 ? Promise.resolve() : new Promise<void>((resolve, reject) => { img.addEventListener("load", () => resolve(), { once: true }); img.addEventListener("error", () => reject(new Error("Private product image did not render")), { once: true }); });
        });
        assert.equal(await thumbnail.evaluate((img) => (img as HTMLImageElement).naturalWidth), 64);
        await capture("private-image");
        assert.deepEqual(errors, []);
        console.log(`PASS live ${width}px: LC bank/other sum, API save/reload and real private product image.`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); await web.close(); }
}
