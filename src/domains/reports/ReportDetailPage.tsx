import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import PrintPreviewButton from "../../components/ui/PrintPreviewButton";
import { useAuthStore } from "../../lib/auth/session";
import { businessDate } from "../../lib/date";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { formatCurrency } from "../../utils/format";
import { ErrorBlock, LoadingBlock, Panel, TableFrame, inputClass, labelClass } from "../components";
import EmployeeActivityPerformance from "../employees/EmployeeActivityPerformance";
import type { ReportTable, SalespersonPerformanceData } from "../erp.types";
import { reportService } from "../services";
import MarketingReportWorkspace from "./MarketingReportWorkspace";
import { visibleReportCatalog } from "./reportCatalog";
import { appendReportFilters, filterReportRows, readReportFilters, reportFilterLabels, reportFilterOptions, type ReportFilterValues } from "./reportFilters";

import { periodFor, presets, type PeriodPreset, type Grouping } from "./reportPeriod";
import { foundationMode } from "../../lib/runtime";
import PersistentReportDetailPage from "./PersistentReportDetailPage";

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function displayValue(value: string, key: string) {
  if (value === "Restricted") return value;
  return /amount|value|sales|collection|paid|due|balance|cost|obligation|credit|debit|inflow|outflow|net/i.test(key) && /^-?\d+(\.\d+)?$/.test(value) ? formatCurrency(value) : value;
}

function aggregateSales(table: ReportTable, grouping: Grouping): ReportTable {
  if (table.id !== "sales-summary" || grouping === "Daily") return table;
  const grouped = new Map<string, Record<string, number>>();
  for (const row of table.rows) {
    const date = new Date(`${row.date}T00:00:00Z`);
    let key = row.date;
    if (grouping === "Monthly") key = row.date.slice(0, 7);
    if (grouping === "Yearly") key = row.date.slice(0, 4);
    if (grouping === "Weekly") {
      const monday = shiftDate(row.date, -((date.getUTCDay() + 6) % 7));
      key = `${monday} to ${shiftDate(monday, 6)}`;
    }
    const current = grouped.get(key) ?? { invoices: 0, customers: 0, quantity: 0, sales: 0, collections: 0 };
    for (const field of Object.keys(current)) current[field] += Number(row[field] || 0);
    grouped.set(key, current);
  }
  return { ...table, columns: table.columns.map((column) => column.key === "date" ? { ...column, label: grouping } : column), rows: [...grouped].map(([date, row]) => ({ date, ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key === "invoices" || key === "customers" ? String(value) : value.toFixed(2)])) })) };
}

function performanceTable(data: SalespersonPerformanceData): ReportTable {
  return {
    id: "salesperson-performance",
    title: data.selected ? `${data.selected.employee.name} Performance` : "Sales Team Comparison",
    columns: [
      { key: "employee", label: "Employee" }, { key: "territory", label: "Territory" },
      { key: "quotes", label: "Quotes", align: "right" }, { key: "orders", label: "Orders", align: "right" },
      { key: "sales", label: "Delivered Sales", align: "right" }, { key: "collections", label: "Collections", align: "right" },
      { key: "visits", label: "Verified Visits", align: "right" }, { key: "score", label: "Activity Score", align: "right" },
      { key: "target", label: "Target", align: "right" }, { key: "conversion", label: "Conversion", align: "right" }
    ],
    rows: data.comparison.filter((row) => !data.selected || row.id === data.selected.employee.id).map((row) => ({ employee: row.name, territory: row.territory ?? "-", quotes: String(row.quotationsCreated), orders: String(row.ordersCreated), sales: row.deliveredSalesValue, collections: row.collectionsReceived, visits: String(row.verifiedVisits), score: String(row.activityScore), target: `${row.targetProgress}%`, conversion: `${row.conversionRate}%` }))
  };
}

