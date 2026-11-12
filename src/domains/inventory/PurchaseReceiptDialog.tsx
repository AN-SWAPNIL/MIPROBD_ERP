import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import Button from "../../components/ui/Button";
import { apiRequest } from "../../lib/api/client";
import { inputIssues, validationMessage } from "../../lib/api/validation";
import { businessDate } from "../../lib/date";
import { ErrorBlock, Modal, inputClass, labelClass, textareaClass } from "../components";
import MasterSelect from "../masters/MasterSelect";
import OptionSelect from "../masters/OptionSelect";
import { currencies } from "../masters/options";
import { purchaseInput, purchaseValuation, type PurchaseInput } from "./purchaseContracts";

const blank = () => ({ id: crypto.randomUUID(), productId: "", quantity: "", unitPrice: "", lotNumber: "", batchNumber: "", manufacturingDate: "", expiryDate: "", location: "" });
export default function PurchaseReceiptDialog({ onClose }: { onClose: () => void }) {
  const client = useQueryClient(); const [key] = useState(() => crypto.randomUUID());
  const [header, setHeader] = useState({ supplierId: "", reference: "", receivedDate: businessDate(), currency: "BDT", exchangeRate: "1", notes: "" });
  const [lines, setLines] = useState([blank()]); const [error, setError] = useState("");
  const change = (field: keyof typeof header, value: string) => setHeader((h) => ({ ...h, [field]: value }));
  const update = (id: string, field: keyof ReturnType<typeof blank>, value: string) => setLines((old) => old.map((l) => l.id === id ? { ...l, [field]: value } : l));
  const save = useMutation({ mutationFn: (data: PurchaseInput) => apiRequest("/api/inventory/purchases", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(data) }), onSuccess: async () => {
    await client.invalidateQueries({ queryKey: ["inventory"] }); await client.invalidateQueries({ queryKey: ["persistent-dashboard"] }); await client.invalidateQueries({ queryKey: ["accounts"] }); await client.invalidateQueries({ queryKey: ["reports"] }); await client.invalidateQueries({ queryKey: ["sales"] }); onClose();
  } });
  return <Modal open title="Add Inventory" subtitle="Purchase receipt" width="max-w-5xl" onClose={() => { if (!save.isPending) onClose(); }}>
    <form className="grid min-w-0 gap-4" onSubmit={(e) => { e.preventDefault(); const parsed = purchaseInput.safeParse({ ...header, exchangeRate: header.currency === "BDT" ? "1" : header.exchangeRate, lines: lines.map(({ id: _id, ...row }) => { void _id; return row; }) }); if (!parsed.success) { setError(validationMessage("Check the input fields.", inputIssues(parsed.error.issues))); return; } setError(""); save.mutate(parsed.data); }}>
      {error ? <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {save.isError ? <ErrorBlock error={save.error} title="Purchase receipt could not be posted" /> : null}
      <fieldset disabled={save.isPending} className="grid min-w-0 gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label><span className={labelClass}>Supplier</span><MasterSelect kind="suppliers" label="Supplier" value={header.supplierId} onChange={(id) => change("supplierId", id)} required /></label>
          <label><span className={labelClass}>Supplier invoice / Reference</span><input className={inputClass} required maxLength={200} value={header.reference} onChange={(e) => change("reference", e.target.value)} /></label>
          <label><span className={labelClass}>Receipt date</span><input className={inputClass} type="date" max={businessDate()} required value={header.receivedDate} onChange={(e) => change("receivedDate", e.target.value)} /></label>
          <label><span className={labelClass}>Currency</span><OptionSelect kind="currency" label="Currency" value={header.currency} options={currencies} required onChange={(currency) => setHeader((current) => ({ ...current, currency, exchangeRate: currency === "BDT" ? "1" : currency === current.currency ? current.exchangeRate : "" }))} /></label>
          <label><span className={labelClass}>BDT per currency unit</span><input className={inputClass} type="number" min="0.000001" step="0.000001" required disabled={header.currency === "BDT"} value={header.currency === "BDT" ? "1" : header.exchangeRate} onChange={(e) => change("exchangeRate", e.target.value)} /></label>
        </div>
        {lines.map((line, index) => {
          let value = "-"; try { value = `BDT ${purchaseValuation(line, header.currency, header.exchangeRate).totalBdt}`; } catch { /* Preview appears after positive quantity and price. */ }
          return <fieldset key={line.id} className="min-w-0 rounded-md border border-blue-200 p-3"><legend className="px-1 text-sm font-bold text-blue-950">Product {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="sm:col-span-2"><span className={labelClass}>Product</span><MasterSelect kind="products" label={`Product ${index + 1}`} value={line.productId} required onChange={(id) => update(line.id, "productId", id)} /></label>
            {([['quantity', 'Quantity', 'number'], ['unitPrice', `Unit price (${header.currency})`, 'number'], ['lotNumber', 'Lot number', 'text'], ['batchNumber', 'Batch number', 'text'], ['manufacturingDate', 'Manufacturing date', 'date'], ['expiryDate', 'Expiry date', 'date'], ['location', 'BIN / Rack', 'text']] as const).map(([field, label, type]) => <label key={field}><span className={labelClass}>{label}</span><input aria-label={`${label} ${index + 1}`} className={inputClass} type={type} required maxLength={200} min={type === "number" ? field === "quantity" ? "0.0001" : "0.000001" : undefined} step={field === "quantity" ? "0.0001" : "0.000001"} value={line[field]} onChange={(e) => update(line.id, field, e.target.value)} /></label>)}
          </div><div className="mt-3 flex items-center justify-between"><span className="text-sm font-semibold text-cyan-800">{value}</span><Button title="Remove line" aria-label={`Remove product ${index + 1}`} icon={<Trash2 className="h-4 w-4" />} disabled={lines.length === 1} onClick={() => setLines((old) => old.filter((l) => l.id !== line.id))} /></div></fieldset>;
        })}
        <label><span className={labelClass}>Notes</span><textarea className={textareaClass} maxLength={2000} value={header.notes} onChange={(e) => change("notes", e.target.value)} /></label>
        <div className="flex flex-wrap justify-between gap-2"><Button icon={<Plus className="h-4 w-4" />} onClick={() => setLines((old) => [...old, blank()])}>Add Product Line</Button><Button type="submit" variant="primary" disabled={save.isPending} icon={<Save className="h-4 w-4" />}>{save.isPending ? "Posting..." : "Post Purchase Receipt"}</Button></div>
      </fieldset>
    </form>
  </Modal>;
}
