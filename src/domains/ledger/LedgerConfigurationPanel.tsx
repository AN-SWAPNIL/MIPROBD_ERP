import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Save, X } from "lucide-react";
import { z } from "zod";
import Button from "../../components/ui/Button";
import { useAuthStore } from "../../lib/auth/session";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { businessDate } from "../../lib/date";
import { ErrorBlock, LoadingBlock, Modal, Panel, TableFrame, inputClass, labelClass } from "../components";
import DecisionDialog from "../controls/DecisionDialog";
import { controlRequest } from "../controls/client";
import { ledgerAccountSchema, ledgerCashSchema, ledgerConfigurationInput, ledgerConfigurationSchema, ledgerMappingRoles, ledgerRoleKind, type LedgerConfigurationData } from "./contracts";
type Configuration = z.infer<typeof ledgerConfigurationSchema>;
export default function LedgerConfigurationPanel({ chart }: { chart: z.infer<typeof ledgerAccountSchema>[] }) {
  const user = useAuthStore((s) => s.session?.user); const allowed = user?.role === "Super Admin" && hasEffectivePermission(user, "settings"); const client = useQueryClient(); const [open, setOpen] = useState(false); const [decision, setDecision] = useState<{ row: Configuration; action: "approve" | "retire" } | null>(null);
  const query = useQuery({ queryKey: ["ledger", "configuration"], queryFn: async () => z.array(ledgerConfigurationSchema).parse(await controlRequest("/ledger/configurations")) });
  const cash = useQuery({ queryKey: ["ledger", "cash-masters"], queryFn: async () => z.array(ledgerCashSchema).parse(await controlRequest("/ledger/cash-masters")), enabled: allowed && open });
  const run = useMutation({ mutationFn: ({ path, body }: { path: string; body: unknown }) => controlRequest(path, body), onSuccess: async () => { setOpen(false); setDecision(null); await client.invalidateQueries({ queryKey: ["ledger"] }); } });
  if (query.isPending) return <LoadingBlock />;
  if (query.isError) return <ErrorBlock error={query.error} />;
  const previous = query.data.find((c) => c.state === "Approved") ?? query.data.find((c) => c.state === "Retired");
  return <Panel title="Automatic posting configuration" subtitle="Cutover date, chart controls and cash/bank mappings." actions={allowed ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => { run.reset(); setOpen(true); }}>New Mapping</Button> : null}>
    <TableFrame><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-blue-50 text-blue-950"><tr>{["Evidence", "Cutover", "Cash mappings", "Status", "Actions"].map((h) => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{query.data.map((row) => <tr key={row.id}><td className="p-3">{row.data.proofReference}</td><td className="p-3">{row.data.effectiveFrom}</td><td className="p-3">{row.data.cashMappings.length}</td><td className="p-3">{row.state}</td><td className="p-3">{allowed && (row.state === "Approved" || row.state === "Draft") ? <Button icon={row.state === "Draft" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />} onClick={() => { run.reset(); setDecision({ row, action: row.state === "Draft" ? "approve" : "retire" }); }}>{row.state === "Draft" ? "Approve" : "Retire"}</Button> : row.state === "Draft" ? <span className="text-xs text-amber-700">Super Admin approval required</span> : null}</td></tr>)}</tbody></table>{!query.data.length ? <p className="p-6 text-sm text-amber-800">No approved ledger mapping. Historical opening balances are not inferred.</p> : null}</TableFrame>
    {query.data.map((row) => <details className="border-t border-blue-100 p-4 text-sm" key={row.id}><summary className="cursor-pointer font-semibold text-blue-950">{row.data.proofReference} | Mapping detail</summary><dl className="mt-3 grid gap-3 sm:grid-cols-2">{row.data.mappings.map((m) => <div key={m.role}><dt className="text-xs text-slate-500">{m.role}</dt><dd>{chart.find((a) => a.id === m.accountId)?.name ?? m.accountId}</dd></div>)}</dl></details>)}
    {open ? <Modal open title="Ledger mapping draft" width="max-w-3xl" onClose={() => { if (!run.isPending) setOpen(false); }}>{cash.isPending ? <LoadingBlock /> : cash.isError ? <ErrorBlock error={cash.error} /> : <MappingForm chart={chart} cash={cash.data} previous={previous?.data} busy={run.isPending} error={run.error} save={(body) => run.mutate({ path: "/ledger/configurations", body })} />}</Modal> : null}
    {decision ? <DecisionDialog title={`${decision.action === "approve" ? "Approve" : "Retire"} ledger mapping`} busy={run.isPending} error={run.error} onClose={() => setDecision(null)} onConfirm={(reason) => run.mutate({ path: `/ledger/configurations/${decision.row.id}/${decision.action}`, body: { version: decision.row.version, reason } })} /> : null}
  </Panel>;
}
function MappingForm({ chart, cash, previous, busy, error, save }: { chart: z.infer<typeof ledgerAccountSchema>[]; cash: z.infer<typeof ledgerCashSchema>[]; previous?: LedgerConfigurationData; busy: boolean; error?: Error | null; save: (v: LedgerConfigurationData) => void }) {
  const [invalid, setInvalid] = useState(""); const included = cash.filter((c) => c.active || previous?.cashMappings.some((m) => m.cashAccountId === c.id));
  const select = (name: string, label: string, initial?: string, locked = false) => {
    const role = ledgerMappingRoles.find((r) => r === name); const kind = role ? ledgerRoleKind(role) : "Asset";
    return <label key={name}><span className={labelClass}>{label} ({kind})</span><select className={inputClass} name={name} defaultValue={initial ?? ""} required disabled={locked}><option value="">Select chart account</option>{chart.filter((a) => a.active && a.kind === kind || a.id === initial).map((a) => <option key={a.id} value={a.id}>{a.code} | {a.name}</option>)}</select>{locked ? <input name={name} type="hidden" value={initial} /> : null}</label>;
  };
  return <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const parsed = ledgerConfigurationInput.safeParse({ effectiveFrom: f.get("date"), proofReference: f.get("proof"), mappings: ledgerMappingRoles.map((role) => ({ role, accountId: f.get(role) })), cashMappings: included.map((c) => ({ cashAccountId: c.id, accountId: f.get(`cash-${c.id}`) })) }); if (!parsed.success) { setInvalid(parsed.error.issues[0].message); return; } setInvalid(""); save(parsed.data); }}>
    <div className="grid gap-3 sm:grid-cols-2"><label><span className={labelClass}>Approved cutover date</span><input className={inputClass} type="date" name="date" required defaultValue={previous?.effectiveFrom ?? businessDate()} max={businessDate()} readOnly={Boolean(previous)} /></label><label><span className={labelClass}>Evidence reference</span><input className={inputClass} name="proof" required minLength={3} maxLength={200} /></label></div>
    <fieldset><legend className="mb-3 font-semibold text-blue-950">Posting controls</legend><div className="grid gap-3 sm:grid-cols-2">{ledgerMappingRoles.map((role) => select(role, role, previous?.mappings.find((m) => m.role === role)?.accountId, Boolean(previous)))}</div></fieldset>
    <fieldset className="border-t border-blue-100 pt-4"><legend className="font-semibold text-blue-950">Cash / bank accounts</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">{included.map((c) => { const old = previous?.cashMappings.find((m) => m.cashAccountId === c.id); return select(`cash-${c.id}`, c.name, old?.accountId, Boolean(old)); })}</div></fieldset>
    {invalid ? <p className="text-sm text-red-700" role="alert">{invalid}</p> : null}{error ? <ErrorBlock error={error} /> : null}<div className="flex justify-end"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy}>Save Mapping Draft</Button></div>
  </form>;
}
