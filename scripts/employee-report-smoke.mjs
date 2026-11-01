/* global window */
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.env.SMOKE_BASE_URL ?? "http://localhost:5173";
const sessionKey = "mipro-erp-session";
const executablePath = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
].filter(Boolean).find((candidate) => existsSync(candidate));

const manager = {
  id: "u-sales-manager",
  name: "Farhana Akter",
  email: "salesmanager@mipro.local",
  role: "Sales Manager",
  title: "Sales Manager",
  department: "Sales",
  phone: "+880 1711 000006",
  avatarUrl: "",
  status: "Active",
  permissionOverrides: [
    { permission: "users", action: "view", effect: "ALLOW" },
    { permission: "users", action: "create", effect: "ALLOW" },
    { permission: "users", action: "edit", effect: "ALLOW" },
    { permission: "reports", action: "export", effect: "DENY" }
  ],
  capabilities: ["approve_special_price", "manage_users"]
};

mkdirSync("artifacts/employee-report", { recursive: true });
const browser = await chromium.launch(executablePath ? { headless: true, executablePath } : { headless: true });

async function pageFor(viewport) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(({ key, user }) => window.localStorage.setItem(key, JSON.stringify({ token: `mock-token-${user.id}`, user })), { key: sessionKey, user: manager });
  return page;
}

