import test from "node:test";
import assert from "node:assert/strict";
import { and, eq, sql } from "drizzle-orm";
import { approvalPolicies, approvalRequests, cashAccounts, employees, ledgerConfigurations, stockBatches, stockControlLines, stockControls } from "../../database/schema.js";
import type { Database, Transaction } from "../../database/client.js";
import { ledgerMappingRoles, ledgerRoleKind } from "../../src/domains/ledger/contracts.js";
import { stockControlPageSchema, stockControlSchema } from "../../src/domains/inventory/controlContracts.js";
import { batchPageSchema } from "../../src/domains/inventory/pageContracts.js";
import { PersistentReportSchema } from "../../src/domains/reports/persistentContracts.js";
import { businessDate } from "../../src/lib/date.js";
import { hostedHarness } from "../testing/hosted.js";
import { toUser } from "../foundation/context.js";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { D } from "../trading/money.js";
import { checkCommercialEvidence,checkDraftEvidence,checkSealedEvidence } from "../quality/hosted-check.js";

test("hosted stock controls: approved counts, surplus provenance, held write-offs, condition history and atomic GL", { skip: process.env.RUN_HOSTED_STOCK_CONTROL_TESTS !== "true", timeout: 720000 }, async () => {
  if (process.env.RUN_STOCK_CONTROL_BROWSER_TESTS === "true") {
    process.env.APP_URL = "http://localhost:5193";
    const { prepareStockControlBrowserBundle } = await import("../../scripts/stock-control-browser-check.js"); await prepareStockControlBrowserBundle();
  }
  const h = await hostedHarness("stock-controls", { serialRequests: true }); const databases = [h.ctx.db, h.other.db]; const pools = [h.ctx.client, h.other.client];
  const rollback = new Error("ROLLBACK_ISOLATED_STOCK_CONTROLS"); const today = businessDate(); const qualityObjects:string[]=[];
  try {
    try { await databases[0].transaction(async (tx) => {
      await tx.execute(sql`select set_config('application_name',${`mipro-hosted:stock-controls:${h.suffix}`},true),set_config('idle_in_transaction_session_timeout','60000',true)`);
      const isolated = new Proxy(tx, { get(target, prop) {
        if (prop === "transaction") return (callback: (nested: Transaction) => Promise<unknown>) => target.transaction(async (nested) => { const result = await callback(nested); await nested.execute(sql`set constraints all immediate`); await nested.execute(sql`set constraints all deferred`); return result; });
        const value = Reflect.get(target, prop); return typeof value === "function" ? value.bind(target) : value;
      } }) as unknown as Database;
      h.ctx.db = isolated; h.other.db = isolated;
      const pool = new Proxy(pools[0], { get(target, prop) { if (prop === "query") return (query: string) => tx.execute(sql.raw(query)); const value = Reflect.get(target, prop); return typeof value === "function" ? value.bind(target) : value; } }); h.ctx.client = pool; h.other.client = pool;
      try {
        assert.equal((await tx.select().from(approvalPolicies).where(and(eq(approvalPolicies.domain, "Stock"), eq(approvalPolicies.state, "Approved")))).length, 0, "Never replace an actual company stock policy");
        assert.equal((await tx.select().from(ledgerConfigurations).where(eq(ledgerConfigurations.state, "Approved"))).length, 0, "Never activate a test mapping over company configuration");
        const maker = await h.employee("Super Admin", ["view_sensitive_cost", "edit_sensitive_cost", "finalize_landed_cost"]); const verifier = await h.employee("Super Admin", ["view_sensitive_cost"]); const approver = await h.employee("Super Admin", ["view_sensitive_cost"]); const warehouse = await h.employee("Warehouse Manager");
        for (const role of ["Managing Director", "Import Officer", "Accounts", "Sales Manager", "Sales Executive"] as const) {
          const actor = await h.employee(role); const [row] = await tx.select().from(employees).where(eq(employees.id, actor.id)); const permitted = hasEffectivePermission(toUser(row), "inventory");
          const result = await h.call("/inventory/controls", actor.token); assert.equal(result.status, permitted ? 200 : 403); if (permitted) stockControlPageSchema.parse(result.data);
        }
        const policy = await h.expect("/controls/policies", maker.token, { domain: "Stock", name: `DEV TEST controls ${h.suffix}`, effectiveFrom: today, maximumAmountBdt: "1000000", verifierIds: [maker.id, warehouse.id, verifier.id], approverIds: [maker.id, approver.id], independentVerifier: true, proofReference: "DEV TEST synthetic authority, not company policy" }, 201);
        await h.expect(`/controls/policies/${policy.id}/approve`, verifier.token, { version: 1, reason: "DEV TEST independent policy acceptance" });
        const chart: Record<string, string> = {};
        for (const role of ledgerMappingRoles) chart[role] = (await h.expect("/ledger/accounts", maker.token, { code: `SC${Object.keys(chart).length}-${h.suffix.slice(0, 8)}`, name: `DEV TEST ${role} ${h.suffix}`, kind: ledgerRoleKind(role) }, 201)).id;
        const cash = await tx.select().from(cashAccounts).where(eq(cashAccounts.active, true)); const cashMappings: { cashAccountId: string; accountId: string }[] = [];
        for (const [i, account] of cash.entries()) { const c = await h.expect("/ledger/accounts", maker.token, { code: `SCC${i}-${h.suffix.slice(0, 8)}`, name: `DEV TEST Cash ${i} ${h.suffix}`, kind: "Asset" }, 201); cashMappings.push({ cashAccountId: account.id, accountId: c.id }); }
        const config = await h.expect("/ledger/configurations", maker.token, { effectiveFrom: today, proofReference: "DEV TEST rollback-only stock mappings", mappings: ledgerMappingRoles.map((role) => ({ role, accountId: chart[role] })), cashMappings }, 201);
        await h.expect(`/ledger/configurations/${config.id}/approve`, verifier.token, { version: 1, reason: "DEV TEST independent mapping approval" });
        const supplier = await h.expect("/suppliers", maker.token, { name: `DEV TEST Controls Supplier ${h.suffix}`, country: "China" }, 201);
        const product = await h.expect("/products", maker.token, { code: `SC-${h.suffix}`, name: `DEV TEST Controls Product ${h.suffix}`, family: "Dialyzer", variant: "Test", unit: "pcs" }, 201);
        const imp = await h.expect("/imports", maker.token, { supplierId: supplier.id, poNumber: `SC-${h.suffix}`, poDate: today, piNumber: "DEV TEST", paymentMode: "TT", ttReference: `SC-${h.suffix}`, currency: "BDT", exchangeRate: "1", items: [{ productId: product.id, quantity: "10", currency: "BDT", fobUnitForeign: "1.01", exchangeRate: "1", cbmMode: "MANUAL", totalCbm: "1" }] }, 201, h.key("import"));
        await h.expect(`/imports/${imp.id}/finalize`, maker.token, {}, 200, h.key("finalize"));
        await h.expect(`/imports/${imp.id}/receive`, maker.token, { receivedDate: today, lines: [{ importItemId: imp.items[0].id, quantityReceived: "10", quantityRejected: "0", lotNumber: "DEV TEST", batchNumber: `SC-${h.suffix}`, manufacturingDate: today, expiryDate: "2029-12-31", warehouse: "Main Warehouse", location: "DEV TEST BIN" }] }, 201, h.key("receive"));
        const [original] = await tx.select().from(stockBatches).where(eq(stockBatches.productId, product.id));
        const common = { countDate: today, reason: "DEV TEST variance investigation", inspection: "DEV TEST physical inspection and recount", proofReference: "DEV TEST COUNT-001" };
        const create = async (input: unknown, name: string, token = warehouse.token) => stockControlSchema.parse(await h.expect("/inventory/controls", token, input, 201, h.key(name)));
        const get = async (id: string, token = maker.token) => stockControlSchema.parse(await h.expect(`/inventory/controls/${id}`, token));
        const authorize = async (id: string, alreadySubmitted = false) => {
          let record = await get(id); if (!alreadySubmitted) record = stockControlSchema.parse(await h.expect(`/inventory/controls/${id}/submit`, warehouse.token, { version: record.version }));
          const request = (await tx.select().from(approvalRequests).where(eq(approvalRequests.id, record.approvalId!)))[0];
          await h.expect(`/controls/approvals/${request.id}/verify`, verifier.token, { version: request.version, reason: "DEV TEST independent physical verification" });
          await h.expect(`/controls/approvals/${request.id}/approve`, approver.token, { version: request.version + 1, reason: "DEV TEST independent final approval" }); return get(id);
        };
        const post = async (id: string) => { const record = await get(id); return stockControlSchema.parse(await h.expect(`/inventory/controls/${id}/post`, warehouse.token, { version: record.version })); };
        const readBatch = async (id: string) => batchPageSchema.parse(await h.expect(`/inventory/batches/page?batchId=${id}`, maker.token)).rows[0];
        const unknownInput = { ...common, kind: "Physical Count", lines: [{ batchId: original.id, countedQuantity: "12", surplusCondition: "Quarantine" }] };
        const unknown = await create(unknownInput, "unknown-surplus"); assert.equal(unknown.totalBdt, undefined); assert.ok(unknown.blockers.length);
        const evidence=await checkDraftEvidence(h,tx,unknown.id,unknown.version,warehouse,warehouse,verifier,qualityObjects);
        await h.expect(`/inventory/controls/${unknown.id}/submit`, warehouse.token, { version: unknown.version }, 422);
        await h.expect("/inventory/controls", warehouse.token, { ...unknownInput, lines: [{ ...unknownInput.lines[0], unitCostBdt: "1.50" }] }, 403, h.key("forbidden-cost"));
        const surplus = stockControlSchema.parse(await h.expect(`/inventory/controls/${unknown.id}/revise`, maker.token, { ...unknownInput, version: unknown.version, lines: [{ ...unknownInput.lines[0], unitCostBdt: "1.50" }] }, 201, h.key("surplus-revision")));
        const inherited=await h.expect(`/quality-evidence/Stock%20Control/${surplus.id}`,maker.token);assert.equal(inherited.files.filter((f:{inherited:boolean})=>f.inherited).length,3,"New draft shows inherited inspection history before a new upload");
        await checkCommercialEvidence(h,tx,surplus.id,surplus.version,maker,warehouse,qualityObjects);
        assert.equal(surplus.totalBdt, "3.00"); assert.equal((await get(unknown.id)).state, "Superseded");
        const submitted = stockControlSchema.parse(await h.expect(`/inventory/controls/${surplus.id}/submit`, maker.token, { version: surplus.version }));
        await checkSealedEvidence(h,tx,surplus.id,maker.token,evidence.activeId);
        await h.expect(`/controls/approvals/${submitted.approvalId}/verify`, warehouse.token, { version: 1, reason: "DEV TEST delegated source preparer must not verify" }, 403);
        await h.expect(`/inventory/controls/${surplus.id}/post`, warehouse.token, { version: submitted.version }, 409);
        await authorize(surplus.id, true); const postedSurplus = await post(surplus.id); const surplusId = postedSurplus.lines[0].targetBatchId!;
        await h.expect(`/inventory/controls/${surplus.id}/post`, warehouse.token, { version: submitted.version }, 200, { instance: 1 });
        let gain = await readBatch(surplusId); assert.equal(gain.sourceType, "Stock Correction"); assert.equal(gain.condition, "Quarantine"); assert.equal(gain.quantityAvailable, "2.0000"); assert.equal(gain.eligibleQuantity, "0");
        assert.equal((await readBatch(original.id)).quantityAvailable, "10.0000");
        const condition = await create({ ...common, kind: "Condition Release", lines: [{ batchId: surplusId }] }, "condition-release"); await authorize(condition.id); const conditionPosted = await post(condition.id);
        assert.equal(conditionPosted.lines[0].movementId, null); gain = await readBatch(surplusId); assert.equal(gain.condition, "Saleable"); assert.equal((await tx.select().from(stockBatches).where(eq(stockBatches.id, surplusId)))[0].condition, "Quarantine", "Original condition evidence remains unchanged");
        const hold = await h.expect("/inventory/holds", warehouse.token, { batchId: original.id, quantity: "2", condition: "Damaged", reason: "DEV TEST damaged partial quantity", proofReference: "DEV TEST QA" }, 201, h.key("hold"));
        const count = await create({ ...common, kind: "Physical Count", lines: [{ batchId: original.id, countedQuantity: "8" }] }, "loss-count"); await authorize(count.id); await post(count.id);
        assert.equal((await readBatch(original.id)).quantityAvailable, "8.0000");
        const writeoff = await create({ ...common, kind: "Write-off", lines: [{ batchId: original.id, holdId: hold.id, quantity: "1" }] }, "writeoff"); await authorize(writeoff.id);
        await tx.update(employees).set({ capabilities: [] }).where(eq(employees.id, approver.id));
        await h.expect(`/inventory/controls/${writeoff.id}/post`, warehouse.token, { version: (await get(writeoff.id)).version }, 409);
        await tx.update(employees).set({ capabilities: ["view_sensitive_cost"] }).where(eq(employees.id, approver.id));
        await h.expect(`/ledger/accounts/${chart["Stock Loss"]}/archive`, maker.token, {});
        await h.expect(`/inventory/controls/${writeoff.id}/post`, warehouse.token, { version: (await get(writeoff.id)).version }, 422);
        assert.equal((await readBatch(original.id)).quantityAvailable, "8.0000"); assert.equal((await get(writeoff.id)).approvalState, "Approved");
        await h.expect(`/ledger/accounts/${chart["Stock Loss"]}/activate`, maker.token, {}); const postedWriteoff = await post(writeoff.id);
        let b = await readBatch(original.id); assert.equal(b.quantityAvailable, "7.0000"); assert.equal(b.heldQuantity, "1.0000"); assert.equal(b.eligibleQuantity, "6.0000");
        const holdRows = await h.expect(`/inventory/holds?holdId=${hold.id}`, warehouse.token); assert.equal(holdRows.rows[0].releasedQuantity, "0"); assert.equal(holdRows.rows[0].writtenOffQuantity, "1.0000"); assert.equal(holdRows.rows[0].outstandingQuantity, "1.0000");
        const writeoffHistory = stockControlPageSchema.parse(await h.expect(`/inventory/controls?kind=Write-off&holdId=${hold.id}`, warehouse.token));
        assert.deepEqual(writeoffHistory.rows.map((r) => r.id), [writeoff.id]);
        assert.equal(stockControlPageSchema.parse(await h.expect(`/inventory/controls?holdId=${surplusId}`, warehouse.token)).total, 0);
        assert.equal(postedWriteoff.lines[0].expiryDate, "2029-12-31"); assert.equal(postedWriteoff.lines[0].location, "DEV TEST BIN");
        const hidden = await get(writeoff.id, warehouse.token); assert.equal(hidden.totalBdt, undefined); assert.equal(hidden.lines[0].bookValueBdt, undefined); assert.equal(hidden.lines[0].valueBdt, undefined);
        const customer = await h.expect("/customers", maker.token, { name: `DEV TEST Controls Customer ${h.suffix}`, type: "Hospital" }, 201, h.key("customer"));
        const quote = await h.expect("/quotations", maker.token, { customerId: customer.id, date: today, validityDays: 30, paymentTerms: "Credit", lines: [{ productId: product.id, quantity: "7", unitPrice: "3", discount: "0" }] }, 201, h.key("quote"));
        const order = await h.expect(`/quotations/${quote.id}/convert`, maker.token, { version: quote.version }, 201, h.key("convert"));
        await h.expect("/deliveries", maker.token, { orderId: order.id, date: today, lines: [{ productId: product.id, quantity: "7", batchId: "AUTO" }] }, 201, h.key("delivery"));
        b = await readBatch(original.id); assert.equal(b.quantityAvailable, "1.0000"); assert.equal(b.eligibleQuantity, "0"); assert.equal((await readBatch(surplusId)).quantityAvailable, "1.0000");
        const [values] = (await tx.execute<{ source: string; ledger: string }>(sql`select (select sum(available_value_bdt)::text from erp_private.stock_batches where product_id=${product.id}) source,(select sum(l.debit-l.credit)::text from erp_private.ledger_lines l join erp_private.ledger_journals j on j.id=l.journal_id join erp_private.stock_movements m on j.source_key='stock:'||m.id join erp_private.stock_batches b on b.id=m.batch_id where b.product_id=${product.id} and l.account_id=${chart.Inventory}) ledger`)).rows;
        assert.equal(values.source, "2.51"); assert.equal(values.ledger, "2.51");
        const staleInput = { ...common, kind: "Physical Count", lines: [{ batchId: surplusId, countedQuantity: "1" }] };
        const stale = await create(staleInput, "stale");
        await h.expect("/inventory/holds", warehouse.token, { batchId: surplusId, quantity: "0.1", condition: "Quarantine", reason: "DEV TEST newer inspection", proofReference: "DEV TEST QA" }, 201, h.key("new-hold"));
        await h.expect(`/inventory/controls/${stale.id}/submit`, warehouse.token, { version: stale.version }, 409);
        const fresh = stockControlSchema.parse(await h.expect(`/inventory/controls/${stale.id}/revise`, warehouse.token, { ...staleInput, version: stale.version }, 201, h.key("fresh"))); await authorize(fresh.id); await post(fresh.id);
        const changed = await create(staleInput, "stale-approved"); await authorize(changed.id);
        await h.expect("/inventory/holds", warehouse.token, { batchId: surplusId, quantity: "0.1", condition: "Quarantine", reason: "DEV TEST changed after approval", proofReference: "DEV TEST QA" }, 201, h.key("changed-hold"));
        await h.expect(`/inventory/controls/${changed.id}/post`, warehouse.token, { version: (await get(changed.id)).version }, 409); assert.equal((await get(changed.id)).approvalState, "Approved");
        await h.expect(`/inventory/controls/${postedWriteoff.id}/revise`, warehouse.token, { ...common, kind: "Write-off", version: postedWriteoff.version, lines: [{ batchId: original.id, holdId: hold.id, quantity: "0.1" }] }, 409, h.key("forbidden-revision"));
        const belowHeld = await create({ ...common, kind: "Physical Count", lines: [{ batchId: original.id, countedQuantity: "0" }] }, "held-shortage"); assert.ok(belowHeld.blockers.length); await h.expect(`/inventory/controls/${belowHeld.id}/submit`, warehouse.token, { version: belowHeld.version }, 422);
        for (const doc of [postedSurplus, postedWriteoff, conditionPosted]) {
          const params = new URLSearchParams({ from: today, to: today, stockControl: doc.id }); const report = PersistentReportSchema.parse(await h.expect(`/reports/stock-control-register?${params}`, maker.token)); const printed = PersistentReportSchema.parse(await h.expect(`/reports/stock-control-register/print?${params}`, maker.token)); assert.deepEqual(report.rows, printed.rows); assert.equal(report.rowCount, 1); assert.equal(report.rows[0].reference, doc.number);
          const exported = await fetch(`${h.bases[0]}/reports/stock-control-register/export?${params}`, { headers: { Authorization: `Bearer ${maker.token}` }, signal: AbortSignal.timeout(30000) }); assert.equal(exported.status, 200); assert.ok((await exported.text()).includes(doc.number));
        }
        for (const reportId of ["stock-count-variance", "stock-writeoffs", "stock-condition-history"]) PersistentReportSchema.parse(await h.expect(`/reports/${reportId}?from=${today}&to=${today}&product=${product.id}`, maker.token));
        const snapshot = await h.expect(`/imports/${imp.id}`, maker.token); assert.equal(snapshot.snapshot.totalLandedCostBdt ?? snapshot.snapshot.totalLandedBdt ?? snapshot.snapshot.products[0].finalTotalBdt, "10.10");
        await assert.rejects(tx.transaction((nested) => nested.update(stockControlLines).set({ countedQuantity: "9" }).where(eq(stockControlLines.controlId, count.id))));
        await assert.rejects(tx.transaction((nested) => nested.update(stockControls).set({ reason: "DEV TEST forbidden source edit" }).where(eq(stockControls.id, count.id))));
        if (process.env.RUN_STOCK_CONTROL_BROWSER_TESTS === "true") { const { checkStockControlBrowser } = await import("../../scripts/stock-control-browser-check.js"); await checkStockControlBrowser(h, [maker, verifier, approver], surplusId,qualityObjects); }
        assert.ok(new D(values.source).eq(values.ledger));
      } finally { h.ctx.db = databases[0]; h.other.db = databases[1]; h.ctx.client = pools[0]; h.other.client = pools[1]; }
      throw rollback;
    }); } catch (error) { if (error !== rollback) throw error; }
  } finally { try { if(qualityObjects.length){const removed=await h.ctx.admin.storage.from("erp-documents").remove(qualityObjects);assert.equal(removed.error,null,"Clean only this rolled-back test's synthetic objects");} } finally { await h.close(); } }
});
