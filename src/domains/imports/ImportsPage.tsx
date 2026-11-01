import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { workspacePath } from "../../lib/runtime";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import StatusBadge from "../../components/ui/StatusBadge";
import { ErrorBlock, LoadingBlock, Panel, TableFrame, inputClass } from "../components";
import { importService } from "../services";
import { useAuthStore } from "../../lib/auth/session";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { useToastStore } from "../../lib/ui/toast";
import { formatNumber } from "../../utils/format";

export default function ImportsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const user = useAuthStore((state) => state.session?.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const query = useQuery({ queryKey: ["imports"], queryFn: importService.list });
  const canCreate = hasEffectivePermission(user, "import", "create");
  const canDelete = hasEffectivePermission(user, "import", "delete");
  const deletion = useMutation({
    mutationFn: (id: string) => importService.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["imports"] });
      setDeleteId(null);
      pushToast({ kind: "success", title: "Import removed", message: "The unposted case was deleted." });
    },
    onError: (error) => pushToast({ kind: "error", title: "Could not delete import", message: error instanceof Error ? error.message : undefined })
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data ?? []).filter((record) => {
      const matchesSearch = !term || [record.primaryReference, record.draftReference, record.supplierName, record.poNumber, record.piNumber].some((value) => value?.toLowerCase().includes(term));
      return matchesSearch && (status === "All" || record.status === status);
    });
  }, [query.data, search, status]);

  if (query.isLoading) return <LoadingBlock label="Loading import cases" />;
  if (query.isError) return <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />;

  const records = query.data ?? [];
  const totalProducts = records.reduce((sum, record) => sum + record.items.length, 0);
  const finalized = records.filter((record) => record.costingStatus === "Finalized").length;

  return (
    <>
      <PageHeader
        eyebrow="Import operations"
        title="Imports"
        subtitle="One connected record from PI and LC/TT through shipment, cost allocation, finalization and warehouse receipt."
        actions={canCreate ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => navigate(workspacePath("/app/imports/new"))}>New Import</Button> : undefined}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Active cases", records.filter((record) => !["Closed", "Cancelled"].includes(record.status)).length],
          ["Product lines", totalProducts],
          ["Cost finalized", finalized]
        ].map(([label, value]) => (
          <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm" key={String(label)}>
            <span className="text-xs font-semibold text-slate-500">{label}</span>
            <strong className="mt-1 block text-2xl text-slate-950">{formatNumber(String(value))}</strong>
          </div>
        ))}
      </div>

      <Panel
        title="Import register"
        subtitle="The LC or TT number becomes the visible reference without duplicating the case."
        actions={
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className={inputClass + " w-full pl-9 sm:w-64"} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search imports" />
            </div>
            <select className={inputClass + " w-full sm:w-48"} value={status} onChange={(event) => setStatus(event.target.value)}>
              <option>All</option>
              {Array.from(new Set(records.map((record) => record.status))).map((value) => <option key={value}>{value}</option>)}
            </select>
          </>
        }
      >
        <TableFrame>
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">PI / PO</th><th className="px-4 py-3">Products</th><th className="px-4 py-3">ETA</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((record) => (
                <tr className="hover:bg-slate-50" key={record.id}>
                  <td className="px-4 py-3"><strong className="block text-slate-950">{record.primaryReference}</strong><span className="text-xs text-slate-400">{record.draftReference} · {record.paymentMode}</span></td>
                  <td className="max-w-56 px-4 py-3"><span className="block truncate font-semibold text-slate-800">{record.supplierName}</span><small className="text-slate-500">{record.currency}</small></td>
                  <td className="px-4 py-3 text-slate-600">{record.piNumber}<small className="block text-slate-400">{record.poNumber}</small></td>
                  <td className="px-4 py-3"><strong>{record.items.length}</strong><small className="block text-slate-500">{formatNumber(record.items.reduce((sum, item) => sum + Number(item.quantity), 0))} units</small></td>
                  <td className="px-4 py-3 text-slate-600">{record.eta ?? record.expectedShipmentDate ?? "-"}</td>
                  <td className="px-4 py-3"><StatusBadge status={record.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {canDelete && ["Draft", "PI Received", "Cancelled"].includes(record.status) && !record.snapshot ? (
                        <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteId(record.id)} aria-label="Delete import" title="Delete import" />
                      ) : null}
                      <Button variant="ghost" icon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate(workspacePath("/app/imports/" + record.id))}>Open</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
        {!filtered.length ? <div className="p-8 text-center text-sm text-slate-500">No import case matches the current filters.</div> : null}
      </Panel>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete import case?"
        message="Only an unposted draft, PI-received or cancelled case can be deleted. Posted costs and warehouse history are protected."
        confirmLabel="Delete case"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => deleteId && deletion.mutate(deleteId)}
      />
    </>
  );
}
