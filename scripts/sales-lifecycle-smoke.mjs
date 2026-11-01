/* global window, document */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const base = process.env.SMOKE_BASE_URL ?? "http://localhost:5173";
await mkdir("artifacts/sales-lifecycle", { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "msedge", headless: true });
const failures = [];

async function pageFor(id = "u-super", viewport = { width: 1440, height: 1000 }) {
  const userResponse = await fetch(`${base}/api/settings/users`, { headers: { "x-user-id": "u-super" } });
  const body = await userResponse.json();
  const user = body.data.find((user) => user.id === id);
  assert.ok(user, "Demo identity must exist");
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (error) => failures.push(error.message));
  await page.addInitScript((user) => window.localStorage.setItem("mipro-erp-session", JSON.stringify({ token: `mock-token-${user.id}`, user })), user);
  return page;
}

async function capture(page, name) {
  await page.getByTestId("sales-order-workspace").waitFor();
  assert.equal(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth + 2), true, `${name} must not overflow`);
  assert.doesNotMatch(await page.getByTestId("sales-order-workspace").innerText(), /NaN|undefined/);
  await page.screenshot({ path: `artifacts/sales-lifecycle/${name}.png`, fullPage: true });
}

try {
  const desktop = await pageFor();
  await desktop.goto(`${base}/app/sales?view=orders`, { waitUntil: "networkidle" });
  const orderRow = desktop.getByRole("row").filter({ has: desktop.getByRole("button", { name: "SO-2026-041", exact: true }) });
  await orderRow.getByRole("button", { name: "Open Flow" }).click();
  assert.equal(new URL(desktop.url()).pathname, "/app/sales/orders/so-3");
  await capture(desktop, "order-desktop");
  await desktop.getByRole("button", { name: "Open Report", exact: true }).click();
  await desktop.getByTestId("report-detail").waitFor();
  assert.equal(new URL(desktop.url()).searchParams.get("filter.order"), "SO-2026-041");
  assert.equal(await desktop.getByLabel(/^Sales Order/).inputValue(), "SO-2026-041");
  assert.equal(await desktop.locator("tbody tr").count(), 1);
  await desktop.getByRole("button", { name: "Print Preview", exact: true }).click();
  await desktop.getByRole("button", { name: "Print / Save PDF" }).waitFor();
  assert.equal(new URL(desktop.url()).searchParams.get("filter.order"), "SO-2026-041");
  await desktop.screenshot({ path: "artifacts/sales-lifecycle/order-report-print.png", fullPage: true });
  await desktop.goto(`${base}/app/sales/orders/so-3`, { waitUntil: "networkidle" });
  await desktop.getByRole("button", { name: "Customer Ledger", exact: true }).click();
  await desktop.getByRole("heading", { name: /Kuwait Moitri Hospital.*Transaction Ledger/ }).waitFor();
  await desktop.goto(`${base}/app/sales/orders/so-3`, { waitUntil: "networkidle" });
  const beforeCollection = await (await desktop.request.get(`${base}/api/orders/so-3/workspace`, { headers: { "x-user-id": "u-super" } })).json();
  const expectedOutstanding = new Intl.NumberFormat("en-BD").format(Number(beforeCollection.data.totals.outstandingValue) - 1000);
  await desktop.getByRole("button", { name: "Record Collection", exact: true }).click();
  const collectionDialog = desktop.getByRole("dialog");
  await collectionDialog.getByLabel("Amount", { exact: true }).fill("1000");
  await collectionDialog.getByLabel("Deposit Account").selectOption("acc-city");
  await collectionDialog.getByLabel("Cheque / Transfer Ref").fill("LIFECYCLE-SMOKE-1000");
  await collectionDialog.getByRole("button", { name: "Post Collection", exact: true }).click();
  await collectionDialog.waitFor({ state: "hidden" });
  await desktop.getByText(new RegExp(expectedOutstanding)).first().waitFor();

  await desktop.goto(`${base}/app/sales/orders/so-4`, { waitUntil: "networkidle" });
  await desktop.getByRole("button", { name: "Create Invoice", exact: true }).click();
  await desktop.getByRole("dialog").getByRole("button", { name: "Create Draft Invoice" }).click();
  await desktop.getByRole("dialog").waitFor({ state: "hidden" });
  await desktop.getByRole("button", { name: "Approve", exact: true }).click();
  await desktop.getByRole("button", { name: "Record Collection", exact: true }).waitFor();
  await desktop.getByRole("button", { name: "Cancel", exact: true }).click();
  await desktop.getByRole("dialog").getByLabel("Cancellation Reason").fill("Replace the draft details after management review.");
  await desktop.getByRole("dialog").getByRole("button", { name: "Cancel Invoice", exact: true }).click();
  await desktop.getByRole("dialog").waitFor({ state: "hidden" });
  await desktop.getByRole("button", { name: "Create Invoice", exact: true }).waitFor();
  assert.equal(await desktop.getByRole("button", { name: "Record Collection", exact: true }).count(), 0);

  await desktop.goto(`${base}/app/sales/orders/so-1`, { waitUntil: "networkidle" });
  await desktop.getByRole("button", { name: "Order Details", exact: true }).click();
  await desktop.getByRole("dialog").getByLabel(/^Delivery Instruction/).fill("Lifecycle smoke: deliver to the central medical store.");
  await desktop.getByRole("button", { name: "Save Order Receiving Details" }).click();
  await desktop.getByRole("dialog").waitFor({ state: "hidden" });
  await desktop.getByRole("button", { name: "New Delivery", exact: true }).click();
  await desktop.getByRole("dialog").getByLabel(/Delivery Qty/).fill("60");
  await desktop.getByRole("dialog").getByRole("button", { name: "Validate FIFO & Dispatch" }).click();
  await desktop.getByRole("dialog").waitFor({ state: "hidden" });
  await capture(desktop, "order-partial-delivery");
  await desktop.close();

  const mobile = await pageFor("u-super", { width: 390, height: 844 });
  await mobile.goto(`${base}/app/sales/orders/so-3`, { waitUntil: "networkidle" });
  await capture(mobile, "order-mobile");
  await mobile.getByRole("button", { name: "Record Collection", exact: true }).click();
  assert.equal(await mobile.evaluate(() => document.body.scrollWidth <= window.innerWidth + 2), true);
  await mobile.screenshot({ path: "artifacts/sales-lifecycle/collection-mobile.png", fullPage: true });
  await mobile.close();

  const own = await pageFor("sales1");
  await own.goto(`${base}/app/sales/orders/so-3`, { waitUntil: "networkidle" });
  await capture(own, "own-order");
  assert.equal(await own.getByRole("heading", { name: "Linked stock movements" }).count(), 0);
  await own.goto(`${base}/app/sales/orders/so-1`, { waitUntil: "networkidle" });
  await own.getByText("This order is outside your sales scope.", { exact: true }).waitFor();
  assert.equal(await own.getByTestId("sales-order-workspace").count(), 0);
  await own.close();

  const md = await pageFor("u-md");
  await md.goto(`${base}/app/sales/orders/so-3`, { waitUntil: "networkidle" });
  await capture(md, "management-order");
  assert.equal(await md.getByRole("button", { name: "New Delivery", exact: true }).count(), 0);
  assert.equal(await md.getByRole("button", { name: "Record Collection", exact: true }).count(), 0);
  await md.close();
  assert.deepEqual(failures, []);
  console.log("Sales lifecycle: registers, linked reports/print/ledger, delivery, invoice approval/cancellation, collection, mobile and own-record scope passed.");
} finally {
  await browser.close();
}
