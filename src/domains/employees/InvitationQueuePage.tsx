import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Mail, RefreshCw, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { apiRequest } from "../../lib/api/client";
import { useAuthStore } from "../../lib/auth/session";
import { useToastStore } from "../../lib/ui/toast";
import { ErrorBlock, LoadingBlock, Modal, Panel, TableFrame, inputClass } from "../components";
import { WorkforcePager } from "../marketing/WorkforceUi";
import { invitationListSchema, invitationState, type InvitationJob } from "./invitationContracts";

export default function InvitationQueuePage() {
  const [state, setState] = useState("");
  const [page, setPage] = useState(1);
  const [confirmation, setConfirmation] = useState<{ action: "cancel" | "delete"; row: InvitationJob } | null>(null);
  const client = useQueryClient();
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.push);
  const admin = useAuthStore((s) => s.session?.user.role === "Super Admin");
  const query = useQuery({
    queryKey: ["invitation-queue", state, page],
    queryFn: async () => invitationListSchema.parse((await apiRequest(`/api/settings/invitations?${new URLSearchParams({ page: String(page), ...(state ? { state } : {}) })}`)).data),
    refetchInterval: 15000
  });
  function refresh() {
    for (const key of ["invitation-queue", "employees", "workforce", "audit"]) void client.invalidateQueries({ queryKey: [key] });
  }
  const run = useMutation({
    mutationFn: () => apiRequest<{ processed: number }>("/api/settings/invitations/process", { method: "POST", body: JSON.stringify({ limit: 1 }) }),
    onSuccess: refresh
  });
  const action = useMutation({
    mutationFn: ({ action, row }: NonNullable<typeof confirmation>) => apiRequest(`/api/settings/invitations/${encodeURIComponent(row.id)}${action === "cancel" ? "/cancel" : ""}`, {
      method: action === "cancel" ? "POST" : "DELETE", body: JSON.stringify({ updatedAt: row.updatedAt })
    }),
    onSuccess: (result) => {
      refresh(); setConfirmation(null);
      if (confirmation?.action === "delete") setPage(1);
      toast({ kind: "success", title: "Invitation updated", message: result.message });
    },
    onError: () => refresh()
  });
  function confirm(row: InvitationJob, actionName: "cancel" | "delete") {
    action.reset(); setConfirmation({ row, action: actionName });
  }
  function actions(row: InvitationJob) {
    return <div className="flex flex-wrap gap-2">
      {row.canCancel ? <Button variant="danger" icon={<Ban className="h-4 w-4" />} disabled={action.isPending || run.isPending} title={`Cancel invitation for ${row.employeeName}`} onClick={() => confirm(row, "cancel")}>Cancel invitation</Button> : null}
      {row.canDelete ? <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} disabled={action.isPending || run.isPending} title={`Delete invitation for ${row.employeeName}`} onClick={() => confirm(row, "delete")}>Delete invitation</Button> : null}
      {!row.canCancel && !row.canDelete ? <span className="text-xs text-slate-500">{row.employeeStatus === "Active" ? "Accepted account" : "No available actions"}</span> : null}
    </div>;
  }
  const date = (value: string | null) => value ? new Date(value).toLocaleString() : "-";
  return <div className="grid min-w-0 gap-5">
    <PageHeader title="Invitation Delivery" eyebrow="Employees" subtitle="Queued delivery, provider responses and records needing review." actions={<>
      <Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate("/backend/employees")}>Employees</Button>
      {admin ? <Button variant="primary" icon={<Mail className="h-4 w-4" />} disabled={run.isPending || action.isPending} onClick={() => run.mutate()}>Process Due</Button> : null}
    </>} />
    <Panel title="Delivery Queue" actions={<div className="flex w-[240px] max-w-full items-center gap-2">
      <select aria-label="Delivery status" className={`${inputClass} min-w-0 flex-1`} value={state} onChange={(e) => { setState(e.target.value); setPage(1); }}><option value="">All statuses</option>{invitationState.options.map((s) => <option key={s}>{s}</option>)}</select>
      <Button className="shrink-0" icon={<RefreshCw className="h-4 w-4" />} title="Refresh delivery status" aria-label="Refresh delivery status" onClick={() => void query.refetch()} />
    </div>}>
      {run.isSuccess ? <p role="status" className="border-b border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">{run.data.data.processed ? "Invitation attempt completed. See its delivery status below." : "No invitation is currently due for processing."}</p> : null}
      {run.isError ? <ErrorBlock error={run.error} /> : null}
      {query.isPending ? <LoadingBlock /> : query.isError ? <ErrorBlock error={query.error} /> : <>
        <div className="hidden md:block"><TableFrame><table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="bg-blue-950 text-white"><tr>{["Employee", "Status", "Attempts", "Provider Result", "Next Attempt", "Last Accepted", "Actions"].map((v) => <th className="p-3" key={v}>{v}</th>)}</tr></thead>
          <tbody className="divide-y divide-blue-100">{query.data.rows.map((row) => <tr key={row.id}>
            <td className="p-3 font-semibold">{row.employeeName}<small className="block font-normal text-slate-500">Account: {row.employeeStatus}</small></td>
            <td className="p-3"><StatusBadge status={row.state} /></td><td className="p-3">{row.attempts}</td>
            <td className="p-3">{row.lastCode.replaceAll("_", " ") || "Awaiting attempt"}</td>
            <td className="p-3">{row.state === "Queued" ? date(row.nextAttemptAt) : "-"}</td><td className="p-3">{date(row.sentAt)}</td><td className="p-3">{actions(row)}</td>
          </tr>)}</tbody>
        </table></TableFrame></div>
        <div className="divide-y divide-blue-100 md:hidden">{query.data.rows.map((row) => <article className="grid gap-3 p-4" key={row.id}>
          <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><strong className="block break-words">{row.employeeName}</strong><small className="text-slate-500">Account: {row.employeeStatus}</small></div><StatusBadge status={row.state} /></div>
          <dl className="grid grid-cols-2 gap-2 text-xs"><div><dt className="text-slate-500">Attempts</dt><dd>{row.attempts}</dd></div><div><dt className="text-slate-500">Provider result</dt><dd className="break-words">{row.lastCode.replaceAll("_", " ") || "Awaiting attempt"}</dd></div><div><dt className="text-slate-500">Next attempt</dt><dd>{row.state === "Queued" ? date(row.nextAttemptAt) : "-"}</dd></div><div><dt className="text-slate-500">Last accepted</dt><dd>{date(row.sentAt)}</dd></div></dl>
          {actions(row)}
        </article>)}</div>
        {!query.data.total ? <p className="p-8 text-center text-sm text-slate-500">No invitations match this status.</p> : null}
        <WorkforcePager page={page} total={query.data.total} pageSize={25} onChange={setPage} />
      </>}
    </Panel>
    {confirmation ? <Modal open title={confirmation.action === "cancel" ? "Cancel Invitation" : "Delete Invitation"} width="max-w-lg" onClose={() => { if (!action.isPending) setConfirmation(null); }}>
      <div className="grid gap-4"><strong className="break-words">{confirmation.row.employeeName}</strong>
        <p className="text-sm leading-6 text-slate-600">{confirmation.action === "cancel" ? "Cancel this invitation and make the pending employee inactive? They will not be able to enter the ERP through an existing invitation link. An email already sent or in flight cannot be recalled." : "Delete this cancelled invitation and remove the employee from the employee list? Access stays blocked. Audit history and linked records are retained."}</p>
        {action.isError ? <ErrorBlock error={action.error} /> : null}
        <div className="flex flex-wrap justify-end gap-2"><Button disabled={action.isPending} onClick={() => setConfirmation(null)}>Keep invitation</Button><Button variant="danger" disabled={action.isPending} icon={confirmation.action === "cancel" ? <Ban className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} onClick={() => action.mutate(confirmation)}>{confirmation.action === "cancel" ? "Cancel invitation" : "Delete invitation"}</Button></div>
      </div>
    </Modal> : null}
  </div>;
}
