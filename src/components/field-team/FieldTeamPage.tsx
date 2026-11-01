import { attachmentAccept } from "../../lib/files/attachments";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CalendarDays, CheckCircle2, CircleStop, Clock3, Crosshair, History, ListFilter, LocateFixed, LogIn, MapPin, Navigation, Play, RefreshCw, Route, Save, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DocumentViewer, { readDocumentUpload } from "../documents/DocumentViewer";
import type { CurrentEmployeeLocation, DocumentRecord, DocumentUpload, FieldVisit, Product, TrackingStatus } from "../../domains/erp.types";
import { fieldTeamService, settingsService } from "../../domains/services";
import { useAuthStore, useEffectiveRole } from "../../lib/auth/session";
import { businessDate } from "../../lib/date";
import { useToastStore } from "../../lib/ui/toast";
import { ErrorBlock, LoadingBlock, Modal, Panel, ProductThumb, Segmented, inputClass, labelClass, textareaClass } from "../../domains/components";
import Button from "../ui/Button";
import EmployeePicker from "../employees/EmployeePicker";
import { LiveTeamMap, RouteHistoryMap } from "./LiveTeamMap";
import TrackingStatusBadge from "./TrackingStatusBadge";

type Mode = "live" | "history";

type Position = { latitude: number; longitude: number; accuracyMeters: number };

