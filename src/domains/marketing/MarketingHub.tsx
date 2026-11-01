import { attachmentAccept } from "../../lib/files/attachments";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SalesReferenceLink from "../sales/SalesReferenceLink";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileBarChart,
  Flag,
  MapPinned,
  MessageSquareText,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Route,
  Save,
  Target,
  Trash2,
  UserPlus
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import DocumentViewer, { readDocumentUpload } from "../../components/documents/DocumentViewer";
import EmployeePicker from "../../components/employees/EmployeePicker";
import Button from "../../components/ui/Button";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAuthStore } from "../../lib/auth/session";
import { businessDate } from "../../lib/date";
import { canViewManagedEmployeeActivity, getMarketingEmployeeScope, hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { useToastStore } from "../../lib/ui/toast";
import type { User } from "../../types";
import { formatCurrency, formatNumber } from "../../utils/format";
import { EmptyState, ErrorBlock, LoadingBlock, Modal, Panel, ProductThumb, Segmented, TableFrame, inputClass, labelClass, textareaClass } from "../components";
import type {
  Customer,
  DailyMarketingPlan,
  DocumentRecord,
  DocumentUpload,
  EmployeeDirectoryEntry,
  EmployeeMarketingSnapshot,
  EmployeeMarketingTarget,
  MarketingActivity,
  MarketingActivityType,
  MarketingFollowUp,
  MarketingLead,
  MarketingPerformanceRow,
  MonthlyMarketingPlan,
  Product
} from "../erp.types";
import { employeeService, marketingService, salesService, settingsService } from "../services";
import { activitiesWithoutCustomer, manualActivityCategoryGroups, marketingActivityLabel } from "./activityCategories";

const FieldTeamPage = lazy(() => import("../../components/field-team/FieldTeamPage"));

type ModalType = "activity" | "lead" | "follow-up" | "daily-plan" | "monthly-plan" | "target" | "follow-ups" | "leads" | "report" | "snapshot" | "convert" | null;
type Task = { run: () => Promise<unknown>; success: string; keepOpen?: boolean };

const funnelStages: MarketingLead["stage"][] = ["NEW", "CONTACTED", "INTERESTED", "PRESENTATION", "SAMPLE", "QUOTATION", "NEGOTIATION", "ORDER", "DELIVERED", "PAYMENT", "LOST"];

function dateTimeLabel(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value} | Time unavailable`;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function localDateTime(value = new Date()) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function lateSubmission(activity: MarketingActivity) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(activity.occurredAt) || /^\d{4}-\d{2}-\d{2}$/.test(activity.submittedAt)) return "";
  const minutes = Math.max(0, Math.round((new Date(activity.submittedAt).getTime() - new Date(activity.occurredAt).getTime()) / 60_000));
  if (minutes < 60) return "";
  const hours = Math.floor(minutes / 60);
  return `Submitted ${hours}h ${minutes % 60}m later`;
}

function activityName(type: MarketingActivityType) {
  return marketingActivityLabel(type);
}

function activityIcon(type: MarketingActivityType) {
  if (type === "LEAD_CREATED" || type === "LEAD_CONVERTED") return UserPlus;
  if (type === "CHECK_IN" || type === "CHECK_OUT") return MapPinned;
  if (type === "QUOTATION_SUBMITTED") return FileBarChart;
  if (type === "ORDER_RECEIVED") return PackageCheck;
  if (type === "PAYMENT_COLLECTED") return CircleDollarSign;
  if (type === "FOLLOW_UP_COMPLETED") return CalendarCheck;
  return MessageSquareText;
}

function progressTone(value: string) {
  const number = Number(value);
  if (number >= 90) return "bg-emerald-500";
  if (number >= 60) return "bg-cyan-600";
  return "bg-amber-500";
}

export default function MarketingHub({ onCreateQuotation }: { onCreateQuotation?: (customerId: string, leadId: string) => void }) {
  const session = useAuthStore((state) => state.session);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [modal, setModal] = useState<ModalType>(null);
  const [followUpView, setFollowUpView] = useState<"Today" | "Overdue" | "Upcoming" | "Completed">("Today");
  const [snapshotEmployeeId, setSnapshotEmployeeId] = useState("");
  const [convertLead, setConvertLead] = useState<MarketingLead>();
  const [contextLead, setContextLead] = useState<MarketingLead>();
  const [leadStageFilter, setLeadStageFilter] = useState<MarketingLead["stage"]>();
  const [viewingDocument, setViewingDocument] = useState<DocumentRecord | null>(null);
  const employeeScope = getMarketingEmployeeScope(session?.user);
  const selfScope = employeeScope === "SELF";
  const managedScope = canViewManagedEmployeeActivity(session?.user);
  const canCreate = hasEffectivePermission(session?.user, "marketing", "create");
  const canReportActivity = canCreate && selfScope;
  const canEdit = hasEffectivePermission(session?.user, "marketing", "edit");
  const canApprove = hasEffectivePermission(session?.user, "marketing", "approve");
  const canCreateQuote = hasEffectivePermission(session?.user, "sales", "create");
  const canViewCustomers = hasEffectivePermission(session?.user, "customers", "view");
  const canViewMap = employeeScope !== "NONE";
  const mapOpen = params.get("marketing") === "field-team" || params.get("view") === "field-team";

  const dashboardQuery = useQuery({ queryKey: ["marketing", "dashboard", session?.user.id], queryFn: marketingService.dashboard, refetchInterval: 12_000, refetchIntervalInBackground: true });
  const directoryQuery = useQuery({ queryKey: ["employees", "directory", "marketing", session?.user.id], queryFn: () => employeeService.directory("marketing") });
  const monthlyPlansQuery = useQuery({ queryKey: ["marketing", "monthly-plans", businessDate().slice(0, 7), session?.user.id], queryFn: () => marketingService.monthlyPlans(businessDate().slice(0, 7)) });
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: settingsService.products });
  const customersQuery = useQuery({ queryKey: ["sales", "customers", session?.user.id], queryFn: salesService.customers, enabled: canViewCustomers });
  const snapshotQuery = useQuery({ queryKey: ["marketing", "snapshot", snapshotEmployeeId], queryFn: () => marketingService.employeeSnapshot(snapshotEmployeeId), enabled: Boolean(snapshotEmployeeId && modal === "snapshot") });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["marketing"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["reports"] });
    void queryClient.invalidateQueries({ queryKey: ["sales"] });
  };
  const action = useMutation({
    mutationFn: (task: Task) => task.run(),
    onSuccess: (_data, task) => {
      refresh();
      if (!task.keepOpen) {
        setModal(null);
        setConvertLead(undefined);
        setContextLead(undefined);
      }
      pushToast({ kind: "success", title: task.success });
    },
    onError: (error) => pushToast({ kind: "error", title: "Marketing action failed", message: error instanceof Error ? error.message : undefined })
  });

  const data = dashboardQuery.data;
  const employees = directoryQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const customers = customersQuery.data ?? [];
  const monthlyPlans = monthlyPlansQuery.data ?? [];
  const subjectProducts = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  useEffect(() => {
    const employeeId = params.get("employee");
    if (employeeId && directoryQuery.isSuccess && !employees.some((employee) => employee.id === employeeId)) {
      setSnapshotEmployeeId("");
      setModal(null);
      setParams({ view: "marketing" }, { replace: true });
      return;
    }
    if (employeeId && !mapOpen && employeeId !== snapshotEmployeeId) {
      setSnapshotEmployeeId(employeeId);
      setModal("snapshot");
    }
  }, [directoryQuery.isSuccess, employees, mapOpen, params, setParams, snapshotEmployeeId]);

  useEffect(() => {
    const requestedAction = params.get("action");
    const permittedModal: ModalType = requestedAction === "activity" && canReportActivity
      ? "activity"
      : requestedAction === "lead" && canCreate
        ? "lead"
        : requestedAction === "follow-up" && canCreate
          ? "follow-up"
          : requestedAction === "daily-plan" && canCreate && selfScope
            ? "daily-plan"
            : null;
    if (!requestedAction) return;
    if (permittedModal) setModal(permittedModal);
    const next = new URLSearchParams(params);
    next.delete("action");
    setParams(next, { replace: true });
  }, [canCreate, canReportActivity, params, selfScope, setParams]);

  if (mapOpen && managedScope) return <Navigate to={`/app/employees?view=field-team${params.get("employee") ? `&employee=${encodeURIComponent(params.get("employee")!)}` : ""}`} replace />;
  if (mapOpen && canViewMap) {
    return <Suspense fallback={<LoadingBlock label="Loading field team map" />}><div className="grid gap-3"><Button className="w-fit" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setParams({ view: "marketing" }, { replace: true })}>Back to Marketing</Button><FieldTeamPage marketingEmbedded /></div></Suspense>;
  }
  if (dashboardQuery.isLoading || directoryQuery.isLoading || monthlyPlansQuery.isLoading || productsQuery.isLoading || (canViewCustomers && customersQuery.isLoading)) return <LoadingBlock label="Loading today's marketing operations" />;
  const error = dashboardQuery.error ?? directoryQuery.error ?? monthlyPlansQuery.error ?? productsQuery.error ?? customersQuery.error;
  if (error || !data) return <ErrorBlock error={error ?? new Error("Marketing data is unavailable.")} onRetry={() => { void dashboardQuery.refetch(); void directoryQuery.refetch(); void monthlyPlansQuery.refetch(); void productsQuery.refetch(); }} />;

  const today = data.businessDate;
  const todayFollowUps = data.followUps.filter((item) => item.status === "PENDING" && businessDate(new Date(item.dueAt)) === today);
  const overdueFollowUps = data.followUps.filter((item) => item.status === "OVERDUE");
  const upcomingFollowUps = data.followUps.filter((item) => item.status === "PENDING" && businessDate(new Date(item.dueAt)) > today);
  const completedFollowUps = data.followUps.filter((item) => item.status === "COMPLETED");
  const followUpRows = followUpView === "Today" ? todayFollowUps : followUpView === "Overdue" ? overdueFollowUps : followUpView === "Upcoming" ? upcomingFollowUps : completedFollowUps;
  const maxFunnel = Math.max(1, ...data.funnel.map((entry) => entry.count));

  const openSnapshot = (employeeId: string) => {
    setSnapshotEmployeeId(employeeId);
    setModal("snapshot");
  };
  const openEmployee = (employeeId: string) => managedScope ? navigate(`/app/employees?view=activity&employee=${employeeId}`) : openSnapshot(employeeId);
  const openLeads = (stage?: MarketingLead["stage"]) => {
    setLeadStageFilter(stage);
    setModal("leads");
  };

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-blue-950 text-cyan-300"><Activity className="h-5 w-5" /></span>
          <div className="min-w-0"><h2 className="text-lg font-bold text-slate-950">{selfScope ? "My Marketing Day" : "Marketing Operations"}</h2><p className="truncate text-xs text-slate-500">Employee updates and sales activity for today | refreshes every 12 seconds</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canReportActivity ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { setContextLead(undefined); setModal("activity"); }}>Report Activity</Button> : null}
          {canCreate ? <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setModal("lead")}>New Lead</Button> : null}
          {canCreate ? <Button icon={<CalendarCheck className="h-4 w-4" />} onClick={() => { setContextLead(undefined); setModal("follow-up"); }}>Follow-up</Button> : null}
          {selfScope ? <Button icon={<MapPinned className="h-4 w-4" />} onClick={() => setParams({ view: "marketing", marketing: "field-team" }, { replace: true })}>Check In / Out</Button> : null}
          {!selfScope ? <Button icon={<FileBarChart className="h-4 w-4" />} onClick={() => setModal("report")}>Generate Report</Button> : null}
          <details className="relative">
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><MoreHorizontal className="h-4 w-4" />More</summary>
            <div className="absolute right-0 z-20 mt-1 grid w-48 gap-1 rounded-md border border-slate-200 bg-white p-1.5 shadow-xl">
              {selfScope && canCreate ? <button className="rounded px-3 py-2 text-left text-sm font-semibold hover:bg-slate-50" type="button" onClick={() => setModal("daily-plan")}>Daily Plan</button> : null}
              {canCreate ? <button className="rounded px-3 py-2 text-left text-sm font-semibold hover:bg-slate-50" type="button" onClick={() => setModal("monthly-plan")}>Monthly Plan</button> : null}
              {selfScope ? <button className="rounded px-3 py-2 text-left text-sm font-semibold hover:bg-slate-50" type="button" onClick={() => setModal("report")}>Generate Report</button> : null}
              {canApprove ? <button className="rounded px-3 py-2 text-left text-sm font-semibold hover:bg-slate-50" type="button" onClick={() => setModal("target")}>Set Target</button> : null}
            </div>
          </details>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8" aria-label="Marketing key performance indicators">
        {data.metrics.map((metric, index) => (
          <button className="min-h-24 rounded-md border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-cyan-400 hover:shadow" type="button" key={metric.id} onClick={() => metric.id === "overdue" ? (setFollowUpView("Overdue"), setModal("follow-ups")) : undefined}>
            <span className="block text-[11px] font-semibold text-slate-500">{metric.label}</span>
            <strong className={`mt-2 block break-words text-xl ${metric.id === "overdue" && Number(metric.value) ? "text-rose-700" : index === data.metrics.length - 1 ? "text-emerald-700" : "text-slate-950"}`}>{metric.unit === "BDT" ? formatCurrency(metric.value, true) : formatNumber(metric.value)}{metric.unit === "%" ? "%" : ""}</strong>
            {!['BDT', '%'].includes(metric.unit) ? <small className="mt-1 block text-[10px] uppercase text-slate-400">{metric.unit}</small> : null}
          </button>
        ))}
      </section>

      {selfScope && data.dailyPlan ? <Panel title="Today's Plan" subtitle={`${data.dailyPlan.plannedVisits.filter((item) => item.completed).length} completed | ${data.dailyPlan.plannedVisits.filter((item) => !item.completed).length} remaining`} actions={canCreate ? <Button variant="ghost" icon={<CalendarCheck className="h-4 w-4" />} onClick={() => setModal("daily-plan")}>Update Plan</Button> : undefined}>
        <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">{data.dailyPlan.plannedVisits.map((visit) => <div className="flex gap-3 p-4" key={visit.id}>{visit.completed ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Clock3 className="h-5 w-5 shrink-0 text-amber-600" />}<div className="min-w-0"><strong className="block truncate text-sm">{visit.subjectName}</strong><span className="block text-xs text-slate-500">{visit.plannedTime ?? "Open time"} | {visit.purpose}</span></div></div>)}</div>
      </Panel> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.75fr)]">
        <Panel title="Live Activity" subtitle="Employee updates and sales activity for today" actions={<Button variant="ghost" icon={<Route className="h-4 w-4" />} onClick={() => openLeads()}>Open Leads</Button>}>
          <div className="divide-y divide-slate-100">
            {data.activities.slice(0, 12).map((activity) => {
              const Icon = activityIcon(activity.activityType);
              const product = activity.productIds?.[0] ? subjectProducts.get(activity.productIds[0]) : undefined;
              const late = lateSubmission(activity);
              return <div className="flex gap-3 px-4 py-3" key={activity.id}><span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded bg-cyan-50 text-cyan-800"><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><strong className="text-sm text-slate-950">{activityName(activity.activityType)}</strong><StatusBadge status={activity.verification.replaceAll("_", " ")} />{activity.source !== "MANUAL" ? <span className="text-[10px] font-bold uppercase text-blue-700">ERP</span> : null}</div><p className="mt-0.5 text-sm text-slate-700">{activity.subjectName ?? activity.purpose ?? "Marketing update"}</p><div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-500"><button className="font-semibold text-cyan-800 hover:underline" type="button" onClick={() => openEmployee(activity.userId)}>{activity.employeeName}</button><span>| {activity.territory ?? "No territory"}</span><time>{dateTimeLabel(activity.occurredAt)}</time>{activity.referenceNumber ? <SalesReferenceLink type={activity.referenceType} id={activity.referenceId} label={activity.referenceNumber} /> : null}{late ? <span className="text-amber-700">{late}</span> : null}</div>{activity.remarks ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{activity.remarks}</p> : null}{activity.attachments?.map((document) => <button className="mt-1 text-xs font-semibold text-cyan-800 hover:underline" type="button" key={document.id} onClick={() => setViewingDocument(document)}>{document.fileName}</button>)}</div>{product ? <ProductThumb src={product.imageUrl} name={product.name} size="sm" /> : null}</div>;
            })}
            {!data.activities.length ? <EmptyState title="No marketing activity" message="The first submitted activity or connected ERP transaction will appear here." /> : null}
          </div>
        </Panel>

        <Panel title="Follow-up Attention" subtitle="Follow-ups that need action" actions={<Button variant="ghost" icon={<ArrowRight className="h-4 w-4" />} onClick={() => setModal("follow-ups")}>Open Queue</Button>}>
          <div className="grid grid-cols-2 border-b border-slate-200 sm:grid-cols-4 xl:grid-cols-2">
            {[{ label: "Today", value: todayFollowUps.length, tone: "text-blue-800" }, { label: "Overdue", value: overdueFollowUps.length, tone: "text-rose-700" }, { label: "Upcoming", value: upcomingFollowUps.length, tone: "text-amber-700" }, { label: "Completed", value: completedFollowUps.length, tone: "text-emerald-700" }].map((entry) => <button className="border-b border-r border-slate-100 p-3 text-left hover:bg-slate-50" type="button" key={entry.label} onClick={() => { setFollowUpView(entry.label as typeof followUpView); setModal("follow-ups"); }}><span className="block text-[10px] font-bold uppercase text-slate-400">{entry.label}</span><strong className={`mt-1 block text-xl ${entry.tone}`}>{entry.value}</strong></button>)}
          </div>
          <div className="divide-y divide-slate-100">{[...overdueFollowUps, ...todayFollowUps].slice(0, 5).map((item) => <div className="px-4 py-3" key={item.id}><div className="flex items-start justify-between gap-3"><strong className="min-w-0 truncate text-sm">{item.subjectName}</strong><StatusBadge status={item.status} /></div><p className="mt-1 text-xs text-slate-500">{item.purpose}</p><time className="mt-1 block text-[11px] font-semibold text-slate-500">{dateTimeLabel(item.dueAt)}</time></div>)}</div>
        </Panel>
      </div>

      <Panel title="Marketing Funnel" subtitle="Activity and ERP transactions advance stages without duplicate reporting">
        <div className="overflow-x-auto p-4"><div className="grid min-w-[1188px] grid-cols-11 gap-2">{funnelStages.map((stage, index) => {
          const count = data.funnel.find((entry) => entry.stage === stage)?.count ?? 0;
          return <button className={`min-h-24 border-l-2 p-3 text-left ${stage === "LOST" ? "border-rose-400 bg-rose-50" : "border-cyan-500 bg-slate-50"}`} type="button" key={stage} onClick={() => openLeads(stage)}><span className="block text-[10px] font-bold text-slate-500">{String(index + 1).padStart(2, "0")}</span><strong className="mt-1 block whitespace-nowrap text-[10px] leading-4 text-slate-800">{stage}</strong><span className="mt-2 block text-xl font-bold text-slate-950">{count}</span><span className="mt-1 block h-1 bg-slate-200"><span className={`block h-full ${stage === "LOST" ? "bg-rose-500" : "bg-cyan-600"}`} style={{ width: `${count / maxFunnel * 100}%` }} /></span></button>;
        })}</div></div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Panel title="Field Team" subtitle="Foreground demo tracking and visit verification">
          <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 p-1">{[
            ["Active", data.fieldTeam.activeNow, "text-emerald-700"], ["Recent", data.fieldTeam.recent, "text-cyan-700"], ["Offline", data.fieldTeam.offline, "text-slate-700"], ["Visits Today", data.fieldTeam.visitsToday, "text-blue-800"]
          ].map(([label, value, tone]) => <div className="p-3" key={String(label)}><span className="text-[10px] font-bold uppercase text-slate-400">{label}</span><strong className={`mt-1 block text-2xl ${tone}`}>{value}</strong></div>)}</div>
          {canViewMap ? <div className="border-t border-slate-200 p-3"><Button className="w-full" variant="primary" icon={<MapPinned className="h-4 w-4" />} onClick={() => managedScope ? navigate("/app/employees?view=field-team") : setParams({ view: "marketing", marketing: "field-team" }, { replace: true })}>Open Field Team</Button></div> : null}
        </Panel>

        <Panel title={selfScope ? "My Performance" : "Team Performance"} subtitle="Sales, collection, visits and target progress" actions={<>{selfScope && canCreate ? <Button variant="ghost" icon={<Flag className="h-4 w-4" />} onClick={() => setModal("daily-plan")}>Daily Plan</Button> : null}{canApprove ? <Button variant="ghost" icon={<Target className="h-4 w-4" />} onClick={() => setModal("target")}>Set Target</Button> : null}</>}>
          {!selfScope ? <div className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-100 sm:grid-cols-4">{[
            ["Below Target", data.performance.filter((row) => Number(row.progress.overall) < 60).length, "text-amber-700"],
            ["Overdue Follow-ups", data.performance.filter((row) => row.overdueFollowUps > 0).length, "text-rose-700"],
            ["No Activity", data.performance.filter((row) => row.activityCount === 0).length, "text-slate-700"],
            ["Unverified Visits", data.performance.filter((row) => row.completedVisits > row.verifiedVisits).length, "text-blue-800"]
          ].map(([label, value, tone]) => <div className="bg-white p-3" key={String(label)}><span className="text-[10px] font-bold uppercase text-slate-400">{label}</span><strong className={`mt-1 block text-xl ${tone}`}>{value}</strong></div>)}</div> : null}
          <TableFrame><table className="min-w-[920px] w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3 text-right">Visits</th><th className="px-4 py-3 text-right">Leads</th><th className="px-4 py-3 text-right">Quotes</th><th className="px-4 py-3 text-right">Orders</th><th className="px-4 py-3 text-right">Collection</th><th className="px-4 py-3 text-right">Score</th><th className="px-4 py-3">Target</th></tr></thead><tbody className="divide-y divide-slate-100">{data.performance.map((row) => <tr className="cursor-pointer hover:bg-slate-50" key={row.employee.id} onClick={() => openEmployee(row.employee.id)}><td className="px-4 py-3"><strong className="block">{row.employee.name}</strong><span className="text-xs text-slate-500">{row.employee.employeeCode} | {row.employee.territory ?? "Unassigned"}</span></td><td className="px-4 py-3 text-right"><b>{row.verifiedVisits}</b><span className="block text-[10px] text-slate-400">{row.completedVisits} completed</span></td><td className="px-4 py-3 text-right">{row.qualifiedLeads}<span className="block text-[10px] text-slate-400">{row.newLeads} new</span></td><td className="px-4 py-3 text-right">{row.quotations}</td><td className="px-4 py-3 text-right">{row.orders}</td><td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatCurrency(row.collectionsBdt, true)}</td><td className="px-4 py-3 text-right font-bold text-blue-900">{row.activityScore}</td><td className="w-40 px-4 py-3"><div className="flex justify-between text-xs"><span>Overall</span><b>{Number(row.progress.overall).toFixed(0)}%</b></div><div className="mt-1 h-1.5 rounded bg-slate-100"><span className={`block h-full rounded ${progressTone(row.progress.overall)}`} style={{ width: `${Math.min(100, Number(row.progress.overall))}%` }} /></div></td></tr>)}</tbody></table></TableFrame>
        </Panel>
      </div>

      <Modal open={modal === "activity" && canReportActivity} title="Report Daily Field Activity" subtitle="The signed-in employee name and ID are linked automatically to every submitted activity." onClose={() => { setModal(null); setContextLead(undefined); }} width="max-w-4xl"><ActivityForm employee={session?.user} initialSubject={contextLead ? `lead:${contextLead.id}` : undefined} initialActivityType={contextLead ? "CUSTOMER_VISIT" : undefined} leads={data.leads} customers={customers} products={products} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => marketingService.createActivity(payload), success: "Daily field activity submitted" })} /></Modal>
      <Modal open={modal === "lead"} title="Add Marketing Lead" subtitle="Prospects stay separate from financial customers until qualification." onClose={() => setModal(null)} width="max-w-4xl"><LeadForm employees={employees} products={products} ownUserId={session?.user.id ?? ""} lockEmployee={selfScope} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => marketingService.createLead(payload), success: "Marketing lead created" })} /></Modal>
      <Modal open={modal === "follow-up"} title="Schedule Follow-up" subtitle="The saved due date places this follow-up in Today, Overdue or Upcoming automatically." onClose={() => { setModal(null); setContextLead(undefined); }}><FollowUpForm initialLead={contextLead} employees={employees} leads={data.leads} customers={customers} ownUserId={session?.user.id ?? ""} lockEmployee={selfScope} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => marketingService.createFollowUp(payload), success: "Follow-up scheduled" })} /></Modal>
      <Modal open={modal === "daily-plan"} title="Daily Marketing Plan" subtitle="Choose customers or leads; field check-out marks planned visits complete." onClose={() => setModal(null)} width="max-w-3xl"><DailyPlanForm plan={data.dailyPlan} userId={session?.user.id ?? ""} leads={data.leads} customers={customers} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => marketingService.saveDailyPlan(payload), success: "Daily marketing plan saved" })} /></Modal>
      <Modal open={modal === "monthly-plan"} title="Monthly Marketing Plan" subtitle="Plan priority organizations, products and activity volume; actuals come from completed work." onClose={() => setModal(null)} width="max-w-3xl"><MonthlyPlanForm employees={employees} products={products} plans={monthlyPlans} ownUserId={session?.user.id ?? ""} lockEmployee={selfScope} canApprove={canApprove} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => marketingService.saveMonthlyPlan(payload), success: "Monthly marketing plan saved" })} /></Modal>
      <Modal open={modal === "target"} title="Monthly Marketing Target" subtitle="Actual values come from delivered sales, posted collections, verified visits and converted customers." onClose={() => setModal(null)}><TargetForm employees={employees} rows={data.performance} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => marketingService.saveTarget(payload), success: "Monthly target saved" })} /></Modal>
      <Modal open={modal === "follow-ups"} title="Follow-up Queue" subtitle="Follow-ups that need action, arranged by due date and completion status." onClose={() => setModal(null)} width="max-w-6xl"><FollowUpQueue view={followUpView} onView={setFollowUpView} rows={followUpRows} canEdit={canEdit} busy={action.isPending} onComplete={(followUp, outcome) => action.mutate({ run: () => marketingService.updateFollowUp(followUp.id, { status: "COMPLETED", outcome }), success: "Follow-up completed", keepOpen: true })} onReschedule={(followUp, dueAt) => action.mutate({ run: () => marketingService.updateFollowUp(followUp.id, { dueAt: new Date(dueAt).toISOString() }), success: "Follow-up rescheduled", keepOpen: true })} /></Modal>
      <Modal open={modal === "leads"} title={leadStageFilter ? `${leadStageFilter.replaceAll("_", " ")} Leads` : "Lead Pipeline"} subtitle={leadStageFilter ? `Showing only leads in the ${leadStageFilter.replaceAll("_", " ").toLowerCase()} stage.` : "Conversion preserves assignment and carries the customer into quotation without re-entry."} onClose={() => { setModal(null); setLeadStageFilter(undefined); }} width="max-w-6xl"><LeadQueue leads={leadStageFilter ? data.leads.filter((lead) => lead.stage === leadStageFilter) : data.leads} stageFilter={leadStageFilter} onClearStage={() => setLeadStageFilter(undefined)} employees={employees} products={products} canCreate={canCreate} canReportActivity={canReportActivity} canCreateCustomer={hasEffectivePermission(session?.user, "customers", "create")} canCreateQuote={canCreateQuote} onFollowUp={(lead) => { setContextLead(lead); setModal("follow-up"); }} onVisit={(lead) => { setContextLead(lead); setModal("activity"); }} onConvert={(lead) => { setConvertLead(lead); setModal("convert"); }} onQuote={(lead) => lead.customerId && onCreateQuotation?.(lead.customerId, lead.id)} /></Modal>
      <Modal open={modal === "convert" && Boolean(convertLead)} title={`Convert ${convertLead?.leadNumber ?? "Lead"} to Customer`} subtitle="The lead remains in history and becomes the marketing context for the customer." onClose={() => { setModal("leads"); setConvertLead(undefined); }}><ConvertLeadForm lead={convertLead!} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => marketingService.convertLead(convertLead!.id, payload), success: "Lead converted to customer" })} /></Modal>
      <Modal open={modal === "report"} title="Open Marketing Analysis" subtitle={selfScope ? "Review your own operational activity in Reports." : "Review grouped team operations in Reports; named employee reports stay in Employees."} onClose={() => setModal(null)}><QuickReportMenu userId={session?.user.id ?? ""} executive={selfScope} onOpen={navigate} /></Modal>
      <Modal open={modal === "snapshot"} title="Employee Marketing Snapshot" subtitle="Today, targets, activity, follow-ups and funnel context in one view." onClose={() => { setModal(null); setSnapshotEmployeeId(""); if (params.get("employee")) setParams({ view: "marketing" }, { replace: true }); }} width="max-w-5xl">{snapshotQuery.isLoading ? <LoadingBlock label="Building employee snapshot" /> : snapshotQuery.isError || !snapshotQuery.data ? <ErrorBlock error={snapshotQuery.error} /> : <SnapshotView snapshot={snapshotQuery.data} onMap={() => managedScope ? navigate(`/app/employees?view=field-team&employee=${snapshotEmployeeId}`) : setParams({ view: "marketing", marketing: "field-team", employee: snapshotEmployeeId })} reportLabel={managedScope ? "Employee Report" : "My Analysis"} onReport={() => navigate(`/app/reports/employee-activity?employeeId=${encodeURIComponent(snapshotEmployeeId)}`)} />}</Modal>
      <DocumentViewer document={viewingDocument} onClose={() => setViewingDocument(null)} />
    </div>
  );
}

function ActivityForm({ employee, initialSubject = "", initialActivityType = "CUSTOMER_CONTACT", leads, customers, products, busy, onSubmit }: { employee?: User; initialSubject?: string; initialActivityType?: MarketingActivityType; leads: MarketingLead[]; customers: Customer[]; products: Product[]; busy: boolean; onSubmit: (payload: Partial<MarketingActivity> & { attachmentUpload?: DocumentUpload }) => void }) {
  const [form, setForm] = useState({ activityType: initialActivityType, subject: initialSubject, occurredAt: localDateTime(), purpose: "", remarks: "", nextFollowUpAt: "", productIds: [] as string[] });
  const [attachmentUpload, setAttachmentUpload] = useState<DocumentUpload>();
  const [attachmentError, setAttachmentError] = useState("");
  const change = (key: keyof typeof form, value: string | string[]) => setForm((current) => ({ ...current, [key]: value }));
  const selectedLead = form.subject.startsWith("lead:") ? form.subject.slice(5) : undefined;
  const selectedCustomer = form.subject.startsWith("customer:") ? form.subject.slice(9) : undefined;
  const toggleProduct = (productId: string) => change("productIds", form.productIds.includes(productId) ? form.productIds.filter((id) => id !== productId) : [...form.productIds, productId]);
  const customerOptional = activitiesWithoutCustomer.includes(form.activityType);
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit({ activityType: form.activityType, leadId: selectedLead, customerId: selectedCustomer, occurredAt: new Date(form.occurredAt).toISOString(), purpose: form.purpose, remarks: form.remarks, nextFollowUpAt: form.nextFollowUpAt ? new Date(form.nextFollowUpAt).toISOString() : undefined, productIds: form.productIds, attachmentUpload }); }}>
    <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 sm:col-span-2"><span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-blue-950 text-xs font-bold text-white">{employee?.name.split(" ").map((part) => part[0]).slice(0, 2).join("") || "ID"}</span><div className="min-w-0"><strong className="block truncate text-sm text-blue-950">Reporting as {employee?.name ?? "signed-in employee"}</strong><span className="block text-xs text-blue-700">{employee?.employeeCode ?? "Employee ID"} | {employee?.title ?? "Marketing team"} | identity locked to this login</span></div></div>
    <label><span className={labelClass}>Activity Category</span><select className={inputClass} value={form.activityType} onChange={(event) => change("activityType", event.target.value)}>{manualActivityCategoryGroups.map((group) => <optgroup label={group.label} key={group.label}>{group.options.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</optgroup>)}</select></label>
    <label><span className={labelClass}>Occurred At</span><input className={inputClass} type="datetime-local" max={localDateTime()} required value={form.occurredAt} onChange={(event) => change("occurredAt", event.target.value)} /></label>
    <label className="sm:col-span-2"><span className={labelClass}>Customer / Lead {customerOptional ? "(optional)" : ""}</span><select className={inputClass} required={!customerOptional} value={form.subject} onChange={(event) => change("subject", event.target.value)}><option value="">{customerOptional ? "General / internal field activity" : "Select customer or lead"}</option><optgroup label="Leads">{leads.filter((lead) => lead.stage !== "LOST").map((lead) => <option value={`lead:${lead.id}`} key={lead.id}>{lead.leadNumber} - {lead.organizationName}</option>)}</optgroup><optgroup label="Customers">{customers.map((customer) => <option value={`customer:${customer.id}`} key={customer.id}>{customer.name}</option>)}</optgroup></select></label>
    <label><span className={labelClass}>Purpose</span><input className={inputClass} required minLength={3} value={form.purpose} onChange={(event) => change("purpose", event.target.value)} placeholder="Clinical review, procurement call..." /></label>
    <label><span className={labelClass}>Next Follow-up</span><input className={inputClass} type="datetime-local" min={localDateTime()} value={form.nextFollowUpAt} onChange={(event) => change("nextFollowUpAt", event.target.value)} /></label>
    <fieldset className="sm:col-span-2"><legend className={labelClass}>Products Discussed</legend><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{products.filter((product) => product.active).map((product) => <label className="flex items-center gap-2 rounded border border-slate-200 p-2 text-sm" key={product.id}><input type="checkbox" checked={form.productIds.includes(product.id)} onChange={() => toggleProduct(product.id)} /><ProductThumb src={product.imageUrl} name={product.name} size="sm" /><span className="min-w-0 truncate">{product.name}</span></label>)}</div></fieldset>
    <label className="sm:col-span-2"><span className={labelClass}>Activity Details / Outcome</span><textarea className={textareaClass} required value={form.remarks} onChange={(event) => change("remarks", event.target.value)} placeholder="What happened, who was met, decisions made and the next action." /></label>
    <label className="sm:col-span-2"><span className={labelClass}>Photo / Signature / Evidence</span><input className={inputClass + " pt-2"} type="file" accept={attachmentAccept} onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; setAttachmentError(""); void readDocumentUpload(file).then(setAttachmentUpload).catch((error) => setAttachmentError(error instanceof Error ? error.message : "The evidence file could not be read.")); }} />{attachmentError ? <small className="mt-1 block text-rose-700">{attachmentError}</small> : attachmentUpload ? <small className="mt-1 block text-emerald-700">{attachmentUpload.fileName} ready</small> : null}</label>
    <div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy || Boolean(attachmentError)}>Submit Daily Activity</Button></div>
  </form>;
}

function LeadForm({ employees, products, ownUserId, lockEmployee, busy, onSubmit }: { employees: EmployeeDirectoryEntry[]; products: Product[]; ownUserId: string; lockEmployee: boolean; busy: boolean; onSubmit: (payload: Partial<MarketingLead>) => void }) {
  const [form, setForm] = useState({ organizationName: "", organizationType: "Hospital" as MarketingLead["organizationType"], contactPerson: "", contactRole: "Procurement" as NonNullable<MarketingLead["contactRole"]>, mobile: "", email: "", address: "", assignedUserId: lockEmployee ? ownUserId : employees[0]?.id ?? "", leadSource: "Field Prospecting", interestedProductIds: [] as string[], nextFollowUpAt: "", notes: "" });
  const change = (key: keyof typeof form, value: string | string[]) => setForm((current) => ({ ...current, [key]: value }));
  return <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(event) => { event.preventDefault(); onSubmit({ ...form, nextFollowUpAt: form.nextFollowUpAt ? new Date(form.nextFollowUpAt).toISOString() : undefined }); }}><label className="sm:col-span-2"><span className={labelClass}>Organization</span><input className={inputClass} required minLength={2} value={form.organizationName} onChange={(event) => change("organizationName", event.target.value)} /></label><label><span className={labelClass}>Organization Type</span><select className={inputClass} value={form.organizationType} onChange={(event) => change("organizationType", event.target.value)}><option>Hospital</option><option>Clinic</option><option>Dealer</option><option>Pharmacy</option><option>Other</option></select></label><label><span className={labelClass}>Contact Person</span><input className={inputClass} value={form.contactPerson} onChange={(event) => change("contactPerson", event.target.value)} /></label><label><span className={labelClass}>Contact Role</span><select className={inputClass} value={form.contactRole} onChange={(event) => change("contactRole", event.target.value)}><option>Doctor</option><option>Procurement</option><option>Owner</option><option>Management</option><option>Other</option></select></label><label><span className={labelClass}>Mobile</span><input className={inputClass} required minLength={7} value={form.mobile} onChange={(event) => change("mobile", event.target.value)} /></label><label><span className={labelClass}>Email</span><input className={inputClass} type="email" value={form.email} onChange={(event) => change("email", event.target.value)} /></label><label><span className={labelClass}>Lead Source</span><select className={inputClass} value={form.leadSource} onChange={(event) => change("leadSource", event.target.value)}><option>Field Prospecting</option><option>Website Inquiry</option><option>Referral</option><option>Conference</option><option>Trade Reference</option><option>Existing Customer</option></select></label><div className="lg:col-span-1"><EmployeePicker employees={employees} value={form.assignedUserId} onChange={(value) => change("assignedUserId", value)} allowAll={false} disabled={lockEmployee} label="Assigned Employee" /></div><label className="sm:col-span-2"><span className={labelClass}>Address</span><input className={inputClass} value={form.address} onChange={(event) => change("address", event.target.value)} /></label><label><span className={labelClass}>First Follow-up</span><input className={inputClass} type="datetime-local" min={localDateTime()} value={form.nextFollowUpAt} onChange={(event) => change("nextFollowUpAt", event.target.value)} /></label><fieldset className="sm:col-span-2 lg:col-span-3"><legend className={labelClass}>Interested Products</legend><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{products.filter((product) => product.active).map((product) => <label className="flex items-center gap-2 rounded border border-slate-200 p-2 text-xs" key={product.id}><input type="checkbox" checked={form.interestedProductIds.includes(product.id)} onChange={() => change("interestedProductIds", form.interestedProductIds.includes(product.id) ? form.interestedProductIds.filter((id) => id !== product.id) : [...form.interestedProductIds, product.id])} /><ProductThumb src={product.imageUrl} name={product.name} size="sm" /><span className="truncate">{product.name}</span></label>)}</div></fieldset><label className="sm:col-span-2 lg:col-span-3"><span className={labelClass}>Notes</span><textarea className={textareaClass} value={form.notes} onChange={(event) => change("notes", event.target.value)} /></label><div className="flex justify-end sm:col-span-2 lg:col-span-3"><Button type="submit" variant="primary" icon={<UserPlus className="h-4 w-4" />} disabled={busy || !form.assignedUserId}>Create Lead</Button></div></form>;
}

function FollowUpForm({ initialLead, employees, leads, customers, ownUserId, lockEmployee, busy, onSubmit }: { initialLead?: MarketingLead; employees: EmployeeDirectoryEntry[]; leads: MarketingLead[]; customers: Customer[]; ownUserId: string; lockEmployee: boolean; busy: boolean; onSubmit: (payload: Partial<MarketingFollowUp>) => void }) {
  const [form, setForm] = useState({ assignedUserId: lockEmployee ? ownUserId : initialLead?.assignedUserId ?? employees[0]?.id ?? "", subject: initialLead ? `lead:${initialLead.id}` : "", dueAt: "", purpose: "" });
  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onSubmit({ assignedUserId: form.assignedUserId, leadId: form.subject.startsWith("lead:") ? form.subject.slice(5) : undefined, customerId: form.subject.startsWith("customer:") ? form.subject.slice(9) : undefined, dueAt: new Date(form.dueAt).toISOString(), purpose: form.purpose }); }}><EmployeePicker employees={employees} value={form.assignedUserId} onChange={(assignedUserId) => setForm((current) => ({ ...current, assignedUserId }))} allowAll={false} disabled={lockEmployee} label="Assigned Employee" /><label><span className={labelClass}>Customer / Lead</span><select className={inputClass} required value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}><option value="">Select record</option><optgroup label="Leads">{leads.filter((lead) => lead.stage !== "LOST").map((lead) => <option value={`lead:${lead.id}`} key={lead.id}>{lead.leadNumber} - {lead.organizationName}</option>)}</optgroup><optgroup label="Customers">{customers.map((customer) => <option value={`customer:${customer.id}`} key={customer.id}>{customer.name}</option>)}</optgroup></select></label><label><span className={labelClass}>Due At</span><input className={inputClass} type="datetime-local" min={localDateTime()} required value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} /></label><label><span className={labelClass}>Purpose</span><textarea className={textareaClass} minLength={3} required value={form.purpose} onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))} /></label><div className="flex justify-end"><Button type="submit" variant="primary" icon={<CalendarCheck className="h-4 w-4" />} disabled={busy || !form.assignedUserId}>Schedule Follow-up</Button></div></form>;
}

function DailyPlanForm({ plan, userId, leads, customers, busy, onSubmit }: { plan?: DailyMarketingPlan; userId: string; leads: MarketingLead[]; customers: Customer[]; busy: boolean; onSubmit: (payload: Partial<DailyMarketingPlan>) => void }) {
  type PlannedVisit = DailyMarketingPlan["plannedVisits"][number];
  const [visits, setVisits] = useState<PlannedVisit[]>(plan?.plannedVisits ?? [{ id: "", subjectName: "", plannedTime: "09:00", purpose: "Customer visit", completed: false }]);
  const [notes, setNotes] = useState(plan?.notes ?? "");
  const update = (index: number, changes: Partial<PlannedVisit>) => setVisits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row));
  const updateSubject = (index: number, value: string) => {
    const lead = value.startsWith("lead:") ? leads.find((entry) => entry.id === value.slice(5)) : undefined;
    const customer = value.startsWith("customer:") ? customers.find((entry) => entry.id === value.slice(9)) : undefined;
    if (lead) update(index, { leadId: lead.id, customerId: undefined, subjectName: lead.organizationName });
    else if (customer) update(index, { customerId: customer.id, leadId: undefined, subjectName: customer.name });
    else if (!value) update(index, { customerId: undefined, leadId: undefined, subjectName: "" });
  };
  return (
    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onSubmit({ userId, date: businessDate(), plannedVisits: visits, notes, status: "SUBMITTED" }); }}>
      <div className="grid gap-3">{visits.map((visit, index) => {
        const subjectValue = visit.leadId ? `lead:${visit.leadId}` : visit.customerId ? `customer:${visit.customerId}` : visit.subjectName ? `legacy:${visit.subjectName}` : "";
        return <div className="grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[minmax(180px,1fr)_110px_minmax(180px,1fr)_auto_auto] sm:items-center" key={visit.id || index}>
          <label><span className="sr-only">Planned customer or lead</span><select className={inputClass} required value={subjectValue} onChange={(event) => updateSubject(index, event.target.value)}><option value="">Select customer or lead</option>{subjectValue.startsWith("legacy:") ? <option value={subjectValue}>{visit.subjectName} (existing unlinked plan)</option> : null}<optgroup label="Leads">{leads.filter((lead) => lead.stage !== "LOST").map((lead) => <option value={`lead:${lead.id}`} key={lead.id}>{lead.leadNumber} - {lead.organizationName}</option>)}</optgroup><optgroup label="Customers">{customers.map((customer) => <option value={`customer:${customer.id}`} key={customer.id}>{customer.name}</option>)}</optgroup></select></label>
          <label><span className="sr-only">Planned time</span><input className={inputClass} type="time" value={visit.plannedTime} onChange={(event) => update(index, { plannedTime: event.target.value })} /></label>
          <label><span className="sr-only">Visit purpose</span><input className={inputClass} required value={visit.purpose} onChange={(event) => update(index, { purpose: event.target.value })} placeholder="Purpose" /></label>
          <span className={`text-xs font-bold ${visit.completed ? "text-emerald-700" : "text-amber-700"}`}>{visit.completed ? "Completed" : "Planned"}</span>
          <Button type="button" variant="ghost" icon={<Trash2 className="h-4 w-4 text-red-600" />} onClick={() => setVisits((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} disabled={visits.length === 1 || visit.completed} aria-label={`Remove planned visit for ${visit.subjectName || `row ${index + 1}`}`} title={visit.completed ? "Completed visits stay in the plan history" : "Remove planned visit"} />
        </div>;
      })}</div>
      <Button className="w-fit" type="button" icon={<Plus className="h-4 w-4" />} onClick={() => setVisits((rows) => [...rows, { id: "", subjectName: "", plannedTime: "", purpose: "Customer visit", completed: false }])}>Add Visit</Button>
      <p className="text-xs text-slate-500">Completion is posted by a verified field check-out, not by editing this plan.</p>
      <label><span className={labelClass}>Plan Notes</span><textarea className={textareaClass} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      <div className="flex justify-end"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy}>Save Daily Plan</Button></div>
    </form>
  );
}

function MonthlyPlanForm({ employees, products, plans, ownUserId, lockEmployee, canApprove, busy, onSubmit }: { employees: EmployeeDirectoryEntry[]; products: Product[]; plans: MonthlyMarketingPlan[]; ownUserId: string; lockEmployee: boolean; canApprove: boolean; busy: boolean; onSubmit: (payload: Partial<MonthlyMarketingPlan>) => void }) {
  const [employeeId, setEmployeeId] = useState(lockEmployee ? ownUserId : employees[0]?.id ?? "");
  const selectedPlan = plans.find((plan) => plan.userId === employeeId);
  const [prioritySubjects, setPrioritySubjects] = useState(selectedPlan?.prioritySubjects.join("\n") ?? "");
  const [productIds, setProductIds] = useState(selectedPlan?.productIds ?? []);
  const [plannedActivities, setPlannedActivities] = useState(String(selectedPlan?.plannedActivities ?? 20));
  const [notes, setNotes] = useState(selectedPlan?.notes ?? "");
  const [approve, setApprove] = useState(selectedPlan?.status === "APPROVED");
  useEffect(() => {
    setPrioritySubjects(selectedPlan?.prioritySubjects.join("\n") ?? "");
    setProductIds(selectedPlan?.productIds ?? []);
    setPlannedActivities(String(selectedPlan?.plannedActivities ?? 20));
    setNotes(selectedPlan?.notes ?? "");
    setApprove(selectedPlan?.status === "APPROVED");
  }, [employeeId, selectedPlan?.id]);
  const employee = employees.find((entry) => entry.id === employeeId);
  const toggleProduct = (productId: string) => setProductIds((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);
  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onSubmit({ userId: employeeId, month: businessDate().slice(0, 7), territory: employee?.territory ?? "Unassigned", prioritySubjects: prioritySubjects.split("\n").map((value) => value.trim()).filter(Boolean), productIds, plannedActivities: Number(plannedActivities), notes, status: approve ? "APPROVED" : "SUBMITTED" }); }}><EmployeePicker employees={employees} value={employeeId} onChange={setEmployeeId} allowAll={false} disabled={lockEmployee} label="Sales Executive" /><div className="grid gap-3 sm:grid-cols-2"><label><span className={labelClass}>Month</span><input className={inputClass} type="month" readOnly value={businessDate().slice(0, 7)} /></label><label><span className={labelClass}>Territory</span><input className={inputClass} readOnly value={employee?.territory ?? "Unassigned"} /></label></div><label><span className={labelClass}>Priority Customers / Leads</span><textarea className={textareaClass} value={prioritySubjects} onChange={(event) => setPrioritySubjects(event.target.value)} placeholder="One organization per line" /></label><fieldset><legend className={labelClass}>Priority Products</legend><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{products.filter((product) => product.active).map((product) => <label className="flex items-center gap-2 rounded border border-slate-200 p-2 text-xs" key={product.id}><input type="checkbox" checked={productIds.includes(product.id)} onChange={() => toggleProduct(product.id)} /><ProductThumb src={product.imageUrl} name={product.name} size="sm" /><span className="min-w-0 truncate">{product.name}</span></label>)}</div></fieldset><label><span className={labelClass}>Planned Activities</span><input className={inputClass} type="number" min="0" step="1" required value={plannedActivities} onChange={(event) => setPlannedActivities(event.target.value)} /></label><label><span className={labelClass}>Plan Notes</span><textarea className={textareaClass} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>{canApprove ? <label className="flex items-center gap-2 rounded-md bg-cyan-50 p-3 text-sm font-semibold text-cyan-900"><input type="checkbox" checked={approve} onChange={(event) => setApprove(event.target.checked)} /> Approve this monthly plan</label> : null}<div className="flex justify-end"><Button type="submit" variant="primary" icon={<Flag className="h-4 w-4" />} disabled={busy || !employeeId || Number(plannedActivities) < 0}>Save Monthly Plan</Button></div></form>;
}

function TargetForm({ employees, rows, busy, onSubmit }: { employees: EmployeeDirectoryEntry[]; rows: MarketingPerformanceRow[]; busy: boolean; onSubmit: (payload: Partial<EmployeeMarketingTarget>) => void }) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const current = rows.find((row) => row.employee.id === employeeId)?.targets;
  const [values, setValues] = useState({ salesTargetBdt: "", newCustomerTarget: "", visitTarget: "", collectionTargetBdt: "" });
  const displayed = { salesTargetBdt: values.salesTargetBdt || current?.salesTargetBdt || "", newCustomerTarget: values.newCustomerTarget || String(current?.newCustomerTarget ?? ""), visitTarget: values.visitTarget || String(current?.visitTarget ?? ""), collectionTargetBdt: values.collectionTargetBdt || current?.collectionTargetBdt || "" };
  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onSubmit({ userId: employeeId, month: businessDate().slice(0, 7), salesTargetBdt: displayed.salesTargetBdt, newCustomerTarget: Number(displayed.newCustomerTarget), visitTarget: Number(displayed.visitTarget), collectionTargetBdt: displayed.collectionTargetBdt }); }}><EmployeePicker employees={employees} value={employeeId} onChange={(value) => { setEmployeeId(value); setValues({ salesTargetBdt: "", newCustomerTarget: "", visitTarget: "", collectionTargetBdt: "" }); }} allowAll={false} /><div className="grid gap-3 sm:grid-cols-2">{([['salesTargetBdt', 'Delivered Sales Target (BDT)'], ['collectionTargetBdt', 'Collection Target (BDT)'], ['visitTarget', 'Verified Visit Target'], ['newCustomerTarget', 'New Customer Target']] as const).map(([key, label]) => <label key={key}><span className={labelClass}>{label}</span><input className={inputClass} type="number" min="0" step={key.includes("Bdt") ? "0.01" : "1"} required value={displayed[key]} onChange={(event) => setValues((currentValues) => ({ ...currentValues, [key]: event.target.value }))} /></label>)}</div><div className="flex justify-end"><Button type="submit" variant="primary" icon={<Target className="h-4 w-4" />} disabled={busy || !employeeId}>Save Target</Button></div></form>;
}

function FollowUpQueue({ view, onView, rows, canEdit, busy, onComplete, onReschedule }: { view: "Today" | "Overdue" | "Upcoming" | "Completed"; onView: (view: "Today" | "Overdue" | "Upcoming" | "Completed") => void; rows: MarketingFollowUp[]; canEdit: boolean; busy: boolean; onComplete: (row: MarketingFollowUp, outcome: string) => void; onReschedule: (row: MarketingFollowUp, dueAt: string) => void }) {
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [rescheduleAt, setRescheduleAt] = useState<Record<string, string>>({});
  return <div className="grid gap-4"><Segmented value={view} onChange={onView} ariaLabel="Follow-up status" options={(["Today", "Overdue", "Upcoming", "Completed"] as const).map((value) => ({ value, label: value }))} /><TableFrame><table className="min-w-[1260px] w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-2">Due</th><th className="px-3 py-2">Customer / Lead</th><th className="px-3 py-2">Purpose</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Completion Outcome</th><th className="px-3 py-2">New Due Time</th><th className="px-3 py-2 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => {
    const actionable = canEdit && ["PENDING", "OVERDUE"].includes(row.status);
    return <tr key={row.id}><td className="px-3 py-3 text-slate-600">{dateTimeLabel(row.dueAt)}</td><td className="px-3 py-3 font-semibold">{row.subjectName}</td><td className="px-3 py-3 text-slate-600">{row.purpose}</td><td className="px-3 py-3"><StatusBadge status={row.status} /></td><td className="px-3 py-3">{row.status === "COMPLETED" ? row.outcome ?? "Completed" : <input className={inputClass + " min-w-48"} value={outcomes[row.id] ?? ""} onChange={(event) => setOutcomes((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="Outcome to complete" />}</td><td className="px-3 py-3">{actionable ? <input className={inputClass + " min-w-56"} type="datetime-local" min={localDateTime()} value={rescheduleAt[row.id] ?? ""} onChange={(event) => setRescheduleAt((current) => ({ ...current, [row.id]: event.target.value }))} /> : "-"}</td><td className="px-3 py-3"><div className="flex justify-end gap-1 whitespace-nowrap">{actionable ? <><Button variant="ghost" icon={<CheckCircle2 className="h-4 w-4 text-emerald-700" />} disabled={busy || !(outcomes[row.id] ?? "").trim()} onClick={() => onComplete(row, outcomes[row.id])}>Complete</Button><Button variant="ghost" icon={<Clock3 className="h-4 w-4 text-cyan-700" />} disabled={busy || !rescheduleAt[row.id]} onClick={() => onReschedule(row, rescheduleAt[row.id])}>Reschedule</Button></> : null}</div></td></tr>;
  })}</tbody></table></TableFrame>{!rows.length ? <EmptyState title={`No ${view.toLowerCase()} follow-ups`} message="The queue has no matching records." /> : null}</div>;
}

function LeadQueue({ leads, stageFilter, onClearStage, employees, products, canCreate, canReportActivity, canCreateCustomer, canCreateQuote, onFollowUp, onVisit, onConvert, onQuote }: { leads: MarketingLead[]; stageFilter?: MarketingLead["stage"]; onClearStage: () => void; employees: EmployeeDirectoryEntry[]; products: Product[]; canCreate: boolean; canReportActivity: boolean; canCreateCustomer: boolean; canCreateQuote: boolean; onFollowUp: (lead: MarketingLead) => void; onVisit: (lead: MarketingLead) => void; onConvert: (lead: MarketingLead) => void; onQuote: (lead: MarketingLead) => void }) {
  return <div className="grid gap-3">{stageFilter ? <div className="flex items-center justify-between gap-3 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900"><span><b>{leads.length}</b> lead{leads.length === 1 ? "" : "s"} in {stageFilter.replaceAll("_", " ")}</span><Button variant="ghost" onClick={onClearStage}>Show All Stages</Button></div> : null}<TableFrame><table className="min-w-[1220px] w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-2">Lead / Organization</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">Products</th><th className="px-3 py-2">Assigned</th><th className="px-3 py-2">Next Follow-up</th><th className="px-3 py-2">Stage</th><th className="px-3 py-2 text-right">Next Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{leads.map((lead) => <tr key={lead.id}><td className="px-3 py-3"><strong className="block">{lead.organizationName}</strong><span className="text-xs text-slate-500">{lead.leadNumber} | {lead.organizationType} | {lead.leadSource}</span></td><td className="px-3 py-3 text-slate-600">{lead.contactPerson ?? lead.contactRole ?? "-"}<span className="block text-xs">{lead.mobile}</span></td><td className="px-3 py-3">{lead.interestedProductIds.map((id) => products.find((product) => product.id === id)?.code ?? id).join(", ") || "-"}</td><td className="px-3 py-3">{employees.find((employee) => employee.id === lead.assignedUserId)?.name ?? lead.assignedUserId}</td><td className="px-3 py-3 text-xs text-slate-600">{lead.nextFollowUpAt ? dateTimeLabel(lead.nextFollowUpAt) : "-"}</td><td className="px-3 py-3"><StatusBadge status={lead.stage} /></td><td className="px-3 py-3"><div className="flex justify-end gap-1">{canCreate && lead.stage !== "LOST" ? <Button variant="ghost" icon={<CalendarCheck className="h-4 w-4 text-cyan-700" />} onClick={() => onFollowUp(lead)} aria-label={`Schedule follow-up for ${lead.organizationName}`} title="Schedule follow-up" /> : null}{canReportActivity && lead.stage !== "LOST" ? <Button variant="ghost" icon={<MapPinned className="h-4 w-4 text-blue-700" />} onClick={() => onVisit(lead)} aria-label={`Report visit for ${lead.organizationName}`} title="Report customer visit" /> : null}{!lead.customerId && lead.stage !== "LOST" && canCreateCustomer ? <Button variant="ghost" icon={<UserPlus className="h-4 w-4" />} onClick={() => onConvert(lead)}>Convert</Button> : null}{lead.customerId && canCreateQuote ? <Button variant="ghost" icon={<ArrowRight className="h-4 w-4" />} onClick={() => onQuote(lead)}>Quotation</Button> : null}</div></td></tr>)}{!leads.length ? <tr><td className="px-3 py-10 text-center text-slate-500" colSpan={7}>No leads are in this stage.</td></tr> : null}</tbody></table></TableFrame></div>;
}

function ConvertLeadForm({ lead, busy, onSubmit }: { lead: MarketingLead; busy: boolean; onSubmit: (payload: { paymentTerms: string; creditLimit: string }) => void }) {
  const [paymentTerms, setPaymentTerms] = useState("30 days");
  const [creditLimit, setCreditLimit] = useState("0.00");
  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onSubmit({ paymentTerms, creditLimit }); }}><div className="border-l-2 border-cyan-600 pl-3"><strong className="block">{lead.organizationName}</strong><span className="text-xs text-slate-500">{lead.contactPerson ?? lead.contactRole} | {lead.mobile}</span></div><label><span className={labelClass}>Payment Terms</span><input className={inputClass} required value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} /></label><label><span className={labelClass}>Credit Limit (BDT)</span><input className={inputClass} type="number" min="0" step="0.01" required value={creditLimit} onChange={(event) => setCreditLimit(event.target.value)} /></label><div className="flex justify-end"><Button type="submit" variant="primary" icon={<UserPlus className="h-4 w-4" />} disabled={busy}>Create Customer</Button></div></form>;
}

function QuickReportMenu({ userId, executive, onOpen }: { userId: string; executive: boolean; onOpen: (path: string) => void }) {
  const employeeQuery = executive ? `&employeeId=${encodeURIComponent(userId)}` : "";
  const rows = [
    { id: "today", title: executive ? "My Daily Activity" : "Today's Team Activity", detail: "Live activity and verification", path: `/app/reports/daily-marketing?preset=${executive ? "my-day" : "today"}${employeeQuery}` },
    { id: "week", title: "Weekly Marketing Summary", detail: "Activity and follow-up movement", path: "/app/reports/follow-up-status?preset=week" },
    { id: "performance", title: executive ? "My Activity Analysis" : "Team Performance Analysis", detail: "Grouped activity, target and sales signals", path: `/app/reports/employee-performance?preset=month${employeeQuery}` },
    { id: "funnel", title: "Lead Funnel", detail: "Stage and owner analysis", path: "/app/reports/lead-funnel?preset=funnel" },
    { id: "overdue", title: "Overdue Follow-ups", detail: "Missed due times requiring action", path: "/app/reports/follow-up-status?preset=overdue" },
    { id: "target", title: "Target vs Actual", detail: "Official transaction-backed progress", path: "/app/reports/target-actual?preset=target" },
    { id: "verification", title: "Verified Visits", detail: "GPS, distance and submission timing", path: "/app/reports/visit-verification?preset=verification" },
    { id: "custom", title: "Custom Marketing Report", detail: "Date, employee and activity filters", path: "/app/reports/daily-marketing?preset=custom" }
  ];
  return <div className="grid gap-2 sm:grid-cols-2">{rows.map((row) => <button className="flex min-h-20 items-center gap-3 rounded-md border border-slate-200 p-3 text-left hover:border-cyan-500 hover:bg-cyan-50" type="button" key={row.id} onClick={() => onOpen(row.path)}><span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-blue-950 text-cyan-300"><FileBarChart className="h-4 w-4" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">{row.title}</strong><small className="text-slate-500">{row.detail}</small></span><ArrowRight className="h-4 w-4 text-slate-400" /></button>)}</div>;
}

function SnapshotView({ snapshot, onMap, onReport, reportLabel }: { snapshot: EmployeeMarketingSnapshot; onMap: () => void; onReport: () => void; reportLabel: string }) {
  const row = snapshot.performance;
  return <div className="grid gap-4"><div className="flex flex-col gap-3 border-b border-blue-200 pb-4 sm:flex-row sm:items-center"><span className="grid h-12 w-12 place-items-center rounded bg-blue-950 text-sm font-bold text-white">{snapshot.employee.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div className="min-w-0 flex-1"><h3 className="font-bold text-blue-950">{snapshot.employee.name}</h3><p className="text-xs text-slate-500">{snapshot.employee.employeeCode} | {snapshot.employee.title} | {snapshot.employee.territory}</p></div><Button icon={<MapPinned className="h-4 w-4" />} onClick={onMap}>Field Map</Button><Button variant="primary" icon={<BarChart3 className="h-4 w-4" />} onClick={onReport}>{reportLabel}</Button></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Verified Visits", row.verifiedVisits], ["Qualified Leads", row.qualifiedLeads], ["Activity Score", row.activityScore], ["Target Progress", `${Number(row.progress.overall).toFixed(0)}%`]].map(([label, value]) => <div className="border-l-2 border-cyan-600 bg-blue-50/50 p-3" key={String(label)}><span className="block text-xs text-slate-500">{label}</span><strong className="mt-1 block text-xl text-blue-950">{value}</strong></div>)}</div><div className="grid gap-4 lg:grid-cols-2"><div><h4 className="mb-2 text-xs font-bold uppercase text-blue-900">Recent Activity</h4><div className="divide-y divide-blue-100 border border-blue-200">{snapshot.recentActivities.slice(0, 6).map((activity) => <div className="p-3" key={activity.id}><strong className="text-sm">{activityName(activity.activityType)}</strong><span className="block text-xs text-slate-500">{activity.subjectName} | {dateTimeLabel(activity.occurredAt)}</span></div>)}</div></div><div><h4 className="mb-2 text-xs font-bold uppercase text-blue-900">Open Follow-ups</h4><div className="divide-y divide-blue-100 border border-blue-200">{snapshot.followUps.filter((item) => ["PENDING", "OVERDUE"].includes(item.status)).slice(0, 6).map((item) => <div className="p-3" key={item.id}><div className="flex justify-between gap-2"><strong className="text-sm">{item.subjectName}</strong><StatusBadge status={item.status} /></div><span className="block text-xs text-slate-500">{dateTimeLabel(item.dueAt)} | {item.purpose}</span></div>)}</div></div></div></div>;
}
