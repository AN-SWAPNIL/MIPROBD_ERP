import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../../lib/auth/session";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { Modal, inputClass } from "../components";
import { salesService, settingsService } from "../services";
import MasterEditor, { type MasterKind, type MasterRecord } from "./MasterEditor";

export default function MasterSelect({ kind, label, value, onChange, required, disabled, options }: {
  kind: MasterKind; label: string; value: string; onChange: (id: string, record?: MasterRecord) => void;
  required?: boolean; disabled?: boolean; options?: { id: string; label: string }[];
}) {
  const user = useAuthStore((s) => s.session?.user); const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<MasterRecord | null>(null);
  const query = useQuery<MasterRecord[]>({ queryKey: [kind], enabled: !options, queryFn: async () => kind === "products" ? settingsService.products() : kind === "suppliers" ? settingsService.suppliers() : kind === "customers" ? salesService.customers() : settingsService.accounts() });
  const area = kind === "customers" ? "customers" : kind === "accounts" ? "settings" : kind;
  const canAdd = hasEffectivePermission(user, area, "create");
  const suppliedRows = options ?? (query.data ?? []).filter((r) => r.active || r.id === value).map((r) => ({ id: r.id, label: "code" in r ? `${r.code} - ${r.name}` : r.name }));
  const rows = created && created.id === value && !suppliedRows.some((r) => r.id === created.id) ? [...suppliedRows, { id: created.id, label: created.name }] : suppliedRows;
  const singular = kind === "products" ? "product" : kind === "suppliers" ? "supplier" : kind === "customers" ? "customer" : "account";
  return <div className="grid min-w-0 gap-1" data-required={required && !disabled ? "true" : undefined}><select aria-label={label} className={inputClass} required={required} disabled={disabled || !options && query.isPending} value={value} onChange={(e) => { if (e.target.value === "__add_master__") setAdding(true); else onChange(e.target.value, query.data?.find((r) => r.id === e.target.value)); }}>
    <option value="">{query.isPending && !options ? "Loading..." : `Select ${singular}`}</option>
    {rows.map((r) => <option value={r.id} key={r.id}>{r.label}</option>)}
    {canAdd ? <option value="__add_master__">+ Add {singular}...</option> : null}
  </select>{query.isError && !options ? <p role="alert" className="text-xs text-red-700">{query.error.message} <button type="button" className="underline" onClick={() => void query.refetch()}>Retry</button></p> : null}
    {adding ? <Modal open title={`Add ${singular}`} onClose={() => setAdding(false)}><MasterEditor kind={kind} selectionMode onSaved={(row) => { setCreated(row); onChange(row.id, row); setAdding(false); }} /></Modal> : null}
  </div>;
}
