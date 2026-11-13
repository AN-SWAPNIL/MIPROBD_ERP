import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import type { z } from "zod";
import { businessDate } from "../../lib/date";
import { inputClass, labelClass } from "../components";
import ChartAccountSelect from "./ChartAccountSelect";
import LedgerSetupGroups from "./LedgerSetupGroups";
import LedgerSetupWizard from "./LedgerSetupWizard";
import { LedgerSetupSummary } from "./LedgerSetupReview";
import { ledgerPurposeDescription, ledgerSetupReviewIssues } from "./starter";
import { ledgerPurposeLabel } from "./setupGroups";
import { ledgerAccountSchema, ledgerCashSchema, ledgerConfigurationInput, ledgerMappingRoles, ledgerRoleKind, type LedgerConfigurationData } from "./contracts";

export default function LedgerMappingForm({ chart, cash, previous, preserveAccounts, busy, error, save }: { chart: z.infer<typeof ledgerAccountSchema>[]; cash: z.infer<typeof ledgerCashSchema>[]; previous?: LedgerConfigurationData; preserveAccounts: boolean; busy: boolean; error?: Error | null; save: (v: LedgerConfigurationData) => void }) {
  const included = cash.filter(c => c.active || previous?.cashMappings.some(m => m.cashAccountId === c.id));
  const [date, setDate] = useState(previous?.effectiveFrom ?? businessDate());
  const [reference, setReference] = useState(`Accounting setup ${businessDate()}`);
  const [choices, setChoices] = useState<Record<string, string>>(() => Object.fromEntries([
    ...(previous?.mappings.map(m => [m.role, m.accountId]) ?? []),
    ...(previous?.cashMappings.map(m => [`cash:${m.cashAccountId}`, m.accountId]) ?? [])
  ]));
  const [reviewed, setReviewed] = useState(false);
  const data: LedgerConfigurationData = { effectiveFrom: date, proofReference: reference, mappings: ledgerMappingRoles.map(role => ({ role, accountId: choices[role] ?? "" })), cashMappings: included.map(c => ({ cashAccountId: c.id, accountId: choices[`cash:${c.id}`] ?? "" })) };
  const parsed = ledgerConfigurationInput.safeParse(data);
  const issues = [...new Set([...ledgerSetupReviewIssues(data, chart, cash), ...(!parsed.success ? parsed.error.issues.map(i => i.message) : [])])];
  const rows = [...ledgerMappingRoles.map(role => ({ key: role, label: ledgerPurposeLabel(role), kind: ledgerRoleKind(role), locked: preserveAccounts && Boolean(previous?.mappings.some(m => m.role === role)) })), ...included.map(c => ({ key: `cash:${c.id}`, label: c.name, kind: "Asset" as const, locked: preserveAccounts && Boolean(previous?.cashMappings.some(m => m.cashAccountId === c.id)) }))];
  const unassigned = rows.filter(row => !choices[row.key]);
  return <LedgerSetupWizard busy={busy} error={error} assignmentsValid={issues.length === 0} saveDisabled={!reviewed || issues.length > 0 || date > businessDate()} saveLabel="Save Setup Draft" save={() => { if (parsed.success && !issues.length && reviewed && date <= businessDate()) save(parsed.data); }}
    details={<>
      {preserveAccounts ? <p className="border-l-4 border-cyan-600 bg-cyan-50 p-3 text-sm text-cyan-950">Approved assignments and the accounting start date are protected. This version can add new assignments without changing existing balances. Replacing an approved account requires a reviewed accounting migration.</p> : <p className="text-sm text-slate-600">Draft assignments remain editable until approval. Each business purpose has a separate account in the company ledger.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {preserveAccounts ? <div><span className={labelClass}>Accounting start date</span><p className="flex items-center gap-2 py-2 text-sm"><LockKeyhole className="h-4 w-4" />{date}</p></div> : <label><span className={labelClass}>Accounting start date</span><input className={inputClass} type="date" required value={date} max={businessDate()} disabled={busy} onChange={e => { setDate(e.target.value); setReviewed(false); }} /></label>}
        <label><span className={labelClass}>Setup reference</span><input className={inputClass} required minLength={3} maxLength={200} value={reference} disabled={busy} onChange={e => { setReference(e.target.value); setReviewed(false); }} /></label>
      </div>
      <p className="text-sm text-slate-600">{rows.filter(r => r.locked).length} protected assignments | {unassigned.length} awaiting assignment | {included.length} cash/bank accounts</p>
    </>}
    accounts={<>
      <LedgerSetupGroups rows={rows} initialGroup={preserveAccounts && included.length ? "cash" : "stock"} renderRow={row => {
        const account = chart.find(a => a.id === choices[row.key]);
        return <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]"><div><strong className="text-sm text-blue-950">{row.label}</strong><p className="mt-1 text-xs leading-5 text-slate-500">{ledgerPurposeDescription(row.key)}</p></div>
          {row.locked ? <div className="flex min-w-0 items-start gap-2 py-1 text-sm" data-locked-account={row.key}><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /><div className="break-words">{account ? `${account.code} | ${account.name}` : "Unavailable account"}<small className="block text-slate-500">Approved assignment | {row.kind}</small></div></div> : <div className="min-w-0"><ChartAccountSelect chart={chart} label={`${row.label} chart account`} value={choices[row.key] ?? ""} kind={row.kind} disabled={busy} onChange={id => { setChoices(current => ({ ...current, [row.key]: id })); setReviewed(false); }} /><small className="text-slate-500">{row.kind}</small></div>}
        </div>;
      }} />
      {unassigned.length ? <p role="status" className="text-sm text-amber-900">Awaiting assignment: {unassigned.map(r => r.label).join(", ")}.</p> : issues.length ? <ul role="alert" className="list-inside list-disc text-sm text-red-700">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : null}
      {!included.length ? <p className="text-sm text-slate-500">No cash/bank accounts registered. Payments need a separate cash/bank assignment.</p> : null}
    </>}
    review={<><LedgerSetupSummary data={data} chart={chart} cash={cash} /><p className="text-sm text-amber-900">Saving creates a draft only. The current approved setup remains unchanged until approval.</p><label className="flex items-start gap-2 text-sm"><input required type="checkbox" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)} /><span>I reviewed the account assignments for this draft.</span></label></>}
  />;
}
