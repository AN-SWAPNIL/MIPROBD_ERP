import "../server/config.js";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

async function main() {
  const target = JSON.parse(await readFile(new URL("../artifacts/private/uat-vercel.json", import.meta.url), "utf8"));
  const origin = target.origin as string;
  if (target.projectName !== "mipro-erp" || target.supabaseProjectRef !== "njbecypawzsuqiteooly" || origin !== "https://mipro-erp.vercel.app" || process.env.SUPABASE_URL !== "https://njbecypawzsuqiteooly.supabase.co") throw new Error("UAT smoke target mismatch.");
  const health = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(45000) }); assert.equal(health.status, 200);
  const body = await health.json(); assert.equal(body.data.mode, "foundation"); assert.equal(body.data.database, "connected");
  const restricted = ["/api/me", "/api/dashboard", "/api/sales/page?kind=customers", "/api/controls/policies", "/api/payroll/runs", "/api/system/launch-checks", "/api/jobs/health", "/api/jobs/reconciliation"];
  for (const path of restricted) {
    const response: Response = await fetch(origin + path, { headers: { "x-user-role": "Super Admin" }, signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 401, `${path} denies anonymous/forged-role requests`);
  }
  const csrf = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://untrusted.example.invalid" }, body: "{}", signal: AbortSignal.timeout(30000) }); assert.equal(csrf.status, 403);
  const auth = await fetch(`${process.env.SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY! }, signal: AbortSignal.timeout(30000) }); assert.equal(auth.status, 200); assert.equal((await auth.json()).disable_signup, true);
  const browser = await chromium.launch({ channel: "msedge", headless: true }), folder = new URL("../artifacts/backend/uat/", import.meta.url); await mkdir(folder, { recursive: true });
  const captures: string[] = [];
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.setDefaultTimeout(45000);
      const errors: string[] = []; page.on("pageerror", error => errors.push(error.name));
      const capture = async (label: string) => {
        await page.waitForLoadState("networkidle");
        assert.ok(await page.locator("body").evaluate(el => el.scrollWidth <= el.clientWidth + 2), `${label} body fits ${width}px`);
        assert.ok(await page.locator("html").evaluate(el => el.scrollWidth <= el.clientWidth + 2), `${label} document fits ${width}px`);
        const missing = await page.locator("img").evaluateAll(images => images.filter(image => { const box = image.getBoundingClientRect(); return box.top < innerHeight && box.bottom > 0 && box.width > 0 && box.height > 0 && !(image as HTMLImageElement).naturalWidth; }).length);
        assert.equal(missing, 0, `${label} visible image assets load`);
        await page.screenshot({ path: new URL(`${label}-${width}.png`, folder).pathname.replace(/^\/([A-Za-z]:)/, "$1"), fullPage: true }); captures.push(`${label}-${width}`);
      };
      for (const [path, label] of [["/", "landing"], ["/products", "products"], ["/news", "news"], ["/about", "about"], ["/login", "login"]]) {
        await page.goto(origin + path, { waitUntil: "domcontentloaded" }); await page.getByRole("heading", { level: 1 }).first().waitFor();
        if (label === "login") { await page.getByLabel("Email", { exact: true }).waitFor(); assert.equal(await page.getByText("Demo Accounts", { exact: true }).count(), 0); }
        await capture(label);
        if (label === "products") {
          const href = await page.locator('a[href^="/products/"]').first().getAttribute("href"); assert.ok(href);
          await page.goto(origin + href); await page.getByRole("heading", { level: 1 }).first().waitFor(); await capture("product-detail");
        }
      }
      await page.goto(`${origin}/backend/settings/approvals`); await page.waitForURL(url => url.pathname === "/login");
      assert.deepEqual(errors, [], "No page exceptions in public/login views"); await page.close();
    }
  } finally { await browser.close(); }
  const result = { checkedAt: new Date().toISOString(), origin, project: target.projectName, mode: "foundation", databaseConnected: true, anonymousAndForgedRoleDenials: restricted.length, csrfDenied: true, publicSignupDisabled: true, desktopAnd390pxCaptures: captures, usersCreated: 0, companyDataChanged: false, authenticatedOwnerAcceptance: "Pending personal password/MFA and company configuration", productionCertified: false };
  await writeFile(new URL("../artifacts/private/uat-verification.json", import.meta.url), JSON.stringify(result, null, 2), { mode: 0o600 }); console.log(JSON.stringify(result));
}
main().catch(() => { console.error("UAT hosted smoke did not pass. No user accounts or business data were created; inspect the latest deployment and private screenshots."); process.exitCode = 1; });
