import test from "node:test";
import assert from "node:assert/strict";
import { and, eq, sql } from "drizzle-orm";
import { approvalPolicies, approvalRequests, stockBatches, stockHoldReleases, stockHolds, stockMovements } from "../../database/schema.js";
import type { Database, Transaction } from "../../database/client.js";
import { businessDate } from "../../src/lib/date.js";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { holdPageSchema, holdReleaseRowSchema } from "../../src/domains/inventory/holdContracts.js";
import { batchPageSchema, stockPageSchema, inventorySummarySchema } from "../../src/domains/inventory/pageContracts.js";
import { PersistentReportSchema } from "../../src/domains/reports/persistentContracts.js";
import { toUser } from "../foundation/context.js";
import { employees } from "../../database/schema.js";
import { hostedHarness } from "../testing/hosted.js";

test("hosted stock holds: partial quarantine, independent release, FIFO, cost privacy and report parity", { skip: process.env.RUN_HOSTED_HOLD_TESTS !== "true", timeout: 480000 }, async () => {
  if (process.env.RUN_HOLD_BROWSER_TESTS === "true") {
    process.env.APP_URL = "http://localhost:5196";
    const { prepareHoldBrowserBundle } = await import("../../scripts/stock-hold-browser-check.js"); await prepareHoldBrowserBundle();
  }
  const h = await hostedHarness("stock-holds", { serialRequests: true }); const databases = [h.ctx.db, h.other.db]; const pools = [h.ctx.client, h.other.client];
  const rollback = new Error("ROLLBACK_ISOLATED_STOCK_HOLD_TEST"); const today = businessDate();
  try {
    try { await databases[0].transaction(async (tx) => {
      await tx.execute(sql`select set_config('application_name',${`mipro-hosted:stock-holds:${h.suffix}`},true),set_config('idle_in_transaction_session_timeout','60000',true)`);
      const isolated = new Proxy(tx, { get(target, prop) {
        if (prop === "transaction") return (callback: (nested: Transaction) => Promise<unknown>) => target.transaction(async (nested) => { const result = await callback(nested); await nested.execute(sql`set constraints all immediate`); await nested.execute(sql`set constraints all deferred`); return result; });
        const value = Reflect.get(target, prop); return typeof value === "function" ? value.bind(target) : value;
      } }) as unknown as Database;
      h.ctx.db = isolated; h.other.db = isolated;
      const pool = new Proxy(pools[0], { get(target, prop) { if (prop === "query") return (query: string) => tx.execute(sql.raw(query)); const value = Reflect.get(target, prop); return typeof value === "function" ? value.bind(target) : value; } }); h.ctx.client = pool; h.other.client = pool;
      try {
        assert.equal((await tx.select().from(approvalPolicies).where(and(eq(approvalPolicies.domain, "Stock"), eq(approvalPolicies.state, "Approved")))).length, 0, "Never replace a real stock policy in a test");
        const maker = await h.employee("Super Admin", ["view_sensitive_cost", "edit_sensitive_cost", "finalize_landed_cost"]); const verifier = await h.employee("Super Admin", ["view_sensitive_cost"]); const approver = await h.employee("Super Admin", ["view_sensitive_cost"]);
        const warehouse = await h.employee("Warehouse Manager");
        for (const role of ["Managing Director", "Import Officer", "Accounts", "Sales Manager", "Sales Executive"] as const) {
          const person = await h.employee(role); const [record] = await tx.select().from(employees).where(eq(employees.id, person.id));
          await h.expect("/inventory/holds", person.token, undefined, hasEffectivePermission(toUser(record), "inventory") ? 200 : 403);
          if (!hasEffectivePermission(toUser(record), "inventory", "post")) await h.expect("/inventory/holds", person.token, { batchId: "missing", quantity: "1", condition: "Quarantine", reason: "DEV TEST hold", proofReference: "DEV TEST" }, 403, h.key(`denied-${role.replaceAll(" ", "-")}`));
        }
        const supplier = await h.expect("/suppliers", maker.token, { name: `DEV TEST Hold Supplier ${h.suffix}`, country: "China" }, 201);
        const product = await h.expect("/products", maker.token, { code: `DH-${h.suffix}`, name: `DEV TEST Hold Product ${h.suffix}`, family: "Dialyzer", variant: "Test", unit: "pcs" }, 201);
        const imported = await h.expect("/imports", maker.token, { supplierId: supplier.id, poNumber: `DH-${h.suffix}`, poDate: today, piNumber: "DEV TEST", paymentMode: "TT", ttReference: `DH-${h.suffix}`, currency: "BDT", exchangeRate: "1", items: [{ productId: product.id, quantity: "10", currency: "BDT", fobUnitForeign: "1.01", exchangeRate: "1", cbmMode: "MANUAL", totalCbm: "1" }] }, 201, h.key("import"));
        await h.expect(`/imports/${imported.id}/finalize`, maker.token, {}, 200, h.key("finalize"));
        await h.expect(`/imports/${imported.id}/receive`, maker.token, { receivedDate: today, lines: [{ importItemId: imported.items[0].id, quantityReceived: "10", quantityRejected: "0", lotNumber: "DEV TEST", batchNumber: `DH-${h.suffix}`, manufacturingDate: today, expiryDate: "2029-12-31", warehouse: "Main Warehouse", location: "DEV TEST" }] }, 201, h.key("receive"));
        const [batch] = await tx.select().from(stockBatches).where(eq(stockBatches.productId, product.id));
        const holdInput = { batchId: batch.id, quantity: "4", condition: "Quarantine", reason: "DEV TEST inspect partial stock", proofReference: "DEV TEST QA-001" };
        const hold = await h.expect("/inventory/holds", warehouse.token, holdInput, 201, h.key("hold"));
        assert.equal((await h.expect("/inventory/holds", warehouse.token, holdInput, 201, h.key("hold"))).id, hold.id);
        await h.expect("/inventory/holds", warehouse.token, { ...holdInput, quantity: "3" }, 409, h.key("hold"));
        await h.expect("/inventory/holds", warehouse.token, { ...holdInput, quantity: "7" }, 422, h.key("over-hold"));
        const readBatch = async (token = maker.token) => batchPageSchema.parse(await h.expect(`/inventory/batches/page?productId=${product.id}`, token)).rows[0];
        let row = await readBatch(); assert.equal(row.quantityAvailable, "10.0000"); assert.equal(row.heldQuantity, "4.0000"); assert.equal(row.eligibleQuantity, "6.0000");
        assert.equal((await readBatch(warehouse.token)).landedCostPerUnit, "0");
        const hidden = holdPageSchema.parse(await h.expect(`/inventory/holds?holdId=${hold.id}`, warehouse.token)); assert.equal(hidden.rows[0].valueBdt, undefined);
        assert.equal((await h.expect("/inventory/dispatch-preview", maker.token, { productId: product.id, quantity: "6", date: today })).availableQuantity, "6.0000");
        await h.expect("/inventory/dispatch-preview", maker.token, { productId: product.id, quantity: "7", date: today }, 409);
        const releaseInput = { quantity: "2", reason: "DEV TEST QA inspection passed", proofReference: "DEV TEST QA-002" };
        await h.expect(`/inventory/holds/${hold.id}/releases`, warehouse.token, releaseInput, 409, h.key("without-policy"));
        const policy = await h.expect("/controls/policies", maker.token, { domain: "Stock", name: `DEV TEST Stock ${h.suffix}`, effectiveFrom: today, maximumAmountBdt: "1000000", verifierIds: [maker.id, verifier.id], approverIds: [maker.id, approver.id], independentVerifier: true, proofReference: "DEV TEST synthetic, not company policy" }, 201);
        await h.expect(`/controls/policies/${policy.id}/approve`, verifier.token, { version: 1, reason: "DEV TEST independent policy review" });
        const release = await h.expect(`/inventory/holds/${hold.id}/releases`, maker.token, releaseInput, 201, h.key("release"));
        assert.equal((await h.expect(`/inventory/holds/${hold.id}/releases`, maker.token, releaseInput, 201, h.key("release"))).id, release.id);
        const saved = (await tx.select().from(stockHoldReleases).where(eq(stockHoldReleases.id, release.id)))[0];
        await h.expect(`/inventory/releases/${release.id}/post`, warehouse.token, { version: 1 }, 409);
        await h.expect(`/controls/approvals/${saved.approvalId}/verify`, verifier.token, { version: 1, reason: "DEV TEST inspected unit and lot" });
        await h.expect(`/controls/approvals/${saved.approvalId}/approve`, approver.token, { version: 2, reason: "DEV TEST independent release approval" });
        const stale = await h.expect(`/inventory/holds/${hold.id}/releases`, maker.token, { ...releaseInput, quantity: "3" }, 201, h.key("stale-release"));
        const [staleSource] = await tx.select().from(stockHoldReleases).where(eq(stockHoldReleases.id, stale.id));
        await h.expect(`/controls/approvals/${staleSource.approvalId}/verify`, verifier.token, { version: 1, reason: "DEV TEST verified before partial release" });
        await h.expect(`/controls/approvals/${staleSource.approvalId}/approve`, approver.token, { version: 2, reason: "DEV TEST approved before partial release" });
        await h.expect(`/inventory/releases/${release.id}/post`, warehouse.token, { version: 1 });
        await h.expect(`/inventory/releases/${release.id}/post`, warehouse.token, { version: 1 }, 200, { instance: 1 });
        await h.expect(`/inventory/releases/${stale.id}/post`, warehouse.token, { version: 1 }, 422);
        assert.equal((await tx.select().from(approvalRequests).where(eq(approvalRequests.id, staleSource.approvalId)))[0].state, "Approved", "Failed release does not consume its approval");
        row = await readBatch(); assert.equal(row.quantityAvailable, "10.0000"); assert.equal(row.eligibleQuantity, "8.0000");
        const customer = await h.expect("/customers", maker.token, { name: `DEV TEST Hold Customer ${h.suffix}`, type: "Hospital" }, 201, h.key("customer"));
        const quote = await h.expect("/quotations", maker.token, { customerId: customer.id, date: today, validityDays: 30, paymentTerms: "Credit", lines: [{ productId: product.id, quantity: "10", unitPrice: "3", discount: "0" }] }, 201, h.key("quote"));
        const order = await h.expect(`/quotations/${quote.id}/convert`, maker.token, { version: quote.version }, 201, h.key("convert"));
        await h.expect("/deliveries", maker.token, { orderId: order.id, date: today, lines: [{ productId: product.id, quantity: "7", batchId: "AUTO" }] }, 201, h.key("delivery"));
        await h.expect("/deliveries", maker.token, { orderId: order.id, date: today, lines: [{ productId: product.id, quantity: "2", batchId: "AUTO" }] }, 409, h.key("over-dispatch"));
        row = await readBatch(); assert.equal(row.quantityAvailable, "3.0000"); assert.equal(row.heldQuantity, "2.0000"); assert.equal(row.eligibleQuantity, "1.0000");
        const [physical] = await tx.select().from(stockBatches).where(eq(stockBatches.id, batch.id)); assert.equal(physical.availableValueBdt, "3.03");
        await assert.rejects(tx.transaction(async (nested) => {
          await nested.update(stockBatches).set({ quantityAvailable: "1", availableValueBdt: "1.01" }).where(eq(stockBatches.id, batch.id));
          await nested.insert(stockMovements).values({ id: `hold-bypass-${h.suffix}`, batchId: batch.id, type: "Dispatch", quantity: "2", valueBdt: "2.02", date: today, reference: "DEV TEST bypass reservation", createdBy: maker.id, createdByName: "DEV TEST" });
          await nested.execute(sql`set constraints all immediate`);
        }), (error: unknown) => /Held stock is not dispatchable/.test(String((error as { cause?: { message?: string } }).cause?.message ?? (error as Error).message)), "The database reservation guard independently rejects a balanced stock journal that consumes held units");
        const stock = stockPageSchema.parse(await h.expect(`/inventory/stock/page?productId=${product.id}`, maker.token)); assert.equal(stock.rows[0].heldQuantity, "2.0000");
        inventorySummarySchema.parse(await h.expect("/inventory/summary", warehouse.token));
        const parameters = new URLSearchParams({ from: today, to: today, product: product.id });
        for (const reportId of ["current-stock", "stock-summary", "product-list", "item-details", "stock-holds"]) {
          const report = PersistentReportSchema.parse(await h.expect(`/reports/${reportId}?${parameters}`, maker.token)); const printed = PersistentReportSchema.parse(await h.expect(`/reports/${reportId}/print?${parameters}`, maker.token)); assert.deepEqual(report.rows, printed.rows);
          assert.equal(report.rows.length, 1); if (reportId !== "stock-holds") { assert.equal(report.rows[0].quantity, "3.0000"); assert.equal(report.rows[0].eligible, "1.0000"); assert.equal(report.rows[0].held, "2.0000"); }
          else assert.equal(report.rows[0].outstanding, "2.0000");
          const exported = await fetch(`${h.bases[0]}/reports/${reportId}/export?${parameters}`, { headers: { Authorization: `Bearer ${maker.token}` }, signal: AbortSignal.timeout(30000) });
          assert.equal(exported.status, 200); const csv = await exported.text(); assert.ok(csv.includes(product.name)); assert.equal(csv.split("\r\n").length, 2);
        }
        const restrictedRelease = await h.expect(`/inventory/holds/${hold.id}/releases`, warehouse.token); for (const r of restrictedRelease.rows) assert.equal(holdReleaseRowSchema.parse(r).valueBdt, undefined);
        await assert.rejects(tx.transaction((nested) => nested.update(stockHolds).set({ reason: "DEV TEST forbidden mutation" }).where(eq(stockHolds.id, hold.id))));
        await assert.rejects(tx.transaction((nested) => nested.update(stockHoldReleases).set({ quantity: "0.5" }).where(eq(stockHoldReleases.id, release.id))));
        if (process.env.RUN_HOLD_BROWSER_TESTS === "true") {
          const { checkStockHoldBrowser } = await import("../../scripts/stock-hold-browser-check.js"); await checkStockHoldBrowser(h, [maker, verifier, approver], product, batch.batchNumber);
        }
      } finally { h.ctx.db = databases[0]; h.other.db = databases[1]; h.ctx.client = pools[0]; h.other.client = pools[1]; }
      throw rollback;
    }); } catch (error) { if (error !== rollback) throw error; }
  } finally { await h.close(); }
});
