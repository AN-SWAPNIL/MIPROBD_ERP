import test from "node:test";
import assert from "node:assert/strict";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database, Transaction } from "../../database/client.js";
import { approvalEvents, approvalPolicies, approvalRequests, cashAccounts, employees, ledgerAccounts, ledgerConfigurations, stockBatches } from "../../database/schema.js";
import { controlDomains } from "../../src/domains/controls/contracts.js";
import { ledgerMappingRoles, ledgerRoleKind } from "../../src/domains/ledger/contracts.js";
import { businessDate } from "../../src/lib/date.js";
import { digest, toUser } from "../foundation/context.js";
import { hostedHarness } from "../testing/hosted.js";
import { consumeApproval, createApproval } from "./service.js";

test("hosted owner authority: self decisions, configuration, immutable history and delegated restrictions", {
  skip: process.env.RUN_HOSTED_OWNER_AUTHORITY_TESTS !== "true", timeout: 900000,
}, async () => {
  assert.equal(new URL(process.env.SUPABASE_URL!).hostname, "hyttuapvvqqxcyhojbwq.supabase.co", "Rollback-only regression is restricted to development");
  if (process.env.RUN_OWNER_AUTHORITY_BROWSER_TESTS === "true") {
    process.env.APP_URL = "http://localhost:5197";
    const { prepareLedgerBrowserBundle } = await import("../../scripts/ledger-browser-check.js"); await prepareLedgerBrowserBundle();
  }
  const h = await hostedHarness("owner", { serialRequests: true });
  const databases = [h.ctx.db, h.other.db], pools = [h.ctx.client, h.other.client];
  const rollback = new Error("ROLLBACK_OWNER_AUTHORITY"), today = businessDate();
  try {
    await assert.rejects(databases[0].transaction(async (tx) => {
      await tx.execute(sql`select set_config('idle_in_transaction_session_timeout','60000',true)`);
      const isolated = new Proxy(tx, { get(target, prop) {
        if (prop === "transaction") return (callback: (nested: Transaction) => Promise<unknown>) => target.transaction(async (nested) => {
          const result = await callback(nested);
          await nested.execute(sql`set constraints all immediate`); await nested.execute(sql`set constraints all deferred`); return result;
        });
        const value = Reflect.get(target, prop); return typeof value === "function" ? value.bind(target) : value;
      } }) as unknown as Database;
      const client = new Proxy(pools[0], { get(target, prop) {
        if (prop === "query") return (query: string) => tx.execute(sql.raw(query));
        const value = Reflect.get(target, prop); return typeof value === "function" ? value.bind(target) : value;
      } });
      h.ctx.db = h.other.db = isolated; h.ctx.client = h.other.client = client;
      try {
        assert.equal((await tx.select().from(approvalPolicies).where(eq(approvalPolicies.state, "Approved"))).length, 0, "Never replace real approved policies");
        assert.equal((await tx.select().from(ledgerConfigurations).where(eq(ledgerConfigurations.state, "Approved"))).length, 0, "Never replace real active chart");
        const owner = await h.employee("Super Admin");
        const preparer = await h.employee("Warehouse Manager", ["approve_stock_control", "view_sensitive_cost"]);
        const verifier = await h.employee("Warehouse Manager", ["approve_stock_control", "view_sensitive_cost"]);
        const approver = await h.employee("Warehouse Manager", ["approve_stock_control", "view_sensitive_cost"]);
        const outsider = await h.employee("Sales Executive");
        const ownerRow = (await tx.select().from(employees).where(eq(employees.id, owner.id)))[0];
        const request = async (domain: typeof controlDomains[number], by = owner, suffix: string = domain, amount = "2.50") => {
          const user = toUser((await tx.select().from(employees).where(eq(employees.id, by.id)))[0]);
          return createApproval(tx, user, { domain, resourceType: "Authority Regression", resourceId: `${h.suffix}-${suffix}`, reference: `DEV TEST ${suffix}`, amountBdt: amount, payloadHash: digest(suffix), context: { excludedActorIds: [by.id] } });
        };
        const row = async (id: string) => (await tx.select().from(approvalRequests).where(eq(approvalRequests.id, id)))[0];
        for (const domain of controlDomains) {
          const members = domain === "Stock" ? { verifierIds: [preparer.id, verifier.id], approverIds: [preparer.id, verifier.id, approver.id] } : { verifierIds: [owner.id], approverIds: [owner.id] };
          const policy = await h.expect("/controls/policies", owner.token, { domain, name: `DEV TEST owner ${domain}`, effectiveFrom: today, maximumAmountBdt: "100", ...members, independentVerifier: true, proofReference: "DEV TEST rollback-only" }, 201);
          await h.expect(`/controls/policies/${policy.id}/approve`, owner.token, { version: 1, reason: "DEV TEST own policy activation" });
          const id = await request(domain);
          await h.expect(`/controls/approvals/${id}/approve`, owner.token, { version: 1, reason: "DEV TEST owner decision" });
          const saved = await row(id);
          assert.equal(saved.state, "Approved"); assert.equal(saved.version, 3);
          assert.equal(saved.verifiedBy, owner.id); assert.equal(saved.approvedBy, owner.id);
          assert.equal(saved.verifiedAsSuperAdmin, true); assert.equal(saved.approvedAsSuperAdmin, true);
          const events = await tx.select().from(approvalEvents).where(eq(approvalEvents.approvalId, id)).orderBy(approvalEvents.version);
          assert.deepEqual(events.map(e => e.action), ["Submitted", "Verified", "Approved"]);
          assert.ok(events.slice(1).every(e => e.reason.startsWith("Super Admin authority:")));
          await h.expect(`/controls/approvals/${id}/approve`, owner.token, { version: 1, reason: "DEV TEST stale replay" }, 409);
          await assert.rejects(tx.transaction(t => consumeApproval(t, toUser(ownerRow), id, { domain, resourceType: saved.resourceType, resourceId: saved.resourceId, payloadHash: digest("changed") })), /unchanged source/);
          await consumeApproval(tx, toUser(ownerRow), id, { domain, resourceType: saved.resourceType, resourceId: saved.resourceId, payloadHash: saved.payloadHash });
          assert.equal((await row(id)).state, "Posted");
          await assert.rejects(tx.transaction(t => t.update(approvalRequests).set({ reason: "Forged rewrite", version: 5 }).where(eq(approvalRequests.id, id))));
        }
        const delegated = await request("Stock", preparer, "delegated");
        await h.expect(`/controls/approvals/${delegated}/verify`, preparer.token, { version: 1, reason: "DEV TEST cannot self review" }, 403);
        await h.expect(`/controls/approvals/${delegated}/approve`, approver.token, { version: 1, reason: "DEV TEST cannot skip verify" }, 403);
        await h.expect(`/controls/approvals/${delegated}/verify`, outsider.token, { version: 1, reason: "DEV TEST unrelated role" }, 403);
        await h.expect(`/controls/approvals/${delegated}/approve`, owner.token, { version: 1, reason: "DEV TEST cannot forge flag", approvedAsSuperAdmin: true }, 422);
        await assert.rejects(tx.transaction(t => t.update(approvalRequests).set({ state: "Verified", version: 2, verifiedBy: preparer.id, verifiedAsSuperAdmin: true, reason: "DEV TEST forged admin authority" }).where(eq(approvalRequests.id, delegated))));
        await h.expect(`/controls/approvals/${delegated}/verify`, verifier.token, { version: 1, reason: "DEV TEST assigned verifier" });
        await h.expect(`/controls/approvals/${delegated}/approve`, verifier.token, { version: 2, reason: "DEV TEST delegated separate approver" }, 403);
        await h.expect(`/controls/approvals/${delegated}/approve`, approver.token, { version: 2, reason: "DEV TEST assigned approver" });
        assert.equal((await row(delegated)).approvedAsSuperAdmin, false);
        await assert.rejects(tx.transaction(() => request("Stock", owner, "too-large", "100.01")), /exceeds/);

        const pending = await request("Stock", owner, "withdrawn-authority");
        await h.expect(`/controls/approvals/${pending}/approve`, owner.token, { version: 1, reason: "DEV TEST owner before demotion" });
        await tx.update(employees).set({ role: "Warehouse Manager" }).where(eq(employees.id, owner.id));
        const saved = await row(pending);
        await assert.rejects(tx.transaction(t => consumeApproval(t, toUser(ownerRow), pending, { domain: "Stock", resourceType: saved.resourceType, resourceId: saved.resourceId, payloadHash: saved.payloadHash })), /authority.*active/);
        await tx.update(employees).set({ role: "Super Admin" }).where(eq(employees.id, owner.id));

        // Preserve a retired development baseline; never rewrite real chart/cutover history.
        const [previous] = await tx.select().from(ledgerConfigurations).where(eq(ledgerConfigurations.state, "Retired")).orderBy(desc(ledgerConfigurations.createdAt)).limit(1);
        const mappings = [...previous?.data.mappings ?? []], cashMappings = [...previous?.data.cashMappings ?? []];
        const baselineIds = [...new Set([...mappings, ...cashMappings].map(m => m.accountId))];
        if (baselineIds.length) await tx.update(ledgerAccounts).set({ active: true }).where(inArray(ledgerAccounts.id, baselineIds));
        let counter = 0;
        const account = async (kind: string) => (await h.expect("/ledger/accounts", owner.token, { code: `OW${counter++}-${h.suffix.slice(0, 8)}`, name: "DEV TEST owner chart", kind }, 201)).id as string;
        for (const role of ledgerMappingRoles) if (!mappings.some(m => m.role === role)) mappings.push({ role, accountId: await account(ledgerRoleKind(role)) });
        for (const c of await tx.select().from(cashAccounts).where(eq(cashAccounts.active, true))) if (!cashMappings.some(m => m.cashAccountId === c.id)) cashMappings.push({ cashAccountId: c.id, accountId: await account("Asset") });
        const config = await h.expect("/ledger/configurations", owner.token, { effectiveFrom: previous?.data.effectiveFrom ?? today, proofReference: "DEV TEST preserved baseline", mappings, cashMappings }, 201);
        await h.expect(`/ledger/configurations/${config.id}/approve`, owner.token, { version: 1, reason: "DEV TEST own chart activation" });
        const mapping = (await tx.select().from(ledgerConfigurations).where(eq(ledgerConfigurations.id, config.id)))[0];
        assert.equal(mapping.approvedBy, owner.id); assert.equal(mapping.createdBy, owner.id);
        let journal = await h.expect("/ledger/journals", owner.token, { date: today, type: "Adjustment", reference: "DEV TEST owner journal", proofReference: "DEV TEST source", description: "DEV TEST balanced owner journal", lines: [{ accountId: mappings.find(m => m.role === "Operating Expense")!.accountId, debit: "1", credit: "0", note: "DEV TEST" }, { accountId: mappings.find(m => m.role === "Sales")!.accountId, debit: "0", credit: "1", note: "DEV TEST" }] }, 201);
        journal = await h.expect(`/ledger/journals/${journal.id}/submit`, owner.token, { version: journal.version });
        await h.expect(`/controls/approvals/${journal.approvalId}/approve`, owner.token, { version: 1, reason: "DEV TEST approve own journal" });
        assert.equal((await h.expect(`/ledger/journals/${journal.id}/post`, owner.token, { version: journal.version })).state, "Posted");
        assert.equal((await h.expect(`/ledger/journals/${journal.id}/post`, owner.token, { version: journal.version })).state, "Posted");

        const supplier = await h.expect("/suppliers", owner.token, { name: `DEV TEST Owner Supplier ${h.suffix}`, country: "China" }, 201);
        const product = await h.expect("/products", owner.token, { code: `OW-${h.suffix}`, name: "DEV TEST Owner Goods", family: "Dialyzer", variant: "Test", unit: "pcs" }, 201);
        const imp = await h.expect("/imports", owner.token, { supplierId: supplier.id, poNumber: `OW-${h.suffix}`, poDate: today, piNumber: "DEV TEST", paymentMode: "TT", ttReference: `OW-${h.suffix}`, currency: "BDT", exchangeRate: "1", items: [{ productId: product.id, quantity: "10", currency: "BDT", fobUnitForeign: "1", exchangeRate: "1", cbmMode: "MANUAL", totalCbm: "1" }] }, 201, h.key("import"));
        await h.expect(`/imports/${imp.id}/finalize`, owner.token, {}, 200, h.key("finalize"));
        await h.expect(`/imports/${imp.id}/receive`, owner.token, { receivedDate: today, lines: [{ importItemId: imp.items[0].id, quantityReceived: "10", quantityRejected: "0", lotNumber: "DEV TEST", batchNumber: `OW-${h.suffix}`, manufacturingDate: today, expiryDate: "2029-12-31", warehouse: "Main Warehouse", location: "DEV TEST" }] }, 201, h.key("receive"));
        const [batch] = await tx.select().from(stockBatches).where(eq(stockBatches.productId, product.id));
        let count = await h.expect("/inventory/controls", owner.token, { kind: "Physical Count", countDate: today, reason: "DEV TEST own stock recount", inspection: "DEV TEST physically counted nine units", proofReference: "DEV TEST owner count", lines: [{ batchId: batch.id, countedQuantity: "9" }] }, 201, h.key("count"));
        count = await h.expect(`/inventory/controls/${count.id}/submit`, owner.token, { version: count.version });
        await h.expect(`/controls/approvals/${count.approvalId}/approve`, owner.token, { version: 1, reason: "DEV TEST own stock source approval" });
        assert.equal((await h.expect(`/inventory/controls/${count.id}/post`, owner.token, { version: count.version })).state, "Posted");

        const compensationData = { joiningDate: today, employmentEndDate: null, basic: "10", houseRent: "0", medical: "0", transport: "0", otherAllowance: "0", overtimeRate: "0", commissionEligible: true, paymentChannel: "Cash", bankName: "", payeeName: "DEV TEST Owner", payeeAccount: "" };
        for (const input of [{ kind: "Compensation", data: compensationData }, { kind: "Commission", data: { basis: "Net Collections", ratePercent: "5", recoverNegative: true } }]) {
          const policy = await h.expect("/payroll/policies", owner.token, { ...input, employeeId: owner.id, effectiveFrom: today, proofReference: "DEV TEST owner beneficiary" }, 201, h.key(`owner-${input.kind}`));
          await h.expect(`/controls/approvals/${policy.approvalId}/approve`, owner.token, { version: 1, reason: "DEV TEST owner beneficiary self approval" });
          assert.equal((await h.expect(`/payroll/policies/${policy.id}/activate`, owner.token, { version: policy.version })).state, "Active");
        }

        const planInput = { kind: "Daily", period: today, status: "Submitted", notes: "DEV TEST own plan", plannedActivities: 1 };
        const plan = await h.expect("/workforce/plans", owner.token, planInput, 201, h.key("plan"));
        await h.expect(`/workforce/plans/${plan.id}/review`, owner.token, { version: 1, status: "Approved", reason: "DEV TEST owner self review" }, 200, h.key("plan-review"));
        await tx.update(employees).set({ permissionOverrides: [{ permission: "marketing", action: "approve", effect: "ALLOW" }] }).where(eq(employees.id, outsider.id));
        const ownPlan = await h.expect("/workforce/plans", outsider.token, planInput, 201, h.key("delegated-plan"));
        await h.expect(`/workforce/plans/${ownPlan.id}/review`, outsider.token, { version: 1, status: "Approved", reason: "DEV TEST delegated self denial" }, 403, h.key("delegated-review"));
        assert.equal((await tx.select().from(approvalPolicies).where(and(eq(approvalPolicies.state, "Approved"), eq(approvalPolicies.createdBy, owner.id)))).length, 6);
        if (process.env.RUN_OWNER_AUTHORITY_BROWSER_TESTS === "true") {
          await h.expect("/controls/policies", owner.token, { domain: "Ledger", name: "DEV TEST browser own draft", effectiveFrom: today, maximumAmountBdt: "100", verifierIds: [owner.id], approverIds: [owner.id], independentVerifier: true, proofReference: "DEV TEST browser draft" }, 201);
          const { ownerApprovalBrowser } = await import("../../scripts/owner-approval-browser.js");
          await ownerApprovalBrowser(h.bases[0], owner, h.password, mappings.find(m => m.role === "Operating Expense")!.accountId, mappings.find(m => m.role === "Sales")!.accountId);
        }
      } finally { h.ctx.db = databases[0]; h.other.db = databases[1]; h.ctx.client = pools[0]; h.other.client = pools[1]; }
      throw rollback;
    }), error => error === rollback);
  } finally { await h.close(); }
});
