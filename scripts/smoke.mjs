/* global window, document */
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:5173";
const apiBaseUrl = process.env.SMOKE_API_BASE_URL ?? baseUrl;
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "msedge";
const sessionKey = "mipro-erp-session";
await mkdir("artifacts", { recursive: true });

const people = {
  super: { id: "u-super", name: "Sadia Karim", email: "superadmin@mipro.local", role: "Super Admin", title: "Owner & System Administrator", department: "Management", phone: "+880 1711 000001", avatarUrl: "/mipro-owner.png", status: "Active", capabilities: ["view_sensitive_cost", "edit_sensitive_cost", "finalize_landed_cost", "reopen_landed_cost", "view_profit", "approve_stock_override", "approve_special_price", "manage_users", "manage_user_access"] },
  md: { id: "u-md", name: "Mahmud Rahman", email: "md@mipro.local", role: "Managing Director", title: "Managing Director", department: "Management", phone: "", avatarUrl: "", status: "Active", capabilities: [] },
  accounts: { id: "u-accounts", name: "Nusrat Jahan", email: "accounts@mipro.local", role: "Accounts", title: "Accounts Officer", department: "Accounts", phone: "", avatarUrl: "", status: "Active", capabilities: [] },
  import: { id: "u-import", name: "Tanvir Hasan", email: "import@mipro.local", role: "Import Officer", title: "Import Officer", department: "Import", phone: "", avatarUrl: "", status: "Active", permissionOverrides: [{ permission: "reports", action: "view", effect: "ALLOW" }, { permission: "reports", action: "export", effect: "ALLOW" }], capabilities: [] },
  warehouse: { id: "u-warehouse", name: "Aminul Islam", email: "warehouse@mipro.local", role: "Warehouse Manager", title: "Warehouse Manager", department: "Warehouse", phone: "", avatarUrl: "", status: "Active", capabilities: ["approve_stock_override"] },
  salesManager: { id: "u-sales-manager", name: "Farhana Akter", email: "salesmanager@mipro.local", role: "Sales Manager", title: "Sales Manager", department: "Sales", phone: "", avatarUrl: "", status: "Active", permissionOverrides: [{ permission: "users", action: "view", effect: "ALLOW" }, { permission: "users", action: "create", effect: "ALLOW" }, { permission: "users", action: "edit", effect: "ALLOW" }, { permission: "reports", action: "export", effect: "DENY" }], capabilities: ["approve_special_price", "manage_users"] },
  sales: { id: "sales1", name: "Rafiq Ahmed", email: "sales1@mipro.local", role: "Sales Executive", title: "Sales Executive", department: "Sales", phone: "", avatarUrl: "", status: "Active", territory: "Dhaka North", capabilities: [] }
};

const session = (user) => ({ token: "mock-token-" + user.id, user });
const browser = await chromium.launch({ channel: browserChannel, headless: true });
const issues = [];
let expectedDocument404 = false;

function watchPage(page, name) {
  page.on("pageerror", (error) => issues.push(name + ": " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      if (expectedDocument404 && name === "document-viewer-pdf" && message.text().includes("404")) return;
      issues.push(name + ": console " + message.text());
    }
  });
}

async function preparePage({ name, width, height, user = null }) {
  const page = await browser.newPage({ viewport: { width, height } });
  if (user) {
    await page.addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
      { key: sessionKey, value: session(user) }
    );
  }
  watchPage(page, name);
  return page;
}

