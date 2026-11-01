import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Decimal } from "decimal.js";
import { apiRequest } from "../../lib/api/client";
import type { SalesLine } from "../erp.types";
import { batchPageSchema } from "../inventory/pageContracts";
import { inventoryService } from "../services";
import { ErrorBlock, inputClass, labelClass } from "../components";
import { WorkforcePager } from "../marketing/WorkforceUi";
import { formatQuantity } from "../../utils/precise";

export default function PersistentDeliveryLine({ line, date, quantity, batchId, remaining, update }: { line: SalesLine; date: string; quantity: string; batchId: string; remaining: string; update: (key: "quantity" | "batchId", value: string) => void }) {
  const [search, setSearch] = useState(""); const term = useDeferredValue(search); const [page, setPage] = useState(1); const [selectedLabel, setSelectedLabel] = useState("");
  const params = new URLSearchParams({ productId: line.productId, eligibleOnly: "true", asOfDate: date, search: term, page: String(page), pageSize: "25" }).toString();
  const batches = useQuery({ queryKey: ["inventory", "delivery-batches", params], queryFn: async ({ signal }) => batchPageSchema.parse((await apiRequest(`/api/inventory/batches/page?${params}`, { signal })).data) });
  const validQty = /^\d+(\.\d{1,4})?$/.test(quantity) && new Decimal(quantity).gt(0);
  const preview = useQuery({ queryKey: ["inventory", "delivery-preview", line.productId, quantity, date, batchId], enabled: validQty, retry: false, queryFn: () => inventoryService.dispatchPreview({ productId: line.productId, quantity, date, batchId }) });
  return <fieldset className="min-w-0 rounded-md border border-blue-200 p-3"><legend className="px-1 text-sm font-bold">{line.productCode} | {line.productName}</legend>
    <div className="grid gap-3 sm:grid-cols-3"><label><span className={labelClass}>Delivery Qty (max {formatQuantity(remaining)})</span><input className={inputClass} type="number" min="0" max={remaining} step="0.0001" value={quantity} onChange={(e) => update("quantity", e.target.value)} /></label>
      <label><span className={labelClass}>Find batch / lot</span><input className={inputClass} maxLength={120} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label>
      <label><span className={labelClass}>Batch allocation</span><select className={inputClass} value={batchId} onChange={(e) => { update("batchId", e.target.value); setSelectedLabel(e.target.selectedOptions[0].text); }}><option value="AUTO">Automatic FIFO split</option>{batchId !== "AUTO" && !batches.data?.rows.some((r) => r.id === batchId) ? <option value={batchId}>{selectedLabel || "Selected batch"}</option> : null}{batches.data?.rows.map((row) => <option key={row.id} value={row.id}>{row.isFifo ? "Oldest" : "Override"} | Lot {row.lotNumber} | exp {row.expiryDate} | {formatQuantity(row.eligibleQuantity ?? row.quantityAvailable)} eligible</option>)}</select></label>
    </div>
    {batches.isError ? <ErrorBlock error={batches.error} /> : batches.data ? <WorkforcePager page={page} total={batches.data.total} pageSize={25} onChange={setPage} /> : null}
    {preview.isError ? <ErrorBlock error={preview.error} /> : preview.data ? <div className="mt-2 rounded border border-cyan-200 bg-cyan-50 p-3 text-xs"><strong>{batchId === "AUTO" ? "Automatic FIFO plan" : "Selected allocation"}</strong><div className="mt-2 flex flex-wrap gap-2">{preview.data.allocations.map((row) => <span key={row.batchId} className="rounded bg-white px-2 py-1">{formatQuantity(row.quantity)} | Lot {row.lotNumber} | expiry {row.expiryDate}</span>)}</div>{preview.data.warning ? <p className="mt-2 font-semibold text-amber-800">{preview.data.warning}</p> : null}</div> : null}
  </fieldset>;
}
