import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import Button from "../../components/ui/Button";
import { apiRequest } from "../../lib/api/client";
import { useAuthStore } from "../../lib/auth/session";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { ErrorBlock, Modal, inputClass, labelClass } from "../components";
import { optionInput, optionRecord, type OptionKind } from "./contracts";

export default function OptionSelect({ kind, label, value, onChange, options, required, disabled, placeholder }: {
  kind: OptionKind; label: string; value: string; onChange: (value: string) => void; options: readonly string[]; required?: boolean; disabled?: boolean; placeholder?: string;
}) {
  const user = useAuthStore((s) => s.session?.user);
  const area = ["unit", "product-family"].includes(kind) ? "products" : kind === "country" ? "suppliers" : "import";
  const canAdd = hasEffectivePermission(user, area, "create") || hasEffectivePermission(user, area, "edit") || hasEffectivePermission(user, "settings", "create");
  const client = useQueryClient(); const [adding, setAdding] = useState(false); const [draft, setDraft] = useState(""); const [error, setError] = useState("");
  const query = useQuery({ queryKey: ["master-options", kind], queryFn: async () => optionRecord.array().parse((await apiRequest(`/api/settings/options?kind=${kind}`)).data), staleTime: 60_000 });
  const values = [...new Map([...options, ...(query.data ?? []).map((v) => v.value), ...(value ? [value] : [])].map((v) => [v.toLowerCase(), v])).values()];
  const save = useMutation({ mutationFn: async () => {
    const parsed = optionInput.safeParse({ kind, value: draft });
    if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(" "));
    return optionRecord.parse((await apiRequest("/api/settings/options", { method: "POST", body: JSON.stringify(parsed.data) })).data);
  }, onSuccess: async (row) => { await client.invalidateQueries({ queryKey: ["master-options", kind] }); onChange(row.value); setAdding(false); setDraft(""); } });
  return <div className="grid min-w-0 gap-1" data-required={required && !disabled ? "true" : undefined}>
    <select aria-label={label} className={inputClass} value={value} required={required} disabled={disabled} onChange={(e) => { if (e.target.value === "__add_option__") { setAdding(true); save.reset(); setError(""); } else onChange(e.target.value); }}>
      {placeholder || !value ? <option value="">{placeholder ?? `Select ${label.toLowerCase()}`}</option> : null}
      {values.map((v) => <option key={v} value={v}>{v}</option>)}
      {canAdd ? <option value="__add_option__">+ Add {label.toLowerCase()}...</option> : null}
    </select>
    {query.isError ? <p className="text-xs text-red-700">Additional options could not load. <button type="button" className="underline" onClick={() => void query.refetch()}>Retry</button></p> : null}
    {adding ? <Modal open title={`Add ${label.toLowerCase()}`} onClose={() => { if (!save.isPending) setAdding(false); }}>
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); if (!draft.trim()) setError("Enter a value."); else save.mutate(); }}>
        {save.isError ? <ErrorBlock error={save.error} title="Option could not be saved" /> : null}
        <label><span className={labelClass}>{label}</span><input autoFocus required maxLength={80} className={inputClass} value={draft} onChange={(e) => setDraft(kind === "currency" ? e.target.value.toUpperCase() : e.target.value)} /></label>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <div className="flex justify-end"><Button type="submit" variant="primary" disabled={save.isPending} icon={<Plus className="h-4 w-4" />}>Add Option</Button></div>
      </form>
    </Modal> : null}
  </div>;
}