function DataTable({ table }: { table: ReportTable }) {
  return <TableFrame><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-blue-950 text-[10px] uppercase text-white"><tr>{table.columns.map((column) => <th className={`px-3 py-3 ${column.align === "right" ? "text-right" : ""}`} key={column.key}>{column.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{table.rows.map((row, index) => <tr className="hover:bg-cyan-50/40" key={`${table.id}-${index}`}>{table.columns.map((column) => <td className={`px-3 py-3 ${column.align === "right" ? "text-right font-semibold" : "text-slate-600"}`} key={column.key}>{displayValue(row[column.key] ?? "-", column.key)}</td>)}</tr>)}{!table.rows.length ? <tr><td className="px-4 py-12 text-center text-slate-500" colSpan={table.columns.length}>No posted records match this period and filter set.</td></tr> : null}</tbody></table></TableFrame>;
}

export default function ReportDetailPage() {
  return foundationMode ? <PersistentReportDetailPage /> : <LegacyReportDetailPage />;
}

function LegacyReportDetailPage() {
  const user = useAuthStore((state) => state.session?.user);
  const actor = useAuthStore((state) => state.session?.user);
  const { reportId = "" } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const report = visibleReportCatalog(user).find((entry) => entry.id === reportId);
  const today = businessDate();
  const requestedFrom = params.get("from");
  const requestedTo = params.get("to");
  const requestedPreset = (["today", "yesterday", "this-week", "last-week", "this-month", "last-month", "this-year", "last-year", "custom"] as PeriodPreset[]).includes(params.get("preset") as PeriodPreset) ? params.get("preset") as PeriodPreset : params.get("preset") === "week" ? "this-week" : params.get("preset") === "month" ? "this-month" : "this-month";
  const initial = requestedFrom && requestedTo ? { from: requestedFrom, to: requestedTo } : periodFor(requestedPreset, today);
  const [preset, setPreset] = useState<PeriodPreset>(requestedFrom && requestedTo ? "custom" : requestedPreset);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFilters, setDraftFilters] = useState<ReportFilterValues>(() => readReportFilters(params));
  const [filters, setFilters] = useState<ReportFilterValues>(() => readReportFilters(params));
  const [grouping, setGrouping] = useState<Grouping>("Daily");
  const canPrint = hasEffectivePermission(user, "print", "view");
  const canExport = hasEffectivePermission(user, "reports", "export");
  const employeeId = params.get("employeeId") || "all";

  const reportQuery = useQuery({ queryKey: ["reports", "detail", from, to, employeeId], queryFn: () => reportService.get(from, to, employeeId), enabled: Boolean(report && report.source === "table" && from <= to) });
  const performanceQuery = useQuery({ queryKey: ["reports", "performance", from, to, employeeId], queryFn: () => reportService.salespeople(from, to, employeeId), enabled: Boolean(report && report.source === "performance" && from <= to) });

  const sourceTable = report?.source === "table" && report.sourceGroup ? reportQuery.data?.tables[report.sourceGroup].find((table) => table.id === report.tableId) : undefined;
  const filteredTable = useMemo(() => sourceTable ? aggregateSales({ ...sourceTable, rows: filterReportRows(sourceTable, filters) }, grouping) : performanceQuery.data ? performanceTable(performanceQuery.data) : undefined, [filters, grouping, performanceQuery.data, sourceTable]);

  if (!report) return <ErrorBlock error={new Error("This report is unavailable for your role or does not exist.")} onRetry={() => navigate("/app/reports")} />;
  if (!actor) return <ErrorBlock error={new Error("Sign in again to open reports.")} />;

  const changePreset = (value: PeriodPreset) => {
    setPreset(value);
    if (value !== "custom") {
      const period = periodFor(value, today);
      setFrom(period.from);
      setTo(period.to);
    }
  };

  const openPrint = () => {
    if (report.source === "employee-activity") return;
    const printParams = new URLSearchParams({ from, to, view: report.sourceGroup ?? "sales", table: report.source === "performance" ? "salesperson-performance" : report.tableId ?? report.id, employeeId });
    appendReportFilters(printParams, filters);
    navigate(`/app/print/operational-report/${report.sourceGroup ?? "sales"}?${printParams}`);
  };

  const exportCsv = async () => {
    if (!filteredTable) return;
    await reportService.authorizeExport();
    const lines = [filteredTable.columns.map((column) => csvCell(column.label)).join(","), ...filteredTable.rows.map((row) => filteredTable.columns.map((column) => csvCell(row[column.key] ?? "")).join(","))];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${report.id}-${from}-to-${to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (report.source === "employee-activity") {
    return <div className="grid gap-4"><Button className="w-fit" variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate("/app/reports")}>Back to Reports</Button><EmployeeActivityPerformance reportMode actor={actor} employeeId={employeeId === "all" ? undefined : employeeId} onEmployeeChange={(id) => navigate(`/app/reports/employee-activity?employeeId=${encodeURIComponent(id)}`, { replace: true })} onFieldMap={(id) => navigate(`/app/employees?view=field-team&employeeId=${encodeURIComponent(id)}`)} /></div>;
  }

  return <div className="grid gap-4" data-testid="report-detail">
    <Button className="w-fit" variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate("/app/reports")}>Back to Reports</Button>
    <PageHeader eyebrow={reportCategoriesLabel(report.category)} title={report.title} subtitle={report.description} />

    <Panel title="Report Settings" subtitle="Choose a standard period and only the dimensions relevant to this report.">
      <div className="grid gap-3 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <label><span className={labelClass}>Period</span><select className={inputClass} value={preset} onChange={(event) => changePreset(event.target.value as PeriodPreset)}>{presets.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
        {preset === "custom" ? <><label><span className={labelClass}>From</span><input className={inputClass} type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label><label><span className={labelClass}>To</span><input className={inputClass} type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} /></label></> : <div className="sm:col-span-1"><span className={labelClass}>Selected Dates</span><div className="flex h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-blue-950">{from} to {to}</div></div>}
        {report.supportsGrouping ? <label><span className={labelClass}>Group Results</span><select className={inputClass} value={grouping} onChange={(event) => setGrouping(event.target.value as Grouping)}>{["Daily", "Weekly", "Monthly", "Yearly"].map((value) => <option key={value}>{value}</option>)}</select></label> : null}
        {sourceTable ? report.filters.map((filter) => <label key={filter}><span className={labelClass}>{reportFilterLabels[filter]}</span><select className={inputClass} value={draftFilters[filter] ?? ""} onChange={(event) => setDraftFilters((current) => ({ ...current, [filter]: event.target.value }))}><option value="">All {reportFilterLabels[filter].toLowerCase()}</option>{reportFilterOptions(sourceTable, filter).map((option) => <option key={option}>{option}</option>)}</select></label>) : null}
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 xl:col-span-4">
          <Button variant="primary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => { setFilters(draftFilters); void reportQuery.refetch(); void performanceQuery.refetch(); }}>Generate / Refresh</Button>
          {canExport && filteredTable ? <Button icon={<Download className="h-4 w-4" />} onClick={() => void exportCsv()}>Export CSV</Button> : null}
          {canPrint && filteredTable ? <PrintPreviewButton onClick={openPrint} /> : null}
        </div>
      </div>
    </Panel>

    {report.source === "marketing" ? <MarketingReportWorkspace from={from} to={to} preset={report.marketingPreset} initialEmployeeId={employeeId === "all" ? undefined : employeeId} initialSubjectId={params.get("subject") ?? undefined} /> : null}
    {(reportQuery.isLoading || performanceQuery.isLoading) && report.source !== "marketing" ? <LoadingBlock label="Generating report" /> : null}
    {(reportQuery.isError || performanceQuery.isError) && report.source !== "marketing" ? <ErrorBlock error={reportQuery.error ?? performanceQuery.error ?? new Error("Report could not be generated.")} onRetry={() => { void reportQuery.refetch(); void performanceQuery.refetch(); }} /> : null}
    {filteredTable ? <Panel title={filteredTable.title} subtitle={`${filteredTable.rows.length} result row${filteredTable.rows.length === 1 ? "" : "s"} | ${from} to ${to}`}><DataTable table={filteredTable} /></Panel> : null}
    {report.id === "balance-sheet" && filteredTable ? <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900"><strong>Accounting control:</strong> this statement uses posted account balances, customer dues, landed-cost inventory, supplier settlements and controlled opening entries. A non-zero reconciliation difference remains visible and is never forced to balance.</div> : null}
  </div>;
}

function reportCategoriesLabel(category: string) {
  return category.replace("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
