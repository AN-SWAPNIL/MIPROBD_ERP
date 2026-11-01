import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, LocateFixed, Search, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button";
import { useAuthStore } from "../../lib/auth/session";
import { businessDate } from "../../lib/date";
import { getMarketingEmployeeScope, hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { ErrorBlock, LoadingBlock, Modal, Panel, TableFrame, inputClass } from "../components";
import FieldVisitCheckin from "./FieldVisitCheckin";
import FieldVisitDetail, { visitTime } from "./FieldVisitDetail";
import type { WorkforceReferences } from "./persistentContracts";
import { VisitPolicyForm } from "./VisitSettingsForms";
import { titleCase } from "./WorkforceForms";
import { WorkforceField, WorkforcePager } from "./WorkforceUi";
import { visitService as api } from "./visitService";

export default function PersistentFieldVisits({ references, employeeId }: { references: WorkforceReferences; employeeId?: string }) {
  const actor = useAuthStore((s) => s.session!.user); const navigate = useNavigate(); const client = useQueryClient();
  const team = ["TEAM", "ALL"].includes(getMarketingEmployeeScope(actor));
  const create = hasEffectivePermission(actor, "marketing", "create"); const canPolicy = actor.role === "Super Admin" && hasEffectivePermission(actor, "settings", "edit") && hasEffectivePermission(actor, "marketing", "approve");
  const [employee, setEmployee] = useState(employeeId ?? ""); const [from, setFrom] = useState(businessDate().slice(0, 7) + "-01"); const [to, setTo] = useState(businessDate()); const [review, setReview] = useState("");
  const [search, setSearch] = useState(""); const [debounced, setDebounced] = useState(""); const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<"new" | "policy" | null>(null); const [selected, setSelected] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { const timer = setTimeout(() => { setDebounced(search); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  const filters = { page, pageSize: 25, employee, from, to, status: review, search: debounced };
  const visits = useQuery({ queryKey: ["workforce", "visits", filters], queryFn: () => api.list(filters), enabled: from <= to && to <= businessDate() });
  const active = useQuery({ queryKey: ["workforce", "visits-active"], queryFn: api.active });
  const policy = useQuery({ queryKey: ["workforce", "visit-policy"], queryFn: api.policy });
  const savePolicy = useMutation({ mutationFn: api.savePolicy, onSuccess: () => { setDialog(null); void client.invalidateQueries({ queryKey: ["workforce"] }); } });
  const canStart = create && (!employee || employee === actor.id) && !active.data;
  return <div className="grid min-w-0 gap-4" data-testid="persistent-field-visits">
    {active.data ? <div className="flex flex-col gap-2 rounded-md border border-cyan-200 bg-cyan-50 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-blue-950"><strong>Active visit: {active.data.subject}</strong><br />{active.data.reference} | Saved {visitTime(active.data.receivedAt)}</p><Button icon={<FileText className="h-4 w-4" />} onClick={() => setSelected(active.data!.id)}>Open Active Visit</Button></div> : null}
    {active.isError ? <ErrorBlock error={active.error} /> : null}
    <Panel title={team ? "Field Visit History" : "My Field Day"} subtitle="Employee-initiated check-ins | Server time: Bangladesh | No continuous tracking" actions={<>
      {hasEffectivePermission(actor, "reports") ? <Button icon={<FileText className="h-4 w-4" />} onClick={() => navigate(`/backend/reports/visit-verification?from=${from}&to=${to}${employee ? `&employee=${encodeURIComponent(employee)}` : ""}`)}>Open Report</Button> : null}
      {canPolicy ? <Button title="Visit policy" aria-label="Visit policy" icon={<Settings className="h-4 w-4" />} onClick={() => setDialog("policy")} /> : null}
      {canStart ? <Button variant="primary" disabled={active.isPending || active.isError} icon={<LocateFixed className="h-4 w-4" />} onClick={() => setDialog("new")}>Check In</Button> : null}
    </>}>
      <div className="grid gap-3 border-b border-blue-100 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <WorkforceField label="Search Visits"><div className="relative min-w-0"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Search visits" className={`${inputClass} pl-9`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Reference, contact, purpose..." /></div></WorkforceField>
        {team ? <WorkforceField label="Employee"><select aria-label="Field visit employee" className={inputClass} value={employee} onChange={(e) => { setEmployee(e.target.value); setPage(1); }}><option value="">All authorized employees</option>{employee && !references.employees.some((e) => e.id === employee) ? <option value={employee}>Selected employee</option> : null}{references.employees.map((e) => <option key={e.id} value={e.id}>{e.name} | {e.employeeCode}</option>)}</select></WorkforceField> : null}
        <WorkforceField label="From"><input aria-label="Visit history from" type="date" className={inputClass} value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></WorkforceField>
        <WorkforceField label="To"><input aria-label="Visit history to" type="date" className={inputClass} value={to} min={from} max={businessDate()} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></WorkforceField>
        <WorkforceField label="Review"><select aria-label="Visit review filter" className={inputClass} value={review} onChange={(e) => { setReview(e.target.value); setPage(1); }}><option value="">All decisions</option>{["Pending", "Accepted", "Rejected"].map((v) => <option key={v}>{v}</option>)}</select></WorkforceField>
      </div>
      {from > to || to > businessDate() ? <p role="alert" className="p-4 text-sm text-red-700">Choose a valid period ending no later than today.</p> : null}
      {visits.isFetching ? <LoadingBlock label="Loading saved visits" /> : null}{visits.isError ? <ErrorBlock error={visits.error} /> : null}
      {visits.data ? <><TableFrame><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-blue-950 text-xs text-white"><tr>{["Employee / Reference", "Customer / Lead", "Saved Time (Dhaka)", "Location Evidence", "Review / Status", "Details"].map((v) => <th key={v} className="px-4 py-3">{v}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{visits.data.rows.map((v) => <tr key={v.id}><td className="px-4 py-3 align-top"><strong>{v.employee}</strong><small className="block text-slate-500">{v.employeeCode} | {v.reference}</small></td><td className="max-w-64 break-words px-4 py-3 align-top">{v.subject}<small className="block text-slate-500">{v.purpose}</small></td><td className="px-4 py-3 align-top">{visitTime(v.receivedAt)}</td><td className="px-4 py-3 align-top">{titleCase(v.quality)}<small className="block text-slate-500">{titleCase(v.match)}{v.position ? ` | ~${Math.round(v.position.accuracy)} m` : ""}</small></td><td className="px-4 py-3 align-top">{v.review}<small className="block text-slate-500">{titleCase(v.status)}</small></td><td className="px-4 py-3 align-top"><Button title={`Open visit ${v.reference}`} aria-label={`Open visit ${v.reference}`} variant="ghost" icon={<FileText className="h-4 w-4" />} onClick={() => setSelected(v.id)} /></td></tr>)}</tbody></table></TableFrame>{!visits.data.rows.length ? <p className="p-8 text-center text-sm text-slate-500">No recorded visits match this period and access scope.</p> : null}<WorkforcePager page={page} total={visits.data.total} pageSize={25} onChange={setPage} /></> : null}
    </Panel>
    {selected ? <Modal open title="Field Visit" width="max-w-3xl" onClose={() => setSelected(null)}><FieldVisitDetail key={selected} id={selected} /></Modal> : null}
    {dialog ? <Modal open title={dialog === "new" ? "Check In at Customer / Lead" : "Visit Policy"} width="max-w-3xl" onClose={() => { if (!busy && !savePolicy.isPending) setDialog(null); }}>
      {dialog === "new" ? <FieldVisitCheckin references={references} actorId={actor.id} onBusy={setBusy} onSaved={(id) => { setDialog(null); setBusy(false); setSelected(id); void client.invalidateQueries({ queryKey: ["workforce"] }); void client.invalidateQueries({ queryKey: ["reports"] }); }} /> : policy.isPending ? <LoadingBlock label="Loading policy" /> : policy.isError ? <ErrorBlock error={policy.error} /> : <>{savePolicy.isError ? <ErrorBlock error={savePolicy.error} /> : null}<VisitPolicyForm data={policy.data.data} busy={savePolicy.isPending} onSave={(data, reason) => savePolicy.mutate({ version: policy.data.version, data, reason })} /></>}
    </Modal> : null}
  </div>;
}
