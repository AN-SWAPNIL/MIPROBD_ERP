import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.env.PUBLIC_TEST_BASE_URL || "http://localhost:5176";
const systemBrowsers = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
].filter(Boolean);
const executablePath = systemBrowsers.find((candidate) => existsSync(candidate));
const browser = await chromium.launch(executablePath ? { headless: true, executablePath } : { headless: true });
mkdirSync("artifacts/public-smoke", { recursive: true });

try {
  for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("favicon")) errors.push(message.text()); });

    for (const path of ["/", "/about", "/products", "/products/hollow-fiber-hemodialyzer-high-low-flux", "/certificates", "/news", "/news/bangladesh-dialysis-access-expansion", "/contact", "/login"]) {
      await page.goto(base + path, { waitUntil: "domcontentloaded" });
      await page.locator("h1").waitFor({ timeout: 15_000 });
      assert.equal(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 1), true, `${path} overflows at ${viewport.name}`);
    }

    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    if (viewport.name === "mobile") {
      await page.getByRole("button", { name: "Open menu" }).click();
      await page.getByRole("link", { name: "Products", exact: true }).click();
    } else {
      await page.getByRole("navigation", { name: "Corporate navigation" }).getByRole("link", { name: "Products", exact: true }).click();
    }
    await page.waitForURL("**/products");
    await page.getByPlaceholder("Search by product or category").fill("dialyzer");
    await page.waitForTimeout(200);
    assert.match(await page.locator("main").innerText(), /Hollow Fiber Hemodialyzer/);

    await page.goto(base + "/certificates", { waitUntil: "domcontentloaded" });
    await page.getByText("UKCA Type Examination Certificate UKCA 753355").waitFor({ timeout: 15_000 });
    assert.equal(await page.getByRole("button", { name: "Preview scan" }).count(), 4, "Expected four published certificate scans");
    assert.match(await page.locator("main").innerText(), /Current on the visible document date/);
    assert.match(await page.locator("main").innerText(), /Expired on the visible document date/);
    await page.getByRole("button", { name: "Preview scan" }).first().click();
    await page.getByRole("dialog", { name: /preview$/ }).waitFor();
    await page.getByRole("button", { name: "Close certificate preview" }).click();
    if (viewport.name === "desktop") {
      for (const asset of [
        "/certificates/jiangxi-hongda-ec-certificate-g1-044803-0031.jpg",
        "/certificates/jiangxi-hongda-russia-registration-certificate.jpg",
        "/certificates/jiangxi-hongda-ukca-nitrile-gloves-certificate.jpg",
        "/certificates/jiangxi-hongda-who-pqs-auto-disable-syringe.jpg"
      ]) {
        const response = await page.request.get(base + asset);
        assert.equal(response.ok(), true, `${asset} was not served`);
        assert.match(response.headers()["content-type"] ?? "", /image\/jpeg/);
      }
    }

    await page.goto(base + "/contact?product=Hollow%20Fiber%20Hemodialyzer", { waitUntil: "domcontentloaded" });
    await page.locator(".leaflet-container").waitFor({ timeout: 15_000 });
    await page.getByLabel("Name *").fill("Public Smoke Test");
    await page.getByLabel("Organization").fill("MIPRO Test Institution");
    await page.getByLabel("Phone *").fill("+8801700000000");
    await page.getByLabel("Email").fill("public-smoke@example.org");
    await page.getByLabel("Message *").fill("Please share product documentation for this institutional inquiry.");
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await page.getByText("Your inquiry has been received.").waitFor();

    await page.goto(base + "/login", { waitUntil: "domcontentloaded" });
    const demoAccountsVisible = await page.getByText("Demo role accounts").count() > 0;
    if (demoAccountsVisible) {
      assert.match(await page.getByLabel("Email").inputValue(), /@mipro\.local$/, "Demo login email was not prepared");
      assert.ok((await page.getByLabel("Password").inputValue()).length > 0, "Demo login password was not prepared");
    } else {
      assert.equal(await page.getByLabel("Email").inputValue(), "", "Production login email must be blank");
      assert.equal(await page.getByLabel("Password").inputValue(), "", "Production login password must be blank");
    }
    assert.equal(await page.getByText("Request access", { exact: true }).count(), 0, "Request Access is still public");
    await page.goto(base + "/signup", { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/login");

    await page.goto(base + "/", { waitUntil: "networkidle" });
    await page.screenshot({ path: `artifacts/public-smoke/home-${viewport.name}.png`, fullPage: true, animations: "disabled", timeout: 60_000 });
    await page.goto(base + "/products", { waitUntil: "networkidle" });
    await page.screenshot({ path: `artifacts/public-smoke/products-${viewport.name}.png`, fullPage: true, animations: "disabled", timeout: 60_000 });
    await page.goto(base + "/certificates", { waitUntil: "networkidle" });
    await page.screenshot({ path: `artifacts/public-smoke/certificates-${viewport.name}.png`, fullPage: true, animations: "disabled", timeout: 60_000 });
    await page.goto(base + "/contact", { waitUntil: "networkidle" });
    await page.screenshot({ path: `artifacts/public-smoke/contact-${viewport.name}.png`, fullPage: true, animations: "disabled", timeout: 60_000 });
    await page.goto(base + "/login", { waitUntil: "networkidle" });
    await page.screenshot({ path: `artifacts/public-smoke/login-${viewport.name}.png`, fullPage: true, animations: "disabled", timeout: 60_000 });
    assert.deepEqual(errors, [], `${viewport.name} browser errors: ${errors.join(" | ")}`);
    await page.close();
  }
  console.log("Public website routes, mobile navigation, catalogue, map, inquiry and employee boundary passed.");
} finally {
  await browser.close();
}
