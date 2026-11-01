import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Decimal from "decimal.js";
import { Save } from "lucide-react";
import Button from "../../components/ui/Button";
import { businessDate } from "../../lib/date";
import { formatMoney } from "../../utils/precise";
import type { Collection } from "../erp.types";
import { ErrorBlock, inputClass, labelClass, textareaClass } from "../components";
import SalesRecordSelect from "./SalesRecordSelect";
import { getSalesPage } from "./pages";

const Amount = Decimal.clone({ precision: 48, rounding: Decimal.ROUND_HALF_UP });
export default function PersistentCollectionForm({ initialCustomerId = "", initialOrderId = "", busy, onSubmit }: {
  initialCustomerId?: string; initialOrderId?: string; busy: boolean; onSubmit: (payload: Partial<Collection>) => void;
}) {
  const [customerId, setCustomerId] = useState(initialCustomerId); const [orderId, setOrderId] = useState(initialOrderId);
  const [invoiceId, setInvoiceId] = useState(""); const [date, setDate] = useState(businessDate()); const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<Collection["paymentMode"]>("Bank Transfer"); const [accountId, setAccountId] = useState("");
  const [reference, setReference] = useState(""); const [remarks, setRemarks] = useState("");
  const customer = useQuery({ queryKey: ["sales", "collection-customer", customerId], enabled: Boolean(customerId), queryFn: ({ signal }) => getSalesPage("customers", { selectedId: customerId, pageSize: "1" }, signal) });
  const order = useQuery({ queryKey: ["sales", "collection-order", orderId], enabled: Boolean(orderId), queryFn: ({ signal }) => getSalesPage("orders", { selectedId: orderId, pageSize: "1" }, signal) });
  const invoice = useQuery({ queryKey: ["sales", "collection-invoice", invoiceId, date, customerId], enabled: Boolean(invoiceId), queryFn: ({ signal }) => getSalesPage("invoices", { selectedId: invoiceId, customerId, asOf: date, pageSize: "1" }, signal) });
  const maximum = Amount.max(0, Amount.min(customer.data?.selected?.currentDue ?? "0", orderId ? order.data?.selected?.due ?? "0" : Infinity, invoiceId ? invoice.data?.selected?.availableDue ?? "0" : Infinity)).toFixed(2);
  const pending = busy || customer.isFetching || Boolean(orderId && order.isFetching) || Boolean(invoiceId && invoice.isFetching);
  const error = customer.error ?? order.error ?? invoice.error;
  const accountType = mode === "Cash" ? "Cash" : mode === "bKash" ? "Mobile Banking" : "Bank";
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => {
    event.preventDefault();
    if (pending || error || !customer.data?.selected || !accountId || !amount || new Amount(amount).lte(0) || new Amount(amount).gt(maximum)) return;
    onSubmit({ customerId, customerName: customer.data.selected.name, orderId: orderId || undefined, invoiceId: invoiceId || undefined, date, amount, paymentMode: mode, accountId, referenceNumber: reference, remarks });
  }}>
    <div className="sm:col-span-2"><span className={labelClass}>Customer</span><SalesRecordSelect kind="customers" label="Customer" value={customerId} required disabled={Boolean(initialOrderId)} display={(row) => `${row.name} | Due ${formatMoney(row.currentDue)}`} onChange={(row) => { setCustomerId(row?.id ?? ""); setOrderId(""); setInvoiceId(""); setAmount(""); }} /></div>
    {customerId ? <>
      <div><span className={labelClass}>Sales Order (optional)</span><SalesRecordSelect kind="orders" label="Sales Order" value={orderId} disabled={Boolean(initialOrderId)} filters={{ customerId }} display={(row) => `${row.orderNumber} | Due ${formatMoney(row.due)}`} onChange={(row) => { setOrderId(row?.id ?? ""); setInvoiceId(""); setAmount(""); }} /></div>
      <div><span className={labelClass}>Approved Invoice (optional)</span><SalesRecordSelect kind="invoices" label="Approved Invoice" value={invoiceId} filters={{ customerId, ...(orderId ? { orderId } : {}), activeOnly: "true", asOf: date }} display={(row) => `${row.invoiceNumber} | Due ${formatMoney(row.availableDue)}`} onChange={(row) => { setInvoiceId(row?.id ?? ""); if (row?.orderId) setOrderId(row.orderId); setAmount(""); }} /></div>
    </> : null}
    <label><span className={labelClass}>Date</span><input type="date" className={inputClass} required value={date} onChange={(e) => setDate(e.target.value)} /></label>
    <label><span className={labelClass}>Amount</span><input aria-label="Amount" type="number" className={inputClass} min="0.01" step="0.01" max={maximum} value={amount} required onChange={(e) => setAmount(e.target.value)} /><span className="mt-1 block text-xs text-slate-500">Available due: {formatMoney(maximum)}</span></label>
    <label><span className={labelClass}>Payment Mode</span><select aria-label="Payment Mode" className={inputClass} value={mode} onChange={(e) => { setMode(e.target.value as Collection["paymentMode"]); setAccountId(""); }}><option>Cash</option><option>bKash</option><option>Bank Transfer</option><option>Cheque</option></select></label>
    <div><span className={labelClass}>Deposit Account</span><SalesRecordSelect kind="accounts" label="Deposit Account" value={accountId} required filters={{ activeOnly: "true", accountType }} display={(row) => `${row.name} | ${row.type}`} onChange={(row) => setAccountId(row?.id ?? "")} /></div>
    <label><span className={labelClass}>Payment Reference</span><input className={inputClass} value={reference} maxLength={160} onChange={(e) => setReference(e.target.value)} /></label>
    <label className="sm:col-span-2"><span className={labelClass}>Remarks</span><textarea className={textareaClass} value={remarks} maxLength={2000} onChange={(e) => setRemarks(e.target.value)} /></label>
    {error ? <div className="sm:col-span-2"><ErrorBlock error={error} /></div> : null}
    <div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={pending || Boolean(error) || !customer.data?.selected || !accountId || !new Amount(maximum).gt(0)}>Post Collection</Button></div>
  </form>;
}
