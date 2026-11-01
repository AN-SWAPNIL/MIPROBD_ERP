import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { and, eq, sql } from "drizzle-orm";
import { accountTransactions, customerEntries, openingDrafts, openingPositions, stockBatches, stockMovements, supplierSettlements } from "../../database/schema.js";
import { openingDraftData, type OpeningData, type OpeningDraft, type OpeningReconciliation } from "../../src/domains/opening/contracts.js";
import { StockBatchSchema } from "../../src/domains/schemas.js";
import { PersistentReportSchema } from "../../src/domains/reports/persistentContracts.js";
import { businessDate } from "../../src/lib/date.js";
import { hostedHarness } from "../testing/hosted.js";
import { D } from "../trading/money.js";

test("hosted opening posting: atomic five-ledger cutover, replay/race safety, conditions, historical reports and later collection/dispatch", { skip: process.env.RUN_HOSTED_UPDATE13_TESTS !== "true", timeout: 480000 }, async () => {
  const h = await hostedHarness("openingpost");
  try {
    const admin = await h.employee("Super Admin", ["view_sensitive_cost", "view_profit"]);
    const approver = await h.employee("Super Admin", ["view_sensitive_cost"]); const warehouse = await h.employee("Warehouse Manager"); const sales = await h.employee("Sales Executive");
    const today = businessDate(); const asOf = "2026-10-01";
    const product = await h.expect("/products", admin.token, { code: `DEV-OPEN-${h.suffix}`, name: `DEV TEST Opening Product ${h.suffix}`, family: "Dialyzer", variant: "Opening", unit: "pcs", standardSalePrice: "1" }, 201);
    const customer = await h.expect("/customers", admin.token, { name: `DEV TEST Opening Customer ${h.suffix}`, type: "Hospital", address: "DEV TEST Dhaka", phone: "0123456789" }, 201, h.key("customer"));
    const supplier = await h.expect("/suppliers", admin.token, { name: `DEV TEST Opening Supplier ${h.suffix}`, country: "China" }, 201);
    const bank = await h.expect("/settings/accounts", admin.token, { name: `DEV TEST Opening Bank ${h.suffix}`, type: "Bank", balance: "0" }, 201, h.key("bank"));
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Cutover"); sheet.getCell("A1").value = `DEV TEST ${h.suffix}`;
    for (let r = 2; r <= 7; r++) sheet.getCell(`A${r}`).value = r;
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
    const reserved = await h.expect("/opening/sources/upload", admin.token, { fileName: `DEV TEST opening ${h.suffix}.xlsx`, sizeBytes: bytes.length }, 201);
    assert.equal((await fetch(reserved.signedUrl, { method: "PUT", headers: { "Content-Type": reserved.mimeType }, body: bytes })).ok, true);
    const source = await h.expect(`/opening/sources/${reserved.id}/complete`, admin.token, {});
    const common = { sourceSheet: "Cutover", sourceReference: `DEV TEST ${h.suffix}` };
    const data: OpeningData = openingDraftData.parse({ asOfDate: asOf, proofReference: `DEV TEST approved count ${h.suffix}`, exceptionResolutions: [], lines: [
      { ...common, id: "stock", kind: "Stock", entityId: product.id, sourceCell: "A2", quantity: "3", unitCostBdt: "33.3333333333", condition: "Saleable", lot: "DEV TEST", batch: `DEV-OPEN-${h.suffix}`, manufacturingDate: "2026-01-01", expiryDate: "2028-12-31", receivedDate: "2026-09-01", location: "DEV-OPEN-A" },
      { ...common, id: "hold", kind: "Stock", entityId: product.id, sourceCell: "A3", quantity: "1", unitCostBdt: "5", condition: "Quarantine", lot: "DEV TEST", batch: `DEV-HOLD-${h.suffix}`, manufacturingDate: "2026-01-01", expiryDate: "2028-12-31", location: "DEV-HOLD" },
      { ...common, id: "ar", kind: "Customer Due", entityId: customer.id, sourceCell: "A4", amountBdt: "200", originalDocumentDate: "2026-09-01", dueDate: "2026-09-30" },
      { ...common, id: "ap", kind: "Supplier Due", entityId: supplier.id, sourceCell: "A5", amountBdt: "80" },
      { ...common, id: "advance", sourceReference: `DEV TEST ADV ${h.suffix}`, kind: "Supplier Advance", entityId: supplier.id, sourceCell: "A6", amountBdt: "20" },
      { ...common, id: "cash", kind: "Cash Bank", entityId: bank.id, sourceCell: "A7", amountBdt: "50" }
    ] });
    async function prepare(name: string, inputData = data) {
      let draft: OpeningDraft = await h.expect("/opening/drafts", admin.token, { name: `DEV TEST ${name} ${h.suffix}`, sourceId: source.id, data: inputData }, 201);
      await h.expect(`/opening/drafts/${draft.id}/post`, admin.token, { version: draft.version }, 409);
      draft = await h.expect(`/opening/drafts/${draft.id}/validate`, admin.token, { version: draft.version }); assert.equal(draft.state, "Validated");
      draft = await h.expect(`/opening/drafts/${draft.id}/preview`, admin.token, { version: draft.version });
      return await h.expect(`/opening/drafts/${draft.id}/approve`, admin.token, { version: draft.version }) as OpeningDraft;
    }
    let draft = await prepare("primary"); const duplicate = await prepare("duplicate");
    await h.expect(`/opening/drafts/${draft.id}/post`, sales.token, { version: draft.version }, 403);
    await h.expect(`/opening/drafts/${draft.id}/post`, admin.token, { version: draft.version - 1 }, 409);
    const posted = await Promise.all([h.call(`/opening/drafts/${draft.id}/post`, admin.token, { version: draft.version }), h.call(`/opening/drafts/${draft.id}/post`, approver.token, { version: draft.version }, { instance: 1 })]);
    assert.deepEqual(posted.map((r) => r.status), [200, 200]); draft = posted[0].data; assert.equal(draft.state, "Posted");
    const positions = await h.ctx.db.select().from(openingPositions).where(eq(openingPositions.draftId, draft.id)); assert.equal(positions.length, 6);
    await h.expect(`/opening/drafts/${duplicate.id}/post`, admin.token, { version: duplicate.version }, 409);
    assert.equal((await h.ctx.db.select().from(openingPositions).where(eq(openingPositions.draftId, duplicate.id))).length, 0);
    assert.equal((await h.ctx.db.select().from(openingDrafts).where(eq(openingDrafts.id, duplicate.id)))[0].state, "Approved");
    const stock = (await h.expect(`/inventory/batches/page?productId=${product.id}`, warehouse.token)).rows.map((r: unknown) => StockBatchSchema.parse(r));
    assert.equal(stock.length, 2); assert.ok(stock.every((r: typeof stock[number]) => r.sourceType === "Opening Stock" && !r.sourceImportId && r.landedCostPerUnit === "0"));
    const plan = await h.expect("/inventory/dispatch-preview", admin.token, { productId: product.id, quantity: "3", date: today }); assert.equal(plan.availableQuantity, "3.0000");
    await h.expect("/inventory/dispatch-preview", admin.token, { productId: product.id, quantity: "4", date: today }, 409);
    await h.expect("/inventory/dispatch-preview", admin.token, { productId: product.id, quantity: "1", date: "2026-09-30" }, 409);
    assert.equal((await h.expect(`/inventory/batches/page?eligibleOnly=true&asOfDate=2026-09-30&productId=${product.id}`, admin.token)).total, 0);
    const report = async (id: string, to: string, filters: Record<string, string>) => PersistentReportSchema.parse(await h.expect(`/reports/${id}?${new URLSearchParams({ from: "2026-09-01", to, ...filters })}`, admin.token));
    assert.equal((await report("current-stock", "2026-09-30", { product: product.id })).rowCount, 0, "Original FIFO date must not backdate the opening valuation");
    assert.equal((await report("current-stock", asOf, { product: product.id })).totals.value, "105.00");
    assert.equal((await report("supplier-list", today, { supplier: supplier.id })).totals.unpaid, "60.00");
    assert.equal((await report("supplier-list", today, { supplier: supplier.id })).totals.paid, "0.00");
    const cashBefore = (await h.ctx.db.select().from(accountTransactions).where(eq(accountTransactions.accountId, bank.id))); assert.equal(cashBefore.length, 1); assert.equal(cashBefore[0].amount, "50.00");
    const receipt = await h.expect("/collections", admin.token, { customerId: customer.id, date: today, amount: "75", paymentMode: "Bank Transfer", accountId: bank.id, referenceNumber: "DEV TEST opening collection" }, 201, h.key("collect"));
    assert.equal(receipt.allocations.length, 1); const ar = positions.find((p) => p.kind === "Customer Due")!;
    assert.equal((await h.ctx.db.select().from(customerEntries).where(eq(customerEntries.openingPositionId, ar.id)))[0].id, receipt.allocations[0].entryId);
    assert.equal((await h.expect(`/customers/${customer.id}/ledger`, admin.token)).currentDue, "125.00");
    await h.expect("/collections", admin.token, { customerId: customer.id, date: today, amount: "126", paymentMode: "Bank Transfer", accountId: bank.id, referenceNumber: "DEV TEST excess" }, 409, h.key("excess"));
    const quote = await h.expect("/quotations", admin.token, { customerId: customer.id, date: today, validityDays: 30, paymentTerms: "Credit", lines: [{ productId: product.id, quantity: "1", unitPrice: "50", discount: "0" }] }, 201, h.key("quote"));
    const order = await h.expect(`/quotations/${quote.id}/convert`, admin.token, { version: quote.version }, 201, h.key("convert"));
    const delivery = await h.expect("/deliveries", admin.token, { orderId: order.id, date: today, lines: [{ productId: product.id, quantity: "1", batchId: "AUTO" }] }, 201, h.key("dispatch"));
    const invoice = await h.expect("/invoices", admin.token, { orderId: order.id, deliveryIds: [delivery.id], date: today }, 201, h.key("invoice"));
    const collision = await prepare("invoice reference", { ...data, asOfDate: today, lines: [{ ...data.lines[2], id: "ar-invoice", sourceReference: invoice.invoiceNumber, amountBdt: invoice.total }] });
    await h.expect(`/opening/drafts/${collision.id}/post`, admin.token, { version: collision.version });
    await h.expect(`/invoices/${invoice.id}/approve`, admin.token, {}, 409, h.key("invoice-duplicate"));
    assert.equal(new D((await h.expect(`/customers/${customer.id}/ledger`, admin.token)).customer.totalSales).toFixed(2), "0.00");
    await h.expect("/supplier-settlements", admin.token, { supplierId: supplier.id, date: today, reference: common.sourceReference.toLowerCase(), entryType: "Obligation", amount: "80" }, 409, h.key("supplier-duplicate"));
    assert.equal((await report("current-stock", today, { product: product.id })).totals.value, "71.67");
    const movement = await report("stock-movement", today, { product: product.id }); assert.ok(movement.rows.some((r) => r.status === "Dispatch" && r.quantity === "-1.0000"));
    const result = await h.expect(`/opening/drafts/${draft.id}/reconciliation`, admin.token) as OpeningReconciliation; assert.equal(result.matches, true, "Later sales/collections must not alter original opening source reconciliation");
    draft = await h.expect(`/opening/drafts/${draft.id}/reconcile`, approver.token, { version: draft.version }); assert.equal(draft.state, "Reconciled");
    await assert.rejects(h.ctx.db.update(openingPositions).set({ amountBdt: "1" }).where(eq(openingPositions.draftId, draft.id)));
    await assert.rejects(h.ctx.db.update(stockBatches).set({ condition: "Saleable" }).where(and(eq(stockBatches.productId, product.id), eq(stockBatches.condition, "Quarantine"))));
    const [batch] = await h.ctx.db.select().from(stockBatches).where(and(eq(stockBatches.productId, product.id), eq(stockBatches.condition, "Saleable")));
    await assert.rejects(h.ctx.db.insert(stockMovements).values({ id: `dev-invalid-${h.suffix}`, batchId: batch.id, type: "Adjustment", quantity: "1", valueBdt: "1", date: today, reference: "DEV TEST invalid unsigned adjustment", createdBy: admin.id, createdByName: "DEV TEST" }));
    await assert.rejects(h.ctx.db.update(stockBatches).set({ quantityAvailable: "0", availableValueBdt: "0" }).where(eq(stockBatches.id, batch.id)));
    const [advance] = await h.ctx.db.select().from(supplierSettlements).where(eq(supplierSettlements.openingPositionId, positions.find((p) => p.kind === "Supplier Advance")!.id));
    await h.expect(`/supplier-settlements/${advance.id}/reverse`, admin.token, { reason: "DEV TEST forbidden reversal" }, 409, h.key("reverse"));
    const [check] = (await h.ctx.db.execute<{ quantity: string; value: string }>(sql`select sum(quantity_delta)::text quantity,sum(value_delta_bdt)::text value from erp_private.stock_movements where batch_id=${batch.id}`)).rows;
    assert.equal(check.quantity, "2.0000"); assert.equal(check.value, "66.67");
  } finally { await h.close(); }
});
