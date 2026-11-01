import { sql } from "drizzle-orm";
import { between, dim, raw, text, type Query, type Spec } from "./common.js";
import type { User } from "../../src/types/index.js";
import { directoryScope } from "../workforce/scope.js";

export function controlSpec(id: string, q: Query, user: User): Spec | undefined {
  if (id === "employee-list") return {
    base: sql`select id employee_id,employee_code code,name employee,title,department,territory,phone,role,status from erp_private.employees where ${directoryScope(user,sql`id`)}`, dimensions: { employee: dim("employee_id", "employee"), territory: dim("territory"), status: dim("status") },
    result: raw("select * from scoped order by employee,code,employee_id"), basis: "Current employee directory only. No Auth identifiers, email setup links, session data, access overrides, evidence or performance scores are included.", columns: [text("code", "Employee Code"), text("employee", "Employee"), text("title", "Designation"), text("department", "Department"), text("territory", "Territory"), text("phone", "Phone"), text("role", "Current Role"), text("status", "Status")]
  };
  if (["audit-trail", "access-change-audit", "fifo-override-audit"].includes(id)) {
    const action = id === "access-change-audit" ? raw("and (a.entity_type='Employee' or a.entity_type='User')") : id === "fifo-override-audit" ? raw("and (lower(a.action) like '%fifo%' or lower(a.action) like '%override%')") : raw("");
    return { base: sql`select a.id,to_char(a.created_at at time zone 'Asia/Dhaka','YYYY-MM-DD HH24:MI:SS') timestamp,coalesce(e.name,'System') actor,a.action,a.entity_type entity,
      coalesce(i.draft_reference,o.order_number,si.invoice_number,d.challan_number,c.receipt_number,a.entity_id) reference,
      coalesce(a.details->>'reason','') reason from erp_private.audit_events a left join erp_private.employees e on e.id=a.actor_id
      left join erp_private.import_cases i on i.id=a.entity_id left join erp_private.sales_orders o on o.id=a.entity_id
      left join erp_private.sales_invoices si on si.id=a.entity_id left join erp_private.deliveries d on d.id=a.entity_id left join erp_private.collections c on c.id=a.entity_id
      where ${between(sql`(a.created_at at time zone 'Asia/Dhaka')::date`,q)} ${action}`,
      result: raw("select * from scoped order by timestamp,id"), dimensions: {}, basis: "Narrow protected-action audit in Bangladesh business time. Raw event payloads, capability changes, passwords, setup links and signed file URLs are deliberately not exported.",
      columns: [text("timestamp", "Timestamp (Dhaka)"), text("actor", "Actor"), text("action", "Action"), text("entity", "Entity"), text("reference", "Reference"), text("reason", "Recorded Reason")]
    };
  }
  return undefined;
}
