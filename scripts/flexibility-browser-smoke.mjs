import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { calculateLandedCost } from "../src/domains/imports/costing.ts";
import { ledgerStarterProposal } from "../src/domains/ledger/starter.ts";
import { businessDate } from "../src/lib/date.ts";

const origin = process.env.SMOKE_ORIGIN ?? "http://localhost:5178";
const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const csp = vercel.headers.find((entry) => entry.source === "/(.*)").headers.find((header) => header.key === "Content-Security-Policy").value;
const today = businessDate();
const future = `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`;
const image = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#008ca8" } }).png().toBuffer();
const user = { id: "ui-flex-admin", name: "Form Review", email: "ui@example.invalid", role: "Super Admin", status: "Active", title: "Administrator", department: "Administration", phone: "", avatarUrl: "", capabilities: [], permissionOverrides: [] };
const token = `test.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
const session = { token, user, security: { assurance: "aal2", enrolled: true, required: true } };
const browser = await chromium.launch({ channel: "msedge", headless: true });
await mkdir("artifacts/backend/flexibility", { recursive: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    const errors = []; const supplierRows = []; const productRows = []; const optionRows = []; const importPosts = []; const patches = []; const uploads = []; const itemPatches = []; const presetRows = []; const accountRows = []; const chartRows = [];
    let invalidAmount = false; let unavailable = false; let documentAttached = false; let purchasePosted = false;
    let ledgerReady = false;
    const configurations = [], receiptRows = [];
    let record = { id: "ui-import", draftReference: "IMP-2026-001", primaryReference: "IMP-2026-001", supplierId: "ui-supplier", supplierName: "Review Supplier", poNumber: "PO-TEST", poDate: today, piNumber: "PI-TEST", paymentMode: "Pending", currency: "USD", exchangeRate: "0", rateDate: "", rateSource: "Pending", status: "PI Received", milestone: "PI Received", costingStatus: "Not Started", warehouseStatus: "Not Ready", items: [], costs: [], documents: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    record.confirmedSteps = []; record.status = "Draft"; record.milestone = "Draft"; record.piNumber = "";
    const importLine = () => ({ id: "ui-item", productId: productRows[0].id, productCode: productRows[0].code, productName: productRows[0].name, quantity: "1", unit: productRows[0].unit, currency: "USD", fobUnitForeign: "0", exchangeRate: "0", fobTotalBdt: "0", cbmPerCarton: "0", cartonCount: "0", totalCbm: "0", cbmMode: "CALCULATED" });
    try {
      await context.addInitScript((value) => globalThis.localStorage.setItem("mipro-erp-session", JSON.stringify(value)), session);
      await context.route((url) => url.origin === origin && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/__test_upload/"), async (route) => {
        if (route.request().resourceType() !== "document") return route.continue();
        const response = await route.fetch();
        await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": csp } });
      });
      await context.route((url) => url.origin === origin && url.pathname.startsWith("/__test_upload/"), (route) => route.fulfill({ status: 200, body: "{}" }));
      await context.route((url) => url.origin === origin && url.pathname.startsWith("/api/"), async (route) => {
        const request = route.request(); const url = new URL(request.url()); const path = url.pathname; const body = request.method() === "GET" ? undefined : request.postDataJSON(); let data; let status = 200;
        if (path === "/api/me") data = session;
        else if (path === "/api/controls/policies") data = { rows: [], people: [{ id: "reviewer", name: "Alex Reviewer", role: "Accounts" }, { id: "approver", name: "Sam Approver", role: "Managing Director" }] };
        else if (path === "/api/suppliers" || path === "/api/settings/suppliers") {
          if (request.method() === "POST") { supplierRows.push({ id: "ui-supplier", contactPerson: "", phone: "", email: "", paymentTerms: "", active: true, ...body }); status = 201; }
          data = request.method() === "POST" ? supplierRows.at(-1) : supplierRows;
        } else if (path === "/api/products" || path === "/api/settings/products") {
          if (request.method() === "POST") { productRows.push({ id: "ui-product", hsCode: "", standardSalePrice: "0", active: true, ...body }); status = 201; }
          data = request.method() === "POST" ? productRows.at(-1) : productRows;
        } else if (path === "/api/settings/accounts") {
          if (request.method() === "POST") { accountRows.push({ id: "ui-account", version: 1, active: true, balance: "0", accountNumber: "", ...body }); status = 201; }
          data = request.method() === "POST" ? accountRows.at(-1) : accountRows;
        } else if (path === "/api/sales/summary") data = { customers: 0, openOrders: 0, due: "0", collected: "0" };
        else if (path === "/api/sales/page") {
          const rows = url.searchParams.get("kind") === "accounts" ? accountRows.filter((a) => !url.searchParams.get("accountType") || a.type === url.searchParams.get("accountType")) : [];
          data = { rows, selected: rows.find((row) => row.id === url.searchParams.get("selectedId")) ?? null, total: rows.length, page: 1, pageSize: 25 };
        } else if (path === "/api/ledger/status") data = { strictPosting: true, configurationId: ledgerReady ? "starter-config" : null, cutover: ledgerReady ? today : null, deferred: 0, periods: [] };
        else if (path === "/api/ledger/configurations") {
          if (request.method() === "POST") { configurations.push({ id: "next-config", state: "Draft", version: 1, createdBy: user.id, approvedBy: null, data: body }); data = { id: "next-config" }; status = 201; }
          else data = configurations;
        }
        else if (path === "/api/ledger/cash-masters") data = accountRows;
        else if (path === "/api/ledger/configurations/starter") {
          assert.equal(body.acknowledgeDraft, true); assert.equal(ledgerReady, false);
          const rows = ledgerStarterProposal(chartRows, accountRows, body.selections).map(row => ({ ...row, id: row.existingId ?? `starter-${row.code}` }));
          for (const row of rows) if (!row.existingId) chartRows.push({ id: row.id, code: row.code, name: row.name, kind: row.kind, active: true });
          configurations.push({ id: "starter-config", state: "Draft", version: 1, createdBy: user.id, approvedBy: null, data: { effectiveFrom: body.effectiveFrom, proofReference: body.proofReference, mappings: rows.flatMap(row => row.role ? [{ role: row.role, accountId: row.id }] : []), cashMappings: [] } });
          data = { id: "starter-config" }; status = 201;
        } else if (path === "/api/ledger/configurations/starter-config/approve") {
          assert.equal(body.version, 1); assert.ok(body.reason.length >= 5); ledgerReady = true;
          configurations[0] = { ...configurations[0], state: "Approved", version: 2, approvedBy: user.id }; data = { id: "starter-config" };
        } else if (path === "/api/ledger/accounts") {
          if (request.method() === "POST") { chartRows.push({ id: body.code === "INV-COMPANY" ? "chart-company-stock" : "chart-review", active: true, ...body }); status = 201; }
          data = request.method() === "POST" ? chartRows.at(-1) : chartRows;
        } else if (path === "/api/settings/options") {
          if (request.method() === "POST") { const row = { id: `option-${optionRows.length}`, ...body }; optionRows.push(row); data = row; status = 201; }
          else data = optionRows.filter((r) => r.kind === url.searchParams.get("kind"));
        } else if (path === "/api/settings/cost-presets") {
          if (request.method() === "POST") { const row = { id: `preset-${presetRows.length}`, ...body.data, version: 1 }; presetRows.push(row); data = row; status = 201; }
          else data = presetRows;
        } else if (path === "/api/uploads") { uploads.push(body); data = { id: `file-${uploads.length}`, signedUrl: `${origin}/__test_upload/${uploads.length}` }; status = 201; }
        else if (/^\/api\/uploads\/[^/]+\/complete$/.test(path)) {
          const last = uploads.at(-1); if (last.purpose === "import-document") documentAttached = true;
          data = { id: path.split("/")[3] };
        } else if (path.startsWith("/api/documents/")) data = { url: `${origin}/favicon.png` };
        else if (path === "/api/imports" && request.method() === "POST") { importPosts.push(body); record = { ...record, ...body, items: [importLine()] }; data = record; status = 201; }
        else if (path === "/api/imports/ui-import/confirm-step") { record = { ...record, confirmedSteps: [...new Set([...record.confirmedSteps, ...(body.step < 3 ? [body.step] : [])])], pendingReviewSteps: (record.pendingReviewSteps ?? []).filter(step => step !== body.step), ...(["Draft", "PI Received", "LC/TT Opened"].includes(record.status) && body.step > 0 ? { status: body.step === 1 ? "PI Received" : "LC/TT Opened" } : {}) }; data = record; }
        else if (path === "/api/imports/ui-import/retract-step") {
          if (record.snapshot && !receiptRows.length) assert.ok(body.reason?.length >= 5);
          record = { ...record, confirmedSteps: record.confirmedSteps.filter(step => step < body.step), ...(receiptRows.length ? { pendingReviewSteps: [3, 4, 5, 6].filter(step => step >= body.step) } : { snapshot: undefined, costingStatus: "In Progress", warehouseStatus: "Not Ready", status: ["Draft", "Draft", "PI Received", "LC/TT Opened", "In Production", "Shipped", "At Port", "Costing"][body.step] }) }; data = record;
        }
        else if (path === "/api/imports/ui-import/receiving-readiness") data = { ready: ledgerReady, canConfigure: true, message: ledgerReady ? "Company accounting setup is approved." : "Super Admin must finish the company accounting setup in Expenses & Accounts > General Ledger > Accounting Setup. This is a company-wide prerequisite, not a setting for each warehouse receipt." };
        else if (path === "/api/imports/ui-import/reopen-case") {
          assert.equal(record.status, "Closed"); assert.deepEqual(body, {});
          record = { ...record, status: "Received", milestone: "Received" }; data = record;
        }
        else if (path === "/api/imports/ui-import/receipts") data = receiptRows;
        else if (path === "/api/settings/warehouse") data = { id: "main", name: "Main Warehouse", address: "Dhaka", contactPerson: "", phone: "", locations: ["A1"], active: true, version: 1 };
        else if (path === "/api/imports/ui-import/receive") {
          assert.equal(ledgerReady, true);
          const receipt = { id: "ui-receipt", importId: record.id, reference: record.primaryReference, receivedDate: body.receivedDate, lines: body.lines, status: "Posted", receivedBy: user.name };
          receiptRows.push(receipt); record = { ...record, status: "Received", milestone: "Received", warehouseStatus: "Received" }; data = receipt; status = 201;
        }
        else if (path === "/api/imports/ui-import/transition") {
          const allowed = { "LC/TT Opened": "In Production", "In Production": "Shipped", "Shipped": "At Port", "At Port": "Costing", "Received": "Closed" };
          assert.equal(body.status, allowed[record.status]);
          record = { ...record, status: body.status, milestone: body.status }; data = record;
        } else if (path === "/api/imports/ui-import/cost-preview") data = calculateLandedCost(record.id, record.items, record.costs);
        else if (path === "/api/imports/ui-import/finalize") {
          assert.equal(record.status, "Costing");
          const version = (record.snapshotHistory?.length ?? 0) + 1;
          const snapshot = { ...calculateLandedCost(record.id, record.items, record.costs), id: `ui-snapshot-${version}`, version, finalizedAt: new Date().toISOString(), finalizedBy: user.name, immutable: true };
          record = { ...record, snapshot, snapshotHistory: [...record.snapshotHistory ?? [], snapshot], status: "Cost Finalized", milestone: "Cost Finalized", costingStatus: "Finalized", warehouseStatus: "Ready" }; data = record;
        }
        else if (path === "/api/imports/ui-import/items/ui-item") { itemPatches.push(body); record = { ...record, items: [{ ...record.items[0], ...body }] }; data = record; }
        else if (path === "/api/imports/ui-import") {
          if (request.method() === "PATCH") {
            patches.push(body);
            if (unavailable) { unavailable = false; await route.fulfill({ status: 500, contentType: "application/json", headers: { "X-Request-Id": "51aa01ee-fd2c-4fae-a443-d61d83ca0c50" }, body: JSON.stringify({ success: false, data: null, message: "Failed query: select private_secret", errors: [{ field: "private_secret", message: "sb_secret_test" }] }) }); return; }
            if (invalidAmount) { invalidAmount = false; await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ success: false, data: null, message: "Check the input fields.", errors: [{ field: "ttAmount", message: "Amount has too many decimal places." }] }) }); return; }
            record = { ...record, ...body };
          }
          data = { ...record, documents: documentAttached ? [{ id: `file-${uploads.length}`, importId: record.id, entityType: "import", entityId: record.id, documentType: "Packing List", type: "Packing List", name: "packing.pdf", fileName: "packing.pdf", mimeType: "application/pdf", sizeBytes: 16, source: "UPLOADED", previewUrl: "/api/documents/test", sensitive: false, createdByUserId: user.id, createdByName: user.name, createdAt: new Date().toISOString(), uploadedAt: new Date().toISOString(), uploadedBy: user.name, status: "Available" }] : [] };
        } else if (path === "/api/inventory/summary") data = { products: purchasePosted ? 1 : 0, batches: purchasePosted ? 1 : 0, expiryAttention: 0, inventoryValue: purchasePosted ? "20.00" : "0", units: [] };
        else if (path.endsWith("/page") && path.startsWith("/api/inventory/")) data = { rows: [], total: 0, page: 1, pageSize: 25 };
        else if (path === "/api/inventory/purchases") {
          if (request.method() === "POST") { assert.ok(request.headers()["idempotency-key"]); assert.equal(body.lines[0].productId, productRows[0].id); purchasePosted = true; data = { id: "purchase-test" }; status = 201; }
          else data = purchasePosted ? [{ id: "purchase-test", number: "PR-2026-001", supplierId: "ui-supplier", supplierName: supplierRows[0].name, reference: "SUPPLIER-INV-1", receivedDate: today, currency: "BDT", totalBdt: "20.00", lineCount: 1, createdByName: user.name }] : [];
        } else throw new Error(`Unexpected API request: ${request.method()} ${path}`);
        await route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ success: true, data, message: "Saved" }) });
      });
      const page = await context.newPage(); page.setDefaultTimeout(20_000); page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error" && /Content Security Policy|Refused to connect/i.test(message.text())) errors.push(message.text()); });
      const capture = async (name) => { assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 2), true, `${name}: viewport overflow`); await page.screenshot({ path: `artifacts/backend/flexibility/${name}-${width}.png`, fullPage: true }); if (["all-import-sections", "landed-cost-review", "receiving-next-action", "starter-accounting-choices", "company-accounting-review", "company-accounting-approval"].includes(name)) await page.screenshot({ path: `artifacts/backend/flexibility/${name}-viewport-${width}.png` }); };
      const assertSections = async (selected) => {
        await page.locator(`#import-step-${selected}[data-highlighted="true"]`).waitFor();
        assert.equal(await page.locator('[id^="import-step-"][data-highlighted="true"]').count(), 1, "Only the selected section is highlighted");
        for (let index = 0; index < 10; index++) {
          const section = page.locator(`#import-step-${index}`);
          assert.equal(await section.isVisible(), true, `Section ${index + 1} stays visible`);
          assert.equal(await section.getAttribute("hidden"), null);
          assert.equal(await section.evaluate(node => node.tagName), "SECTION", "Import sections must not collapse");
        }
      };
      await page.goto(`${origin}/backend/imports/new`);
      await page.getByRole("heading", { name: "Create draft import", exact: true }).waitFor();
      await page.getByRole("combobox", { name: "Supplier", exact: true }).selectOption("__add_master__");
      let dialog = page.getByRole("dialog", { name: "Add supplier", exact: true });
      await dialog.getByLabel("Name", { exact: true }).fill("Review Supplier"); await dialog.getByRole("combobox", { name: "Country", exact: true }).selectOption("Bangladesh");
      await dialog.getByRole("button", { name: "Save", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      await page.getByRole("combobox", { name: "Product variant", exact: true }).selectOption("__add_master__");
      dialog = page.getByRole("dialog", { name: "Add product", exact: true });
      await dialog.getByLabel("Product code", { exact: true }).fill("DIAL-TEST"); await dialog.getByLabel("Name", { exact: true }).fill("Review Dialyzer");
      await dialog.getByRole("combobox", { name: "Product family", exact: true }).selectOption("Dialyzer"); await dialog.getByLabel("Variant / Specification", { exact: true }).fill("1.8H");
      await dialog.getByRole("combobox", { name: "Unit", exact: true }).selectOption("__add_option__");
      const optionDialog = page.getByRole("dialog", { name: "Add unit", exact: true }); await optionDialog.getByLabel("Unit", { exact: true }).fill("Pouch"); await optionDialog.getByRole("button", { name: "Add Option", exact: true }).click(); await optionDialog.waitFor({ state: "hidden" });
      await dialog.getByLabel("Product image", { exact: true }).setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(1_000_000) });
      await dialog.getByText("Image must be smaller than 1 MB (1,000,000 bytes).", { exact: true }).waitFor(); assert.equal(uploads.length, 0);
      await dialog.getByLabel("Product image", { exact: true }).setInputFiles({ name: "product.png", mimeType: "image/png", buffer: image });
      await page.waitForResponse((r) => r.url().includes("/complete") && r.status() === 200); await capture("product-editor");
      await dialog.getByRole("button", { name: "Save", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); assert.equal(importPosts.length, 0, "Nested creation must not submit the import form");
      await page.getByLabel("PO Number", { exact: true }).fill("PO-TEST"); await page.getByRole("button", { name: "Create Draft Import", exact: true }).click();
      await page.waitForURL("**/backend/imports/ui-import"); await page.getByRole("button", { name: "Mark PO Complete", exact: true }).click(); await assertSections(1);
      await page.getByRole("button", { name: "Retract PO / Draft completion", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Retract completion?", exact: true }); await dialog.getByRole("button", { name: "Retract Completion", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      await assertSections(0); assert.equal(record.poNumber, "PO-TEST");
      await page.getByRole("button", { name: "Mark PO Complete", exact: true }).click(); await assertSections(1);
      assert.equal(await page.getByRole("button", { name: "Mark PI Received", exact: true }).isEnabled(), false);
      await capture("import-products");
      await page.getByRole("button", { name: "Edit purchase order", exact: true }).click(); dialog = page.getByRole("dialog", { name: "Edit purchase order", exact: true });
      assert.equal(await dialog.getByRole("combobox", { name: "Supplier", exact: true }).inputValue(), "ui-supplier");
      assert.equal(await dialog.getByLabel("PI Number", { exact: true }).count(), 0, "PO editor does not repeat PI fields");
      await dialog.getByRole("button", { name: "Save Commercial Data", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); assert.equal(patches.at(-1).supplierId, "ui-supplier");
      await page.getByRole("button", { name: "Edit PI details", exact: true }).click(); dialog = page.getByRole("dialog", { name: "Edit PI details", exact: true });
      assert.equal(await dialog.getByRole("combobox", { name: "Supplier", exact: true }).count(), 0, "PI editor does not repeat PO fields");
      await dialog.getByLabel("PI Number", { exact: true }).fill("PI-TEST"); await dialog.getByLabel("PI Date", { exact: true }).fill(today);
      await dialog.getByRole("button", { name: "Save Commercial Data", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); assert.deepEqual(Object.keys(patches.at(-1)).sort(), ["piDate", "piNumber"]);
      await page.getByRole("button", { name: "Edit product", exact: true }).click(); dialog = page.getByRole("dialog", { name: "Edit imported product", exact: true });
      await dialog.getByLabel("Quantity", { exact: true }).fill("1e100"); await dialog.getByRole("button", { name: "Save Product Line", exact: true }).click(); await dialog.getByRole("alert").filter({ hasText: "without scientific notation" }).waitFor();
      await dialog.getByRole("combobox", { name: "FOB currency", exact: true }).selectOption("GBP"); assert.equal(await dialog.getByLabel("BDT per currency unit", { exact: true }).inputValue(), ""); await dialog.getByLabel("Quantity", { exact: true }).fill("2.5"); await dialog.getByLabel("FOB / Unit (GBP)", { exact: true }).fill("10"); await dialog.getByLabel("BDT per currency unit", { exact: true }).fill("150"); await dialog.getByRole("button", { name: "Save Product Line", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); assert.equal(itemPatches.at(-1).currency, "GBP"); assert.equal(itemPatches.at(-1).quantity, "2.5");
      const stages = page.getByRole("region", { name: "Import stages", exact: true }); assert.equal(await stages.getByRole("button").count(), 10);
      for (const [index, label] of [[2, "LC / TT"], [3, "Production"], [4, "Shipment"], [5, "Documents"], [6, "Costs & Allocation"], [7, "Landed Cost"], [8, "Receiving"], [9, "Activity & Closure"], [0, "PO / Draft"]]) {
        await stages.getByRole("button", { name: label, exact: true }).click(); await assertSections(index);
        await page.waitForFunction(index => { const rect = globalThis.document.getElementById(`import-step-${index}`).getBoundingClientRect(); return rect.top >= 0 && rect.top < globalThis.innerHeight && rect.bottom > 0; }, index);
      }
      await stages.getByRole("button", { name: "Documents", exact: true }).click();
      await page.getByRole("heading", { name: "Import Documents", exact: true }).waitFor();
      await assertSections(5);
      assert.equal(await page.locator("#import-step-5").getByRole("button", { name: "Edit shipment", exact: true }).count(), 0);
      assert.equal(await page.locator("#import-step-5").getByText("Bill of lading", { exact: true }).count(), 0, "Documents do not duplicate shipment fields");
      assert.equal(await page.locator("#import-step-4").getByText("Bill of lading", { exact: true }).isVisible(), true);
      await capture("all-import-sections");
      await page.locator("#import-step-5").getByRole("button", { name: "Back to import steps", exact: true }).click();
      await page.waitForFunction(() => { const rect = globalThis.document.getElementById("import-steps-navigation").getBoundingClientRect(); return rect.top >= 0 && rect.top < globalThis.innerHeight; });
      await assertSections(5);
      await stages.getByRole("button", { name: "Costs & Allocation", exact: true }).click(); await page.getByRole("button", { name: "Add Cost", exact: true }).click(); dialog = page.getByRole("dialog", { name: "Add import cost", exact: true }); await dialog.getByRole("combobox", { name: "Cost preset", exact: true }).selectOption("__add_preset__");
      const presetDialog = page.getByRole("dialog", { name: "Add cost preset", exact: true }); await presetDialog.getByLabel("Preset name", { exact: true }).fill("Insurance review"); await presetDialog.getByLabel("Reason for Change", { exact: true }).fill("Approved reusable cost label"); await presetDialog.getByRole("button", { name: "Save Changes", exact: true }).click(); await presetDialog.waitFor({ state: "hidden" }); await dialog.getByRole("combobox", { name: "Currency", exact: true }).selectOption("EUR"); assert.equal(await dialog.getByLabel("Exchange Rate Snapshot", { exact: true }).inputValue(), ""); await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await stages.getByRole("button", { name: "LC / TT", exact: true }).click(); await page.getByRole("button", { name: "Edit payment", exact: true }).click();
      dialog = page.getByRole("dialog").last();
      await dialog.waitFor(); await capture("payment-initial");
      await dialog.getByLabel("Payment mode", { exact: true }).selectOption("LC"); await dialog.getByLabel("LC number", { exact: true }).fill("LC-REVIEW"); await dialog.getByRole("button", { name: "Save Changes", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      assert.equal(patches.at(-1).paymentMode, "LC"); assert.equal("ttAmount" in patches.at(-1), false); assert.equal("lcAmount" in patches.at(-1), false);
      await page.getByRole("button", { name: "Edit payment", exact: true }).click(); dialog = page.getByRole("dialog").last(); await dialog.waitFor(); await capture("payment-editor"); await dialog.getByLabel("Payment mode", { exact: true }).selectOption("TT"); await dialog.getByLabel("TT / Shipment reference", { exact: true }).fill("TT-REVIEW");
      invalidAmount = true; await dialog.getByRole("button", { name: "Save Changes", exact: true }).click(); await dialog.getByText("Amount has too many decimal places.", { exact: true }).last().waitFor(); await capture("payment-error");
      unavailable = true; await dialog.getByRole("button", { name: "Save Changes", exact: true }).click(); await dialog.getByText(/The service is temporarily unavailable/).last().waitFor();
      assert.equal(await dialog.getByText(/private_secret|sb_secret_test/).count(), 0); await capture("safe-service-error");
      await dialog.getByRole("button", { name: "Save Changes", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); assert.equal("lcNumber" in patches.at(-1), false);
      await page.getByRole("button", { name: "Edit payment", exact: true }).click(); dialog = page.getByRole("dialog").last(); await dialog.getByLabel("Payment mode", { exact: true }).selectOption("Pending"); await dialog.getByRole("button", { name: "Save Changes", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); assert.equal("ttReference" in patches.at(-1), false);
      await page.getByRole("button", { name: "Attach Document", exact: true }).click(); dialog = page.getByRole("dialog", { name: "Attach import document", exact: true });
      await dialog.getByRole("combobox", { name: "Document type", exact: true }).selectOption("Packing List"); await dialog.getByLabel("Document", { exact: true }).setInputFiles({ name: "packing.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") }); await dialog.getByRole("button", { name: "Attach Document", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      await page.getByTitle("packing.pdf", { exact: true }).waitFor(); await capture("import-documents");
      record = { ...record, paymentMode: "TT", ttReference: "TT-REVIEW", status: "LC/TT Opened", milestone: "LC/TT Opened", blNumber: "BL-REVIEW", etd: today, items: [{ ...record.items[0], fobTotalBdt: "3750.00", totalCbm: "1" }], costs: [{ id: "ui-cost", name: "Freight", category: "Freight", amountForeign: "100", currency: "BDT", exchangeRate: "1", amountBdt: "100.00", allocationMethod: "CBM", appliesToItemIds: [], enteredBy: user.name, createdAt: new Date().toISOString() }], costingStatus: "In Progress" };
      await page.reload();
      await page.getByRole("button", { name: "Mark PI Received", exact: true }).click();
      await page.getByRole("button", { name: "Mark LC / TT Opened", exact: true }).click();
      const visibleSteps = page.getByRole("region", { name: "Import stages", exact: true });
      assert.equal(await visibleSteps.evaluate(node => node.scrollWidth <= node.clientWidth + 2), true, "All ten tabs must wrap without horizontal scrolling");
      for (const next of ["In Production", "Shipped", "At Port", "Costing"]) {
        if (next === "Costing") await capture("costing-next-action");
        await page.getByRole("button", { name: `Mark ${next}`, exact: true }).click();
        const stageName = { "In Production": "Shipment", "Shipped": "Documents", "At Port": "Costs & Allocation", "Costing": "Landed Cost" }[next];
        await page.getByRole("region", { name: "Import stages", exact: true }).getByRole("button", { name: stageName, exact: true }).and(page.locator('[aria-pressed="true"]')).waitFor();
      }
      await page.getByRole("button", { name: "Generate Preview", exact: true }).click();
      await page.getByRole("button", { name: "Mark Cost Finalized", exact: true }).waitFor();
      await capture("landed-cost-review");
      await page.getByRole("button", { name: "Mark Cost Finalized", exact: true }).click();
      await page.getByText("Finalized landed cost v1.", { exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "View Landed Cost", exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Generate Preview", exact: true }).count(), 0);
      await page.getByRole("button", { name: "Edit product", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Reopen for editing", exact: true });
      assert.equal(await dialog.getByRole("button", { name: "Reopen and Edit", exact: true }).isEnabled(), false);
      await dialog.getByLabel("Correction reason", { exact: true }).fill("Correct product details before receiving"); await capture("finalized-edit-confirmation");
      await dialog.getByRole("button", { name: "Reopen and Edit", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Edit imported product", exact: true }); await dialog.waitFor();
      assert.equal(record.snapshot, undefined); assert.equal(record.snapshotHistory.length, 1);
      await dialog.getByLabel("Quantity", { exact: true }).fill("2.5"); await dialog.getByLabel("Cartons", { exact: true }).fill("1"); await dialog.getByLabel("CBM / Carton", { exact: true }).fill("1"); await dialog.getByRole("button", { name: "Save Product Line", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      for (const step of ["PI Received", "LC / TT Opened"]) await page.getByRole("button", { name: `Mark ${step}`, exact: true }).click();
      for (const step of ["In Production", "Shipped", "At Port", "Costing"]) await page.getByRole("button", { name: `Mark ${step}`, exact: true }).click();
      await page.getByRole("button", { name: "Generate Preview", exact: true }).click();
      await page.getByRole("button", { name: "Mark Cost Finalized", exact: true }).click();
      await page.getByText("Finalized landed cost v2.", { exact: true }).waitFor();
      await page.getByRole("region", { name: "Import stages", exact: true }).getByRole("button", { name: "Receiving", exact: true }).click();
      await page.getByRole("button", { name: "Receive to Warehouse", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Receive to Warehouse", exact: true }).isEnabled(), false);
      await page.getByRole("button", { name: "Set Up Accounting", exact: true }).click();
      const importUrl = page.url(); assert.ok(importUrl.endsWith("/backend/imports/ui-import"), "Accounting setup must stay on the import route");
      const setupDialog = page.getByRole("dialog", { name: "Company Accounting Setup", exact: true }); await setupDialog.waitFor();
      await page.getByRole("button", { name: "Starter Setup", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Starter Accounting Setup", exact: true });
      await dialog.getByLabel("Setup reference", { exact: true }).fill("Owner-reviewed UAT setup");
      await dialog.getByRole("button", { name: "Continue to Accounts", exact: true }).click();
      assert.equal(await dialog.getByRole("combobox", { name: "Account for Inventory", exact: true }).inputValue(), "", "Suggested template must be explicit, not a hidden selected company account");
      await dialog.getByRole("combobox", { name: "Account for Inventory", exact: true }).selectOption("__add_chart__");
      const chartDialog = page.getByRole("dialog", { name: "Add chart account", exact: true });
      await chartDialog.getByLabel("Account code", { exact: true }).fill("INV-COMPANY"); await chartDialog.getByLabel("Account name", { exact: true }).fill("Company Medical Stock");
      await chartDialog.getByRole("button", { name: "Save Account", exact: true }).click(); await chartDialog.waitFor({ state: "hidden" });
      assert.equal(await dialog.getByRole("combobox", { name: "Account for Inventory", exact: true }).inputValue(), "chart-company-stock");
      await dialog.getByRole("combobox", { name: "Account for Inventory", exact: true }).scrollIntoViewIfNeeded(); await capture("starter-accounting-choices");
      await dialog.getByRole("button", { name: "Review Draft", exact: true }).click();
      assert.equal(await dialog.getByRole("button", { name: "Save Starter Draft", exact: true }).isEnabled(), false);
      await dialog.getByRole("checkbox").check(); await capture("starter-accounting-review");
      await dialog.getByRole("button", { name: "Save Starter Draft", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); assert.equal(ledgerReady, false);
      assert.equal(configurations[0].data.mappings.find(m => m.role === "Inventory").accountId, "chart-company-stock");
      await page.getByRole("button", { name: "Review & Approve", exact: true }).click(); dialog = page.getByRole("dialog", { name: "Review Accounting Setup", exact: true });
      assert.equal(await dialog.getByRole("button", { name: "Approve Company Setup", exact: true }).isEnabled(), false);
      await capture("company-accounting-review");
      await dialog.getByText("INV-COMPANY | Company Medical Stock", { exact: false }).waitFor();
      await dialog.getByLabel("Approval reason / evidence", { exact: true }).fill("Owner reviewed proposed posting accounts");
      await dialog.getByRole("checkbox").check(); await capture("company-accounting-approval");
      await dialog.getByRole("button", { name: "Approve Company Setup", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      assert.equal(page.url(), importUrl);
      await page.getByRole("button", { name: "Return to Import", exact: true }).click();
      await setupDialog.waitFor({ state: "hidden" }); assert.equal(page.url(), importUrl);
      await page.getByRole("button", { name: "Receive to Warehouse", exact: true }).click(); dialog = page.getByRole("dialog", { name: "Receive to warehouse", exact: true });
      assert.equal(await dialog.getByRole("button", { name: "Post Warehouse Receipt", exact: true }).isEnabled(), false);
      for (const [label, value] of [["Received Qty", "2.5"], ["Lot Number", "LOT-IMPORT"], ["Batch Number", "BATCH-IMPORT"], ["Manufacturing Date", today], ["Expiry Date", future], ["BIN / Rack Location", "A1"]]) await dialog.getByLabel(label, { exact: true }).fill(value);
      await capture("validated-receiving"); await dialog.getByRole("button", { name: "Post Warehouse Receipt", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Close Case", exact: true }).waitFor();
      assert.equal(record.status, "Received"); await capture("receiving-next-action");
      await page.getByRole("region", { name: "Import stages", exact: true }).getByRole("button", { name: "Activity & Closure", exact: true }).click();
      await page.getByText("Import created", { exact: true }).waitFor(); await page.getByText("Landed cost finalized (v1)", { exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Receive to Warehouse", exact: true }).count(), 0);
      await capture("import-activity");
      await page.getByRole("region", { name: "Import stages", exact: true }).getByRole("button", { name: "Receiving", exact: true }).click();
      await assertSections(8);
      const savedSnapshot = structuredClone(record.snapshot), savedReceipts = structuredClone(receiptRows);
      await page.getByRole("button", { name: "Close Case", exact: true }).click();
      dialog = page.getByRole("alertdialog", { name: "Close this import case?", exact: true }); await dialog.getByRole("button", { name: "Close case", exact: true }).click();
      await page.getByRole("button", { name: "Reopen Case", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Reopen this import case?", exact: true });
      await dialog.getByRole("button", { name: "Reopen Case", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Close Case", exact: true }).waitFor(); await assertSections(9);
      assert.equal(record.status, "Received"); assert.deepEqual(record.snapshot, savedSnapshot); assert.deepEqual(receiptRows, savedReceipts);
      assert.equal(await page.getByRole("button", { name: "Receive to Warehouse", exact: true }).count(), 0);
      await page.getByRole("button", { name: "Edit purchase order", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Edit purchase order", exact: true });
      assert.equal(await dialog.getByRole("combobox", { name: "Supplier", exact: true }).count(), 0);
      await dialog.getByLabel("PO Number", { exact: true }).fill("PO-CORRECTED-AFTER-REOPEN"); await capture("received-reference-editor");
      await dialog.getByRole("button", { name: "Save Commercial Data", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      assert.equal(record.poNumber, "PO-CORRECTED-AFTER-REOPEN");
      await page.getByRole("button", { name: "Edit payment", exact: true }).click(); dialog = page.getByRole("dialog", { name: "LC / TT", exact: true });
      assert.equal(await dialog.getByLabel("Payment mode", { exact: true }).count(), 0);
      await dialog.getByLabel("TT / Shipment reference", { exact: true }).fill("TT-CORRECTED");
      await dialog.getByRole("button", { name: "Save Changes", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      assert.equal("exchangeRate" in patches.at(-1), false); assert.equal("ttAmount" in patches.at(-1), false);
      await page.getByRole("button", { name: "Retract PI & Products completion", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Retract completion?", exact: true });
      await dialog.getByRole("button", { name: "Retract Completion", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      assert.equal(record.status, "Received"); assert.deepEqual(record.pendingReviewSteps, [3, 4, 5, 6]);
      assert.equal(await page.getByRole("button", { name: "Close Case", exact: true }).isEnabled(), false);
      await capture("received-review-retracted");
      for (const label of ["Mark PI Received", "Mark LC / TT Opened", "Mark In Production", "Mark Shipped", "Mark At Port", "Mark Costing"]) await page.getByRole("button", { name: label, exact: true }).click();
      assert.deepEqual(record.pendingReviewSteps, []); assert.deepEqual(record.snapshot, savedSnapshot); assert.deepEqual(receiptRows, savedReceipts);
      await capture("reopened-case");
      await page.goto(`${origin}/backend/inventory`); await page.getByRole("button", { name: "Add Inventory", exact: true }).click(); dialog = page.getByRole("dialog", { name: "Add Inventory", exact: true });
      await dialog.getByRole("combobox", { name: "Currency", exact: true }).selectOption("EUR"); assert.equal(await dialog.getByLabel("BDT per currency unit", { exact: true }).inputValue(), ""); await dialog.getByRole("combobox", { name: "Currency", exact: true }).selectOption("BDT");
      await dialog.getByRole("combobox", { name: "Supplier", exact: true }).selectOption("ui-supplier"); await dialog.getByLabel("Supplier invoice / Reference", { exact: true }).fill("SUPPLIER-INV-1"); await dialog.getByRole("combobox", { name: "Product 1", exact: true }).selectOption("ui-product");
      for (const [label, value] of [["Quantity 1", "2"], ["Unit price (BDT) 1", "10"], ["Lot number 1", "LOT-1"], ["Batch number 1", "BATCH-1"], ["Manufacturing date 1", today], ["Expiry date 1", future], ["BIN / Rack 1", "A1"]]) await dialog.getByLabel(label, { exact: true }).fill(value);
      await capture("purchase-editor"); await dialog.getByRole("button", { name: "Post Purchase Receipt", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      await page.getByRole("tab", { name: "Purchase Receipts", exact: true }).click(); await page.getByText("PR-2026-001", { exact: true }).waitFor(); await capture("purchase-register");
      await page.goto(`${origin}/backend/sales?view=collections`); await page.getByRole("button", { name: "Record Collection", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Record Collection", exact: true }); await dialog.getByRole("combobox", { name: "Deposit Account", exact: true }).selectOption("__add_master__");
      const accountDialog = page.getByRole("dialog", { name: "Add account", exact: true }); assert.equal(await accountDialog.getByLabel("Account type", { exact: true }).inputValue(), "Bank");
      await accountDialog.getByLabel("Name", { exact: true }).fill("Review Bank"); await accountDialog.getByRole("button", { name: "Save", exact: true }).click(); await accountDialog.waitFor({ state: "hidden" });
      for (const label of ["Customer", "Deposit Account"]) { const caption = dialog.getByText(label, { exact: true }); assert.equal(await caption.evaluate((node) => globalThis.getComputedStyle(node).color), "rgb(185, 28, 28)"); assert.ok((await caption.evaluate((node) => globalThis.getComputedStyle(node, "::after").content)).includes("*")); }
      assert.equal(accountRows[0].type, "Bank"); assert.equal(await dialog.getByRole("combobox", { name: "Deposit Account", exact: true }).inputValue(), "ui-account"); await capture("inline-payment-account");
      await page.goto(`${origin}/backend/accounts/ledger/journals/new`); await page.getByRole("combobox", { name: "Account line 1", exact: true }).selectOption("__add_chart__");
      dialog = page.getByRole("dialog", { name: "Add chart account", exact: true }); await dialog.getByLabel("Account code", { exact: true }).fill("9999"); await dialog.getByLabel("Account name", { exact: true }).fill("Review Chart Account");
      await dialog.getByRole("button", { name: "Save Account", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); assert.equal(await page.getByRole("combobox", { name: "Account line 1", exact: true }).inputValue(), "chart-review"); await capture("inline-chart-account");
      await page.goto(`${origin}/backend/accounts/ledger?view=mapping`);
      await page.getByRole("button", { name: "New Setup Version", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Accounting setup draft", exact: true });
      await dialog.getByRole("button", { name: "Continue to Accounts", exact: true }).click();
      assert.equal(await dialog.locator('[data-locked-account="Inventory"]').count(), 1);
      assert.equal(await dialog.getByRole("combobox", { name: "Inventory chart account", exact: true }).count(), 0, "Approved assignments must not look like broken dropdowns");
      assert.equal(await dialog.getByRole("button", { name: "Review Draft", exact: true }).isEnabled(), false, "New bank account must be assigned before review");
      await dialog.getByRole("combobox", { name: "Review Bank chart account", exact: true }).selectOption("chart-review");
      await capture("accounting-version-assignments");
      await dialog.getByRole("button", { name: "Review Draft", exact: true }).click();
      await dialog.getByRole("button", { name: "Back", exact: true }).click();
      assert.equal(await dialog.getByRole("combobox", { name: "Review Bank chart account", exact: true }).inputValue(), "chart-review", "Choices must survive wizard navigation");
      await dialog.getByRole("button", { name: "Review Draft", exact: true }).click();
      await dialog.getByRole("checkbox").check(); await dialog.getByRole("button", { name: "Save Setup Draft", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      assert.deepEqual(configurations[1].data.mappings, configurations[0].data.mappings);
      assert.deepEqual(configurations[1].data.cashMappings, [{ cashAccountId: "ui-account", accountId: "chart-review" }]);
      assert.equal(configurations[1].state, "Draft");
      await page.goto(`${origin}/backend/accounts/ledger?view=chart`);
      await page.getByLabel("Search accounts", { exact: true }).fill("Company Medical");
      assert.equal(await page.locator("tbody tr").count(), 1);
      await page.getByLabel("Account type", { exact: true }).selectOption("Expense");
      await page.getByText("No accounts match these filters.", { exact: true }).waitFor();
      await page.getByLabel("Account type", { exact: true }).selectOption(""); await capture("chart-search");
      await page.goto(`${origin}/backend/settings/approvals`);
      await page.getByRole("button", { name: "New Policy", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "New approval policy", exact: true });
      await dialog.getByRole("button", { name: "Close", exact: true }).focus();
      await page.keyboard.press("Shift+Tab");
      assert.equal(await dialog.getByRole("button", { name: "Save Draft", exact: true }).evaluate(el => el === globalThis.document.activeElement), true, "Focus must remain inside the dialog");
      await dialog.getByLabel("Find verifier / approver", { exact: true }).fill("Alex");
      await dialog.getByRole("group", { name: "Verifiers (0 selected)", exact: true }).getByRole("checkbox", { name: /Alex Reviewer/ }).check();
      await dialog.getByLabel("Find verifier / approver", { exact: true }).fill("Sam");
      await dialog.getByText("Selected: Alex Reviewer", { exact: true }).waitFor();
      await capture("approval-authority-search");
      await dialog.getByLabel("Find verifier / approver", { exact: true }).fill("");
      assert.equal(await dialog.getByRole("group", { name: "Verifiers (1 selected)", exact: true }).getByRole("checkbox", { name: /Alex Reviewer/ }).isChecked(), true);
      await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
      assert.deepEqual(errors, []); console.log(`PASS ${width}px: inline supplier/product/unit creation, private image limit, 10 import stages, LC/TT/Pending payloads/errors, document attachment, At Port to Costing to finalized snapshot/receiving, purchase receipt, safe service errors and inline cash/bank/chart accounts. Browser API intercepted; no live records changed.`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
