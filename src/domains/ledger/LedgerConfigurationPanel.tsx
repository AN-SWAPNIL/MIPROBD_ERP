import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react";
import { z } from "zod";
import Button from "../../components/ui/Button";
import { useAuthStore } from "../../lib/auth/session";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { ErrorBlock, LoadingBlock, Modal, Panel, TableFrame } from "../components";
import DecisionDialog from "../controls/DecisionDialog";
import MappingForm from "./LedgerMappingForm";
import LedgerStarterForm from "./LedgerStarterForm";
import LedgerSetupReview, { LedgerSetupSummary } from "./LedgerSetupReview";
import { controlRequest } from "../controls/client";
import { ledgerAccountSchema, ledgerCashSchema, ledgerConfigurationSchema } from "./contracts";
type Configuration = z.infer<typeof ledgerConfigurationSchema>;
export default function LedgerConfigurationPanel({ chart }: { chart: z.infer<typeof ledgerAccountSchema>[] }) {
  const user = useAuthStore((s) => s.session?.user); const allowed = user?.role === "Super Admin" && hasEffectivePermission(user, "settings"); const client = useQueryClient(); const [open, setOpen] = useState(false); const [decision, setDecision] = useState<{ row: Configuration; action: "approve" | "retire" } | null>(null);
  const query = useQuery({ queryKey: ["ledger", "configuration"], queryFn: async () => z.array(ledgerConfigurationSchema).parse(await controlRequest("/ledger/configurations")) });
  const [starterOpen, setStarterOpen] = useState(false);
  const cash = useQuery({ queryKey: ["ledger", "cash-masters"], queryFn: async () => z.array(ledgerCashSchema).parse(await controlRequest("/ledger/cash-masters")) });
  const run = useMutation({ mutationKey: ["ledger-configuration"], mutationFn: ({ path, body }: { path: string; body: unknown }) => controlRequest(path, body), onSuccess: async () => { setOpen(false); setStarterOpen(false); setDecision(null); await client.invalidateQueries({ queryKey: ["ledger"] }); await client.invalidateQueries({ queryKey: ["import-receiving-readiness"] }); } });
  if (query.isPending || cash.isPending) return <LoadingBlock />;
  if (query.isError || cash.isError) return <ErrorBlock error={query.error ?? cash.error} onRetry={() => { void query.refetch(); void cash.refetch(); }} />;
  const baseline = query.data.find((c) => c.state === "Approved") ?? query.data.find((c) => c.state === "Retired");
  const previous = baseline ?? query.data.find(c => c.state === "Draft");
  return <Panel title="Company accounting setup" subtitle="Company start date and accounts for stock, sales, payments and expenses." actions={allowed ? <>{!query.data.length ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { run.reset(); setStarterOpen(true); }}>Starter Setup</Button> : null}<Button icon={<Plus className="h-4 w-4" />} onClick={() => { run.reset(); setOpen(true); }}>New Setup Version</Button></> : null}>
    <TableFrame><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-blue-50 text-blue-950"><tr>{["Setup reference", "Start date", "Bank / cash accounts", "Status", "Actions"].map((h) => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{query.data.map((row) => <tr key={row.id}><td className="p-3">{row.data.proofReference}</td><td className="p-3">{row.data.effectiveFrom}</td><td className="p-3">{row.data.cashMappings.length}</td><td className="p-3">{row.state}</td><td className="p-3">{allowed && (row.state === "Approved" || row.state === "Draft") ? <Button icon={row.state === "Draft" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />} onClick={() => { run.reset(); setDecision({ row, action: row.state === "Draft" ? "approve" : "retire" }); }}>{row.state === "Draft" ? "Review & Approve" : "Retire"}</Button> : row.state === "Draft" ? <span className="text-xs text-amber-700">Super Admin approval required</span> : null}</td></tr>)}</tbody></table>{!query.data.length ? <p className="p-6 text-sm text-amber-800">Company accounting setup has not been approved yet. Opening balances are not created automatically.</p> : null}</TableFrame>
    {query.data.map((row) => <details className="border-t border-blue-100 p-4 text-sm" key={row.id}><summary className="cursor-pointer font-semibold text-blue-950">{row.data.proofReference} | Assigned accounts</summary><div className="mt-3"><LedgerSetupSummary data={row.data} chart={chart} cash={cash.data ?? []} /></div></details>)}
    {open ? <Modal open title="Accounting setup draft" width="max-w-3xl" onClose={() => { if (!run.isPending) setOpen(false); }}><MappingForm chart={chart} cash={cash.data ?? []} previous={previous?.data} preserveAccounts={Boolean(baseline)} busy={run.isPending} error={run.error} save={(body) => run.mutate({ path: "/ledger/configurations", body })} /></Modal> : null}
    {decision?.action === "approve" ? <LedgerSetupReview key={`${decision.row.id}-${decision.row.version}`} data={decision.row.data} chart={chart} cash={cash.data ?? []} busy={run.isPending} error={run.error} onClose={() => setDecision(null)} onApprove={reason => run.mutate({ path: `/ledger/configurations/${decision.row.id}/approve`, body: { version: decision.row.version, reason } })} /> : decision ? <DecisionDialog title="Retire accounting setup" busy={run.isPending} error={run.error} onClose={() => setDecision(null)} onConfirm={(reason) => run.mutate({ path: `/ledger/configurations/${decision.row.id}/retire`, body: { version: decision.row.version, reason } })} /> : null}
    {starterOpen ? <Modal open title="Starter Accounting Setup" width="max-w-3xl" onClose={() => { if (!run.isPending) setStarterOpen(false); }}><LedgerStarterForm chart={chart} cash={cash.data ?? []} busy={run.isPending} error={run.error} save={body => run.mutate({ path: "/ledger/configurations/starter", body })} /></Modal> : null}
  </Panel>;
}
