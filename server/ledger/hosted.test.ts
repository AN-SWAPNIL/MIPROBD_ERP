import test from "node:test";
import assert from "node:assert/strict";
import { and, eq, sql } from "drizzle-orm";
import { approvalPolicies, approvalRequests, cashAccounts, employees, expenses, ledgerConfigurations, ledgerJournals, ledgerLines } from "../../database/schema.js";
import { ledgerAccountSchema, ledgerJournalSchema, ledgerMappingRoles, ledgerRoleKind } from "../../src/domains/ledger/contracts.js";
import { z } from "zod";
import { approvalPageSchema } from "../../src/domains/controls/contracts.js";
import { businessDate } from "../../src/lib/date.js";
import { hostedHarness } from "../testing/hosted.js";
import { D } from "../trading/money.js";
import type { Database, Transaction } from "../../database/client.js";
import { PersistentReportSchema } from "../../src/domains/reports/persistentContracts.js";
import { createApproval } from "../controls/service.js";
import { digest, toUser } from "../foundation/context.js";

test("hosted ledger: independent approvals, append-only revisions, atomic sources, exact reversals and role denial", { skip: process.env.RUN_HOSTED_LEDGER_TESTS !== "true", timeout: 600000 }, async () => {
  if (process.env.RUN_LEDGER_BROWSER_TESTS === "true") {
    process.env.APP_URL = "http://localhost:5197";
    const { prepareLedgerBrowserBundle } = await import("../../scripts/ledger-browser-check.js");
    await prepareLedgerBrowserBundle();
  }
  const h = await hostedHarness("ledger", { serialRequests: true }); let policyId: string | undefined; let configId: string | undefined;
  let maker: Awaited<ReturnType<typeof h.employee>> | undefined;
  const today = businessDate();
  const databases = [h.ctx.db, h.other.db]; const pools = [h.ctx.client, h.other.client]; const rollback = new Error("ROLLBACK_ISOLATED_LEDGER_TEST");
  try {
    try { await databases[0].transaction(async (tx) => {
  await tx.execute(sql`select set_config('application_name',${`mipro-hosted:ledger:${h.suffix}`},true),set_config('idle_in_transaction_session_timeout','60000',true)`);
      // Keep real HTTP/Auth checks, but never retain a global test chart/cutover mapping.
      // Flush deferred constraints at each API transaction boundary before its savepoint commits.
      const isolated = new Proxy(tx, { get(target, prop) {
        if (prop === "transaction") return (callback: (nested: Transaction) => Promise<unknown>) => target.transaction(async (nested) => {
          const result = await callback(nested); await nested.execute(sql`set constraints all immediate`); await nested.execute(sql`set constraints all deferred`); return result;
        });
        const value = Reflect.get(target, prop); return typeof value === "function" ? value.bind(target) : value;
      } }) as unknown as Database;
      h.ctx.db = isolated; h.other.db = isolated;
      const client = new Proxy(pools[0], { get(target, prop) {
        if (prop === "query") return (query: string) => { assert.equal(typeof query, "string"); return tx.execute(sql.raw(query)); };
        const value = Reflect.get(target, prop); return typeof value === "function" ? value.bind(target) : value;
      } });
      h.ctx.client = client; h.other.client = client;
      try {
    assert.equal((await h.ctx.db.select().from(approvalPolicies).where(and(eq(approvalPolicies.domain, "Ledger"), eq(approvalPolicies.state, "Approved")))).length, 0, "Do not replace a real active approval policy for tests");
    assert.equal((await h.ctx.db.select().from(ledgerConfigurations).where(eq(ledgerConfigurations.state, "Approved"))).length, 0, "Do not replace a real active ledger mapping for tests");
    assert.equal((await h.ctx.db.select().from(ledgerConfigurations).where(eq(ledgerConfigurations.state, "Retired"))).length, 0, "A preserved mapping baseline needs a dedicated isolated test destination");
    maker = await h.employee("Super Admin", ["view_sensitive_cost", "edit_sensitive_cost", "finalize_landed_cost"]);
    const verifier = await h.employee("Super Admin", ["view_sensitive_cost"]); const approver = await h.employee("Super Admin", ["view_sensitive_cost"]);
    const sales = await h.employee("Sales Executive"); const accounts = await h.employee("Accounts"); const warehouse = await h.employee("Warehouse Manager");
    for (const actor of [sales, accounts, warehouse]) await h.expect("/ledger/accounts", actor.token, undefined, 403);
    const policy = await h.expect("/controls/policies", maker.token, { domain: "Ledger", name: `DEV TEST ledger ${h.suffix}`, effectiveFrom: today, maximumAmountBdt: "100000000", verifierIds: [maker.id, verifier.id], approverIds: [maker.id, approver.id], independentVerifier: true, proofReference: "DEV TEST authority, not a company policy" }, 201); policyId = policy.id;
    await h.expect(`/controls/policies/${policyId}/approve`, maker.token, { version: 1, reason: "DEV TEST Super Admin configuration approval" });
    const chart: Record<string, string> = {};
    const addChart = async (name: string, kind: string) => (await h.expect("/ledger/accounts", maker!.token, { code: `D${Object.keys(chart).length}-${h.suffix.slice(0, 12)}`, name: `DEV TEST ${name} ${h.suffix}`, kind }, 201)).id as string;
    for (const role of ledgerMappingRoles) {
      chart[role] = await addChart(role, ledgerRoleKind(role));
    }
    chart.Equity = await addChart("Test equity", "Equity");
    assert.ok(z.array(ledgerAccountSchema).parse(await h.expect("/ledger/accounts", maker.token)).length > 0);
    const bank = await h.expect("/settings/accounts", maker.token, { name: `DEV TEST Ledger Bank ${h.suffix}`, type: "Bank", balance: "1000" }, 201, h.key("bank"));
    const cash = await h.ctx.db.select().from(cashAccounts).where(eq(cashAccounts.active, true));
    const cashMappings: { cashAccountId: string; accountId: string }[] = [];
    for (const c of cash) { const key = `cash-${c.id}`; chart[key] = await addChart(`Cash mapping ${cashMappings.length + 1}`, "Asset"); cashMappings.push({ cashAccountId: c.id, accountId: chart[key] }); }
    const configuration = await h.expect("/ledger/configurations", maker.token, { effectiveFrom: today, proofReference: "DEV TEST mapping; no company opening balances", mappings: ledgerMappingRoles.map((role) => ({ role, accountId: chart[role] })), cashMappings }, 201); configId = configuration.id;
    await h.expect(`/ledger/configurations/${configId}/approve`, maker.token, { version: 1, reason: "DEV TEST Super Admin mapping approval" });
    const input = { date: today, reference: `DEV TEST opening ${h.suffix}`, proofReference: "DEV TEST synthetic only", description: "DEV TEST opening approval journal", type: "Opening", lines: [{ accountId: chart[`cash-${bank.id}`], debit: "1000", credit: "0", note: "Synthetic existing cash control" }, { accountId: chart.Equity, debit: "0", credit: "1000", note: "Synthetic balancing evidence" }] };
    let journal = ledgerJournalSchema.parse(await h.expect("/ledger/journals", maker.token, input, 201));
    const original = journal;
    journal = ledgerJournalSchema.parse(await h.expect(`/ledger/journals/${journal.id}/revise`, maker.token, { ...input, version: journal.version, description: "DEV TEST revised opening journal" }, 201));
    assert.equal(journal.revisionOfId, original.id); assert.equal((await h.expect(`/ledger/journals/${original.id}`, maker.token)).state, "Superseded");
    await h.expect(`/ledger/journals/${journal.id}/post`, maker.token, { version: journal.version }, 409);
    journal = ledgerJournalSchema.parse(await h.expect(`/ledger/journals/${journal.id}/submit`, maker.token, { version: journal.version }));
    const getApproval = async (id: string) => (await h.ctx.db.select().from(approvalRequests).where(eq(approvalRequests.id, id)))[0];
    let request = await getApproval(journal.approvalId!);
    await h.expect(`/controls/approvals/${request.id}/verify`, verifier.token, { version: request.version, reason: "DEV TEST verified source evidence" }); request = await getApproval(request.id);
    await h.expect(`/controls/approvals/${request.id}/approve`, approver.token, { version: request.version - 1, reason: "DEV TEST stale version" }, 409);
    await h.expect(`/controls/approvals/${request.id}/approve`, approver.token, { version: request.version, reason: "DEV TEST independent final approval" });
    await h.ctx.db.update(employees).set({ status: "Inactive" }).where(eq(employees.id, approver.id));
    await h.expect(`/ledger/journals/${journal.id}/post`, maker.token, { version: journal.version }, 409);
    await h.ctx.db.update(employees).set({ status: "Active" }).where(eq(employees.id, approver.id));
    const posts = [await h.call(`/ledger/journals/${journal.id}/post`, maker.token, { version: journal.version }), await h.call(`/ledger/journals/${journal.id}/post`, approver.token, { version: journal.version }, { instance: 1 })]; assert.deepEqual(posts.map((r) => r.status), [200, 200]);
    assert.equal((await h.ctx.db.select().from(ledgerJournals).where(eq(ledgerJournals.id, journal.id)))[0].state, "Posted");
    const inbox = approvalPageSchema.parse(await h.expect("/controls/approvals?domain=Ledger", approver.token)); assert.ok(inbox.rows.some((r) => r.id === request.id && r.state === "Posted"));
    const category = await h.expect("/expense-categories", maker.token, { name: `DEV TEST ledger category ${h.suffix}` }, 201, h.key("category"));
    const expenseInput = { date: today, categoryId: category.id, subtype: "General", expenseFor: "Office", amount: "25.01", paidFromAccountId: bank.id, remarks: `DEV TEST Ledger expense ${h.suffix}` };
    const expense = await h.expect("/expenses", maker.token, expenseInput, 201, h.key("expense"));
    const [expenseSource] = await h.ctx.db.select().from(expenses).where(eq(expenses.id, expense.id));
    const event = (await h.ctx.db.execute<{ id: string; journal_id: string }>(sql`select id,journal_id from erp_private.ledger_source_events where source_key=${`account:${expenseSource.transactionId}`}`)).rows[0];
    assert.ok(event?.journal_id); assert.equal((await h.expect(`/ledger/journals/${event.journal_id}`, maker.token)).totalBdt, "25.01");
    await h.expect(`/expenses/${expense.id}/reverse`, maker.token, { reason: "DEV TEST exact ledger reversal" }, 200, h.key("reverse"));
    assert.equal((await h.ctx.db.select().from(ledgerJournals).where(eq(ledgerJournals.reversalOfId, event.journal_id))).length, 1);
    await h.expect(`/ledger/accounts/${chart["Operating Expense"]}/archive`, maker.token, {});
    await h.expect("/expenses", maker.token, { ...expenseInput, remarks: "DEV TEST blocked GL" }, 422, h.key("invalid-ledger"));
    assert.equal((await h.ctx.db.select().from(expenses).where(and(eq(expenses.paidFromAccountId, bank.id), eq(expenses.remarks, "DEV TEST blocked GL")))).length, 0, "Invalid mapping rolls back the entire cash expense");
    await h.expect(`/ledger/accounts/${chart["Operating Expense"]}/activate`, maker.token, {});
    await h.expect("/account-transactions", maker.token, { date: today, accountId: bank.id, direction: "Out", amount: "1", sourceType: "Advance", partyName: "DEV TEST", description: "DEV TEST ambiguous counterpart" }, 409, h.key("ambiguous"));
    const supplier = await h.expect("/suppliers", maker.token, { name: `DEV TEST Ledger Supplier ${h.suffix}`, country: "China" }, 201);
    const product = await h.expect("/products", maker.token, { code: `DL-${h.suffix}`, name: `DEV TEST Ledger Product ${h.suffix}`, family: "Dialyzer", variant: "Test", unit: "pcs" }, 201);
    const imported = await h.expect("/imports", maker.token, { supplierId: supplier.id, poNumber: `DL-${h.suffix}`, poDate: today, piNumber: "DEV TEST PI", paymentMode: "TT", ttReference: `DL-${h.suffix}`, currency: "BDT", exchangeRate: "1", items: [{ productId: product.id, quantity: "3", currency: "BDT", fobUnitForeign: "10", exchangeRate: "1", cbmMode: "MANUAL", totalCbm: "1" }] }, 201, h.key("import"));
    await h.expect(`/imports/${imported.id}/finalize`, maker.token, {}, 200, h.key("finalize"));
    await h.expect(`/imports/${imported.id}/receive`, maker.token, { receivedDate: today, lines: [{ importItemId: imported.items[0].id, quantityReceived: "3", quantityRejected: "0", lotNumber: "DEV TEST", batchNumber: `DL-${h.suffix}`, manufacturingDate: today, expiryDate: "2029-12-31", warehouse: "Main Warehouse", location: "DEV TEST" }] }, 201, h.key("receive"));
    const customer = await h.expect("/customers", maker.token, { name: `DEV TEST Ledger Customer ${h.suffix}`, type: "Hospital" }, 201, h.key("customer"));
    const quote = await h.expect("/quotations", maker.token, { customerId: customer.id, date: today, validityDays: 30, paymentTerms: "Credit", lines: [{ productId: product.id, quantity: "1", unitPrice: "25", discount: "0" }] }, 201, h.key("quote"));
    const order = await h.expect(`/quotations/${quote.id}/convert`, maker.token, { version: quote.version }, 201, h.key("convert"));
    const delivery = await h.expect("/deliveries", maker.token, { orderId: order.id, date: today, lines: [{ productId: product.id, quantity: "1", batchId: "AUTO" }] }, 201, h.key("delivery"));
    const invoice = await h.expect("/invoices", maker.token, { date: today, deliveryIds: [delivery.id] }, 201, h.key("invoice"));
    await h.expect(`/invoices/${invoice.id}/approve`, maker.token, {}, 200, h.key("invoice-approve"));
    const collection = await h.expect("/collections", maker.token, { customerId: customer.id, invoiceId: invoice.id, date: today, amount: "25", paymentMode: "Bank Transfer", accountId: bank.id, referenceNumber: "DEV TEST" }, 201, h.key("collection"));
    await h.expect(`/collections/${collection.id}/reverse`, maker.token, { reason: "DEV TEST reversal to test cancellation" }, 200, h.key("collection-reverse"));
    await h.expect(`/invoices/${invoice.id}/cancel`, maker.token, { reason: "DEV TEST invoice reversal" }, 200, h.key("invoice-cancel"));
    const obligation = await h.expect("/supplier-settlements", maker.token, { supplierId: supplier.id, importId: imported.id, date: today, reference: `DEV TEST ${h.suffix}`, entryType: "Obligation", amount: "30" }, 201, h.key("obligation"));
    await h.expect(`/supplier-settlements/${obligation.id}/reverse`, maker.token, { reason: "DEV TEST obligation reversal" }, 200, h.key("obligation-reverse"));
    const trial = await h.expect(`/ledger/trial-balance?from=${today}&to=${today}`, maker.token);
    const totals = trial.rows.reduce((s: { d: InstanceType<typeof D>; c: InstanceType<typeof D> }, row: { debit: string; credit: string }) => ({ d: s.d.plus(row.debit), c: s.c.plus(row.credit) }), { d: new D(0), c: new D(0) }); assert.equal(totals.d.toFixed(2), totals.c.toFixed(2));
    assert.ok(new D(trial.rows.find((r: { id: string }) => r.id === chart.Inventory).balance).eq(20));
    for (const id of ["ledger-trial-balance", "ledger-income-statement", "ledger-account-statement", "ledger-control-reconciliation"]) {
      const report = PersistentReportSchema.parse(await h.expect(`/reports/${id}?from=${today}&to=${today}`, maker.token));
      const print = PersistentReportSchema.parse(await h.expect(`/reports/${id}/print?from=${today}&to=${today}`, maker.token));
      assert.deepEqual(report.totals, print.totals); assert.equal(report.rowCount, print.rowCount); assert.ok(report.rows.length > 0);
      await h.expect(`/reports/${id}?from=${today}&to=${today}`, accounts.token, undefined, 403);
    }
    await assert.rejects(h.ctx.db.transaction((t) => t.update(ledgerLines).set({ debit: "99" }).where(eq(ledgerLines.journalId, journal.id))));
    await assert.rejects(h.ctx.db.transaction((t) => t.delete(ledgerLines).where(eq(ledgerLines.journalId, journal.id))));
    await assert.rejects(h.ctx.db.transaction((t) => t.update(ledgerJournals).set({ description: "Tampered", version: 4 }).where(eq(ledgerJournals.id, journal.id))));
    await h.expect("/ledger/periods/request", maker.token, { throughDate: today }, 422);
    const prior = new Date(`${today}T00:00:00Z`); prior.setUTCDate(prior.getUTCDate() - 1); const throughDate = prior.toISOString().slice(0, 10);
    const period = await h.expect("/ledger/periods/request", maker.token, { throughDate }, 201);
    let closing = await getApproval(period.approvalId);
    await h.expect(`/controls/approvals/${closing.id}/verify`, verifier.token, { version: closing.version, reason: "DEV TEST closing evidence review" }); closing = await getApproval(closing.id);
    await h.expect(`/controls/approvals/${closing.id}/approve`, approver.token, { version: closing.version, reason: "DEV TEST independent period close" });
    await h.expect(`/ledger/periods/${closing.id}/post`, maker.token, {});
    await h.expect(`/ledger/periods/${closing.id}/post`, maker.token, {});
    const backdated = await h.expect("/ledger/journals", maker.token, { ...input, date: throughDate }, 201);
    const submitted = await h.expect(`/ledger/journals/${backdated.id}/submit`, maker.token, { version: backdated.version });
    let backApproval = await getApproval(submitted.approvalId);
    await h.expect(`/controls/approvals/${backApproval.id}/verify`, verifier.token, { version: backApproval.version, reason: "DEV TEST source reviewed" }); backApproval = await getApproval(backApproval.id);
    await h.expect(`/controls/approvals/${backApproval.id}/approve`, approver.token, { version: backApproval.version, reason: "DEV TEST approval cannot reopen closed dates" });
    await h.expect(`/ledger/journals/${backdated.id}/post`, maker.token, { version: submitted.version }, 409);
    const limited = await h.expect("/ledger/journals", maker.token, { ...input, lines: input.lines.map((l) => ({ ...l, debit: l.debit === "0" ? "0" : "100000001", credit: l.credit === "0" ? "0" : "100000001" })) }, 201);
    await h.expect(`/ledger/journals/${limited.id}/submit`, maker.token, { version: limited.version }, 409);
    const [existingStockPolicy] = await h.ctx.db.select().from(approvalPolicies).where(and(eq(approvalPolicies.domain, "Stock"), eq(approvalPolicies.state, "Approved")));
    if (!existingStockPolicy) {
      const stockPolicy = await h.expect("/controls/policies", maker.token, { domain: "Stock", name: `DEV TEST privacy ${h.suffix}`, effectiveFrom: today, maximumAmountBdt: "1000", verifierIds: [warehouse.id], approverIds: [approver.id], independentVerifier: true, proofReference: "DEV TEST authority visibility only" }, 201);
      await h.expect(`/controls/policies/${stockPolicy.id}/approve`, verifier.token, { version: 1, reason: "DEV TEST policy privacy review" });
      const [makerRow] = await h.ctx.db.select().from(employees).where(eq(employees.id, maker.id));
      const privacyId = await h.ctx.db.transaction((tx) => createApproval(tx, toUser(makerRow), { domain: "Stock", resourceType: "DEV TEST privacy source", resourceId: `privacy-${h.suffix}`, reference: "DEV TEST private valuation", amountBdt: "123.45", payloadHash: digest(h.suffix) }));
      const visible = approvalPageSchema.parse(await h.expect("/controls/approvals?domain=Stock", warehouse.token)); assert.equal(visible.rows.find((r) => r.id === privacyId)?.amountBdt, "Restricted");
      const history = await h.expect(`/controls/approvals/${privacyId}/events`, warehouse.token); assert.ok(history.every((e: { reason: string }) => e.reason === "Restricted financial evidence"));
    }
    if (process.env.RUN_LEDGER_BROWSER_TESTS === "true") {
      const { ledgerBrowserCheck } = await import("../../scripts/ledger-browser-check.js");
      await ledgerBrowserCheck(h.bases[0], h.password, [maker, verifier, approver], chart.Inventory, chart.Equity, h.suffix);
    }
    // Exercise retirement, then roll the entire isolated accounting transaction back.
    if (maker && configId) { const [c] = await h.ctx.db.select().from(ledgerConfigurations).where(eq(ledgerConfigurations.id, configId)); if (c?.state === "Approved") await h.expect(`/ledger/configurations/${c.id}/retire`, maker.token, { version: c.version, reason: "DEV TEST isolated configuration cleanup" }); }
    if (maker && policyId) { const [p] = await h.ctx.db.select().from(approvalPolicies).where(eq(approvalPolicies.id, policyId)); if (p?.state === "Approved") await h.expect(`/controls/policies/${p.id}/retire`, maker.token, { version: p.version, reason: "DEV TEST isolated policy cleanup" }); }
    } finally { h.ctx.db = databases[0]; h.other.db = databases[1]; h.ctx.client = pools[0]; h.other.client = pools[1]; }
    throw rollback;
    }); } catch (error) { if (error !== rollback) throw error; }
  } finally {
    h.ctx.db = databases[0]; h.other.db = databases[1]; h.ctx.client = pools[0]; h.other.client = pools[1]; await h.close();
  }
});
