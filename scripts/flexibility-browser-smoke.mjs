import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { calculateLandedCost } from "../src/domains/imports/costing.ts";

const origin = process.env.SMOKE_ORIGIN ?? "http://localhost:5178";
const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const csp = vercel.headers.find((entry) => entry.source === "/(.*)").headers.find((header) => header.key === "Content-Security-Policy").value;
const today = new Date().toISOString().slice(0, 10);
const future = `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`;
const image = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#008ca8" } }).png().toBuffer();
const user = { id: "ui-flex-admin", name: "Form Review", email: "ui@example.invalid", role: "Super Admin", status: "Active", title: "Administrator", department: "Administration", phone: "", avatarUrl: "", capabilities: [], permissionOverrides: [] };
const token = `test.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
const session = { token, user, security: { assurance: "aal2", enrolled: true, required: true } };
const browser = await chromium.launch({ channel: "msedge", headless: true });
await mkdir("artifacts/backend/flexibility", { recursive: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const errors = []; const supplierRows = []; const productRows = []; const optionRows = []; const importPosts = []; const patches = []; const uploads = []; const itemPatches = []; const presetRows = []; const accountRows = []; const chartRows = [];
    let invalidAmount = false; let unavailable = false; let documentAttached = false; let purchasePosted = false;
    let record = { id: "ui-import", draftReference: "IMP-2026-001", primaryReference: "IMP-2026-001", supplierId: "ui-supplier", supplierName: "Review Supplier", poNumber: "PO-TEST", poDate: today, piNumber: "PI-TEST", paymentMode: "Pending", currency: "USD", exchangeRate: "0", rateDate: "", rateSource: "Pending", status: "PI Received", milestone: "PI Received", costingStatus: "Not Started", warehouseStatus: "Not Ready", items: [], costs: [], documents: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
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
        } else if (path === "/api/ledger/accounts") {
          if (request.method() === "POST") { chartRows.push({ id: "chart-review", active: true, ...body }); status = 201; }
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
        else if (path === "/api/imports/ui-import/receipts") data = [];
        else if (path === "/api/imports/ui-import/transition") {
          const allowed = { "LC/TT Opened": "In Production", "In Production": "Shipped", "Shipped": "At Port", "At Port": "Costing" };
          assert.equal(body.status, allowed[record.status]);
          record = { ...record, status: body.status, milestone: body.status }; data = record;
        } else if (path === "/api/imports/ui-import/cost-preview") data = calculateLandedCost(record.id, record.items, record.costs);
        else if (path === "/api/imports/ui-import/finalize") {
          assert.equal(record.status, "Costing");
          const snapshot = { ...calculateLandedCost(record.id, record.items, record.costs), id: "ui-snapshot", version: 1, finalizedAt: new Date().toISOString(), finalizedBy: user.name, immutable: true };
          record = { ...record, snapshot, snapshotHistory: [snapshot], status: "Cost Finalized", milestone: "Cost Finalized", costingStatus: "Finalized", warehouseStatus: "Ready" }; data = record;
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
      const capture = async (name) => { assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 2), true, `${name}: viewport overflow`); await page.screenshot({ path: `artifacts/backend/flexibility/${name}-${width}.png`, fullPage: true }); };
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
      await page.waitForURL("**/backend/imports/ui-import"); await page.getByRole("heading", { name: "PI & Products", exact: true }).waitFor();
      await capture("import-products");
      await page.getByRole("button", { name: "Edit commercial data", exact: true }).click(); dialog = page.getByRole("dialog", { name: "Edit commercial data", exact: true });
      assert.equal(await dialog.getByRole("combobox", { name: "Supplier", exact: true }).inputValue(), "ui-supplier");
      await dialog.getByLabel("PI Date", { exact: true }).fill(today);
      await dialog.getByRole("button", { name: "Save Commercial Data", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); assert.equal(patches.at(-1).supplierId, "ui-supplier");
      await page.getByRole("button", { name: "Edit product", exact: true }).click(); dialog = page.getByRole("dialog", { name: "Edit imported product", exact: true });
      await dialog.getByLabel("Quantity", { exact: true }).fill("1e100"); await dialog.getByRole("button", { name: "Save Product Line", exact: true }).click(); await dialog.getByRole("alert").filter({ hasText: "without scientific notation" }).waitFor();
      await dialog.getByRole("combobox", { name: "FOB currency", exact: true }).selectOption("GBP"); assert.equal(await dialog.getByLabel("BDT per currency unit", { exact: true }).inputValue(), ""); await dialog.getByLabel("Quantity", { exact: true }).fill("2.5"); await dialog.getByLabel("FOB / Unit (GBP)", { exact: true }).fill("10"); await dialog.getByLabel("BDT per currency unit", { exact: true }).fill("150"); await dialog.getByRole("button", { name: "Save Product Line", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); assert.equal(itemPatches.at(-1).currency, "GBP"); assert.equal(itemPatches.at(-1).quantity, "2.5");
      const stages = page.getByRole("region", { name: "Import stages", exact: true }); assert.equal(await stages.getByRole("button").count(), 10);
      for (const stage of ["LC / TT", "Production", "Shipment", "Documents", "Costs & Allocation", "Landed Cost", "Receiving", "Activity & Closure", "PO / Draft"]) { await stages.getByRole("button", { name: stage, exact: true }).click(); }
      await stages.getByRole("button", { name: "Documents", exact: true }).click();
      await page.getByRole("heading", { name: "Import Documents", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Edit shipment", exact: true }).count(), 0);
      assert.equal(await page.getByText("Bill of lading", { exact: true }).isVisible(), false);
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
      for (const next of ["In Production", "Shipped", "At Port", "Costing"]) {
        await page.getByRole("button", { name: `Mark ${next}`, exact: true }).click();
        const stageName = { "In Production": "Production", "Shipped": "Shipment", "At Port": "Documents", "Costing": "Costs & Allocation" }[next];
        await page.getByRole("region", { name: "Import stages", exact: true }).getByRole("button", { name: stageName, exact: true }).and(page.locator('[aria-pressed="true"]')).waitFor();
      }
      await capture("costing-next-action");
      await page.getByRole("button", { name: "Review Landed Cost", exact: true }).click();
      await page.getByRole("button", { name: "Finalize Snapshot", exact: true }).waitFor();
      await capture("landed-cost-review");
      await page.getByRole("button", { name: "Finalize Snapshot", exact: true }).click();
      await page.getByText("Finalized landed cost v1.", { exact: true }).waitFor();
      await page.getByRole("region", { name: "Import stages", exact: true }).getByRole("button", { name: "Receiving", exact: true }).click();
      await page.getByRole("button", { name: "Receive to Warehouse", exact: true }).waitFor();
      assert.equal(record.status, "Cost Finalized"); await capture("receiving-next-action");
      await page.getByRole("region", { name: "Import stages", exact: true }).getByRole("button", { name: "Activity & Closure", exact: true }).click();
      await page.getByText("Import created", { exact: true }).waitFor(); await page.getByText("Landed cost finalized (v1)", { exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Receive to Warehouse", exact: true }).count(), 0);
      await capture("import-activity");
      await page.getByRole("button", { name: "View Warehouse Receipts", exact: true }).click();
      await page.getByRole("heading", { name: "Warehouse Receiving", exact: true }).waitFor();
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
      assert.deepEqual(errors, []); console.log(`PASS ${width}px: inline supplier/product/unit creation, private image limit, 10 import stages, LC/TT/Pending payloads/errors, document attachment, At Port to Costing to finalized snapshot/receiving, purchase receipt, safe service errors and inline cash/bank/chart accounts. Browser API intercepted; no live records changed.`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