async function visitAndCapture({ name, path, width, height, user = null }) {
  const page = await preparePage({ name, width, height, user });
  await page.goto(baseUrl + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  const heading = page.locator("h1:visible, h2:visible").first();
  await heading.waitFor({ timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  if (bodyWidth > width + 4) issues.push(name + ": horizontal page overflow (" + bodyWidth + "px)");
  await page.screenshot({ path: "artifacts/" + name + ".png", fullPage: true });
  console.log(name + ": " + await heading.textContent());
  await page.close();
}

const routes = [
  ["landing-desktop", "/", 1440, 1000, null],
  ["landing-mobile", "/", 390, 1000, null],
  ["login-desktop", "/login", 1440, 900, null],
  ["login-mobile", "/login", 390, 900, null],
  ["dashboard-desktop", "/app/dashboard", 1440, 1000, people.super],
  ["dashboard-mobile", "/app/dashboard", 390, 1100, people.super],
  ["profile-desktop", "/app/profile", 1440, 1000, people.super],
  ["profile-mobile", "/app/profile", 390, 1100, people.super],
  ["imports-desktop", "/app/imports", 1440, 1000, people.super],
  ["import-workspace-desktop", "/app/imports/imp-77612", 1440, 1200, people.super],
  ["import-workspace-mobile", "/app/imports/imp-77612", 390, 1200, people.super],
  ["inventory-desktop", "/app/inventory", 1440, 1000, people.super],
  ["inventory-mobile", "/app/inventory", 390, 1100, people.super],
  ["sales-desktop", "/app/sales", 1440, 1000, people.super],
  ["sales-mobile", "/app/sales", 390, 1100, people.super],
  ["marketing-desktop", "/app/sales?view=marketing", 1440, 1200, people.salesManager],
  ["marketing-mobile", "/app/sales?view=marketing", 390, 1200, people.sales],
  ["employees-directory-desktop", "/app/employees?view=directory", 1440, 1100, people.super],
  ["employees-directory-mobile", "/app/employees?view=directory", 390, 1100, people.super],
  ["employees-access-desktop", "/app/employees?view=access", 1440, 1100, people.super],
  ["employees-activity-desktop", "/app/employees?view=activity&employee=sales1", 1440, 1200, people.salesManager],
  ["employees-activity-mobile", "/app/employees?view=activity&employee=sales1", 390, 1200, people.salesManager],
  ["field-team-desktop", "/app/employees?view=field-team", 1440, 1100, people.salesManager],
  ["field-team-mobile", "/app/sales?view=marketing&marketing=field-team", 390, 1100, people.sales],
  ["accounts-desktop", "/app/accounts", 1440, 1000, people.super],
  ["accounts-mobile", "/app/accounts", 390, 1100, people.super],
  ["reports-desktop", "/app/reports", 1440, 1000, people.super],
  ["reports-mobile", "/app/reports", 390, 1100, people.super],
  ["marketing-reports-desktop", "/app/reports/daily-marketing", 1440, 1200, people.salesManager],
  ["marketing-reports-mobile", "/app/reports/daily-marketing", 390, 1200, people.sales],
  ["reports-import-override", "/app/reports", 1440, 1000, people.import],
  ["smart-insights-desktop", "/app/insights", 1440, 1000, people.salesManager],
  ["smart-insights-mobile", "/app/insights", 390, 1000, people.sales],
  ["settings-desktop", "/app/settings", 1440, 1100, people.super],
  ["settings-mobile", "/app/settings", 390, 1100, people.super],
  ["legacy-settings-users-redirect", "/app/settings?view=users", 1440, 1000, people.salesManager],
  ["settings-migration-desktop", "/app/settings?view=migration", 1440, 1100, people.super]
];

for (const [name, path, width, height, user] of routes) {
  await visitAndCapture({ name, path, width, height, user });
}

const profilePassword = await preparePage({ name: "profile-password", width: 1280, height: 900, user: people.super });
await profilePassword.goto(baseUrl + "/app/profile", { waitUntil: "networkidle", timeout: 60000 });
await profilePassword.getByRole("button", { name: "Change Password" }).click();
await profilePassword.getByLabel("New Password").fill("temporary123");
await profilePassword.getByLabel("Confirm Password").fill("temporary123");
// The aggregate screenshot run can leave CSS transitions settling; the focused
// control flow is validated by the success toast and subsequent login request.
await profilePassword.getByRole("button", { name: "Update Password" }).click({ force: true });
await profilePassword.getByText("Password updated", { exact: true }).waitFor({ timeout: 30000 });
await profilePassword.close();
const changedLogin = await fetch(apiBaseUrl + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: people.super.email, password: "temporary123" }) });
if (!changedLogin.ok) issues.push("Profile password change did not update login.");
await fetch(apiBaseUrl + "/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: people.super.email, password: "password123" }) });

const costing = await preparePage({ name: "costing-result-desktop", width: 1440, height: 1200, user: people.super });
await costing.goto(baseUrl + "/app/imports/imp-77612", { waitUntil: "networkidle", timeout: 60000 });
await costing.getByRole("button", { name: "Preview" }).click();
await costing.getByText("Final Shipment Cost").waitFor({ timeout: 30000 });
await costing.screenshot({ path: "artifacts/costing-result-desktop.png", fullPage: true });
const reconciliation = await costing.locator("body").textContent();
if (!reconciliation?.includes("Explain") || !reconciliation.includes("Final Shipment Cost")) issues.push("Costing explanation/result is missing.");
const finalizeButton = costing.getByRole("button", { name: "Finalize Snapshot" });
if (await finalizeButton.isVisible().catch(() => false)) {
  await finalizeButton.click();
  await costing.getByText(/Snapshot v\d+/).waitFor({ timeout: 30000 });
} else if ((await costing.getByText(/Snapshot v\d+/).count()) === 0) {
  issues.push("Landed-cost snapshot state is unavailable after preview.");
}
await costing.close();

await visitAndCapture({ name: "costing-result-mobile", path: "/app/imports/imp-77612", width: 390, height: 1200, user: people.super });

const printRoutes = [
  ["print-quotation-digital", "/app/print/quotation/quo-1", 1200, 1000],
  ["print-order", "/app/print/order/so-1", 1200, 1000],
  ["print-challan", "/app/print/challan/del-2", 1200, 1000],
  ["print-invoice", "/app/print/invoice/inv-1", 1200, 1000],
  ["print-receipt", "/app/print/receipt/col-1", 1200, 1000],
  ["print-debit-voucher", "/app/print/debit-voucher/trx-advance-1", 1200, 1000],
  ["print-credit-voucher", "/app/print/credit-voucher/trx-loan-1", 1200, 1000],
  ["print-import-cost", "/app/print/import-cost/imp-77612", 1200, 1000],
  ["print-quotation-mobile", "/app/print/quotation/quo-1", 390, 1000]
];
for (const [name, path, width, height] of printRoutes) {
  await visitAndCapture({ name, path, width, height, user: people.super });
}

const preprinted = await preparePage({ name: "print-quotation-preprinted", width: 1200, height: 1000, user: people.super });
await preprinted.goto(baseUrl + "/app/print/quotation/quo-1", { waitUntil: "networkidle", timeout: 60000 });
await preprinted.getByRole("tab", { name: "Without Background" }).click();
if (await preprinted.locator(".print-sheet").getAttribute("data-letterhead-mode") !== "preprinted") issues.push("Quotation without-background mode did not remove digital stationery artwork.");
await preprinted.waitForFunction(() => {
  const table = document.querySelector(".print-sheet table");
  return table && table.getBoundingClientRect().width > 500;
});
await preprinted.screenshot({ path: "artifacts/print-quotation-preprinted.png", fullPage: true });
const preprintedWidth = await preprinted.locator(".print-sheet table").evaluate((element) => element.getBoundingClientRect().width);
if (preprintedWidth < 500) issues.push("Preprinted quotation content did not retain the calibrated A4 safe width.");
await preprinted.close();

const reportPrint = await preparePage({ name: "report-print-modes", width: 1440, height: 1000, user: people.super });
await reportPrint.goto(baseUrl + "/app/reports/import-register", { waitUntil: "networkidle", timeout: 60000 });
if (await reportPrint.getByRole("tab", { name: "Without Background" }).count()) issues.push("Operational report page still exposes stationery choices outside print preview.");
await reportPrint.getByRole("button", { name: "Print Preview" }).click();
await reportPrint.getByRole("button", { name: "Print / Save PDF" }).waitFor();
if (new URL(reportPrint.url()).pathname !== "/app/print/operational-report/imports") issues.push("Operational report did not navigate to the shared print preview.");
await reportPrint.getByRole("tab", { name: "Without Background" }).click();
if (await reportPrint.locator(".print-sheet").first().getAttribute("data-letterhead-mode") !== "preprinted") issues.push("Operational report without-background mode was not applied.");
await reportPrint.getByRole("tab", { name: "With Background" }).click();
if (await reportPrint.locator(".print-sheet").first().getAttribute("data-letterhead-mode") !== "digital") issues.push("Operational report background mode was not restored.");
if (await reportPrint.locator("[data-report-page-edge='1.5mm-left-0.2mm-right']").count() < 1) issues.push("Operational report print shell does not expose the calibrated 1.5mm/0.2mm page-edge contract.");
const reportPrintColors = await reportPrint.evaluate(() => ({
  header: window.getComputedStyle(document.querySelector(".report-print-header")).backgroundColor,
  body: window.getComputedStyle(document.querySelector(".report-print-table tbody td")).backgroundColor
}));
if (!reportPrintColors.header.startsWith("rgba(") || reportPrintColors.header.endsWith(", 1)")) issues.push("Operational report table header is not translucent over the letterhead.");
if (reportPrintColors.body !== "rgba(0, 0, 0, 0)") issues.push("Operational report body cells are not fully transparent over the letterhead.");
await reportPrint.screenshot({ path: "artifacts/report-print-modes.png", fullPage: true });
await reportPrint.close();

const reportCatalogue = await preparePage({ name: "report-catalogue-mobile", width: 390, height: 1100, user: people.super });
await reportCatalogue.goto(baseUrl + "/app/reports", { waitUntil: "networkidle", timeout: 60000 });
await reportCatalogue.getByPlaceholder("Search reports by name or business area...").fill("stock summary");
await reportCatalogue.getByRole("button", { name: /Stock Summary/ }).click();
await reportCatalogue.getByRole("button", { name: "Back to Reports" }).waitFor();
await reportCatalogue.getByRole("heading", { name: "Stock Summary", exact: true, level: 1 }).waitFor();
if (await reportCatalogue.evaluate(() => document.body.scrollWidth) > 394) issues.push("Mobile report catalogue has horizontal page overflow.");
await reportCatalogue.screenshot({ path: "artifacts/report-catalogue-mobile.png", fullPage: true });
await reportCatalogue.close();

const legacyReportUrl = await preparePage({ name: "report-legacy-url", width: 1280, height: 900, user: people.super });
await legacyReportUrl.goto(baseUrl + "/app/reports?view=imports&table=import-register", { waitUntil: "networkidle", timeout: 60000 });
await legacyReportUrl.getByRole("heading", { name: "Import / Shipment Register", exact: true, level: 1 }).waitFor();
if (new URL(legacyReportUrl.url()).pathname !== "/app/reports/import-register") issues.push("Legacy report URL was not normalized to the canonical report detail URL.");
await legacyReportUrl.close();

const customerLedger = await preparePage({ name: "customer-ledger-desktop", width: 1440, height: 1000, user: people.super });
await customerLedger.goto(baseUrl + "/app/sales", { waitUntil: "networkidle", timeout: 60000 });
await customerLedger.getByLabel("Open customer ledger").selectOption("cus-labaid");
await customerLedger.getByText("Current Due", { exact: true }).waitFor({ timeout: 30000 });
await customerLedger.screenshot({ path: "artifacts/customer-ledger-desktop.png", fullPage: true });
await customerLedger.close();

const customerActions = await preparePage({ name: "customer-connected-actions", width: 1440, height: 1000, user: people.super });
await customerActions.goto(baseUrl + "/app/sales?view=customers", { waitUntil: "networkidle", timeout: 60000 });
await customerActions.getByRole("button", { name: "Create quotation for Popular Medicine & Departmental Store" }).click();
const quotationDialog = customerActions.getByRole("dialog");
await quotationDialog.getByText("New quotation", { exact: true }).waitFor();
if (await quotationDialog.locator("select").first().inputValue() !== "cus-popular") issues.push("Customer-to-quotation shortcut did not carry the customer context.");
await customerActions.goto(baseUrl + "/app/sales?view=customers", { waitUntil: "networkidle", timeout: 60000 });
await customerActions.getByRole("button", { name: "Post collection for Popular Medicine & Departmental Store" }).click();
const collectionDialog = customerActions.getByRole("dialog");
await collectionDialog.getByText("Post customer collection", { exact: true }).waitFor();
if (await collectionDialog.locator("select").first().inputValue() !== "cus-popular") issues.push("Customer-to-collection shortcut did not carry the customer context.");
await customerActions.goto(baseUrl + "/app/sales?view=customers", { waitUntil: "networkidle", timeout: 60000 });
await customerActions.getByRole("button", { name: "Open marketing history for Popular Medicine & Departmental Store" }).click();
await customerActions.getByRole("heading", { name: "Marketing Team Analysis" }).waitFor({ timeout: 30000 });
if (await customerActions.getByText("Customer / Lead", { exact: true }).locator("..").locator("select").inputValue() !== "customer:cus-popular") issues.push("Customer marketing-history shortcut did not retain the selected subject.");
await customerActions.screenshot({ path: "artifacts/customer-marketing-history.png", fullPage: true });
await customerActions.close();

const employeeReport = await preparePage({ name: "employee-performance-desktop", width: 1440, height: 1100, user: people.salesManager });
await employeeReport.goto(baseUrl + "/app/reports/salesperson-performance?from=2026-08-01&to=2026-08-31", { waitUntil: "networkidle", timeout: 60000 });
await employeeReport.getByRole("heading", { name: "Sales Team Comparison", exact: true, level: 1 }).waitFor({ timeout: 30000 });
await employeeReport.getByRole("button", { name: "Print Preview" }).waitFor();
const performanceText = await employeeReport.locator("body").textContent();
if (!/delivered sales/i.test(performanceText ?? "") || !/collections/i.test(performanceText ?? "")) issues.push("Sales team comparison is missing connected sales or collection values.");
await employeeReport.screenshot({ path: "artifacts/employee-performance-desktop.png", fullPage: true });
await employeeReport.close();

const employeeHub = await preparePage({ name: "employee-hub-activity-flow", width: 1440, height: 1100, user: people.salesManager });
await employeeHub.goto(baseUrl + "/app/employees?view=activity&employee=sales1", { waitUntil: "networkidle", timeout: 60000 });
await employeeHub.getByTestId("employee-activity-summary").waitFor({ timeout: 30000 });
const employeeHubText = await employeeHub.locator("body").textContent();
for (const expectedMetric of ["Verified Visits", "New Leads", "Collections", "Target", "Recent activity"]) {
  if (!employeeHubText?.includes(expectedMetric)) issues.push("Employee Activity Summary is missing " + expectedMetric + ".");
}
await employeeHub.screenshot({ path: "artifacts/employee-hub-activity-flow.png", fullPage: true });
if (await employeeHub.getByRole("tab", { name: "Without Background" }).count()) issues.push("Employee workspace still exposes stationery choices outside print preview.");
await employeeHub.getByRole("button", { name: "Open Full Report" }).click();
await employeeHub.getByTestId("employee-activity-performance").waitFor({ timeout: 30000 });
if (new URL(employeeHub.url()).pathname !== "/app/reports/employee-activity") issues.push("Employee summary did not open the canonical Reports detail page.");
await employeeHub.getByRole("tab", { name: "Monthly" }).click();
await employeeHub.getByLabel("Report Month").fill("2026-08");
await employeeHub.getByRole("button", { name: "Print Preview" }).click();
await employeeHub.getByRole("button", { name: "Print / Save PDF" }).waitFor();
if (!new URL(employeeHub.url()).pathname.startsWith("/app/print/employee-activity/")) issues.push("Employee report did not navigate to the shared print preview.");
await employeeHub.getByRole("tab", { name: "Without Background" }).click();
if (await employeeHub.locator(".print-sheet").first().getAttribute("data-letterhead-mode") !== "preprinted") issues.push("Employee report without-background mode was not applied to its A4 sheet.");
await employeeHub.getByRole("tab", { name: "With Background" }).click();
if (await employeeHub.locator(".print-sheet").first().getAttribute("data-letterhead-mode") !== "digital") issues.push("Employee report background mode was not restored.");
await employeeHub.getByRole("button", { name: "Back" }).click();
await employeeHub.getByTestId("employee-activity-performance").waitFor();
const reportUrl = new URL(employeeHub.url());
if (reportUrl.pathname !== "/app/reports/employee-activity" || reportUrl.searchParams.get("employeeId") !== "sales1") issues.push("Employee print preview did not return to the canonical report detail page.");
await employeeHub.close();

const fieldTeam = await preparePage({ name: "field-team-interactions", width: 1440, height: 1050, user: people.salesManager });
await fieldTeam.goto(baseUrl + "/app/employees?view=field-team", { waitUntil: "domcontentloaded", timeout: 60000 });
await fieldTeam.getByTestId("field-team-workspace").waitFor({ timeout: 30000 });
await fieldTeam.locator(".leaflet-container").waitFor({ timeout: 30000 });
await fieldTeam.waitForTimeout(1000);
if ((await fieldTeam.locator(".field-map-marker").count()) < 1) issues.push("Field Team map rendered without coordinate markers.");
await fieldTeam.getByLabel("Territory").selectOption("Dhaka North");
await fieldTeam.getByLabel("Tracking Status").selectOption("LIVE");
await fieldTeam.getByText("Rafiq Ahmed", { exact: true }).first().click();
await fieldTeam.getByText(/GPS accuracy/).waitFor({ timeout: 30000 });
await fieldTeam.screenshot({ path: "artifacts/field-team-filtered-desktop.png", fullPage: true });
await fieldTeam.getByRole("tab", { name: "Route / Visit History" }).click();
await fieldTeam.getByText("Visit timeline", { exact: true }).waitFor({ timeout: 30000 });
await fieldTeam.locator(".leaflet-container").waitFor();
if ((await fieldTeam.getByText(/No synthetic distance is calculated/).count()) === 0) issues.push("Route history does not explain its coordinate-only path.");
await fieldTeam.screenshot({ path: "artifacts/field-team-history-desktop.png", fullPage: true });
await fieldTeam.close();

const insightsPage = await preparePage({ name: "smart-insights-interactions", width: 1280, height: 900, user: people.salesManager });
await insightsPage.goto(baseUrl + "/app/insights", { waitUntil: "networkidle", timeout: 60000 });
await insightsPage.getByTestId("smart-insights-page").waitFor();
await insightsPage.getByRole("tab", { name: /Field Team/ }).click();
await insightsPage.getByText(/field update|field team feed/i).waitFor();
const cardsBeforeDismiss = await insightsPage.getByTestId("ai-recommendation").count();
await insightsPage.getByRole("button", { name: "Dismiss recommendation" }).first().click();
if ((await insightsPage.getByTestId("ai-recommendation").count()) !== cardsBeforeDismiss - 1) issues.push("Smart Insight dismissal did not remove only the selected alert.");
await insightsPage.screenshot({ path: "artifacts/smart-insights-filtered.png", fullPage: true });
await insightsPage.close();

const documentPage = await preparePage({ name: "document-viewer-pdf", width: 1440, height: 1000, user: people.super });
await documentPage.goto(baseUrl + "/app/imports/imp-77612", { waitUntil: "networkidle", timeout: 60000 });
await documentPage.getByRole("button", { name: "View", exact: true }).first().click();
const pdfViewer = documentPage.getByTestId("document-viewer");
await pdfViewer.waitFor({ timeout: 30000 });
await pdfViewer.locator("iframe").waitFor({ timeout: 30000 });
await documentPage.screenshot({ path: "artifacts/document-viewer-pdf.png", fullPage: true });
await pdfViewer.getByRole("button", { name: "Close document viewer" }).last().click();
await documentPage.getByRole("button", { name: /View freight-invoice\.pdf/ }).click();
await documentPage.getByRole("dialog", { name: /freight-invoice\.pdf/ }).waitFor({ timeout: 30000 });
await documentPage.getByRole("dialog", { name: /freight-invoice\.pdf/ }).getByRole("button", { name: "Close document viewer" }).last().click();

await documentPage.route("**/api/documents/doc-pi/content", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, message: "The attachment metadata exists, but its demo file is missing." }) }));
expectedDocument404 = true;
await documentPage.getByRole("button", { name: "View", exact: true }).first().click();
await documentPage.getByText("Preview unavailable", { exact: true }).waitFor({ timeout: 30000 });
expectedDocument404 = false;
await documentPage.getByTestId("document-viewer").getByRole("button", { name: "Close document viewer" }).last().click();

