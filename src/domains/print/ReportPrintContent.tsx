import Avatar from "../../components/ui/Avatar";
import StatusBadge from "../../components/ui/StatusBadge";
import type { ReactNode } from "react";
import type { User } from "../../types";
import { formatCurrency, formatNumber } from "../../utils/format";
import type {
  AuditEvent,
  EmployeeMarketingSnapshot,
  MarketingActivity,
  MarketingPerformanceRow,
  ReportTable,
  SalespersonPerformanceData
} from "../erp.types";
import type { EmployeeReportKind } from "../employees/employeeReports";
import { marketingActivityLabel } from "../marketing/activityCategories";

function displayValue(value: string, key = "") {
  if (value === "Restricted") return value;
  const money = /amount|value|cost|sales|collected|collection|due|profit|landed|revenue|cogs|ta|da/i.test(key);
  return money && /^-?\d+(\.\d+)?$/.test(value) ? formatCurrency(value) : value;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function dateTimeLabel(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${dateLabel(value)} | Time unavailable`;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function auditEventsReportTable(events: AuditEvent[]): ReportTable {
  return {
    id: "audit-events",
    title: "Protected Action Audit Trail",
    columns: [
      { key: "timestamp", label: "Timestamp" },
      { key: "user", label: "User / Role" },
      { key: "action", label: "Action" },
      { key: "record", label: "Record" },
      { key: "summary", label: "Summary / Reason" }
    ],
    rows: events.map((event) => ({
      timestamp: new Date(event.timestamp).toLocaleString(),
      user: `${event.userName} | ${event.role}`,
      action: event.action,
      record: `${event.entityType} | ${event.entityId}`,
      summary: `${event.summary}${event.reason ? ` | Reason: ${event.reason}` : ""}`
    }))
  };
}

export function salespersonComparisonReportTable(data: SalespersonPerformanceData): ReportTable {
  return {
    id: "salesperson-comparison",
    title: "All Sales Employees Comparison",
    columns: [
      { key: "employee", label: "Employee" },
      { key: "territory", label: "Territory" },
      { key: "quotes", label: "Quotes", align: "right" },
      { key: "converted", label: "Converted", align: "right" },
      { key: "orders", label: "Orders", align: "right" },
      { key: "sales", label: "Delivered Sales", align: "right" },
      { key: "collections", label: "Collections", align: "right" },
      { key: "visits", label: "Verified Visits", align: "right" },
      { key: "leads", label: "New Leads", align: "right" },
      { key: "score", label: "Activity Score", align: "right" },
      { key: "target", label: "Target", align: "right" },
      { key: "customers", label: "Customers", align: "right" },
      { key: "conversion", label: "Conversion", align: "right" }
    ],
    rows: data.comparison.map((row) => ({
      employeeId: row.id,
      employee: row.name,
      territory: row.territory ?? "-",
      quotes: String(row.quotationsCreated),
      converted: String(row.convertedQuotations),
      orders: String(row.ordersCreated),
      sales: row.deliveredSalesValue,
      collections: row.collectionsReceived,
      visits: String(row.verifiedVisits),
      leads: String(row.newLeads),
      score: String(row.activityScore),
      target: `${row.targetProgress}%`,
      customers: String(row.customersHandled),
      conversion: `${row.conversionRate}%`
    }))
  };
}

export function buildPerformancePrintTables(data?: SalespersonPerformanceData) {
  if (!data) return [];
  if (!data.selected) return [salespersonComparisonReportTable(data)];
  return [salespersonComparisonReportTable(data), ...Object.values(data.selected.tables)];
}

function chunks<T>(rows: T[], size: number) {
  if (!rows.length) return [[]] as T[][];
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));
}

export function buildOperationalLetterheadPages({ summary, tables }: { summary: Array<{ label: string; value: string }>; tables: ReportTable[] }): ReactNode[] {
  const pageTables = tables.flatMap((table) => {
    const rowLimit = table.columns.length > 8 ? 18 : table.columns.length > 6 ? 22 : 26;
    const rowGroups = chunks(table.rows, rowLimit);
    return rowGroups.map((rows, index) => ({
      ...table,
      title: rowGroups.length > 1 ? `${table.title} (${index + 1}/${rowGroups.length})` : table.title,
      rows
    }));
  });
  if (!pageTables.length) return [<OperationalLetterheadContent summary={summary} tables={[]} showSignatures key="empty-operational-report" />];
  return pageTables.map((table, index) => <OperationalLetterheadContent summary={index === 0 ? summary : []} tables={[table]} showSignatures={index === pageTables.length - 1} key={`${table.id}-${index}`} />);
}

export function buildMarketingLetterheadPages({ summary, table }: { summary: Array<{ label: string; value: string }>; table: ReportTable }): ReactNode[] {
  const rowGroups = chunks(table.rows, table.columns.length > 8 ? 18 : 24);
  return rowGroups.map((rows, index) => <MarketingLetterheadContent
    summary={index === 0 ? summary : []}
    table={{ ...table, title: rowGroups.length > 1 ? `${table.title} (${index + 1}/${rowGroups.length})` : table.title, rows }}
    showSignatures={index === rowGroups.length - 1}
    key={`${table.id}-${index}`}
  />);
}

export function OperationalLetterheadContent({ summary, tables, showSignatures = true }: { summary: Array<{ label: string; value: string }>; tables: ReportTable[]; showSignatures?: boolean }) {
  return <div className="grid gap-5 text-[8px]">
    {summary.length ? <section className="grid grid-cols-4 gap-2">{summary.slice(0, 8).map((row) => <div className="border border-slate-300 p-2" key={row.label}><span className="block text-[7px] font-bold uppercase text-slate-500">{row.label}</span><strong className="mt-1 block text-[10px] text-blue-950">{displayValue(row.value, row.label)}</strong></div>)}</section> : null}
    {tables.map((table) => <section className="break-before-auto" key={table.id}><div className="mb-2 flex items-end justify-between"><h2 className="text-[11px] font-bold text-blue-950">{table.title}</h2><span className="text-slate-500">{table.rows.length} rows</span></div><table className={`report-print-table w-full table-fixed border-collapse ${table.columns.length > 8 ? "text-[6px]" : table.columns.length > 6 ? "text-[7px]" : "text-[8px]"}`}><thead><tr className="report-print-header">{table.columns.map((column) => <th className={`break-words border border-slate-700 p-1.5 ${column.align === "right" ? "text-right" : "text-left"}`} key={column.key}>{column.label}</th>)}</tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr className="break-inside-avoid" key={`${table.id}-letterhead-${rowIndex}`}>{table.columns.map((column) => <td className={`break-words border border-slate-300 p-1.5 align-top ${column.align === "right" ? "text-right" : "text-left"}`} key={column.key}>{displayValue(row[column.key] ?? "-", column.key)}</td>)}</tr>)}{!table.rows.length ? <tr><td className="border border-slate-300 p-6 text-center text-slate-500" colSpan={table.columns.length}>No posted records fall inside this report period.</td></tr> : null}</tbody></table></section>)}
    {showSignatures ? <SignatureFooter /> : null}
  </div>;
}

export function MarketingLetterheadContent({ summary, table, showSignatures = true }: { summary: Array<{ label: string; value: string }>; table: ReportTable; showSignatures?: boolean }) {
  return <div className="grid gap-4 text-[8px]">
    <section className="grid grid-cols-5 gap-2">{summary.slice(0, 10).map((row) => <div className="border border-slate-300 p-2" key={row.label}><span className="block text-[7px] font-bold uppercase text-slate-500">{row.label}</span><strong className="mt-1 block text-[10px] text-blue-950">{/collection|sales|amount/i.test(row.label) ? formatCurrency(row.value, true) : formatNumber(row.value)}</strong></div>)}</section>
    <section><div className="mb-2 flex items-end justify-between"><h2 className="text-[11px] font-bold text-blue-950">{table.title}</h2><span className="text-slate-500">{table.rows.length} analytical rows</span></div><table className="report-print-table w-full table-fixed border-collapse"><thead><tr className="report-print-header">{table.columns.map((column) => <th className={`border border-slate-700 p-1.5 ${column.align === "right" ? "text-right" : "text-left"}`} key={column.key}>{column.label}</th>)}</tr></thead><tbody>{table.rows.map((row, index) => <tr className="break-inside-avoid" key={`${table.id}-print-${index}`}>{table.columns.map((column) => <td className={`border border-slate-300 p-1.5 align-top ${column.align === "right" ? "text-right" : "text-left"}`} key={column.key}>{row[column.key] || "-"}</td>)}</tr>)}{!table.rows.length ? <tr><td className="border border-slate-300 p-6 text-center text-slate-500" colSpan={table.columns.length}>No records match the selected filters.</td></tr> : null}</tbody></table></section>
    {showSignatures ? <SignatureFooter /> : null}
  </div>;
}

type EmployeeLetterheadProps = {
  snapshot: EmployeeMarketingSnapshot;
  actor: User;
  activities: MarketingActivity[];
  periodText: string;
  reportKind: EmployeeReportKind;
  showTargets: boolean;
  showPlans: boolean;
  showFollowUps: boolean;
  showPipeline: boolean;
  showIdentity?: boolean;
  showSummary?: boolean;
  showActivity?: boolean;
  showClosing?: boolean;
};

export function buildEmployeeLetterheadPages(props: Omit<EmployeeLetterheadProps, "activities"> & { activities: MarketingActivity[] }): ReactNode[] {
  const activityGroups = chunks(props.activities, props.showTargets ? 9 : 13);
  const supportRows = (props.showPlans ? props.snapshot.dailyPlans.flatMap((plan) => plan.plannedVisits).length + props.snapshot.monthlyPlans.length : 0)
    + (props.showFollowUps ? props.snapshot.followUps.length : 0)
    + (props.showPipeline ? props.snapshot.leads.length : 0);
  const combineSupport = activityGroups.length === 1 && !props.showTargets && supportRows <= 5;
  const pages = activityGroups.map((activities, index) => <EmployeeLetterheadContent
    {...props}
    activities={activities}
    showIdentity={index === 0}
    showSummary={index === 0}
    showTargets={index === 0 && props.showTargets}
    showPlans={combineSupport && index === activityGroups.length - 1 ? props.showPlans : false}
    showFollowUps={combineSupport && index === activityGroups.length - 1 ? props.showFollowUps : false}
    showPipeline={combineSupport && index === activityGroups.length - 1 ? props.showPipeline : false}
    showClosing={combineSupport || (!props.showPlans && !props.showFollowUps && !props.showPipeline) ? index === activityGroups.length - 1 : false}
    key={`employee-activity-${index}`}
  />);
  if (!combineSupport && (props.showPlans || props.showFollowUps || props.showPipeline)) {
    pages.push(<EmployeeLetterheadContent
      {...props}
      activities={[]}
      showTargets={false}
      showIdentity={false}
      showSummary={false}
      showActivity={false}
      showClosing
      key="employee-support"
    />);
  }
  return pages;
}

export function EmployeeLetterheadContent({ snapshot, actor, activities, periodText, reportKind, showTargets, showPlans, showFollowUps, showPipeline, showIdentity = true, showSummary = true, showActivity = true, showClosing = true }: EmployeeLetterheadProps) {
  const verified = activities.filter((activity) => ["GPS_VERIFIED", "SYSTEM_VERIFIED"].includes(activity.verification)).length;
  return <div className="grid gap-4 text-[9px]">
    {showIdentity ? <section className="report-print-surface grid grid-cols-[18mm_1fr] gap-4 border border-slate-300 p-3">
      <Avatar className="h-[18mm] w-[18mm] rounded border border-slate-300 object-cover" src={snapshot.employee.avatarUrl} name={snapshot.employee.name} />
      <div><div className="flex items-start justify-between gap-4"><div><strong className="block text-[13px] text-blue-950">{snapshot.employee.name}</strong><span className="font-semibold text-cyan-800">{snapshot.employee.employeeCode} | {snapshot.employee.title}</span></div><StatusBadge status={snapshot.employee.status} /></div><dl className="mt-3 grid grid-cols-4 gap-2"><div><dt className="text-slate-500">Department</dt><dd className="font-semibold">{snapshot.employee.department}</dd></div><div><dt className="text-slate-500">Territory</dt><dd className="font-semibold">{snapshot.employee.territory ?? "Not assigned"}</dd></div><div><dt className="text-slate-500">Report scope</dt><dd className="font-semibold">{reportKind}</dd></div><div><dt className="text-slate-500">Prepared by</dt><dd className="font-semibold">{actor.name}</dd></div></dl></div>
    </section> : null}
    {showSummary ? <section><h2 className="mb-2 text-[11px] font-bold text-blue-950">Management Summary</h2><div className="grid grid-cols-6">{[
      ["Activities", formatNumber(activities.length)], ["Verified", formatNumber(verified)], ["Visits", formatNumber(snapshot.performance.completedVisits)], ["New Leads", formatNumber(snapshot.performance.newLeads)], ["Orders", formatNumber(snapshot.performance.orders)], ["Collections", formatCurrency(snapshot.performance.collectionsBdt, true)]
    ].map(([label, value]) => <div className="report-print-surface border border-slate-200 p-2" key={label}><span className="block text-[7px] font-bold uppercase text-slate-500">{label}</span><strong className="mt-1 block text-[11px] text-blue-950">{value}</strong></div>)}</div></section> : null}
    {showTargets ? <section><h2 className="mb-2 text-[11px] font-bold text-blue-950">Target vs Actual</h2><TargetPrintTable row={snapshot.performance} /></section> : null}
    {showActivity ? <section><div className="mb-2 flex items-end justify-between"><h2 className="text-[11px] font-bold text-blue-950">Employee Activity Log</h2><span className="text-slate-500">{periodText} | {activities.length} records on this page</span></div><table className="report-print-table w-full table-fixed border-collapse text-[7.5px]"><thead><tr className="report-print-header"><th className="w-[25mm] border border-slate-700 p-1.5 text-left">Occurred</th><th className="w-[34mm] border border-slate-700 p-1.5 text-left">Activity / Subject</th><th className="border border-slate-700 p-1.5 text-left">Purpose & Outcome</th><th className="w-[31mm] border border-slate-700 p-1.5 text-left">Evidence / Reference</th></tr></thead><tbody>{activities.map((activity) => <tr className="break-inside-avoid" key={activity.id}><td className="border border-slate-300 p-1.5 align-top">{dateTimeLabel(activity.occurredAt)}<span className="mt-1 block text-slate-500">Submitted: {dateTimeLabel(activity.submittedAt)}</span></td><td className="border border-slate-300 p-1.5 align-top"><strong>{marketingActivityLabel(activity.activityType)}</strong><span className="mt-1 block text-slate-600">{activity.subjectName ?? "General activity"}</span></td><td className="border border-slate-300 p-1.5 align-top"><strong>{activity.purpose ?? "General work"}</strong><span className="mt-1 block text-slate-600">{activity.remarks ?? "No additional outcome recorded."}</span></td><td className="border border-slate-300 p-1.5 align-top"><strong className="text-cyan-800">{activity.verification.replaceAll("_", " ")}</strong><span className="mt-1 block">{activity.referenceNumber ?? "Manual entry"}</span>{activity.nextFollowUpAt ? <span className="mt-1 block text-slate-500">Next: {dateTimeLabel(activity.nextFollowUpAt)}</span> : null}</td></tr>)}{!activities.length ? <tr><td className="border border-slate-300 p-6 text-center text-slate-500" colSpan={4}>No matching activity was recorded in this period.</td></tr> : null}</tbody></table></section> : null}
    {showPlans ? <EmployeePrintTable title="Daily & Monthly Plan Review" columns={["Date / Month", "Planned Work", "Direction / Purpose", "Status"]} rows={[...snapshot.dailyPlans.flatMap((plan) => plan.plannedVisits.map((visit) => [dateLabel(plan.date), visit.subjectName, `${visit.plannedTime || "Open time"} | ${visit.purpose}`, visit.completed ? "Completed" : "Pending"])), ...snapshot.monthlyPlans.map((plan) => [plan.month, plan.territory, `${plan.plannedActivities} activities | ${plan.prioritySubjects.join(", ")}${plan.notes ? ` | ${plan.notes}` : ""}`, plan.status])]} /> : null}
    {showFollowUps ? <EmployeePrintTable title="Follow-up Status" columns={["Due", "Customer / Lead", "Purpose", "Status"]} rows={snapshot.followUps.map((item) => [dateTimeLabel(item.dueAt), item.subjectName, item.purpose, item.status])} /> : null}
    {showPipeline ? <EmployeePrintTable title="Lead Pipeline" columns={["Reference", "Organization", "Organization Type", "Stage / Next Action"]} rows={snapshot.leads.map((lead) => [lead.leadNumber, lead.organizationName, lead.organizationType, `${lead.stage} | ${lead.nextFollowUpAt ? dateTimeLabel(lead.nextFollowUpAt) : "Not scheduled"}`])} /> : null}
    {showClosing ? <><section className="grid grid-cols-3 gap-3"><div className="border border-slate-300 p-2"><span className="text-slate-500">Plans completed</span><strong className="block text-[11px] text-blue-950">{snapshot.dailyPlans.flatMap((plan) => plan.plannedVisits).filter((visit) => visit.completed).length} / {snapshot.dailyPlans.flatMap((plan) => plan.plannedVisits).length}</strong></div><div className="border border-slate-300 p-2"><span className="text-slate-500">Open follow-ups</span><strong className="block text-[11px] text-blue-950">{snapshot.followUps.filter((item) => ["PENDING", "OVERDUE"].includes(item.status)).length}</strong></div><div className="border border-slate-300 p-2"><span className="text-slate-500">Active opportunities</span><strong className="block text-[11px] text-blue-950">{snapshot.leads.filter((lead) => !["PAYMENT", "LOST"].includes(lead.stage)).length}</strong></div></section>
    <footer className="mt-12 grid grid-cols-3 gap-10 text-center"><span className="border-t border-slate-500 pt-2">Employee<br /><b>{snapshot.employee.name}</b></span><span className="border-t border-slate-500 pt-2">Reviewed by<br /><b>Sales Manager / Supervisor</b></span><span className="border-t border-slate-500 pt-2">Approved by<br /><b>Authorized Management</b></span></footer></> : null}
  </div>;
}

function TargetPrintTable({ row }: { row: MarketingPerformanceRow }) {
  const targets = [
    { label: "Delivered sales", actual: formatCurrency(row.deliveredSalesBdt, true), target: formatCurrency(row.targets.salesTargetBdt, true), progress: Number(row.progress.sales) },
    { label: "Verified visits", actual: formatNumber(row.verifiedVisits), target: formatNumber(row.targets.visitTarget), progress: Number(row.progress.visits) },
    { label: "New customers", actual: formatNumber(row.convertedCustomers), target: formatNumber(row.targets.newCustomerTarget), progress: Number(row.progress.customers) },
    { label: "Collections", actual: formatCurrency(row.collectionsBdt, true), target: formatCurrency(row.targets.collectionTargetBdt, true), progress: Number(row.progress.collections) }
  ];
  return <table className="report-print-table w-full border-collapse text-[8px]"><thead><tr className="report-print-header"><th className="p-2 text-left">Measure</th><th className="p-2 text-right">Actual</th><th className="p-2 text-right">Target</th><th className="p-2 text-right">Progress</th></tr></thead><tbody>{targets.map((item) => <tr key={item.label}><td className="border border-slate-300 p-2 font-semibold">{item.label}</td><td className="border border-slate-300 p-2 text-right">{item.actual}</td><td className="border border-slate-300 p-2 text-right">{item.target}</td><td className="border border-slate-300 p-2 text-right font-bold">{formatNumber(item.progress)}%</td></tr>)}</tbody></table>;
}

function EmployeePrintTable({ title, columns, rows }: { title: string; columns: string[]; rows: string[][] }) {
  return <section><div className="mb-2 flex items-end justify-between"><h2 className="text-[11px] font-bold text-blue-950">{title}</h2><span className="text-slate-500">{rows.length} rows</span></div><table className="report-print-table w-full table-fixed border-collapse text-[7.5px]"><thead><tr className="report-print-header">{columns.map((column) => <th className="border border-slate-700 p-1.5 text-left" key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr className="break-inside-avoid" key={`${title}-${rowIndex}`}>{row.map((value, columnIndex) => <td className="break-words border border-slate-300 p-1.5 align-top" key={`${title}-${rowIndex}-${columnIndex}`}>{value || "-"}</td>)}</tr>)}{!rows.length ? <tr><td className="border border-slate-300 p-5 text-center text-slate-500" colSpan={columns.length}>No records are available for this section.</td></tr> : null}</tbody></table></section>;
}

function SignatureFooter() {
  return <footer className="mt-12 grid grid-cols-3 gap-10 text-center"><span className="border-t border-slate-500 pt-2">Prepared by</span><span className="border-t border-slate-500 pt-2">Reviewed by</span><span className="border-t border-slate-500 pt-2">Approved by</span></footer>;
}
