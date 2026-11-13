import { useState } from "react";
import { Check } from "lucide-react";
import type { z } from "zod";
import Button from "../../components/ui/Button";
import { businessDate } from "../../lib/date";
import { ErrorBlock, Modal, labelClass, textareaClass } from "../components";
import { ledgerAccountSchema, ledgerCashSchema, type LedgerConfigurationData } from "./contracts";
import { ledgerPurposeDescription, ledgerSetupReviewIssues } from "./starter";

type Chart = z.infer<typeof ledgerAccountSchema>[];
type Cash = z.infer<typeof ledgerCashSchema>[];
export function LedgerSetupSummary({ data, chart, cash }: { data: LedgerConfigurationData; chart: Chart; cash: Cash }) {
  const rows = [...data.mappings.map(m => ({ key: m.role, label: m.role, accountId: m.accountId })), ...data.cashMappings.map(m => ({ key: `cash:${m.cashAccountId}`, label: cash.find(a => a.id === m.cashAccountId)?.name ?? "Unavailable payment account", accountId: m.accountId }))];
  return <div className="grid gap-3">
    <dl className="grid gap-3 border-b border-blue-100 pb-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Setup reference</dt><dd className="break-words font-semibold">{data.proofReference}</dd></div><div><dt className="text-xs text-slate-500">Accounting start date</dt><dd className="font-semibold">{data.effectiveFrom}</dd></div></dl>
    <div className="divide-y divide-blue-100">{rows.map(row => { const account = chart.find(a => a.id === row.accountId); return <div className="grid min-w-0 gap-1 py-2 text-sm sm:grid-cols-2" key={row.key}><div><strong className="text-blue-950">{row.label}</strong><p className="text-xs leading-5 text-slate-500">{ledgerPurposeDescription(row.key)}</p></div><div className="min-w-0 break-words sm:text-right">{account ? `${account.code} | ${account.name}` : "Unavailable ledger account"}<small className="block text-slate-500">{account?.kind ?? "Missing"}{account && !account.active ? " | Inactive" : ""}</small></div></div>; })}</div>
    {!data.cashMappings.length ? <p className="text-xs text-slate-600">No bank/cash accounts are assigned. A new payment account needs an approved assignment before it can post transactions.</p> : null}
  </div>;
}

export default function LedgerSetupReview({ data, chart, cash, busy, error, onClose, onApprove }: { data: LedgerConfigurationData; chart: Chart; cash: Cash; busy: boolean; error?: Error | null; onClose: () => void; onApprove: (reason: string) => void }) {
  const [reviewed, setReviewed] = useState(false), [reason, setReason] = useState("");
  const issues = ledgerSetupReviewIssues(data, chart, cash);
  if (data.effectiveFrom > businessDate()) issues.push("The accounting start date cannot be in the future.");
  return <Modal open title="Review Accounting Setup" width="max-w-3xl" onClose={() => { if (!busy) onClose(); }}><form className="grid gap-4" onSubmit={e => { e.preventDefault(); if (reviewed && reason.trim().length >= 5 && !issues.length && !busy) onApprove(reason.trim()); }}>
    <div className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950"><strong>Company-wide approval, not a warehouse receipt.</strong><p>These accounts will be used for new automatic accounting entries. Approval does not enter opening balances or receive any stock.</p></div>
    <LedgerSetupSummary data={data} chart={chart} cash={cash} />
    {issues.length ? <ul role="alert" className="list-inside list-disc rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : null}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} required disabled={busy} className="mt-1" /><span>I confirm the account assignments and start date are correct for this company.</span></label>
    <label><span className={labelClass}>Approval reason / evidence</span><textarea className={textareaClass} required minLength={5} maxLength={1000} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} /></label>
    {error ? <ErrorBlock error={error} /> : null}
    <div className="flex flex-wrap justify-end gap-2"><Button disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" icon={<Check className="h-4 w-4" />} disabled={busy || !reviewed || reason.trim().length < 5 || Boolean(issues.length)}>Approve Company Setup</Button></div>
  </form></Modal>;
}
