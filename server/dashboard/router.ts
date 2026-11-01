import { Router } from "express";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import { dashboardPayload, type DashboardPayload } from "../../src/domains/dashboard/persistentContracts.js";
import { hasCapability, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { businessDate } from "../../src/lib/date.js";
import { identity, type Context } from "../foundation/context.js";
import { assertAllowed } from "../foundation/errors.js";
import { own, queryInput } from "../reports/common.js";
import { salesSpec } from "../reports/sales.js";
import { partySpec } from "../reports/parties.js";
import { marketingScope } from "../workforce/scope.js";

export const dashboardInput = z.object({ from: z.iso.date(), to: z.iso.date() }).strict().superRefine((v, ctx) => {
  if (v.from > v.to || v.to > businessDate() || Date.parse(v.to) - Date.parse(v.from) > 92 * 86400000)
    ctx.addIssue({ code: "custom", path: ["from"], message: "Choose at most 93 days, ending no later than today." });
});
export function dashboardAccess(user: User) {
  const financial = user.role !== "Warehouse Manager";
  return {
    sales: financial && hasEffectivePermission(user, "sales"), customers: financial && hasEffectivePermission(user, "customers") && (hasEffectivePermission(user, "sales") || hasEffectivePermission(user, "accounts")),
    accounts: financial && hasEffectivePermission(user, "accounts"), inventory: hasEffectivePermission(user, "inventory"),
    imports: hasEffectivePermission(user, "import"), marketing: hasEffectivePermission(user, "marketing"),
    profit: financial && hasEffectivePermission(user, "sales") && hasCapability(user, "view_profit")
  };
}
export async function readDashboard(tx: Transaction, user: User, period: z.infer<typeof dashboardInput>): Promise<DashboardPayload> {
  const access = dashboardAccess(user); const today = businessDate(); const q = queryInput.parse(period);
  const metrics: DashboardPayload["metrics"] = []; const queues: DashboardPayload["queues"] = [];
  let trend: DashboardPayload["trend"] = [];
  const metric = (id: string, label: string, value: string, format: "money" | "integer", basis: string, path: string) => metrics.push({ id, label, value, format, basis, path });
  const scalar = async (query: SQL) => (await tx.execute<{ value: string }>(query)).rows[0].value;
  async function queue(id: string, title: string, path: string, columns: DashboardPayload["queues"][number]["columns"], base: SQL, order: SQL) {
    const selected = sql.join(columns.map((c) => sql`coalesce(${sql.identifier(c.key)}::text,'') as ${sql.identifier(c.key)}`), sql`, `);
    const [data] = (await tx.execute<{ rows: Record<string, string>[]; total: string }>(sql`with source as (${base}) select (select count(*)::text from source) total, coalesce((select jsonb_agg(to_jsonb(r)) from (select ${selected} from source order by ${order} limit 8) r),'[]'::jsonb) rows`)).rows;
    queues.push({ id, title, path, columns, ...data }); return data.total;
  }
  const col = (key: string, label: string, format: "text" | "money" | "quantity" = "text") => ({ key, label, format });
  if (access.sales) {
    // Reuse report facts: approved invoices, dated cancellations and allocated receipt reversals.
    const sales = salesSpec("sales-summary", user, q)!;
    const [result] = (await tx.execute<{ sales: string; collections: string; trend: DashboardPayload["trend"] }>(sql`with scoped as (${sales.base}), summary as (${sales.result})
      select coalesce(sum(sales),0)::text sales,coalesce(sum(collections),0)::text collections,
      coalesce((select jsonb_agg(jsonb_build_object('date',d::date::text,'sales',coalesce(s.sales,0)::text,'collections',coalesce(s.collections,0)::text) order by d)
      from generate_series(${q.from}::date,${q.to}::date,interval '1 day') d left join summary s on s.date=d::date::text),'[]'::jsonb) trend from summary`)).rows;
    trend = result.trend;
    metric("sales", "Net Invoiced Sales", result.sales, "money", "Selected period; invoices less dated cancellations and return credits", "/backend/sales?view=orders");
    metric("collections", "Net Collections", result.collections, "money", "Selected period; allocated receipts less reversals and actual return refunds", "/backend/sales?view=collections");
    await queue("orders", "Orders to Fulfil", "/backend/sales?view=orders", [col("order_number", "Order"), col("customer", "Customer"), col("status", "Status")],
      sql`select o.id,o.order_number,c.name customer,o.status,o.date from erp_private.sales_orders o join erp_private.customers c on c.id=o.customer_id where o.status in ('Placed','Ready','Partially Delivered') and ${own(user, "o")}`, sql`date,id`);
  }
  if (access.customers) {
    const spec = partySpec("customer-dues", user, q)!;
    const path = access.sales ? "/backend/sales?view=customers" : "/backend/accounts?view=dues";
    metric("receivables", "Customer Receivables", await scalar(sql`with base as (${spec.base}) select coalesce(sum(greatest(due,0)),0)::text value from base`), "money", "Through selected end date; credits shown separately in Reports", path);
    await queue("dues", "Customer Dues", path, [col("customer", "Customer"), col("phone", "Phone"), col("due", "Due (BDT)", "money")], sql`select * from (${spec.base}) b where due>0`, sql`due desc,customer_id`);
  }
  if (access.accounts) {
    metric("cash-bank", "Cash & Bank Balance", await scalar(sql`select coalesce(sum(case when direction='In' then amount else -amount end),0)::text value from erp_private.account_transactions where date<=${q.to}::date`), "money", "Posted account journal through selected end date; no invented openings", "/backend/accounts?view=accounts");
    await queue("expenses", "Recent Operating Expenses", "/backend/accounts?view=expenses", [col("date", "Date"), col("reference", "Reference"), col("category", "Category"), col("amount", "Amount (BDT)", "money"), col("status", "Status")],
      sql`select e.id,e.date,t.voucher_number reference,e.category_name category,e.amount,e.status from erp_private.expenses e join erp_private.account_transactions t on t.id=e.transaction_id where e.date between ${q.from}::date and ${q.to}::date`, sql`date desc,id`);
  }
  if (access.profit) {
    const spec = salesSpec("gross-profit-product", user, q)!;
    metric("gross-profit", "Invoiced Gross Profit", await scalar(sql`with scoped as (${spec.base}) select coalesce(sum(sales-cogs),0)::text value from scoped`), "money", "Selected period; saved invoiced batch cost, before operating expenses", hasEffectivePermission(user,"reports") ? "/backend/reports/gross-profit-product" : "/backend/sales?view=orders");
  }
  if (access.imports) {
    const total = await queue("imports", "Active Import Pipeline", "/backend/imports", [col("reference", "Import / LC / TT"), col("supplier", "Supplier"), col("status", "Stage")],
      sql`select id,coalesce(nullif(commercial->>'lcNumber',''),nullif(commercial->>'ttReference',''),draft_reference) reference,supplier_name supplier,status,created_at from erp_private.import_cases where status not in ('Received','Closed','Cancelled')`, sql`created_at,id`);
    metric("imports", "Active Imports", total, "integer", "Current pipeline; excludes received, closed and cancelled cases", "/backend/imports");
  }
  if (access.inventory) {
    metric("stocked-products", "Products in Stock", await scalar(sql`select count(distinct product_id)::text value from erp_private.stock_batches where quantity_available>0`), "integer", "Current physical stock; unlike units are not added together", "/backend/inventory");
    const expiring = await queue("expiry", "Expiry Attention", "/backend/inventory?view=batches", [col("product", "Product"), col("batch_number", "Batch"), col("expiry_date", "Expiry"), col("quantity", "Available", "quantity"), col("unit", "Unit")],
      sql`select b.id,p.name product,b.batch_number,b.expiry_date,b.quantity_available quantity,p.unit from erp_private.stock_batches b join erp_private.products p on p.id=b.product_id where b.quantity_available>0 and b.expiry_date<=${today}::date+92`, sql`expiry_date,id`);
    metric("expiry", "Batches Expired / Due Within 92 Days", expiring, "integer", "Current remaining stock; includes already expired batches", "/backend/inventory?view=batches");
  }
  if (access.marketing) {
    const count = await queue("follow-ups", "Follow-ups Due", "/backend/sales?view=marketing", [col("employee", "Employee"), col("subject", "Customer / Lead"), col("due", "Due (Dhaka)"), col("purpose", "Purpose")],
      sql`select f.id,e.name employee,f.subject,to_char(f.due_at at time zone 'Asia/Dhaka','YYYY-MM-DD HH24:MI') due,f.purpose,f.due_at from erp_private.marketing_follow_ups f join erp_private.employees e on e.id=f.assigned_to where f.status='Pending' and (f.due_at at time zone 'Asia/Dhaka')::date<=${today}::date and ${marketingScope(user, sql`f.assigned_to`)}`, sql`due_at,id`);
    metric("follow-ups", "Follow-ups Due", count, "integer", "Current own/team scope; due today or overdue", "/backend/sales?view=marketing");
    const visits = await queue("visits", "Recent Field Check-ins", "/backend/sales?view=marketing", [col("employee", "Employee"), col("reference", "Reference"), col("subject", "Customer / Lead"), col("review", "Review")],
      sql`select v.id,e.name employee,v.reference,v.subject,v.review,v.received_at from erp_private.field_visits v join erp_private.employees e on e.id=v.employee_id where (v.received_at at time zone 'Asia/Dhaka')::date between ${q.from}::date and ${q.to}::date and v.status<>'Voided' and ${marketingScope(user, sql`v.employee_id`)}`, sql`received_at desc,id`);
    metric("visits", "Recorded Field Check-ins", visits, "integer", "Selected period; evidence-assisted, not attendance proof", "/backend/sales?view=marketing");
  }
  return dashboardPayload.parse({ generatedAt: new Date().toISOString(), ...period, operationalDate: today, metrics: metrics.slice(0, 6), trend, queues,
    notes: ["Money uses posted business-date journals, including reversals. Orders and draft invoices are not revenue.", "Pipeline, stock, expiry and follow-up queues are current; financial totals and check-ins use the selected dates.", "Missing approved opening data is not estimated. This dashboard is not a Balance Sheet."] });
}

export function createDashboardRouter(ctx: Context) {
  const router = Router();
  router.get("/dashboard", async (req, res) => {
    const user = identity(res).user; assertAllowed(hasEffectivePermission(user, "dashboard"));
    const today = businessDate(); const period = dashboardInput.parse({ from: today.slice(0, 7) + "-01", to: today, ...req.query });
    const data = await ctx.db.transaction((tx) => readDashboard(tx, user, period), { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Role-scoped dashboard loaded from saved journals" });
  });
  return router;
}
