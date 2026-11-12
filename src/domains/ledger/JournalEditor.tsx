import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { z } from "zod";
import Decimal from "decimal.js";
import Button from "../../components/ui/Button";
import { businessDate } from "../../lib/date";
import { formatMoney } from "../../utils/precise";
import { ErrorBlock, TableFrame, inputClass, labelClass, textareaClass } from "../components";
import { ledgerAccountSchema, ledgerJournalInput, type LedgerJournalDto } from "./contracts";
import ChartAccountSelect from "./ChartAccountSelect";

type Values = z.infer<typeof ledgerJournalInput>;
const D = Decimal.clone({ precision: 48 });
const blank = () => ({ key: crypto.randomUUID(), accountId: "", debit: "0", credit: "0", note: "" });
export default function JournalEditor({ chart, initial, busy, error, save }: { chart: z.infer<typeof ledgerAccountSchema>[]; initial?: LedgerJournalDto; busy: boolean; error?: Error | null; save: (data: Values) => void }) {
  const [lines, setLines] = useState(() => initial ? initial.lines.map((l) => ({ ...l, key: crypto.randomUUID() })) : [blank(), blank()]);
  const [invalid, setInvalid] = useState("");
  const update = (key: string, field: "accountId" | "debit" | "credit" | "note", value: string) => setLines(lines.map((line) => line.key === key ? { ...line, [field]: value } : line));
  const amount = (value: string) => /^\d+(\.\d{0,2})?$/.test(value) ? new D(value) : new D(0);
  const debit = lines.reduce((s, line) => s.plus(amount(line.debit)), new D(0)); const credit = lines.reduce((s, line) => s.plus(amount(line.credit)), new D(0));
  return <form className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" onSubmit={(e) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const parsed = ledgerJournalInput.safeParse({ date: f.get("date"), reference: f.get("reference"), proofReference: f.get("proofReference"), description: f.get("description"), type: f.get("type"), lines: lines.map(({ key, ...line }) => { void key; return line; }) });
    if (!parsed.success) { setInvalid(parsed.error.issues[0].message); return; }
    if (!debit.eq(credit) || debit.lte(0)) { setInvalid("Debit and credit must balance to a positive amount."); return; }
    setInvalid(""); save(parsed.data);
  }}>
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
      <label><span className={labelClass}>Business date</span><input className={inputClass} name="date" type="date" required defaultValue={initial?.date ?? businessDate()} max={businessDate()} /></label>
      <label><span className={labelClass}>Journal type</span><select className={inputClass} name="type" defaultValue={initial?.type === "Opening" ? "Opening" : "Adjustment"}><option>Adjustment</option><option>Opening</option></select></label>
      <label><span className={labelClass}>Reference</span><input className={inputClass} name="reference" required minLength={3} maxLength={160} defaultValue={initial?.reference} /></label>
      <label><span className={labelClass}>Evidence reference</span><input className={inputClass} name="proofReference" required minLength={3} maxLength={200} defaultValue={initial?.proofReference} /></label>
    </div>
    <label><span className={labelClass}>Description</span><textarea className={textareaClass} name="description" required minLength={5} maxLength={1000} defaultValue={initial?.description} /></label>
    <TableFrame><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-blue-50 text-blue-950"><tr><th className="p-2">Chart account</th><th className="p-2">Debit (BDT)</th><th className="p-2">Credit (BDT)</th><th className="p-2">Note</th><th className="p-2" aria-label="Remove line" /></tr></thead><tbody>{lines.map((line, i) => <tr key={line.key}>
      <td className="min-w-52 p-2"><ChartAccountSelect chart={chart} label={`Account line ${i + 1}`} value={line.accountId} disabled={busy} onChange={(id) => update(line.key, "accountId", id)} /></td>
      {(["debit", "credit"] as const).map((field) => <td className="min-w-32 p-2" key={field}><input className={inputClass} aria-label={`${field} line ${i + 1}`} required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={line[field]} onChange={(e) => update(line.key, field, e.target.value)} /></td>)}
      <td className="p-2"><input className={inputClass} aria-label={`Note line ${i + 1}`} maxLength={300} value={line.note} onChange={(e) => update(line.key, "note", e.target.value)} /></td>
      <td className="p-2"><Button title="Remove line" aria-label={`Remove line ${i + 1}`} icon={<Trash2 className="h-4 w-4" />} disabled={lines.length <= 2 || busy} onClick={() => setLines(lines.filter((l) => l.key !== line.key))} /></td>
    </tr>)}</tbody></table></TableFrame>
    <div className="flex flex-wrap items-center justify-between gap-3"><Button disabled={lines.length >= 100 || busy} icon={<Plus className="h-4 w-4" />} onClick={() => setLines([...lines, blank()])}>Add Line</Button><p className={`text-sm font-semibold tabular-nums ${debit.eq(credit) ? "text-blue-950" : "text-red-700"}`}>Debit {formatMoney(debit.toFixed(2))} | Credit {formatMoney(credit.toFixed(2))}</p></div>
    {invalid ? <p className="text-sm text-red-700" role="alert">{invalid}</p> : null}{error ? <ErrorBlock error={error} /> : null}
    <div className="flex justify-end"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy}>{initial ? "Save Linked Revision" : "Save Draft"}</Button></div>
  </form>;
}
