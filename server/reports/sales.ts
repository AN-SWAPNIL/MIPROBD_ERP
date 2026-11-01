import { sql } from "drizzle-orm";
import type { User } from "../../src/types/index.js";
import { between, count, dim, money, own, period, qty, raw, text, type Query, type Spec } from "./common.js";

function invoiceFacts(user: User, q: Query) {
  return sql`select v.date, v.sign, i.id invoice_id, i.invoice_number invoice, i.customer_id, cu.name customer,
    i.owner_id salesperson_id, concat_ws(' | ', e.name, e.employee_code) salesperson, i.order_id, o.order_number,
    l.id line_id, l.product_id, p.code code, p.name product, p.family, p.unit,
    l.quantity * v.sign quantity, l.unit_price rate, l.discount * v.sign discount, l.line_total * v.sign sales, coalesce(l.cost_bdt,dl.cost_bdt) * v.sign cogs,
    case when v.sign = 1 then 'Invoice' else 'Cancellation' end event
    from erp_private.sales_invoices i join erp_private.invoice_lines l on l.invoice_id = i.id
    join erp_private.delivery_lines dl on dl.id = l.delivery_line_id join erp_private.products p on p.id = l.product_id
    join erp_private.customers cu on cu.id = i.customer_id join erp_private.employees e on e.id = i.owner_id
    join erp_private.sales_orders o on o.id = i.order_id
    cross join lateral (select i.date, 1 sign union all select (i.cancelled_at at time zone 'Asia/Dhaka')::date, -1 where i.cancelled_at is not null) v
    where i.approved_at is not null and ${between(sql`v.date`, q)} and ${own(user, "i")}
    union all select r.posted_date,0,i.id,i.invoice_number,i.customer_id,cu.name,i.owner_id,concat_ws(' | ',e.name,e.employee_code),i.order_id,o.order_number,l.id,l.snapshot->>'productId',p.code,p.name,p.family,p.unit,-l.quantity,il.unit_price,-l.discount_bdt,-l.credit_bdt,-l.cost_bdt,'Return Credit'
      from erp_private.customer_returns r join erp_private.customer_return_lines l on l.return_id=r.id join erp_private.sales_invoices i on i.id=r.invoice_id join erp_private.invoice_lines il on il.invoice_id=i.id and il.delivery_line_id=l.delivery_line_id join erp_private.products p on p.id=il.product_id join erp_private.customers cu on cu.id=r.customer_id join erp_private.employees e on e.id=i.owner_id join erp_private.sales_orders o on o.id=r.order_id where r.state='Posted' and ${between(sql`r.posted_date`,q)} and ${own(user,"i")}`;
}
const dimensions = { customer: dim("customer_id", "customer"), salesperson: dim("salesperson_id", "salesperson"), order: dim("order_id", "order_number"), product: dim("product_id", "product"), family: dim("family") };
const journalBasis = "Business-date postings: approved invoices add revenue; cancellation and inspected return credits subtract saved revenue/cost on their own posting dates. Returns do not subtract another invoice count. Drafts and pre-invoice refusals contribute no revenue.";

