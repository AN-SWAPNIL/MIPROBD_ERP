import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronDown, ChevronRight, Download, FileSpreadsheet, SlidersHorizontal, UserRound, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import EmployeePicker from "../../components/employees/EmployeePicker";
import Button from "../../components/ui/Button";
import PrintPreviewButton from "../../components/ui/PrintPreviewButton";
import { useAuthStore } from "../../lib/auth/session";
import { getMarketingEmployeeScope, hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { formatCurrency, formatNumber } from "../../utils/format";
import { ErrorBlock, LoadingBlock, Panel, Segmented, TableFrame, inputClass, labelClass } from "../components";
import type { ReportTable } from "../erp.types";
import { employeeService, marketingService, reportService } from "../services";
import { allMarketingActivityTypes, marketingActivityLabel } from "../marketing/activityCategories";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function displaySummary(label: string, value: string) {
  return /collection|sales|amount/i.test(label) ? formatCurrency(value, true) : formatNumber(value);
}

export default function MarketingReportWorkspace({ from, to, preset = "", initialEmployeeId, initialSubjectId }: { from: string; to: string; preset?: string; initialEmployeeId?: string; initialSubjectId?: string }) {
  const user = useAuthStore((state) => state.session?.user);
  const navigate = useNavigate();
  const canExport = hasEffectivePermission(user, "marketing", "export");
  const canPrint = hasEffectivePermission(user, "print", "view");
  const selfScope = getMarketingEmployeeScope(user) === "SELF";
  const [employeeId, setEmployeeId] = useState(selfScope ? user?.id ?? "" : initialEmployeeId ?? "all");
  const [territory, setTerritory] = useState("");
  const [activityType, setActivityType] = useState("");
  const [subjectId, setSubjectId] = useState(initialSubjectId ?? "");
  const [subjectSearch, setSubjectSearch] = useState("");
  const [verification, setVerification] = useState("");
  const [status, setStatus] = useState(preset === "overdue" ? "OVERDUE" : "");
  const [groupBy, setGroupBy] = useState("Date");
  const [mode, setMode] = useState<"Summary" | "Detail">(["verification", "overdue", "today", "my-day"].includes(preset) ? "Detail" : "Summary");
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(initialSubjectId) || ["verification", "overdue", "funnel"].includes(preset));
  const [tableId, setTableId] = useState(preset === "funnel" ? "lead-funnel" : preset === "verification" ? "visit-verification" : preset === "week" || preset === "overdue" ? "follow-up-status" : preset === "month" || preset === "target" ? "target-actual" : "marketing-activity");
  const directoryQuery = useQuery({ queryKey: ["employees", "directory", "marketing", user?.id], queryFn: () => employeeService.directory("marketing") });
  const subjectsQuery = useQuery({ queryKey: ["marketing", "subjects", user?.id], queryFn: marketingService.subjects });
  const reportQuery = useQuery({
    queryKey: ["reports", "marketing", from, to, employeeId, territory, activityType, subjectId, verification, status, groupBy, mode],
    queryFn: () => reportService.marketing({ from, to, employeeId, territory, activityType, subjectId, verification, status, groupBy, mode }),
    enabled: Boolean(from && to && from <= to)
  });

  const data = reportQuery.data;
  const tables = useMemo(() => data?.tables.filter((table) => mode === "Detail" || ["marketing-grouped", "lead-funnel", "target-actual", "activity-score"].includes(table.id)) ?? [], [data, mode]);
  const selected = tables.find((table) => table.id === tableId) ?? tables[0];
  const filteredSubjects = useMemo(() => {
    const query = subjectSearch.trim().toLowerCase();
    return (subjectsQuery.data ?? []).filter((entry) => entry.value === subjectId || !query || `${entry.label} ${entry.type}`.toLowerCase().includes(query));
  }, [subjectId, subjectSearch, subjectsQuery.data]);
  const selectedEmployee = (directoryQuery.data ?? []).find((employee) => employee.id === employeeId);
  const advancedFilterCount = [!selfScope && employeeId !== "all" ? employeeId : "", territory, activityType, subjectId, verification, status, groupBy === "Date" ? "" : groupBy].filter(Boolean).length;

  useEffect(() => {
    if (tables.length && !tables.some((table) => table.id === tableId)) setTableId(tables[0].id);
  }, [tableId, tables]);

  useEffect(() => {
    if (selfScope && user?.id) setEmployeeId(user.id);
  }, [selfScope, user?.id]);

  if (directoryQuery.isLoading || subjectsQuery.isLoading || reportQuery.isLoading) return <LoadingBlock label="Preparing marketing report" />;
  if (directoryQuery.isError || subjectsQuery.isError || reportQuery.isError || !data) return <ErrorBlock error={directoryQuery.error ?? subjectsQuery.error ?? reportQuery.error ?? new Error("Marketing report is unavailable.")} onRetry={() => { void directoryQuery.refetch(); void subjectsQuery.refetch(); void reportQuery.refetch(); }} />;

  const exportCsv = async () => {
    await reportService.authorizeMarketingExport();
    const exported = selected ? [selected] : tables;
    const lines: string[] = [];
    for (const table of exported) {
      lines.push(csvCell(table.title));
      lines.push(table.columns.map((column) => csvCell(column.label)).join(","));
      for (const row of table.rows) lines.push(table.columns.map((column) => csvCell(row[column.key] ?? "")).join(","));
      lines.push("");
    }
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `mipro-marketing-${selected?.id ?? "report"}-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openPrintPreview = () => {
    if (!selected) return;
    const params = new URLSearchParams({
      from,
      to,
      employeeId,
      territory,
      activityType,
      subjectId,
      verification,
      status,
      groupBy,
      mode,
      table: selected.id
    });
    navigate(`/app/print/marketing-analysis/current?${params.toString()}`);
  };

  return (
    <div className="grid w-full min-w-0 max-w-full gap-4">
      <Panel className="min-w-0" title="Marketing Team Analysis" subtitle="Cross-team activity, territory, funnel, verification, follow-up and target analysis" actions={<div className="flex flex-wrap gap-2">{canExport ? <Button icon={<Download className="h-4 w-4" />} onClick={() => void exportCsv()}>Export Analysis</Button> : null}{canPrint ? <PrintPreviewButton onClick={openPrintPreview} disabled={!selected} /> : null}</div>}>
        <div className="grid gap-3 p-4 lg:grid-cols-[minmax(280px,1fr)_minmax(260px,.8fr)_auto] lg:items-end">
          <div className="flex min-h-16 items-center gap-3 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2"><span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-blue-950 text-cyan-300"><BarChart3 className="h-4 w-4" /></span><div><strong className="block text-sm text-blue-950">Operational marketing analysis</strong><p className="text-xs leading-5 text-slate-600">Grouped evidence for management decisions, not an employee personnel report.</p></div></div>
          <div><span className={labelClass}>Analysis Depth</span><Segmented value={mode} onChange={setMode} ariaLabel="Marketing analysis detail" options={[{ value: "Summary", label: "Summary" }, { value: "Detail", label: "Detailed Rows" }]} /></div>
          <Button className="w-full lg:w-auto" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setAdvancedOpen((open) => !open)} aria-expanded={advancedOpen}>More Filters{advancedFilterCount ? ` (${advancedFilterCount})` : ""}</Button>
        </div>
        {advancedOpen ? <div className="border-t border-blue-100 bg-blue-50/40 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>{selfScope ? <div><span className={labelClass}>Employee Scope</span><div className="flex h-10 items-center gap-2 rounded-md border border-blue-200 bg-white px-3 text-sm text-blue-950"><UserRound className="h-4 w-4 text-cyan-700" /><strong>{selectedEmployee?.name ?? user?.name ?? "My records"}</strong><span className="text-slate-500">(own activity)</span></div></div> : <><EmployeePicker employees={directoryQuery.data ?? []} value={employeeId} onChange={setEmployeeId} allowAll allLabel="All Permitted Team" label="Employee Filter" />{selectedEmployee ? <Link className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-cyan-800 hover:underline" to={`/app/reports/employee-activity?employeeId=${encodeURIComponent(selectedEmployee.id)}`}><UserRound className="h-3.5 w-3.5" />Open named employee report</Link> : null}</>}</div>
            <label><span className={labelClass}>Territory</span><select className={inputClass} value={territory} onChange={(event) => setTerritory(event.target.value)}><option value="">All territories</option>{[...new Set((directoryQuery.data ?? []).map((employee) => employee.territory).filter(Boolean))].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span className={labelClass}>Activity Category</span><select className={inputClass} value={activityType} onChange={(event) => setActivityType(event.target.value)}><option value="">All activities</option>{allMarketingActivityTypes.map((value) => <option value={value} key={value}>{marketingActivityLabel(value)}</option>)}</select></label>
            <div><span className={labelClass}>Customer / Lead</span><input className={`${inputClass} mb-2`} value={subjectSearch} onChange={(event) => setSubjectSearch(event.target.value)} placeholder="Search customer or lead" /><select aria-label="Customer or lead" className={inputClass} value={subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">All customers and leads</option><optgroup label="Leads">{filteredSubjects.filter((entry) => entry.type === "Lead").map((entry) => <option value={entry.value} key={entry.value}>{entry.label}</option>)}</optgroup><optgroup label="Customers">{filteredSubjects.filter((entry) => entry.type === "Customer").map((entry) => <option value={entry.value} key={entry.value}>{entry.label}</option>)}</optgroup></select></div>
            <label><span className={labelClass}>Verification</span><select className={inputClass} value={verification} onChange={(event) => setVerification(event.target.value)}><option value="">All verification</option><option value="SYSTEM_VERIFIED">System Verified</option><option value="GPS_VERIFIED">GPS Verified</option><option value="MANUAL">Manual</option><option value="UNVERIFIED">Unverified</option></select></label>
            <label><span className={labelClass}>Lead / Follow-up / Visit Status</span><select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{["NEW", "CONTACTED", "INTERESTED", "PRESENTATION", "SAMPLE", "QUOTATION", "NEGOTIATION", "ORDER", "DELIVERED", "PAYMENT", "LOST", "PENDING", "OVERDUE", "COMPLETED", "CANCELLED", "PLANNED", "CHECKED_IN", "MISSED"].map((value) => <option value={value} key={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
            <label><span className={labelClass}>Group By</span><select className={inputClass} value={groupBy} onChange={(event) => setGroupBy(event.target.value)}><option>Date</option><option>Employee</option><option>Territory</option><option>Customer</option><option>Activity Type</option><option>Lead Stage</option></select></label>
          </div>
          {advancedFilterCount ? <div className="mt-3 flex justify-end"><Button variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => { if (!selfScope) setEmployeeId("all"); setTerritory(""); setActivityType(""); setSubjectId(""); setSubjectSearch(""); setVerification(""); setStatus(""); setGroupBy("Date"); }}>Clear Filters</Button></div> : null}
        </div> : null}
      </Panel>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Marketing analysis summary">{data.summary.map((row, index) => <div className={`rounded-md border bg-white p-4 shadow-sm ${index % 5 === 0 ? "border-blue-200 border-t-blue-700" : index % 5 === 1 ? "border-cyan-200 border-t-cyan-600" : index % 5 === 2 ? "border-emerald-200 border-t-emerald-600" : index % 5 === 3 ? "border-amber-200 border-t-amber-500" : "border-red-200 border-t-red-500"} border-t-4`} key={row.label}><span className="text-xs text-slate-500">{row.label}</span><strong className="mt-1 block text-xl text-blue-950">{displaySummary(row.label, row.value)}</strong></div>)}</section>

      <div className="min-w-0 overflow-hidden rounded-md border border-blue-200 bg-blue-50/50 p-3 shadow-sm"><Segmented value={selected?.id ?? tableId} onChange={setTableId} ariaLabel="Marketing analysis tables" options={tables.map((table) => ({ value: table.id, label: table.title, count: table.rows.length }))} /></div>
      <Panel className="min-w-0" title={selected?.title ?? "Marketing Analysis"} subtitle={`${from} to ${to} | ${mode} | grouped by ${groupBy}${employeeId !== "all" && selectedEmployee ? ` | filtered to ${selectedEmployee.name}` : ""}${selected?.id === "marketing-grouped" ? " | expand a row for its underlying records" : ""}`} actions={<span className="flex items-center gap-2 text-xs text-slate-500"><FileSpreadsheet className="h-4 w-4 text-cyan-700" />{selected?.rows.length ?? 0} analytical rows</span>}>
        {selected ? <MarketingDataTable table={selected} detailTable={data.tables.find((table) => table.id === (groupBy === "Lead Stage" ? "lead-funnel" : "marketing-activity"))} groupBy={groupBy} /> : <div className="p-8 text-center text-sm text-slate-500">No analysis table matches the current view.</div>}
      </Panel>
    </div>
  );
}

function MarketingDataTable({ table, detailTable, groupBy }: { table: ReportTable; detailTable?: ReportTable; groupBy: string }) {
  if (table.id === "marketing-grouped" && detailTable) return <GroupedMarketingDataTable table={table} detailTable={detailTable} groupBy={groupBy} />;
  return <TableFrame><table className={`w-full text-left text-sm ${table.columns.length > 7 ? "min-w-[1500px]" : "min-w-[900px]"}`}><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr>{table.columns.map((column) => <th className={`px-3 py-2 ${column.align === "right" ? "text-right" : ""}`} key={column.key}>{column.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{table.rows.map((row, index) => <tr className="hover:bg-cyan-50/40" key={`${table.id}-${index}`}>{table.columns.map((column) => <td className={`px-3 py-3 align-top text-slate-700 ${column.align === "right" ? "text-right font-semibold" : ""}`} key={column.key}>{marketingCellValue(row[column.key], column.key, column.label)}</td>)}</tr>)}</tbody></table></TableFrame>;
}

function GroupedMarketingDataTable({ table, detailTable, groupBy }: { table: ReportTable; detailTable: ReportTable; groupBy: string }) {
  const [expandedGroup, setExpandedGroup] = useState("");
  useEffect(() => setExpandedGroup(""), [groupBy, table.id]);
  const leadStages = groupBy === "Lead Stage";
  return <TableFrame><table className="w-full min-w-[1080px] table-fixed text-left text-sm"><thead className="bg-blue-950 text-[10px] uppercase text-white"><tr><th className="w-[130px] px-3 py-3">{table.columns[0]?.label ?? groupBy}</th><th className="w-[230px] px-3 py-3">People & Accounts</th><th className="px-3 py-3">{leadStages ? "Pipeline Context" : "Activity Summary"}</th><th className="w-[145px] px-3 py-3">{leadStages ? "Next Action" : "Field / Follow-up"}</th><th className="w-[170px] px-3 py-3">{leadStages ? "Lead Volume" : "Business Results"}</th><th className="w-[110px] px-3 py-3">{leadStages ? "Status" : "Evidence"}</th><th className="w-[125px] px-3 py-3 text-right">Details</th></tr></thead><tbody className="divide-y divide-slate-100">{table.rows.map((row, index) => {
    const group = row.group ?? `${table.id}-${index}`;
    const detailRows = matchingDetailRows(detailTable, groupBy, group);
    const expanded = expandedGroup === group;
    return <Fragment key={`${table.id}-${group}-${index}`}><tr className={expanded ? "bg-cyan-50/70" : "bg-white hover:bg-cyan-50/40"}><td className="px-3 py-3 align-top font-bold text-blue-950">{marketingCellValue(group, "group", table.columns[0]?.label ?? groupBy)}</td><td className="px-3 py-3 align-top"><strong className="block text-slate-800">{row.employees || "-"}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{row.subjects || "-"}</span></td><td className="px-3 py-3 align-top leading-5 text-slate-700">{leadStages ? `${row.subjects || "No organization"} | ${row.employees || "Unassigned"}` : row.mix || "No activity category"}</td><td className="px-3 py-3 align-top text-slate-700">{leadStages ? marketingCellValue(row.next, "next", "Next Action") : <><strong>{row.fieldWork || "0"}</strong> field work<span className="block text-xs text-slate-500">{row.followUps || "0"} follow-ups</span></>}</td><td className="px-3 py-3 align-top text-slate-700">{leadStages ? <><strong>{row.count || "0"}</strong> leads</> : <><strong>{row.business || "Quotations 0 | Orders 0"}</strong><span className="block text-xs font-semibold text-emerald-700">Collections: {marketingCellValue(row.collections, "collections", "Collections")}</span></>}</td><td className="px-3 py-3 align-top"><strong className="text-blue-950">{leadStages ? group : `${row.verified || "0"} / ${row.count || "0"}`}</strong><span className="block text-xs text-slate-500">{leadStages ? "pipeline stage" : "verified / total"}</span></td><td className="px-3 py-2 text-right"><Button variant="ghost" icon={expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} onClick={() => setExpandedGroup(expanded ? "" : group)} aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "View"} details for ${group}`}>{detailRows.length} {detailRows.length === 1 ? "record" : "records"}</Button></td></tr>{expanded ? <tr className="bg-cyan-50/50"><td className="p-3" colSpan={7}><div className="overflow-hidden rounded-md border border-cyan-200 bg-white"><div className="flex items-center justify-between border-b border-cyan-100 bg-cyan-50 px-3 py-2"><strong className="text-xs text-blue-950">Underlying records for {group}</strong><span className="text-[11px] text-slate-500">{detailRows.length} linked record{detailRows.length === 1 ? "" : "s"}</span></div><div className="max-h-80 overflow-auto"><table className="w-full min-w-[1100px] text-left text-xs"><thead className="sticky top-0 bg-blue-950 text-[10px] uppercase text-white"><tr>{detailTable.columns.map((column) => <th className={`px-3 py-2 ${column.align === "right" ? "text-right" : ""}`} key={column.key}>{column.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{detailRows.map((detail, detailIndex) => <tr key={`${group}-detail-${detailIndex}`}>{detailTable.columns.map((column) => <td className={`px-3 py-2 align-top text-slate-700 ${column.align === "right" ? "text-right font-semibold" : ""}`} key={column.key}>{marketingCellValue(detail[column.key], column.key, column.label)}</td>)}</tr>)}{!detailRows.length ? <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={detailTable.columns.length}>No underlying record matches this group.</td></tr> : null}</tbody></table></div></div></td></tr> : null}</Fragment>;
  })}</tbody></table></TableFrame>;
}

function matchingDetailRows(table: ReportTable, groupBy: string, group: string) {
  return table.rows.filter((row) => {
    if (groupBy === "Lead Stage") return row.stage === group;
    if (groupBy === "Employee") return row.employee === group;
    if (groupBy === "Territory") return (row.territory === "-" ? "Unassigned" : row.territory) === group;
    if (groupBy === "Customer") return (row.subject === "-" ? "Unassigned" : row.subject) === group;
    if (groupBy === "Activity Type") return row.activity === group;
    return row.date?.slice(0, 10) === group;
  });
}

function marketingCellValue(value = "", key: string, label: string) {
  if (!value || value === "-") return "-";
  if (/amount|collection|sales|value/i.test(key) && /^-?\d+(\.\d+)?$/.test(value)) return formatCurrency(value);
  if (/date|time|due|next|submitted/i.test(`${key} ${label}`) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const parsed = new Date(value.includes("T") ? value : `${value}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return new Intl.DateTimeFormat("en-GB", value.includes("T") ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(parsed);
  }
  return value;
}
