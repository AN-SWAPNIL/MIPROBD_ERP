import { useState, type FormEvent } from "react";
import { Decimal as DecimalJs } from "decimal.js";
import { Save } from "lucide-react";
import Button from "../../components/ui/Button";
import { ApiRequestError } from "../../lib/api/client";
import { ErrorBlock, KeyValue, ProductThumb, inputClass, labelClass } from "../components";
import type { ImportCase, ImportItem, Product } from "../erp.types";
import MasterSelect from "../masters/MasterSelect";
import OptionSelect from "../masters/OptionSelect";
import { currencies } from "../masters/options";
import { paymentPayload } from "./paymentPayload";
import { sumLcAmounts } from "./lcAmounts";
import { decimalPreview, isDecimalInput } from "../../lib/decimalInput";
import { useAuthStore } from "../../lib/auth/session";
import { hasCapability } from "../../lib/permissions/effectiveAccess";
const Decimal = DecimalJs.clone({ precision: 48, rounding: DecimalJs.ROUND_HALF_UP });

export function CommercialEditor({ record, busy, onSubmit, requirePi = false }: { record: ImportCase; busy: boolean; onSubmit: (payload: Partial<ImportCase>) => void; requirePi?: boolean }) {
  const [form, setForm] = useState({ supplierId: record.supplierId ?? "", poNumber: record.poNumber, poDate: record.poDate, piNumber: record.piNumber ?? "", piDate: record.piDate ?? "", expectedShipmentDate: record.expectedShipmentDate ?? "", notes: record.notes ?? "" });
  const change = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(requirePi ? { piNumber: form.piNumber, piDate: form.piDate } : { supplierId: form.supplierId, poNumber: form.poNumber, poDate: form.poDate, expectedShipmentDate: form.expectedShipmentDate, notes: form.notes }); }}>
    {!requirePi ? <>
    <label className="sm:col-span-2"><span className={labelClass}>Supplier</span><MasterSelect kind="suppliers" label="Supplier" value={form.supplierId} onChange={(value) => change("supplierId", value)} required disabled={!["Draft", "PI Received", "LC/TT Opened"].includes(record.status)} /></label>
    <label><span className={labelClass}>PO Number</span><input className={inputClass} value={form.poNumber} maxLength={200} onChange={(e) => change("poNumber", e.target.value)} required /></label>
    <label><span className={labelClass}>PO Date</span><input className={inputClass} type="date" value={form.poDate} onChange={(e) => change("poDate", e.target.value)} required /></label>
    </> : null}
    {requirePi ? <>
    <label><span className={labelClass}>PI Number</span><input className={inputClass} value={form.piNumber} maxLength={200} onChange={(e) => change("piNumber", e.target.value)} placeholder="Pending supplier PI" required={requirePi} /></label>
    <label><span className={labelClass}>PI Date</span><input className={inputClass} type="date" value={form.piDate} onChange={(e) => change("piDate", e.target.value)} required={Boolean(form.piNumber) || requirePi} /></label>
    </> : null}
    {!requirePi ? <>
    <label><span className={labelClass}>Expected Shipment</span><input className={inputClass} type="date" value={form.expectedShipmentDate} onChange={(e) => change("expectedShipmentDate", e.target.value)} /></label>
    <label className="sm:col-span-2"><span className={labelClass}>Notes</span><textarea className={inputClass + " h-24 py-2"} maxLength={3000} value={form.notes} onChange={(e) => change("notes", e.target.value)} /></label>
    </> : null}
    <div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy}>Save Commercial Data</Button></div>
  </form>;
}

export function ImportLogisticsSummary({ record, stage, canSeeCost }: { record: ImportCase; stage: number; canSeeCost: boolean }) {
  return <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">{stage === 2 ? <>
    <KeyValue label="Payment mode" value={record.paymentMode} accent />
    <KeyValue label={record.paymentMode === "LC" ? "LC number" : "TT reference"} value={record.paymentMode === "LC" ? record.lcNumber : record.ttReference} />
    <KeyValue label="Bank" value={record.bank} />
    {canSeeCost ? <KeyValue label={`Amount (${record.currency})`} value={record.paymentMode === "LC" ? record.lcAmount : record.ttAmount} /> : null}
    {canSeeCost && record.paymentMode === "LC" ? <><KeyValue label={`Bank amount (${record.currency})`} value={record.lcBankAmount ?? "Not recorded"} /><KeyValue label={`Other amount (${record.currency})`} value={record.lcOtherAmount ?? "Not recorded"} /></> : null}
    <KeyValue label="Payment date" value={record.paymentMode === "LC" ? record.lcOpenDate : record.ttDate} />
    {record.paymentMode === "LC" ? <KeyValue label="LC expiry" value={record.lcExpiryDate} /> : null}
    {canSeeCost ? <KeyValue label="Rate snapshot" value={`1 ${record.currency} = BDT ${record.exchangeRate} | ${record.rateDate || "Date pending"}`} /> : null}
  </> : stage === 3 ? <>
    <KeyValue label="Production status" value={record.productionStatus || "Not yet recorded"} /><KeyValue label="Follow-up note" value={record.productionFollowUpNote} /><KeyValue label="Target shipment" value={record.expectedShipmentDate} />
  </> : <>
    <KeyValue label="Commercial invoice" value={[record.commercialInvoiceNumber, record.commercialInvoiceDate].filter(Boolean).join(" | ")} /><KeyValue label="Bill of lading" value={record.blNumber} /><KeyValue label="Container" value={[record.containerNumber, record.containerType].filter(Boolean).join(" | ")} /><KeyValue label="Vessel / Carrier" value={record.vesselName} /><KeyValue label="ETD" value={record.etd} /><KeyValue label="ETA" value={record.eta} />
  </>}</dl>;
}

