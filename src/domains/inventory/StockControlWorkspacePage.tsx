import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, ClipboardCheck, FileBarChart, Pencil, Send } from "lucide-react";
import { Decimal } from "decimal.js";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { apiRequest } from "../../lib/api/client";
import { businessDate } from "../../lib/date";
import { useAuthStore } from "../../lib/auth/session";
import { hasCapability, hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { formatMoney, formatQuantity } from "../../utils/precise";
import { ErrorBlock, LoadingBlock, Panel, TableFrame } from "../components";
import StockControlEditor from "./StockControlEditor";
import QualityAttachments from "../quality/QualityAttachments";
import { stockControlKinds, stockControlSchema } from "./controlContracts";
import { batchPageSchema } from "./pageContracts";

export default function StockControlWorkspacePage() {
  const { controlId = "new" } = useParams(); const [params] = useSearchParams(); const isNew = controlId === "new"; const batchId = params.get("batch") ?? "";
  const kind = stockControlKinds.find((k) => k === params.get("kind")) ?? "Physical Count";
  const [editing, setEditing] = useState(false); const [confirm, setConfirm] = useState(false); const client = useQueryClient(); const navigate = useNavigate(); const user = useAuthStore((s) => s.session?.user);
  const record = useQuery({ queryKey: ["inventory", "control", controlId], enabled: !isNew, queryFn: async () => stockControlSchema.parse((await apiRequest(`/api/inventory/controls/${controlId}`)).data) });
  const initial = useQuery({ queryKey: ["inventory", "control-initial", batchId], enabled: isNew && Boolean(batchId), queryFn: async () => batchPageSchema.parse((await apiRequest(`/api/inventory/batches/page?batchId=${encodeURIComponent(batchId)}`)).data) });
  const canPost = hasEffectivePermission(user, "inventory", "post"); const cost = hasCapability(user, "view_sensitive_cost");
  const run = useMutation({ mutationFn: async (action: "submit" | "post") => { if (!record.data) throw new Error("No source document loaded"); return stockControlSchema.parse((await apiRequest(`/api/inventory/controls/${controlId}/${action}`, { method: "POST", body: JSON.stringify({ version: record.data.version }) })).data); }, onError: () => setConfirm(false), onSuccess: async () => { setConfirm(false); await client.invalidateQueries(); } });
  const saved = (id: string) => { setEditing(false); navigate(`/backend/inventory/controls/${id}`); };
  if (!isNew && record.isPending || isNew && batchId && initial.isPending) return <LoadingBlock />;
  if (record.isError || initial.isError) return <ErrorBlock error={record.error ?? initial.error} />;
  if (isNew && batchId && !initial.data?.rows.length) return <ErrorBlock error={new Error("The selected source batch is unavailable.")} />;
  const data = record.data;
  if (isNew || editing) return <>
    <PageHeader title={isNew ? `New ${kind}` : `Revise ${data?.number}`} eyebrow="Stock control preparation" actions={<Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => { if (isNew) navigate("/backend/inventory/controls"); else setEditing(false); }}>Back</Button>} />
    {canPost ? <StockControlEditor key={data?.id ?? `${kind}:${batchId}`} kind={data?.kind ?? kind} original={data} initialBatch={initial.data?.rows[0]} holdId={params.get("hold") ?? undefined} onSaved={saved} onCancel={() => { if (isNew) navigate("/backend/inventory/controls"); else setEditing(false); }} /> : <ErrorBlock error={new Error("Inventory posting access is required to prepare this record.")} />}
  </>;
  if (!data) return <ErrorBlock error={new Error("Stock control source not found.")} />;
  const revisable = data.state === "Draft" || data.state === "Submitted" && (data.approvalState === "Rejected" || !data.policyActive);
  const reportId = data.kind === "Physical Count" ? "stock-count-variance" : data.kind === "Condition Release" ? "stock-condition-history" : data.state === "Posted" ? "stock-writeoffs" : "stock-control-register";
  return <>
    <PageHeader title={data.number} eyebrow={data.kind} subtitle={`${data.createdByName} | Observed ${data.countDate}`} actions={<>
      <Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate("/backend/inventory/controls")}>Register</Button>
      {data.approvalId ? <Button icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => navigate("/backend/approvals?domain=Stock")}>Approvals</Button> : null}
      {canPost && revisable ? <Button icon={<Pencil className="h-4 w-4" />} onClick={() => { run.reset(); setEditing(true); }}>Reviewed Revision</Button> : null}
      {canPost && data.state === "Draft" ? <Button variant="primary" icon={<Send className="h-4 w-4" />} disabled={run.isPending || data.blockers.length > 0} onClick={() => run.mutate("submit")}>Submit for Approval</Button> : null}
      {canPost && data.state === "Submitted" && data.approvalState === "Approved" && data.policyActive ? <Button variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => { run.reset(); setConfirm(true); }}>Post Approved Control</Button> : null}
      {hasEffectivePermission(user, "reports") ? <Button icon={<FileBarChart className="h-4 w-4" />} onClick={() => navigate(`/backend/reports/${reportId}?${new URLSearchParams({ from: data.countDate, to: businessDate(), stockControl: data.id })}`)}>Open Report</Button> : null}
    </>} />
    {run.isError ? <ErrorBlock error={run.error} /> : null}
    <Panel title="Source & Approval"><div className="grid min-w-0 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4"><div><span className="text-xs text-slate-500">Source status</span><div className="mt-1"><StatusBadge status={data.state} /></div></div><div><span className="text-xs text-slate-500">Approval</span><div className="mt-1"><StatusBadge status={data.approvalState ?? "Not submitted"} /></div></div><div><span className="text-xs text-slate-500">Posted date</span><strong className="mt-1 block text-sm">{data.postedDate ?? "Not posted"}</strong></div>{cost ? <div><span className="text-xs text-slate-500">Absolute approval exposure</span><strong className="mt-1 block text-sm">{data.totalBdt === null ? "Cost review pending" : formatMoney(data.totalBdt ?? "0")}</strong></div> : null}</div>
      {data.blockers.length ? <ul className="border-t border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900">{data.blockers.map((b) => <li className="list-disc" key={b}>{b}</li>)}</ul> : null}
      {data.state === "Submitted" && !data.policyActive ? <p className="border-t border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Approval policy retired. A new reviewed source revision is required.</p> : null}
    </Panel>
    <Panel title="Selected Batch Snapshot"><TableFrame>
      <table className="w-full min-w-[1050px] text-left text-sm">
        <thead className="bg-blue-50 text-blue-950"><tr>{["Product / Batch", "LOT / Condition", "Dates / Location", "Book Qty", "Count / Remaining", "Variance", "Partial Holds", ...(cost ? ["Signed Cost Impact"] : []), "Posting Source"].map((h) => <th className="p-3" key={h}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-blue-100">{data.lines.map((l) => <tr key={l.id}>
          <td className="max-w-64 break-words p-3 font-semibold">{l.productName}<small className="block font-normal">{l.batchNumber}</small></td>
          <td className="p-3">{l.lotNumber}<small className="block">{l.condition}{l.surplusCondition ? ` / surplus ${l.surplusCondition}` : ""}</small></td>
          <td className="min-w-44 p-3 text-xs"><span className="block">Mfg: {l.manufacturingDate}</span><span className="block">Expiry: {l.expiryDate}</span><span className="block">Received: {l.receivedDate}</span><span className="block break-words">{l.warehouse} / {l.location}</span></td>
          <td className="p-3 tabular-nums">{formatQuantity(l.bookQuantity)} {l.unit}</td>
          <td className="p-3 tabular-nums">{formatQuantity(l.countedQuantity)}</td>
          <td className="p-3 font-semibold tabular-nums">{formatQuantity(l.deltaQuantity)}</td>
          <td className="p-3 tabular-nums">{formatQuantity(l.heldQuantity)}</td>
          {cost ? <td className="p-3 tabular-nums">{l.valueBdt === null ? "Pending" : formatMoney(new Decimal(l.deltaQuantity).isNegative() ? new Decimal(l.valueBdt ?? "0").negated().toFixed(2) : l.valueBdt ?? "0")}</td> : null}
          <td className="max-w-48 break-all p-3 text-xs">{l.movementId ?? (data.state === "Posted" ? "No quantity movement" : "Not posted")}</td>
        </tr>)}</tbody>
      </table>
    </TableFrame></Panel>
    <Panel title="Investigation & Evidence"><dl className="grid min-w-0 gap-4 p-4 text-sm lg:grid-cols-2"><div><dt className="text-xs text-slate-500">Investigation / reason</dt><dd className="mt-1 whitespace-pre-wrap break-words">{data.reason}</dd></div><div><dt className="text-xs text-slate-500">Inspection findings</dt><dd className="mt-1 whitespace-pre-wrap break-words">{data.inspection}</dd></div><div><dt className="text-xs text-slate-500">Evidence reference</dt><dd className="mt-1 break-words">{data.proofReference}</dd></div>{data.revisionOfId ? <div><dt className="text-xs text-slate-500">Earlier revision</dt><dd><Button icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/backend/inventory/controls/${data.revisionOfId}`)}>Open Earlier Source</Button></dd></div> : null}</dl></Panel>
    <QualityAttachments key={data.id} kind="Stock Control" sourceId={data.id} />
    <ConfirmDialog open={confirm} title={`Post ${data.number}?`} message="This posts the approved stock/condition change and its applicable accounting source. The original record and journals will be retained." confirmLabel={run.isPending ? "Posting..." : "Post Approved Control"} onCancel={() => { if (!run.isPending) setConfirm(false); }} onConfirm={() => { if (!run.isPending) run.mutate("post"); }} />
  </>;
}
