import { useState } from "react";
import { Save } from "lucide-react";
import { z } from "zod";
import Button from "../../components/ui/Button";
import { businessDate } from "../../lib/date";
import { ErrorBlock, TableFrame, inputClass, labelClass } from "../components";
import { ledgerAccountSchema, ledgerCashSchema } from "./contracts";
import { ledgerStarterInput, ledgerStarterProposal } from "./starter";

export default function LedgerStarterForm({ chart, cash, busy, error, save }: { chart: z.infer<typeof ledgerAccountSchema>[]; cash: z.infer<typeof ledgerCashSchema>[]; busy: boolean; error?: Error | null; save: (body: z.infer<typeof ledgerStarterInput>) => void }) {
  const [date, setDate] = useState(businessDate()), [reference, setReference] = useState(""), [acknowledged, setAcknowledged] = useState(false);
  let proposal;
  try { proposal = ledgerStarterProposal(chart, cash); } catch (issue) { return <ErrorBlock error={issue} />; }
  const input = ledgerStarterInput.safeParse({ effectiveFrom: date, proofReference: reference, acknowledgeDraft: acknowledged });
  return <form className="grid gap-4" onSubmit={e => { e.preventDefault(); if (input.success) save(input.data); }}>
    <div className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950"><strong>Proposed accounts, not approved company policy.</strong><p>No balances or transactions will be posted. Approval remains a separate Super Admin action.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label><span className={labelClass}>Accounting start date</span><input required type="date" className={inputClass} value={date} max={businessDate()} onChange={e => setDate(e.target.value)} /></label>
      <label><span className={labelClass}>Setup reference</span><input required minLength={3} maxLength={200} className={inputClass} value={reference} onChange={e => setReference(e.target.value)} /></label>
    </div>
    <TableFrame><table className="w-full min-w-[460px] text-left text-sm"><thead className="bg-blue-50 text-blue-950"><tr>{["Code", "Proposed account", "Type", "Status"].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{proposal.map(a => <tr key={a.code}><td className="p-2">{a.code}</td><td className="p-2">{a.name}</td><td className="p-2">{a.kind}</td><td className="p-2">{a.existingId ? "Existing" : "New"}</td></tr>)}</tbody></table></TableFrame>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} required /><span>I reviewed the proposed accounts and want to save an unapproved draft.</span></label>
    {error ? <ErrorBlock error={error} /> : null}
    <div className="flex justify-end"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy || !input.success || date > businessDate()}>Save Starter Draft</Button></div>
  </form>;
}
