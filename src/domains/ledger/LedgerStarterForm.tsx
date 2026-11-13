import { useState } from "react";
import { z } from "zod";
import { businessDate } from "../../lib/date";
import { ErrorBlock, inputClass, labelClass } from "../components";
import { ledgerAccountSchema, ledgerCashSchema } from "./contracts";
import ChartAccountSelect from "./ChartAccountSelect";
import LedgerSetupGroups from "./LedgerSetupGroups";
import LedgerSetupWizard from "./LedgerSetupWizard";
import { ledgerPurposeLabel } from "./setupGroups";
import { ledgerPurposeDescription, ledgerStarterInput, ledgerStarterProposal, ledgerStarterRows } from "./starter";

export default function LedgerStarterForm({ chart, cash, busy, error, save }: { chart: z.infer<typeof ledgerAccountSchema>[]; cash: z.infer<typeof ledgerCashSchema>[]; busy: boolean; error?: Error | null; save: (body: z.infer<typeof ledgerStarterInput>) => void }) {
  const [date, setDate] = useState(businessDate()), [reference, setReference] = useState(`Accounting setup ${businessDate()}`), [acknowledged, setAcknowledged] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const selections = Object.entries(choices).filter(([, id]) => id).map(([key, accountId]) => ({ key, accountId }));
  let proposal: ReturnType<typeof ledgerStarterProposal> | undefined;
  let issue: unknown;
  try { proposal = ledgerStarterProposal(chart, cash, selections); } catch (error) { issue = error; }
  const rows = ledgerStarterRows(cash);
  const input = ledgerStarterInput.safeParse({ effectiveFrom: date, proofReference: reference, acknowledgeDraft: acknowledged, selections });
  const summary = <div className="flex flex-wrap gap-3 border-y border-blue-100 py-3 text-xs font-semibold text-blue-950"><span>New accounts: {proposal?.filter(a => !a.existingId).length ?? "Review choices"}</span><span>Existing accounts: {proposal?.filter(a => a.existingId).length ?? "Review choices"}</span><span>Cash / bank: {cash.filter(a => a.active).length}</span></div>;
  return <LedgerSetupWizard busy={busy} error={error} assignmentsValid={!issue} saveDisabled={!input.success || Boolean(issue) || date > businessDate()} saveLabel="Save Starter Draft" save={() => { if (input.success && !issue && date <= businessDate()) save(input.data); }}
    details={<>
      <p className="text-sm text-slate-600">Company accounts for stock, customer dues, supplier dues and expenses. This draft uses a standard template; no balances, payments or approvals are created.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className={labelClass}>Accounting start date</span><input required type="date" className={inputClass} value={date} max={businessDate()} disabled={busy} onChange={e => { setDate(e.target.value); setAcknowledged(false); }} /></label>
        <label><span className={labelClass}>Setup reference</span><input required minLength={3} maxLength={200} className={inputClass} value={reference} disabled={busy} onChange={e => { setReference(e.target.value); setAcknowledged(false); }} /></label>
      </div>{summary}
    </>}
    accounts={<>
      {issue ? <ErrorBlock error={issue} title="Review the account choices" /> : null}
      <LedgerSetupGroups rows={rows} renderRow={row => <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div><strong className="text-sm text-blue-950">{ledgerPurposeLabel(row.role ?? row.name)}</strong><p className="mt-1 text-xs leading-5 text-slate-500">{ledgerPurposeDescription(row.key)}</p></div>
        <div className="min-w-0"><ChartAccountSelect chart={chart} label={`Account for ${row.role ?? row.name}`} value={choices[row.key] ?? ""} kind={row.kind} required={false} disabled={busy} emptyLabel={`Suggested: ${row.code} | ${row.name}`} onChange={id => { setChoices(current => ({ ...current, [row.key]: id })); setAcknowledged(false); }} /><span className="mt-1 block text-xs text-slate-500">{row.kind} | {proposal?.find(a => a.key === row.key)?.existingId ? "Existing account" : "New suggested account"}</span></div>
      </div>} />
      {!cash.some(a => a.active) ? <p className="text-sm text-slate-600">No cash/bank accounts registered. Stock receiving is available after approval; payments need a separate cash/bank assignment.</p> : null}
    </>}
    review={<>
      <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Setup reference</dt><dd className="break-words font-semibold">{reference}</dd></div><div><dt className="text-slate-500">Accounting start date</dt><dd>{date}</dd></div></dl>{summary}
      <LedgerSetupGroups rows={proposal ?? []} renderRow={row => <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{ledgerPurposeLabel(row.role ?? row.name)}</strong><span className="break-words">{row.code} | {row.name}<small className="block text-slate-500">{row.existingId ? "Existing" : "New"} | {row.kind}</small></span></div>} />
      <p className="text-sm text-amber-900">Draft only. Super Admin approval is a separate action before these accounts become active for transactions.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} required disabled={busy} /><span>I reviewed the proposed accounts and want to save an unapproved draft.</span></label>
    </>}
  />;
}