export function salesSpec(id: string, user: User, q: Query): Spec | undefined {
  const facts = invoiceFacts(user, q);
  if (["sales-summary", "sales-by-month", "sales-by-salesperson", "sales-by-customer"].includes(id)) {
    const receiptScope = user.role === "Sales Executive" ? sql`coalesce(i.owner_id, c.owner_id) = ${user.id}` : sql`true`;
    const base = sql`select date, invoice_id, customer_id, customer, salesperson_id, salesperson, sum(quantity) quantity, sum(sales) sales, sign invoices, 0::numeric collections
      from (${facts}) f group by date, invoice_id, customer_id, customer, salesperson_id, salesperson, sign
      union all select ce.date, null, c.customer_id, cu.name, coalesce(i.owner_id, c.owner_id), concat_ws(' | ', e.name, e.employee_code), 0, 0, 0, ce.credit - ce.debit
      from erp_private.customer_entries ce join erp_private.collections c on c.id = ce.collection_id
      join erp_private.customers cu on cu.id = c.customer_id left join erp_private.sales_invoices i on i.id = ce.invoice_id
      join erp_private.employees e on e.id = coalesce(i.owner_id, c.owner_id)
      where ${between(sql`ce.date`, q)} and ${receiptScope}
      union all select ce.date,null,ce.customer_id,cu.name,i.owner_id,concat_ws(' | ',e.name,e.employee_code),0,0,0,-ce.debit from erp_private.customer_entries ce join erp_private.sales_invoices i on i.id=ce.invoice_id join erp_private.customers cu on cu.id=ce.customer_id join erp_private.employees e on e.id=i.owner_id where ce.type='Return Refund' and ${between(sql`ce.date`,q)} and ${own(user,"i")}`;
    const group = id === "sales-by-salesperson" ? raw("salesperson_id, salesperson") : id === "sales-by-customer" ? raw("customer_id, customer") : period(id === "sales-by-month" ? { ...q, grouping: "Monthly" } : q);
    const label = id === "sales-by-salesperson" ? raw("salesperson") : id === "sales-by-customer" ? raw("customer") : sql`${group} as date`;
    const key = id === "sales-by-salesperson" ? "salesperson" : id === "sales-by-customer" ? "customer" : "date";
    return { base, dimensions, basis: `${journalBasis} Collections use allocated customer-journal credits less their dated reversals, attributed to the invoice owner.`, notes: ["Summary quantities may combine product units; use the item/family report for unit-specific quantities."], result: sql`select ${label}, sum(invoices) invoices, count(distinct customer_id) customers, sum(quantity) quantity, sum(sales) sales, sum(collections) collections from scoped group by ${group} order by ${sql.identifier(key)}`,
      columns: [text(key, key === "date" ? id === "sales-by-month" ? "Month" : q.grouping : key === "customer" ? "Customer" : "Salesperson"), count("invoices", "Net Invoices"), count("customers", "Active Customers"), qty("quantity", "Net Quantity"), money("sales", "Net Invoiced Sales"), money("collections", "Net Collection")] };
  }
  if (["sales-sheet", "sales-by-product", "sales-by-family", "gross-profit-product"].includes(id)) {
    if (id === "sales-sheet") return { base: facts, dimensions, basis: journalBasis, result: raw("select * from scoped order by date, invoice, line_id, sign desc"), columns: [text("date", "Date"), text("invoice", "Invoice"), text("order_number", "Order"), text("customer", "Customer"), text("salesperson", "Salesperson"), text("event", "Posting"), text("code", "Code"), text("product", "Product"), text("unit", "Unit"), qty("quantity", "Quantity"), money("rate", "Unit Price", false), money("discount", "Discount"), money("sales", "Net Sales")] };
    const family = id === "sales-by-family";
    return { base: facts, dimensions, basis: journalBasis, result: sql`select ${raw(family ? "family,unit" : "product_id, code, product, unit")}, sum(quantity) quantity, sum(sales) sales, sum(cogs) cogs, sum(sales-cogs) profit from scoped group by ${raw(family ? "family,unit" : "product_id, code, product, unit")} order by ${raw(family ? "family,unit" : "code, product_id")}`,
      columns: [...(family ? [text("family", "Family"), text("unit", "Unit")] : [text("code", "Code"), text("product", "Product"), text("unit", "Unit")]), qty("quantity", "Net Quantity"), money("sales", "Net Invoiced Sales"), ...(id === "gross-profit-product" ? [money("cogs", "Invoiced Batch Cost"), money("profit", "Invoiced Gross Profit")] : [])], notes: id === "gross-profit-product" ? ["Margin uses the saved cost of each invoiced delivery line. Invoice cancellation reverses reported margin, not the physical dispatch or inventory."] : [] };
  }
  if (id === "invoice-register") return {
    base: sql`select i.date, i.invoice_number invoice, i.customer_id, cu.name customer, i.owner_id salesperson_id, concat_ws(' | ', e.name, e.employee_code) salesperson, i.order_id, o.order_number, i.status, i.subtotal, i.discount_total discount, i.total value from erp_private.sales_invoices i join erp_private.customers cu on cu.id=i.customer_id join erp_private.employees e on e.id=i.owner_id join erp_private.sales_orders o on o.id=i.order_id where ${between(sql`i.date`, q)} and ${own(user, "i")}`,
    result: raw("select * from scoped order by date, invoice"), dimensions: { ...dimensions, status: dim("status") }, basis: "Documents dated in the selected period, with their current lifecycle status. Document values include drafts/cancellations and are not a revenue total.",
    columns: [text("date", "Date"), text("invoice", "Invoice"), text("order_number", "Order"), text("customer", "Customer"), text("salesperson", "Salesperson"), text("status", "Current Status"), money("subtotal", "Subtotal", false), money("discount", "Discount", false), money("value", "Document Value", false)]
  };
  if (["sales-order-register", "order-fulfilment"].includes(id)) {
    const base = sql`select o.id order_id, o.order_number, o.date, o.customer_id, cu.name customer, o.owner_id salesperson_id, concat_ws(' | ', e.name, e.employee_code) salesperson, o.status, o.total order_value,
      l.id line_id, l.product_id, p.code code, p.name product, p.unit, l.quantity ordered,
      coalesce((select sum(dl.quantity) from erp_private.delivery_lines dl join erp_private.deliveries d on d.id=dl.delivery_id where dl.order_line_id=l.id and d.date<=${q.to}::date),0) delivered,
      coalesce((select sum(rl.quantity) from erp_private.customer_return_lines rl join erp_private.customer_returns r on r.id=rl.return_id join erp_private.delivery_lines dl on dl.id=rl.delivery_line_id where dl.order_line_id=l.id and r.state='Posted' and r.kind='Uninvoiced Refusal' and r.posted_date<=${q.to}::date),0) refused,
      coalesce((select sum(il.quantity) from erp_private.invoice_lines il join erp_private.sales_invoices i on i.id=il.invoice_id join erp_private.delivery_lines dl on dl.id=il.delivery_line_id where dl.order_line_id=l.id and i.approved_at is not null and i.date<=${q.to}::date and (i.cancelled_at is null or (i.cancelled_at at time zone 'Asia/Dhaka')::date>${q.to}::date)),0) invoiced,
      coalesce((select sum(ce.debit-ce.credit) from erp_private.customer_entries ce where ce.order_id=o.id and ce.date<=${q.to}::date),0) due
      from erp_private.sales_orders o join erp_private.order_lines l on l.order_id=o.id join erp_private.products p on p.id=l.product_id
      join erp_private.customers cu on cu.id=o.customer_id join erp_private.employees e on e.id=o.owner_id where ${between(sql`o.date`, q)} and ${own(user, "o")}`;
    return { base, dimensions: { ...dimensions, status: dim("status") }, basis: "Orders created in the selected period; fulfilment and receivable balance include postings through the end date. Order status is current, not a reconstructed historical status.",
      result: id === "order-fulfilment" ? raw("select *, greatest(ordered-delivered,0) remaining, greatest(delivered-refused-invoiced,0) uninvoiced from scoped order by date, order_number, line_id") : raw("select date, order_number, customer, salesperson, status, max(order_value) value, sum(ordered) ordered, sum(delivered) delivered, sum(invoiced) invoiced, max(due) due from scoped group by order_id,date,order_number,customer,salesperson,status order by date,order_number"),
      columns: [text("date", "Order Date"), text("order_number", "Order"), text("customer", "Customer"), ...(id === "order-fulfilment" ? [text("code", "Code"), text("product", "Product"), text("unit", "Unit")] : [text("salesperson", "Salesperson"), text("status", "Current Status"), money("value", "Order Value")]), qty("ordered", "Ordered"), qty("delivered", "Gross Delivered"), qty("invoiced", "Approved Invoiced"), ...(id === "order-fulfilment" ? [qty("refused","Refused Before Invoice"),qty("remaining", "Remaining to Deliver"), qty("uninvoiced", "Accepted Not Invoiced")] : [money("due", "Due at End Date")])] };
  }
  if (["delivery-challan-register", "delivery-invoice-exceptions", "delivered-sales"].includes(id)) {
    const base = sql`select d.id delivery_id, d.date, d.challan_number challan, d.order_id, o.order_number, d.customer_id, cu.name customer, dl.id line_id, dl.product_id, p.code code, p.name product, p.unit, dl.quantity, dl.line_total value,
      case when not exists(select 1 from erp_private.delivery_lines accepted where accepted.delivery_id=d.id and accepted.quantity>coalesce((select sum(rl.quantity) from erp_private.customer_return_lines rl join erp_private.customer_returns r on r.id=rl.return_id where rl.delivery_line_id=accepted.id and r.state='Posted' and r.kind='Uninvoiced Refusal' and r.posted_date<=${q.to}::date),0)) then 'Not Required (Refused)' when exists(select 1 from erp_private.invoice_deliveries x join erp_private.sales_invoices i on i.id=x.invoice_id where x.delivery_id=d.id and i.approved_at is not null and i.date<=${q.to}::date and (i.cancelled_at is null or (i.cancelled_at at time zone 'Asia/Dhaka')::date>${q.to}::date)) then 'Invoiced' else 'Not Invoiced' end status
      from erp_private.deliveries d join erp_private.delivery_lines dl on dl.delivery_id=d.id join erp_private.products p on p.id=dl.product_id join erp_private.customers cu on cu.id=d.customer_id join erp_private.sales_orders o on o.id=d.order_id where ${between(sql`d.date`, q)} and ${own(user, "d")}`;
    const aggregate = id === "delivered-sales";
    return { base, dimensions: { ...dimensions, status: dim("status") }, basis: "Actual gross posted delivery challans in the period. Invoice coverage is evaluated through the end date; draft invoices do not count as invoiced and fully refused challans require no invoice. Gross delivery value is operational, not an additional financial sale.", result: aggregate ? raw("select product_id, code, product, unit, sum(quantity) quantity, sum(value) value from scoped group by product_id,code,product,unit order by code,product_id") : sql`select date, challan, order_number, customer, status, sum(quantity) quantity, sum(value) value from scoped ${id === "delivery-invoice-exceptions" ? raw("where status='Not Invoiced'") : raw("")} group by date, delivery_id, challan, order_number, customer, status order by date,challan`,
      columns: [...(aggregate ? [text("code", "Code"), text("product", "Product"), text("unit", "Unit")] : [text("date", "Date"), text("challan", "Challan"), text("order_number", "Order"), text("customer", "Customer"), text("status", "Invoice Coverage")]), qty("quantity", "Delivered Quantity"), money("value", "Delivered Value")] };
  }
  if (id === "collections") {
    const scope = user.role === "Sales Executive" ? sql`coalesce(i.owner_id,c.owner_id)=${user.id}` : sql`true`;
    return { base: sql`select ce.date, ce.id, c.receipt_number receipt, c.customer_id, cu.name customer, ce.order_id, o.order_number, i.invoice_number invoice, c.payment_mode mode, c.reference_number reference, ce.type posting, ce.credit-ce.debit amount
      from erp_private.customer_entries ce join erp_private.collections c on c.id=ce.collection_id join erp_private.customers cu on cu.id=c.customer_id left join erp_private.sales_invoices i on i.id=ce.invoice_id left join erp_private.sales_orders o on o.id=ce.order_id where ${between(sql`ce.date`,q)} and ${scope}
      union all select ce.date,ce.id,s.number,ce.customer_id,cu.name,ce.order_id,o.order_number,i.invoice_number,b.type,s.proof_reference,ce.type,-ce.debit from erp_private.customer_entries ce join erp_private.return_settlements s on s.id=ce.source_id join erp_private.cash_accounts b on b.id=s.account_id join erp_private.customers cu on cu.id=ce.customer_id join erp_private.sales_invoices i on i.id=ce.invoice_id join erp_private.sales_orders o on o.id=ce.order_id where ce.type='Return Refund' and ${between(sql`ce.date`,q)} and ${own(user,"i")}`,
      dimensions, result: raw("select * from scoped order by date,receipt,id"), basis: "One row per receipt allocation and reversal. Customer-wide receipts are split across their actual orders/invoices; signed amounts reconcile without counting a full receipt against every order.", columns: [text("date", "Date"), text("receipt", "Receipt"), text("customer", "Customer"), text("order_number", "Order"), text("invoice", "Invoice"), text("mode", "Mode"), text("posting", "Posting"), text("reference", "Reference"), money("amount", "Allocated Net Collection")] };
  }
  return undefined;
}