export function ShipmentEditor({ record, stage = 2, busy, error, onSubmit }: { record: ImportCase; stage?: number; busy: boolean; error?: unknown; onSubmit: (payload: Partial<ImportCase>) => void }) {
  const actor = useAuthStore((s) => s.session?.user);
  const canEditCost = hasCapability(actor, "edit_sensitive_cost");
  const [form, setForm] = useState({ paymentMode: record.paymentMode, lcNumber: record.lcNumber ?? "", lcAmount: record.lcAmount ?? "", lcBankAmount: record.lcBankAmount ?? "", lcOtherAmount: record.lcOtherAmount ?? "", lcOpenDate: record.lcOpenDate ?? "", lcExpiryDate: record.lcExpiryDate ?? "", ttReference: record.ttReference ?? "", ttAmount: record.ttAmount ?? "", ttDate: record.ttDate ?? "", bank: record.bank ?? "", currency: record.currency, exchangeRate: record.exchangeRate, rateDate: record.rateDate, rateSource: record.rateSource, commercialInvoiceNumber: record.commercialInvoiceNumber ?? "", commercialInvoiceDate: record.commercialInvoiceDate ?? "", productionStatus: record.productionStatus ?? "", productionFollowUpNote: record.productionFollowUpNote ?? "", blNumber: record.blNumber ?? "", containerNumber: record.containerNumber ?? "", containerType: record.containerType ?? "", vesselName: record.vesselName ?? "", etd: record.etd ?? "", eta: record.eta ?? "" });
  const [localError, setLocalError] = useState("");
  const hasSplitInput = form.lcBankAmount !== "" || form.lcOtherAmount !== "";
  const splitRequired = hasSplitInput || record.lcBankAmount !== undefined || record.lcOtherAmount !== undefined;
  let lcTotal = record.lcAmount ?? "Not recorded";
  if (hasSplitInput) { try { lcTotal = sumLcAmounts(form.lcBankAmount, form.lcOtherAmount); } catch { lcTotal = "Check the entered amounts"; } }
  const change = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const issue = (key: string) => error instanceof ApiRequestError ? error.issues.find((v) => v.field === key)?.message : undefined;
  const field = (key: keyof typeof form, label: string, type = "text", required = false) => type === "number" && !canEditCost ? null : <label key={key}><span className={labelClass}>{label}</span><input name={key} className={inputClass} type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? key === "exchangeRate" ? "0.000001" : "0.01" : undefined} maxLength={200} required={required} value={form[key]} aria-invalid={Boolean(issue(key))} onChange={(e) => change(key, e.target.value)} />{issue(key) ? <small className="mt-1 block text-red-700">{issue(key)}</small> : null}</label>;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (stage === 2 && form.paymentMode === "LC" && form.lcExpiryDate && form.lcOpenDate && form.lcExpiryDate < form.lcOpenDate) return setLocalError("LC expiry date must not be before the LC open date.");
    if (stage === 4 && form.eta && form.etd && form.eta < form.etd) return setLocalError("ETA must not be before ETD.");
    setLocalError("");
    const fields: (keyof typeof form)[] = stage === 3 ? ["productionStatus", "productionFollowUpNote"] : stage === 4 ? ["commercialInvoiceNumber", "commercialInvoiceDate", "blNumber", "containerNumber", "containerType", "vesselName", "etd", "eta"] : ["paymentMode", "lcNumber", "lcAmount", "lcBankAmount", "lcOtherAmount", "lcOpenDate", "lcExpiryDate", "ttReference", "ttAmount", "ttDate", "bank", "currency", "exchangeRate", "rateDate", "rateSource"];
    const payload = paymentPayload(Object.fromEntries(fields.map((key) => [key, form[key]])));
    if (stage === 2 && form.paymentMode === "LC" && hasSplitInput) delete payload.lcAmount;
    onSubmit(payload);
  };
  return <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={submit}>
    {error ? <div className="sm:col-span-2 lg:col-span-3"><ErrorBlock error={error} title="Import details could not be saved" /></div> : null}
    {localError ? <p role="alert" className="text-sm text-red-700 sm:col-span-2 lg:col-span-3">{localError}</p> : null}
    {stage === 2 ? <>
      <label><span className={labelClass}>Payment mode</span><select name="paymentMode" aria-label="Payment mode" required className={inputClass} value={form.paymentMode} onChange={(e) => change("paymentMode", e.target.value)}><option value="Pending">Pending decision</option><option value="LC">LC</option><option value="TT">TT</option></select></label>
      {form.paymentMode === "LC" ? <>{field("lcNumber", "LC number", "text", true)}{field("lcBankAmount", `Bank amount (${form.currency})`, "number", splitRequired)}{field("lcOtherAmount", `Other amount (${form.currency})`, "number", splitRequired)}{canEditCost ? <div className="rounded-md border border-cyan-200 bg-cyan-50 p-3 sm:col-span-2 lg:col-span-3"><span className="text-xs text-cyan-900">LC total ({form.currency})</span><output aria-label="LC total" className="mt-1 block text-lg font-bold text-cyan-950">{lcTotal}</output>{!hasSplitInput && record.lcAmount !== undefined && record.lcBankAmount === undefined && record.lcOtherAmount === undefined ? <p className="mt-1 text-xs text-slate-600">Recorded total. Bank / other breakdown has not been entered.</p> : null}</div> : null}{field("lcOpenDate", "LC open date", "date")}{field("lcExpiryDate", "LC expiry date", "date")}</> : form.paymentMode === "TT" ? <>{field("ttReference", "TT / Shipment reference", "text", true)}{field("ttAmount", `TT amount (${form.currency})`, "number")}{field("ttDate", "TT date", "date")}</> : null}
      {field("bank", "Bank")}
      <label><span className={labelClass}>Currency</span><OptionSelect kind="currency" label="Currency" options={currencies} required value={form.currency} onChange={(currency) => setForm((current) => ({ ...current, currency, exchangeRate: currency === "BDT" ? "1" : currency === current.currency ? current.exchangeRate : "" }))} /></label>
      {field("exchangeRate", "BDT per currency unit", "number", true)}{field("rateDate", "Rate date", "date")}{field("rateSource", "Rate source")}
    </> : stage === 3 ? <>{field("productionStatus", "Production status")}{field("productionFollowUpNote", "Production follow-up note")}</> : <>
      {field("commercialInvoiceNumber", "Commercial invoice number")}{field("commercialInvoiceDate", "Commercial invoice date", "date")}{field("blNumber", "Bill of lading")}{field("containerNumber", "Container number")}
      <label><span className={labelClass}>Container type</span><OptionSelect kind="container-type" label="Container type" value={form.containerType} options={["20 FT", "40 FT", "40 HQ", "LCL", "Air Freight"]} onChange={(v) => change("containerType", v)} /></label>
      {field("vesselName", "Vessel / Carrier")}{field("etd", "ETD", "date")}{field("eta", "ETA", "date")}
    </>}
    <div className="flex justify-end sm:col-span-2 lg:col-span-3"><Button type="submit" variant="primary" disabled={busy} icon={<Save className="h-4 w-4" />}>Save Changes</Button></div>
  </form>;
}

