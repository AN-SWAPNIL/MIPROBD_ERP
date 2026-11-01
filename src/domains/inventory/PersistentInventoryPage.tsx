import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, FileBarChart, RotateCcw, Search, Settings, ShieldAlert, Warehouse } from "lucide-react";
import { Decimal } from "decimal.js";
import { useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAuthStore } from "../../lib/auth/session";
import { apiRequest } from "../../lib/api/client";
import { hasCapability, hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { formatMoney as formatCurrency, formatQuantity as formatNumber } from "../../utils/precise";
import { ErrorBlock, LoadingBlock, Panel, ProductThumb, Segmented, TableFrame, inputClass } from "../components";
import { WorkforcePager } from "../marketing/WorkforceUi";
import { batchPageSchema, inventorySummarySchema, movementPageSchema, stockPageSchema } from "./pageContracts";
import PlaceHoldDialog from "./PlaceHoldDialog";

type View = "stock" | "batches" | "movements";
export default function PersistentInventoryPage() {
  const [view, setView] = useState<View>("stock");
  const [search, setSearch] = useState(""); const term = useDeferredValue(search);
  const [expiry, setExpiry] = useState("all"); const [page, setPage] = useState(1);
  const [holdBatch, setHoldBatch] = useState<{ id: string; productName: string; batchNumber: string } | null>(null);
  const user = useAuthStore((state) => state.session?.user); const navigate = useNavigate();
  const params = new URLSearchParams({ search: term, expiry, page: String(page), pageSize: "25" }).toString();
  const summary = useQuery({ queryKey: ["inventory", "summary"], queryFn: async () => inventorySummarySchema.parse((await apiRequest("/api/inventory/summary")).data) });
  const stock = useQuery({ queryKey: ["inventory", "stock-page", params], enabled: view === "stock", queryFn: async ({ signal }) => stockPageSchema.parse((await apiRequest(`/api/inventory/stock/page?${params}`, { signal })).data) });
  const batches = useQuery({ queryKey: ["inventory", "batches-page", params], enabled: view === "batches", queryFn: async ({ signal }) => batchPageSchema.parse((await apiRequest(`/api/inventory/batches/page?${params}`, { signal })).data) });
  const movements = useQuery({ queryKey: ["inventory", "movements-page", params], enabled: view === "movements", queryFn: async ({ signal }) => movementPageSchema.parse((await apiRequest(`/api/inventory/movements/page?${params}`, { signal })).data) });
  const active = view === "stock" ? stock : view === "batches" ? batches : movements;
  const cost = hasCapability(user, "view_sensitive_cost");
  return <>
    <PageHeader title="Inventory" eyebrow="Warehouse inventory" subtitle="Stock, FIFO batches and posted movements." actions={<>
      <Button icon={<ShieldAlert className="h-4 w-4" />} onClick={() => navigate("/backend/inventory/holds")}>Stock Holds</Button>
      <Button icon={<ClipboardList className="h-4 w-4" />} onClick={() => navigate("/backend/inventory/controls")}>Counts & Write-offs</Button>
      <Button icon={<RotateCcw className="h-4 w-4"/>} onClick={()=>navigate("/backend/returns")}>Customer Returns</Button>
      <Button icon={<ShieldAlert className="h-4 w-4"/>} onClick={()=>navigate("/backend/supplier-claims")}>Supplier Claims</Button>
      {hasEffectivePermission(user, "reports") ? <Button icon={<FileBarChart className="h-4 w-4" />} onClick={() => navigate(`/backend/reports/${view === "movements" ? "stock-movement" : view === "batches" ? "expiry-report" : "stock-summary"}`)}>Open Report</Button> : null}
      {hasEffectivePermission(user, "inventory", "post") && hasEffectivePermission(user, "import") ? <Button icon={<Warehouse className="h-4 w-4" />} onClick={() => navigate("/backend/imports")}>Receive Import</Button> : null}
      {hasEffectivePermission(user, "products") ? <Button icon={<Settings className="h-4 w-4" />} onClick={() => navigate("/backend/settings?view=products")}>Products</Button> : null}
    </>} />
    {summary.isError ? <ErrorBlock error={summary.error} /> : summary.data ? <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-4"><span className="text-xs text-slate-600">Physical stock</span><strong className="mt-1 block text-2xl">{summary.data.products} products</strong>{summary.data.units.map((row) => <p key={row.unit} className="text-xs text-slate-600">{formatNumber(row.onHand)} {row.unit} on hand / {formatNumber(row.held)} held / {formatNumber(row.eligible)} eligible</p>)}</div>
      <div className="rounded-md border border-cyan-200 bg-cyan-50 p-4"><span className="text-xs text-slate-600">Batches with stock</span><strong className="mt-1 block text-2xl">{summary.data.batches}</strong><p className="text-xs text-slate-600">{summary.data.expiryAttention} expired or expiring within 183 days</p></div>
      {cost ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4"><span className="text-xs text-slate-600">Inventory cost value</span><strong className="mt-1 block text-2xl">{formatCurrency(summary.data.inventoryValue ?? "0")}</strong><p className="text-xs text-slate-600">All stock, including expiry review</p></div> : null}
    </div> : null}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Segmented value={view} onChange={(value) => { setView(value); setPage(1); }} ariaLabel="Inventory views" options={[{ value: "stock", label: "Stock" }, { value: "batches", label: "Batches" }, { value: "movements", label: "Movements" }]} />
      <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_180px] lg:w-[480px]"><div className="relative min-w-0"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search inventory" className={inputClass + " pl-9"} value={search} maxLength={120} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search inventory" /></div>
      <select aria-label="Expiry filter" className={inputClass} value={expiry} onChange={(e) => { setExpiry(e.target.value); setPage(1); }}><option value="all">All expiry dates</option><option value="normal">Over 183 days</option><option value="attention">Expiry attention</option><option value="expired">Expired</option></select></div>
    </div>
    <Panel title={view === "stock" ? "Stock by product" : view === "batches" ? "Batch register" : "Stock movement journal"}>
      {active.isPending ? <LoadingBlock /> : active.isError ? <ErrorBlock error={active.error} onRetry={() => { void active.refetch(); }} /> : <>
        {view === "stock" && stock.data ? <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{stock.data.rows.map((row) => <article key={row.productId} className="flex min-w-0 gap-3 rounded-md border border-blue-100 p-3"><ProductThumb src={row.imageUrl} name={row.productName} size="lg" /><div className="min-w-0 flex-1"><small className="text-cyan-800">{row.productCode}</small><strong className="block text-sm">{row.productName}</strong><p className="mt-2 text-sm font-semibold">{formatNumber(row.availableQuantity)} {row.unit}</p><p className="text-xs text-slate-600">Held: {formatNumber(row.heldQuantity)} / Eligible: {formatNumber(row.eligibleQuantity)} {row.unit}</p><p className="text-xs text-slate-600">Nearest expiry: {row.nearestExpiry}</p>{cost ? <p className="mt-1 text-xs">Cost value: {formatCurrency(row.inventoryValue ?? "0")}</p> : null}</div></article>)}</div> : null}
        {view === "batches" && batches.data ? <TableFrame><table className="w-full min-w-[1180px] text-left text-sm"><thead className="bg-blue-950 text-xs text-white"><tr>{["FIFO", "Product", "Lot / Batch", "Source", "Received", "Expiry", "Effective Condition", "Location", "On Hand / Held / Eligible", "Actions"].map((v) => <th className="p-3" key={v}>{v}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{batches.data.rows.map((row) => <tr key={row.id}><td className="p-3">{row.isFifo ? <span className="font-semibold text-emerald-700">Issue first</span> : "-"}</td><td className="p-3 font-semibold">{row.productName}<small className="block font-normal">{row.productCode}</small></td><td className="p-3">{row.lotNumber}<small className="block">{row.batchNumber}</small></td><td className="p-3">{row.sourceReference}<small className="block text-slate-500">{row.sourceType}</small></td><td className="p-3">{row.receivedDate}</td><td className="p-3">{row.expiryDate}<StatusBadge status={row.expiryStatus} /></td><td className="p-3"><StatusBadge status={row.condition ?? "Saleable"} /></td><td className="p-3">{row.warehouse}<small className="block">{row.location}</small></td><td className="p-3 text-right font-semibold">{formatNumber(row.quantityAvailable)} / {formatNumber(row.heldQuantity ?? "0")} / {formatNumber(row.eligibleQuantity ?? "0")}</td><td className="p-3">{hasEffectivePermission(user, "inventory", "post") && row.condition === "Saleable" && new Decimal(row.quantityAvailable).gt(row.heldQuantity ?? "0") ? <Button title="Place partial stock hold" aria-label={`Hold ${row.batchNumber}`} icon={<ShieldAlert className="h-4 w-4" />} onClick={() => setHoldBatch(row)} /> : null}</td></tr>)}</tbody></table></TableFrame> : null}
        {view === "movements" && movements.data ? <TableFrame><table className="w-full min-w-[860px] text-left text-sm"><thead className="bg-blue-950 text-xs text-white"><tr>{["Date", "Movement", "Product", "Batch", "Reference", "Quantity Change", "Posted by"].map((v) => <th className="p-3" key={v}>{v}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{movements.data.rows.map((row) => <tr key={row.id}><td className="p-3">{row.date}</td><td className="p-3">{row.type}</td><td className="p-3">{row.productName}</td><td className="p-3">{row.batchNumber}</td><td className="p-3">{row.reference}</td><td className="p-3 text-right font-semibold">{formatNumber(row.quantityDelta ?? row.quantity)}</td><td className="p-3">{row.createdBy}</td></tr>)}</tbody></table></TableFrame> : null}
        {!active.data?.total ? <p className="p-8 text-center text-sm text-slate-500">No inventory matches these filters.</p> : null}
        <WorkforcePager page={page} pageSize={25} total={active.data?.total ?? 0} onChange={setPage} />
      </>}
    </Panel>
    {holdBatch ? <PlaceHoldDialog batch={holdBatch} onClose={() => setHoldBatch(null)} /> : null}
  </>;
}
