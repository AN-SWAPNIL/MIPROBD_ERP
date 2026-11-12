import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { ErrorBlock, inputClass } from "../components";
import { Modal } from "../components";
import MasterEditor, { type MasterKind } from "../masters/MasterEditor";
import { useAuthStore } from "../../lib/auth/session";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { WorkforcePager } from "../marketing/WorkforceUi";
import { getSalesPage } from "./pages";
import { salesRowSchemas, type SalesKind, type SalesRows } from "./pageContracts";

export default function SalesRecordSelect<K extends SalesKind>({ kind, label, value, onChange, display, filters = {}, required = false, disabled = false }: {
  kind: K; label: string; value: string; onChange: (row: SalesRows[K] | null) => void; display: (row: SalesRows[K]) => string;
  filters?: Record<string, string>; required?: boolean; disabled?: boolean;
}) {
  const [search, setSearch] = useState(""); const term = useDeferredValue(search); const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false); const [created, setCreated] = useState<SalesRows[K] | null>(null);
  const user = useAuthStore((s) => s.session?.user);
  const masterKind = ["products", "customers", "accounts"].includes(kind) ? kind as MasterKind : null;
  const canAdd = masterKind && hasEffectivePermission(user, kind === "accounts" ? "settings" : kind as "products" | "customers", "create");
  const params = { ...filters, search: term, page: String(page), pageSize: "25", ...(value ? { selectedId: value } : {}) };
  const query = useQuery({ queryKey: ["sales", "lookup", kind, params], queryFn: ({ signal }) => getSalesPage(kind, params, signal) });
  const rows = query.data?.rows ?? [];
  const selected = query.data?.selected;
  const options = [...(created && created.id === value ? [created] : []), ...(selected && !rows.some((row) => row.id === selected.id) ? [selected] : []), ...rows].filter((row, i, all) => all.findIndex((r) => r.id === row.id) === i);
  return <div className="grid min-w-0 gap-2" data-required={required && !disabled ? "true" : undefined}>
    <div className="relative min-w-0"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label={`Search ${label}`} className={inputClass + " pl-9"} maxLength={120} placeholder={`Search ${label.toLowerCase()}`} disabled={disabled} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
    <select aria-label={label} className={inputClass} required={required} disabled={disabled || query.isPending || query.isError} value={value} onChange={(e) => { if (e.target.value === "__add_master__") setAdding(true); else onChange(options.find((row) => row.id === e.target.value) ?? null); }}>
      <option value="">{query.isPending ? "Loading..." : `Select ${label.toLowerCase()}`}</option>
      {options.map((row) => <option key={row.id} value={row.id}>{display(row)}</option>)}
      {canAdd ? <option value="__add_master__">+ Add {kind === "products" ? "product" : kind === "customers" ? "customer" : "account"}...</option> : null}
    </select>
    {query.isError ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} /> : null}
    {(query.data?.total ?? 0) > 25 ? <WorkforcePager page={page} pageSize={25} total={query.data?.total ?? 0} onChange={setPage} /> : null}
    {adding && masterKind ? <Modal open title={`Add ${masterKind === "products" ? "product" : masterKind === "customers" ? "customer" : "account"}`} onClose={() => setAdding(false)}><MasterEditor kind={masterKind} selectionMode accountType={kind === "accounts" && ["Cash", "Bank", "Mobile Banking"].includes(filters.accountType) ? filters.accountType as "Cash" | "Bank" | "Mobile Banking" : undefined} onSaved={(row) => { const result = salesRowSchemas[kind].parse(row) as SalesRows[K]; setCreated(result); setSearch(""); setPage(1); if (!filters.accountType || "type" in row && row.type === filters.accountType) onChange(result); setAdding(false); }} /></Modal> : null}
  </div>;
}