await documentPage.getByTestId("ai-launcher").click();
await documentPage.getByTestId("ai-assistant").waitFor();
await documentPage.getByRole("button", { name: "Explain the current shipment stage" }).click();
await documentPage.getByText(/LC-77612 is at/).waitFor({ timeout: 30000 });
await documentPage.screenshot({ path: "artifacts/contextual-ai-import.png", fullPage: true });
await documentPage.close();

const expenseDocument = await preparePage({ name: "document-viewer-image", width: 1280, height: 900, user: people.super });
await expenseDocument.goto(baseUrl + "/app/accounts", { waitUntil: "networkidle", timeout: 60000 });
await expenseDocument.getByRole("button", { name: "View office-utility-receipt.png" }).click();
const imageViewer = expenseDocument.getByTestId("document-viewer");
await imageViewer.locator("img").waitFor({ timeout: 30000 });
await expenseDocument.screenshot({ path: "artifacts/document-viewer-image.png", fullPage: true });
await expenseDocument.close();

const mobileAi = await preparePage({ name: "contextual-ai-mobile", width: 390, height: 844, user: people.sales });
await mobileAi.goto(baseUrl + "/app/sales", { waitUntil: "networkidle", timeout: 60000 });
await mobileAi.getByTestId("ai-launcher").click();
const mobileAssistant = mobileAi.getByTestId("ai-assistant");
await mobileAssistant.waitFor();
const aiBox = await mobileAssistant.boundingBox();
if (!aiBox || aiBox.width > 390 || aiBox.height > 844 || aiBox.x < 0 || aiBox.y < 0) issues.push("Mobile AI assistant does not fit the viewport.");
await mobileAi.getByPlaceholder("Ask about this workspace...").fill("What is the landed cost and profit margin?");
await mobileAi.getByRole("button", { name: "Send question" }).click();
await mobileAi.getByText(/cannot provide supplier pricing/i).waitFor({ timeout: 30000 });
await mobileAi.screenshot({ path: "artifacts/contextual-ai-mobile.png", fullPage: true });
await mobileAi.close();

