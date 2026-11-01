import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const externalBase = process.env.API_TEST_BASE_URL;
const testPort = 4300 + (process.pid % 500);
const base = externalBase || "http://127.0.0.1:" + testPort;
const identities = {
  super: { id: "u-super", role: "Super Admin" },
  md: { id: "u-md", role: "Managing Director" },
  import: { id: "u-import", role: "Import Officer" },
  warehouse: { id: "u-warehouse", role: "Warehouse Manager" },
  accounts: { id: "u-accounts", role: "Accounts" },
  salesManager: { id: "u-sales-manager", role: "Sales Manager" },
  sales1: { id: "sales1", role: "Sales Executive" },
  sales2: { id: "sales2", role: "Sales Executive" }
};

let server;
let serverOutput = "";

function rememberOutput(chunk) {
  serverOutput = (serverOutput + chunk.toString()).slice(-12_000);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (server && server.exitCode !== null) throw new Error("Mock API exited before startup.\n" + serverOutput);
    try {
      const response = await fetch(base + "/api/health");
      if (response.ok) return;
    } catch {
      // The child process is still starting.
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("Mock API did not start at " + base + ".\n" + serverOutput);
}

async function api(path, options = {}) {
  const method = options.method || "GET";
  const as = options.as || identities.super;
  const expected = options.expected || 200;
  const response = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", "x-user-id": as.id, "x-role": as.role },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const payload = await response.json();
  assert.equal(response.status, expected, method + " " + path + " returned " + response.status + ": " + payload.message);
  return payload.data;
}

async function rawApi(path, options = {}) {
  const method = options.method || "GET";
  const as = options.as || identities.super;
  const response = await fetch(base + path, {
    method,
    redirect: options.redirect || "manual",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
      "x-user-id": as.id,
      "x-role": as.role
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  assert.equal(response.status, options.expected || 200, method + " " + path + " returned " + response.status);
  return response;
}

function metric(report, group, label) {
  return report[group].find((entry) => entry.label === label)?.value;
}

function table(report, group, id) {
  return report.tables[group].find((entry) => entry.id === id);
}

function businessDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

async function run() {
  const today = businessDate();
  const monthStart = today.slice(0, 7) + "-01";
  const suffix = String(Date.now()).slice(-7);

  console.log("Seed coverage. Every report family has linked representative data");
  const seededReport = await api("/api/reports?from=2026-09-01&to=2026-09-20");
  const emptySeedTables = Object.entries(seededReport.tables).flatMap(([group, reportTables]) => reportTables.filter((entry) => entry.rows.length === 0).map((entry) => `${group}/${entry.id}`));
  assert.deepEqual(emptySeedTables, [], `Seeded report tables must contain representative data: ${emptySeedTables.join(", ")}`);
  const seededMarketing = await api(`/api/reports/marketing?from=${monthStart}&to=${today}&employeeId=all`);
  assert.ok(seededMarketing.tables.every((entry) => entry.rows.length > 0), "Every marketing report strategy needs representative demo rows.");
  const seededPerformance = await api("/api/reports/salespeople?from=2026-09-01&to=2026-09-20&employeeId=all");
  assert.ok(seededPerformance.comparison.length > 0);
  const seededEmployeeActivity = await api("/api/marketing/employees/sales1/snapshot?from=2026-09-01&to=2026-09-20");
  assert.ok(seededEmployeeActivity.recentActivities.length > 0);

  console.log("0. Effective access, delegated employee management and escalation protection");
  const delegatedUsers = await api("/api/settings/users", { as: identities.salesManager });
  assert.ok(delegatedUsers.length > 1);
  assert.equal(delegatedUsers[0].capabilities, undefined);
  assert.equal(delegatedUsers[0].permissionOverrides, undefined);
  await api("/api/settings/decisions", { as: identities.salesManager, expected: 403 });
  await api("/api/reports/export-authorization", { as: identities.salesManager, expected: 403 });
  await api("/api/expense-categories", { method: "POST", as: identities.accounts, expected: 403, body: { name: "Unauthorized Category " + suffix } });
  await api("/api/reports?from=" + monthStart + "&to=" + today, { as: identities.import });
  await api("/api/reports/export-authorization", { as: identities.import });
  await api("/api/audit", { as: identities.import, expected: 403 });

  const delegatedEmployee = await api("/api/settings/users", {
    method: "POST",
    expected: 201,
    as: identities.salesManager,
    body: { name: "Delegated Employee " + suffix, email: "delegated-" + suffix + "@mipro.local", role: "Sales Executive", title: "Sales Executive", department: "Sales", territory: "Dhaka", employeeCode: "SE-" + suffix, status: "Active" }
  });
  assert.equal(delegatedEmployee.role, "Sales Executive");
  assert.equal((await api("/api/settings/users/" + delegatedEmployee.id, { method: "PATCH", as: identities.salesManager, body: { territory: "Dhaka North", status: "Pending" } })).status, "Pending");
  await api("/api/settings/users", { method: "POST", as: identities.salesManager, expected: 403, body: { name: "Escalation Attempt", email: "escalate-" + suffix + "@mipro.local", role: "Accounts", title: "Accounts", department: "Accounts" } });
  await api("/api/settings/users/" + delegatedEmployee.id, { method: "PATCH", as: identities.salesManager, expected: 403, body: { role: "Accounts" } });
  await api("/api/settings/users/u-super", { method: "PATCH", as: identities.salesManager, expected: 403, body: { status: "Inactive" } });
  await api("/api/settings/users/u-super", { method: "PATCH", as: identities.super, expected: 409, body: { status: "Inactive" } });

  const liveAccessUser = await api("/api/settings/users", {
    method: "POST",
    expected: 201,
    as: identities.super,
    body: { name: "Live Access User " + suffix, email: "live-access-" + suffix + "@mipro.local", role: "Managing Director", title: "Access Test", department: "Management", status: "Active", capabilities: [], permissionOverrides: [] }
  });
  const liveIdentity = { id: liveAccessUser.id, role: "Managing Director" };
  assert.equal((await api("/api/me", { as: liveIdentity })).user.role, "Managing Director");
  const reassignedUser = await api("/api/settings/users/" + liveAccessUser.id, {
    method: "PATCH",
    as: identities.super,
    body: { ...liveAccessUser, role: "Warehouse Manager" }
  });
  assert.equal(reassignedUser.role, "Warehouse Manager");
  assert.equal((await api("/api/me", { as: liveIdentity })).user.role, "Warehouse Manager", "The server must refresh an already-open session from the stored user, not its stale role header.");
  await api("/api/customers", { as: liveIdentity, expected: 403 });
  await api("/api/inventory/batches", { as: liveIdentity });

  await api("/api/settings/users/" + liveAccessUser.id, {
    method: "PATCH",
    as: identities.super,
    body: { permissionOverrides: [{ permission: "customers", action: "view", effect: "ALLOW" }, { permission: "inventory", action: "view", effect: "DENY" }] }
  });
  await api("/api/customers", { as: liveIdentity });
  await api("/api/inventory/batches", { as: liveIdentity, expected: 403 });
  await api("/api/settings/users/" + liveAccessUser.id, { method: "PATCH", as: identities.super, body: { status: "Inactive" } });
  await api("/api/me", { as: liveIdentity, expected: 401 });

  console.log("1. PO-first import, authoritative status and server-derived item bases");
  const importRecord = await api("/api/imports", {
    method: "POST",
    expected: 201,
    as: identities.import,
    body: {
      supplierId: "sup-renhe",
      poNumber: "PO-FLOW-" + suffix,
      poDate: today,
      notes: "Created before PI and LC for the integrity flow.",
      items: [
        { id: "flow-item-a-" + suffix, productId: "prd-d17h", quantity: "100", currency: "USD", fobUnitForeign: "0", exchangeRate: "0", fobTotalBdt: "999999.99", cbmPerCarton: "0", cartonCount: "0", totalCbm: "9999" },
        { id: "flow-item-b-" + suffix, productId: "prd-bts", quantity: "200", currency: "USD", fobUnitForeign: "0", exchangeRate: "0", fobTotalBdt: "999999.99", cbmPerCarton: "0", cartonCount: "0", totalCbm: "9999" }
      ]
    }
  });
  assert.equal(importRecord.status, "Draft");
  assert.match(importRecord.primaryReference, /^IMP-2026-/);
  assert.equal(importRecord.paymentMode, "Pending");
  assert.equal(importRecord.items[0].fobTotalBdt, "0.00");
  assert.equal(importRecord.items[0].totalCbm, "0.0000");

  await api("/api/imports/" + importRecord.id, { method: "PATCH", as: identities.import, expected: 422, body: { status: "Received" } });
  const protectedReference = await api("/api/imports/" + importRecord.id, { method: "PATCH", as: identities.import, body: { primaryReference: "FAKE-LC" } });
  assert.notEqual(protectedReference.primaryReference, "FAKE-LC");
  const cancellableDraft = await api("/api/imports", {
    method: "POST",
    expected: 201,
    as: identities.import,
    body: { supplierId: "sup-renhe", poNumber: "PO-CANCEL-" + suffix, poDate: today, items: [{ productId: "prd-d17h", quantity: "1", fobUnitForeign: "0", exchangeRate: "0", cbmPerCarton: "0", cartonCount: "0" }] }
  });
  const cancelledDraft = await api("/api/imports/" + cancellableDraft.id + "/transition", { method: "POST", as: identities.import, body: { status: "Cancelled" } });
  assert.equal(cancelledDraft.status, "Cancelled");
  await api("/api/imports/" + cancellableDraft.id, { method: "PATCH", as: identities.import, expected: 423, body: { notes: "Cancelled cases are locked." } });
  await api("/api/imports/" + cancellableDraft.id, { method: "DELETE", as: identities.import });

  const withPi = await api("/api/imports/" + importRecord.id, {
    method: "PATCH",
    as: identities.import,
    body: { piNumber: "PI-FLOW-" + suffix, piDate: today }
  });
  assert.equal(withPi.status, "PI Received");
  assert.match(withPi.primaryReference, /^IMP-2026-/);

  const lcReference = "LC-FLOW-" + suffix;
  const withLc = await api("/api/imports/" + importRecord.id, {
    method: "PATCH",
    as: identities.import,
    body: {
      paymentMode: "LC",
      lcNumber: lcReference,
      lcAmount: "540.00",
      lcOpenDate: today,
      lcExpiryDate: "2027-02-28",
      bank: "City Bank PLC",
      currency: "USD",
      exchangeRate: "122.50",
      rateDate: today,
      rateSource: "Test bank snapshot",
      productionFollowUp: "Supplier confirmed production slot.",
      commercialInvoiceNumber: "CI-" + suffix,
      blNumber: "BL-" + suffix,
      containerNumber: "CONT-" + suffix,
      containerType: "20 GP",
      vessel: "MV Integrity",
      etd: today,
      eta: "2026-09-20"
    }
  });
  assert.equal(withLc.status, "LC/TT Opened");
  assert.equal(withLc.primaryReference, lcReference);
  const duplicateLcDraft = await api("/api/imports", {
    method: "POST",
    expected: 201,
    as: identities.import,
    body: { supplierId: "sup-renhe", poNumber: "PO-DUPLC-" + suffix, poDate: today, items: [{ productId: "prd-d17h", quantity: "1", fobUnitForeign: "0", exchangeRate: "0", cbmPerCarton: "0", cartonCount: "0" }] }
  });
  await api("/api/imports/" + duplicateLcDraft.id, { method: "PATCH", as: identities.import, expected: 409, body: { paymentMode: "LC", lcNumber: lcReference } });
  await api("/api/imports/" + duplicateLcDraft.id, { method: "DELETE", as: identities.import });
  assert.equal((await api("/api/imports/" + importRecord.id + "/transition", { method: "POST", as: identities.import, body: { status: "In Production" } })).status, "In Production");
  assert.equal((await api("/api/imports/" + importRecord.id + "/transition", { method: "POST", as: identities.import, body: { status: "Shipped" } })).status, "Shipped");
  await api("/api/imports/" + importRecord.id + "/transition", { method: "POST", as: identities.import, expected: 409, body: { status: "Closed" } });

  await api("/api/imports/" + importRecord.id + "/items/" + importRecord.items[0].id, {
    method: "PATCH",
    as: identities.import,
    expected: 422,
    body: { quantity: "100", fobUnitForeign: "3.20", exchangeRate: "0", cbmPerCarton: "0.08", cartonCount: "2", cbmMode: "CALCULATED" }
  });
  const itemARecord = await api("/api/imports/" + importRecord.id + "/items/" + importRecord.items[0].id, {
    method: "PATCH",
    as: identities.import,
    body: { quantity: "100", fobUnitForeign: "3.20", exchangeRate: "122.50", fobTotalBdt: "1", cbmPerCarton: "0.08", cartonCount: "2", totalCbm: "8", cbmMode: "CALCULATED" }
  });
  const itemBRecord = await api("/api/imports/" + importRecord.id + "/items/" + importRecord.items[1].id, {
    method: "PATCH",
    as: identities.import,
    body: { quantity: "200", fobUnitForeign: "1.10", exchangeRate: "122.50", fobTotalBdt: "1", cbmPerCarton: "0.10", cartonCount: "4", totalCbm: "8", cbmMode: "CALCULATED" }
  });
  assert.equal(itemARecord.items.find((item) => item.id === importRecord.items[0].id).fobTotalBdt, "0.00");
  assert.equal(itemBRecord.items.find((item) => item.id === importRecord.items[1].id).fobTotalBdt, "0.00");
  const authoritativeItems = (await api("/api/imports/" + importRecord.id)).items;
  const itemA = authoritativeItems.find((item) => item.id === importRecord.items[0].id);
  const itemB = authoritativeItems.find((item) => item.id === importRecord.items[1].id);
  assert.equal(itemA.fobTotalBdt, "39200.00");
  assert.equal(itemA.totalCbm, "0.1600");
  assert.equal(itemB.fobTotalBdt, "26950.00");
  assert.equal(itemB.totalCbm, "0.4000");
  const uploadedInvoice = await api("/api/imports/" + importRecord.id + "/documents", {
    method: "POST",
    as: identities.import,
    expected: 201,
    body: {
      type: "Commercial Invoice",
      sensitive: false,
      upload: {
        fileName: "Commercial-Invoice-" + suffix + ".pdf",
        mimeType: "application/pdf",
        sizeBytes: 15,
        fileDataUrl: "data:application/pdf;base64,JVBERi0xLjQKJSVFT0YK"
      }
    }
  });
  const uploadedInvoiceFile = await rawApi("/api/documents/" + uploadedInvoice.id + "/content", { as: identities.import, expected: 200 });
  assert.match(uploadedInvoiceFile.headers.get("content-type") || "", /application\/pdf/);
  assert.equal((await uploadedInvoiceFile.arrayBuffer()).byteLength, 15);
  await api("/api/imports/" + importRecord.id + "/documents", {
    method: "POST",
    as: identities.import,
    expected: 422,
    body: { type: "Other", upload: { fileName: "spoofed.svg", mimeType: "image/svg+xml", sizeBytes: 1, fileDataUrl: "data:image/svg+xml;base64,PHN2Zy8+" } }
  });

  console.log("2. Five allocations, immutable snapshots and receipt integrity");
  const costs = [
    { name: "Sea Freight", category: "Freight", amountForeign: "560.00", currency: "BDT", exchangeRate: "1", allocationMethod: "CBM", appliesToItemIds: [] },
    { name: "Common Bank Cost", category: "Bank Charge", amountForeign: "400.00", currency: "BDT", exchangeRate: "1", allocationMethod: "FOB_VALUE", appliesToItemIds: [] },
    { name: "Unloading Labour", category: "Labour", amountForeign: "300.00", currency: "BDT", exchangeRate: "1", allocationMethod: "QUANTITY", appliesToItemIds: [] },
    { name: "Assessed Duty A", category: "Customs Duty", amountForeign: "500.00", currency: "BDT", exchangeRate: "1", allocationMethod: "PRODUCT_SPECIFIC", appliesToItemIds: [importRecord.items[0].id] },
    { name: "Manual Shared Cost", category: "Other Import Cost", amountForeign: "30.00", currency: "BDT", exchangeRate: "1", allocationMethod: "MANUAL", appliesToItemIds: [], manualSplits: [{ importItemId: importRecord.items[0].id, amountBdt: "10.00" }, { importItemId: importRecord.items[1].id, amountBdt: "20.00" }] }
  ];
  let firstCostId;
  for (const cost of costs) {
    const updated = await api("/api/imports/" + importRecord.id + "/costs", { method: "POST", expected: 201, body: cost });
    if (cost.name === "Sea Freight") firstCostId = updated.costs.find((entry) => entry.name === cost.name).id;
  }
  const preview = await api("/api/imports/" + importRecord.id + "/cost-preview", { method: "POST", body: {} });
  assert.deepEqual(preview.validationErrors, []);
  assert.equal(preview.totalAdditionalCostBdt, "1790.00");
  assert.equal(preview.allocations.length, 9);
  assert.equal(preview.products.reduce((sum, productRow) => sum + Number(productRow.finalTotalBdt), 0).toFixed(2), preview.totalShipmentCostBdt);
  assert.ok(preview.allocations.every((allocation) => allocation.explanation.length > 20));

  const finalizedV1 = await api("/api/imports/" + importRecord.id + "/finalize", { method: "POST", body: {} });
  assert.equal(finalizedV1.snapshot.immutable, true);
  assert.equal(finalizedV1.snapshot.version, 1);
  const v1Total = finalizedV1.snapshot.totalShipmentCostBdt;
  await api("/api/imports/" + importRecord.id, { method: "PATCH", body: { notes: "must remain locked" }, expected: 423 });
  const reopened = await api("/api/imports/" + importRecord.id + "/reopen", { method: "POST", body: { reason: "Correct the final freight invoice before receiving." } });
  assert.equal(reopened.snapshot, undefined);
  assert.equal(reopened.snapshotHistory.length, 1);
  await api("/api/imports/" + importRecord.id + "/costs/" + firstCostId, { method: "PATCH", body: { amountForeign: "570.00" } });
  const finalizedV2 = await api("/api/imports/" + importRecord.id + "/finalize", { method: "POST", body: {} });
  assert.equal(finalizedV2.snapshot.version, 2);
  assert.equal(finalizedV2.snapshotHistory.length, 2);
  assert.equal(finalizedV2.snapshotHistory[0].totalShipmentCostBdt, v1Total);
  assert.equal(finalizedV2.snapshotHistory[0].immutable, true);

  const receiptLineA = { importItemId: importRecord.items[0].id, productId: "spoof", productName: "Spoof", quantityReceived: "40", quantityRejected: "0", lotNumber: "FLOW-A1-" + suffix, batchNumber: "FLOW-A1-" + suffix, manufacturingDate: "2026-06-01", expiryDate: "2029-06-01", warehouse: "MIPRO Main Warehouse", location: "Rack A-01", landedCostPerUnit: "999999" };
  const receiptLineB = { importItemId: importRecord.items[1].id, productId: "spoof", productName: "Spoof", quantityReceived: "200", quantityRejected: "0", lotNumber: "FLOW-B1-" + suffix, batchNumber: "FLOW-B1-" + suffix, manufacturingDate: "2026-06-01", expiryDate: "2029-06-01", warehouse: "MIPRO Main Warehouse", location: "Rack B-01", landedCostPerUnit: "999999" };
  const firstReceipt = await api("/api/imports/" + importRecord.id + "/receive", { method: "POST", as: identities.warehouse, expected: 201, body: { receivedDate: today, lines: [receiptLineA, receiptLineB] } });
  assert.ok(firstReceipt.lines.every((line) => line.productName !== "Spoof"));
  assert.ok(firstReceipt.lines.every((line) => line.landedCostPerUnit !== "999999"));
  assert.equal((await api("/api/imports/" + importRecord.id)).status, "Partially Received");
  await api("/api/imports/" + importRecord.id + "/reopen", { method: "POST", expected: 409, body: { reason: "This must be blocked after receiving." } });
  await api("/api/imports/" + importRecord.id + "/receive", { method: "POST", as: identities.warehouse, expected: 422, body: { receivedDate: today, lines: [{ ...receiptLineA, quantityReceived: "61", lotNumber: "OVER-" + suffix, batchNumber: "OVER-" + suffix }] } });
  await api("/api/imports/" + importRecord.id + "/receive", { method: "POST", as: identities.warehouse, expected: 409, body: { receivedDate: today, lines: [{ ...receiptLineA, quantityReceived: "10" }] } });
  await api("/api/imports/" + importRecord.id + "/receive", { method: "POST", as: identities.warehouse, expected: 422, body: { receivedDate: today, lines: [{ ...receiptLineA, quantityReceived: "1", lotNumber: "BAD-DATE-" + suffix, batchNumber: "BAD-DATE-" + suffix, manufacturingDate: "2028-01-01", expiryDate: "2027-01-01" }] } });
  await api("/api/imports/" + importRecord.id + "/receive", {
    method: "POST",
    as: identities.warehouse,
    expected: 201,
    body: { receivedDate: today, lines: [{ ...receiptLineA, quantityReceived: "60", lotNumber: "FLOW-A2-" + suffix, batchNumber: "FLOW-A2-" + suffix, manufacturingDate: "2026-06-02", expiryDate: "2029-06-02", location: "Rack A-02" }] }
  });
  assert.equal((await api("/api/imports/" + importRecord.id)).status, "Received");
  const importBatches = (await api("/api/inventory/batches")).filter((batch) => batch.sourceImportId === importRecord.id);
  assert.equal(importBatches.length, 3);
  assert.ok(importBatches.every((batch) => batch.sourceType === "Import Receipt"));
  assert.ok(importBatches.every((batch) => batch.landedCostPerUnit !== "999999"));
  const closedImport = await api("/api/imports/" + importRecord.id + "/transition", { method: "POST", as: identities.import, body: { status: "Closed" } });
  assert.equal(closedImport.status, "Closed");
  await api("/api/imports/" + importRecord.id + "/receive", { method: "POST", as: identities.warehouse, expected: 423, body: { receivedDate: today, lines: [receiptLineA] } });

  console.log("3. Opening stock, expired exclusion and automatic multi-batch FIFO");
  const product = await api("/api/products", {
    method: "POST",
    expected: 201,
    body: { code: "FLOW-" + suffix, name: "FIFO Flow Device " + suffix, category: "Medical Consumable", manufacturer: "Demo Medical", country: "China", unit: "pcs", packSize: "1 pc", hsCode: "9018.90", standardSalePrice: "100.00", reorderLevel: "10", active: true, imageUrl: "/products/dialyzer.png" }
  });
  async function openingBatch(name, quantity, receivedDate, expiryDate) {
    return api("/api/settings/opening-stock", {
      method: "POST",
      expected: 201,
      body: { productId: product.id, quantity, lotNumber: name + "-LOT-" + suffix, batchNumber: name + "-BAT-" + suffix, manufacturingDate: "2024-01-01", expiryDate, receivedDate, sourceReference: "LEGACY-" + suffix, warehouse: "MIPRO Main Warehouse", location: "FIFO Test", landedCostPerUnit: "40.00" }
    });
  }
  const expiredBatch = await openingBatch("EXPIRED", "30", "2024-01-10", "2025-01-01");
  const oldestBatch = await openingBatch("OLD", "30", "2025-01-10", "2030-01-01");
  const nextBatch = await openingBatch("NEXT", "30", "2025-02-10", "2030-02-01");
  await api("/api/settings/opening-stock", { method: "POST", expected: 409, body: { productId: product.id, quantity: "1", lotNumber: "Duplicate", batchNumber: oldestBatch.batchNumber, manufacturingDate: "2024-01-01", expiryDate: "2030-01-01", receivedDate: "2025-01-01", sourceReference: "DUPLICATE", warehouse: "MIPRO Main Warehouse", landedCostPerUnit: "40" } });

  const fifoPlan = await api("/api/inventory/dispatch-preview", { method: "POST", body: { productId: product.id, quantity: "60", date: today, batchId: "AUTO" } });
  assert.deepEqual(fifoPlan.allocations.map((entry) => entry.batchId), [oldestBatch.id, nextBatch.id]);
  assert.deepEqual(fifoPlan.allocations.map((entry) => entry.quantity), ["30.0000", "30.0000"]);
  assert.equal(fifoPlan.availableQuantity, "60.0000");
  assert.ok(!fifoPlan.allocations.some((entry) => entry.batchId === expiredBatch.id));
  const overridePlan = await api("/api/inventory/dispatch-preview", { method: "POST", body: { productId: product.id, quantity: "10", date: today, batchId: nextBatch.id } });
  assert.equal(overridePlan.requiresOverride, true);
  assert.match(overridePlan.warning, /Older matching lot/);

  const customer = await api("/api/customers", {
    method: "POST",
    expected: 201,
    body: { name: "FIFO Test Clinic " + suffix, type: "Clinic", contactPerson: "Store Officer", phone: "+880 1700 000000", address: "Dhaka", territory: "Dhaka North", assignedSalesUserId: identities.sales1.id, paymentTerms: "30 days", creditLimit: "50000.00" }
  });
  const quote = await api("/api/quotations", {
    method: "POST",
    expected: 201,
    body: { date: today, customerId: customer.id, validityDays: 15, paymentTerms: "30 days", remarks: "Automatic FIFO split test", lines: [{ productId: product.id, quantity: "60", unitPrice: "100.00", discount: "0.00", lineTotal: "1.00" }] }
  });
  assert.equal(quote.total, "6000.00");
  const profitPreview = await api("/api/sales/profit-preview", { method: "POST", body: { lines: quote.lines } });
  assert.equal(profitPreview.expectedCogs, "2400.00");
  assert.equal(profitPreview.grossProfit, "3600.00");
  assert.equal(profitPreview.marginPercent, "60.00");
  await api("/api/sales/profit-preview", { method: "POST", as: identities.sales1, expected: 403, body: { lines: quote.lines } });
  await api("/api/quotations/" + quote.id, { method: "PATCH", body: { status: "Accepted" } });
  const order = await api("/api/quotations/" + quote.id + "/convert", { method: "POST", expected: 201, body: { deliveryInstruction: "Deliver to medical store" } });
  const startingWorkspace = await api(`/api/orders/${order.id}/workspace`);
  assert.equal(startingWorkspace.quotation.id, quote.id);
  assert.equal(startingWorkspace.stages.delivery, "Not Started");
  assert.equal(startingWorkspace.totals.outstandingValue, "0.00");
  await api(`/api/orders/${order.id}/workspace`, { as: identities.sales2, expected: 403 });
  await api(`/api/orders/${order.id}/workspace`, { as: identities.warehouse, expected: 403 });
  await api(`/api/orders/${order.id}/workspace`, { as: identities.import, expected: 403 });
  await api("/api/orders/missing-order/workspace", { expected: 404 });
  const warehouseUser = (await api("/api/settings/users")).find((entry) => entry.id === identities.warehouse.id);
  await api(`/api/settings/users/${warehouseUser.id}`, { method: "PATCH", body: { permissionOverrides: [...(warehouseUser.permissionOverrides ?? []), { permission: "sales", action: "view", effect: "ALLOW" }] } });
  const warehouseWorkspace = await api(`/api/orders/${order.id}/workspace`, { as: identities.warehouse });
  assert.equal(warehouseWorkspace.financialVisible, false);
  assert.equal(warehouseWorkspace.totals, undefined);
  assert.equal(warehouseWorkspace.order.lines[0].unitPrice, "Restricted");
  assert.deepEqual(warehouseWorkspace.invoices, []);
  await api(`/api/settings/users/${warehouseUser.id}`, { method: "PATCH", body: { permissionOverrides: warehouseUser.permissionOverrides ?? [] } });
  const partialDelivery = await api("/api/deliveries", { method: "POST", expected: 201, as: identities.salesManager,
    body: { orderId: order.id, date: today, remarks: "Partial lifecycle dispatch", lines: [{ ...order.lines[0], quantity: "20", batchId: "AUTO" }] }
  });
  const partialWorkspace = await api(`/api/orders/${order.id}/workspace`);
  assert.equal(partialWorkspace.stages.delivery, "Partial");
  assert.equal(partialWorkspace.fulfilment[0].remainingToDeliverQty, "40.0000");
  assert.equal(partialWorkspace.totals.deliveredValue, "2000.00");
  assert.equal(partialWorkspace.totals.outstandingValue, "0.00");
  await api("/api/deliveries", {
    method: "POST",
    expected: 409,
    as: identities.salesManager,
    body: { orderId: order.id, date: today, remarks: "Unauthorized newer-lot attempt", receiverName: "Store Officer", overrideReason: "Skip older stock", lines: [{ ...order.lines[0], quantity: "10", batchId: nextBatch.id }] }
  });
  const delivery = await api("/api/deliveries", {
    method: "POST",
    expected: 201,
    as: identities.salesManager,
    body: { orderId: order.id, date: today, remarks: "FIFO split delivery", receiverName: "Store Officer", lines: [{ ...order.lines[0], quantity: "40", batchId: "AUTO" }] }
  });
  assert.equal(delivery.lines.length, 2);
  assert.deepEqual(delivery.lines.map((entry) => entry.quantity), ["10.0000", "30.0000"]);
  const batchesAfterDelivery = await api("/api/inventory/batches");
  assert.equal(batchesAfterDelivery.find((entry) => entry.id === oldestBatch.id).quantityAvailable, "0.00");
  assert.equal(batchesAfterDelivery.find((entry) => entry.id === nextBatch.id).quantityAvailable, "0.00");
  assert.equal(batchesAfterDelivery.find((entry) => entry.id === expiredBatch.id).quantityAvailable, "30.0000");
  const postedOrder = (await api("/api/orders")).find((entry) => entry.id === order.id);
  assert.equal(postedOrder.status, "Delivered");
  assert.equal(postedOrder.due, "0.00");
  assert.equal((await api("/api/customers")).find((entry) => entry.id === customer.id).currentDue, "0.00");
  const invoice = await api("/api/invoices", { method: "POST", expected: 201, body: { orderId: order.id, deliveryIds: [partialDelivery.id, delivery.id], date: today, remarks: "Generated after confirmed delivery" } });
  assert.equal(invoice.status, "Draft");
  assert.equal(invoice.total, "6000.00");
  assert.equal((await api(`/api/orders/${order.id}/workspace`)).stages.invoice, "Draft Pending");
  assert.equal((await api("/api/customers")).find((entry) => entry.id === customer.id).currentDue, "0.00");
  const approvedInvoice = await api("/api/invoices/" + invoice.id + "/approve", { method: "POST" });
  assert.equal(approvedInvoice.status, "Approved");
  assert.equal((await api("/api/customers")).find((entry) => entry.id === customer.id).currentDue, "6000.00");
  assert.equal((await api("/api/orders")).find((entry) => entry.id === order.id).due, "6000.00");
  assert.equal((await api(`/api/orders/${order.id}/workspace`)).stages.invoice, "Complete");
  await api(`/api/invoices/${invoice.id}/approve`, { method: "POST", expected: 409 });

  console.log("4. Sales ownership and collection/account integrity");
  await api("/api/quotations", { method: "POST", as: identities.sales1, expected: 403, body: { date: today, customerId: "cus-labaid", validityDays: 15, paymentTerms: "30 days", lines: [{ productId: "prd-d17h", quantity: "1", unitPrice: "700", discount: "0" }] } });
  await api("/api/quotations/quo-2", { method: "PATCH", as: identities.sales1, expected: 403, body: { remarks: "Cross-owner edit" } });
  await api("/api/quotations/quo-2/convert", { method: "POST", as: identities.sales1, expected: 403, body: {} });
  await api("/api/collections", { method: "POST", as: identities.sales1, expected: 403, body: { customerId: "cus-labaid", date: today, amount: "1", paymentMode: "Cash", accountId: "acc-cash" } });
  const selfAssignedCustomer = await api("/api/customers", {
    method: "POST",
    as: identities.sales1,
    expected: 201,
    body: { name: "Assigned Customer " + suffix, type: "Clinic", contactPerson: "Owner", phone: "+880 1711 111111", address: "Dhaka", territory: "Dhaka North", assignedSalesUserId: identities.sales2.id, paymentTerms: "Cash", creditLimit: "1000" }
  });
  assert.equal(selfAssignedCustomer.assignedSalesUserId, identities.sales1.id);
  assert.ok((await api("/api/customers", { as: identities.sales1 })).every((entry) => entry.assignedSalesUserId === identities.sales1.id));
  await api("/api/accounts", { as: identities.sales1, expected: 403 });

  await api("/api/collections", { method: "POST", expected: 422, body: { customerId: customer.id, orderId: order.id, date: today, amount: "100", paymentMode: "Credit", accountId: "acc-city" } });
  await api("/api/collections", { method: "POST", expected: 422, body: { customerId: customer.id, orderId: order.id, date: today, amount: "100", paymentMode: "Cash" } });
  await api("/api/collections", { method: "POST", expected: 422, body: { customerId: customer.id, orderId: order.id, date: today, amount: "100", paymentMode: "Bank Transfer", accountId: "missing-account", referenceNumber: "BANK-1" } });
  await api("/api/collections", { method: "POST", expected: 422, body: { customerId: customer.id, orderId: order.id, date: today, amount: "100", paymentMode: "Bank Transfer", accountId: "acc-city" } });
  const cityBefore = (await api("/api/settings/accounts")).find((entry) => entry.id === "acc-city");
  const partialCollection = await api("/api/collections", { method: "POST", expected: 201,
    body: { customerId: customer.id, invoiceId: invoice.id, date: today, amount: "1500", paymentMode: "Bank Transfer", accountId: "acc-city", referenceNumber: "PART-" + suffix }
  });
  assert.equal(partialCollection.orderId, order.id, "Invoice-only payment must infer and persist the order");
  const collectedWorkspace = await api(`/api/orders/${order.id}/workspace`);
  assert.equal(collectedWorkspace.stages.collection, "Partial");
  assert.equal(collectedWorkspace.order.amountReceived, "1500.00");
  assert.equal(collectedWorkspace.order.due, "4500.00");
  assert.equal(collectedWorkspace.totals.collectedValue, "1500.00");
  await api(`/api/invoices/${invoice.id}/cancel`, { method: "POST", expected: 409, body: { reason: "Cannot cancel a collected invoice" } });
  await api("/api/collections", { method: "POST", expected: 422, body: { customerId: customer.id, invoiceId: invoice.id, orderId: "so-2", date: today, amount: "1", paymentMode: "Cash", accountId: "acc-cash" } });
  const collection = await api("/api/collections", {
    method: "POST",
    expected: 201,
    body: { customerId: customer.id, invoiceId: invoice.id, date: today, amount: "4500", paymentMode: "Bank Transfer", accountId: "acc-city", referenceNumber: "BANK-" + suffix, remarks: "Full invoice settlement" }
  });
  assert.match(collection.receiptNumber, /^MR-2026-/);
  const cityAfter = (await api("/api/settings/accounts")).find((entry) => entry.id === "acc-city");
  assert.equal(Number(cityAfter.balance) - Number(cityBefore.balance), 6000);
  assert.equal((await api("/api/customers")).find((entry) => entry.id === customer.id).currentDue, "0.00");
  assert.equal((await api("/api/orders")).find((entry) => entry.id === order.id).due, "0.00");
  const settledWorkspace = await api(`/api/orders/${order.id}/workspace`);
  assert.equal(settledWorkspace.stages.collection, "Paid");
  assert.equal(settledWorkspace.stockMovements.length, 3);
  assert.equal(settledWorkspace.totals.collectedValue, "6000.00");
  assert.equal((await api(`/api/sales/references/Collection/${collection.id}`)).id, order.id);
  assert.ok((await api("/api/account-transactions")).some((entry) => entry.sourceId === collection.id && entry.direction === "In"));
  const customerLedger = await api("/api/customers/" + customer.id + "/ledger");
  assert.ok(customerLedger.entries.some((entry) => entry.type === "Invoice" && entry.reference === invoice.invoiceNumber));

  console.log("5. Opening balances, running ledger and canonical migration data");
  const migrationCustomer = await api("/api/customers", {
    method: "POST",
    expected: 201,
    body: { name: "Legacy Ledger Customer " + suffix, type: "Hospital", contactPerson: "Accounts", phone: "+880 1722 222222", address: "Dhaka", territory: "Dhaka Central", assignedSalesUserId: identities.sales2.id, paymentTerms: "45 days", creditLimit: "200000.00" }
  });
  const openingBalance = await api("/api/settings/customer-opening-balances", {
    method: "POST",
    expected: 201,
    body: { customerId: migrationCustomer.id, date: "2026-01-01", historicalSales: "1000.00", historicalCollected: "400.00", openingDue: "600.00", reference: "LEGACY-LEDGER-" + suffix, remarks: "Verified migration opening." }
  });
  assert.equal(openingBalance.openingDue, "600.00");
  await api("/api/settings/customer-opening-balances", { method: "POST", expected: 409, body: { customerId: migrationCustomer.id, date: "2026-01-01", historicalSales: "1000", historicalCollected: "400", openingDue: "600" } });
  const migratedCustomer = (await api("/api/customers")).find((entry) => entry.id === migrationCustomer.id);
  assert.equal(migratedCustomer.totalSales, "1000.00");
  assert.equal(migratedCustomer.totalCollected, "400.00");
  assert.equal(migratedCustomer.currentDue, "600.00");
  const ledger = await api("/api/customers/" + migrationCustomer.id + "/ledger");
  assert.equal(ledger.entries[0].type, "Opening Due");
  assert.equal(ledger.entries[0].runningDue, "600.00");
  await api("/api/customers/" + migrationCustomer.id + "/ledger", { as: identities.sales1, expected: 403 });
  const alias = await api("/api/settings/product-aliases", { method: "POST", expected: 201, body: { aliasText: "FIFO DEVICE OLD " + suffix, productId: product.id, source: "Integration mapping" } });
  assert.equal(alias.productId, product.id);

  console.log("6. Expense isolation, TA/DA math and date-scoped reports");
  const snapshotTotal = (await api("/api/imports/" + importRecord.id)).snapshot.totalShipmentCostBdt;
  const reportBefore = await api("/api/reports?from=" + monthStart + "&to=" + today);
  const inactiveAccount = await api("/api/settings/accounts", { method: "POST", expected: 201, body: { name: "Inactive Test Account " + suffix, type: "Cash", accountNumber: "N/A", balance: "1000.00", active: false } });
  await api("/api/expenses", { method: "POST", as: identities.accounts, expected: 422, body: { date: today, categoryId: "ec-2", subtype: "General", amount: "10", paidFromAccountId: inactiveAccount.id, remarks: "Must not post" } });
  await api("/api/expenses", { method: "POST", as: identities.accounts, expected: 422, body: { date: today, categoryId: "missing", subtype: "General", amount: "10", paidFromAccountId: "acc-cash", remarks: "Must not post" } });
  const reversibleExpense = await api("/api/expenses", { method: "POST", as: identities.accounts, expected: 201, body: { date: today, categoryId: "ec-2", subtype: "General", amount: "137.99", paidFromAccountId: "acc-cash", remarks: "Temporary report integrity expense" } });
  const reportWithExpense = await api("/api/reports?from=" + monthStart + "&to=" + today);
  assert.equal((Number(metric(reportWithExpense, "expenses", "Operating expenses")) - Number(metric(reportBefore, "expenses", "Operating expenses"))).toFixed(2), "137.99");
  await api("/api/expenses/" + reversibleExpense.id + "/reverse", { method: "POST", as: identities.accounts, body: { reason: "Integration test reversal" } });
  const reportAfterReversal = await api("/api/reports?from=" + monthStart + "&to=" + today);
  assert.equal(metric(reportAfterReversal, "expenses", "Operating expenses"), metric(reportBefore, "expenses", "Operating expenses"));
  const taDa = await api("/api/expenses", {
    method: "POST",
    as: identities.accounts,
    expected: 201,
    body: { date: today, categoryId: "ec-4", subtype: "TA/DA", expenseFor: "Employee", employeeId: identities.sales1.id, amount: "999999", taAmount: "20", daAmount: "30", paidFromAccountId: "acc-cash", remarks: "Approved customer visit expense" }
  });
  assert.equal(taDa.amount, "50.00");
  const cashBeforeAdvance = (await api("/api/settings/accounts")).find((entry) => entry.id === "acc-cash");
  const advance = await api("/api/account-transactions", { method: "POST", as: identities.accounts, expected: 201, body: { date: today, accountId: "acc-cash", sourceType: "Advance", direction: "Out", amount: "250.00", partyName: "Rafiq Ahmed", reference: "ADV-" + suffix, description: "Field advance", remarks: "Recover through settlement" } });
  assert.match(advance.voucherNumber, /^DV-2026-/);
  const cashAfterAdvance = (await api("/api/settings/accounts")).find((entry) => entry.id === "acc-cash");
  assert.equal(Number(cashBeforeAdvance.balance) - Number(cashAfterAdvance.balance), 250);
  assert.equal((await api("/api/imports/" + importRecord.id)).snapshot.totalShipmentCostBdt, snapshotTotal);

  const currentReport = await api("/api/reports?from=" + monthStart + "&to=" + today);
  assert.deepEqual(currentReport.period, { from: monthStart, to: today });
  assert.ok(table(currentReport, "imports", "import-register").rows.some((row) => row.reference === lcReference));
  assert.ok(table(currentReport, "sales", "sales-by-product").rows.some((row) => row.product === product.name));
  assert.ok(table(currentReport, "sales", "invoice-register").rows.some((row) => row.invoice === invoice.invoiceNumber));
  assert.ok(table(currentReport, "sales", "sales-sheet").rows.some((row) => row.invoice === invoice.invoiceNumber));
  assert.ok(table(currentReport, "sales", "sales-by-salesperson").rows.length > 0);
  assert.ok(table(currentReport, "sales", "sales-order-register").rows.length > 0);
  assert.ok(table(currentReport, "sales", "order-fulfilment").rows.some((row) => Number(row.ordered) >= Number(row.delivered)));
  assert.ok(table(currentReport, "sales", "sales-by-family").rows.length > 0);
  assert.ok(table(currentReport, "sales", "gross-profit-product").rows.length > 0);
  assert.ok(table(currentReport, "inventory", "stock-summary").rows.length > 0);
  assert.ok(table(currentReport, "inventory", "item-details").rows.some((row) => row.product === product.name));
  assert.ok(table(currentReport, "imports", "import-po-register").rows.some((row) => row.reference === lcReference));
  assert.ok(table(currentReport, "imports", "imported-product-summary").rows.some((row) => row.product === importRecord.items[0].productName));
  assert.ok(table(currentReport, "imports", "supplier-import-summary").rows.length > 0);
  assert.ok(table(currentReport, "imports", "po-receipt-difference").rows.some((row) => row.product === importRecord.items[0].productName));
  assert.ok(table(currentReport, "expenses", "monthly-ac-summary").rows.length > 0);
  assert.ok(table(currentReport, "expenses", "day-book").rows.length > 0);
  assert.ok(table(currentReport, "expenses", "cash-movement-summary").rows.length > 0);
  assert.ok(table(currentReport, "sales", "customer-ledger").rows.length > 0);
  assert.ok(table(currentReport, "expenses", "daily-expenditure").rows.some((row) => row.expenseFor === "Rafiq Ahmed"));
  assert.ok(table(currentReport, "expenses", "expense-by-person").rows.some((row) => row.employee === "Rafiq Ahmed"));
  assert.ok(table(currentReport, "expenses", "ta-da").rows.some((row) => row.employee === "Rafiq Ahmed"));
  assert.ok(table(currentReport, "sales", "delivered-sales").columns.some((column) => column.key === "profit"));
  const accountsReport = await api("/api/reports?from=" + monthStart + "&to=" + today, { as: identities.accounts });
  assert.ok(!accountsReport.sales.some((entry) => entry.label === "Realized gross profit"));
  assert.ok(!table(accountsReport, "sales", "delivered-sales").columns.some((column) => column.key === "profit"));
  assert.deepEqual(accountsReport.importCosts, []);
  assert.deepEqual(accountsReport.inventory, []);
  assert.deepEqual(accountsReport.tables.imports.map((entry) => entry.id), ["supplier-list", "supplier-statement"]);
  assert.ok(!accountsReport.tables.imports.some((entry) => ["import-po-register", "landed-cost-summary", "po-receipt-difference"].includes(entry.id)));
  assert.deepEqual(accountsReport.tables.inventory, []);
  const historyReport = await api("/api/reports?from=2026-07-01&to=" + today);
  assert.ok(table(historyReport, "sales", "delivery-invoice-exceptions").rows.some((row) => row.type === "Delivered not invoiced"));
  const scopedSalesmanReport = await api("/api/reports?from=2026-08-01&to=" + today + "&employeeId=" + identities.sales1.id, { as: identities.salesManager });
  assert.ok(table(scopedSalesmanReport, "sales", "salesman-ledger").rows.every((row) => row.salesperson === "Rafiq Ahmed"));
  await api("/api/reports?from=2026-08-01&to=" + today + "&employeeId=" + identities.sales2.id, { as: identities.sales1, expected: 403 });
  const emptyReport = await api("/api/reports?from=2035-01-01&to=2035-01-31");
  assert.equal(metric(emptyReport, "sales", "Approved invoice sales"), "0.00");
  assert.equal(metric(emptyReport, "sales", "Collections received"), "0.00");
  assert.equal(metric(emptyReport, "expenses", "Operating expenses"), "0.00");
  assert.equal(table(emptyReport, "sales", "delivered-sales").rows.length, 0);
  await api("/api/reports?from=2026-09-01&to=2026-08-01", { expected: 422 });

  console.log("7. Role-safe dashboard, dynamic expiry and sensitive redaction");
  const importDashboard = await api("/api/dashboard", { as: identities.import });
  assert.ok(importDashboard.metrics.length <= 6);
  assert.ok(importDashboard.metrics.every((entry) => !["sales", "collection", "due", "expense", "accounts"].includes(entry.id)));
  assert.equal(importDashboard.customerDues.length, 0);
  assert.equal(importDashboard.recentExpenses.length, 0);
  await api("/api/inventory/stock", { as: identities.import, expected: 403 });
  const salesDashboard = await api("/api/dashboard", { as: identities.sales1 });
  assert.ok(salesDashboard.metrics.length <= 6);
  assert.equal(salesDashboard.importAttention.length, 0);
  assert.equal(salesDashboard.recentExpenses.length, 0);
  await api("/api/inventory/stock", { as: identities.sales1, expected: 403 });
  const redactedImport = await api("/api/imports/" + importRecord.id, { as: identities.import });
  assert.equal(redactedImport.costs.length, 0);
  assert.equal(redactedImport.snapshot, undefined);
  assert.ok(redactedImport.items.every((entry) => entry.fobTotalBdt === "0.00"));
  await api("/api/imports/" + importRecord.id + "/cost-preview", { method: "POST", as: identities.import, expected: 403, body: {} });
  const dynamicExpiry = (await api("/api/inventory/batches")).find((entry) => entry.id === expiredBatch.id);
  assert.equal(dynamicExpiry.expiryStatus, "Expired");

  console.log("8. Employee reports, protected documents and contextual AI");
  const performanceAll = await api("/api/reports/salespeople?from=2026-08-01&to=2026-08-31&employeeId=all", { as: identities.salesManager });
  assert.deepEqual(performanceAll.period, { from: "2026-08-01", to: "2026-08-31" });
  assert.ok(performanceAll.comparison.length >= 2);
  assert.ok(performanceAll.comparison.some((entry) => entry.id === identities.sales1.id));
  assert.equal(performanceAll.selected, undefined);
  const employeePerformance = await api("/api/reports/salespeople?from=2026-08-01&to=2026-08-31&employeeId=" + identities.sales1.id, { as: identities.salesManager });
  assert.equal(employeePerformance.selected.employee.id, identities.sales1.id);
  assert.ok(employeePerformance.selected.tables.quotations.rows.length > 0);
  assert.ok(employeePerformance.selected.tables.deliveries.rows.length > 0);
  assert.ok(employeePerformance.selected.tables.collections.rows.length > 0);
  assert.doesNotMatch(JSON.stringify(employeePerformance), /landedCost|fob|grossProfit|profitMargin|supplierPrice/i);
  const ownPerformance = await api("/api/reports/salespeople?from=2026-08-01&to=2026-08-31&employeeId=all", { as: identities.sales1 });
  assert.deepEqual(ownPerformance.employees.map((employee) => employee.id), [identities.sales1.id]);
  assert.deepEqual(ownPerformance.comparison.map((employee) => employee.id), [identities.sales1.id]);
  assert.equal(ownPerformance.selected.employee.id, identities.sales1.id);
  await api("/api/reports/salespeople?from=2026-08-01&to=2026-08-31&employeeId=" + identities.sales2.id, { as: identities.sales1, expected: 403 });
  const ownGeneralReport = await api("/api/reports?from=2026-08-01&to=2026-08-31", { as: identities.sales1 });
  assert.deepEqual(ownGeneralReport.importCosts, []);
  assert.deepEqual(ownGeneralReport.inventory, []);
  assert.deepEqual(ownGeneralReport.expenses, []);
  assert.doesNotMatch(JSON.stringify(ownGeneralReport), /landedCost|fob|grossProfit|profitMargin|supplierPrice/i);

  const normalDocument = await rawApi("/api/documents/doc-pi/content", { as: identities.import, expected: 200 });
  assert.match(normalDocument.headers.get("content-type") || "", /application\/pdf/);
  await rawApi("/api/documents/doc-pi/content", { as: identities.sales1, expected: 403 });
  await rawApi("/api/documents/doc-assess/content", { as: identities.import, expected: 403 });
  await rawApi("/api/documents/doc-cost-frt/content", { as: identities.import, expected: 403 });
  await rawApi("/api/documents/doc-assess/content", { as: identities.super, expected: 200 });
  const expenseReceipt = await rawApi("/api/documents/doc-exp-6/content", { as: identities.accounts, expected: 200 });
  assert.match(expenseReceipt.headers.get("content-type") || "", /image\/png/);
  await rawApi("/api/documents/not-a-document/content", { as: identities.super, expected: 404 });

  const importBeforeExtraction = await api("/api/imports/imp-77612", { as: identities.import });
  const extraction = await api("/api/ai/document-extract", {
    method: "POST",
    as: identities.import,
    body: { importId: "imp-77612", documentId: "doc-pi" }
  });
  assert.equal(extraction.requiresReview, true);
  assert.ok(extraction.fields.length > 0);
  assert.ok(!extraction.fields.some((field) => field.key === "fobUnitForeign"));
  const importAfterExtraction = await api("/api/imports/imp-77612", { as: identities.import });
  assert.deepEqual(importAfterExtraction, importBeforeExtraction);

  const restrictedAi = await api("/api/ai/chat", {
    method: "POST",
    as: identities.sales1,
    body: { message: "What is the landed cost and profit margin?", context: { route: "/app/sales", entityType: "sales" } }
  });
  assert.equal(restrictedAi.restricted, true);
  assert.equal(restrictedAi.sources.length, 0);
  assert.doesNotMatch(restrictedAi.answer, /\d+[,.]\d+/);
  const ownSalesAi = await api("/api/ai/chat", {
    method: "POST",
    as: identities.sales1,
    body: { message: "Which customers need follow-up?", context: { route: "/app/sales", entityType: "sales" } }
  });
  assert.equal(ownSalesAi.restricted, false);
  assert.ok(ownSalesAi.sources.every((source) => source.path.startsWith("/app/sales")));
  const fifoRecommendations = await api("/api/ai/recommendations?route=%2Fapp%2Finventory&entityType=inventory", { as: identities.warehouse });
  assert.ok(fifoRecommendations.some((entry) => entry.id.startsWith("fifo-") || entry.id.startsWith("expiry-")));
  assert.ok(fifoRecommendations.every((entry) => entry.sourcePath === "/app/inventory"));
  const reportAi = await api("/api/ai/chat", {
    method: "POST",
    as: identities.salesManager,
    body: { message: "Summarize this report period", context: { route: "/app/reports", entityType: "reports", reportFrom: "2026-08-01", reportTo: "2026-08-31" } }
  });
  assert.match(reportAi.answer, /2026-08-01 to 2026-08-31/);
  assert.equal(reportAi.restricted, false);
  assert.doesNotMatch(JSON.stringify(reportAi), /landedCost|fob|grossProfit|profitMargin|supplierPrice/i);
  const employeeAi = await api("/api/ai/chat", {
    method: "POST",
    as: identities.salesManager,
    body: { message: "Summarize Rafiq's activity today", context: { route: "/app/employees?view=activity&employee=" + identities.sales1.id, entityType: "employees", employeeId: identities.sales1.id } }
  });
  assert.equal(employeeAi.restricted, false);
  assert.match(employeeAi.answer, /Rafiq/);
  assert.ok(employeeAi.sources.every((source) => source.path.startsWith("/app/employees")));
  const employeeAiDirectDenied = await api("/api/ai/chat", {
    method: "POST",
    as: identities.sales1,
    body: { message: "Summarize another employee", context: { route: "/app/employees", entityType: "employees", employeeId: identities.sales2.id } }
  });
  assert.equal(employeeAiDirectDenied.restricted, true);
  assert.equal(employeeAiDirectDenied.sources.length, 0);
  const employeeAccessAi = await api("/api/ai/chat", {
    method: "POST",
    as: identities.super,
    body: { message: "Explain this employee's access", context: { route: "/app/employees?view=access&employee=" + identities.sales1.id, entityType: "employees", employeeId: identities.sales1.id } }
  });
  assert.equal(employeeAccessAi.restricted, false);
  assert.match(employeeAccessAi.answer, /read-only|cannot grant|cannot revoke/i);
  assert.ok(employeeAccessAi.sources.some((source) => source.path.includes("view=access")));

  console.log("9. Marketing hub, scope, funnel, plans and practical reports");
  await api("/api/marketing/dashboard", { as: identities.accounts, expected: 403 });
  const ownMarketing = await api("/api/marketing/dashboard", { as: identities.sales1 });
  assert.equal(ownMarketing.scope, "SELF");
  assert.ok(ownMarketing.activities.every((entry) => entry.userId === identities.sales1.id));
  assert.deepEqual(ownMarketing.performance.map((entry) => entry.employee.id), [identities.sales1.id]);
  const teamMarketing = await api("/api/marketing/dashboard", { as: identities.salesManager });
  assert.equal(teamMarketing.scope, "TEAM");
  assert.ok(teamMarketing.performance.length >= 5);
  assert.ok(teamMarketing.metrics.some((entry) => entry.id === "overdue"));
  const ownDirectory = await api("/api/employees/directory?scope=marketing", { as: identities.sales1 });
  assert.deepEqual(ownDirectory.map((entry) => entry.id), [identities.sales1.id]);
  await api("/api/marketing/activities", { method: "POST", as: identities.salesManager, expected: 403, body: { activityType: "GENERAL_NOTE", remarks: "Managers cannot impersonate a daily employee activity." } });

  const marketingLead = await api("/api/marketing/leads", {
    method: "POST",
    expected: 201,
    as: identities.sales1,
    body: { organizationName: "Marketing Flow Clinic " + suffix, organizationType: "Clinic", mobile: "+8801712345678", assignedUserId: identities.sales2.id, leadSource: "Field Prospecting", interestedProductIds: ["prd-d17h"], nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString() }
  });
  assert.equal(marketingLead.assignedUserId, identities.sales1.id, "Sales Executive identity and assignment must come from the session.");
  const loggedActivity = await api("/api/marketing/activities", {
    method: "POST",
    expected: 201,
    as: identities.sales1,
    body: { activityType: "CUSTOMER_CONTACT", leadId: marketingLead.id, occurredAt: new Date().toISOString(), purpose: "Initial qualification call", remarks: "Procurement requested a quotation.", productIds: ["prd-d17h"], nextFollowUpAt: new Date(Date.now() + 172_800_000).toISOString() }
  });
  assert.equal(loggedActivity.userId, identities.sales1.id);
  assert.equal((await api("/api/marketing/leads", { as: identities.sales1 })).find((entry) => entry.id === marketingLead.id).stage, "CONTACTED");
  const convertedMarketingCustomer = await api("/api/marketing/leads/" + marketingLead.id + "/convert", { method: "POST", expected: 201, as: identities.sales1, body: { paymentTerms: "30 days", creditLimit: "50000" } });
  assert.equal(convertedMarketingCustomer.assignedSalesUserId, identities.sales1.id);
  const linkedQuotation = await api("/api/quotations", {
    method: "POST",
    expected: 201,
    as: identities.sales1,
    body: { date: today, customerId: convertedMarketingCustomer.id, leadId: marketingLead.id, validityDays: 15, paymentTerms: "30 days", remarks: "Created from the Marketing lead without re-entry", lines: [{ productId: "prd-d17h", quantity: "5", unitPrice: "700", discount: "0" }] }
  });
  assert.equal(linkedQuotation.leadId, marketingLead.id);
  assert.match(linkedQuotation.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:/);
  const sentLinkedQuotation = await api("/api/quotations/" + linkedQuotation.id, { method: "PATCH", as: identities.sales1, body: { status: "Sent" } });
  assert.match(sentLinkedQuotation.submittedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:/);
  const timestampedActivities = await api("/api/marketing/activities?from=2026-08-01&to=" + today, { as: identities.sales1 });
  assert.equal(timestampedActivities.find((entry) => entry.referenceId === linkedQuotation.id)?.occurredAt, sentLinkedQuotation.submittedAt);
  assert.equal(timestampedActivities.find((entry) => entry.referenceId === "quo-1")?.occurredAt, "2026-08-18", "Legacy date-only sales activity must not receive an invented time.");
  assert.equal((await api("/api/marketing/leads", { as: identities.sales1 })).find((entry) => entry.id === marketingLead.id).stage, "QUOTATION");
  const monthlyPlan = await api("/api/marketing/plans/monthly", { method: "POST", as: identities.sales1, body: { userId: identities.sales2.id, month: today.slice(0, 7), prioritySubjects: [convertedMarketingCustomer.name], productIds: ["prd-d17h"], plannedActivities: 35, notes: "Own plan identity test" } });
  assert.equal(monthlyPlan.userId, identities.sales1.id);
  assert.equal(monthlyPlan.status, "SUBMITTED");
  await api("/api/marketing/plans/daily", { method: "POST", as: identities.sales1, expected: 403, body: { date: today, plannedVisits: [{ id: "outside-scope-" + suffix, customerId: "cus-labaid", subjectName: "Payload must not bypass scope", purpose: "Invalid plan", completed: false }] } });
  const dailyPlan = await api("/api/marketing/plans/daily", { method: "POST", as: identities.sales1, body: { date: today, plannedVisits: [{ id: "plan-popular-" + suffix, customerId: "cus-popular", subjectName: "Tampered name", plannedTime: "12:00", purpose: "Stock and collection follow-up", completed: true }], notes: "Canonical customer plan" } });
  const plannedPopular = dailyPlan.plannedVisits.find((entry) => entry.customerId === "cus-popular");
  assert.equal(plannedPopular.subjectName, "Popular Medicine & Departmental Store");
  assert.equal(plannedPopular.completed, false, "Plan editing must not self-certify a field visit as completed.");
  const directFollowUp = await api("/api/marketing/follow-ups", { method: "POST", expected: 201, as: identities.sales1, body: { assignedUserId: identities.sales2.id, leadId: marketingLead.id, dueAt: new Date(Date.now() + 86_400_000).toISOString(), purpose: "Confirm quotation review" } });
  await api("/api/marketing/follow-ups/" + directFollowUp.id, { method: "PATCH", as: identities.sales1, expected: 422, body: { dueAt: "not-a-date" } });
  const rescheduledDueAt = new Date(Date.now() + 259_200_000).toISOString();
  const rescheduledFollowUp = await api("/api/marketing/follow-ups/" + directFollowUp.id, { method: "PATCH", as: identities.sales1, body: { dueAt: rescheduledDueAt } });
  assert.equal(rescheduledFollowUp.dueAt, rescheduledDueAt);
  assert.equal(rescheduledFollowUp.status, "PENDING");
  const marketingReport = await api("/api/reports/marketing?from=" + monthStart + "&to=" + today + "&employeeId=all&groupBy=Employee&mode=Detail", { as: identities.salesManager });
  assert.ok(marketingReport.tables.some((entry) => entry.id === "marketing-activity"));
  assert.ok(marketingReport.tables.some((entry) => entry.id === "lead-funnel"));
  const groupedMarketing = marketingReport.tables.find((entry) => entry.id === "marketing-grouped");
  assert.deepEqual(groupedMarketing.columns.map((column) => column.key), ["group", "employees", "subjects", "mix", "fieldWork", "followUps", "business", "collections", "verified", "count"]);
  assert.ok(groupedMarketing.rows.some((entry) => entry.employees && entry.mix && entry.subjects), "Grouped marketing analysis must preserve operational context, not only counts.");
  assert.ok(marketingReport.performance.some((entry) => entry.employee.id === identities.sales1.id));
  const employeeSnapshot = await api("/api/marketing/employees/" + identities.sales1.id + "/snapshot?from=" + monthStart + "&to=" + today, { as: identities.salesManager });
  assert.deepEqual(employeeSnapshot.period, { from: monthStart, to: today });
  assert.equal(employeeSnapshot.employee.id, identities.sales1.id);
  assert.ok(employeeSnapshot.recentActivities.every((entry) => entry.userId === identities.sales1.id));
  await api("/api/marketing/employees/" + identities.sales2.id + "/snapshot?from=" + monthStart + "&to=" + today, { as: identities.sales1, expected: 403 });
  await api("/api/reports/marketing/export-authorization", { as: identities.sales1, expected: 403 });
  await api("/api/reports/marketing/export-authorization", { as: identities.salesManager });
  const marketingAi = await api("/api/ai/chat", { method: "POST", as: identities.salesManager, body: { message: "Who has overdue follow-ups today?", context: { route: "/app/sales?view=marketing", entityType: "marketing" } } });
  assert.equal(marketingAi.restricted, false);
  assert.ok(marketingAi.sources.some((source) => source.path.includes("view=marketing")));

  console.log("10. Field Team privacy, employee actions and Smart Insights");
  const managerField = await api("/api/field-team/current", { as: identities.salesManager });
  assert.equal(managerField.feedLabel, "Demo location feed");
  assert.ok(managerField.employees.length >= 5);
  assert.ok(managerField.locations.some((entry) => entry.status === "LIVE"));
  assert.ok(managerField.locations.some((entry) => entry.status === "STALE"));
  assert.ok(managerField.locations.every((entry) => !Object.hasOwn(entry, "currentDue") && !Object.hasOwn(entry, "landedCost")));
  const firstLive = managerField.locations.find((entry) => entry.userId === identities.sales1.id);
  const nextField = await api("/api/field-team/current", { as: identities.salesManager });
  const movedLive = nextField.locations.find((entry) => entry.userId === identities.sales1.id);
  assert.notDeepEqual([movedLive.latitude, movedLive.longitude], [firstLive.latitude, firstLive.longitude]);
  assert.equal(movedLive.status, "LIVE");
  const ownField = await api("/api/field-team/current", { as: identities.sales1 });
  assert.deepEqual(ownField.employees.map((employee) => employee.id), [identities.sales1.id]);
  assert.deepEqual(ownField.locations.map((entry) => entry.userId), [identities.sales1.id]);
  await api("/api/field-team/current", { as: identities.accounts, expected: 403 });
  await api("/api/field-team/current", { as: identities.import, expected: 403 });
  const employeeSearch = await api("/api/field-team/employees?search=SE-021", { as: identities.salesManager });
  assert.deepEqual(employeeSearch.map((employee) => employee.id), ["sales3"]);
  const territorySearch = await api("/api/field-team/employees?territory=Dhaka%20North", { as: identities.salesManager });
  assert.ok(territorySearch.every((employee) => employee.territory === "Dhaka North"));
  const liveSearch = await api("/api/field-team/employees?status=LIVE", { as: identities.salesManager });
  assert.ok(liveSearch.some((employee) => employee.id === identities.sales1.id));
  const ownHistory = await api("/api/field-team/" + identities.sales1.id + "/history?date=" + today, { as: identities.sales1 });
  assert.equal(ownHistory.employee.id, identities.sales1.id);
  assert.ok(ownHistory.points.length >= 2);
  assert.ok(ownHistory.visits.length >= 1);
  assert.ok(!Object.hasOwn(ownHistory, "distance"));
  await api("/api/field-team/" + identities.sales2.id + "/history?date=" + today, { as: identities.sales1, expected: 403 });
  await api("/api/field-team/tracking/location", { method: "POST", as: identities.sales1, expected: 422, body: { latitude: 200, longitude: 90, accuracyMeters: 10, recordedAt: new Date().toISOString(), source: "WEB_FOREGROUND" } });
  await api("/api/field-team/visits/visit-rafiq-popular/check-in", { method: "POST", as: identities.sales1, expected: 422, body: { latitude: 200, longitude: 90, accuracyMeters: -1 } });
  await api("/api/field-team/visits/visit-shamima-labaid/check-out", { method: "POST", as: identities.sales1, expected: 403, body: { outcome: "Must not post" } });
  await api("/api/field-team/visits/visit-rafiq-popular/check-out", { method: "POST", as: identities.sales1, expected: 422, body: { outcome: "Quotation requested" } });
  const completedVisit = await api("/api/field-team/visits/visit-rafiq-popular/check-out", {
    method: "POST",
    as: identities.sales1,
    body: { outcome: "Quotation requested after stock review", productIds: ["prd-d17h", "prd-bts"], nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString(), remarks: "Customer requested institutional pricing.", checkOutLatitude: 23.87585, checkOutLongitude: 90.37945, checkOutAccuracyMeters: 16, attachmentUpload: { fileName: "visit-evidence.pdf", mimeType: "application/pdf", sizeBytes: 15, fileDataUrl: "data:application/pdf;base64,JVBERi0xLjQKJSVFT0YK" } }
  });
  assert.equal(completedVisit.status, "Completed");
  assert.equal(completedVisit.checkOutLatitude, 23.87585);
  assert.equal(completedVisit.attachments.length, 1);
  await rawApi("/api/documents/" + completedVisit.attachments[0].id + "/content", { as: identities.sales1, expected: 200 });
  const fieldAfterCheckout = await api("/api/field-team/current", { as: identities.sales1 });
  assert.equal(fieldAfterCheckout.locations[0].currentVisit, undefined);
  const ownPlanAfterCheckout = await api("/api/marketing/plans/daily?employeeId=" + identities.sales1.id + "&date=" + today, { as: identities.sales1 });
  assert.equal(ownPlanAfterCheckout[0].plannedVisits.find((entry) => entry.customerId === "cus-popular").completed, true);
  const fieldActivities = await api("/api/marketing/activities?from=" + today + "&to=" + today, { as: identities.sales1 });
  assert.ok(fieldActivities.some((entry) => entry.activityType === "CHECK_OUT" && entry.referenceId === completedVisit.id));
  const fieldAiRestricted = await api("/api/ai/chat", { method: "POST", as: identities.sales1, body: { message: "Where is Shamima?", context: { route: "/app/sales?view=marketing&marketing=field-team", entityType: "field-team", employeeId: identities.sales2.id } } });
  assert.equal(fieldAiRestricted.restricted, true);
  const fieldAiManager = await api("/api/ai/chat", { method: "POST", as: identities.salesManager, body: { message: "Who is active in the field?", context: { route: "/app/sales?view=marketing&marketing=field-team", entityType: "field-team" } } });
  assert.equal(fieldAiManager.restricted, false);
  assert.ok(fieldAiManager.sources.some((source) => source.path.startsWith("/app/employees?view=field-team")));
  const managerInsights = await api("/api/ai/recommendations?route=%2Fapp%2Finsights&entityType=insights", { as: identities.salesManager });
  assert.ok(managerInsights.some((entry) => entry.category === "Field Team"));
  assert.ok(managerInsights.every((entry) => entry.sourcePath && entry.recommendedAction));
  const accountsInsights = await api("/api/ai/recommendations?route=%2Fapp%2Finsights&entityType=insights", { as: identities.accounts });
  assert.ok(accountsInsights.every((entry) => entry.category !== "Field Team"));

  console.log("11. Public business inquiry boundary");
  const inquiry = await api("/api/public/contact", {
    method: "POST",
    expected: 201,
    body: {
      name: "Procurement Officer",
      organization: "Dhaka Care Hospital",
      phone: "+8801700000000",
      email: "procurement@example.org",
      subject: "Dialyzer product information",
      productInterest: "Hollow Fiber Hemodialyzer",
      message: "Please share the available model and documentation options."
    }
  });
  assert.match(inquiry.inquiryId, /^INQ-/);
  assert.equal(inquiry.status, "Received");
  await api("/api/public/contact", {
    method: "POST",
    expected: 400,
    body: { name: "<b>Bad</b>", phone: "123", message: "<script>alert(1)</script>" }
  });

  console.log("12. Public content publication and Super Admin boundary");
  await api("/api/settings/website", { as: identities.md, expected: 403 });
  const website = await api("/api/settings/website", { as: identities.super });
  assert.ok(website.heroSlides.length >= 3);
  assert.ok(website.products.length >= 8);
  assert.ok(website.inquiries.some((entry) => entry.inquiryId === inquiry.inquiryId));
  const publicProduct = {
    slug: "temporary-publication-test",
    legacySlug: "",
    name: "Temporary Publication Test",
    category: "Hemodialysis",
    shortDescription: "Temporary public content integration record.",
    description: "This record verifies that draft and published website data are projected separately.",
    brand: "Distributed by MIPRO",
    manufacturer: "",
    intendedApplication: "Automated prototype verification only.",
    images: ["/products/dialyzer.jpg"],
    imageAlt: "Temporary test dialyzer",
    features: ["Temporary verification"],
    variants: ["Test variant"],
    specifications: [{ label: "Purpose", value: "Automated test" }],
    certificateIds: [],
    featured: false,
    published: false,
    sortOrder: 99
  };
  await api("/api/settings/website/products", { method: "POST", expected: 201, as: identities.super, body: publicProduct });
  assert.equal(await api("/api/public/products/temporary-publication-test"), null);
  const publishedProduct = await api("/api/settings/website/products/temporary-publication-test", { method: "PATCH", as: identities.super, body: { ...publicProduct, published: true } });
  assert.equal(publishedProduct.published, true);
  assert.equal((await api("/api/public/products/temporary-publication-test")).name, publicProduct.name);
  await api("/api/settings/website/products/temporary-publication-test", { method: "DELETE", as: identities.super });
  assert.equal(await api("/api/public/products/temporary-publication-test"), null);
  const reviewedInquiry = await api("/api/settings/website/inquiries/" + inquiry.inquiryId, { method: "PATCH", as: identities.super, body: { status: "Qualified", internalNotes: "Automated follow-up verification." } });
  assert.equal(reviewedInquiry.status, "Qualified");
  const convertedInquiry = await api("/api/settings/website/inquiries/" + inquiry.inquiryId + "/convert-to-lead", { method: "POST", expected: 201, as: identities.super, body: { assignedUserId: identities.sales2.id, productIds: ["prd-d17h"], nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString() } });
  assert.match(convertedInquiry.leadNumber, /^LEAD-2026-/);
  assert.ok((await api("/api/marketing/leads", { as: identities.salesManager })).some((entry) => entry.id === convertedInquiry.leadId && entry.assignedUserId === identities.sales2.id));
  await api("/api/settings/website/inquiries/" + inquiry.inquiryId, { method: "DELETE", as: identities.super, expected: 409 });

  console.log("All digital-platform, marketing, effective-access and public-content scenarios passed.");
}

try {
  if (!externalBase) {
    server = spawn(process.execPath, [resolve(root, "node_modules", "tsx", "dist", "cli.mjs"), resolve(root, "server", "index.ts")], {
      cwd: root,
      env: { ...process.env, API_PORT: String(testPort) },
      stdio: ["ignore", "pipe", "pipe"]
    });
    server.stdout.on("data", rememberOutput);
    server.stderr.on("data", rememberOutput);
    await waitForServer();
  }
  await run();
} catch (error) {
  console.error(error);
  if (serverOutput) console.error(serverOutput);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) server.kill("SIGTERM");
}
