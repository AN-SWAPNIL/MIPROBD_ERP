import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BookCheck, ClipboardCheck, Pencil, Send } from "lucide-react";
import { z } from "zod";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAuthStore } from "../../lib/auth/session";
import { formatMoney } from "../../utils/precise";
import { ErrorBlock, LoadingBlock, Panel, TableFrame } from "../components";
import { controlRequest } from "../controls/client";
import { canManageLedger, canReadLedger } from "./access";
import { ledgerAccountSchema, ledgerJournalInput, ledgerJournalSchema } from "./contracts";
import JournalEditor from "./JournalEditor";

export default function JournalWorkspacePage() {
  const { journalId = "new" } = useParams(); const isNew = journalId === "new"; const navigate = useNavigate(); const client = useQueryClient(); const user = useAuthStore((s) => s.session?.user);
  const allowed = canReadLedger(user); const manage = canManageLedger(user); const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: ["ledger", "journal", journalId], queryFn: async () => ledgerJournalSchema.parse(await controlRequest(`/ledger/journals/${journalId}`)), enabled: allowed && !isNew });
  const chart = useQuery({ queryKey: ["ledger", "chart"], queryFn: async () => z.array(ledgerAccountSchema).parse(await controlRequest("/ledger/accounts")), enabled: allowed });
  const run = useMutation({ mutationFn: ({ path, body }: { path: string; body: unknown }) => controlRequest(path, body), onSuccess: async (data) => {
    setEditing(false); await client.invalidateQueries({ queryKey: ["ledger"] }); await client.invalidateQueries({ queryKey: ["controls"] });
    const row = ledgerJournalSchema.parse(data); if (row.id !== journalId) navigate(`/backend/accounts/ledger/journals/${row.id}`);
  } });
  if (!allowed || isNew && !manage) return <ErrorBlock error={new Error("Ledger authority is not assigned to your account.")} />;
  if (chart.isPending || !isNew && query.isPending) return <LoadingBlock label="Loading journal" />;
  if (chart.isError || !isNew && query.isError) return <ErrorBlock error={chart.error ?? query.error} />;
  const record = query.data; const own = record?.createdBy === user?.id;
  const revisable = record && manage && own && (["Draft", "Rejected"].includes(record.state) || record.state === "Submitted" && (record.approvalState === "Rejected" || !record.policyActive));
  const save = (data: z.infer<typeof ledgerJournalInput>) => run.mutate({ path: isNew ? "/ledger/journals" : `/ledger/journals/${journalId}/revise`, body: { ...data, ...(record ? { version: record.version } : {}) } });
  return <><PageHeader title={isNew ? "New Journal" : record?.number ?? "Journal"} subtitle="Balanced entries, source evidence and policy-based approval." actions={<Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate("/backend/accounts/ledger")}>General Ledger</Button>} />
    {isNew || editing ? <Panel title={isNew ? "Journal draft" : "Linked journal revision"}><div className="p-4"><JournalEditor key={record?.id ?? "new"} chart={chart.data ?? []} initial={record} busy={run.isPending} error={run.error} save={save} />{editing ? <Button className="mt-3" disabled={run.isPending} onClick={() => setEditing(false)}>Cancel Revision</Button> : null}</div></Panel> : record ? <>
      <Panel title={record.description} actions={<StatusBadge status={record.state} />}>
        <dl className="grid gap-4 p-4 text-sm sm:grid-cols-3"><div><dt className="text-xs text-slate-500">Business date / type</dt><dd className="mt-1 font-semibold">{record.date} | {record.type}</dd></div><div><dt className="text-xs text-slate-500">Reference</dt><dd className="mt-1 break-words">{record.reference}</dd></div><div><dt className="text-xs text-slate-500">Evidence</dt><dd className="mt-1 break-words">{record.proofReference}</dd></div></dl>
        <TableFrame><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-blue-50 text-blue-950"><tr>{["Ledger account", "Debit", "Credit", "Note"].map((h) => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{record.lines.map((line, index) => <tr key={index}><td className="p-3">{chart.data?.find((a) => a.id === line.accountId)?.name ?? line.accountId}</td><td className="p-3 tabular-nums">{formatMoney(line.debit)}</td><td className="p-3 tabular-nums">{formatMoney(line.credit)}</td><td className="p-3">{line.note}</td></tr>)}</tbody><tfoot className="border-t border-blue-200 font-bold"><tr><td className="p-3">Total</td><td className="p-3">{formatMoney(record.totalBdt)}</td><td className="p-3">{formatMoney(record.totalBdt)}</td><td /></tr></tfoot></table></TableFrame>
        <div className="flex flex-wrap gap-2 border-t border-blue-100 p-4">
          {revisable ? <Button icon={<Pencil className="h-4 w-4" />} disabled={run.isPending} onClick={() => { run.reset(); setEditing(true); }}>Create Revision</Button> : null}
          {manage && own && record.state === "Draft" ? <Button variant="primary" icon={<Send className="h-4 w-4" />} disabled={run.isPending} onClick={() => run.mutate({ path: `/ledger/journals/${record.id}/submit`, body: { version: record.version } })}>Submit for Approval</Button> : null}
          {record.approvalId ? <Button icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => navigate("/backend/approvals")}>{record.approvalState === "Posted" ? "Approval History" : `Approval: ${record.approvalState}`}</Button> : null}
          {manage && record.state === "Submitted" && record.approvalState === "Approved" && record.policyActive ? <Button variant="primary" icon={<BookCheck className="h-4 w-4" />} disabled={run.isPending} onClick={() => run.mutate({ path: `/ledger/journals/${record.id}/post`, body: { version: record.version } })}>Post Approved Journal</Button> : null}
        </div>
        {record.revisionOfId ? <div className="px-4 pb-4"><Button onClick={() => navigate(`/backend/accounts/ledger/journals/${record.revisionOfId}`)}>Previous Revision</Button></div> : null}
        {run.isError ? <ErrorBlock error={run.error} /> : null}
      </Panel>
    </> : null}
  </>;
}