try {
  const desktop = await pageFor({ width: 1440, height: 1000 });
  const errors = [];
  desktop.on("pageerror", (error) => errors.push(error.message));
  desktop.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  await desktop.goto(`${base}/app/employees?view=directory`, { waitUntil: "networkidle" });
  const directorySearch = desktop.getByPlaceholder("Name, ID, role, phone...");
  await directorySearch.fill("SE-014");
  await desktop.getByRole("button", { name: "Shamima Sultana", exact: true }).waitFor();
  assert.equal(await desktop.locator("tbody tr").count(), 1, "Directory search should return one matching employee row");
  await desktop.getByRole("button", { name: "Clear employee search" }).click();
  assert.ok(await desktop.locator("tbody tr").count() > 1, "Clearing employee search should restore the directory");

  await desktop.goto(`${base}/app/reports/employee-activity?employeeId=sales1`, { waitUntil: "networkidle" });
  await desktop.getByTestId("employee-activity-performance").waitFor();
  await desktop.getByTestId("employee-picker").getByRole("button").first().click();
  await desktop.getByPlaceholder("Search name, ID, designation...").fill("SE-014");
  const employeeListbox = desktop.getByRole("listbox", { name: "Employee Linked to Report" });
  const employeeSearchBox = await desktop.getByPlaceholder("Search name, ID, designation...").boundingBox();
  assert.ok(employeeSearchBox && employeeSearchBox.x >= 0 && employeeSearchBox.x + employeeSearchBox.width <= 1440, "Employee search dropdown must stay inside the viewport");
  assert.equal(await employeeListbox.getByRole("option").count(), 1, "Typed employee search must not retain the All Employees option");
  await desktop.screenshot({ path: "artifacts/employee-report/employee-picker-open-desktop.png", animations: "disabled" });
  await employeeListbox.getByRole("option", { name: /Shamima Sultana/ }).click();
  await desktop.getByRole("heading", { name: "Shamima Sultana", exact: true }).waitFor();

  await desktop.getByRole("tab", { name: "Weekly" }).click();
  await desktop.getByLabel("Choose Any Date in the Week").fill("2026-08-27");
  await desktop.getByLabel("Report Content").selectOption("Field Work");
  await desktop.getByRole("heading", { name: "Weekly Employee Field Work Report" }).waitFor();
  await desktop.getByRole("button", { name: "Print Preview" }).waitFor();
  assert.equal(await desktop.getByRole("tab", { name: "Without Background" }).count(), 0, "Operational employee page must not contain stationery choices");
  await desktop.getByRole("button", { name: "CSV" }).waitFor();
  assert.match(await desktop.getByTestId("employee-report-screen").innerText(), /Shamima Sultana/);
  assert.match(await desktop.getByTestId("employee-report-screen").innerText(), /SE-014/);
  assert.match(await desktop.getByTestId("employee-report-screen").innerText(), /Employee Activity Log/);
  await desktop.screenshot({ path: "artifacts/employee-report/employee-weekly-desktop.png", fullPage: true, animations: "disabled" });
  await desktop.getByRole("button", { name: "Print Preview" }).click();
  await desktop.getByRole("button", { name: "Print / Save PDF" }).waitFor();
  assert.match(new URL(desktop.url()).pathname, /^\/app\/print\/employee-activity\//, "Employee print action must navigate to the shared preview page");
  await desktop.getByRole("tab", { name: "Without Background" }).click();
  assert.equal(await desktop.locator(".print-sheet").first().getAttribute("data-letterhead-mode"), "preprinted", "Employee report must offer a content-only preprinted-paper mode");
  assert.equal(await desktop.locator(".print-sheet").first().evaluate((element) => window.getComputedStyle(element).backgroundImage), "none", "Preprinted employee report must omit background artwork");
  await desktop.getByRole("tab", { name: "With Background" }).click();
  assert.equal(await desktop.locator(".print-sheet").first().getAttribute("data-letterhead-mode"), "digital", "Employee report must restore its digital background mode");
  assert.match(await desktop.locator(".print-sheet").first().evaluate((element) => window.getComputedStyle(element).backgroundImage), /url\(/, "Digital employee report must use configured letterhead artwork");
  await desktop.emulateMedia({ media: "print" });
  assert.equal(await desktop.locator(".no-print:visible").count(), 0, "Report controls must be hidden in print media");
  assert.equal(await desktop.locator(".print-sheet").first().isVisible(), true, "Calibrated employee letterhead sheet must print");
  assert.equal(await desktop.locator(".print-sheet header").first().isVisible(), true, "Shared report title and reference header must print");
  await desktop.screenshot({ path: "artifacts/employee-report/employee-weekly-print.png", fullPage: true, animations: "disabled" });
  await desktop.pdf({ path: "artifacts/employee-report/employee-weekly-print.pdf", format: "A4", printBackground: true });
  await desktop.emulateMedia({ media: "screen" });

  await desktop.goto(`${base}/app/reports/daily-marketing`, { waitUntil: "networkidle" });
  await desktop.getByRole("heading", { name: "Marketing Team Analysis" }).waitFor();
  await desktop.getByRole("button", { name: /More Filters/ }).click();
  await desktop.getByTestId("employee-picker").getByRole("button").first().click();
  await desktop.getByPlaceholder("Search name, ID, designation...").fill("SE-014");
  const analysisSearchBox = await desktop.getByPlaceholder("Search name, ID, designation...").boundingBox();
  assert.ok(analysisSearchBox && analysisSearchBox.x >= 0 && analysisSearchBox.x + analysisSearchBox.width <= 1440, "Marketing employee filter must stay inside the viewport");
  await desktop.screenshot({ path: "artifacts/employee-report/marketing-picker-open-desktop.png", animations: "disabled" });
  await desktop.getByRole("listbox", { name: "Employee Filter" }).getByRole("option", { name: /Shamima Sultana/ }).click();
  const namedReportLink = desktop.getByRole("link", { name: "Open named employee report" });
  await namedReportLink.waitFor();
  await desktop.getByRole("tab", { name: /Activity by Date/ }).click();
  for (const heading of ["Date", "People & Accounts", "Activity Summary", "Field / Follow-up", "Business Results", "Evidence", "Details"]) await desktop.getByRole("columnheader", { name: heading, exact: true }).waitFor();
  await desktop.getByRole("button", { name: /View details for/ }).first().click();
  await desktop.getByText(/Underlying records for/).waitFor();
  await desktop.getByRole("columnheader", { name: "Purpose / Outcome", exact: true }).waitFor();
  await desktop.screenshot({ path: "artifacts/employee-report/marketing-analysis-desktop.png", fullPage: true, animations: "disabled" });
  await namedReportLink.click();
  await desktop.getByTestId("employee-activity-performance").waitFor();
  assert.equal(new URL(desktop.url()).pathname, "/app/reports/employee-activity", "Named employee reporting must stay inside the canonical Reports workspace");
  assert.equal(new URL(desktop.url()).searchParams.get("employeeId"), "sales2", "Named employee reporting must preserve the selected employee");

  await desktop.goto(`${base}/app/reports/daily-marketing`, { waitUntil: "networkidle" });
  await desktop.getByRole("heading", { name: "Marketing Team Analysis" }).waitFor();
  assert.equal(await desktop.getByRole("tab", { name: "Without Background" }).count(), 0, "Marketing workspace must not contain stationery choices");
  await desktop.getByRole("button", { name: "Print Preview" }).click();
  await desktop.getByRole("button", { name: "Print / Save PDF" }).waitFor();
  assert.equal(new URL(desktop.url()).pathname, "/app/print/marketing-analysis/current", "Marketing print action must use the shared preview route");
  await desktop.getByRole("tab", { name: "Without Background" }).click();
  assert.equal(await desktop.locator(".print-sheet").first().getAttribute("data-letterhead-mode"), "preprinted", "Marketing analysis must offer a without-background preview mode");
  await desktop.getByRole("tab", { name: "With Background" }).click();
  await desktop.close();

  const mobile = await pageFor({ width: 390, height: 844 });
  await mobile.goto(`${base}/app/reports/employee-activity?employeeId=sales1`, { waitUntil: "networkidle" });
  await mobile.getByTestId("employee-activity-performance").waitFor();
  assert.equal(await mobile.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 1), true, "Employee reports must not overflow the mobile viewport");
  await mobile.getByTestId("employee-picker").getByRole("button").first().click();
  await mobile.getByPlaceholder("Search name, ID, designation...").fill("SE-014");
  const mobileEmployeeSearchBox = await mobile.getByPlaceholder("Search name, ID, designation...").boundingBox();
  assert.ok(mobileEmployeeSearchBox && mobileEmployeeSearchBox.x >= 0 && mobileEmployeeSearchBox.x + mobileEmployeeSearchBox.width <= 390, "Employee picker must fit the mobile viewport");
  await mobile.screenshot({ path: "artifacts/employee-report/employee-picker-open-mobile.png", animations: "disabled" });
  await mobile.keyboard.press("Escape");
  await mobile.screenshot({ path: "artifacts/employee-report/employee-daily-mobile.png", fullPage: true, animations: "disabled" });
  await mobile.getByRole("button", { name: "Print Preview" }).click();
  await mobile.getByRole("button", { name: "Print / Save PDF" }).waitFor();
  assert.equal(await mobile.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 1), true, "Print preview controls must not overflow the mobile viewport");
  await mobile.screenshot({ path: "artifacts/employee-report/employee-print-preview-mobile.png", fullPage: true, animations: "disabled" });

  await mobile.goto(`${base}/app/reports/daily-marketing`, { waitUntil: "networkidle" });
  await mobile.getByRole("heading", { name: "Marketing Team Analysis" }).waitFor();
  await mobile.getByRole("button", { name: /More Filters/ }).click();
  await mobile.getByTestId("employee-picker").getByRole("button").first().click();
  await mobile.getByPlaceholder("Search name, ID, designation...").fill("SE-014");
  const mobileAnalysisSearchBox = await mobile.getByPlaceholder("Search name, ID, designation...").boundingBox();
  assert.ok(mobileAnalysisSearchBox && mobileAnalysisSearchBox.x >= 0 && mobileAnalysisSearchBox.x + mobileAnalysisSearchBox.width <= 390, "Marketing employee filter must fit the mobile viewport");
  await mobile.screenshot({ path: "artifacts/employee-report/marketing-picker-open-mobile.png", animations: "disabled" });
  assert.equal(await mobile.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 1), true, "Marketing analysis must not overflow the mobile viewport");
  await mobile.close();

  const publicPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await publicPage.goto(`${base}/`, { waitUntil: "networkidle" });
  await publicPage.getByRole("heading", { name: "Core dialysis products shown from supplied literature" }).waitFor();
  await publicPage.getByRole("tab", { name: "Hemodialyzer" }).click();
  await publicPage.getByRole("heading", { name: "HD-17H high-flux product information at a glance" }).waitFor();
  assert.match(await publicPage.locator("main").innerText(), /Effective membrane area listed as 1.7/);
  const literatureResponse = await publicPage.request.get(`${base}/resources/mipro-hd17h-technical.pdf`);
  assert.equal(literatureResponse.ok(), true, "Supplied technical literature PDF must be publicly served");
  await publicPage.screenshot({ path: "artifacts/employee-report/landing-literature-desktop.png", fullPage: true, animations: "disabled" });
  await publicPage.setViewportSize({ width: 390, height: 844 });
  await publicPage.goto(`${base}/`, { waitUntil: "networkidle" });
  assert.equal(await publicPage.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth + 1), true, "Landing page must not overflow the mobile viewport");
  await publicPage.screenshot({ path: "artifacts/employee-report/landing-literature-mobile.png", fullPage: true, animations: "disabled" });
  await publicPage.close();

  assert.deepEqual(errors, [], `Browser errors: ${errors.join(" | ")}`);
  console.log("Employee reports, employee search, print media and landing literature passed.");
} finally {
  await browser.close();
}
