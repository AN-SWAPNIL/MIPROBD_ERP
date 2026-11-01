import { useMutation, useQuery } from "@tanstack/react-query";
import { Calculator, Plus, Save, Trash2, TrendingDown, TrendingUp, Truck } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import Button from "../../components/ui/Button";
import { businessDate } from "../../lib/date";
import type {
  CashBankAccount,
  Collection,
  Customer,
  Delivery,
  Product,
  ProfitPreview,
  Quotation,
  SalesLine,
  SalesInvoice,
  SalesOrder,
  StockBatch
} from "../erp.types";
import { inputClass, labelClass, textareaClass } from "../components";
import { inventoryService, salesService } from "../services";
import { formatMoney as formatCurrency, formatQuantity as formatNumber } from "../../utils/precise";
import { Decimal } from "decimal.js";
import { foundationMode } from "../../lib/runtime";
import PersistentDeliveryLine from "./PersistentDeliveryLine";
import SalesRecordSelect from "./SalesRecordSelect";
import { getSalesPage } from "./pages";

const Amount = Decimal.clone({ precision: 48, rounding: Decimal.ROUND_HALF_UP });

export function CustomerForm({ customer, busy, onSubmit }: { customer?: Customer; busy: boolean; onSubmit: (payload: Partial<Customer>) => void }) {
  const [form, setForm] = useState({
    name: customer?.name ?? "",
    type: customer?.type ?? "Hospital",
    contactPerson: customer?.contactPerson ?? "",
    phone: customer?.phone ?? "",
    address: customer?.address ?? "",
    territory: customer?.territory ?? "Dhaka North",
    paymentTerms: customer?.paymentTerms ?? "30 days",
    creditLimit: customer?.creditLimit ?? "0.00",
    active: customer?.active ?? true
  });
  const change = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit({ ...form, version: customer?.version } as Partial<Customer>); }}>
      <label className="sm:col-span-2"><span className={labelClass}>Customer / Organization</span><input className={inputClass} required value={form.name} onChange={(event) => change("name", event.target.value)} /></label>
      <label><span className={labelClass}>Customer Type</span><select className={inputClass} value={form.type} onChange={(event) => change("type", event.target.value)}>{["Hospital", "Clinic", "Dealer", "Pharmacy", "Other"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span className={labelClass}>Contact Person</span><input className={inputClass} required value={form.contactPerson} onChange={(event) => change("contactPerson", event.target.value)} /></label>
      <label><span className={labelClass}>Phone</span><input className={inputClass} required value={form.phone} onChange={(event) => change("phone", event.target.value)} /></label>
      <label><span className={labelClass}>Territory</span><input className={inputClass} required value={form.territory} onChange={(event) => change("territory", event.target.value)} /></label>
      <label><span className={labelClass}>Payment Terms</span><input className={inputClass} required value={form.paymentTerms} onChange={(event) => change("paymentTerms", event.target.value)} /></label>
      <label><span className={labelClass}>Credit Limit</span><input className={inputClass} type="number" min="0" step="0.01" required value={form.creditLimit} onChange={(event) => change("creditLimit", event.target.value)} /></label>
      <label className="sm:col-span-2"><span className={labelClass}>Address</span><textarea className={textareaClass} required value={form.address} onChange={(event) => change("address", event.target.value)} /></label>
      {customer ? <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(event) => change("active", event.target.checked)} /> Active customer</label> : null}
      <div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy}>Save Customer</Button></div>
    </form>
  );
}

type EditableLine = Pick<SalesLine, "id" | "productId" | "quantity" | "unitPrice" | "discount">;