function browserPosition(): Promise<Position> {
  if (!navigator.geolocation) return Promise.reject(new Error("This browser does not support location capture."));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracyMeters: Math.max(0, Math.round(coords.accuracy)) }),
    (error) => reject(new Error(error.code === error.PERMISSION_DENIED ? "Allow location access in the browser to verify this field action." : "A current GPS position could not be captured. Please try again outdoors or with location enabled.")),
    { enableHighAccuracy: true, timeout: 12_000, maximumAge: 15_000 }
  ));
}

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds} sec ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} day ago`;
}

export default function FieldTeamPage({ marketingEmbedded = false }: { marketingEmbedded?: boolean }) {
  const role = useEffectiveRole();
  const user = useAuthStore((state) => state.session?.user);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = params.get("mode") === "history" ? "history" : "live";
  const [search, setSearch] = useState("");
  const [territory, setTerritory] = useState("");
  const [status, setStatus] = useState<TrackingStatus | "">("");
  const [historyDate, setHistoryDate] = useState(businessDate());
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const currentQuery = useQuery({ queryKey: ["field-team", "current", user?.id], queryFn: fieldTeamService.current, refetchInterval: 15_000 });
  const ownVisitsQuery = useQuery({ queryKey: ["field-team", "visits", user?.id, businessDate()], queryFn: () => fieldTeamService.visits(user!.id, businessDate(), businessDate()), enabled: role === "Sales Executive" && Boolean(user?.id) });
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: settingsService.products, enabled: role === "Sales Executive" });
  const data = currentQuery.data;
  const requestedEmployee = params.get("employee");
  const requestedIsVisible = Boolean(requestedEmployee && data?.employees.some((employee) => employee.id === requestedEmployee));
  const selectedId = requestedIsVisible ? requestedEmployee! : (role === "Sales Executive" ? user?.id : data?.employees[0]?.id);
  const historyQuery = useQuery({ queryKey: ["field-team", "history", selectedId, historyDate], queryFn: () => fieldTeamService.history(selectedId!, historyDate), enabled: mode === "history" && Boolean(selectedId) });

  useEffect(() => {
    if (selectedId && requestedEmployee !== selectedId) setParams((current) => { const next = new URLSearchParams(current); next.set("view", marketingEmbedded ? "marketing" : "field-team"); if (marketingEmbedded) next.set("marketing", "field-team"); next.set("employee", selectedId); return next; }, { replace: true });
  }, [marketingEmbedded, requestedEmployee, selectedId, setParams]);

  const setMode = (nextMode: Mode) => setParams((current) => { const next = new URLSearchParams(current); next.set("view", marketingEmbedded ? "marketing" : "field-team"); if (marketingEmbedded) next.set("marketing", "field-team"); next.set("mode", nextMode); return next; }, { replace: true });
  const selectEmployee = useCallback((location: CurrentEmployeeLocation) => {
    setParams((current) => { const next = new URLSearchParams(current); next.set("view", marketingEmbedded ? "marketing" : "field-team"); if (marketingEmbedded) next.set("marketing", "field-team"); next.set("employee", location.userId); return next; }, { replace: true });
    setMobileListOpen(false);
  }, [marketingEmbedded, setParams]);
  const selectEmployeeId = (id: string) => {
    const location = data?.locations.find((entry) => entry.userId === id);
    if (location) selectEmployee(location);
  };

  const visibleLocations = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.locations ?? []).filter((location) => {
      const matchesSearch = !term || [location.employee.name, location.employee.employeeCode, location.employee.territory ?? ""].some((entry) => entry.toLowerCase().includes(term));
      return matchesSearch && (!territory || location.employee.territory === territory) && (!status || location.status === status);
    });
  }, [data?.locations, search, status, territory]);
  const territories = [...new Set((data?.employees ?? []).map((employee) => employee.territory).filter(Boolean))].sort() as string[];
  const selected = data?.locations.find((location) => location.userId === selectedId);

  if (currentQuery.isLoading) return <LoadingBlock label="Loading your field team feed" />;
  if (currentQuery.isError) return <ErrorBlock error={currentQuery.error} onRetry={() => void currentQuery.refetch()} />;
  if (!data) return <ErrorBlock error={new Error("Field team data is unavailable.")} />;
  const summaryCards: Array<{ label: string; value: number; color: string; Icon: typeof Activity }> = [
    { label: "Active now", value: data.summary.activeNow, color: "text-emerald-700", Icon: Activity },
    { label: "Recent / stale", value: data.summary.recent, color: "text-amber-700", Icon: Clock3 },
    { label: "Offline", value: data.summary.offline, color: "text-slate-700", Icon: MapPin },
    { label: "Not tracking", value: data.summary.notTracking, color: "text-red-700", Icon: Crosshair },
    { label: "Visits today", value: data.summary.visitsToday, color: "text-cyan-800", Icon: CalendarDays }
  ];

  return <section className="grid gap-4" data-testid="field-team-workspace">
    <div className="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-white text-amber-700"><Navigation className="h-4 w-4" /></span><div><strong className="block text-sm text-amber-950">{data.feedLabel}</strong><p className="text-xs leading-5 text-amber-800">Coordinates and movement are realistic mock records for management UAT. They are not production employee tracking.</p></div></div><span className="text-xs font-semibold text-amber-800">Refreshed {relativeTime(data.generatedAt)} · 15 sec polling</span></div>

    {role === "Sales Executive" && user ? <MyFieldDay location={data.locations.find((entry) => entry.userId === user.id)} visits={ownVisitsQuery.data ?? []} products={productsQuery.data ?? []} loading={ownVisitsQuery.isLoading || productsQuery.isLoading} error={ownVisitsQuery.error ?? productsQuery.error} /> : null}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{summaryCards.map(({ label, value, color, Icon }) => <article className="rounded-md border border-slate-200 bg-white p-3 shadow-sm" key={label}><div className="flex items-center justify-between"><span className="text-xs text-slate-500">{label}</span><Icon className={`h-4 w-4 ${color}`} /></div><strong className={`mt-1 block text-xl ${color}`}>{value}</strong></article>)}</div>

    <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm xl:flex-row xl:items-end xl:justify-between">
      <Segmented value={mode} onChange={setMode} ariaLabel="Field Team modes" options={[{ value: "live", label: "Live Map" }, { value: "history", label: "Route / Visit History" }]} />
      <div className="grid w-full gap-2 sm:grid-cols-3 xl:max-w-3xl"><label><span className={labelClass}>Search Employee</span><input className={inputClass} placeholder="Name / ID / territory" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label><span className={labelClass}>Territory</span><select className={inputClass} value={territory} onChange={(event) => setTerritory(event.target.value)}><option value="">All territories</option>{territories.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label><span className={labelClass}>Tracking Status</span><select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as TrackingStatus | "")}><option value="">All statuses</option>{["LIVE", "RECENT", "STALE", "OFFLINE", "NOT_TRACKING"].map((entry) => <option key={entry}>{entry}</option>)}</select></label></div>
    </div>

    {mode === "live" ? <>
      <div className="relative grid min-h-[540px] overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden overflow-y-auto border-r border-slate-200 bg-white md:block"><EmployeeList locations={visibleLocations} selectedId={selectedId} onSelect={selectEmployee} /></aside>
        <div className="relative min-h-[540px]"><LiveTeamMap locations={visibleLocations} selectedId={selectedId} onSelect={selectEmployee} /><Button className="absolute left-3 top-3 z-[500] md:hidden" icon={<ListFilter className="h-4 w-4" />} onClick={() => setMobileListOpen(true)}>Field Staff</Button>{mobileListOpen ? <div className="absolute inset-y-0 left-0 z-[600] w-[86%] max-w-80 overflow-y-auto border-r border-slate-200 bg-white shadow-2xl md:hidden"><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-3 py-2"><strong className="text-sm">Field Staff</strong><button className="rounded p-2 hover:bg-slate-100" onClick={() => setMobileListOpen(false)} aria-label="Close field staff list"><X className="h-4 w-4" /></button></div><EmployeeList locations={visibleLocations} selectedId={selectedId} onSelect={selectEmployee} /></div> : null}</div>
      </div>
      {selected ? <EmployeeDetail location={selected} onActivity={() => navigate(`/app/employees?view=activity&employee=${selected.userId}`)} onHistory={() => setMode("history")} /> : null}
    </> : <>
      <div className="grid gap-3 rounded-md border border-blue-200 bg-blue-50/40 p-4 shadow-sm md:grid-cols-[minmax(260px,1fr)_220px_auto] md:items-end"><EmployeePicker employees={data.employees} value={selectedId ?? ""} onChange={selectEmployeeId} allowAll={false} /><label><span className={labelClass}>Activity Date</span><input className={inputClass} type="date" max={businessDate()} value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} /></label><Button icon={<Users className="h-4 w-4" />} onClick={() => navigate(`/app/employees?view=activity&employee=${selectedId}`)} disabled={!selectedId}>Employee Activity</Button></div>
      {historyQuery.isLoading ? <LoadingBlock label="Loading route and visit history" /> : historyQuery.isError ? <ErrorBlock error={historyQuery.error} onRetry={() => void historyQuery.refetch()} /> : historyQuery.data ? <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,.7fr)]"><div className="min-h-[440px] overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm"><RouteHistoryMap points={historyQuery.data.points} visits={historyQuery.data.visits} /></div><VisitTimeline history={historyQuery.data} /></div> : null}
    </>}
  </section>;
}

function MyFieldDay({ location, visits, products, loading, error }: { location?: CurrentEmployeeLocation; visits: FieldVisit[]; products: Product[]; loading: boolean; error: unknown }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [checkoutVisit, setCheckoutVisit] = useState<FieldVisit>();
  const [viewingDocument, setViewingDocument] = useState<DocumentRecord | null>(null);
  const activeTracking = Boolean(location?.sessionId && ["LIVE", "RECENT", "STALE"].includes(location.status));
  const activeVisit = visits.find((visit) => visit.status === "Checked In");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["field-team"] });
    void queryClient.invalidateQueries({ queryKey: ["marketing"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["reports"] });
  };
  const action = useMutation({
    mutationFn: (task: { run: () => Promise<unknown>; success: string }) => task.run(),
    onSuccess: (_result, task) => {
      refresh();
      setCheckoutVisit(undefined);
      pushToast({ kind: "success", title: task.success });
    },
    onError: (reason) => pushToast({ kind: "error", title: "Field action could not be saved", message: reason instanceof Error ? reason.message : undefined })
  });
  const startTracking = () => action.mutate({
    success: "Foreground tracking started",
    run: async () => {
      const position = await browserPosition();
      await fieldTeamService.startTracking();
      return fieldTeamService.sendLocation({ ...position, recordedAt: new Date().toISOString(), source: "WEB_FOREGROUND" });
    }
  });
  const updateLocation = () => action.mutate({
    success: "Current location refreshed",
    run: async () => fieldTeamService.sendLocation({ ...(await browserPosition()), recordedAt: new Date().toISOString(), source: "WEB_FOREGROUND" })
  });
  const stopTracking = () => action.mutate({ success: "Foreground tracking stopped", run: fieldTeamService.stopTracking });
  const checkIn = (visit: FieldVisit) => action.mutate({ success: `Checked in at ${visit.customerName}`, run: async () => fieldTeamService.checkInVisit(visit.id, await browserPosition()) });
  const checkOut = (visit: FieldVisit, payload: Partial<FieldVisit> & { attachmentUpload?: DocumentUpload }) => action.mutate({
    success: `Visit at ${visit.customerName} completed`,
    run: async () => {
      const position = await browserPosition();
      return fieldTeamService.checkOutVisit(visit.id, { ...payload, checkOutLatitude: position.latitude, checkOutLongitude: position.longitude, checkOutAccuracyMeters: position.accuracyMeters });
    }
  });
  const orderedVisits = [...visits].sort((left, right) => {
    const priority = { "Checked In": 0, Planned: 1, Completed: 2, Missed: 3 } as const;
    return priority[left.status] - priority[right.status] || left.plannedAt.localeCompare(right.plannedAt);
  });

  return <>
    <Panel title="My Field Day" subtitle="Foreground web tracking only; location capture stops when this browser session is inactive" actions={<TrackingStatusBadge status={location?.status ?? "NOT_TRACKING"} />}>
      <div className="grid gap-4 p-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="grid content-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="grid grid-cols-2 gap-3 text-xs"><span className="text-slate-500">Session<strong className="mt-1 block text-sm text-slate-950">{activeTracking ? "Active" : "Stopped"}</strong></span><span className="text-slate-500">Current visit<strong className="mt-1 block truncate text-sm text-slate-950">{activeVisit?.customerName ?? "None"}</strong></span></div>
          {location ? <p className="rounded bg-white p-2 text-xs leading-5 text-slate-600"><b className="text-slate-900">Latest position:</b> {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}<br />Accuracy {location.accuracyMeters} m | {relativeTime(location.recordedAt)}</p> : null}
          <div className="flex flex-wrap gap-2">
            {!activeTracking ? <Button variant="primary" icon={<Play className="h-4 w-4" />} disabled={action.isPending} onClick={startTracking}>Start Tracking</Button> : <Button variant="danger" icon={<CircleStop className="h-4 w-4" />} disabled={action.isPending || Boolean(activeVisit)} title={activeVisit ? "Complete the active visit before stopping tracking" : undefined} onClick={stopTracking}>Stop</Button>}
            <Button icon={<RefreshCw className="h-4 w-4" />} disabled={action.isPending || !activeTracking} onClick={updateLocation}>Refresh GPS</Button>
          </div>
          <p className="text-[11px] leading-5 text-slate-500">The browser asks for location permission before each verified action. GPS distance is advisory and never silently rejects a visit.</p>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-3"><strong className="text-sm text-slate-950">Today's visits</strong><span className="text-xs text-slate-500">{visits.filter((visit) => visit.status === "Completed").length} of {visits.length} completed</span></div>
          {loading ? <LoadingBlock label="Loading today's field visits" /> : error ? <ErrorBlock error={error} /> : <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
            {orderedVisits.map((visit) => <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={visit.id}>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-950">{visit.customerName}</strong><TrackingStatusBadge status={visit.status === "Checked In" ? "LIVE" : visit.status === "Completed" ? "RECENT" : visit.status === "Missed" ? "OFFLINE" : "NOT_TRACKING"} /></div><p className="mt-1 text-xs text-slate-500">{new Date(visit.plannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} | {visit.purpose}</p>{visit.outcome ? <p className="mt-1 text-xs font-semibold text-slate-700">{visit.outcome}</p> : null}{visit.checkInDistanceMeters !== undefined ? <span className={`mt-1 block text-[11px] ${visit.distanceWarning ? "font-semibold text-rose-700" : "text-emerald-700"}`}>Check-in distance {visit.checkInDistanceMeters} m{visit.distanceWarning ? " | location mismatch warning" : " | GPS verified"}</span> : null}{visit.attachments?.map((document) => <button className="mt-1 mr-3 text-xs font-semibold text-cyan-800 hover:underline" type="button" key={document.id} onClick={() => setViewingDocument(document)}>{document.fileName}</button>)}</div>
              <div className="flex flex-wrap gap-2 sm:justify-end">{visit.status === "Planned" ? <Button variant="primary" icon={<LogIn className="h-4 w-4" />} disabled={action.isPending || !activeTracking || Boolean(activeVisit)} title={!activeTracking ? "Start tracking first" : activeVisit ? "Complete the current visit first" : undefined} onClick={() => checkIn(visit)}>Check In</Button> : visit.status === "Checked In" ? <Button variant="primary" icon={<CheckCircle2 className="h-4 w-4" />} disabled={action.isPending} onClick={() => setCheckoutVisit(visit)}>Complete Visit</Button> : visit.status === "Completed" ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Completed</span> : <span className="text-xs font-semibold text-rose-700">Missed</span>}</div>
            </div>)}
            {!orderedVisits.length ? <p className="p-6 text-center text-sm text-slate-500">No customer visits are planned for today. Add them from Today's Plan in Marketing.</p> : null}
          </div>}
        </div>
      </div>
    </Panel>
    <Modal open={Boolean(checkoutVisit)} title={`Complete visit: ${checkoutVisit?.customerName ?? ""}`} subtitle="Outcome, products, evidence, and the next action are saved against this verified visit." onClose={() => setCheckoutVisit(undefined)} width="max-w-3xl">{checkoutVisit ? <VisitCheckoutForm visit={checkoutVisit} products={products} busy={action.isPending} onSubmit={(payload) => checkOut(checkoutVisit, payload)} /> : null}</Modal>
    <DocumentViewer document={viewingDocument} onClose={() => setViewingDocument(null)} />
  </>;
}

function VisitCheckoutForm({ visit, products, busy, onSubmit }: { visit: FieldVisit; products: Product[]; busy: boolean; onSubmit: (payload: Partial<FieldVisit> & { attachmentUpload?: DocumentUpload }) => void }) {
  const [outcome, setOutcome] = useState(visit.outcome ?? "");
  const [productIds, setProductIds] = useState(visit.productIds ?? []);
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [remarks, setRemarks] = useState(visit.remarks ?? "");
  const [attachmentUpload, setAttachmentUpload] = useState<DocumentUpload>();
  const [attachmentError, setAttachmentError] = useState("");
  const toggleProduct = (productId: string) => setProductIds((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);
  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onSubmit({ outcome, productIds, nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : undefined, remarks, attachmentUpload }); }}>
    <div className="grid gap-3 rounded-md border border-cyan-200 bg-cyan-50 p-3 text-xs sm:grid-cols-3"><span>Checked in<strong className="mt-1 block text-sm text-cyan-950">{visit.checkInAt ? new Date(visit.checkInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</strong></span><span>Verification<strong className="mt-1 block text-sm text-cyan-950">{visit.verification?.replaceAll("_", " ") ?? "Unverified"}</strong></span><span>Customer distance<strong className="mt-1 block text-sm text-cyan-950">{visit.checkInDistanceMeters === undefined ? "Unavailable" : `${visit.checkInDistanceMeters} m`}</strong></span></div>
    <label><span className={labelClass}>Meeting Outcome</span><input className={inputClass} required minLength={3} value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="Quotation requested, sample accepted, follow-up needed..." /></label>
    <fieldset><legend className={labelClass}>Products Discussed</legend><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{products.filter((product) => product.active).map((product) => <label className="flex items-center gap-2 rounded border border-slate-200 p-2 text-xs" key={product.id}><input type="checkbox" checked={productIds.includes(product.id)} onChange={() => toggleProduct(product.id)} /><ProductThumb src={product.imageUrl} name={product.name} size="sm" /><span className="min-w-0 truncate">{product.name}</span></label>)}</div></fieldset>
    <div className="grid gap-4 sm:grid-cols-2"><label><span className={labelClass}>Next Follow-up</span><input className={inputClass} type="datetime-local" min={new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)} value={nextFollowUpAt} onChange={(event) => setNextFollowUpAt(event.target.value)} /></label><label><span className={labelClass}>Photo / Signature / Evidence</span><input className={inputClass + " pt-2"} type="file" accept={attachmentAccept} onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; setAttachmentError(""); void readDocumentUpload(file).then(setAttachmentUpload).catch((reason) => setAttachmentError(reason instanceof Error ? reason.message : "The evidence file could not be read.")); }} />{attachmentError ? <small className="mt-1 block text-rose-700">{attachmentError}</small> : attachmentUpload ? <small className="mt-1 block font-semibold text-emerald-700">{attachmentUpload.fileName} ready</small> : null}</label></div>
    <label><span className={labelClass}>Remarks</span><textarea className={textareaClass} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Discussion notes, decision maker, quantity indication, or next action" /></label>
    <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-[11px] leading-5 text-slate-500"><LocateFixed className="mr-1 inline h-3.5 w-3.5" />A fresh GPS position is captured when you submit.</p><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy || Boolean(attachmentError)}>Capture GPS &amp; Check Out</Button></div>
  </form>;
}

function EmployeeList({ locations, selectedId, onSelect }: { locations: CurrentEmployeeLocation[]; selectedId?: string; onSelect: (location: CurrentEmployeeLocation) => void }) {
  return <div><div className="border-b border-slate-200 px-4 py-3"><strong className="block text-sm">Field Staff</strong><small className="text-slate-500">{locations.length} matching employees</small></div><div className="divide-y divide-slate-100">{locations.map((location) => <button className={`w-full px-4 py-3 text-left transition hover:bg-cyan-50 ${selectedId === location.userId ? "bg-cyan-50 ring-1 ring-inset ring-cyan-200" : ""}`} type="button" key={location.userId} onClick={() => onSelect(location)}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><strong className="block truncate text-sm">{location.employee.name}</strong><small className="block truncate text-slate-500">{location.employee.employeeCode} · {location.employee.territory}</small></div><TrackingStatusBadge status={location.status} /></div><span className="mt-2 block text-xs text-slate-500">Last updated: {relativeTime(location.recordedAt)}</span>{location.currentVisit ? <span className="mt-1 block truncate text-xs font-semibold text-cyan-800">At {location.currentVisit.customerName}</span> : null}</button>)}{!locations.length ? <p className="p-8 text-center text-sm text-slate-500">No employee matches these filters.</p> : null}</div></div>;
}

function EmployeeDetail({ location, onActivity, onHistory }: { location: CurrentEmployeeLocation; onActivity: () => void; onHistory: () => void }) {
  return <Panel title={location.employee.name} subtitle={`${location.employee.employeeCode} | ${location.employee.territory ?? location.employee.title}`} actions={<TrackingStatusBadge status={location.status} />}><div className="grid gap-4 p-4 lg:grid-cols-[1fr_1fr_auto]"><div className="grid gap-2 text-sm"><span className="text-slate-500">Last updated <b className="block text-slate-900">{new Date(location.recordedAt).toLocaleString()} ({relativeTime(location.recordedAt)})</b></span><span className="text-slate-500">GPS accuracy <b className="block text-slate-900">{location.accuracyMeters} m | {location.source.replace("_", " ")}</b></span></div><div className="grid gap-2 text-sm"><span className="text-slate-500">Current / last visit <b className="block text-slate-900">{location.currentVisit?.customerName ?? "No active visit"}</b></span><span className="text-slate-500">Check-in <b className="block text-slate-900">{location.currentVisit?.checkInAt ? new Date(location.currentVisit.checkInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</b></span></div><div className="flex flex-wrap items-end gap-2 lg:flex-col lg:justify-end"><Button variant="primary" icon={<Activity className="h-4 w-4" />} onClick={onActivity}>Employee Activity</Button><Button icon={<History className="h-4 w-4" />} onClick={onHistory}>Route History</Button></div></div></Panel>;
}

function VisitTimeline({ history }: { history: Awaited<ReturnType<typeof fieldTeamService.history>> }) {
  const events = [
    ...history.points.filter((point) => point.event && point.event !== "LOCATION").map((point) => ({ id: point.id, at: point.recordedAt, title: point.event!.replaceAll("_", " "), detail: `${point.accuracyMeters} m accuracy` })),
    ...history.visits.flatMap((visit) => [visit.checkInAt ? { id: `${visit.id}-in`, at: visit.checkInAt, title: `${visit.customerName} · Check In`, detail: visit.purpose } : null, visit.checkOutAt ? { id: `${visit.id}-out`, at: visit.checkOutAt, title: `${visit.customerName} · Check Out`, detail: visit.outcome ?? "Visit completed" } : null]).filter(Boolean) as Array<{ id: string; at: string; title: string; detail: string }>
  ].sort((a, b) => a.at.localeCompare(b.at));
  return <Panel title="Visit timeline" subtitle={`${history.employee.name} · ${history.date}`}><div className="p-4"><div className="mb-4 grid grid-cols-2 gap-3 rounded-md bg-slate-50 p-3 text-xs"><span>Session<strong className="block text-sm text-slate-900">{history.session?.status ?? "Not recorded"}</strong></span><span>Route points<strong className="block text-sm text-slate-900">{history.points.length}</strong></span></div><ol className="relative ml-2 border-l border-cyan-200 pl-5">{events.map((event) => <li className="relative pb-5" key={event.id}><span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-cyan-700 ring-1 ring-cyan-300" /><time className="text-[11px] font-bold text-cyan-800">{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><strong className="block text-sm text-slate-900">{event.title}</strong><p className="text-xs leading-5 text-slate-500">{event.detail}</p></li>)}{!events.length ? <li className="pb-4 text-sm text-slate-500">No tracking or visit events are recorded for this date.</li> : null}</ol><div className="mt-2 flex items-start gap-2 rounded bg-cyan-50 p-3 text-xs leading-5 text-cyan-900"><Route className="mt-0.5 h-4 w-4 shrink-0" />The line connects stored coordinates in timestamp order. No synthetic distance is calculated.</div></div></Panel>;
}
