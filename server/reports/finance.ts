import { sql } from "drizzle-orm";
import { between, dim, money, raw, text, type Query, type Spec } from "./common.js";

export function financeSpec(id: string, q: Query): Spec | undefined {
  const expenseIds = ["daily-expenditure", "monthly-category", "expense-by-person", "expense-by-unit", "monthly-expense", "ta-da"];
  if (expenseIds.includes(id)) {
    const base = sql`select v.date,x.id,x.category_id,x.category_name category,x.employee_id,coalesce(x.attribution->>'employee',x.attribution->>'expenseForName','Company / General') employee,
      x.expense_for unit,x.paid_from_account_id account_id,a.name account,x.subtype,
      x.amount*v.sign amount,coalesce(x.ta_amount,0)*v.sign ta,coalesce(x.da_amount,0)*v.sign da,
      case when v.sign=-1 then 'Reversal' else 'Expense' end posting,case when v.sign=-1 then x.reversal_reason else x.remarks end remarks,x.entered_by_name entered_by,v.sign
      from erp_private.expenses x join erp_private.cash_accounts a on a.id=x.paid_from_account_id
      cross join lateral(select x.date,1 sign union all select x.reversal_date,-1 where x.reversal_date is not null) v where ${between(sql`v.date`,q)}`;
    const dimensions = { employee: dim("employee_id", "employee"), account: dim("account_id", "account") };
    const basis = "Operating expense postings less reversals on their reversal business dates. TA/DA retains the original employee/category snapshots. Operating expenses never alter landed cost.";
    if (id === "daily-expenditure" || id === "ta-da") return { base, dimensions, basis, result: sql`select * from scoped ${id === "ta-da" ? raw("where subtype='TA/DA'") : raw("")} order by date,id,sign desc`, columns: [text("date", "Date"), text("category", "Category at Posting"), text("employee", "Employee / Unit"), text("unit", "Expense For"), text("account", "Paid From"), text("posting", "Posting"), ...(id === "ta-da" ? [money("ta", "TA"), money("da", "DA")] : []), money("amount", "Net Expense"), text("entered_by", "Entered By"), text("remarks", "Remarks")] };
    const by = id === "monthly-category" ? "category" : id === "expense-by-person" ? "employee" : id === "expense-by-unit" ? "unit" : "month";
    const label = by === "month" ? raw("to_char(date,'YYYY-MM') as month") : raw(by === "employee" ? "employee_id,employee" : by === "category" ? "category_id,category" : by);
    const group = by === "month" ? raw("to_char(date,'YYYY-MM')") : raw(by === "employee" ? "employee_id,employee" : by === "category" ? "category_id,category" : by);
    return { base, dimensions, basis, result: sql`select ${label},sum(amount) amount,sum(ta) ta,sum(da) da from scoped ${id === "expense-by-person" ? raw("where employee_id is not null") : raw("")} group by ${group} order by ${sql.identifier(by)}`, columns: [text(by, by === "month" ? "Month" : by === "category" ? "Category at Posting" : by === "employee" ? "Employee" : "Expense For"), money("ta", "Net TA"), money("da", "Net DA"), money("amount", "Net Expense")] };
  }
  if (["account-transactions", "day-book", "cash-transactions", "bank-transactions", "mobile-banking-transactions", "cash-movement-summary", "monthly-ac-summary"].includes(id)) {
    const channel = id === "cash-transactions" ? "Cash" : id === "bank-transactions" ? "Bank" : id === "mobile-banking-transactions" ? "Mobile Banking" : undefined;
    const base = sql`select t.date,t.created_at,t.id,t.account_id,a.name account,a.type channel,t.voucher_number voucher,t.source_type source,t.direction,t.party_name party,t.description,t.reference,t.remarks,
      case when t.direction='In' then t.amount else 0 end inflow,case when t.direction='Out' then t.amount else 0 end outflow,t.reversal_of_id
      from erp_private.account_transactions t join erp_private.cash_accounts a on a.id=t.account_id where t.date<=${q.to}::date ${channel ? sql`and a.type=${channel}` : raw("")}`;
    const dimensions = { account: dim("account_id", "account") };
    const basis = "Immutable cash/bank journal: original entries and compensating reversals remain on their own business dates. Opening is before the start date; closing is through the end date. Cash flows are not an income statement.";
    if (id === "cash-movement-summary") return { base, dimensions, basis, result: sql`select account_id,account,channel,coalesce(sum(inflow-outflow) filter(where date<${q.from}::date),0) opening,coalesce(sum(inflow) filter(where date>=${q.from}::date),0) inflow,coalesce(sum(outflow) filter(where date>=${q.from}::date),0) outflow,sum(inflow-outflow) closing from scoped group by account_id,account,channel order by account,account_id`, columns: [text("account", "Account"), text("channel", "Channel"), money("opening", "Opening Balance"), money("inflow", "Period Inflow"), money("outflow", "Period Outflow"), money("closing", "Closing Balance")] };
    if (id === "monthly-ac-summary") return { base, dimensions, basis, result: sql`select source,sum(inflow) inflow,sum(outflow) outflow,sum(inflow-outflow) net from scoped where date>=${q.from}::date group by source order by source`, columns: [text("source", "Source"), money("inflow", "Inflow"), money("outflow", "Outflow"), money("net", "Net Movement")], notes: ["Collections and operating expenses are separate sources. Supplier payments, opening balances, advances, loans and manual authorized movements are not operating revenue/expense."] };
    return { base, dimensions, basis, result: sql`with running as(select *,sum(inflow-outflow) over(partition by account_id order by date,created_at,id rows unbounded preceding) balance from scoped) select * from running where date>=${q.from}::date order by date,created_at,id`, columns: [text("date", "Date"), text("voucher", "Voucher"), text("account", "Account"), text("channel", "Channel"), text("source", "Source"), text("party", "Party"), text("description", "Description"), text("reference", "Reference"), money("inflow", "Inflow"), money("outflow", "Outflow"), money("balance", "Running Account Balance", false), text("remarks", "Remarks")] };
  }
  return undefined;
}