const expectedNavigation = new Map([
  [people.super, ["Dashboard", "Imports", "Inventory", "Sales & Marketing", "Expenses & Accounts", "Employees", "Reports", "Settings"]],
  [people.md, ["Dashboard", "Imports", "Inventory", "Sales & Marketing", "Expenses & Accounts", "Employees", "Reports"]],
  [people.accounts, ["Dashboard", "Sales & Marketing", "Expenses & Accounts", "Reports"]],
  [people.import, ["Dashboard", "Imports", "Reports", "Settings"]],
  [people.warehouse, ["Dashboard", "Imports", "Inventory"]],
  [people.salesManager, ["Dashboard", "Inventory", "Sales & Marketing", "Employees", "Reports"]],
  [people.sales, ["Dashboard", "Sales & Marketing", "Reports"]]
]);
const deniedRoute = new Map([
  [people.md, "/app/settings"],
  [people.accounts, "/app/employees"],
  [people.import, "/app/accounts"],
  [people.warehouse, "/app/accounts"],
  [people.salesManager, "/app/imports"],
  [people.sales, "/app/employees"]
]);

for (const [user, expected] of expectedNavigation) {
  const name = "role-" + user.role.toLowerCase().replaceAll(" ", "-");
  const page = await preparePage({ name, width: 1280, height: 900, user });
  await page.goto(baseUrl + "/app/dashboard", { waitUntil: "networkidle", timeout: 60000 });
  const actual = (await page.locator("nav a").allTextContents()).map((value) => value.trim()).filter(Boolean);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    issues.push(user.role + " navigation mismatch: " + JSON.stringify(actual));
  }
  if (deniedRoute.has(user)) {
    await page.goto(baseUrl + deniedRoute.get(user), { waitUntil: "networkidle", timeout: 60000 });
    if (!(await page.locator("body").textContent())?.includes("Access denied")) {
      issues.push(user.role + " direct URL denial failed.");
    }
  }
  await page.close();
}

