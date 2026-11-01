import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Mail, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import { apiRequest } from "../../lib/api/client";
import { useAuthStore } from "../../lib/auth/session";
import { ErrorBlock, LoadingBlock, Panel, TableFrame, inputClass } from "../components";
import { WorkforcePager } from "../marketing/WorkforceUi";
import { invitationListSchema, invitationState } from "./invitationContracts";

export default function InvitationQueuePage() {
  const [state, setState] = useState(""); const [page, setPage] = useState(1); const client = useQueryClient(); const navigate = useNavigate();
  const admin = useAuthStore((s) => s.session?.user.role === "Super Admin");
  const query = useQuery({ queryKey: ["invitation-queue", state, page], queryFn: async () => invitationListSchema.parse((await apiRequest(`/api/settings/invitations?${new URLSearchParams({ page: String(page), ...(state ? { state } : {}) })}`)).data), refetchInterval: 15000 });
  const run = useMutation({ mutationFn: () => apiRequest<{ processed: number }>("/api/settings/invitations/process", { method: "POST", body: JSON.stringify({ limit: 1 }) }), onSuccess: () => { void client.invalidateQueries({ queryKey: ["invitation-queue"] }); void client.invalidateQueries({ queryKey: ["employees"] }); } });
  return <><PageHeader title="Invitation Delivery" eyebrow="Employees" subtitle="Queued delivery, provider responses and records needing review." actions={<><Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate("/backend/employees")}>Employees</Button>{admin ? <Button variant="primary" icon={<Mail className="h-4 w-4" />} disabled={run.isPending} onClick={() => run.mutate()}>Process Due</Button> : null}</>} />
    <Panel title="Delivery Queue" actions={<div className="flex gap-2"><select aria-label="Delivery status" className={inputClass} value={state} onChange={(e) => { setState(e.target.value); setPage(1); }}><option value="">All statuses</option>{invitationState.options.map((s) => <option key={s}>{s}</option>)}</select><Button icon={<RefreshCw className="h-4 w-4" />} title="Refresh delivery status" aria-label="Refresh delivery status" onClick={() => void query.refetch()} /></div>}>
      {run.isSuccess ? <p role="status" className="border-b border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">{run.data.data.processed ? "Invitation attempt completed. See its delivery status below." : "No invitation is currently due for processing."}</p> : null}
      {run.isError ? <ErrorBlock error={run.error} /> : null}{query.isPending ? <LoadingBlock /> : query.isError ? <ErrorBlock error={query.error} /> : <><TableFrame><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-blue-950 text-white"><tr>{["Employee", "Status", "Attempts", "Provider Result", "Next Attempt", "Last Accepted"].map((v) => <th className="p-3" key={v}>{v}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{query.data.rows.map((row) => <tr key={row.id}><td className="p-3 font-semibold">{row.employeeName}</td><td className="p-3">{row.state}</td><td className="p-3">{row.attempts}</td><td className="p-3">{row.lastCode.replaceAll("_", " ") || "Awaiting attempt"}</td><td className="p-3">{row.state === "Queued" ? new Date(row.nextAttemptAt).toLocaleString() : "-"}</td><td className="p-3">{row.sentAt ? new Date(row.sentAt).toLocaleString() : "-"}</td></tr>)}{!query.data.total ? <tr><td colSpan={6} className="p-8 text-center text-slate-500">No invitations match this status.</td></tr> : null}</tbody></table></TableFrame><WorkforcePager page={page} total={query.data.total} pageSize={25} onChange={setPage} /></>}
    </Panel></>;
}
