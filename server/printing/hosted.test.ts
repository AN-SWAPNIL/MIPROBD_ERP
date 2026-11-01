import test from "node:test";
import assert from "node:assert/strict";
import { and, eq, sql } from "drizzle-orm";
import { auditEvents, cashAccounts, customers, employees, printConfigurations, products, suppliers } from "../../database/schema.js";
import { hostedHarness } from "../testing/hosted.js";
import { PrintConfigurationSchema, TransactionPrintPayloadSchema } from "../../src/domains/schemas.js";
import { businessDate } from "../../src/lib/date.js";

test("hosted printing: saved stationery, optimistic changes, source/record scope and both print modes", { skip: process.env.RUN_HOSTED_PRINT_TESTS !== "true", timeout: 420000 }, async () => {
  const h = await hostedHarness("print"); const { expect, key, ctx } = h;
  const today = businessDate(); const masterIds: { table: typeof customers | typeof products | typeof suppliers | typeof cashAccounts; id: string }[] = [];
  try {
    const admin = await h.employee("Super Admin", ["view_sensitive_cost", "edit_sensitive_cost", "finalize_landed_cost"]);
    const sales = await h.employee("Sales Executive"); const other = await h.employee("Sales Executive"); const accounts = await h.employee("Accounts"); const warehouse = await h.employee("Warehouse Manager"); const officer = await h.employee("Import Officer"); const md = await h.employee("Managing Director");
    const config = PrintConfigurationSchema.parse(await expect("/settings/print", admin.token)); assert.ok(config.version);
    assert.deepEqual(await expect("/print/config", sales.token), config);
    await expect("/settings/print", sales.token, undefined, 403);
    await expect("/settings/print", md.token, config, 403, { method: "PATCH" });
    await expect("/settings/print", accounts.token, config, 403, { method: "PATCH" });
    await expect("/settings/print", admin.token, { ...config, version: config.version - 1 }, config.version > 1 ? 409 : 422, { method: "PATCH" });
    await expect("/settings/print", admin.token, { ...config, identities: config.identities.map((item) => ({ ...item, backgroundImageUrl: "https://example.com/x.jpg" })) }, 422, { method: "PATCH" });
    const saved = PrintConfigurationSchema.parse(await expect("/settings/print", admin.token, config, 200, { method: "PATCH" }));
    assert.equal(saved.version, config.version + 1); assert.deepEqual(saved.identities, config.identities);
    assert.deepEqual(await expect("/print/config", admin.token, undefined, 200, { instance: 1 }), saved);
    await expect("/settings/print", admin.token, config, 409, { method: "PATCH" });
    const events = await ctx.db.select().from(auditEvents).where(and(eq(auditEvents.actorId, admin.id), eq(auditEvents.entityType, "PrintConfiguration"))); assert.equal(events.length, 1); assert.deepEqual(events[0].details.after, { identities: saved.identities, defaultIdentityId: saved.defaultIdentityId, defaultLetterheadMode: saved.defaultLetterheadMode });
    await assert.rejects(ctx.db.transaction(async (tx) => { await tx.delete(printConfigurations).where(eq(printConfigurations.id, "company")); }));
    const [rls] = (await ctx.db.execute<{ relrowsecurity: boolean }>(sql`select relrowsecurity from pg_class where oid = 'erp_private.print_configurations'::regclass`)).rows; assert.equal(rls.relrowsecurity, true);
    const supplier = await expect("/suppliers", admin.token, { name: `DEV TEST Print Supplier ${h.suffix}`, country: "China" }, 201); masterIds.push({ table: suppliers, id: supplier.id });
    const product = await expect("/products", admin.token, { code: `TEST-PRINT-${h.suffix}`, name: "DEV TEST Print Dialyzer", family: "Dialyzer", variant: "Test", unit: "pcs", standardSalePrice: "12.34" }, 201); masterIds.push({ table: products, id: product.id });
    const customer = await expect("/customers", sales.token, { name: `DEV TEST Print Hospital ${h.suffix}`, type: "Hospital", address: "Uttara, Dhaka", phone: "0123456789" }, 201, key("customer")); masterIds.push({ table: customers, id: customer.id });
    const quote = await expect("/quotations", sales.token, { customerId: customer.id, date: today, validityDays: 30, paymentTerms: "Credit", lines: [{ productId: product.id, quantity: "0.3", unitPrice: "12.34", discount: "0.01" }] }, 201, key("quote"));
    const printable = TransactionPrintPayloadSchema.parse(await expect(`/print/records/quotation/${quote.id}`, sales.token)); assert.equal(printable.kind, "quotation"); if (printable.kind === "quotation") { assert.equal(printable.record.total, "3.69"); assert.equal(printable.record.lines[0].quantity, "0.3000"); }
    await expect(`/print/records/quotation/${quote.id}`, other.token, undefined, 404);
    await expect(`/print/records/quotation/${quote.id}`, warehouse.token, undefined, 403);
    await expect(`/print/records/quotation/${quote.id}`, officer.token, undefined, 403);
    await expect(`/print/records/quotation/${quote.id}`, md.token);
    const order = await expect(`/quotations/${quote.id}/convert`, sales.token, { version: quote.version, deliveryInstruction: "Test receiving desk" }, 201, key("convert"));
    assert.equal((await expect(`/print/records/order/${order.id}`, sales.token)).record.total, "3.69");
    await expect(`/print/records/order/${order.id}`, other.token, undefined, 404);
    await ctx.db.update(employees).set({ permissionOverrides: [{ permission: "print", action: "view", effect: "DENY" }] }).where(eq(employees.id, other.id));
    await expect("/print/config", other.token, undefined, 403);
    await expect(`/print/records/order/${order.id}`, other.token, undefined, 403);
    const bank = await expect("/settings/accounts", admin.token, { name: `DEV TEST Print Bank ${h.suffix}`, type: "Cash", balance: "0" }, 201, key("bank")); masterIds.push({ table: cashAccounts, id: bank.id });
    const voucher = await expect("/account-transactions", admin.token, { accountId: bank.id, date: today, direction: "In", amount: "0.11", sourceType: "Advance", partyName: "DEV TEST", description: "DEV TEST printing" }, 201, key("voucher"));
    const v = await expect(`/print/records/credit-voucher/${voucher.id}`, accounts.token); assert.equal(v.record.amount, "0.11"); assert.equal(v.voucherType, "CREDIT VOUCHER");
    await expect(`/print/records/debit-voucher/${voucher.id}`, admin.token, undefined, 404);
    await expect(`/print/records/credit-voucher/${voucher.id}`, sales.token, undefined, 403);
    const imp = await expect("/imports", admin.token, { supplierId: supplier.id, poNumber: `TEST-PRINT-PO-${h.suffix}`, poDate: today, piNumber: "TEST-PI", paymentMode: "TT", ttReference: `TEST-PRINT-TT-${h.suffix}`, currency: "BDT", exchangeRate: "1", items: [{ productId: product.id, quantity: "1", currency: "BDT", fobUnitForeign: "12.34", exchangeRate: "1", cbmMode: "MANUAL", totalCbm: "1" }] }, 201, key("import"));
    await expect(`/print/records/import-cost/${imp.id}`, admin.token, undefined, 409);
    await expect(`/imports/${imp.id}/finalize`, admin.token, {}, 200, key("finalize"));
    const cost = await expect(`/print/records/import-cost/${imp.id}`, admin.token); assert.equal(cost.record.snapshot.totalShipmentCostBdt, "12.34"); assert.deepEqual(cost.record.documents, []);
    await expect(`/print/records/import-cost/${imp.id}`, warehouse.token, undefined, 403);
    await expect(`/print/records/import-cost/${imp.id}`, officer.token, undefined, 403);
    const expiry = new Date(`${today}T00:00:00Z`); expiry.setUTCFullYear(expiry.getUTCFullYear() + 2);
    await expect(`/imports/${imp.id}/receive`, warehouse.token, { receivedDate: today, lines: [{ importItemId: imp.items[0].id, quantityReceived: "1", quantityRejected: "0", lotNumber: "TEST-PRINT", batchNumber: `TEST-PRINT-${h.suffix}`, manufacturingDate: today, expiryDate: expiry.toISOString().slice(0, 10), warehouse: "Main Warehouse" }] }, 201, key("receive"));
    const delivery = await expect("/deliveries", admin.token, { orderId: order.id, date: today, remarks: "Test receiving desk", lines: [{ productId: product.id, quantity: "0.3", batchId: "AUTO" }] }, 201, key("dispatch"));
    const invoice = await expect("/invoices", sales.token, { date: today, deliveryIds: [delivery.id] }, 201, key("invoice"));
    await expect(`/invoices/${invoice.id}/approve`, md.token, {}, 200, key("approve"));
    const receipt = await expect("/collections", accounts.token, { customerId: customer.id, orderId: order.id, invoiceId: invoice.id, date: today, amount: "3.69", paymentMode: "Cash", accountId: bank.id, referenceNumber: "TEST PRINT" }, 201, key("receipt"));
    const invoicePrint = await expect(`/print/records/invoice/${invoice.id}`, sales.token); assert.equal(invoicePrint.references.order, order.orderNumber); assert.deepEqual(invoicePrint.references.deliveries, [delivery.challanNumber]);
    const receiptPrint = await expect(`/print/records/receipt/${receipt.id}`, sales.token); assert.equal(receiptPrint.references.invoice, invoice.invoiceNumber); assert.equal(receiptPrint.references.order, order.orderNumber);
    for (const [type, id] of [["challan", delivery.id], ["invoice", invoice.id], ["receipt", receipt.id]]) {
      TransactionPrintPayloadSchema.parse(await expect(`/print/records/${type}/${id}`, sales.token));
      await expect(`/print/records/${type}/${id}`, other.token, undefined, 403);
    }
    await ctx.db.update(employees).set({ permissionOverrides: [{ permission: "sales", action: "view", effect: "ALLOW" }] }).where(eq(employees.id, warehouse.id));
    const safeChallan = await expect(`/print/records/challan/${delivery.id}`, warehouse.token); assert.equal(safeChallan.financialVisible, false); assert.equal(safeChallan.record.lines[0].unitPrice, "Restricted"); assert.equal(safeChallan.record.lines[0].lineTotal, "Restricted");
    for (const [type, id] of [["quotation", quote.id], ["order", order.id], ["invoice", invoice.id], ["receipt", receipt.id]]) await expect(`/print/records/${type}/${id}`, warehouse.token, undefined, 403);
    await expect("/print/records/employee-activity/anything", admin.token, undefined, 422);
    await expect("/print/config", "", undefined, 401);
    if (process.env.RUN_BACKEND_BROWSER_TESTS === "true") {
      const { printBackendBrowserSmoke } = await import("../../scripts/print-backend-browser-smoke.js");
      await printBackendBrowserSmoke(h.bases[0], admin.email, h.password, [ ["quotation", quote.id, "3.69"], ["order", order.id, "3.69"], ["challan", delivery.id, "3.69"], ["invoice", invoice.id, "3.69"], ["receipt", receipt.id, "3.69"], ["credit-voucher", voucher.id, "0.11"], ["import-cost", imp.id, "12.34"] ]);
    }
    await expect(`/collections/${receipt.id}/reverse`, accounts.token, { reason: "Print test cleanup: reverse receipt" }, 200, key("receipt-reverse"));
    assert.equal((await expect(`/print/records/receipt/${receipt.id}`, admin.token)).record.status, "Reversed");
    const reversedVoucher = await expect(`/account-transactions/${voucher.id}/reverse`, admin.token, { reason: "Print test cleanup: reverse advance" }, 200, key("voucher-reverse"));
    assert.equal((await expect(`/print/records/credit-voucher/${voucher.id}`, admin.token)).reversalReference, reversedVoucher.voucherNumber);
    console.log("Hosted printing: configuration, scopes, decimal amounts and A4 previews verified.");
  } finally {
    for (const master of masterIds) await ctx.db.update(master.table).set({ active: false }).where(eq(master.table.id, master.id));
    await h.close();
  }
});