const delegatedSettings = await preparePage({ name: "delegated-settings-access", width: 1280, height: 900, user: people.salesManager });
await delegatedSettings.goto(baseUrl + "/app/settings?view=users", { waitUntil: "networkidle", timeout: 60000 });
if (new URL(delegatedSettings.url()).pathname !== "/app/employees") issues.push("Legacy Settings user route did not redirect to Employees.");
const delegatedTabs = (await delegatedSettings.getByRole("tab").allTextContents()).map((value) => value.trim());
if (!delegatedTabs.some((tab) => tab.startsWith("Employee Directory")) || delegatedTabs.some((tab) => tab.startsWith("Access & Roles"))) {
  issues.push("Delegated employee manager received incorrect Employees tabs: " + JSON.stringify(delegatedTabs));
}
if ((await delegatedSettings.getByRole("button", { name: "New Employee" }).count()) !== 1) issues.push("Delegated employee manager cannot create a permitted employee.");
await delegatedSettings.getByRole("button", { name: "Open Rafiq Ahmed" }).click();
await delegatedSettings.getByRole("dialog").waitFor();
if ((await delegatedSettings.getByText("Employee-specific access", { exact: false }).count()) !== 0) issues.push("Delegated employee manager can see access-administration controls.");
if (await delegatedSettings.getByLabel("Assigned Role").isEditable()) issues.push("Delegated employee manager can change an assigned role.");
await delegatedSettings.screenshot({ path: "artifacts/employees-delegated-profile-editor.png", fullPage: true });
await delegatedSettings.close();

