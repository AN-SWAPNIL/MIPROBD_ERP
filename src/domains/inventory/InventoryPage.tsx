import { useQuery } from "@tanstack/react-query";
import SalesReferenceLink from "../sales/SalesReferenceLink";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarClock, FileBarChart, PackageSearch, Search, Settings, Warehouse } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { foundationMode, workspacePath } from "../../lib/runtime";
import Button from "../../components/ui/Button";
import AIRecommendationCard from "../../components/ai/AIRecommendationCard";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { ErrorBlock, LoadingBlock, Panel, ProductThumb, Segmented, TableFrame, inputClass } from "../components";
import { aiService, inventoryService } from "../services";
import { useAuthStore, useEffectiveRole } from "../../lib/auth/session";
import { hasCapability, hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { formatCurrency, formatNumber } from "../../utils/format";

type View = "stock" | "batches" | "movements";

export default function InventoryPage() {
  const [view, setView] = useState<View>("stock");
  const [search, setSearch] = useState("");
  const route = useNavigate();
  const navigate = (path: string) => route(workspacePath(path));
  const role = useEffectiveRole();
  const user = useAuthStore((state) => state.session?.user);
  const canViewReports = hasEffectivePermission(user, "reports", "view");
  const stockQuery = useQuery({ queryKey: ["inventory", "stock"], queryFn: inventoryService.stock });
  const batchQuery = useQuery({ queryKey: ["inventory", "batches"], queryFn: inventoryService.batches });
  const movementQuery = useQuery({ queryKey: ["inventory", "movements"], queryFn: inventoryService.movements });
  const recommendationsQuery = useQuery({ queryKey: ["ai", "inventory", role], queryFn: () => aiService.recommendations({ route: "/app/inventory", entityType: "inventory" }), enabled: !foundationMode });
  const loading = stockQuery.isLoading || batchQuery.isLoading || movementQuery.isLoading;
  const error = stockQuery.error ?? batchQuery.error ?? movementQuery.error;

  const term = search.toLowerCase();
  const stock = useMemo(() => (stockQuery.data ?? []).filter((row) => [row.productCode, row.productName, row.oldestLot].some((value) => value.toLowerCase().includes(term))), [stockQuery.data, term]);
  const batches = useMemo(() => (batchQuery.data ?? []).filter((row) => [row.productCode, row.productName, row.batchNumber, row.lotNumber, row.location ?? ""].some((value) => value.toLowerCase().includes(term))).sort((a, b) => a.receivedDate.localeCompare(b.receivedDate)), [batchQuery.data, term]);
  const movements = useMemo(() => (movementQuery.data ?? []).filter((row) => [row.productName, row.batchNumber, row.reference].some((value) => value.toLowerCase().includes(term))), [movementQuery.data, term]);

  if (loading) return <LoadingBlock label="Loading stock, batches and movements" />;
  if (error) return <ErrorBlock error={error} onRetry={() => { void stockQuery.refetch(); void batchQuery.refetch(); void movementQuery.refetch(); }} />;

  const totalUnits = stock.reduce((sum, row) => sum + Number(row.availableQuantity), 0);
  const expiring = batches.filter((batch) => batch.expiryStatus !== "Normal").length;
  const hasValuation = hasCapability(user, "view_sensitive_cost") && stock.some((row) => row.inventoryValue !== undefined);
  const valuation = stock.reduce((sum, row) => sum + Number(row.inventoryValue ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="Warehouse inventory"
        title="Inventory"
        subtitle="One stock position with batch traceability, FIFO issue order and visible expiry awareness."
        actions={
          <>
            {canViewReports ? <Button icon={<FileBarChart className="h-4 w-4" />} onClick={() => navigate(`/app/reports/${view === "movements" ? "stock-movement" : view === "batches" ? "expiry-report" : "stock-summary"}`)}>Open Report</Button> : null}
            {hasEffectivePermission(user, "inventory", "post") && hasEffectivePermission(user, "import", "view") ? <Button icon={<Warehouse className="h-4 w-4" />} onClick={() => navigate(workspacePath("/app/imports"))}>Receive Finalized Import</Button> : null}
            {hasEffectivePermission(user, "products", "view") ? <Button icon={<Settings className="h-4 w-4" />} onClick={() => navigate(workspacePath("/app/settings?view=products"))}>Product Master</Button> : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"><span className="text-xs text-slate-500">Available quantity</span><strong className="mt-1 block text-2xl">{formatNumber(totalUnits)}</strong><small className="text-slate-400">across {stock.length} products</small></div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"><span className="text-xs text-slate-500">Tracked batches</span><strong className="mt-1 block text-2xl">{formatNumber(batches.length)}</strong><small className="text-slate-400">oldest receipt is issued first</small></div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"><span className="text-xs text-slate-500">{hasValuation ? "Inventory valuation" : "Expiry attention"}</span><strong className="mt-1 block text-2xl">{hasValuation ? formatCurrency(valuation, true) : formatNumber(expiring)}</strong><small className="text-slate-400">{hasValuation ? "sensitive owner view" : "batches needing review"}</small></div>
      </div>

      {recommendationsQuery.data?.length ? <section className="grid gap-3 lg:grid-cols-2" aria-label="Smart FIFO and expiry alerts">{recommendationsQuery.data.filter((item) => item.id.startsWith("fifo-") || item.id.startsWith("expiry-")).slice(0, 2).map((item) => <AIRecommendationCard recommendation={item} key={item.id} />)}</section> : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented value={view} onChange={setView} ariaLabel="Inventory views" options={[{ value: "stock", label: "Stock", count: stockQuery.data?.length }, { value: "batches", label: "Batches", count: batchQuery.data?.length }, { value: "movements", label: "Movements", count: movementQuery.data?.length }]} />
        <div className="relative w-full lg:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={inputClass + " pl-9"} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search inventory" /></div>
      </div>

      {view === "stock" ? (
        <Panel title="Available stock" subtitle="Product images and variant codes help prevent selection mistakes.">
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {stock.map((row) => (
              <article className="flex min-w-0 gap-3 rounded-md border border-slate-200 p-3" key={row.productId}>
                <ProductThumb src={row.imageUrl} name={row.productName} size="lg" />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold uppercase text-cyan-800">{row.productCode}</span>
                  <strong className="block truncate text-sm text-slate-950" title={row.productName}>{row.productName}</strong>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><span className="rounded bg-slate-50 p-2"><small className="block text-slate-400">Available</small><b>{formatNumber(row.availableQuantity)}</b></span><span className="rounded bg-slate-50 p-2"><small className="block text-slate-400">Sale price</small><b>{formatCurrency(row.standardSalePrice)}</b></span></div>
                  <p className="mt-2 truncate text-xs text-slate-500">FIFO lot: <strong className="text-slate-700">{row.oldestLot}</strong></p>
                  <p className="truncate text-xs text-slate-500">Nearest expiry: <strong className="text-slate-700">{row.nearestExpiry}</strong></p>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      ) : null}

      {view === "batches" ? (
        <Panel title="Batch register" subtitle="Rows are ordered by received date so the FIFO sequence is immediately visible.">
          <TableFrame>
            <table className="min-w-[1120px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">FIFO</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Lot / Batch</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Received</th><th className="px-4 py-3">Expiry</th><th className="px-4 py-3">Location</th><th className="px-4 py-3 text-right">Available</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{batches.map((batch, index) => {
                const isOldest = batch.expiryStatus !== "Expired" && !batches.slice(0, index).some((other) => other.productId === batch.productId && other.expiryStatus !== "Expired" && Number(other.quantityAvailable) > 0);
                return <tr key={batch.id}><td className="px-4 py-3">{isOldest ? <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">Issue first</span> : <span className="text-xs text-slate-400">Later</span>}</td><td className="px-4 py-3"><strong className="block">{batch.productName}</strong><small className="text-slate-500">{batch.productCode}</small></td><td className="px-4 py-3"><strong>{batch.lotNumber}</strong><small className="block text-slate-500">{batch.batchNumber}</small></td><td className="px-4 py-3 text-slate-600">{batch.sourceReference}<small className="block text-cyan-700">{batch.sourceType ?? "Import Receipt"}</small></td><td className="px-4 py-3 text-slate-600">{batch.receivedDate}</td><td className="px-4 py-3"><span className="block">{batch.expiryDate}</span><StatusBadge status={batch.expiryStatus} /></td><td className="px-4 py-3 text-slate-600">{batch.warehouse}<small className="block">{batch.location}</small></td><td className="px-4 py-3 text-right font-bold">{formatNumber(batch.quantityAvailable)}</td></tr>;
              })}</tbody>
            </table>
          </TableFrame>
        </Panel>
      ) : null}

      {view === "movements" ? (
        <Panel title="Stock movement journal" subtitle="Posted receipts and dispatches provide a traceable quantity history.">
          <TableFrame>
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Movement</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Batch</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3 text-right">Quantity</th><th className="px-4 py-3">Posted by</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{movements.map((movement) => <tr key={movement.id}><td className="px-4 py-3 text-slate-600">{movement.date}</td><td className="px-4 py-3"><span className={"inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-bold " + (movement.type === "Receive" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700")}>{movement.type === "Receive" ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}{movement.type}</span></td><td className="px-4 py-3 font-semibold">{movement.productName}</td><td className="px-4 py-3 text-slate-600">{movement.batchNumber}</td><td className="px-4 py-3 text-slate-600"><SalesReferenceLink type={movement.type === "Dispatch" ? "Challan" : undefined} id={movement.reference} label={movement.reference} /></td><td className="px-4 py-3 text-right font-bold">{formatNumber(movement.quantity)}</td><td className="px-4 py-3 text-slate-500">{movement.createdBy}</td></tr>)}</tbody>
            </table>
          </TableFrame>
        </Panel>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex gap-3 rounded-md border border-slate-200 bg-white p-3"><PackageSearch className="h-5 w-5 text-cyan-700" /><div><strong className="block text-sm">FIFO dispatch</strong><p className="text-xs leading-5 text-slate-500">Oldest eligible matching receipt is recommended in Sales.</p></div></div>
        <div className="flex gap-3 rounded-md border border-slate-200 bg-white p-3"><CalendarClock className="h-5 w-5 text-amber-600" /><div><strong className="block text-sm">Expiry stays visible</strong><p className="text-xs leading-5 text-slate-500">The user sees expiry before accepting a batch recommendation.</p></div></div>
        <div className="flex gap-3 rounded-md border border-slate-200 bg-white p-3"><AlertTriangle className="h-5 w-5 text-red-700" /><div><strong className="block text-sm">Controlled override</strong><p className="text-xs leading-5 text-slate-500">A newer lot requires capability, reason and an audit event.</p></div></div>
      </div>
    </>
  );
}
