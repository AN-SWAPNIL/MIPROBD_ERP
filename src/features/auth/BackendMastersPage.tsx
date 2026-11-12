import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Plus, Archive, Printer, Settings, FileSpreadsheet, ShieldCheck } from "lucide-react";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { ErrorBlock, LoadingBlock, Modal, ProductThumb, TableFrame, inputClass } from "../../domains/components";
import MasterEditor from "../../domains/masters/MasterEditor";
import type { CashBankAccount, Product, Supplier } from "../../domains/erp.types";
import { settingsService } from "../../domains/services";
import { useAuthStore } from "../../lib/auth/session";
import { hasCapability, hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { useToastStore } from "../../lib/ui/toast";

type MasterKind = "products" | "suppliers" | "accounts";
type MasterRecord = Product | Supplier | CashBankAccount;
const reference = (row: MasterRecord) => "code" in row ? `${row.code} / ${row.unit}` : "country" in row ? row.country : `${row.type} / ${row.accountNumber || "-"}`;

export default function BackendMastersPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.session?.user);
  const productAccess = hasEffectivePermission(user, "products");
  const supplierAccess = hasEffectivePermission(user, "suppliers");
  const accountAccess = hasEffectivePermission(user, "settings") || hasEffectivePermission(user, "accounts");
  const [view, setView] = useState<MasterKind>(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    return requested === "suppliers" && supplierAccess ? "suppliers" : requested === "accounts" && accountAccess ? "accounts" : productAccess ? "products" : supplierAccess ? "suppliers" : "accounts";
  });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MasterRecord | "new" | null>(null);
  const [archiving, setArchiving] = useState<MasterRecord | null>(null);
  const client = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const products = useQuery({ queryKey: ["products"], queryFn: settingsService.products, enabled: productAccess });
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: settingsService.suppliers, enabled: supplierAccess });
  const accounts = useQuery({ queryKey: ["accounts", "masters"], queryFn: settingsService.accounts, enabled: accountAccess });
  const operation = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [view] });
      void client.invalidateQueries({ queryKey: ["sales", "payment-accounts"] });
      void client.invalidateQueries({ queryKey: ["sales", "lookup"] });
      void client.invalidateQueries({ queryKey: ["sales", "page"] });
      setEditing(null); setArchiving(null);
      toast({ kind: "success", title: "Master record saved" });
    },
    onError: (error) => toast({ kind: "error", title: "Could not save", message: error.message })
  });
  const query = view === "products" ? products : view === "suppliers" ? suppliers : accounts;
  const rows = (query.data ?? []).filter((row) => `${row.name} ${reference(row)}`.toLowerCase().includes(search.toLowerCase()));
  const can = (action: "create" | "edit" | "delete") => hasEffectivePermission(user, view === "accounts" ? "settings" : view, action);
  const singular = view === "products" ? "product" : view === "suppliers" ? "supplier" : "account";
  return <>
    <PageHeader title="Master Data" subtitle="Products, suppliers and cash/bank accounts" actions={hasEffectivePermission(user, "settings") ? <>
      {user?.role === "Super Admin" ? <Button icon={<ShieldCheck className="h-4 w-4" />} onClick={() => navigate("/backend/settings/launch")}>Launch Checks</Button> : null}
      {hasCapability(user, "view_sensitive_cost") && ["Super Admin", "Accounts", "Managing Director"].includes(user?.role ?? "") ? <Button icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => navigate("/backend/settings/opening")}>Opening Data</Button> : null}
      {user?.role === "Super Admin" ? <Button icon={<ShieldCheck className="h-4 w-4" />} onClick={() => navigate("/backend/settings/approvals")}>Approval Policies</Button> : null}
      <Button icon={<Settings className="h-4 w-4" />} onClick={() => navigate("/backend/settings/operations")}>Operational Settings</Button>
      <Button icon={<Printer className="h-4 w-4" />} onClick={() => navigate("/backend/settings/print")}>Company Stationery</Button>
    </> : undefined} />
    <div className="my-4 flex flex-wrap items-center gap-2">
      {(["products", "suppliers", "accounts"] as const).filter((area) => area === "accounts" ? accountAccess : hasEffectivePermission(user, area)).map((area) => <Button key={area} variant={view === area ? "primary" : "secondary"} onClick={() => { setView(area); setSearch(""); }}>{area === "products" ? "Products" : area === "suppliers" ? "Suppliers" : "Cash & Bank"}</Button>)}
      <label className="order-last w-full basis-full sm:order-none sm:ml-auto sm:min-w-48 sm:max-w-xs sm:flex-1 sm:basis-auto"><span className="sr-only">Search master records</span><input className={inputClass} placeholder="Search name or reference" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      {can("create") ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>Add {singular}</Button> : null}
    </div>
    {query.isPending ? <LoadingBlock /> : query.isError ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} /> : <TableFrame>
      <table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-blue-50 text-blue-950"><tr><th className="p-3">Name</th><th className="p-3">Reference</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-blue-100">{rows.map((row) => <tr key={row.id}><td className="p-3"><div className="flex items-center gap-3">{"code" in row ? <ProductThumb src={row.imageUrl} name={row.name} /> : null}<strong>{row.name}</strong></div></td><td className="p-3">{reference(row)}</td><td className="p-3">{row.active ? "Active" : "Inactive"}</td><td className="p-3"><div className="flex justify-end gap-1">{can("edit") ? <Button icon={<Pencil className="h-4 w-4" />} title="Edit" aria-label={`Edit ${row.name}`} onClick={() => setEditing(row)} /> : null}{can("delete") && row.active ? <Button icon={<Archive className="h-4 w-4" />} title="Deactivate" aria-label={`Deactivate ${row.name}`} onClick={() => setArchiving(row)} /> : null}</div></td></tr>)}{rows.length === 0 ? <tr><td colSpan={4} className="p-8 text-center text-slate-500">No matching records.</td></tr> : null}</tbody></table>
    </TableFrame>}
    {editing ? <Modal open title={`${editing === "new" ? "Add" : "Edit"} ${singular}`} onClose={() => setEditing(null)} width="max-w-2xl"><MasterEditor kind={view} record={editing === "new" ? undefined : editing} onSaved={() => { setEditing(null); toast({ kind: "success", title: "Master record saved" }); }} /></Modal> : null}
    <ConfirmDialog open={Boolean(archiving)} title="Deactivate master record?" message="The record will be unavailable for new transactions. Existing transaction history are preserved." confirmLabel="Deactivate" onCancel={() => setArchiving(null)} onConfirm={() => archiving && !operation.isPending && operation.mutate(() => view === "products" ? settingsService.removeProduct(archiving.id) : view === "suppliers" ? settingsService.removeSupplier(archiving.id) : settingsService.removeAccount(archiving.id))} />
  </>;
}