const ownerAccessEditor = await preparePage({ name: "owner-access-editor", width: 1440, height: 1050, user: people.super });
await ownerAccessEditor.goto(baseUrl + "/app/employees?view=access", { waitUntil: "networkidle", timeout: 60000 });
await ownerAccessEditor.getByRole("button", { name: "Edit Tanvir Hasan access" }).click();
const ownerAccessDialog = ownerAccessEditor.getByRole("dialog");
await ownerAccessDialog.waitFor();
await ownerAccessDialog.locator("summary").filter({ hasText: "Employee-specific access" }).click();
if ((await ownerAccessDialog.getByText("Role default access", { exact: false }).count()) === 0) issues.push("Owner access editor is missing the inherited role summary.");
if ((await ownerAccessDialog.getByText("Sensitive capabilities", { exact: true }).count()) === 0) issues.push("Owner access editor is missing sensitive-capability controls.");
await ownerAccessEditor.screenshot({ path: "artifacts/employees-owner-access-editor.png", fullPage: true });
await ownerAccessEditor.close();

const liveRoleTarget = await preparePage({ name: "live-role-target", width: 1280, height: 900, user: people.md });
const liveRoleAdmin = await preparePage({ name: "live-role-admin", width: 1440, height: 1000, user: people.super });
try {
  await liveRoleTarget.goto(baseUrl + "/app/sales", { waitUntil: "networkidle", timeout: 60000 });
  if ((await liveRoleTarget.getByText("Could not load this workspace", { exact: true }).count()) !== 0) issues.push("Managing Director Sales failed before the live role test.");

  await liveRoleAdmin.goto(baseUrl + "/app/employees?view=access", { waitUntil: "networkidle", timeout: 60000 });
  await liveRoleAdmin.getByRole("button", { name: "Edit Mahmud Rahman access" }).click();
  const roleDialog = liveRoleAdmin.getByRole("dialog");
  await roleDialog.getByLabel("Assigned Role").selectOption("Warehouse Manager");
  await roleDialog.getByRole("button", { name: "Save Access" }).click();
  await liveRoleAdmin.getByText("Mahmud Rahman's access updated", { exact: true }).waitFor({ timeout: 15000 });

  await liveRoleTarget.evaluate(() => window.dispatchEvent(new Event("focus")));
  await liveRoleTarget.getByText("Access denied", { exact: true }).waitFor({ timeout: 15000 });
  const refreshedRole = await liveRoleTarget.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null")?.user?.role, sessionKey);
  if (refreshedRole !== "Warehouse Manager") issues.push("An open session did not adopt its reassigned role after focus.");
  if ((await liveRoleTarget.getByText("Could not load this workspace", { exact: true }).count()) !== 0) issues.push("A reassigned user reached an unauthorized API query instead of route denial.");
  await liveRoleTarget.screenshot({ path: "artifacts/live-role-access-reconciled.png", fullPage: true });
} finally {
  await fetch(apiBaseUrl + "/api/settings/users/u-md", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-user-id": people.super.id, "x-role": people.super.role },
    body: JSON.stringify({ role: "Managing Director" })
  });
  await liveRoleTarget.close();
  await liveRoleAdmin.close();
}

