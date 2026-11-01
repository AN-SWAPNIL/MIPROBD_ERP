import { Router } from "express";
import { sql, type SQL } from "drizzle-orm";
import type { User } from "../../src/types/index.js";
import { reportCatalog, type ReportDefinition } from "../../src/domains/reports/reportCatalog.js";
import { PersistentReportSchema, type PersistentReport, type ReportCatalogueEntry } from "../../src/domains/reports/persistentContracts.js";
import { canAccessEmployeeHub, hasCapability, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { businessDate } from "../../src/lib/date.js";
import { audit, identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { csvCell, filtered, queryInput, reportFilterKeys, type Query } from "./common.js";
import { salesSpec } from "./sales.js";
import { partySpec } from "./parties.js";
import { financeSpec } from "./finance.js";
import { inventorySpec } from "./inventory.js";
import { importSpec } from "./imports.js";
import { controlSpec } from "./controls.js";
import { workforceReportSpec } from "../workforce/reporting.js";
import { fieldVisitReport } from "../workforce/visit-reports.js";
import { ledgerReportSpec } from "../ledger/reporting.js";
import { canReadLedger,canReadPayroll } from "../../src/domains/ledger/access.js";
import { returnReportSpec } from "../returns/reporting.js";
import { payrollReportSpec } from "../payroll/reporting.js";
import { claimReportSpec } from "../claims/reporting.js";

export function canReadReport(user: User, report: ReportDefinition) {
  if(["supplier-claims","supplier-replacements","supplier-replacement-receipts"].includes(report.id))return hasEffectivePermission(user,"reports")&&["import","inventory","accounts"].some(k=>hasEffectivePermission(user,k as "import"|"inventory"|"accounts"));
  if(report.id.startsWith("payroll-"))return hasEffectivePermission(user,"reports")&&canReadPayroll(user);
  if (report.id.startsWith("ledger-") && !canReadLedger(user)) return false;
  const sourceAllowed=report.id==="employee-list"?canAccessEmployeeHub(user):hasEffectivePermission(user, report.permission.key, report.permission.action);
  if (!hasEffectivePermission(user, "reports") || !sourceAllowed || report.capability && !hasCapability(user, report.capability)) return false;
  if (report.id === "employee-list" && !canAccessEmployeeHub(user)) return false;
  if (report.category === "controls" && !(["Super Admin", "Managing Director"].includes(user.role) || hasEffectivePermission(user, "users") && hasCapability(user, "manage_user_access"))) return false;
  if (user.role === "Warehouse Manager" && ["sales", "customers"].includes(report.category) && !["delivery-challan-register", "order-fulfilment"].includes(report.id)) return false;
  return true;
}
export function reportSpec(report: ReportDefinition, user: User, q: Query) {
  const spec = claimReportSpec(report.id,user,q) ?? payrollReportSpec(report.id,user,q) ?? returnReportSpec(report.id,user,q) ?? ledgerReportSpec(report.id,user,q) ?? salesSpec(report.id,user,q) ?? partySpec(report.id,user,q) ?? inventorySpec(report.id,user,q) ?? importSpec(report.id,q) ?? financeSpec(report.id,q) ?? fieldVisitReport(report.id,user,q) ?? workforceReportSpec(report.id,user,q) ?? controlSpec(report.id,q,user);
  if (!spec) return undefined;
  if ((report.category === "suppliers" && !hasCapability(user,"view_sensitive_cost")) || user.role === "Warehouse Manager" && ["sales","employees"].includes(report.category)) {
    spec.columns = spec.columns.filter((column) => column.format !== "money");
    spec.notes = [...(spec.notes ?? []), "Sensitive financial columns are not included for this access profile."];
  }
  if (report.category === "employees" && (!hasEffectivePermission(user,"sales") || user.role === "Warehouse Manager")) {
    spec.columns=spec.columns.filter((column)=>column.format!=="money" && !["sales_progress","collection_progress"].includes(column.key));
  }
  return spec;
}
export function catalogue(user: User): ReportCatalogueEntry[] {
  const q = queryInput.parse({ from: businessDate(),to: businessDate() }) as Query;
  return reportCatalog.filter((report) => canReadReport(user, report)).map((report) => {
    const available = Boolean(reportSpec(report, user, q));
    return { id: report.id, title: report.title, category: report.category, description: report.description, keywords: report.keywords, filters: report.filters, supportsGrouping: Boolean(report.supportsGrouping), available, ...(!available ? { pendingReason: report.id === "balance-sheet" ? "Approved opening balances and financial-position reconciliation are pending." : "Field/GPS visit verification is not migrated; self-reported activities remain available." } : {}) };
  });
}

export async function generate(ctx: Context,user: User,definition: ReportDefinition,q: Query,purpose: "screen"|"print"|"export"): Promise<PersistentReport> {
  const spec = reportSpec(definition,user,q);
  if (!spec) throw new HttpError(503,definition.id === "balance-sheet" ? "Balance Sheet is pending approved opening balances and reconciliation. Cash/bank, customer and supplier journals remain available." : "This report's persistent source workflow is not migrated yet.");
  if (q.grouping !== "Daily" && !definition.supportsGrouping) throw new HttpError(422,"Grouping is not supported for this report.");
  const predicate = filtered(spec,q,definition.filters);
  const selected = sql.join(spec.columns.map((column) => sql`coalesce(${sql.identifier(column.key)}::text,'') as ${sql.identifier(column.key)}`),sql`, `);
  const totalColumns = spec.columns.filter((column) => column.total);
  const totals = totalColumns.length ? sql`jsonb_build_object(${sql.join(totalColumns.flatMap((column) => [sql`${column.key}::text`,sql`coalesce(sum(${sql.identifier(column.key)}::numeric),0)::text`]),sql`, `)})` : sql`'{}'::jsonb`;
  const dimensions = definition.filters.map((key) => [key,spec.dimensions[key]] as const).filter((entry) => entry[1]);
  const options = dimensions.length ? sql`jsonb_build_object(${sql.join(dimensions.flatMap(([key,dimension]) => [sql`${key}::text`,sql`coalesce((select jsonb_agg(jsonb_build_object('value',choice.value,'label',choice.label) order by choice.label,choice.value) from (select ${sql.identifier(dimension.id)}::text value,max(${sql.identifier(dimension.label)}::text) label from base where ${sql.identifier(dimension.id)} is not null and ${sql.identifier(dimension.id)}::text<>'' group by ${sql.identifier(dimension.id)} order by label,value limit 1001) choice),'[]'::jsonb)`]),sql`, `)})` : sql`'{}'::jsonb`;
  const maximum = purpose === "print" ? 1000 : purpose === "export" ? 10000 : q.pageSize;
  const offset = purpose === "screen" ? (q.page-1)*q.pageSize : 0;
  const payload = await ctx.db.transaction(async (tx) => {
    if (spec.inventoryJournal) {
      const [quality] = (await tx.execute<{ unsupported: boolean }>(sql`select exists(select 1 from erp_private.stock_movements where date<=${q.to}::date and (quantity_delta is null or value_delta_bdt is null)) unsupported`)).rows;
      if (quality.unsupported) throw new HttpError(409,"A stock journal type requires report reconciliation before generating this inventory report.");
    }
    const query: SQL = sql`with base as (${spec.base}),scoped as (select * from base where ${predicate}),result as (${spec.result})
      select (select count(*)::text from result) count,
      coalesce((select jsonb_agg(to_jsonb(page_row)) from (select ${selected} from result limit ${maximum} offset ${offset}) page_row),'[]'::jsonb) rows,
      ${totalColumns.length ? sql`(select ${totals} from result)` : totals} totals,${options} options`;
    return (await tx.execute<{ count: string; rows: Record<string,string>[];totals: Record<string,string>;options: PersistentReport["options"] }>(query)).rows[0];
  },{isolationLevel:"repeatable read",accessMode:"read only"});
  const rowCount = Number(payload.count);
  if (!Number.isSafeInteger(rowCount)) throw new HttpError(503,"Report row count exceeds supported display limits.");
  if (purpose !== "screen" && rowCount>maximum) throw new HttpError(413,`This ${purpose} contains ${rowCount} rows. Narrow the dates/filters to at most ${maximum} rows; no partial output was produced.`);
  const optionsTruncated = Object.values(payload.options).some((entries) => entries.length>1000);
  return PersistentReportSchema.parse({id:definition.id,title:definition.title,generatedAt:new Date().toISOString(),from:q.from,to:q.to,grouping:q.grouping,basis:spec.basis,columns:spec.columns,rows:payload.rows,totals:payload.totals,rowCount,page:purpose==="screen"?q.page:1,pageSize:purpose==="screen"?q.pageSize:Math.max(1,rowCount),options:Object.fromEntries(Object.entries(payload.options).map(([key,entries])=>[key,entries.slice(0,1000)])),optionsTruncated,filters:Object.fromEntries(reportFilterKeys.filter((key)=>q[key]).map((key)=>[key,q[key]])),notes:[...(spec.notes??[]),"Names and active/assignment status are current master data unless a column explicitly identifies a posting snapshot. Missing opening data is not manufactured.",...(optionsTruncated?["Filter choices show the first 1,000 authorized values; the report itself is not truncated."]:[])]});
}

export function createReportRouter(ctx: Context) {
  const router = Router();
  router.get("/reports/catalogue",(_req,res)=>{const user=identity(res).user;assertAllowed(hasEffectivePermission(user,"reports"));res.json({success:true,data:catalogue(user),message:"Authorized report catalogue loaded"});});
  for (const purpose of ["screen","print","export"] as const) router.get(purpose==="screen"?"/reports/:id":`/reports/:id/${purpose}`,async(req,res)=>{
    const user=identity(res).user;const definition=reportCatalog.find((report)=>report.id===req.params.id);
    if(!definition)throw new HttpError(404,"Report not found.");
    assertAllowed(canReadReport(user,definition));
    if(purpose==="print")assertAllowed(hasEffectivePermission(user,"print"));
    if(purpose==="export")assertAllowed(hasEffectivePermission(user,"reports","export"));
    const query=queryInput.parse(req.query) as Query;const result=await generate(ctx,user,definition,query,purpose);
    if(purpose==="export"){
      await ctx.db.transaction((tx)=>audit(tx,user.id,"Report CSV prepared","Report",definition.id,{from:query.from,to:query.to,filters:result.filters,rowCount:result.rowCount}));
      const lines=[result.columns.map((column)=>csvCell(column.label)).join(","),...result.rows.map((row)=>result.columns.map((column)=>csvCell(row[column.key]??"",column.format)).join(","))];
      res.set("Content-Disposition",`attachment; filename="${definition.id}-${query.from}-${query.to}.csv"`).type("text/csv").send("\uFEFF"+lines.join("\r\n"));return;
    }
    res.json({success:true,data:result,message:"Report generated from persistent business postings"});
  });
  return router;
}
