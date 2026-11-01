import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BookOpenText,
  CalendarDays,
  CheckCircle2,
  Download,
  MapPinned,
  RefreshCw,
  Target
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import EmployeePicker from "../../components/employees/EmployeePicker";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import PrintPreviewButton from "../../components/ui/PrintPreviewButton";
import StatusBadge from "../../components/ui/StatusBadge";
import { businessDate } from "../../lib/date";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { useToastStore } from "../../lib/ui/toast";
import type { User } from "../../types";
import { formatCurrency, formatNumber } from "../../utils/format";
import { ErrorBlock, LoadingBlock, Segmented, TableFrame, inputClass, labelClass } from "../components";
import type { MarketingActivity, MarketingPerformanceRow } from "../erp.types";
import { marketingActivityLabel } from "../marketing/activityCategories";
import { employeeService, marketingService, reportService } from "../services";
import SalesReferenceLink from "../sales/SalesReferenceLink";
import {
  employeeReportPeriod,
  employeeReportTitle,
  filterEmployeeReportActivities,
  type EmployeeReportFrequency,
  type EmployeeReportKind
} from "./employeeReports";

const frequencyOptions: EmployeeReportFrequency[] = ["Daily", "Weekly", "Monthly", "Custom"];
const reportKinds: Array<{ value: EmployeeReportKind; label: string; description: string }> = [
  { value: "Complete", label: "Complete Performance", description: "Activity, targets, plans, pipeline and follow-ups" },
  { value: "Activity", label: "Activity Details", description: "All reported and ERP-generated employee activity" },
  { value: "Field Work", label: "Field Visits & Meetings", description: "Visits, meetings, check-ins and demonstrations" },
  { value: "Sales & Collection", label: "Sales & Collection", description: "Negotiation, quotation, order, delivery and collection" },
  { value: "Follow-ups", label: "Follow-ups & Pipeline", description: "Customer follow-ups, open leads and overdue work" }
];

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function dateTimeLabel(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${dateLabel(value)} | Time unavailable`;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function periodLabel(from: string, to: string) {
  return from === to ? dateLabel(from) : `${dateLabel(from)} to ${dateLabel(to)}`;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function saveCsv(fileName: string, rows: string[][]) {
  const content = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

function Metric({ label, value, tone = "blue" }: { label: string; value: string; tone?: "blue" | "cyan" | "green" | "amber" | "red" }) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-950",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-950",
    green: "border-emerald-200 bg-emerald-50 text-emerald-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    red: "border-rose-200 bg-rose-50 text-rose-950"
  };
  return <div className={`min-h-20 border p-3 ${tones[tone]}`}><span className="block text-[10px] font-bold uppercase text-slate-500">{label}</span><strong className="mt-1 block break-words text-lg leading-6">{value}</strong></div>;
}

function TargetTable({ row }: { row: MarketingPerformanceRow }) {
  const targets = [
    { label: "Delivered sales", actual: formatCurrency(row.deliveredSalesBdt, true), target: formatCurrency(row.targets.salesTargetBdt, true), progress: Number(row.progress.sales) },
    { label: "Verified visits", actual: formatNumber(row.verifiedVisits), target: formatNumber(row.targets.visitTarget), progress: Number(row.progress.visits) },
    { label: "New customers", actual: formatNumber(row.convertedCustomers), target: formatNumber(row.targets.newCustomerTarget), progress: Number(row.progress.customers) },
    { label: "Collections", actual: formatCurrency(row.collectionsBdt, true), target: formatCurrency(row.targets.collectionTargetBdt, true), progress: Number(row.progress.collections) }
  ];
  return <div className="overflow-hidden border border-slate-200 bg-white"><div className="grid grid-cols-[1fr_90px_90px_70px] bg-blue-950 px-3 py-2 text-[10px] font-bold uppercase text-white sm:grid-cols-[1fr_150px_150px_90px]"><span>Measure</span><span className="text-right">Actual</span><span className="text-right">Target</span><span className="text-right">Progress</span></div>{targets.map((item) => <div className="grid grid-cols-[1fr_90px_90px_70px] items-center border-t border-slate-100 px-3 py-3 text-xs sm:grid-cols-[1fr_150px_150px_90px]" key={item.label}><div className="pr-2"><strong className="text-slate-800">{item.label}</strong><div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-100"><span className={item.progress >= 90 ? "block h-full bg-emerald-500" : item.progress >= 60 ? "block h-full bg-cyan-600" : "block h-full bg-amber-500"} style={{ width: `${Math.min(100, item.progress)}%` }} /></div></div><span className="text-right text-slate-700">{item.actual}</span><span className="text-right text-slate-500">{item.target}</span><strong className="text-right text-blue-950">{formatNumber(item.progress)}%</strong></div>)}</div>;
}

function PeriodInput({ frequency, date, weekDate, month, customFrom, customTo, onChange }: { frequency: EmployeeReportFrequency; date: string; weekDate: string; month: string; customFrom: string; customTo: string; onChange: (key: "date" | "weekDate" | "month" | "customFrom" | "customTo", value: string) => void }) {
  const today = businessDate();
  if (frequency === "Daily") return <label><span className={labelClass}>Report Date</span><input className={inputClass} type="date" max={today} value={date} onChange={(event) => onChange("date", event.target.value)} /></label>;
  if (frequency === "Weekly") return <label><span className={labelClass}>Choose Any Date in the Week</span><input className={inputClass} type="date" max={today} value={weekDate} onChange={(event) => onChange("weekDate", event.target.value)} /></label>;
  if (frequency === "Monthly") return <label><span className={labelClass}>Report Month</span><input className={inputClass} type="month" max={today.slice(0, 7)} value={month} onChange={(event) => onChange("month", event.target.value)} /></label>;
  return <div className="grid gap-3 sm:grid-cols-2"><label><span className={labelClass}>From</span><input className={inputClass} type="date" max={customTo} value={customFrom} onChange={(event) => onChange("customFrom", event.target.value)} /></label><label><span className={labelClass}>To</span><input className={inputClass} type="date" min={customFrom} max={today} value={customTo} onChange={(event) => onChange("customTo", event.target.value)} /></label></div>;
}

export default function EmployeeActivityPerformance({ actor, employeeId, onEmployeeChange, onFieldMap, reportMode = false }: { actor: User; employeeId?: string; onEmployeeChange: (employeeId: string) => void; onFieldMap: (employeeId: string) => void; reportMode?: boolean }) {
  const pushToast = useToastStore((state) => state.push);
  const navigate = useNavigate();
  const today = businessDate();
  const [frequency, setFrequency] = useState<EmployeeReportFrequency>("Daily");
  const [reportKind, setReportKind] = useState<EmployeeReportKind>("Complete");
  const [dateInput, setDateInput] = useState({ date: today, weekDate: today, month: today.slice(0, 7), customFrom: `${today.slice(0, 7)}-01`, customTo: today });
  const dates = useMemo(() => employeeReportPeriod(frequency, dateInput, today), [dateInput, frequency, today]);
  const directoryQuery = useQuery({ queryKey: ["employees", "directory", "marketing", actor.id], queryFn: () => employeeService.directory("marketing") });
  const employees = directoryQuery.data ?? [];
  const selectedId = employeeId && employees.some((employee) => employee.id === employeeId) ? employeeId : employees[0]?.id;
  const snapshotQuery = useQuery({
    queryKey: ["employees", "activity-report", selectedId, dates.from, dates.to],
    queryFn: () => marketingService.employeeSnapshot(selectedId!, dates.from, dates.to),
    enabled: Boolean(selectedId),
    refetchInterval: 15_000
  });

  useEffect(() => {
    if (selectedId && selectedId !== employeeId) onEmployeeChange(selectedId);
  }, [employeeId, onEmployeeChange, selectedId]);

  if (directoryQuery.isLoading || snapshotQuery.isLoading) return <LoadingBlock label="Preparing employee activity report" />;
  const error = directoryQuery.error ?? snapshotQuery.error;
  if (error) return <ErrorBlock error={error} onRetry={() => { void directoryQuery.refetch(); void snapshotQuery.refetch(); }} />;
  const snapshot = snapshotQuery.data;
  if (!snapshot || !selectedId) return <div className="rounded-md border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">No employee is available in your permitted team scope.</div>;

  const activities = filterEmployeeReportActivities(snapshot.recentActivities, reportKind);
  const categoryCounts = [...activities.reduce((rows, activity) => rows.set(activity.activityType, (rows.get(activity.activityType) ?? 0) + 1), new Map<MarketingActivity["activityType"], number>())]
    .sort((left, right) => right[1] - left[1] || marketingActivityLabel(left[0]).localeCompare(marketingActivityLabel(right[0])));
  const totalForBars = Math.max(1, activities.length);
  const verifiedActivities = activities.filter((activity) => ["GPS_VERIFIED", "SYSTEM_VERIFIED"].includes(activity.verification)).length;
  const lateSubmissions = activities.filter((activity) => new Date(activity.submittedAt).getTime() - new Date(activity.occurredAt).getTime() >= 60 * 60 * 1000).length;
  const plannedVisits = snapshot.dailyPlans.flatMap((plan) => plan.plannedVisits);
  const completedPlanVisits = plannedVisits.filter((visit) => visit.completed).length;
  const openFollowUps = snapshot.followUps.filter((item) => ["PENDING", "OVERDUE"].includes(item.status));
  const overdueFollowUps = snapshot.followUps.filter((item) => item.status === "OVERDUE").length;
  const activeLeads = snapshot.leads.filter((lead) => !["PAYMENT", "LOST"].includes(lead.stage));
  const generatedAt = new Date(snapshotQuery.dataUpdatedAt || Date.now());
  const periodText = periodLabel(dates.from, dates.to);
  const reportReference = `EMP-${snapshot.employee.employeeCode}-${dates.to.replaceAll("-", "")}-${frequency.slice(0, 1).toUpperCase()}`;
  const canPrint = hasEffectivePermission(actor, "print", "view");
  const canExport = hasEffectivePermission(actor, "marketing", "export");
  const showTargets = reportKind === "Complete" || reportKind === "Sales & Collection";
  const showPlans = reportKind === "Complete" || reportKind === "Activity" || reportKind === "Field Work";
  const showFollowUps = reportKind === "Complete" || reportKind === "Follow-ups";
  const showPipeline = reportKind === "Complete" || reportKind === "Follow-ups";
  const attentionText = overdueFollowUps
    ? `${overdueFollowUps} overdue follow-up${overdueFollowUps === 1 ? " requires" : "s require"} action.`
    : plannedVisits.length && completedPlanVisits < plannedVisits.length
      ? `${plannedVisits.length - completedPlanVisits} planned field item${plannedVisits.length - completedPlanVisits === 1 ? " remains" : "s remain"} incomplete in this period.`
      : "No overdue follow-up is recorded in this report period.";

  const exportCsv = async () => {
    try {
      await reportService.authorizeMarketingExport();
      saveCsv(`${reportReference.toLowerCase()}-${reportKind.toLowerCase().replaceAll(" ", "-")}.csv`, [
        ["Employee", "Employee ID", "Period", "Report Type", "Occurred At", "Submitted At", "Activity Category", "Customer / Lead", "Purpose", "Outcome / Remarks", "Verification", "Reference", "Next Follow-up"],
        ...activities.map((activity) => [snapshot.employee.name, snapshot.employee.employeeCode, periodText, reportKind, activity.occurredAt, activity.submittedAt, marketingActivityLabel(activity.activityType), activity.subjectName ?? "General activity", activity.purpose ?? "", activity.remarks ?? "", activity.verification.replaceAll("_", " "), activity.referenceNumber ?? "Manual", activity.nextFollowUpAt ?? ""])
      ]);
      pushToast({ kind: "success", title: "Employee report exported", message: `${activities.length} activity rows were included.` });
    } catch (exportError) {
      pushToast({ kind: "error", title: "Report export denied", message: exportError instanceof Error ? exportError.message : undefined });
    }
  };

  const openPrintPreview = () => {
    const params = new URLSearchParams({
      from: dates.from,
      to: dates.to,
      frequency,
      reportKind
    });
    navigate(`/app/print/employee-activity/${selectedId}?${params.toString()}`);
  };

  if (!reportMode) return <div className="grid gap-4" data-testid="employee-activity-summary">
    <section className="rounded-md border border-blue-200 bg-blue-50/60 p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-end">
        <EmployeePicker employees={employees} value={selectedId} onChange={onEmployeeChange} allowAll={false} label="Employee Activity Summary" />
        <div className="flex flex-wrap gap-2"><Button icon={<MapPinned className="h-4 w-4" />} onClick={() => onFieldMap(selectedId)}>Field Map</Button><Button variant="primary" icon={<BookOpenText className="h-4 w-4" />} onClick={() => navigate(`/app/reports/employee-activity?employeeId=${encodeURIComponent(selectedId)}`)}>Open Full Report</Button></div>
      </div>
    </section>
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-blue-100 bg-blue-50/60 p-4"><Avatar className="h-12 w-12 rounded-md object-cover" src={snapshot.employee.avatarUrl} name={snapshot.employee.name} /><div><h2 className="font-bold text-blue-950">{snapshot.employee.name}</h2><p className="text-xs text-slate-600">{snapshot.employee.employeeCode} | {snapshot.employee.title} | {snapshot.employee.territory ?? "No territory"}</p></div><StatusBadge status={snapshot.employee.status} /></header>
      <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3 xl:grid-cols-6"><Metric label="Activities Today" value={formatNumber(activities.length)} /><Metric label="Verified Visits" value={formatNumber(snapshot.performance.verifiedVisits)} tone="cyan" /><Metric label="New Leads" value={formatNumber(snapshot.performance.newLeads)} tone="green" /><Metric label="Orders" value={formatNumber(snapshot.performance.orders)} tone="amber" /><Metric label="Collections" value={formatCurrency(snapshot.performance.collectionsBdt, true)} tone="green" /><Metric label="Target" value={`${formatNumber(snapshot.performance.progress.overall)}%`} /></div>
      <div className="p-4"><h3 className="mb-3 text-sm font-bold text-blue-950">Recent activity</h3><div className="grid gap-2">{activities.slice(0, 5).map((activity) => <div className="flex flex-col gap-1 border border-slate-200 p-3 text-xs sm:flex-row sm:items-center sm:justify-between" key={activity.id}><div><strong>{marketingActivityLabel(activity.activityType)}</strong><p className="mt-1 text-slate-500">{activity.subjectName ?? "General activity"} | {dateTimeLabel(activity.occurredAt)}</p></div><StatusBadge status={activity.verification.replaceAll("_", " ")} /></div>)}{!activities.length ? <p className="py-6 text-center text-sm text-slate-500">No activity recorded today.</p> : null}</div></div>
    </section>
  </div>;

  return <div className="employee-report-workspace grid gap-4" data-testid="employee-activity-performance">
    <section className="no-print overflow-hidden rounded-md border border-blue-200 bg-[#eef6ff] shadow-sm">
      <div className="flex flex-col gap-2 bg-blue-950 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold">Employee Report Builder</h2><p className="text-xs text-blue-100">Select an employee, period and content. The on-screen review and official print use the same filtered data.</p></div><span className="text-xs font-semibold text-cyan-300">Auto-refreshes every 15 seconds</span></div>
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(250px,1fr)_minmax(300px,1.15fr)_minmax(260px,.9fr)]">
        <EmployeePicker employees={employees} value={selectedId} onChange={onEmployeeChange} allowAll={false} label="Employee Linked to Report" />
        <div><span className={labelClass}>Report Frequency</span><Segmented value={frequency} onChange={(value) => setFrequency(value as EmployeeReportFrequency)} ariaLabel="Employee report frequency" options={frequencyOptions.map((value) => ({ value, label: value }))} /></div>
        <label><span className={labelClass}>Report Content</span><select className={inputClass} value={reportKind} onChange={(event) => setReportKind(event.target.value as EmployeeReportKind)}>{reportKinds.map((kind) => <option value={kind.value} key={kind.value}>{kind.label}</option>)}</select><small className="mt-1 block text-[11px] text-slate-500">{reportKinds.find((kind) => kind.value === reportKind)?.description}</small></label>
        <div className="xl:col-span-2"><PeriodInput frequency={frequency} {...dateInput} onChange={(key, value) => setDateInput((current) => ({ ...current, [key]: value }))} /></div>
        <div className="flex flex-wrap items-end gap-2 xl:justify-end">
          <Button icon={<RefreshCw className="h-4 w-4" />} onClick={() => void snapshotQuery.refetch()}>Refresh</Button>
          <Button icon={<MapPinned className="h-4 w-4" />} onClick={() => onFieldMap(selectedId)}>Field Map</Button>
          <Button icon={<BookOpenText className="h-4 w-4" />} onClick={() => navigate(`/app/reports/salesman-ledger?employeeId=${encodeURIComponent(selectedId)}&filter.salesperson=${encodeURIComponent(snapshot.employee.name)}`)}>Sales Ledger</Button>
          {canExport ? <Button icon={<Download className="h-4 w-4" />} onClick={() => void exportCsv()}>CSV</Button> : null}
          {canPrint ? <PrintPreviewButton onClick={openPrintPreview} /> : null}
        </div>
      </div>
    </section>

    <section className="employee-report-screen overflow-hidden rounded-md border border-blue-200 bg-white shadow-sm" data-testid="employee-report-screen">
      <header className="border-l-4 border-red-600 bg-blue-50/70 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-blue-950 text-cyan-300"><Activity className="h-5 w-5" /></span><div className="min-w-0"><p className="text-[10px] font-bold uppercase text-cyan-800">Employee activity review</p><h2 className="truncate text-lg font-bold text-blue-950">{employeeReportTitle(reportKind, frequency)}</h2><p className="text-xs text-slate-600">Linked ERP activity and performance for management review</p></div></div><dl className="grid grid-cols-2 gap-x-5 gap-y-1 rounded-md border border-blue-100 bg-white px-3 py-2 text-xs"><div><dt className="text-slate-500">Reference</dt><dd className="font-bold text-blue-950">{reportReference}</dd></div><div><dt className="text-slate-500">Generated</dt><dd className="font-semibold text-slate-700">{dateTimeLabel(generatedAt.toISOString())}</dd></div></dl></div>
      </header>

      <section className="grid gap-4 border-b border-blue-200 bg-blue-50 px-5 py-5 sm:grid-cols-[auto_1fr] sm:px-7">
        <Avatar className="h-20 w-20 rounded-md border-2 border-white object-cover shadow-sm" src={snapshot.employee.avatarUrl} name={snapshot.employee.name} />
        <div className="min-w-0"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="text-xl font-bold text-blue-950">{snapshot.employee.name}</h3><p className="text-sm font-semibold text-cyan-800">{snapshot.employee.employeeCode} | {snapshot.employee.title}</p></div><StatusBadge status={snapshot.employee.status} /></div><div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4"><div><span className="block text-slate-500">Department</span><strong>{snapshot.employee.department}</strong></div><div><span className="block text-slate-500">Territory</span><strong>{snapshot.employee.territory ?? "Not assigned"}</strong></div><div><span className="block text-slate-500">Report Period</span><strong>{periodText}</strong></div><div><span className="block text-slate-500">Prepared By</span><strong>{actor.name}</strong></div></div></div>
      </section>

      <div className="grid gap-5 p-4 sm:p-6">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase text-cyan-700">Management summary</p><h3 className="font-bold text-blue-950">Recorded performance for {periodText}</h3></div><span className="hidden text-xs text-slate-500 sm:block">Data scope: {reportKinds.find((kind) => kind.value === reportKind)?.label}</span></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <Metric label="Activities" value={formatNumber(activities.length)} tone="blue" />
            <Metric label="Verified Visits" value={formatNumber(snapshot.performance.verifiedVisits)} tone="cyan" />
            <Metric label="New Leads" value={formatNumber(snapshot.performance.newLeads)} tone="green" />
            <Metric label="Orders" value={formatNumber(snapshot.performance.orders)} tone="amber" />
            <Metric label="Collections" value={formatCurrency(snapshot.performance.collectionsBdt, true)} tone="green" />
            <Metric label="Overall Target" value={`${formatNumber(snapshot.performance.progress.overall)}%`} tone={Number(snapshot.performance.progress.overall) >= 60 ? "blue" : "red"} />
          </div>
          <div className={`mt-3 flex gap-3 border px-4 py-3 text-sm ${overdueFollowUps ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{overdueFollowUps ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />}<div><strong className="block">Performance reading</strong><p className="mt-0.5 text-xs leading-5">{attentionText} {verifiedActivities} of {activities.length} displayed activities are system/GPS verified; {lateSubmissions} were submitted at least one hour after occurrence.</p></div></div>
        </section>

        {showTargets ? <section><div className="mb-3 flex items-center gap-2"><Target className="h-5 w-5 text-red-600" /><div><p className="text-[10px] font-bold uppercase text-slate-500">Performance against assigned target</p><h3 className="font-bold text-blue-950">Target vs Actual</h3></div></div><TargetTable row={snapshot.performance} /></section> : null}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
          <div><div className="mb-3"><p className="text-[10px] font-bold uppercase text-slate-500">Work composition</p><h3 className="font-bold text-blue-950">Activity Categories</h3></div><div className="grid gap-2 border border-slate-200 bg-white p-4">{categoryCounts.map(([type, count], index) => <div key={type}><div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-slate-700">{marketingActivityLabel(type)}</span><strong className="text-blue-950">{count}</strong></div><div className="mt-1 h-2 overflow-hidden rounded bg-slate-100"><span className={index === 0 ? "block h-full bg-blue-800" : index % 3 === 1 ? "block h-full bg-cyan-600" : index % 3 === 2 ? "block h-full bg-red-500" : "block h-full bg-emerald-500"} style={{ width: `${Math.max(5, count / totalForBars * 100)}%` }} /></div></div>)}{!categoryCounts.length ? <p className="py-5 text-center text-sm text-slate-500">No activity matches this report content and period.</p> : null}</div></div>
          <div><div className="mb-3"><p className="text-[10px] font-bold uppercase text-slate-500">Supporting indicators</p><h3 className="font-bold text-blue-950">Performance Details</h3></div><div className="grid grid-cols-2 gap-px overflow-hidden border border-slate-200 bg-slate-200"><Metric label="Check-ins" value={formatNumber(snapshot.performance.checkIns)} /><Metric label="Completed Visits" value={formatNumber(snapshot.performance.completedVisits)} tone="cyan" /><Metric label="Follow-ups Done" value={formatNumber(snapshot.performance.followUpsCompleted)} tone="green" /><Metric label="Overdue" value={formatNumber(snapshot.performance.overdueFollowUps)} tone={snapshot.performance.overdueFollowUps ? "red" : "green"} /><Metric label="Quotations" value={formatNumber(snapshot.performance.quotations)} tone="amber" /><Metric label="Activity Score" value={formatNumber(snapshot.performance.activityScore)} tone="blue" /></div></div>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase text-slate-500">User-ID linked detail</p><h3 className="font-bold text-blue-950">Employee Activity Log</h3></div><span className="text-xs text-slate-500">{activities.length} record{activities.length === 1 ? "" : "s"}</span></div>
          <div className="employee-report-mobile grid gap-2 md:hidden">{activities.map((activity) => <div className="border border-slate-200 bg-white p-3" key={activity.id}><div className="flex items-start justify-between gap-2"><strong className="text-sm">{marketingActivityLabel(activity.activityType)}</strong><StatusBadge status={activity.verification.replaceAll("_", " ")} /></div><p className="mt-1 text-sm text-slate-700">{activity.subjectName ?? "General activity"}</p><p className="mt-1 text-xs text-slate-500">{dateTimeLabel(activity.occurredAt)} | <SalesReferenceLink type={activity.referenceType} id={activity.referenceId} label={activity.referenceNumber ?? "Manual entry"} /></p><p className="mt-2 text-xs leading-5 text-slate-600">{activity.remarks ?? activity.purpose ?? "No additional outcome recorded."}</p></div>)}{!activities.length ? <div className="border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No matching activity was recorded.</div> : null}</div>
          <div className="employee-report-table hidden md:block"><TableFrame><table className="w-full min-w-[1080px] text-left text-xs"><thead className="bg-blue-950 text-[10px] uppercase text-white"><tr><th className="px-3 py-3">Occurred / Submitted</th><th className="px-3 py-3">Activity Category</th><th className="px-3 py-3">Customer / Lead</th><th className="px-3 py-3">Purpose & Outcome</th><th className="px-3 py-3">Verification</th><th className="px-3 py-3">Reference / Follow-up</th></tr></thead><tbody className="divide-y divide-slate-100 bg-white">{activities.map((activity) => <tr key={activity.id}><td className="whitespace-nowrap px-3 py-3 text-slate-600">{dateTimeLabel(activity.occurredAt)}<small className="mt-1 block text-slate-400">Submitted: {dateTimeLabel(activity.submittedAt)}</small></td><td className="px-3 py-3"><strong>{marketingActivityLabel(activity.activityType)}</strong><small className="mt-1 block text-slate-500">{activity.source.replaceAll("_", " ")}</small></td><td className="px-3 py-3 text-slate-700">{activity.subjectName ?? "General activity"}</td><td className="max-w-72 px-3 py-3 text-slate-600"><strong className="block text-slate-700">{activity.purpose ?? "General work"}</strong><span className="mt-1 block">{activity.remarks ?? "No additional outcome recorded."}</span></td><td className="px-3 py-3"><StatusBadge status={activity.verification.replaceAll("_", " ")} />{activity.latitude !== undefined ? <small className="mt-1 block text-slate-500">{activity.latitude.toFixed(4)}, {activity.longitude?.toFixed(4)}</small> : null}</td><td className="px-3 py-3 text-slate-600"><SalesReferenceLink type={activity.referenceType} id={activity.referenceId} label={activity.referenceNumber ?? "Manual"} /><small className="mt-1 block">{activity.nextFollowUpAt ? `Next: ${dateTimeLabel(activity.nextFollowUpAt)}` : "No next follow-up"}</small></td></tr>)}{!activities.length ? <tr><td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={6}>No matching activity was recorded in this period.</td></tr> : null}</tbody></table></TableFrame></div>
        </section>

        {showPlans ? <section><div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-cyan-700" /><div><p className="text-[10px] font-bold uppercase text-slate-500">Plan completion</p><h3 className="font-bold text-blue-950">Daily & Monthly Plan Review</h3></div></div><span className="text-xs font-semibold text-slate-600">{completedPlanVisits} / {plannedVisits.length} field items completed</span></div><div className="grid gap-3 lg:grid-cols-2"><div className="border border-slate-200 bg-white"><div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">Daily planned work</div><div className="divide-y divide-slate-100">{snapshot.dailyPlans.flatMap((plan) => plan.plannedVisits.map((visit) => <div className="flex gap-3 p-3" key={`${plan.id}-${visit.id}`}><Activity className={`mt-0.5 h-4 w-4 shrink-0 ${visit.completed ? "text-emerald-600" : "text-amber-600"}`} /><div className="min-w-0"><strong className="block text-sm">{visit.subjectName}</strong><span className="text-xs text-slate-500">{dateLabel(plan.date)} | {visit.plannedTime || "Open time"} | {visit.purpose}</span></div></div>))}{!snapshot.dailyPlans.length ? <p className="p-6 text-center text-sm text-slate-500">No daily plan was submitted in this period.</p> : null}</div></div><div className="border border-slate-200 bg-white"><div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">Monthly direction</div><div className="divide-y divide-slate-100">{snapshot.monthlyPlans.map((plan) => <div className="p-3" key={plan.id}><div className="flex items-start justify-between gap-2"><strong className="text-sm">{plan.month} | {plan.territory}</strong><StatusBadge status={plan.status} /></div><p className="mt-1 text-xs text-slate-600">Planned activities: {plan.plannedActivities} | Priority: {plan.prioritySubjects.join(", ")}</p>{plan.notes ? <p className="mt-1 text-xs text-slate-500">{plan.notes}</p> : null}</div>)}{!snapshot.monthlyPlans.length ? <p className="p-6 text-center text-sm text-slate-500">No monthly plan covers this period.</p> : null}</div></div></div></section> : null}

        {showFollowUps ? <section><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase text-slate-500">Next actions</p><h3 className="font-bold text-blue-950">Follow-up Status</h3></div><span className="text-xs text-slate-500">{openFollowUps.length} open</span></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{snapshot.followUps.map((item) => <div className={`border p-3 ${item.status === "OVERDUE" ? "border-rose-200 bg-rose-50" : item.status === "COMPLETED" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`} key={item.id}><div className="flex items-start justify-between gap-2"><strong className="text-sm text-slate-900">{item.subjectName}</strong><StatusBadge status={item.status} /></div><p className="mt-2 text-xs text-slate-600">{item.purpose}</p><span className="mt-2 block text-[11px] font-semibold text-slate-500">Due: {dateTimeLabel(item.dueAt)}</span></div>)}{!snapshot.followUps.length ? <p className="border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 sm:col-span-2 xl:col-span-3">No follow-up falls inside this report period.</p> : null}</div></section> : null}

        {showPipeline ? <section><div className="mb-3"><p className="text-[10px] font-bold uppercase text-slate-500">Assigned business opportunities</p><h3 className="font-bold text-blue-950">Lead Pipeline</h3></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{activeLeads.map((lead) => <div className="border-l-4 border-cyan-600 bg-white p-3 shadow-sm" key={lead.id}><div className="flex items-start justify-between gap-2"><strong className="text-sm">{lead.organizationName}</strong><StatusBadge status={lead.stage} /></div><p className="mt-1 text-xs text-slate-500">{lead.leadNumber} | {lead.organizationType}</p><p className="mt-2 text-xs text-slate-600">Next: {lead.nextFollowUpAt ? dateTimeLabel(lead.nextFollowUpAt) : "Not scheduled"}</p></div>)}{!activeLeads.length ? <p className="border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 sm:col-span-2 lg:col-span-3">No active lead was created in this report period.</p> : null}</div></section> : null}

        <div className="rounded-md border border-blue-100 bg-blue-50/50 px-4 py-3 text-xs leading-5 text-slate-600"><strong className="text-blue-950">Data note:</strong> Employee-submitted field activity and connected ERP transactions are shown for the selected period. Financial values reflect posted records; the activity score follows configured rules and is not a subjective employee rating. Signatures and official stationery appear only in the print output.</div>
      </div>
    </section>
  </div>;
}
