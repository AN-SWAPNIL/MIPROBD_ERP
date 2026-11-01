import { Router } from "express";
import { inArray, sql, type SQL } from "drizzle-orm";
import { products } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { salesPageInput, type SalesKind } from "../../src/domains/sales/pageContracts.js";
import { businessDate } from "../../src/lib/date.js";
import { identity, type Context } from "../foundation/context.js";
import { assertAllowed } from "../foundation/errors.js";
import { restrictDeliveryFinancials, restrictOrderFinancials } from "../salesWorkspace.js";
import { readCustomers, readOrders, readQuotations } from "./records.js";
import { readCollections, readDeliveries, readInvoices } from "./posting-records.js";

const tables: Record<SalesKind, SQL> = {
  customers: sql`erp_private.customers`, quotations: sql`erp_private.quotations`, orders: sql`erp_private.sales_orders`, deliveries: sql`erp_private.deliveries`, invoices: sql`erp_private.sales_invoices`, collections: sql`erp_private.collections`, products: sql`erp_private.products`, accounts: sql`erp_private.cash_accounts`
};
const searchColumns: Record<SalesKind, SQL> = {
  customers: sql`concat_ws(' ',r.name,r.phone,r.email,r.territory,r.type)`,
  quotations: sql`concat_ws(' ',r.quotation_number,r.snapshot->>'customerName',r.remarks,(select string_agg(concat_ws(' ',l.product_code,l.product_name),' ') from erp_private.quotation_lines l where l.quotation_id=r.id))`,
  orders: sql`concat_ws(' ',r.order_number,r.snapshot->>'customerName',r.instructions->>'deliveryInstruction')`,
  deliveries: sql`concat_ws(' ',r.challan_number,r.customer_name,r.receiver_name,(select string_agg(concat_ws(' ',l.product_code,l.product_name,l.batch_number),' ') from erp_private.delivery_lines l where l.delivery_id=r.id))`,
  invoices: sql`concat_ws(' ',r.invoice_number,r.snapshot->>'customerName',r.remarks)`, collections: sql`concat_ws(' ',r.receipt_number,r.customer_name,r.reference_number)`,
  products: sql`concat_ws(' ',r.code,r.name,r.family,r.variant)`, accounts: sql`concat_ws(' ',r.name,r.type)`
};
export function assertSalesKind(user: User, kind: SalesKind) {
  if (kind === "customers") return assertAllowed(hasEffectivePermission(user, "customers") && user.role !== "Warehouse Manager");
  assertAllowed(hasEffectivePermission(user, "sales"));
  if (["quotations", "invoices", "collections", "accounts"].includes(kind)) assertAllowed(user.role !== "Warehouse Manager");
  if (kind === "accounts") assertAllowed(hasEffectivePermission(user, "sales", "post"));
}
function ownerScope(user: User, kind: SalesKind) {
  if (user.role !== "Sales Executive" || kind === "products" || kind === "accounts") return sql`true`;
  return kind === "customers" ? sql`r.assigned_sales_user_id=${user.id}` : sql`r.owner_id=${user.id}`;
}
async function readRows(tx: Transaction, user: User, kind: SalesKind, ids: string[], asOf: string): Promise<Record<string, unknown>[]> {
  if (!ids.length) return [];
  if (kind === "customers") return readCustomers(tx, user, undefined, ids);
  if (kind === "quotations") return readQuotations(tx, user, undefined, ids);
  if (kind === "orders") { const rows = await readOrders(tx, user, undefined, ids); return user.role === "Warehouse Manager" ? rows.map(restrictOrderFinancials) : rows; }
  if (kind === "deliveries") { const rows = await readDeliveries(tx, user, { ids }); return user.role === "Warehouse Manager" ? rows.map(restrictDeliveryFinancials) : rows; }
  if (kind === "invoices") {
    const rows = await readInvoices(tx, user, { ids });
    const balances = (await tx.execute<{ id: string; due: string }>(sql`select invoice_id id,sum(debit-credit)::text due from erp_private.customer_entries where invoice_id in (${sql.join(ids.map((id) => sql`${id}`), sql`,`)}) and date<=${asOf}::date group by invoice_id`)).rows;
    return rows.map((row) => ({ ...row, availableDue: balances.find((b) => b.id === row.id)?.due ?? "0.00" }));
  }
  if (kind === "collections") return readCollections(tx, user, { ids });
  if (kind === "products") return tx.select().from(products).where(inArray(products.id, ids));
  return (await tx.execute<Record<string, unknown>>(sql`select id,name,type,account_number "accountNumber",active,version,'Restricted' balance from erp_private.cash_accounts where id in (${sql.join(ids.map((id) => sql`${id}`), sql`,`)})`)).rows;
}
export async function readSalesPage(tx: Transaction, user: User, q: ReturnType<typeof salesPageInput.parse>) {
  assertSalesKind(user, q.kind);
  const filters: SQL[] = [ownerScope(user, q.kind)];
  if (q.kind === "quotations") filters.push(sql`not r.archived`);
  if (q.kind === "accounts" && q.accountType) filters.push(sql`r.type=${q.accountType}`);
  if (q.customerId && ["quotations", "orders", "invoices", "deliveries", "collections"].includes(q.kind)) filters.push(sql`r.customer_id=${q.customerId}`);
  if (q.orderId && ["invoices", "deliveries", "collections"].includes(q.kind)) filters.push(sql`r.order_id=${q.orderId}`);
  if (q.activeOnly === "true") {
    if (["customers", "products", "accounts"].includes(q.kind)) filters.push(sql`r.active`);
    if (q.kind === "orders") filters.push(sql`r.status not in('Cancelled','Delivered')`);
    if (q.kind === "invoices") filters.push(sql`r.status='Approved'`);
  }
  const source = tables[q.kind]; const scope = sql.join(filters, sql` and `);
  const pattern = `%${q.search.replace(/[\\%_]/g, "\\$&")}%`;
  const where = sql`${scope} and (${q.search}='' or ${searchColumns[q.kind]} ilike ${pattern})`;
  const [{ count }] = (await tx.execute<{ count: number }>(sql`select count(*)::int count from ${source} r where ${where}`)).rows;
  const order = ["customers", "products", "accounts"].includes(q.kind) ? sql`r.name,r.id` : sql`r.date desc,r.id desc`;
  const ids = (await tx.execute<{ id: string }>(sql`select r.id from ${source} r where ${where} order by ${order} limit ${q.pageSize} offset ${(q.page-1)*q.pageSize}`)).rows.map((r) => r.id);
  const selected = q.selectedId ? (await tx.execute<{ id: string }>(sql`select r.id from ${source} r where ${scope} and r.id=${q.selectedId}`)).rows.map((r) => r.id) : [];
  const rows = await readRows(tx, user, q.kind, [...new Set([...ids, ...selected])], q.asOf ?? businessDate());
  const byId = new Map(rows.map((row) => [row.id, row]));
  return { rows: ids.map((id) => byId.get(id)!).filter(Boolean), selected: selected.length ? byId.get(selected[0]) ?? null : null, total: count, page: q.page, pageSize: q.pageSize };
}
export function createSalesPagesRouter(ctx: Context) {
  const router = Router();
  router.get("/sales/page", async (req, res) => {
    const q = salesPageInput.parse(req.query); const user = identity(res).user;
    const data = await ctx.db.transaction((tx) => readSalesPage(tx, user, q), { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Scoped sales page; totals include every matching record" });
  });
  router.get("/sales/summary", async (_req, res) => {
    const user = identity(res).user; assertAllowed(hasEffectivePermission(user, "sales") || hasEffectivePermission(user, "customers"));
    const customerAccess = hasEffectivePermission(user, "customers") && user.role !== "Warehouse Manager";
    const financial = hasEffectivePermission(user, "sales") && user.role !== "Warehouse Manager";
    const sales = hasEffectivePermission(user, "sales");
    const data = await ctx.db.transaction(async (tx) => {
      const [row] = (await tx.execute<{ customers: number; openOrders: number; due: string | null; collected: string | null }>(sql`select
        ${customerAccess ? sql`(select count(*)::int from erp_private.customers r where ${ownerScope(user, "customers")})` : sql`0`} customers,
        ${sales ? sql`(select count(*)::int from erp_private.sales_orders r where ${ownerScope(user, "orders")} and status not in('Delivered','Cancelled'))` : sql`0`} "openOrders",
        ${customerAccess ? sql`(select coalesce(sum(e.debit-e.credit),0)::text from erp_private.customer_entries e join erp_private.customers r on r.id=e.customer_id where ${ownerScope(user, "customers")})` : sql`null::text`} due,
        ${financial ? sql`(select coalesce(sum(r.amount),0)::text from erp_private.collections r where ${ownerScope(user, "collections")} and r.status='Posted')` : sql`null::text`} collected`)).rows;
      return row;
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Whole-scope summary, independent of the visible page" });
  });
  return router;
}