export function ItemEditor({ record, products, item, busy, error, onSubmit }: { record: ImportCase; products: Product[]; item?: ImportItem; busy: boolean; error?: unknown; onSubmit: (payload: Omit<ImportItem, "id">) => void }) {
  const [form, setForm] = useState({ productId: item?.productId ?? "", quantity: item?.quantity ?? "", currency: item?.currency ?? record.currency, fobUnitForeign: item?.fobUnitForeign ?? "0", exchangeRate: item?.exchangeRate ?? record.exchangeRate, cartonCount: item?.cartonCount ?? "0", cbmPerCarton: item?.cbmPerCarton ?? "0", cbmMode: item?.cbmMode ?? "CALCULATED" as "CALCULATED" | "MANUAL", totalCbm: item?.totalCbm ?? "0" });
  const [added, setAdded] = useState<Product>(); const product = added?.id === form.productId ? added : products.find((entry) => entry.id === form.productId);
  const change = (key: keyof typeof form, value: string) => setForm((v) => ({ ...v, [key]: value }));
  const [invalid, setInvalid] = useState("");
  const cbm = form.cbmMode === "MANUAL" ? new Decimal(decimalPreview(form.totalCbm)) : new Decimal(decimalPreview(form.cartonCount, 4)).mul(decimalPreview(form.cbmPerCarton));
  const fob = new Decimal(decimalPreview(form.quantity, 4)).mul(decimalPreview(form.fobUnitForeign, 6)).mul(form.currency === "BDT" ? 1 : decimalPreview(form.exchangeRate, 6));
  return <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => {
    e.preventDefault();
    const values: [string, string, number][] = [["Quantity", form.quantity, 4], ["FOB / unit", form.fobUnitForeign || "0", 6], ["Exchange rate", form.currency === "BDT" ? "1" : form.exchangeRate || "0", 6], ...(form.cbmMode === "MANUAL" ? [["Total CBM", form.totalCbm || "0", 8] as [string, string, number]] : [["Cartons", form.cartonCount || "0", 4], ["CBM / carton", form.cbmPerCarton || "0", 8]] as [string, string, number][])];
    const bad = values.find(([, value, scale]) => !isDecimalInput(value, scale));
    if (bad) return setInvalid(`${bad[0]}: enter a supported decimal without scientific notation.`);
    if (!product) return setInvalid("Select a product variant.");
    setInvalid(""); onSubmit({ ...form, fobUnitForeign: form.fobUnitForeign || "0", cartonCount: form.cartonCount || "0", cbmPerCarton: form.cbmPerCarton || "0", productCode: product.code, productName: product.name, unit: product.unit, exchangeRate: form.currency === "BDT" ? "1" : form.exchangeRate || "0", totalCbm: cbm.toFixed(8), fobTotalBdt: "0", hsCode: product.hsCode });
  }}>
    {invalid ? <p role="alert" className="text-sm text-red-700 sm:col-span-2 lg:col-span-3">{invalid}</p> : null}
    {error ? <div className="sm:col-span-2 lg:col-span-3"><ErrorBlock error={error} title="Product line could not be saved" /></div> : null}
    <label className="sm:col-span-2"><span className={labelClass}>Product variant</span><MasterSelect kind="products" label="Product variant" value={form.productId} required onChange={(id, row) => { change("productId", id); if (row && "code" in row) setAdded(row); }} /></label>
    <div className="flex items-center gap-3"><ProductThumb src={product?.imageUrl} name={product?.name ?? "Product"} size="lg" /><small>{product?.unit}</small></div>
    {([['quantity', 'Quantity', '0.0001'], ['fobUnitForeign', `FOB / Unit (${form.currency})`, '0.000001'], ['exchangeRate', 'BDT per currency unit', '0.000001']] as const).map(([key, label, step]) => <label key={key}><span className={labelClass}>{label}</span><input name={key} className={inputClass} type="number" min={key === "quantity" ? "0.0001" : "0"} step={step} required value={key === "exchangeRate" && form.currency === "BDT" ? "1" : form[key]} disabled={key === "exchangeRate" && form.currency === "BDT"} onChange={(e) => change(key, e.target.value)} /></label>)}
    <label><span className={labelClass}>FOB currency</span><OptionSelect kind="currency" label="FOB currency" options={currencies} required value={form.currency} onChange={(currency) => setForm((current) => ({ ...current, currency, exchangeRate: currency === "BDT" ? "1" : currency === current.currency ? current.exchangeRate : "" }))} /></label>
    <label><span className={labelClass}>CBM source</span><select className={inputClass} value={form.cbmMode} onChange={(e) => change("cbmMode", e.target.value)}><option value="CALCULATED">Cartons x CBM / carton</option><option value="MANUAL">Manual total from PI</option></select></label>
    {(form.cbmMode === "MANUAL" ? [["totalCbm", "Total CBM"]] : [["cartonCount", "Cartons"], ["cbmPerCarton", "CBM / Carton"]]).map(([key, label]) => <label key={key}><span className={labelClass}>{label}</span><input name={key} className={inputClass} type="number" min="0" step={key === "cartonCount" ? "0.0001" : "0.00000001"} value={form[key as keyof typeof form]} onChange={(e) => change(key as keyof typeof form, e.target.value)} /></label>)}
    <p className="rounded-md border border-cyan-200 bg-cyan-50 p-3 text-sm sm:col-span-2 lg:col-span-3">FOB: BDT {fob.toFixed(2)} | Total volume: {cbm.toFixed(8)} CBM</p>
    <div className="flex justify-end sm:col-span-2 lg:col-span-3"><Button type="submit" variant="primary" disabled={busy} icon={<Save className="h-4 w-4" />}>Save Product Line</Button></div>
  </form>;
}
