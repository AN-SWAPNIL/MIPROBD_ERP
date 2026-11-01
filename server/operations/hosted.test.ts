import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { employees, sessions, products, suppliers } from "../../database/schema.js";
import { createContext } from "../foundation/context.js";
import { createFoundationRouter } from "../foundation/router.js";
import { ImportCaseSchema, LandedCostPreviewSchema, StockBatchSchema, StockMovementSchema, StockSummarySchema, WarehouseReceiptSchema } from "../../src/domains/schemas.js";
import { businessDate } from "../../src/lib/date.js";
import { isolatedPeer, localApiRequest } from "../testing/http.js";

test("hosted imports: persisted costing, role boundaries, immutable snapshots and concurrent/idempotent receipts", { skip: process.env.RUN_HOSTED_IMPORT_TESTS !== "true", timeout: 420000 }, async () => {
  const ctx = createContext();
  const second = createContext();
  const suffix = randomUUID();
  const peer = isolatedPeer(suffix);
  const password = `T!${randomBytes(24).toString("hex")}`;
  const identities: { id: string; authId: string; email: string; token: string }[] = [];
  const servers: ReturnType<ReturnType<typeof express>["listen"]>[] = [];
  const productIds: string[] = [];
  let supplierId: string | undefined;
  const storagePaths: string[] = [];
  const today = businessDate();
  const before = new Date(`${today}T00:00:00Z`); before.setUTCDate(before.getUTCDate() - 1);
  const yesterday = before.toISOString().slice(0, 10);
  const after = new Date(`${today}T00:00:00Z`); after.setUTCFullYear(after.getUTCFullYear() + 2);
  const expiry = after.toISOString().slice(0, 10);
  async function start(context: typeof ctx) {
    const app = express(); app.use(express.json({ limit: "256kb" })); app.use("/api", createFoundationRouter(context));
    const server = app.listen(0, "127.0.0.1"); servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  }
  const base = await start(ctx);
  const otherBase = await start(second);
  async function call(path: string, token?: string, body?: unknown, method = body === undefined ? "GET" : "POST", key?: string, target = base) {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (key) headers.set("Idempotency-Key", key);
    const response = await localApiRequest(target + path, peer, method, Object.fromEntries(headers.entries()), body === undefined ? undefined : JSON.stringify(body));
    const json = z.object({ data: z.any(), message: z.string() }).parse(response.json);
    return { status: response.status, data: json.data, message: json.message };
  }
  async function expect(path: string, token: string, body: unknown, status = 200, method = "POST", key?: string, target?: string) {
    const result = await call(path, token, body, method, key, target);
    assert.equal(result.status, status, `${method} ${path}: ${result.message}`); return result.data;
  }
  try {
    for (const role of ["Super Admin", "Import Officer", "Warehouse Manager", "Sales Executive", "Accounts", "Managing Director", "Sales Manager"] as const) {
      const label = role.toLowerCase().replaceAll(" ", "-");
      const email = `backend-${label}-${suffix}@example.invalid`;
      const { data, error } = await ctx.admin.auth.admin.createUser({ email, password, email_confirm: true });
      assert.equal(error, null); assert.ok(data.user);
      const id = `test-${label}-${suffix}`;
      identities.push({ id, authId: data.user.id, email, token: "" });
      await ctx.db.insert(employees).values({ id, email, authUserId: data.user.id, name: `DEV TEST ${role}`, role, status: "Active", employeeCode: `TEST-${label}-${suffix}`, capabilities: role === "Super Admin" ? ["view_sensitive_cost", "edit_sensitive_cost", "finalize_landed_cost", "reopen_landed_cost"] : [] });
      identities.at(-1)!.token = (await expect("/auth/login", "", { email, password })).token;
    }
    const [admin, officer, warehouse, sales, accounts, md, salesManager] = identities.map((row) => row.token);
    console.log("Hosted imports: masters, role checks and authoritative values");
    const simultaneousReads = await Promise.all(Array.from({ length: 12 }, (_, index) => call(index % 2 ? "/imports" : "/inventory/batches", admin)));
    assert.ok(simultaneousReads.every((row) => row.status === 200), "Parallel screen data requests must not hang the transaction-pooler connection");
    for (const [token, imports, inventory] of [[admin, 200, 200], [officer, 200, 403], [warehouse, 200, 200], [sales, 403, 403], [accounts, 403, 403], [md, 200, 200], [salesManager, 403, 200]] as const) {
      assert.equal((await call("/imports", token)).status, imports);
      assert.equal((await call("/inventory/batches", token)).status, inventory);
    }
    assert.equal((await call("/imports")).status, 401);
    supplierId = (await expect("/suppliers", admin, { name: `DEV TEST Supplier ${suffix}`, country: "China" }, 201)).id;
    for (const variant of ["A", "B"]) {
      const product = await expect("/products", admin, { code: `TEST-${variant}-${suffix}`, name: `DEV TEST Dialyzer ${variant}`, family: "Dialyzer", variant, unit: "pcs", imageUrl: "/mipro-logo.png", standardSalePrice: "1000" }, 201);
      productIds.push(product.id);
    }
    assert.equal((await call("/products", warehouse, { code: "forbidden", name: "Forbidden", family: "Test", variant: "A", unit: "pcs" })).status, 403);
    await expect(`/products/${productIds[0]}`, admin, { name: `DEV TEST Dialyzer A ${suffix}` }, 200, "PATCH");
    assert.equal((await call("/products", admin)).data.find((row: { id: string }) => row.id === productIds[0]).standardSalePrice, "1000.00");
    const payload = { supplierId, poNumber: `TEST-PO-${suffix}`, poDate: yesterday, piNumber: "TEST-PI", paymentMode: "LC", lcNumber: `TEST-LC-${suffix}`, currency: "USD", exchangeRate: "100", items: productIds.map((productId, index) => ({ productId, quantity: index ? "2" : "3", currency: "USD", fobUnitForeign: index ? "2" : "1", exchangeRate: "100", cbmMode: "MANUAL", totalCbm: index ? "3" : "1", fobTotalBdt: "0.01", productName: "forged" })) };
    assert.equal((await call("/imports", admin, payload)).status, 422);
    let record = ImportCaseSchema.parse(await expect("/imports", admin, payload, 201, "POST", `create-${suffix}`));
    const id = record.id;
    assert.equal((await expect("/imports", admin, payload, 201, "POST", `create-${suffix}`)).id, id);
    await expect("/imports", admin, { ...payload, notes: "changed" }, 409, "POST", `create-${suffix}`);
    assert.equal(record.primaryReference, payload.lcNumber);
    await expect("/imports", admin, { ...payload, lcNumber: ` ${payload.lcNumber.toLowerCase()} ` }, 409, "POST", `duplicate-lc-${suffix}`);
    const [a, b] = productIds.map((productId) => record.items.find((item) => item.productId === productId)!);
    assert.equal(a.fobTotalBdt, "300.00"); assert.notEqual(a.productName, "forged");
    await expect(`/imports/${id}`, admin, { notes: "Patch must retain payment and FX" }, 200, "PATCH");
    assert.equal((await call(`/imports/${id}`, admin)).data.exchangeRate, "100");
    const privateView = ImportCaseSchema.parse((await call(`/imports/${id}`, officer)).data);
    assert.equal(privateView.items[0].fobTotalBdt, "0");
    assert.equal(privateView.costs.length, 0);
    await expect(`/imports/${id}/costs`, officer, { name: "Freight" }, 403);
    const receipt = (itemId: string, quantity: string, tag: string, date = today) => ({ receivedDate: date, lines: [{ importItemId: itemId, quantityReceived: quantity, quantityRejected: "0", lotNumber: `LOT-${tag}`, batchNumber: `TEST-${suffix}-${tag}`, manufacturingDate: yesterday, expiryDate: expiry, warehouse: "Main Warehouse", location: "A-01" }] });
    await expect(`/imports/${id}/receive`, warehouse, receipt(a.id, "1", "early"), 409, "POST", `early-${suffix}`);
    const costBase = { category: "Freight", name: "Freight", amountForeign: "10", currency: "USD", exchangeRate: "120.1234", allocationMethod: "CBM" };
    await expect(`/imports/${id}/costs`, admin, { ...costBase, name: "Office Rent", category: "Office Rent" }, 422);
    await expect(`/imports/${id}/costs`, admin, { ...costBase, category: "Customs Duty" }, 422);
    await expect(`/imports/${id}/costs`, admin, costBase, 201);
    for (const cost of [
      { name: "Duty B", category: "Customs Duty", amountForeign: "5", allocationMethod: "PRODUCT_SPECIFIC", appliesToItemIds: [b.id] },
      { name: "Labour", amountForeign: "1", allocationMethod: "QUANTITY" },
      { name: "Insurance", amountForeign: "1", allocationMethod: "FOB_VALUE" },
      { name: "Manual", amountForeign: "3", allocationMethod: "MANUAL", manualSplits: [{ importItemId: a.id, amountBdt: "1" }, { importItemId: b.id, amountBdt: "2" }] }
    ]) await expect(`/imports/${id}/costs`, admin, { category: "Other Import Cost", currency: "BDT", exchangeRate: "1", ...cost }, 201);
    const preview = LandedCostPreviewSchema.parse(await expect(`/imports/${id}/cost-preview`, admin, {}));
    assert.deepEqual(preview.validationErrors, []); assert.equal(preview.totalShipmentCostBdt, "1911.23");
    await expect(`/imports/${id}/finalize`, officer, {}, 403, "POST", `bad-${suffix}`);
    record = ImportCaseSchema.parse(await expect(`/imports/${id}/finalize`, admin, {}, 200, "POST", `final-${suffix}`));
    const snapshotId = record.snapshot!.id;
    assert.equal((await expect(`/imports/${id}/finalize`, admin, {}, 200, "POST", `final-${suffix}`)).snapshot.id, snapshotId);
    await expect(`/imports/${id}/items/${a.id}`, admin, { quantity: "99" }, 423, "PATCH");
    await expect(`/imports/${id}/reopen`, admin, { reason: "Testing audited correction before receipt" });
    record = ImportCaseSchema.parse(await expect(`/imports/${id}/finalize`, admin, {}, 200, "POST", `refinal-${suffix}`));
    assert.equal(record.snapshot!.version, 2); assert.equal(record.snapshotHistory!.length, 2);
    for (const table of ["landed_cost_snapshots", "warehouse_receipts", "receipt_lines", "stock_movements", "posting_keys"]) {
      // Restricted runtimes deny DELETE before a table-owner's append-only trigger would run.
      await assert.rejects(ctx.db.execute(sql`delete from erp_private.${sql.identifier(table)} where false`), (error: unknown) => ["55000", "42501"].includes((error as { cause?: { code: string } }).cause?.code ?? ""));
    }
    console.log("Hosted imports: document sensitivity and private Storage");
    const upload = await expect("/uploads", officer, { purpose: "import-document", importId: id, documentType: "PI", sensitive: false, fileName: "test-pi.pdf", mimeType: "application/pdf", sizeBytes: 14 }, 201);
    storagePaths.push(upload.path);
    assert.equal((await ctx.admin.storage.from("erp-documents").uploadToSignedUrl(upload.path, upload.token, Buffer.from("%PDF-1.7\n%%EOF"), { contentType: "application/pdf" })).error, null);
    await expect(`/uploads/${upload.id}/complete`, officer, {});
    assert.equal((await call(`/documents/${upload.id}`, officer)).status, 403);
    assert.equal((await call(`/documents/${upload.id}`, admin)).status, 200);
    assert.equal((await call(`/imports/${id}`, officer)).data.documents.length, 0);
    console.log("Hosted imports: atomic partial receipts, rollback and independent-worker concurrency");
    const firstReceipt = receipt(a.id, "1", "a1", yesterday);
    const first = WarehouseReceiptSchema.parse(await expect(`/imports/${id}/receive`, warehouse, firstReceipt, 201, "POST", `receive-${suffix}`));
    assert.equal(first.lines[0].landedCostPerUnit, "0");
    assert.equal((await expect(`/imports/${id}/receive`, warehouse, firstReceipt, 201, "POST", `receive-${suffix}`, otherBase)).id, first.id);
    await expect(`/imports/${id}/receive`, warehouse, receipt(a.id, "2", "different"), 409, "POST", `receive-${suffix}`);
    const invalid = receipt(a.id, "1", "rollback"); invalid.lines.push({ ...invalid.lines[0], importItemId: "missing", batchNumber: "missing" });
    await expect(`/imports/${id}/receive`, warehouse, invalid, 422, "POST", `rollback-${suffix}`);
    assert.equal((await call(`/imports/${id}/receipts`, admin)).data.length, 1);
    const races = await Promise.all([
      call(`/imports/${id}/receive`, warehouse, receipt(a.id, "2", "race1"), "POST", `race1-${suffix}`),
      call(`/imports/${id}/receive`, warehouse, receipt(a.id, "2", "race2"), "POST", `race2-${suffix}`, otherBase)
    ]);
    assert.deepEqual(races.map((row) => row.status).sort(), [201, 409]);
    await expect(`/imports/${id}/reopen`, admin, { reason: "Receipt must prevent snapshot replacement" }, 409);
    await expect(`/imports/${id}/receive`, warehouse, receipt(b.id, "1", "b1"), 201, "POST", `b1-${suffix}`);
    await expect(`/imports/${id}/receive`, warehouse, receipt(b.id, "1", "b2"), 201, "POST", `b2-${suffix}`);
    record = ImportCaseSchema.parse((await call(`/imports/${id}`, admin, undefined, "GET", undefined, otherBase)).data);
    assert.equal(record.status, "Received");
    const stock = (await call("/inventory/stock", admin)).data.map((row: unknown) => StockSummarySchema.parse(row)).filter((row: { productId: string }) => productIds.includes(row.productId));
    const { Decimal } = await import("decimal.js");
    assert.equal(stock.reduce((total: InstanceType<typeof Decimal>, row: { inventoryValue?: string }) => total.plus(row.inventoryValue!), new Decimal(0)).toFixed(2), "1911.23");
    const batches = (await call("/inventory/batches", admin)).data.map((row: unknown) => StockBatchSchema.parse(row)).filter((row: { sourceImportId: string }) => row.sourceImportId === id);
    assert.equal(batches.length, 4);
    for (const row of (await call("/inventory/movements", admin)).data) StockMovementSchema.parse(row);
    const fifo = await expect("/inventory/dispatch-preview", warehouse, { productId: productIds[0], quantity: "2", date: today });
    assert.equal(fifo.allocations[0].receivedDate, yesterday);
    const newer = batches.find((row: { productId: string; receivedDate: string }) => row.productId === productIds[0] && row.receivedDate === today)!;
    assert.equal((await expect("/inventory/dispatch-preview", warehouse, { productId: productIds[0], quantity: "1", date: today, batchId: newer.id })).requiresOverride, true);
    const warehouseStock = (await call("/inventory/stock", warehouse)).data;
    assert.equal(warehouseStock.every((row: object) => !("inventoryValue" in row)), true);
    await expect(`/imports/${id}/transition`, admin, { status: "Closed" });
    if (process.env.RUN_BACKEND_BROWSER_TESTS === "true") {
      console.log("Hosted imports: starting browser acceptance checks");
      const receivingCase = await expect("/imports", admin, { ...payload, lcNumber: `TEST-RECEIVE-UI-${suffix}` }, 201, "POST", `ui-import-${suffix}`);
      await expect(`/imports/${receivingCase.id}/finalize`, admin, {}, 200, "POST", `ui-finalize-${suffix}`);
      const { operationsBrowserSmoke } = await import("../../scripts/operations-browser-smoke.js");
      await operationsBrowserSmoke(base, identities[0].email, password, id, identities[2].email, receivingCase.id, peer);
    }
    console.log("Hosted imports passed. Clearly labelled DEV TEST business records remain for audit; test identities are removed.");
  } finally {
    for (const server of servers) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
    if (storagePaths.length) await ctx.admin.storage.from("erp-documents").remove(storagePaths);
    for (const productId of productIds) await ctx.db.update(products).set({ active: false }).where(eq(products.id, productId));
    if (supplierId) await ctx.db.update(suppliers).set({ active: false }).where(eq(suppliers.id, supplierId));
    for (const row of identities) {
      try {
        await ctx.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.employeeId, row.id));
        await ctx.db.update(employees).set({ status: "Inactive", authUserId: null }).where(eq(employees.id, row.id));
      } finally { await ctx.admin.auth.admin.deleteUser(row.authId); }
    }
    await ctx.client.end(); await second.client.end();
  }
});
