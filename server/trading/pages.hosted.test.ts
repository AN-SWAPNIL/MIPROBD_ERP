import test from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { customers, products } from "../../database/schema.js";
import type { Database, Transaction } from "../../database/client.js";
import { salesKinds, salesPageInput, salesPageSchema, salesSummarySchema } from "../../src/domains/sales/pageContracts.js";
import { readSalesPage } from "./pages.js";
import { toUser } from "../foundation/context.js";
import { hostedHarness } from "../testing/hosted.js";

test("hosted paged sales: all kinds, 501 customers, exact pages, literal search and seven role boundaries", { skip: process.env.RUN_HOSTED_PRODUCTION_HARDENING_TESTS !== "true", timeout: 420000 }, async () => {
  assert.equal(new URL(process.env.SUPABASE_URL ?? "").hostname, "hyttuapvvqqxcyhojbwq.supabase.co", "This test is scoped to the existing development project, never UAT/production");
  if (process.env.RUN_PRODUCTION_HARDENING_BROWSER_TESTS === "true") {
    process.env.APP_URL = "http://localhost:5202";
    const { prepareProductionHardeningBrowser } = await import("../../scripts/production-hardening-browser.js");
    await prepareProductionHardeningBrowser();
  }
  const h = await hostedHarness("sales-pages", { serialRequests: true });
  try {
    const people = new Map<string, Awaited<ReturnType<typeof h.employee>>>();
    for (const role of ["Super Admin", "Managing Director", "Accounts", "Import Officer", "Warehouse Manager", "Sales Manager", "Sales Executive"] as const) people.set(role, await h.employee(role));
    const admin = people.get("Super Admin")!;
    const launch = await h.expect("/system/launch-checks", admin.token); assert.equal(launch.productionCertified, false); assert.ok(launch.checks.some((c: { id: string }) => c.id === "ledger"));
    await h.expect("/system/launch-checks", people.get("Managing Director")!.token, undefined, 403);
    for (const kind of salesKinds) {
      const first = salesPageSchema(kind).parse(await h.expect(`/sales/page?kind=${kind}&pageSize=1`, admin.token)); assert.ok(first.rows.length <= 1);
      if (first.total > 1) { const next = salesPageSchema(kind).parse(await h.expect(`/sales/page?kind=${kind}&pageSize=1&page=2`, admin.token)); assert.notDeepEqual(next.rows.map((r) => r.id), first.rows.map((r) => r.id)); }
      assert.equal((await h.call(`/sales/page?kind=${kind}&pageSize=10001`, admin.token)).status, 422);
      assert.equal((await h.call(`/sales/page?kind=${kind}`, people.get("Import Officer")!.token)).status, 403);
      const warehouse = await h.call(`/sales/page?kind=${kind}`, people.get("Warehouse Manager")!.token);
      assert.equal(warehouse.status, 403, "The default warehouse role has no Sales grant");
      if (kind === "customers") for (const role of ["Managing Director", "Accounts", "Sales Manager"] as const) await h.expect(`/sales/page?kind=${kind}`, people.get(role)!.token);
      if (["customers", "quotations", "orders", "deliveries", "invoices", "collections"].includes(kind)) assert.equal((await h.expect(`/sales/page?kind=${kind}`, people.get("Sales Executive")!.token)).total, 0);
    }
    const summary = salesSummarySchema.parse(await h.expect("/sales/summary", admin.token));
    const [count] = (await h.ctx.db.execute<{ count: number }>(sql`select count(*)::int count from erp_private.customers`)).rows; assert.equal(summary.customers, count.count);
    await h.expect("/sales/summary", people.get("Warehouse Manager")!.token, undefined, 403);
    const marker = new Error("ROLLBACK_SALES_PAGING_FIXTURES");
    try { await h.ctx.db.transaction(async (tx) => {
      await tx.execute(sql`set local idle_in_transaction_session_timeout='60000'`);
      const owner = people.get("Sales Executive")!;
      await tx.insert(customers).values(Array.from({ length: 501 }, (_, index) => ({ id: `test-page-${h.suffix}-${index}`, name: `DEV TEST ${h.suffix} ${String(index).padStart(3,"0")}${index === 0 ? " %literal" : ""}`, type: "Hospital" as const, assignedSalesUserId: index < 2 ? owner.id : admin.id, createdBy: admin.id })));
      const adminUser = toUser({ id: admin.id, role: "Super Admin", status: "Active" } as Parameters<typeof toUser>[0]);
      const all = new Set<string>();
      for (let page = 1; page <= 21; page++) {
        const result = salesPageSchema("customers").parse(await readSalesPage(tx, adminUser, salesPageInput.parse({ kind: "customers", search: h.suffix, page })));
        assert.equal(result.total, 501); assert.equal(result.rows.length, page === 21 ? 1 : 25); for (const row of result.rows) { assert.ok(!all.has(row.id)); all.add(row.id); }
      }
      assert.equal(all.size, 501);
      const escaped = await readSalesPage(tx, adminUser, salesPageInput.parse({ kind: "customers", search: "%literal" })); assert.equal(escaped.total, 1);
      const selected = await readSalesPage(tx, adminUser, salesPageInput.parse({ kind: "customers", selectedId: `test-page-${h.suffix}-500`, search: "not-a-match" })); assert.equal(selected.rows.length, 0); assert.equal(selected.selected?.id, `test-page-${h.suffix}-500`);
      const own = await readSalesPage(tx, { ...adminUser, id: owner.id, role: "Sales Executive" }, salesPageInput.parse({ kind: "customers", search: h.suffix, selectedId: `test-page-${h.suffix}-500` })); assert.equal(own.total, 2); assert.equal(own.selected, null);
      throw marker;
    }); } catch (error) { if (error !== marker) throw error; }
    if (process.env.RUN_PRODUCTION_HARDENING_BROWSER_TESTS === "true") {
      const databases = [h.ctx.db, h.other.db], pools = [h.ctx.client, h.other.client];
      try { await databases[0].transaction(async (tx) => {
        await tx.execute(sql`set local idle_in_transaction_session_timeout='60000'`);
        const customerId = `test-browser-customer-${h.suffix}`, productId = `test-browser-product-${h.suffix}`;
        await tx.insert(customers).values({ id: customerId, name: `DEV TEST Frontend ${h.suffix}`, type: "Hospital", paymentTerms: "30 days", createdBy: admin.id });
        await tx.insert(products).values({ id: productId, code: `TEST-PAGE-${h.suffix}`, name: `DEV TEST Frontend ${h.suffix}`, family: "Dialyzer", variant: "Test", unit: "pcs", standardSalePrice: "1.00" });
        const isolated = new Proxy(tx, { get(target, prop) { if (prop === "transaction") return (callback: (nested: Transaction) => Promise<unknown>) => target.transaction(async (nested) => { const result = await callback(nested); await nested.execute(sql`set constraints all immediate`); await nested.execute(sql`set constraints all deferred`); return result; }); const value = Reflect.get(target, prop); return typeof value === "function" ? value.bind(target) : value; } }) as unknown as Database;
        h.ctx.db = isolated; h.other.db = isolated;
        const client = new Proxy(pools[0], { get(target, prop) { if (prop === "query") return (query: string) => tx.execute(sql.raw(query)); const value = Reflect.get(target, prop); return typeof value === "function" ? value.bind(target) : value; } });
        h.ctx.client = client; h.other.client = client;
        try {
          const { productionHardeningBrowser } = await import("../../scripts/production-hardening-browser.js");
          await productionHardeningBrowser(h.bases[0], admin.email, h.password, customerId, productId, h.suffix, h.peer);
        } finally { [h.ctx.db, h.other.db] = databases; [h.ctx.client, h.other.client] = pools; }
        throw marker;
      }); } catch (error) { if (error !== marker) throw error; }
    }
  } finally { await h.close(); }
});
