import test from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { hostedHarness } from "../testing/hosted.js";
import { documents, products, suppliers } from "../../database/schema.js";
import { businessDate } from "../../src/lib/date.js";

test("hosted flexibility: payment modes, private product/import uploads and purchase stock/payable reconciliation", { skip: process.env.RUN_HOSTED_FLEXIBILITY_TESTS !== "true", timeout: 360_000 }, async () => {
  assert.equal(new URL(process.env.SUPABASE_URL!).hostname.split(".")[0], "hyttuapvvqqxcyhojbwq", "Synthetic integration records belong only to development.");
  const h = await hostedHarness("flexibility"); const paths: string[] = []; const productIds: string[] = []; const supplierIds: string[] = []; let lcCaseId = "";
  try {
    const owner = await h.employee("Super Admin"); const warehouse = await h.employee("Warehouse Manager"); const officer = await h.employee("Import Officer");
    const purchaser = await h.employee("Warehouse Manager", ["edit_sensitive_cost"]);
    const today = businessDate(); const expiry = `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`;
    const supplierId = (await h.expect("/suppliers", owner.token, { name: `DEV TEST Supplier ${h.suffix}`, country: "Bangladesh" }, 201)).id;
    supplierIds.push(supplierId);
    const alternate = await h.expect("/suppliers", owner.token, { name: `DEV TEST Alternate ${h.suffix}`, country: "China" }, 201); supplierIds.push(alternate.id);
    await h.expect("/suppliers", warehouse.token);
    assert.ok((await h.expect("/suppliers", purchaser.token)).some((row: { id: string }) => row.id === supplierId));
    const createProduct = async (suffix: string, imageUrl = "") => {
      const product = await h.expect("/products", owner.token, { code: `TEST-FLEX-${suffix}-${h.suffix}`, name: `DEV TEST Product ${suffix}`, family: "Medical Consumables", variant: suffix, unit: "Box", imageUrl }, 201);
      productIds.push(product.id); return product;
    };
    const p = await createProduct("A");
    for (const paymentMode of ["LC", "TT", "Pending"]) {
      const record = await h.expect("/imports", owner.token, { supplierId, poNumber: `TEST-PO-${paymentMode}-${h.suffix}`, poDate: today, paymentMode: "Pending", items: [{ productId: p.id, quantity: "10" }] }, 201, h.key(`import-${paymentMode}`));
      const patch = { paymentMode, lcNumber: paymentMode === "LC" ? `TEST-LC-${h.suffix}` : "", lcAmount: "", lcOpenDate: "", lcExpiryDate: "", ttReference: paymentMode === "TT" ? `TEST-TT-${h.suffix}` : "", ttAmount: "", ttDate: "" };
      const updated = await h.expect(`/imports/${record.id}`, owner.token, patch, 200, { method: "PATCH" });
      assert.equal(updated.paymentMode, paymentMode); assert.equal(updated.lcAmount, undefined); assert.equal(updated.ttAmount, undefined);
      if (paymentMode === "LC") {
        lcCaseId = record.id;
        const split = await h.expect(`/imports/${record.id}`, owner.token, { lcBankAmount: "800.10", lcOtherAmount: "200.20", lcAmount: "0.01" }, 200, { method: "PATCH" });
        assert.equal(split.lcAmount, "1000.30"); assert.equal(split.lcBankAmount, "800.10"); assert.equal(split.lcOtherAmount, "200.20");
        const reloaded = await h.expect(`/imports/${record.id}`, owner.token); assert.equal(reloaded.lcBankAmount, "800.10");
        const hidden = await h.expect(`/imports/${record.id}`, officer.token); assert.equal(hidden.lcBankAmount, undefined); assert.equal(hidden.lcOtherAmount, undefined); assert.equal(hidden.lcAmount, undefined);
        await h.expect(`/imports/${record.id}`, officer.token, { lcBankAmount: "999", lcOtherAmount: "999", lcAmount: "1998" }, 200, { method: "PATCH" });
        assert.equal((await h.expect(`/imports/${record.id}`, owner.token)).lcAmount, "1000.30");
        const partial = await h.expect(`/imports/${record.id}`, owner.token, { lcOtherAmount: "250.10" }, 200, { method: "PATCH" }); assert.equal(partial.lcAmount, "1050.20");
        const switched = await h.expect(`/imports/${record.id}`, owner.token, { paymentMode: "TT", ttReference: `TEST-SWITCH-${h.suffix}` }, 200, { method: "PATCH" });
        assert.equal(switched.lcNumber, undefined); assert.equal(switched.lcBankAmount, undefined); assert.equal(switched.lcOtherAmount, undefined);
        const pending = await h.expect(`/imports/${record.id}`, owner.token, { paymentMode: "Pending" }, 200, { method: "PATCH" }); assert.equal(pending.ttReference, undefined);
      }
      if (paymentMode === "TT") {
        const bad = await h.call(`/imports/${record.id}`, owner.token, { paymentMode: "TT", ttAmount: "-1" }, { method: "PATCH" }); assert.equal(bad.status, 422);
      }
      if (paymentMode === "Pending") {
        const changed = await h.expect(`/imports/${record.id}`, owner.token, { supplierId: alternate.id }, 200, { method: "PATCH" });
        assert.equal(changed.supplierId, alternate.id); assert.equal(changed.supplierName, alternate.name);
        await h.expect(`/imports/${record.id}`, owner.token, { supplierId: "missing-supplier" }, 422, { method: "PATCH" });
        assert.equal((await h.expect(`/imports/${record.id}`, owner.token)).supplierId, alternate.id);
        const invalid = await h.call("/inventory/dispatch-preview", owner.token, { productId: p.id, quantity: "not-a-number" });
        assert.equal(invalid.status, 422); assert.ok(!invalid.message.includes("DecimalError"));
        const bytes = Buffer.from("%PDF-1.4\nDevelopment attachment test\n%%EOF");
        const upload = await h.expect("/uploads", owner.token, { purpose: "import-document", importId: record.id, documentType: "Packing List", fileName: "packing-list.pdf", mimeType: "application/pdf", sizeBytes: bytes.length }, 201);
        paths.push(upload.path);
        assert.equal((await fetch(upload.signedUrl, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: bytes })).ok, true);
        await h.expect(`/uploads/${upload.id}/complete`, owner.token, {});
        await h.expect(`/uploads/${upload.id}/complete`, owner.token, {});
        const reloaded = await h.expect(`/imports/${record.id}`, owner.token); assert.equal(reloaded.documents.length, 1); assert.equal(reloaded.documents[0].fileName, "packing-list.pdf");
        await h.expect(`/documents/${upload.id}`, officer.token);
        await h.expect(`/imports/${record.id}`, owner.token, { piNumber: "TEST-PI", paymentMode: "LC", lcNumber: `TEST-SUPPLIER-LOCK-${h.suffix}` }, 200, { method: "PATCH" });
        await h.expect(`/imports/${record.id}/transition`, owner.token, { status: "In Production" });
        await h.expect(`/imports/${record.id}`, owner.token, { supplierId }, 409, { method: "PATCH" });
        assert.equal((await h.expect(`/imports/${record.id}`, owner.token)).supplierId, alternate.id);
      }
    }
    console.log("PASS hosted: LC / TT / Pending, mode switches and private import attachment reload.");
    const image = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#218eae" } }).png().toBuffer();
    const upload = await h.expect("/uploads", owner.token, { purpose: "product-image", fileName: "product.png", mimeType: "image/png", sizeBytes: image.length }, 201); paths.push(upload.path);
    assert.equal((await fetch(upload.signedUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: image })).ok, true);
    await h.expect(`/uploads/${upload.id}/complete`, owner.token, {});
    const pictured = await createProduct("Pictured", `/api/documents/${upload.id}`);
    await h.expect("/products", owner.token, { code: `TEST-EXTERNAL-${h.suffix}`, name: "DEV TEST external image denied", family: "Test", variant: "X", unit: "Box", imageUrl: "https://example.invalid/untrusted.png" }, 422);
    const stored = (await h.ctx.db.select().from(documents).where(eq(documents.id, upload.id)))[0]; assert.equal(stored.productId, pictured.id);
    const opened = await h.expect(`/documents/${upload.id}`, warehouse.token); assert.equal((await fetch(opened.url)).ok, true);
    await h.expect("/uploads", warehouse.token, { purpose: "product-image", fileName: "x.png", mimeType: "image/png", sizeBytes: image.length }, 403);
    await h.expect("/uploads", owner.token, { purpose: "product-image", fileName: "x.png", mimeType: "image/png", sizeBytes: 1_000_000 }, 422);
    const forged = await h.call("/products", owner.token, { code: `TEST-FORGED-${h.suffix}`, name: "DEV TEST reused image", family: "Test", variant: "B", unit: "Box", imageUrl: `/api/documents/${upload.id}` }); assert.equal(forged.status, 422);
    const option = await h.expect("/settings/options", owner.token, { kind: "unit", value: "Box" }, 201);
    const same = await h.expect("/settings/options", owner.token, { kind: "unit", value: "box" }, 201); assert.equal(option.id, same.id);
    await h.expect("/settings/options", warehouse.token, { kind: "currency", value: "GBP" }, 403);
    console.log("PASS hosted: authorized private images, one-megabyte limit and scoped/deduplicated custom options.");
    const purchase = { supplierId, reference: `TEST-SUPPLIER-INVOICE-${h.suffix}`, receivedDate: today, currency: "BDT", exchangeRate: "1", notes: "DEV TEST receipt", lines: [{ productId: p.id, quantity: "3", unitPrice: "0.335", lotNumber: "LOT-TEST", batchNumber: `TEST-FLEX-${h.suffix}`, manufacturingDate: today, expiryDate: expiry, location: "A1" }] };
    await h.expect("/inventory/purchases", warehouse.token, purchase, 403, h.key("denied"));
    const [receipt, retried] = await Promise.all([h.expect("/inventory/purchases", owner.token, purchase, 201, h.key("purchase")), h.expect("/inventory/purchases", owner.token, purchase, 201, { ...h.key("purchase"), instance: 1 })]); assert.equal(receipt.id, retried.id);
    await h.expect("/inventory/purchases", owner.token, purchase, 409, h.key("duplicate"));
    const rows = (await h.ctx.db.execute(sql`select r.total_bdt::text total,b.id batch_id,b.quantity_available::text quantity,b.received_value_bdt::text value,b.source_reference reference,s.id obligation_id,s.amount::text payable from erp_private.purchase_receipts r join erp_private.purchase_lines l on l.receipt_id=r.id join erp_private.stock_batches b on b.purchase_line_id=l.id join erp_private.supplier_settlements s on s.purchase_receipt_id=r.id where r.id=${receipt.id}`)).rows;
    assert.equal(rows.length, 1); assert.equal(rows[0].total, "1.01"); assert.equal(rows[0].value, "1.01"); assert.equal(rows[0].payable, "1.01"); assert.equal(rows[0].quantity, "3.0000");
    const fifo = await h.expect("/inventory/dispatch-preview", owner.token, { productId: p.id, quantity: "2", date: today }); assert.equal(fifo.allocations[0].batchId, rows[0].batch_id);
    await h.expect(`/products/${p.id}`, owner.token, { unit: "Carton" }, 409, { method: "PATCH" });
    const batches = await h.expect(`/inventory/batches/page?productId=${p.id}`, warehouse.token); assert.equal(batches.rows[0].sourceType, "Purchase Receipt"); assert.equal(batches.rows[0].landedCostPerUnit, "0");
    const ownRows = await h.expect("/inventory/purchases", warehouse.token); const own = ownRows.find((r: { id: string }) => r.id === receipt.id); assert.equal(own.totalBdt, undefined);
    await h.expect(`/supplier-settlements/${rows[0].obligation_id}/reverse`, owner.token, { reason: "Protected purchase source" }, 409, h.key("reverse"));
    for (const reference of [purchase.reference, rows[0].reference]) await h.expect("/supplier-settlements", owner.token, { supplierId, date: today, reference, entryType: "Obligation", amount: "1.01" }, 409, h.key(`duplicate-obligation-${reference === purchase.reference ? "invoice" : "receipt"}`));
    const report = await h.expect(`/reports/purchase-receipts?from=${today}&to=${today}&product=${p.id}`, owner.token); assert.equal(report.rows.length, 1); assert.equal(report.rows[0].value, "1.01");
    const invalid = { ...purchase, reference: `TEST-BAD-${h.suffix}`, lines: [{ ...purchase.lines[0], batchNumber: `TEST-BAD-A-${h.suffix}` }, { ...purchase.lines[0], productId: "unknown", batchNumber: `TEST-BAD-B-${h.suffix}` }] };
    await h.expect("/inventory/purchases", owner.token, invalid, 422, h.key("atomic"));
    const [{ count }] = (await h.ctx.db.execute<{ count: number }>(sql`select count(*)::int count from erp_private.purchase_receipts where reference=${invalid.reference}`)).rows; assert.equal(count, 0);
    console.log("PASS hosted: idempotent purchase, protected valuation, FIFO, supplier payable/report, role redaction and atomic rollback.");
    if (process.env.RUN_LC_BROWSER_TESTS === "true") {
      await h.expect(`/imports/${lcCaseId}`, owner.token, { paymentMode: "LC", lcNumber: `TEST-BROWSER-${h.suffix}`, piNumber: "TEST-PI", currency: "USD", lcAmount: "500.00" }, 200, { method: "PATCH" });
      h.ctx.config.origin = "http://localhost:5182";
      const { lcSplitBrowserCheck } = await import("../../scripts/lc-split-browser-check.js");
      await lcSplitBrowserCheck({ apiBase: h.bases[0], peer: h.peer, email: owner.email, password: h.password, importId: lcCaseId, picturedCode: pictured.code });
    }
  } finally {
    for (const path of paths) await h.ctx.admin.storage.from("erp-documents").remove([path]);
    for (const id of productIds) await h.ctx.db.update(products).set({ active: false }).where(eq(products.id, id));
    for (const id of supplierIds) await h.ctx.db.update(suppliers).set({ active: false }).where(eq(suppliers.id, id));
    await h.close();
  }
});