const allowedExport = await preparePage({ name: "import-officer-report-export", width: 1280, height: 900, user: people.import });
await allowedExport.goto(baseUrl + "/app/reports?view=print&category=imports&report=import-register", { waitUntil: "networkidle", timeout: 60000 });
if ((await allowedExport.getByRole("button", { name: "Export CSV" }).count()) !== 1) issues.push("Import Officer Reports export ALLOW is not reflected in the UI.");
await allowedExport.close();

const deniedExport = await preparePage({ name: "sales-manager-report-export", width: 1280, height: 900, user: people.salesManager });
await deniedExport.goto(baseUrl + "/app/reports?view=print&category=sales&report=invoice-register", { waitUntil: "networkidle", timeout: 60000 });
if ((await deniedExport.getByRole("button", { name: "Export CSV" }).count()) !== 0) issues.push("Sales Manager Reports export DENY is not reflected in the UI.");
await deniedExport.close();

const accountsActions = await preparePage({ name: "accounts-action-access", width: 1280, height: 900, user: people.accounts });
await accountsActions.goto(baseUrl + "/app/accounts", { waitUntil: "networkidle", timeout: 60000 });
if ((await accountsActions.getByRole("button", { name: "Expense Category" }).count()) !== 0) issues.push("Accounts role can see a Settings-only category administration action.");
await accountsActions.close();

const salesPage = await preparePage({ name: "sales-executive-own-record", width: 1280, height: 900, user: people.sales });
await salesPage.goto(baseUrl + "/app/sales?view=marketing", { waitUntil: "networkidle", timeout: 60000 });
if ((await salesPage.getByText("My Marketing Day").count()) === 0) issues.push("Sales Executive own-record Marketing hub is missing.");
if ((await salesPage.getByRole("button", { name: "Check In / Out" }).count()) !== 1) issues.push("Sales Executive field-action shortcut is missing.");
await salesPage.getByRole("button", { name: "Open Leads" }).click();
const leadDialog = salesPage.getByRole("dialog");
await leadDialog.getByText("Lead Pipeline", { exact: true }).waitFor();
const followUpShortcut = leadDialog.getByRole("button", { name: /Schedule follow-up for/ }).first();
await followUpShortcut.waitFor();
await followUpShortcut.click();
const followUpDialog = salesPage.getByRole("dialog");
await followUpDialog.getByRole("heading", { name: "Schedule Follow-up" }).waitFor();
if (!(await followUpDialog.locator("select").first().inputValue()).startsWith("lead:")) issues.push("Lead-to-follow-up shortcut did not carry the lead context.");
await salesPage.goto(baseUrl + "/app/sales?view=marketing", { waitUntil: "networkidle", timeout: 60000 });
await salesPage.getByRole("button", { name: "Open Leads" }).click();
const visitShortcut = salesPage.getByRole("dialog").getByRole("button", { name: /Report visit for/ }).first();
await visitShortcut.waitFor();
await visitShortcut.click();
const activityDialog = salesPage.getByRole("dialog");
await activityDialog.getByText("Report Daily Field Activity", { exact: true }).waitFor();
if (await activityDialog.locator("select").first().inputValue() !== "CUSTOMER_VISIT" || !(await activityDialog.locator("select").nth(1).inputValue()).startsWith("lead:")) issues.push("Lead-to-visit shortcut did not carry the activity and lead context.");
await salesPage.goto(baseUrl + "/app/sales?view=marketing", { waitUntil: "networkidle", timeout: 60000 });
await salesPage.getByRole("button", { name: "Update Plan" }).click();
const planDialog = salesPage.getByRole("dialog");
await planDialog.getByText("Completion is posted by a verified field check-out, not by editing this plan.", { exact: true }).waitFor();
if ((await planDialog.locator("select").count()) < 1) issues.push("Daily plan is missing canonical customer/lead selectors.");
await salesPage.goto(baseUrl + "/app/sales?view=marketing", { waitUntil: "networkidle", timeout: 60000 });
await salesPage.getByRole("button", { name: "Open Queue" }).click();
const followUpQueue = salesPage.getByRole("dialog");
if ((await followUpQueue.getByRole("button", { name: "Reschedule" }).count()) === 0) await followUpQueue.getByRole("tab", { name: "Overdue" }).click();
await followUpQueue.getByRole("button", { name: "Reschedule" }).first().waitFor();
await salesPage.screenshot({ path: "artifacts/marketing-connected-actions.png", fullPage: true });
await salesPage.close();

