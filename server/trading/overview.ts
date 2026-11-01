import { Router } from "express";
import { sql, type SQL } from "drizzle-orm";
import { products } from "../../database/schema.js";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { restrictDeliveryFinancials, restrictOrderFinancials } from "../salesWorkspace.js";
import { readCustomers, readOrders, readQuotations } from "./records.js";
import { readAccounts, readCollections, readDeliveries, readInvoices } from "./posting-records.js";

export function createSalesOverviewRouter(ctx: Context) {
  const router = Router();
  router.get("/sales/overview", async (_req, res) => {
    const user = identity(res).user; const sales = hasEffectivePermission(user, "sales"); const customers = hasEffectivePermission(user, "customers");
    assertAllowed(sales || hasEffectivePermission(user, "marketing"));
    const financial = sales && user.role !== "Warehouse Manager"; const collect = financial && hasEffectivePermission(user, "sales", "post");
    const data = await ctx.db.transaction(async (tx) => {
      // One authenticated snapshot prevents eight competing screen requests from starving a small serverless pool.
      const checks: SQL[] = [];
      const bound = (table: SQL, scope: SQL = sql`true`) => checks.push(sql`select count(*)::int count from (select 1 from ${table} where ${scope} limit 501) bounded`);
      const owner = (column: SQL) => user.role === "Sales Executive" ? sql`${column}=${user.id}` : sql`true`;
      if (customers) bound(sql`erp_private.customers`, owner(sql`assigned_sales_user_id`));
      if (sales) { bound(sql`erp_private.sales_orders`, owner(sql`owner_id`)); bound(sql`erp_private.deliveries`, owner(sql`owner_id`)); bound(sql`erp_private.products`); }
      if (financial) { bound(sql`erp_private.quotations`, sql`not archived and ${owner(sql`owner_id`)}`); bound(sql`erp_private.sales_invoices`, owner(sql`owner_id`)); bound(sql`erp_private.collections`, owner(sql`owner_id`)); }
      if (collect) bound(sql`erp_private.cash_accounts`);
      if (checks.length && (await tx.execute<{ count: number }>(sql.join(checks, sql` union all `))).rows.some((row) => row.count > 500)) throw new HttpError(422, "This Sales reference set exceeds 500 records. Paginated sales lists must be enabled before extending this screen; no records were silently omitted.");
      const customerRows = customers ? await readCustomers(tx, user) : [];
      const orders = sales ? await readOrders(tx, user) : []; const deliveries = sales ? await readDeliveries(tx, user) : [];
      return { customers: customerRows, orders: user.role === "Warehouse Manager" ? orders.map(restrictOrderFinancials) : orders, deliveries: user.role === "Warehouse Manager" ? deliveries.map(restrictDeliveryFinancials) : deliveries,
        quotations: financial ? await readQuotations(tx, user) : [], invoices: financial ? await readInvoices(tx, user) : [], collections: financial ? await readCollections(tx, user) : [],
        products: sales ? await tx.select().from(products).orderBy(products.code) : [], accounts: collect ? (await readAccounts(tx)).filter((row) => row.active).map((row) => ({ ...row, balance: "Restricted" })) : [] };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Role-scoped Sales screen loaded from one consistent snapshot" });
  });
  return router;
}
