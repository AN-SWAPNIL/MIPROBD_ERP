import test from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "decimal.js";
import { eq, sql } from "drizzle-orm";
import { costPresets, employees } from "../../database/schema.js";
import { dashboardPayload } from "../../src/domains/dashboard/persistentContracts.js";
import { warehouseRecord } from "../../src/domains/settings/operationalContracts.js";
import { businessDate } from "../../src/lib/date.js";
import { hostedHarness } from "../testing/hosted.js";

test("hosted dashboard and settings: source reconciliation, role-safe payloads, cross-worker versions and durable presets", { skip: process.env.RUN_HOSTED_DASHBOARD_TESTS !== "true", timeout: 600000 }, async () => {
  if (process.env.RUN_DASHBOARD_BROWSER_TESTS === "true") process.env.APP_URL = "http://localhost:5198";
  const h = await hostedHarness("dashboard"); let presetId: string | undefined;
  const today = businessDate(); const period = `from=${today.slice(0, 7)}-01&to=${today}`;
  try {
    const tables = (await h.ctx.db.execute<{ name: string; rls: boolean; anonymous: boolean; authenticated: boolean }>(sql`select c.relname name,c.relrowsecurity rls,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anonymous,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') authenticated from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='erp_private' and c.relname in ('warehouse_settings','cost_presets','business_decisions')`)).rows;
    assert.equal(tables.length, 3); assert.ok(tables.every((t) => t.rls && !t.anonymous && !t.authenticated), "New settings tables stay private to the authorized server");
    const admin = await h.employee("Super Admin", ["view_profit", "view_sensitive_cost", "view_financial_position"]); const md = await h.employee("Managing Director"); const warehouse = await h.employee("Warehouse Manager"); const importer = await h.employee("Import Officer"); const sales = await h.employee("Sales Executive"); const accounts = await h.employee("Accounts"); const manager = await h.employee("Sales Manager");
    const dash = (token: string, instance = 0) => h.expect(`/dashboard?${period}`, token, undefined, 200, { instance }).then((d) => dashboardPayload.parse(d));
    const all = await dash(admin.token); assert.ok(all.metrics.length <= 6); assert.equal(all.trend.length, Number(today.slice(-2))); assert.ok(all.queues.every((q) => q.rows.length <= 8));
    const scalar = async (query: Parameters<typeof h.ctx.db.execute>[0]) => (await h.ctx.db.execute<{ value: string }>(query)).rows[0].value;
    const metric = (id: string) => all.metrics.find((m) => m.id === id)!.value;
    const salesReport = await h.expect(`/reports/sales-summary?${period}`, admin.token);
    assert.ok(new Decimal(metric("sales")).eq(salesReport.totals.sales)); assert.ok(new Decimal(metric("collections")).eq(salesReport.totals.collections));
    assert.ok(new Decimal(metric("sales")).eq(Decimal.sum(...all.trend.map((r) => r.sales))));
    assert.ok(new Decimal(metric("cash-bank")).eq(await scalar(sql`select coalesce(sum(case when direction='In' then amount else -amount end),0)::text value from erp_private.account_transactions where date<=${today}::date`)));
    assert.ok(new Decimal(metric("receivables")).eq(await scalar(sql`select coalesce(sum(greatest(due,0)),0)::text value from (select sum(debit-credit) due from erp_private.customer_entries where date<=${today}::date group by customer_id) x`)));
    const profit = await h.expect(`/reports/gross-profit-product?${period}`, admin.token); assert.ok(new Decimal(metric("gross-profit")).eq(profit.totals.profit));
    for (const actor of [warehouse, importer]) {
      const d = await dash(actor.token); assert.equal(d.trend.length, 0); assert.ok(d.metrics.every((m) => m.format !== "money"));
      assert.ok(d.queues.every((q) => !["dues", "expenses", "orders", "visits"].includes(q.id)));
      assert.ok(!JSON.stringify(d).includes("landedCost") && !JSON.stringify(d).includes("latitude"));
    }
    for (const actor of [md, accounts, manager, sales]) dashboardPayload.parse(await dash(actor.token));
    const mine = await dash(sales.token); assert.equal(mine.metrics.find((m) => m.id === "sales")?.value, "0"); assert.ok(!mine.metrics.some((m) => ["cash-bank", "gross-profit"].includes(m.id))); assert.equal(mine.queues.find((q) => q.id === "orders")?.total, "0");
    await h.expect(`/dashboard?${period}&employee=forged`, sales.token, undefined, 422);
    await h.expect("/dashboard?from=2020-01-01&to=" + today, sales.token, undefined, 422);
    await h.ctx.db.update(employees).set({ permissionOverrides: [{ permission: "dashboard", action: "view", effect: "DENY" }] }).where(eq(employees.id, sales.id));
    await h.expect("/dashboard", sales.token, undefined, 403);
    const original = warehouseRecord.parse(await h.expect("/settings/warehouse", admin.token)); const { version, ...originalData } = original;
    const changed = await h.expect("/settings/warehouse", admin.token, { version, data: { ...originalData, contactPerson: "DEV TEST dashboard warehouse contact" }, reason: "DEV TEST settings version validation" }, 200, { method: "PATCH" });
    try {
      await h.expect("/settings/warehouse", admin.token, { version, data: originalData, reason: "DEV TEST stale edit rejected" }, 409, { method: "PATCH", instance: 1 });
      assert.equal((await h.expect("/settings/warehouse", warehouse.token, undefined, 200, { instance: 1 })).contactPerson, changed.contactPerson);
      await h.expect("/settings/warehouse", warehouse.token, { version: changed.version, data: originalData, reason: "DEV TEST unauthorized settings change" }, 403, { method: "PATCH" });
    } finally { await h.expect("/settings/warehouse", admin.token, { version: changed.version, data: originalData, reason: "DEV TEST restore original warehouse details" }, 200, { method: "PATCH" }); }
    const body = { data: { name: `DEV TEST Freight ${h.suffix}`, category: "Freight", suggestedAllocationMethod: "CBM", requiresExplicitChoice: true, active: true }, reason: "DEV TEST explicit preset suggestion" };
    const created = await h.expect("/settings/cost-presets", admin.token, body, 201, h.key("preset")); presetId = created.id;
    assert.equal((await h.expect("/settings/cost-presets", admin.token, body, 201, { ...h.key("preset"), instance: 1 })).id, presetId);
    await h.expect("/settings/cost-presets", importer.token, body, 403, h.key("denied"));
    const list = await h.expect("/settings/cost-presets", importer.token, undefined, 200, { instance: 1 }); assert.ok(list.some((p: { id: string }) => p.id === presetId));
    const update = { ...body, version: created.version, data: { ...body.data, active: false } };
    await h.expect(`/settings/cost-presets/${presetId}`, admin.token, update, 200, { method: "PATCH" });
    await h.expect(`/settings/cost-presets/${presetId}`, admin.token, update, 409, { method: "PATCH", instance: 1 });
    await assert.rejects(h.ctx.db.delete(costPresets).where(eq(costPresets.id, presetId!)), "preset history cannot be erased");
    const decisions = await h.expect("/settings/decisions", admin.token); assert.ok(decisions.length >= 5); assert.ok(!decisions.some((d: { id: string }) => d.id === "invoice-generation"));
    await h.expect("/settings/decisions", md.token, undefined, 403);
    await h.expect(`/settings/decisions/${decisions[0].id}`, admin.token, { version: decisions[0].version + 1, status: "Confirmed", resolutionValue: "DEV TEST", resolutionNotes: "DEV TEST stale confirmation", reason: "DEV TEST version guard" }, 409, { method: "PATCH" });
    const position = (await h.expect("/reports/catalogue", admin.token)).find((r: { id: string }) => r.id === "balance-sheet"); assert.equal(position.available, false);
    if (process.env.RUN_DASHBOARD_BROWSER_TESTS === "true") {
      await h.ctx.db.update(employees).set({ permissionOverrides: [] }).where(eq(employees.id, sales.id));
      const { dashboardBrowserSmoke } = await import("../../scripts/dashboard-browser-smoke.js");
      await dashboardBrowserSmoke(h.bases[0], [admin, md, warehouse, importer, sales, accounts, manager], h.password, h.peer);
    }
    console.log("Verified dashboard journals, all seven role payloads, durable settings, optimistic conflicts and preserved decision controls.");
  } finally {
    try { if (presetId) { const [row] = await h.ctx.db.select().from(costPresets).where(eq(costPresets.id, presetId)); if (row?.data.active) await h.ctx.db.update(costPresets).set({ data: { ...row.data, active: false }, version: row.version + 1, updatedBy: row.updatedBy }).where(eq(costPresets.id, row.id)); } } finally { await h.close(); }
  }
});