const dashboardQuickAction = await preparePage({ name: "dashboard-quick-action", width: 1280, height: 900, user: people.sales });
await dashboardQuickAction.goto(baseUrl + "/app/dashboard", { waitUntil: "networkidle", timeout: 60000 });
await dashboardQuickAction.getByRole("link", { name: "Report Activity" }).click();
await dashboardQuickAction.getByRole("heading", { name: "Report Daily Field Activity" }).waitFor({ timeout: 30000 });
await dashboardQuickAction.close();

const liveMarketing = await preparePage({ name: "marketing-live-polling", width: 1280, height: 900, user: people.salesManager });
let marketingDashboardResponses = 0;
liveMarketing.on("response", (response) => {
  if (response.url().includes("/api/marketing/dashboard") && response.ok()) marketingDashboardResponses += 1;
});
await liveMarketing.goto(baseUrl + "/app/sales?view=marketing", { waitUntil: "networkidle", timeout: 60000 });
await liveMarketing.getByText(/refreshes every 12 seconds/i).waitFor({ timeout: 30000 });
await liveMarketing.waitForTimeout(15_500);
if (marketingDashboardResponses < 2) issues.push("Marketing dashboard did not auto-refresh within the promised 12-second prototype interval.");
await liveMarketing.close();

const headers = { "x-user-id": people.super.id, "x-role": people.super.role, "Content-Type": "application/json" };
for (const path of ["/api/health", "/api/dashboard", "/api/imports", "/api/inventory/stock", "/api/customers", "/api/expenses", "/api/supplier-settlements", "/api/financial-position", "/api/reports", "/api/marketing/dashboard", "/api/marketing/employees/sales1/snapshot?from=2026-08-01&to=2026-08-31", "/api/reports/marketing", "/api/settings/users", "/api/settings/decisions", "/api/field-team/current", "/api/ai/recommendations?entityType=insights&route=%2Fapp%2Finsights"]) {
  const response = await fetch(apiBaseUrl + path, { headers });
  console.log("api " + path + ": " + response.status);
  if (!response.ok) issues.push(path + " returned " + response.status);
}

const finalizedImport = await fetch(apiBaseUrl + "/api/imports/imp-77612", { headers }).then((response) => response.json());
if (!finalizedImport.data?.snapshot?.immutable) issues.push("Finalized landed-cost snapshot is missing or mutable.");

const importHeaders = { "x-user-id": people.import.id, "x-role": people.import.role, "Content-Type": "application/json" };
const redactedImport = await fetch(apiBaseUrl + "/api/imports/imp-77612", { headers: importHeaders }).then((response) => response.json());
if (redactedImport.data?.costs?.length || redactedImport.data?.snapshot) issues.push("Sensitive import values were exposed to Import Officer.");

const deniedCostAction = await fetch(apiBaseUrl + "/api/imports/imp-77612/costs", {
  method: "POST",
  headers: importHeaders,
  body: JSON.stringify({ name: "Denied", amountForeign: "1.00", amountBdt: "1.00", currency: "BDT", exchangeRate: "1", allocationMethod: "QUANTITY", appliesToItemIds: [] })
});
if (deniedCostAction.status !== 403) issues.push("Sensitive import action was not denied.");

const preview = await fetch(apiBaseUrl + "/api/imports/imp-77612/cost-preview", { method: "POST", headers });
const previewBody = await preview.json();
if (!preview.ok || previewBody.data?.validationErrors?.length || previewBody.data?.allocations?.length < 3) issues.push("Multi-product landed-cost preview failed.");
const sum = previewBody.data?.products?.reduce((total, row) => total + Number(row.finalTotalBdt), 0).toFixed(2);
if (sum !== previewBody.data?.totalShipmentCostBdt) issues.push("Landed-cost product results do not reconcile.");

const fifo = await fetch(apiBaseUrl + "/api/inventory/dispatch-preview", {
  method: "POST",
  headers,
  body: JSON.stringify({ productId: "prd-d17h", batchId: "bat-d17-new", quantity: "60" })
});
const fifoBody = await fifo.json();
if (!fifo.ok || !fifoBody.data?.warning?.includes("Older matching lot")) issues.push("FIFO newer-batch warning failed.");

await browser.close();
if (issues.length) {
  console.error(issues.join("\n"));
  process.exit(1);
}