export function QuotationForm({
  quotation,
  initialCustomerId,
  leadId,
  customers: initialCustomers,
  products: initialProducts,
  canViewProfit,
  busy,
  onSubmit
}: {
  quotation?: Quotation;
  initialCustomerId?: string;
  leadId?: string;
  customers: Customer[];
  products: Product[];
  canViewProfit: boolean;
  busy: boolean;
  onSubmit: (payload: Partial<Quotation>) => void;
}) {
  const [customerId, setCustomerId] = useState(quotation?.customerId ?? initialCustomerId ?? "");
  const [pickedCustomers, setPickedCustomers] = useState<Customer[]>([]);
  const [pickedProducts, setPickedProducts] = useState<Product[]>([]);
  const hydration = useQuery({ queryKey: ["sales", "quote-customer", customerId], enabled: foundationMode && Boolean(customerId), queryFn: ({ signal }) => getSalesPage("customers", { selectedId: customerId, pageSize: "1" }, signal) });
  const customers = [...pickedCustomers, ...(hydration.data?.selected ? [hydration.data.selected] : []), ...initialCustomers];
  const products = [...pickedProducts, ...initialProducts];
  const [date, setDate] = useState(quotation?.date ?? businessDate());
  const [validityDays, setValidityDays] = useState(String(quotation?.validityDays ?? 15));
  const [paymentTerms, setPaymentTerms] = useState(quotation?.paymentTerms ?? customers.find((entry) => entry.id === initialCustomerId)?.paymentTerms ?? "30 days");
  const [remarks, setRemarks] = useState(quotation?.remarks ?? "");
  const [status, setStatus] = useState(quotation?.status ?? "Draft");
  const [lines, setLines] = useState<EditableLine[]>(quotation?.lines.map((line) => ({ id: line.id, productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice, discount: line.discount })) ?? [{ id: "line-" + Date.now(), productId: "", quantity: "1", unitPrice: "", discount: "0" }]);
  const [profitPreview, setProfitPreview] = useState<ProfitPreview | null>(null);
  const [profitError, setProfitError] = useState("");
  const customer = customers.find((entry) => entry.id === customerId);
  const updateLine = (id: string, key: keyof EditableLine, value: string) => setLines((current) => current.map((line) => line.id === id ? { ...line, [key]: value } : line));
  const totals = useMemo(() => lines.reduce((summary, line) => {
    const gross = new Amount(line.quantity || 0).mul(line.unitPrice || 0).toDecimalPlaces(2);
    return { subtotal: summary.subtotal.plus(gross), discount: summary.discount.plus(line.discount || 0), total: summary.total.plus(gross).minus(line.discount || 0) };
  }, { subtotal: new Amount(0), discount: new Amount(0), total: new Amount(0) }), [lines]);
  const normalizedLines = () => lines.map((line) => {
    const product = products.find((entry) => entry.id === line.productId);
    const original = quotation?.lines.find((entry) => entry.productId === line.productId);
    const total = new Amount(line.quantity).mul(line.unitPrice).toDecimalPlaces(2).minus(line.discount || 0);
    return { id: line.id, productId: line.productId, productCode: product?.code ?? original?.productCode ?? "", productName: product?.name ?? original?.productName ?? "", quantity: line.quantity, unitPrice: line.unitPrice, discount: new Amount(line.discount || 0).toFixed(2), lineTotal: total.toFixed(2) };
  });
  const profitMutation = useMutation({
    mutationFn: () => salesService.profitPreview(normalizedLines()),
    onSuccess: (data) => { setProfitPreview(data); setProfitError(""); },
    onError: (error) => { setProfitPreview(null); setProfitError(error instanceof Error ? error.message : "Profit preview failed."); }
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!customer || lines.some((line) => !line.productId || Number(line.quantity) <= 0 || Number(line.unitPrice) <= 0)) return;
    const normalized: SalesLine[] = normalizedLines();
    onSubmit({ version: quotation?.version, customerId: customer.id, customerName: customer.name, leadId: quotation?.leadId ?? leadId, date, validityDays: Number(validityDays), paymentTerms, remarks, status, lines: normalized, subtotal: totals.subtotal.toFixed(2), discountTotal: totals.discount.toFixed(2), total: totals.total.toFixed(2) });
  };
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2"><span className={labelClass}>Customer</span>{foundationMode ? <SalesRecordSelect kind="customers" label="Customer" required value={customerId} filters={{ activeOnly: "true" }} display={(row) => row.name} onChange={(row) => { setCustomerId(row?.id ?? ""); if (row) { setPickedCustomers((current) => [row, ...current.filter((entry) => entry.id !== row.id)]); setPaymentTerms(row.paymentTerms); } }} /> : <select aria-label="Customer" className={inputClass} required value={customerId} onChange={(event) => { const next = customers.find((entry) => entry.id === event.target.value); setCustomerId(event.target.value); if (next) setPaymentTerms(next.paymentTerms); }}><option value="">Select customer</option>{customers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>}</div>
        <label><span className={labelClass}>Quotation Date</span><input className={inputClass} type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label><span className={labelClass}>Validity (days)</span><input className={inputClass} type="number" min="1" step="1" required value={validityDays} onChange={(event) => setValidityDays(event.target.value)} /></label>
        <label className="sm:col-span-2"><span className={labelClass}>Payment Terms</span><input className={inputClass} required value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} /></label>
        {quotation ? <label><span className={labelClass}>Status</span><select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as Quotation["status"])}>{["Draft", "Sent", "Accepted", "Rejected"].map((value) => <option key={value}>{value}</option>)}</select></label> : null}
      </div>
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-[900px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Quantity</th><th className="px-3 py-2">Unit Price</th><th className="px-3 py-2">Discount</th><th className="px-3 py-2 text-right">Line Total</th><th className="w-12 px-3 py-2" /></tr></thead>
          <tbody className="divide-y divide-slate-100">{lines.map((line) => {
            const product = products.find((entry) => entry.id === line.productId);
            const total = new Amount(line.quantity || 0).mul(line.unitPrice || 0).toDecimalPlaces(2).minus(line.discount || 0).toFixed(2);
            return <tr key={line.id}>
              <td className="min-w-72 px-3 py-2">{foundationMode ? <SalesRecordSelect kind="products" label="Product variant" value={line.productId} required filters={{ activeOnly: "true" }} display={(row) => `${row.code} | ${row.name}`} onChange={(row) => {
                updateLine(line.id, "productId", row?.id ?? "");
                if (row) { setPickedProducts((current) => [row, ...current.filter((entry) => entry.id !== row.id)]); if (!line.unitPrice) updateLine(line.id, "unitPrice", row.standardSalePrice); }
              }} /> : <select aria-label="Product variant" className={inputClass} required value={line.productId} onChange={(event) => { const next = products.find((entry) => entry.id === event.target.value); updateLine(line.id, "productId", event.target.value); if (next && !line.unitPrice) updateLine(line.id, "unitPrice", next.standardSalePrice); }}><option value="">Select product</option>{products.map((entry) => <option key={entry.id} value={entry.id}>{entry.code} | {entry.name}</option>)}</select>}{product ? <small className="mt-1 block text-slate-400">Standard {formatCurrency(product.standardSalePrice)}</small> : null}</td>
              <td className="px-3 py-2"><input aria-label="Quantity" className={inputClass} type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={(event) => updateLine(line.id, "quantity", event.target.value)} required /></td>
              <td className="px-3 py-2"><input aria-label="Unit price" className={inputClass} type="number" min="0.01" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(line.id, "unitPrice", event.target.value)} required /></td>
              <td className="px-3 py-2"><input aria-label="Discount" className={inputClass} type="number" min="0" max={Number(line.quantity || 0) * Number(line.unitPrice || 0)} step="0.01" value={line.discount} onChange={(event) => updateLine(line.id, "discount", event.target.value)} /></td>
              <td className="px-3 py-2 text-right font-bold">{formatCurrency(total)}</td>
              <td className="px-3 py-2"><Button type="button" variant="ghost" icon={<Trash2 className="h-4 w-4 text-red-600" />} onClick={() => setLines((current) => current.filter((entry) => entry.id !== line.id))} disabled={lines.length === 1} aria-label="Remove line" title="Remove line" /></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <Button type="button" icon={<Plus className="h-4 w-4" />} onClick={() => setLines((current) => [...current, { id: "line-" + Date.now(), productId: "", quantity: "1", unitPrice: "", discount: "0" }])}>Add Line</Button>
        <dl className="grid min-w-64 gap-1 text-sm"><div className="flex justify-between gap-6"><dt className="text-slate-500">Subtotal</dt><dd className="font-semibold">{formatCurrency(totals.subtotal.toString())}</dd></div><div className="flex justify-between gap-6"><dt className="text-slate-500">Discount</dt><dd className="font-semibold">{formatCurrency(totals.discount.toString())}</dd></div><div className="flex justify-between gap-6 border-t border-slate-200 pt-2 text-base"><dt className="font-bold">Quotation Total</dt><dd className="font-bold text-red-700">{formatCurrency(totals.total.toString())}</dd></div></dl>
      </div>
      {canViewProfit ? <section className="rounded-md border border-blue-200 bg-blue-50 p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong className="flex items-center gap-2 text-sm text-blue-950"><Calculator className="h-4 w-4" /> Owner Cost & Profit Check</strong><p className="mt-1 text-xs text-blue-800">Uses the batches expected under FIFO. These confidential values never appear for sales executives.</p></div><Button type="button" icon={<Calculator className="h-4 w-4" />} disabled={profitMutation.isPending || lines.some((line) => !line.productId || Number(line.quantity) <= 0 || Number(line.unitPrice) <= 0)} onClick={() => profitMutation.mutate()}>{profitMutation.isPending ? "Calculating..." : "Check Profit / Loss"}</Button></div>{profitError ? <p className="mt-3 rounded bg-white p-2 text-xs font-semibold text-rose-700">{profitError}</p> : null}{profitPreview ? <><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{profitPreview.lines.map((line) => <div className={`rounded border bg-white p-3 ${line.isLoss ? "border-rose-300" : "border-emerald-200"}`} key={line.productId}><div className="flex items-start justify-between gap-2"><strong className="text-xs text-slate-900">{line.productName}</strong>{line.isLoss ? <TrendingDown className="h-4 w-4 text-rose-600" /> : <TrendingUp className="h-4 w-4 text-emerald-600" />}</div><dl className="mt-2 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-slate-500">Effective price</dt><dd className="font-bold">{formatCurrency(line.effectiveUnitPrice)}</dd></div><div><dt className="text-slate-500">FIFO cost</dt><dd className="font-bold">{formatCurrency(line.expectedCostPerUnit)}</dd></div><div><dt className="text-slate-500">Profit / unit</dt><dd className={`font-bold ${line.isLoss ? "text-rose-700" : "text-emerald-700"}`}>{formatCurrency(line.grossProfitPerUnit)}</dd></div><div><dt className="text-slate-500">Margin</dt><dd className={`font-bold ${line.isLoss ? "text-rose-700" : "text-emerald-700"}`}>{line.marginPercent}%</dd></div></dl></div>)}</div><div className={`mt-3 flex flex-wrap items-center justify-between gap-3 rounded p-3 text-sm ${Number(profitPreview.grossProfit) < 0 ? "bg-rose-100 text-rose-900" : "bg-emerald-100 text-emerald-900"}`}><span>Expected COGS <strong>{formatCurrency(profitPreview.expectedCogs)}</strong></span><strong>{Number(profitPreview.grossProfit) < 0 ? "LOSS" : "GROSS PROFIT"}: {formatCurrency(profitPreview.grossProfit)} · {profitPreview.marginPercent}%</strong></div></> : null}</section> : null}
      <label><span className={labelClass}>Remarks</span><textarea className={textareaClass} value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label>
      <div className="flex justify-end"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy}>Save Quotation</Button></div>
    </form>
  );
}

export function DeliveryForm({
  orders,
  deliveries,
  batches,
  canOverride,
  busy,
  onSubmit
}: {
  orders: SalesOrder[];
  deliveries: Delivery[];
  batches: StockBatch[];
  canOverride: boolean;
  busy: boolean;
  onSubmit: (payload: Partial<Delivery>) => void;
}) {
  const activeOrders = orders.filter((order) => !["Delivered", "Cancelled"].includes(order.status));
  const [orderId, setOrderId] = useState(activeOrders[0]?.id ?? "");
  const [date, setDate] = useState(businessDate());
  const [remarks, setRemarks] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [rows, setRows] = useState<Record<string, { quantity: string; batchId: string }>>({});
  const [warning, setWarning] = useState("");
  const order = orders.find((entry) => entry.id === orderId);
  const deliveredLines = (productId: string) => deliveries.filter((delivery) => delivery.orderId === orderId && delivery.status !== "Draft").flatMap((delivery) => delivery.lines).filter((line) => line.productId === productId);
  const deliveredFor = (productId: string) => deliveredLines(productId).reduce((sum, line) => sum.plus(line.quantity), new Amount(0));
  const rowFor = (line: SalesLine) => {
    const remaining = Amount.max(0, new Amount(line.quantity).minus(deliveredFor(line.productId))).toFixed(4);
    const existing = rows[line.id];
    const eligible = batches.filter((batch) => batch.productId === line.productId && Number(batch.quantityAvailable) > 0 && batch.expiryDate >= date && batch.receivedDate <= date).sort((a, b) => a.receivedDate.localeCompare(b.receivedDate) || a.id.localeCompare(b.id));
    return { remaining, eligible, quantity: existing?.quantity ?? String(remaining), batchId: existing?.batchId ?? "AUTO" };
  };
  const update = (lineId: string, line: SalesLine, key: "quantity" | "batchId", value: string) => {
    const current = rowFor(line);
    setRows((state) => ({ ...state, [lineId]: { quantity: key === "quantity" ? value : current.quantity, batchId: key === "batchId" ? value : current.batchId } }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!order) return;
    const lines = order.lines.flatMap((line) => {
      const row = rowFor(line);
      if (Number(row.quantity) <= 0) return [];
      const batch = batches.find((entry) => entry.id === row.batchId);
      const prior = deliveredLines(line.productId);
      const cumulative = deliveredFor(line.productId).plus(row.quantity);
      const share = (key: "lineTotal" | "discount") => new Amount(line[key]).mul(cumulative).div(line.quantity).toDecimalPlaces(2).minus(prior.reduce((sum, entry) => sum.plus(entry[key]), new Amount(0))).toFixed(2);
      return [{ ...line, quantity: row.quantity, lineTotal: share("lineTotal"), discount: share("discount"), batchId: foundationMode ? row.batchId : batch?.id ?? "AUTO", batchNumber: batch?.batchNumber ?? "FIFO AUTO" }];
    });
    try {
      const previews = await Promise.all(lines.map((line) => inventoryService.dispatchPreview({ productId: line.productId, batchId: line.batchId, quantity: line.quantity, date })));
      const warnings = previews.map((preview) => preview.warning).filter(Boolean);
      if (warnings.length && (!canOverride || !overrideReason.trim())) {
        setWarning(warnings.join(" "));
        return;
      }
      setWarning(warnings.join(" "));
      onSubmit({ orderId: order.id, customerId: order.customerId, customerName: order.customerName, date, remarks, receiverName, overrideReason: warnings.length ? overrideReason : undefined, lines });
    } catch (error) {
      setWarning(error instanceof Error ? error.message : "Stock validation failed.");
    }
  };
  return (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      {warning ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">{warning}</div> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="sm:col-span-2"><span className={labelClass}>Sales Order</span><select className={inputClass} required value={orderId} onChange={(event) => { setOrderId(event.target.value); setRows({}); setWarning(""); }}><option value="">Select ready order</option>{activeOrders.map((entry) => <option key={entry.id} value={entry.id}>{entry.orderNumber} · {entry.customerName}</option>)}</select></label>
        <label><span className={labelClass}>Dispatch Date</span><input className={inputClass} type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label><span className={labelClass}>Receiver Name</span><input className={inputClass} value={receiverName} onChange={(event) => setReceiverName(event.target.value)} /></label>
      </div>
      {order ? <div className="grid gap-3">{order.lines.map((line) => {
        const row = rowFor(line);
        if (foundationMode) return <PersistentDeliveryLine key={line.id} line={line} date={date} quantity={row.quantity} batchId={row.batchId} remaining={row.remaining} update={(key, value) => update(line.id, line, key, value)} />;
        let remaining = new Amount(row.quantity || 0);
        const automatic = row.eligible.flatMap((batch) => { if (remaining.lte(0)) return []; const quantity = Amount.min(remaining, batch.quantityAvailable); remaining = remaining.minus(quantity); return [{ batch, quantity: quantity.toFixed(4) }]; });
        return <fieldset className="rounded-md border border-slate-200 p-3" key={line.id}><legend className="px-1 text-sm font-bold">{line.productCode} · {line.productName}</legend><div className="grid gap-3 sm:grid-cols-3"><label><span className={labelClass}>Delivery Qty (max {formatNumber(row.remaining)})</span><input className={inputClass} type="number" min="0" max={row.remaining} step="0.0001" value={row.quantity} onChange={(event) => update(line.id, line, "quantity", event.target.value)} /></label><label className="sm:col-span-2"><span className={labelClass}>Batch Allocation</span><select className={inputClass} required value={row.batchId} onChange={(event) => update(line.id, line, "batchId", event.target.value)}><option value="AUTO">Automatic FIFO split · oldest eligible stock first</option>{row.eligible.map((batch, index) => <option key={batch.id} value={batch.id}>{index === 0 ? "Oldest · " : "Override · "}{batch.lotNumber} · received {batch.receivedDate} · expiry {batch.expiryDate} · {formatNumber(batch.quantityAvailable)} available</option>)}</select>{!row.eligible.length ? <small className="mt-1 block font-semibold text-red-600">No non-expired stock is available for this product.</small> : null}</label></div>{row.batchId === "AUTO" && automatic.length ? <div className="mt-3 rounded-md border border-cyan-200 bg-cyan-50 p-3"><span className="text-[10px] font-bold uppercase text-cyan-800">Automatic FIFO plan</span><div className="mt-2 flex flex-wrap gap-2">{automatic.map(({ batch, quantity }) => <span className="rounded bg-white px-2 py-1 text-xs font-semibold text-slate-700" key={batch.id}>{formatNumber(quantity)} · Lot {batch.lotNumber} · exp {batch.expiryDate}</span>)}</div>{remaining.gt(0) ? <small className="mt-2 block font-semibold text-red-700">Short by {formatNumber(remaining.toFixed(4))} units.</small> : null}</div> : null}</fieldset>;
      })}</div> : null}
      <div className="grid gap-4 sm:grid-cols-2"><label><span className={labelClass}>Delivery Remarks</span><textarea className={textareaClass} value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label><label><span className={labelClass}>FIFO Override Reason</span><textarea className={textareaClass} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} disabled={!canOverride} placeholder={canOverride ? "Required only when a newer batch is selected" : "This role cannot override FIFO"} /></label></div>
      <div className="flex justify-end"><Button type="submit" variant="primary" icon={<Truck className="h-4 w-4" />} disabled={busy || !order}>Validate FIFO & Dispatch</Button></div>
    </form>
  );
}

export function CollectionForm({ initialCustomerId, initialOrderId, customers, orders, invoices, collections = [], accounts, busy, onSubmit }: { initialCustomerId?: string; initialOrderId?: string; customers: Customer[]; orders: SalesOrder[]; invoices: SalesInvoice[]; collections?: Collection[]; accounts: CashBankAccount[]; busy: boolean; onSubmit: (payload: Partial<Collection>) => void }) {
  const invoiceDue = (invoice: SalesInvoice) => Amount.max(0, new Amount(invoice.total).minus(collections.filter((entry) => entry.status === "Posted").reduce((total, entry) => total.plus(entry.allocations?.length ? entry.allocations.filter((allocation) => allocation.invoiceId === invoice.id).reduce((sum, allocation) => sum.plus(allocation.amount), new Amount(0)) : entry.invoiceId === invoice.id ? entry.amount : "0"), new Amount(0)))).toFixed(2);
  const initialInvoice = initialOrderId ? invoices.find((invoice) => invoice.orderId === initialOrderId && invoice.status === "Approved" && new Amount(invoiceDue(invoice)).gt(0)) : undefined;
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [invoiceId, setInvoiceId] = useState(initialInvoice?.id ?? "");
  const [orderId, setOrderId] = useState(initialOrderId ?? "");
  const [date, setDate] = useState(businessDate());
  const [amount, setAmount] = useState(() => {
    const orderDue = orders.find((entry) => entry.id === initialOrderId)?.due;
    const customerDue = customers.find((entry) => entry.id === initialCustomerId)?.currentDue;
    return initialInvoice ? Amount.min(invoiceDue(initialInvoice), orderDue ?? Infinity, customerDue ?? Infinity).toFixed(2) : orderDue ?? customerDue ?? "";
  });
  const [paymentMode, setPaymentMode] = useState<Collection["paymentMode"]>("Bank Transfer");
  const [accountId, setAccountId] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [remarks, setRemarks] = useState("");
  const customer = customers.find((entry) => entry.id === customerId);
  const relatedOrders = orders.filter((order) => order.customerId === customerId && Number(order.due) > 0);
  const relatedInvoices = invoices.filter((invoice) => invoice.customerId === customerId && invoice.status === "Approved" && new Amount(invoiceDue(invoice)).gt(0) && (!initialOrderId || invoice.orderId === initialOrderId));
  const maximum = Amount.min(customer?.currentDue ?? 0, orderId ? orders.find((entry) => entry.id === orderId)?.due ?? 0 : Infinity, invoiceId ? invoiceDue(invoices.find((entry) => entry.id === invoiceId)!) : Infinity).toFixed(2);
  const accountType = paymentMode === "Cash" ? "Cash" : paymentMode === "bKash" ? "Mobile Banking" : "Bank";
  const paymentAccounts = accounts.filter((account) => account.active && account.type === accountType);
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!customer || !accountId) return; onSubmit({ customerId, customerName: customer.name, invoiceId: invoiceId || undefined, orderId: orderId || undefined, date, amount, paymentMode, accountId, referenceNumber, remarks }); }}>
      <label className="sm:col-span-2"><span className={labelClass}>Customer</span><select className={inputClass} required disabled={Boolean(initialOrderId)} value={customerId} onChange={(event) => { setCustomerId(event.target.value); setInvoiceId(""); setOrderId(""); const selected = customers.find((entry) => entry.id === event.target.value); setAmount(selected?.currentDue ?? ""); }}><option value="">Select customer</option>{customers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · due {formatCurrency(entry.currentDue)}</option>)}</select></label>
      <label><span className={labelClass}>Approved Invoice (recommended)</span><select aria-label="Approved Invoice" className={inputClass} value={invoiceId} onChange={(event) => { const selected = invoices.find((entry) => entry.id === event.target.value); setInvoiceId(event.target.value); if (!selected) setOrderId(initialOrderId ?? ""); if (selected) { setOrderId(selected.orderId ?? initialOrderId ?? ""); setAmount(Amount.min(invoiceDue(selected), orders.find((entry) => entry.id === selected.orderId)?.due ?? Infinity, customer?.currentDue ?? Infinity).toFixed(2)); } }}><option value="">Customer-level collection</option>{relatedInvoices.map((entry) => <option key={entry.id} value={entry.id}>{entry.invoiceNumber} · {formatCurrency(invoiceDue(entry))}</option>)}</select></label>
      <label><span className={labelClass}>Sales Order (optional)</span><select aria-label="Sales Order" className={inputClass} disabled={Boolean(initialOrderId)} value={orderId} onChange={(event) => { setOrderId(event.target.value); setInvoiceId(""); const selected = orders.find((entry) => entry.id === event.target.value); if (selected) setAmount(selected.due); }}><option value="">Customer ledger</option>{relatedOrders.map((entry) => <option key={entry.id} value={entry.id}>{entry.orderNumber} · {formatCurrency(entry.due)}</option>)}</select></label>
      <label><span className={labelClass}>Date</span><input className={inputClass} type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label><span className={labelClass}>Amount</span><input className={inputClass} type="number" min="0.01" max={maximum} step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label><span className={labelClass}>Payment Mode</span><select aria-label="Payment Mode" className={inputClass} value={paymentMode} onChange={(event) => { setPaymentMode(event.target.value as Collection["paymentMode"]); setAccountId(""); }}><option>Cash</option><option>bKash</option><option>Bank Transfer</option><option>Cheque</option></select><small className="mt-1 block text-slate-500">Outstanding credit is represented by an approved invoice due, not a received collection.</small></label>
      <label><span className={labelClass}>Deposit Account</span><select aria-label="Deposit Account" className={inputClass} required value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Select cash / bank ledger</option>{paymentAccounts.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.type}</option>)}</select></label>
      <label><span className={labelClass}>Cheque / Transfer Ref</span><input className={inputClass} value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} /></label>
      <label className="sm:col-span-2"><span className={labelClass}>Remarks</span><textarea className={textareaClass} value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label>
      <div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy || !customer}>Post Collection</Button></div>
    </form>
  );
}
