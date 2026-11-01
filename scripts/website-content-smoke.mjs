import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const webBase = process.argv[2] || process.env.SMOKE_BASE_URL || "http://localhost:5173";
const apiBase = process.argv[3] || process.env.SMOKE_API_BASE_URL || "http://localhost:4174";
const executablePath = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
].filter(Boolean).find((candidate) => existsSync(candidate));
const browser = await chromium.launch(executablePath ? { headless: true, executablePath } : { headless: true });
mkdirSync("artifacts/website-content-smoke", { recursive: true });

async function routeApi(page) {
  await page.route("**/api/**", async (route) => {
    const original = new URL(route.request().url());
    if (!original.pathname.startsWith("/api/")) return route.continue();
    const response = await route.fetch({ url: apiBase + original.pathname + original.search });
    await route.fulfill({ response });
  });
}

async function login(page, email) {
  await page.goto(webBase + "/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("**/app/dashboard", { timeout: 15_000 });
}

try {
  for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("favicon")) errors.push(message.text()); });
    await routeApi(page);

    for (const path of ["/", "/about", "/products", "/products/hollow-fiber-hemodialyzer-high-low-flux", "/certificates", "/news", "/news/bangladesh-dialysis-access-expansion", "/contact", "/login"]) {
      await page.goto(webBase + path, { waitUntil: "domcontentloaded" });
      await page.locator("h1").first().waitFor({ timeout: 15_000 });
      assert.equal(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 1), true, `${path} overflows at ${viewport.name}`);
    }

    await page.goto(webBase + "/", { waitUntil: "networkidle" });
    await page.locator("h1").waitFor();
    assert.equal(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 1), true, `Homepage overflows at ${viewport.name}`);
    assert.equal(await page.getByRole("button", { name: "Next highlight" }).count(), 1);
    await page.getByRole("button", { name: "Next highlight" }).click();
    await page.getByRole("button", { name: "Puncture & Access" }).click();
    await page.getByRole("button", { name: /Warehouse handling/ }).click();
    await page.screenshot({ path: `artifacts/website-content-smoke/home-${viewport.name}.png`, fullPage: true, animations: "disabled" });

    await page.goto(webBase + "/about", { waitUntil: "networkidle" });
    await page.screenshot({ path: `artifacts/website-content-smoke/about-${viewport.name}.png`, fullPage: true, animations: "disabled" });
    await page.goto(webBase + "/news", { waitUntil: "networkidle" });
    await page.screenshot({ path: `artifacts/website-content-smoke/news-${viewport.name}.png`, fullPage: true, animations: "disabled" });
    await page.goto(webBase + "/news/bangladesh-dialysis-access-expansion", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Key points" }).waitFor();
    await page.screenshot({ path: `artifacts/website-content-smoke/article-${viewport.name}.png`, fullPage: true, animations: "disabled" });

    await login(page, "superadmin@mipro.local");
    await page.goto(webBase + "/app/settings?view=website", { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Website Content" }).waitFor();
    await page.getByRole("tab", { name: /Public Products/ }).click();
    await page.getByRole("button", { name: "New Public Product" }).click();
    await page.getByRole("dialog", { name: "Add public product" }).waitFor();
    assert.equal(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 1), true, `Website editor overflows at ${viewport.name}`);
    await page.screenshot({ path: `artifacts/website-content-smoke/editor-${viewport.name}.png`, fullPage: false, animations: "disabled" });
    await page.getByRole("button", { name: "Close", exact: true }).click();
    assert.deepEqual(errors, [], `${viewport.name} browser errors: ${errors.join(" | ")}`);
    await page.close();
  }

  const directorPage = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await routeApi(directorPage);
  await login(directorPage, "md@mipro.local");
  await directorPage.goto(webBase + "/app/sales", { waitUntil: "networkidle" });
  await directorPage.getByText("Customer ledger", { exact: true }).waitFor();
  assert.equal(await directorPage.getByText("Could not load this workspace").count(), 0, "Managing Director Sales workspace still fails");
  await directorPage.screenshot({ path: "artifacts/website-content-smoke/managing-director-sales.png", fullPage: true, animations: "disabled" });
  await directorPage.close();
  console.log("Dynamic homepage, Super Admin website content editor, mobile layout and Managing Director Sales access passed.");
} finally {
  await browser.close();
}
