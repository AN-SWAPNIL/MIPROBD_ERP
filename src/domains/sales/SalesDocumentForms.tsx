import { ReceiptText } from "lucide-react";
import { useState } from "react";
import Button from "../../components/ui/Button";
import { businessDate } from "../../lib/date";
import { formatNumber } from "../../utils/format";
import { inputClass, labelClass, textareaClass } from "../components";
import type { Delivery, SalesInvoice, SalesOrder } from "../erp.types";

export function InvoiceForm({ deliveries, invoices, orders, initialDeliveryIds = [], busy, onSubmit }: {
  deliveries: Delivery[]; invoices: SalesInvoice[]; orders: SalesOrder[]; initialDeliveryIds?: string[]; busy: boolean;
  onSubmit: (payload: { deliveryIds: string[]; date: string; remarks?: string }) => void;
}) {
  const available = deliveries.filter((delivery) => delivery.status !== "Draft" && !invoices.some((invoice) => invoice.status !== "Cancelled" && invoice.deliveryIds.includes(delivery.id)));
  const initialOrderId = deliveries.find((delivery) => delivery.id === initialDeliveryIds[0])?.orderId ?? available[0]?.orderId ?? "";
  const [orderId, setOrderId] = useState(initialOrderId);
  const [ids, setIds] = useState(initialDeliveryIds.length ? initialDeliveryIds : available.filter((delivery) => delivery.orderId === initialOrderId).map((delivery) => delivery.id));
  const [date, setDate] = useState(businessDate());
  const [remarks, setRemarks] = useState("");
  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onSubmit({ deliveryIds: ids, date, remarks }); }}>
    <label><span className={labelClass}>Sales Order</span><select className={inputClass} required value={orderId} onChange={(event) => { setOrderId(event.target.value); setIds([]); }}>{orders.filter((order) => available.some((delivery) => delivery.orderId === order.id)).map((order) => <option value={order.id} key={order.id}>{order.orderNumber} | {order.customerName}</option>)}</select></label>
    <label><span className={labelClass}>Invoice Date</span><input className={inputClass} type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <fieldset className="grid gap-2"><legend className={labelClass}>Delivered challans to invoice</legend>{available.filter((delivery) => delivery.orderId === orderId).map((delivery) => <label className="flex items-center gap-3 rounded-md border border-slate-200 p-3 text-sm" key={delivery.id}>
      <input type="checkbox" checked={ids.includes(delivery.id)} onChange={(event) => setIds((current) => event.target.checked ? [...current, delivery.id] : current.filter((id) => id !== delivery.id))} />
      <span><strong className="block">{delivery.challanNumber}</strong><small className="text-slate-500">{delivery.date} | {formatNumber(delivery.lines.reduce((sum, line) => sum + Number(line.quantity), 0))} units</small></span>
    </label>)}</fieldset>
    <label><span className={labelClass}>Remarks</span><textarea className={textareaClass} value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label>
    <div className="flex justify-end"><Button type="submit" variant="primary" icon={<ReceiptText className="h-4 w-4" />} disabled={busy || !ids.length}>Create Draft Invoice</Button></div>
  </form>;
}

export function CancelInvoiceForm({ busy, onSubmit, submitLabel = "Cancel Invoice" }: { busy: boolean; onSubmit: (reason: string) => void; submitLabel?: string }) {
  const [reason, setReason] = useState("");
  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onSubmit(reason); }}>
    <label><span className={labelClass}>Cancellation Reason</span><textarea className={textareaClass} required minLength={5} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    <div className="flex justify-end"><Button type="submit" variant="danger" disabled={busy || reason.trim().length < 5}>{submitLabel}</Button></div>
  </form>;
}
