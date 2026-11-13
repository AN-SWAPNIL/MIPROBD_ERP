import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import type { z } from "zod";
import Button from "../../components/ui/Button";
import { useAuthStore } from "../../lib/auth/session";
import { ErrorBlock, Modal, inputClass, labelClass } from "../components";
import { controlRequest } from "../controls/client";
import { canManageLedger } from "./access";
import { ledgerAccountInput, ledgerAccountKinds, ledgerAccountSchema } from "./contracts";

type ChartAccount = z.infer<typeof ledgerAccountSchema>;
export default function ChartAccountSelect({ chart, label, value, defaultValue = "", onChange, name, kind, disabled = false, required = true, emptyLabel = "Select chart account" }: {
  chart: ChartAccount[]; label: string; value?: string; defaultValue?: string; onChange?: (id: string) => void; name?: string; kind?: ChartAccount["kind"]; disabled?: boolean; required?: boolean; emptyLabel?: string;
}) {
  const user = useAuthStore((s) => s.session?.user); const client = useQueryClient();
  const [selected, setSelected] = useState(defaultValue); const [created, setCreated] = useState<ChartAccount[]>([]); const [adding, setAdding] = useState(false);
  const current = value ?? selected;
  const rows = [...chart, ...created.filter((row) => !chart.some((c) => c.id === row.id))].filter((row) => row.id === current || row.active && (!kind || row.kind === kind));
  const choose = (id: string) => { setSelected(id); onChange?.(id); };
  const save = useMutation({ mutationFn: async (data: unknown) => ledgerAccountSchema.parse(await controlRequest("/ledger/accounts", ledgerAccountInput.parse(data))), onSuccess: async (row) => {
    setCreated((old) => [...old, row]); choose(row.id); setAdding(false); await client.invalidateQueries({ queryKey: ["ledger", "chart"] });
  } });
  return <div className="min-w-0" data-required={required && !disabled ? "true" : undefined}><select aria-label={label} name={name} className={inputClass} value={current} required={required} disabled={disabled} onChange={(e) => { if (e.target.value === "__add_chart__") { save.reset(); setAdding(true); } else choose(e.target.value); }}>
    <option value="">{emptyLabel}</option>{rows.map((row) => <option key={row.id} value={row.id}>{row.code} | {row.name}</option>)}
    {canManageLedger(user) && !disabled ? <option value="__add_chart__">+ Add chart account...</option> : null}
  </select>{adding ? <Modal open title="Add chart account" onClose={() => { if (!save.isPending) setAdding(false); }}>
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); save.mutate({ code: form.get("code"), name: form.get("accountName"), kind: kind ?? form.get("kind") }); }}>
      <label><span className={labelClass}>Account code</span><input className={inputClass} name="code" required maxLength={30} pattern="[A-Za-z0-9.-]+" /></label>
      <label><span className={labelClass}>Account name</span><input className={inputClass} name="accountName" required minLength={2} maxLength={120} /></label>
      {kind ? <div><span className={labelClass}>Account type</span><p className="py-2 text-sm font-semibold text-blue-950">{kind}</p></div> : <label><span className={labelClass}>Account type</span><select aria-label="Account type" className={inputClass} name="kind" defaultValue="Asset" required>{ledgerAccountKinds.map((value) => <option key={value}>{value}</option>)}</select></label>}
      {save.isError ? <ErrorBlock error={save.error} title="Chart account could not be saved" /> : null}
      <Button type="submit" variant="primary" disabled={save.isPending} icon={<Save className="h-4 w-4" />}>Save Account</Button>
    </form>
  </Modal> : null}</div>;
}
