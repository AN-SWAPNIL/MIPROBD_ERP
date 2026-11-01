import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Eye, History, ShieldCheck, X } from "lucide-react";
import { z } from "zod";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAuthStore } from "../../lib/auth/session";
import { formatMoney } from "../../utils/precise";
import { ErrorBlock, LoadingBlock, Modal, Panel, TableFrame, inputClass } from "../components";
import { WorkforcePager } from "../marketing/WorkforceUi";
import { approvalEventSchema, approvalPageSchema, approvalStates, controlDomains, type ApprovalDto } from "./contracts";
import { canDecideApproval, canReadApprovalDomain } from "./access";
import { controlRequest } from "./client";
import DecisionDialog from "./DecisionDialog";
import { canManageLedger } from "../ledger/access";
import { isSuperAdmin } from "../../lib/permissions/effectiveAccess";

type Decision = { row: ApprovalDto; action: "verify" | "approve" | "reject" };
export default function ApprovalInboxPage() {
  const user = useAuthStore((s) => s.session?.user); const domains = controlDomains.filter((d) => canReadApprovalDomain(user, d));
  const [params] = useSearchParams();
  const [domain, setDomain] = useState(() => domains.find((d) => d === params.get("domain")) ?? ""); const [state, setState] = useState(""); const [page, setPage] = useState(1); const [decision, setDecision] = useState<Decision | null>(null); const [historyId, setHistoryId] = useState("");
  const client = useQueryClient(); const navigate = useNavigate();
  const query = useQuery({ queryKey: ["controls", "approvals", domain, state, page], queryFn: async () => approvalPageSchema.parse(await controlRequest(`/controls/approvals?${new URLSearchParams({ page: String(page), ...(domain ? { domain } : {}), ...(state ? { state } : {}) })}`)), enabled: domains.length > 0 });
  const history = useQuery({ queryKey: ["controls", "history", historyId], queryFn: async () => z.array(approvalEventSchema).parse(await controlRequest(`/controls/approvals/${historyId}/events`)), enabled: Boolean(historyId) });
  const run = useMutation({ mutationFn: (reason: string) => { if (!decision) throw new Error("No decision selected"); return controlRequest(`/controls/approvals/${decision.row.id}/${decision.action}`, { version: decision.row.version, reason }); }, onSuccess: async () => { setDecision(null); await client.invalidateQueries({ queryKey: ["controls"] }); await client.invalidateQueries({ queryKey: ["ledger"] }); await client.invalidateQueries({ queryKey: ["inventory"] }); } });
  const select = (row: ApprovalDto, action: Decision["action"]) => { run.reset(); setDecision({ row, action }); };
  const postPeriod = useMutation({ mutationFn: (id: string) => controlRequest(`/ledger/periods/${id}/post`, {}), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["controls"] }); await client.invalidateQueries({ queryKey: ["ledger"] }); } });
  if (!domains.length) return <ErrorBlock error={new Error("Approval access is not assigned to your account.")} />;
  return <>
    <PageHeader title="Approvals" subtitle="Policy-based review and approval of saved source records." actions={<Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate("/backend")}>Dashboard</Button>} />
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label><span className="sr-only">Approval area</span><select className={inputClass} aria-label="Approval area" value={domain} onChange={(e) => { setDomain(e.target.value); setPage(1); }}><option value="">All assigned areas</option>{domains.map((d) => <option key={d}>{d}</option>)}</select></label><label><span className="sr-only">Approval status</span><select className={inputClass} aria-label="Approval status" value={state} onChange={(e) => { setState(e.target.value); setPage(1); }}><option value="">All statuses</option>{approvalStates.map((s) => <option key={s}>{s}</option>)}</select></label></div>
    <Panel title="Approval requests">{query.isPending ? <LoadingBlock /> : query.isError ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} /> : <>
      <TableFrame><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-blue-50 text-blue-950"><tr>{["Source / preparer", "Area", "Amount", "Status", "Actions"].map((h) => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{query.data.rows.map((row) => {
        const administrator = isSuperAdmin(user); const independent = administrator || row.requestedBy !== user?.id && !row.excludedActorIds.includes(user?.id ?? ""); const current = row.policyActive && independent && !["Posted", "Rejected"].includes(row.state);
        const canVerify = current && row.state === "Submitted" && (administrator || row.policy.verifierIds.includes(user?.id ?? ""));
        const canFinal = current && (administrator || row.policy.approverIds.includes(user?.id ?? "")) && canDecideApproval(user, row.domain);
        return <tr key={row.id}>
          <td className="p-3"><strong className="block text-blue-950">{row.reference}</strong><span className="text-xs text-slate-500">{row.requestedByName} | {new Date(row.createdAt).toLocaleDateString()}</span></td>
          <td className="p-3">{row.domain}</td><td className="p-3 whitespace-nowrap tabular-nums">{row.amountBdt === "Restricted" ? "Restricted" : formatMoney(row.amountBdt)}</td>
          <td className="p-3"><StatusBadge status={row.state} />{!row.policyActive && !["Posted", "Rejected"].includes(row.state) ? <span className="mt-1 block text-xs text-amber-700">Policy retired; source revision required</span> : null}</td>
          <td className="p-3"><div className="flex flex-wrap gap-1">
            {row.resourceType === "Ledger Journal" ? <Button title="Open journal" aria-label={`Open ${row.reference}`} icon={<Eye className="h-4 w-4" />} onClick={() => navigate(`/backend/accounts/ledger/journals/${row.resourceId}`)} /> : null}
            {row.sourcePath ? <Button title="Open source record" aria-label={`Open ${row.reference}`} icon={<Eye className="h-4 w-4" />} onClick={() => navigate(row.sourcePath!)} /> : null}
            <Button title="Decision history" aria-label={`History ${row.reference}`} icon={<History className="h-4 w-4" />} onClick={() => setHistoryId(row.id)} />
            {canVerify ? <Button icon={<ShieldCheck className="h-4 w-4" />} onClick={() => select(row, "verify")}>Verify</Button> : null}
            {canFinal && (!["Stock Control","Customer Return","Return Settlement","Supplier Claim","Supplier Replacement Receipt"].includes(row.resourceType) || row.amountBdt !== "Restricted") && (row.state === "Verified" && (administrator || !row.policy.independentVerifier || row.verifiedBy !== user?.id) || administrator && row.state === "Submitted") ? <Button variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => select(row, "approve")}>Approve</Button> : null}
            {canFinal ? <Button title="Reject request" aria-label={`Reject ${row.reference}`} icon={<X className="h-4 w-4" />} onClick={() => select(row, "reject")} /> : null}
            {row.resourceType === "Ledger Period" && row.state === "Approved" && row.policyActive && canManageLedger(user) ? <Button variant="primary" icon={<Check className="h-4 w-4" />} disabled={postPeriod.isPending} onClick={() => postPeriod.mutate(row.id)}>Close Approved Period</Button> : null}
          </div></td>
        </tr>;
      })}</tbody></table></TableFrame>{!query.data.rows.length ? <p className="p-6 text-sm text-slate-500">No matching requests.</p> : null}<WorkforcePager page={page} total={query.data.total} pageSize={25} onChange={setPage} />
    </>}</Panel>
    {postPeriod.isError ? <ErrorBlock error={postPeriod.error} /> : null}
    {decision ? <DecisionDialog title={`${decision.action === "verify" ? "Verify" : decision.action === "approve" ? "Approve" : "Reject"} ${decision.row.reference}`} busy={run.isPending} error={run.error} onClose={() => setDecision(null)} onConfirm={(reason) => run.mutate(reason)} /> : null}
    {historyId ? <Modal open title="Decision history" onClose={() => setHistoryId("")}>{history.isPending ? <LoadingBlock /> : history.isError ? <ErrorBlock error={history.error} /> : <ol className="grid gap-4">{history.data.map((event) => <li key={event.id} className="border-l-2 border-cyan-600 pl-3"><strong className="text-sm text-blue-950">{event.action} | {event.actor}</strong><p className="text-xs text-slate-500">{new Date(event.at).toLocaleString()}</p><p className="mt-1 break-words text-sm">{event.reason}</p></li>)}</ol>}</Modal> : null}
  </>;
}
