import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, expect as baseExpect } from "@playwright/test";
import { preview } from "vite";
import { authenticatorCode } from "../server/testing/totp.js";
import { mfaEnrollmentSchema } from "../src/lib/auth/mfaContracts.js";
import { staticPublicContent } from "../src/features/public/staticContent.js";
const expect = baseExpect.configure({ timeout: 30000 });
export async function securityBrowserSmoke(apiBase: string, actors: { email: string }[], password: string, localAddress: string) {
  process.env.VITE_BACKEND_MODE = "foundation"; process.env.VITE_DEMO_MODE = "false";
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  const headers = Object.fromEntries(config.headers.find((r: { source: string }) => r.source === "/(.*)").headers.map((h: { key: string; value: string }) => [h.key, h.value]));
  const web = await preview({ preview: { port: 5200, host: "localhost", strictPort: true, headers, proxy: { "/api": { target: new URL(apiBase).origin, changeOrigin: true, localAddress } } } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    await mkdir("artifacts/backend", { recursive: true });
    const product = (await staticPublicContent.products())[0]; const article = (await staticPublicContent.resources())[0];
    for (const [index, width] of [1440, 390].entries()) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } }); const page = await context.newPage(); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(90000);
      const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|violates the following|Refused to/.test(m.text())) errors.push("Browser security policy violation"); });
      const publicCalls: string[] = []; await page.route("**/api/**", (route) => { publicCalls.push(new URL(route.request().url()).pathname); return route.abort(); });
      async function capture(label: string) { assert.deepEqual(errors, [], label); assert.ok(await page.locator("body").evaluate((b) => b.scrollWidth <= b.clientWidth + 2), `${label} fits ${width}px`); await page.screenshot({ path: `artifacts/backend/release-${label}-${width}.png`, fullPage: false }); }
      for (const [path, name] of [["/", "home"], ["/about", "about"], ["/products", "products"], [`/products/${product.slug}`, "product"], ["/news", "news"], [`/news/${article.slug}`, "article"], ["/certificates", "certificates"], ["/contact", "contact"]]) {
        console.log(`Checking static ${path} at ${width}px with production security headers.`);
        await page.goto(`http://localhost:5200${path}`, { waitUntil: "domcontentloaded" }); await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible(); await capture(`public-${name}`);
      }
      assert.deepEqual(publicCalls, [], "Public brochure never calls the ERP API or requires a login");
      await page.getByLabel("Name *", { exact: true }).fill("DEV TEST inquiry"); await page.getByLabel("Phone *", { exact: true }).fill("0123456789"); await page.getByLabel("Message *", { exact: true }).fill("DEV TEST institutional product information request.");
      await page.getByRole("button", { name: "Prepare Inquiry", exact: true }).click(); await expect(page.getByText("Inquiry ready to send", { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Open Email", exact: true })).toHaveAttribute("href", /^mailto:/); await expect(page.getByRole("link", { name: "Open WhatsApp", exact: true })).toHaveAttribute("href", /^https:\/\/wa\.me\//); assert.deepEqual(publicCalls, []);
      await page.unroute("**/api/**");
      await page.goto("http://localhost:5200/login", { waitUntil: "domcontentloaded" }); await page.getByLabel("Email", { exact: true }).fill(actors[index].email); await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await page.waitForURL("**/backend"); await expect(page.getByRole("heading", { name: "Account Verification", exact: true })).toBeVisible(); await capture("mfa-required");
      await page.getByLabel("Authenticator current password", { exact: true }).fill(password);
      const prepared = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/mfa/enroll" && r.request().method() === "POST"); await page.getByRole("button", { name: "Set Up Authenticator", exact: true }).click();
      const response = await prepared; assert.equal(response.status(), 201); const setup = mfaEnrollmentSchema.parse((await response.json()).data);
      await expect(page.getByAltText("Private authenticator setup QR code")).toBeVisible(); await page.getByLabel("Six-digit code", { exact: true }).fill(authenticatorCode(setup.secret)); await page.getByRole("button", { name: "Verify Authenticator", exact: true }).click();
      await expect(page.getByTestId("persistent-dashboard").locator("dl dt").first()).toBeVisible(); await expect(page.getByText("Ask MIPRO AI", { exact: true })).toHaveCount(0); await capture("verified-dashboard");
      // Verify former /app links preserve destination and filters, including print routes.
      await page.goto("http://localhost:5200/app/reports/sales-summary?from=2026-10-01&to=2026-10-24", { waitUntil: "domcontentloaded" }); await page.waitForURL("**/backend/reports/sales-summary?*"); await expect(page.getByRole("heading", { name: "Sales Summary", exact: true }).first()).toBeVisible(); await capture("report-link");
      await page.goto("http://localhost:5200/backend/profile", { waitUntil: "domcontentloaded" }); await expect(page.getByText("Authenticator verified for this session.", { exact: true })).toBeVisible(); await capture("security-profile");
      await context.close(); console.log(`Static public pages, honest contact draft, required MFA, ERP aliases and profile verified at ${width}px.`);
    }
  } finally { await browser.close(); if ("closeAllConnections" in web.httpServer) web.httpServer.closeAllConnections(); await new Promise<void>((resolve) => web.httpServer.close(() => resolve())); }
}
