import { sql } from "drizzle-orm";
import type { User } from "../../src/types/index.js";
import { dim, money, raw, text, type Query, type Spec } from "./common.js";

export function partySpec(id: string, user: User, q: Query): Spec | undefined {
  if (["customer-list", "customer-dues"].includes(id)) {
    const scope = user.role === "Sales Executive" ? sql`c.assigned_sales_user_id=${user.id}` : sql`true`;
    const base = sql`select c.id customer_id, c.name customer, c.address, c.phone, c.contact_person contact, c.territory,
      c.assigned_sales_user_id salesperson_id, coalesce(concat_ws(' | ',e.name,e.employee_code),'Unassigned') salesperson, case when c.active then 'Active' else 'Inactive' end status,
      coalesce((select sum(j.debit-j.credit) from erp_private.customer_entries j where j.customer_id=c.id and j.date<${q.from}::date),0) opening,
      coalesce((select sum(j.debit-j.credit) from erp_private.customer_entries j where j.customer_id=c.id and j.date<=${q.to}::date),0) due,
      coalesce((select sum(j.debit-j.credit) from erp_private.customer_entries j where j.customer_id=c.id and j.invoice_id is not null and j.collection_id is null and j.type in ('Invoice','Reversal','Return Credit') and j.date between ${q.from}::date and ${q.to}::date),0) sales,
      coalesce((select sum(j.credit-j.debit) from erp_private.customer_entries j where j.customer_id=c.id and (j.collection_id is not null or j.type='Return Refund') and j.date between ${q.from}::date and ${q.to}::date),0) collected
      from erp_private.customers c left join erp_private.employees e on e.id=c.assigned_sales_user_id where ${scope}`;
    return { base, dimensions: { customer: dim("customer_id", "customer"), salesperson: dim("salesperson_id", "salesperson"), territory: dim("territory"), status: dim("status") }, basis: "Current customer directory/assignments; opening balance is before the start date and closing due includes every customer-journal posting through the end date. Period sales and receipts include dated reversals.", result: sql`select * from scoped ${id === "customer-dues" ? raw("where due<>0") : raw("")} order by customer,customer_id`,
      columns: [text("customer", "Customer"), text("address", "Address"), text("phone", "Phone"), text("contact", "Contact"), text("salesperson", "Assigned Salesperson"), text("territory", "Territory"), text("status", "Status"), money("opening", "Opening Due"), money("sales", "Period Net Sales"), money("collected", "Period Net Collection"), money("due", "Due at End Date")] };
  }
  if (["customer-ledger", "salesman-ledger"].includes(id)) {
    const salesman = id === "salesman-ledger";
    const owner = salesman ? sql`coalesce(i.owner_id,co.owner_id,c.assigned_sales_user_id)` : sql`c.assigned_sales_user_id`;
    const scope = user.role === "Sales Executive" ? sql`${owner}=${user.id}` : sql`true`;
    const base = sql`select j.date, j.created_at, j.id, j.customer_id, c.name customer, ${owner} salesperson_id, concat_ws(' | ',e.name,e.employee_code) salesperson, j.type posting, j.reference, j.debit, j.credit, j.remarks
      from erp_private.customer_entries j join erp_private.customers c on c.id=j.customer_id
      left join erp_private.sales_invoices i on i.id=j.invoice_id left join erp_private.collections co on co.id=j.collection_id
      left join erp_private.employees e on e.id=${owner} where j.date<=${q.to}::date and ${scope}`;
    const partition = salesman ? "salesperson_id,customer_id" : "customer_id";
    return { base, dimensions: { customer: dim("customer_id", "customer"), salesperson: dim("salesperson_id", "salesperson") }, basis: salesman ? "Business-date customer postings attributed to their invoice/receipt owner. Running balances are separate for each salesperson/customer; older balances are carried into an opening row." : "Assigned customer history, with an explicit opening row and a running due per customer. Existing journal entries, including reversals, are never removed from historical statements.",
      result: sql`with entries as (
        select ${q.from}::date date, null::timestamptz created_at, ''::text id, customer_id, customer, salesperson_id, salesperson, 'Opening'::text posting, 'Brought forward'::text reference, greatest(sum(debit-credit),0) debit, greatest(-sum(debit-credit),0) credit, ''::text remarks, 0 sort_order from scoped where date<${q.from}::date group by customer_id,customer,salesperson_id,salesperson having sum(debit-credit)<>0
        union all select *, 1 sort_order from scoped where date>=${q.from}::date
      ) select *, sum(debit-credit) over(partition by ${raw(partition)} order by date,sort_order,created_at nulls first,id rows unbounded preceding) balance from entries order by customer,salesperson,date,sort_order,created_at nulls first,id`,
      columns: [text("date", "Date"), text("customer", "Customer"), ...(salesman ? [text("salesperson", "Salesperson")] : []), text("posting", "Posting"), text("reference", "Reference"), money("debit", "Debit"), money("credit", "Credit"), money("balance", "Running Due", false), text("remarks", "Remarks")] };
  }
  if (id === "supplier-list") return {
    base: sql`select s.id supplier_id,s.name supplier,s.country,s.contact_person contact,s.phone,s.email,case when s.active then 'Active' else 'Inactive' end status,
      coalesce((select sum((case when x.entry_type='Obligation' then 1 else 0 end)*x.amount) from erp_private.supplier_settlements x where x.supplier_id=s.id and x.date<=${q.to}::date and (x.reversal_date is null or x.reversal_date>${q.to}::date)),0) obligations,
      coalesce((select sum((case when x.entry_type='Payment' then 1 else 0 end)*x.amount) from erp_private.supplier_settlements x where x.supplier_id=s.id and x.date<=${q.to}::date and (x.reversal_date is null or x.reversal_date>${q.to}::date)),0) paid,
      coalesce((select sum(x.amount) from erp_private.supplier_settlements x where x.supplier_id=s.id and x.entry_type='Credit' and x.date<=${q.to}::date),0) supplier_credit,
      coalesce((select sum(x.amount) from erp_private.supplier_settlements x where x.supplier_id=s.id and x.entry_type='Opening Advance' and x.date<=${q.to}::date),0) opening_advance from erp_private.suppliers s`,
    dimensions: { supplier: dim("supplier_id", "supplier"), status: dim("status") }, result: raw("select *, greatest(obligations-paid-opening_advance-supplier_credit,0) unpaid, greatest(paid+opening_advance+supplier_credit-obligations,0) advance from scoped order by supplier,supplier_id"), basis: "Supplier obligations, actual period payments and historical opening advances through the end date. An opening advance reduces payable but does not create a new cash payment. Reversals take effect on their reversal date.",
    columns: [text("supplier", "Supplier"), text("country", "Country"), text("contact", "Contact"), text("phone", "Phone"), text("email", "Email"), text("status", "Status"), money("obligations", "Net Obligations"), money("paid", "Net Paid"), money("opening_advance", "Opening Advance"), money("supplier_credit", "Supplier Credit"), money("unpaid", "Unpaid"), money("advance", "Supplier Advance")]
  };
  if (id === "supplier-statement") return {
    base: sql`select v.date,x.created_at,x.id,x.supplier_id,s.name supplier,x.reference,case when v.sign=-1 then 'Reversal: '||x.entry_type else x.entry_type end posting,
      case when x.entry_type='Obligation' then x.amount*v.sign else 0 end debit,case when x.entry_type in ('Payment','Opening Advance','Credit') then x.amount*v.sign else 0 end credit,
      coalesce(x.account_name,'') account, x.payment_reference,case when v.sign=-1 then x.reversal_reason else x.notes end notes,v.sign
      from erp_private.supplier_settlements x join erp_private.suppliers s on s.id=x.supplier_id cross join lateral(select x.date,1 sign union all select x.reversal_date,-1 where x.reversal_date is not null) v where v.date<=${q.to}::date`,
    dimensions: { supplier: dim("supplier_id", "supplier") }, basis: "Supplier obligations debit the statement; payments credit it. Opening balances carry earlier posted events, and dated reversals offset their originals. A negative balance is a supplier advance.",
    result: sql`with entries as (
      select ${q.from}::date date,null::timestamptz created_at,''::text id,supplier_id,supplier,'Brought forward'::text reference,'Opening'::text posting,greatest(sum(debit-credit),0) debit,greatest(-sum(debit-credit),0) credit,''::text account,''::text payment_reference,''::text notes,0 sign from scoped where date<${q.from}::date group by supplier_id,supplier having sum(debit-credit)<>0
      union all select * from scoped where date>=${q.from}::date
    ) select *,sum(debit-credit) over(partition by supplier_id order by date,created_at nulls first,id,sign desc rows unbounded preceding) balance from entries order by supplier,date,created_at nulls first,id,sign desc`,
    columns: [text("date", "Date"), text("supplier", "Supplier"), text("reference", "Reference"), text("posting", "Posting"), text("account", "Account"), text("payment_reference", "Payment Reference"), money("debit", "Obligations / Reversals"), money("credit", "Payments / Reversals"), money("balance", "Running Payable", false), text("notes", "Notes")]
  };
  return undefined;
}
