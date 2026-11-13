import { useState } from "react";
import { Save } from "lucide-react";
import { z } from "zod";
import Button from "../../components/ui/Button";
import { businessDate } from "../../lib/date";
import { ErrorBlock, inputClass, labelClass } from "../components";
import { ledgerAccountSchema, ledgerCashSchema } from "./contracts";
import ChartAccountSelect from "./ChartAccountSelect";
import { ledgerPurposeDescription, ledgerStarterInput, ledgerStarterProposal, ledgerStarterRows } from "./starter";

export default function LedgerStarterForm({ chart, cash, busy, error, save }: { chart: z.infer<typeof ledgerAccountSchema>[]; cash: z.infer<typeof ledgerCashSchema>[]; busy: boolean; error?: Error | null; save: (body: z.infer<typeof ledgerStarterInput>) => void }) {
  const [date, setDate] = useState(businessDate()), [reference, setReference] = useState(""), [acknowledged, setAcknowledged] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const selections = Object.entries(choices).filter(([, id]) => id).map(([key, accountId]) => ({ key, accountId }));
  let proposal: ReturnType<typeof ledgerStarterProposal> | undefined;
  let issue: unknown;
  try { proposal = ledgerStarterProposal(chart, cash, selections); } catch (error) { issue = error; }
  const rows = ledgerStarterRows(cash);
  const input = ledgerStarterInput.safeParse({ effectiveFrom: date, proofReference: reference, acknowledgeDraft: acknowledged, selections });
  return <form className="grid gap-4" onSubmit={e => { e.preventDefault(); if (input.success && !issue && date <= businessDate()) save(input.data); }}>
    <div className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950"><strong>General starter template, not approved company policy.</strong><p>Suggested accounts or your existing chart. Saving creates only a draft; activation is a separate review and approval. No balances or transactions are entered.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label><span className={labelClass}>Accounting start date</span><input required type="date" className={inputClass} value={date} max={businessDate()} onChange={e => { setDate(e.target.value); setAcknowledged(false); }} /></label>
      <label><span className={labelClass}>Setup reference</span><input required minLength={3} maxLength={200} className={inputClass} value={reference} onChange={e => { setReference(e.target.value); setAcknowledged(false); }} /></label>
    </div>
    <div className="flex flex-wrap gap-3 border-y border-blue-100 py-3 text-xs font-semibold text-blue-950"><span>Suggested template: {rows.length} accounts</span><span>New: {proposal?.filter(a => !a.existingId).length ?? "Review choices"}</span><span>Existing: {proposal?.filter(a => a.existingId).length ?? "Review choices"}</span><span>Saved cash/bank accounts: {cash.filter(a => a.active).length}</span></div>
    {issue ? <ErrorBlock error={issue} title="Review the account choices" /> : null}
    {!cash.some(a => a.active) ? <p className="text-sm text-slate-600">No cash/bank accounts are registered. Stock receiving does not move cash. Actual payment accounts must be added and assigned before collections or payments.</p> : null}
    <div className="divide-y divide-blue-100">{rows.map(row => <div className="grid min-w-0 gap-2 py-3 sm:grid-cols-[210px_minmax(0,1fr)]" key={row.key}>
      <div><strong className="text-sm text-blue-950">{row.role ?? row.name}</strong><p className="mt-1 text-xs leading-5 text-slate-600">{ledgerPurposeDescription(row.key)}</p></div>
      <div className="min-w-0"><ChartAccountSelect chart={chart} label={`Account for ${row.role ?? row.name}`} value={choices[row.key] ?? ""} kind={row.kind} required={false} disabled={busy} emptyLabel={`Suggested: ${row.code} | ${row.name}`} onChange={id => { setChoices(current => ({ ...current, [row.key]: id })); setAcknowledged(false); }} /><span className="mt-1 block text-xs text-slate-500">{row.kind} | {proposal?.find(a => a.key === row.key)?.existingId ? "Use existing account" : "Create suggested account unless another is selected"}</span></div>
    </div>)}</div>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} required /><span>I reviewed the proposed accounts and want to save an unapproved draft.</span></label>
    {error ? <ErrorBlock error={error} /> : null}
    <div className="flex justify-end"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy || !input.success || Boolean(issue) || date > businessDate()}>Save Starter Draft</Button></div>
  </form>;
}
