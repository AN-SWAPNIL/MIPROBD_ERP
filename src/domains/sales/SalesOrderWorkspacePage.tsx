import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Banknote, BookOpenText, CheckCircle2, FileBarChart, Pencil, Printer, ReceiptText, RotateCcw, Truck, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import LifecycleProgress, { type LifecycleStep } from "../../components/ui/LifecycleProgress";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAuthStore } from "../../lib/auth/session";
import { businessDate } from "../../lib/date";
import { hasCapability, hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { useToastStore } from "../../lib/ui/toast";
import { formatMoney as formatCurrency, formatQuantity as formatNumber } from "../../utils/precise";
import { ErrorBlock, LoadingBlock, Modal, Panel, TableFrame } from "../components";
import type { SalesInvoice } from "../erp.types";
import { inventoryService, salesService } from "../services";
import { visibleReportCatalog } from "../reports/reportCatalog";
import OrderReceivingDetailsForm from "./OrderReceivingDetailsForm";
import { CancelInvoiceForm, InvoiceForm } from "./SalesDocumentForms";
import { CollectionForm, DeliveryForm } from "./SalesForms";
import { foundationMode, workspacePath } from "../../lib/runtime";
import PersistentCollectionForm from "./PersistentCollectionForm";

type Dialog = "delivery" | "invoice" | "collection" | "order" | null;

export default function SalesOrderWorkspacePage() {
  const { orderId = "" } = useParams();
  const user = useAuthStore((state) => state.session?.user);
  const route = useNavigate();
  const navigate = (path: string) => route(workspacePath(path));
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [cancelInvoice, setCancelInvoice] = useState<SalesInvoice>();
  const workspace = useQuery({ queryKey: ["sales", "workspace", orderId, user?.id], queryFn: () => salesService.orderWorkspace(orderId) });
  const canPost = hasEffectivePermission(user, "sales", "post") && user?.role !== "Warehouse Manager";
  const canDispatch = canPost && hasEffectivePermission(user, "inventory", "view");
  const canCreateInvoice = hasEffectivePermission(user, "sales", "create") && user?.role !== "Warehouse Manager";
  const canApprove = hasEffectivePermission(user, "sales", "approve") && user?.role !== "Warehouse Manager";
  const canPrint = hasEffectivePermission(user, "print", "view");
  const canEdit = hasEffectivePermission(user, "sales", "edit") && user?.role !== "Warehouse Manager";
  const batches = useQuery({ queryKey: ["inventory", "batches", user?.id], queryFn: inventoryService.batches, enabled: dialog === "delivery" && canDispatch && !foundationMode });
  const accounts = useQuery({ queryKey: ["sales", "payment-accounts", user?.id], queryFn: salesService.paymentAccounts, enabled: dialog === "collection" && canPost && !foundationMode });
  const mutation = useMutation({
    mutationFn: (task: { run: () => Promise<unknown>; message: string }) => task.run(),
    onSuccess: async (_result, task) => {
      await Promise.all(["sales", "inventory", "accounts", "dashboard", "reports", "marketing", "employees"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      setDialog(null); setCancelInvoice(undefined);
      toast({ kind: "success", title: task.message });
    },
    onError: (error) => toast({ kind: "error", title: "Sales action failed", message: error.message })
  });
  if (workspace.isPending) return <LoadingBlock label="Loading order lifecycle" />;
  if (workspace.isError) return <ErrorBlock error={workspace.error} onRetry={() => void workspace.refetch()} />;
  const data = workspace.data;
  const { order, customer, totals, stages } = data;
  const print = (type: string, id: string) => navigate(`/app/print/${type}/${encodeURIComponent(id)}`);
  const ledger = () => navigate(`/app/sales?view=customers&customerId=${encodeURIComponent(order.customerId)}`);
  const reportAvailable = user?.role !== "Warehouse Manager" && visibleReportCatalog(user).some((report) => report.id === "sales-order-register");
  const hasRemaining = order.status !== "Cancelled" && data.fulfilment.some((line) => Number(line.remainingToDeliverQty) > 0);
  const invoiceCandidates = data.deliveries.filter((delivery) => delivery.status !== "Draft" && (data.invoiceableDeliveryIds?data.invoiceableDeliveryIds.includes(delivery.id):!data.invoices.some((invoice) => invoice.status !== "Cancelled" && invoice.deliveryIds.includes(delivery.id))));
  const steps: LifecycleStep[] = [
    { id: "quotation", label: "Quotation", state: "complete", detail: stages.quotation },
    { id: "order", label: "Order", state: order.status === "Cancelled" ? "cancelled" : "complete", detail: order.status },
    { id: "delivery", label: "Delivery", state: stages.delivery === "Complete" ? "complete" : stages.delivery === "Partial" ? "warning" : "current", detail: stages.delivery },
    ...(data.financialVisible ? [
      { id: "invoice", label: "Invoice", state: ["Complete","Not Required"].includes(stages.invoice??"") ? "complete" : ["Partial", "Draft Pending"].includes(stages.invoice ?? "") ? "warning" : "pending", detail: stages.invoice },
      { id: "collection", label: "Collection", state: ["Paid","Settled","Not Required"].includes(stages.collection??"") ? "complete" : ["Partial", "Unpaid"].includes(stages.collection ?? "") ? "warning" : "pending", detail: stages.collection }
    ] as LifecycleStep[] : [])
  ];
  const printAction = (type: string, id: string, label: string) => canPrint ? <Button variant="ghost" icon={<Printer className="h-4 w-4" />} title={`Print ${label}`} aria-label={`Print ${label}`} onClick={() => print(type, id)} /> : null;
  return <div className="grid min-w-0 gap-4" data-testid="sales-order-workspace">
    <Button className="w-fit" variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate("/app/sales?view=orders")}>Back to Sales</Button>
    <PageHeader eyebrow="Sales order lifecycle" title={order.orderNumber} subtitle={`${order.customerName} | ${order.date} | ${data.salesperson?.name ?? "Sales owner unassigned"}`} actions={<>
      {canPrint && data.financialVisible ? <Button icon={<Printer className="h-4 w-4" />} onClick={() => print("order", order.id)}>Print Order</Button> : null}
      {customer ? <Button icon={<BookOpenText className="h-4 w-4" />} onClick={ledger}>Customer Ledger</Button> : null}
      {foundationMode?<Button icon={<RotateCcw className="h-4 w-4"/>} onClick={()=>navigate(`/backend/returns?order=${encodeURIComponent(order.id)}`)}>Returns & Credits</Button>:null}
      {reportAvailable ? <Button icon={<FileBarChart className="h-4 w-4" />} onClick={() => navigate(`/app/reports/sales-order-register?from=${order.date}&to=${businessDate()}&${foundationMode ? "order=" + encodeURIComponent(order.id) : "filter.order=" + encodeURIComponent(order.orderNumber)}`)}>Open Report</Button> : null}
      <StatusBadge status={order.status} />
    </>} />
    <LifecycleProgress steps={steps} label="Sales lifecycle" />
    {totals ? <section className="grid grid-cols-2 gap-3 xl:grid-cols-5" aria-label="Order totals">{[
      ["Order Value", totals.orderValue], ["Delivered Value", totals.deliveredValue], ["Approved Invoice", totals.approvedInvoiceValue], ["Collected", totals.collectedValue], ["Outstanding", totals.outstandingValue]
    ].map(([label, value]) => <div className={`min-w-0 border-l-4 border-cyan-600 bg-white p-3 shadow-sm sm:p-4 ${label === "Outstanding" ? "col-span-2 xl:col-span-1" : ""}`} key={label}><span className="text-xs text-slate-500">{label}</span><strong className={`mt-1 block break-words text-xl ${label === "Outstanding" ? "text-rose-700" : "text-blue-950"}`}>{formatCurrency(value)}</strong></div>)}</section> : null}
    <Panel title="Product fulfilment" subtitle="Quantities from posted deliveries and approved invoices." actions={<div className="flex flex-wrap gap-2">
      {canEdit ? <Button icon={<Pencil className="h-4 w-4" />} disabled={mutation.isPending} onClick={() => setDialog("order")}>Order Details</Button> : null}
      {canDispatch && hasRemaining ? <Button variant="primary" icon={<Truck className="h-4 w-4" />} disabled={mutation.isPending} onClick={() => setDialog("delivery")}>New Delivery</Button> : null}
    </div>}>
      <Rows headers={["Product", "Ordered", "Gross Delivered", ...(data.financialVisible ? ["Approved Invoiced"] : []), "Remaining to Deliver", ...(data.financialVisible ? ["Accepted Not Invoiced"] : [])]} rows={data.fulfilment.map((line) => [<span><strong className="block text-blue-950">{line.productCode}</strong>{line.productName}</span>, formatNumber(line.orderedQty), <span>{formatNumber(line.deliveredQty)}{line.returnedQty&&Number(line.returnedQty)>0?<small className="block text-amber-700">Returned: {formatNumber(line.returnedQty)}</small>:null}{line.refusedQty&&Number(line.refusedQty)>0?<small className="block text-amber-700">Refused: {formatNumber(line.refusedQty)}</small>:null}</span>, ...(data.financialVisible ? [<span>{formatNumber(line.approvedInvoicedQty)}{Number(line.draftInvoicedQty) > 0 ? <small className="block text-amber-700">{formatNumber(line.draftInvoicedQty)} pending approval</small> : null}</span>] : []), formatNumber(line.remainingToDeliverQty), ...(data.financialVisible ? [formatNumber(line.deliveredNotInvoicedQty)] : [])])} />
    </Panel>
    <div className="grid gap-4 lg:grid-cols-2">
      {customer ? <Panel title="Customer"><dl className="grid grid-cols-2 gap-4 p-4 text-sm"><Info label="Name" value={customer.name} /><Info label="Current Due (All Orders)" value={formatCurrency(customer.currentDue)} /><Info label="Credit Limit" value={formatCurrency(customer.creditLimit)} /><Info label="Payment Terms" value={customer.paymentTerms} /></dl></Panel> : null}
      <Panel title="Salesperson & order context"><dl className="grid grid-cols-2 gap-4 p-4 text-sm"><Info label="Salesperson" value={data.salesperson?.name ?? order.ownerId} /><Info label="Territory" value={data.salesperson?.territory ?? "Unassigned"} /><Info label="Requested Delivery" value={order.requestedDeliveryDate ?? "Not specified"} /><Info label="Delivery Instruction" value={order.deliveryInstruction} /></dl>{!foundationMode && visibleReportCatalog(user).some((entry) => entry.id === "employee-activity") && data.salesperson ? <div className="px-4 pb-4"><Button icon={<UserRound className="h-4 w-4" />} onClick={() => navigate(`/app/reports/employee-activity?employeeId=${encodeURIComponent(data.salesperson!.id)}`)}>Employee Activity Report</Button></div> : null}</Panel>
    </div>
    {data.financialVisible ? <Panel title="Linked quotation"><Rows headers={["Quotation", "Date", "Value", "Status", "Print"]} rows={data.quotation ? [[data.quotation.quotationNumber, data.quotation.date, formatCurrency(data.quotation.total), <StatusBadge status={data.quotation.status} />, printAction("quotation", data.quotation.id, data.quotation.quotationNumber)]] : []} empty="Direct order; no quotation is linked." /></Panel> : null}
    <Panel title="Delivery challans" subtitle="Posting a challan dispatches the actual batches from inventory."><Rows headers={["Challan / Date", "Product / Batch", "Quantity", "Status", "Print"]} rows={data.deliveries.map((delivery) => [<span><strong className="block">{delivery.challanNumber}</strong>{delivery.date}</span>, <div className="grid gap-1">{delivery.lines.map((line) => <span key={line.id}>{line.productCode} | {line.batchNumber} | {formatNumber(line.quantity)}</span>)}</div>, formatNumber(delivery.lines.reduce((sum, line) => sum + Number(line.quantity), 0)), <StatusBadge status={delivery.status} />, printAction("challan", delivery.id, delivery.challanNumber)])} empty="No challan has been created for this order." /></Panel>
    {data.financialVisible ? <>
      <Panel title="Sales invoices" subtitle="Drafts do not change receivables. Approval posts customer and order due." actions={canCreateInvoice && invoiceCandidates.length ? <Button variant="primary" icon={<ReceiptText className="h-4 w-4" />} disabled={mutation.isPending} onClick={() => setDialog("invoice")}>Create Invoice</Button> : undefined}>
        <Rows headers={["Invoice / Date", "Challans", "Amount", "Status", "Actions"]} rows={data.invoices.map((invoice) => [<span><strong className="block">{invoice.invoiceNumber}</strong>{invoice.date}</span>, invoice.deliveryIds.map((id) => data.deliveries.find((delivery) => delivery.id === id)?.challanNumber ?? id).join(", "), formatCurrency(invoice.total), <StatusBadge status={invoice.status} />, <div className="flex gap-1">
          {printAction("invoice", invoice.id, invoice.invoiceNumber)}
          {canApprove && invoice.status === "Draft" ? <Button icon={<CheckCircle2 className="h-4 w-4" />} disabled={mutation.isPending} onClick={() => mutation.mutate({ run: () => salesService.approveInvoice(invoice.id), message: "Invoice approved and receivable posted" })}>Approve</Button> : null}
          {canApprove && invoice.status !== "Cancelled" ? <Button variant="danger" title={data.collections.some((collection) => collection.status === "Posted" && (collection.invoiceId === invoice.id || collection.allocations?.some((allocation) => allocation.invoiceId === invoice.id))) ? "A posted collection must be reversed before cancellation." : "Cancel this invoice with a reason"} disabled={mutation.isPending || data.collections.some((collection) => collection.status === "Posted" && (collection.invoiceId === invoice.id || collection.allocations?.some((allocation) => allocation.invoiceId === invoice.id)))} onClick={() => setCancelInvoice(invoice)}>Cancel</Button> : null}
        </div>])} empty="No invoice exists for this order." />
      </Panel>
      <Panel title="Collections" subtitle="Only posted receipts linked to this order or its invoices count toward the collected total." actions={canPost && customer && Number(totals?.outstandingValue) > 0 ? <Button variant="primary" icon={<Banknote className="h-4 w-4" />} disabled={mutation.isPending} onClick={() => setDialog("collection")}>Record Collection</Button> : undefined}>
        <Rows headers={["Receipt / Date", "Invoice", "Payment Mode", "Reference", "Amount", "Print"]} rows={data.collections.map((collection) => [<span><strong className="block">{collection.receiptNumber}</strong>{collection.date}</span>, data.invoices.find((invoice) => invoice.id === collection.invoiceId)?.invoiceNumber ?? "Order collection", collection.paymentMode, collection.referenceNumber ?? "-", formatCurrency(collection.amount), printAction("receipt", collection.id, collection.receiptNumber)])} empty="No payment is linked to this order." />
      </Panel>
    </> : null}
    {hasEffectivePermission(user, "inventory", "view") ? <Panel title="Linked stock movements"><Rows headers={["Date", "Challan", "Product", "Batch", "Quantity", "Posted By"]} rows={data.stockMovements.map((movement) => [movement.date, movement.reference, movement.productName, movement.batchNumber, formatNumber(movement.quantity), movement.createdBy])} empty="No dispatch movement has been posted." /></Panel> : null}
    {dialog ? <Modal open title={{ delivery: "Create delivery challan", invoice: "Create sales invoice", collection: "Post customer collection", order: "Order Receiving Details" }[dialog]} onClose={() => setDialog(null)} width={dialog === "delivery" || dialog === "order" ? "max-w-5xl" : "max-w-3xl"}>
      {dialog === "delivery" ? !foundationMode && batches.isPending ? <LoadingBlock /> : batches.isError ? <ErrorBlock error={batches.error} /> : <DeliveryForm orders={[order]} deliveries={data.deliveries} batches={batches.data ?? []} canOverride={hasCapability(user, "approve_stock_override")} busy={mutation.isPending} onSubmit={(payload) => mutation.mutate({ run: () => salesService.createDelivery(payload), message: "Delivery posted and stock reduced" })} /> : null}
      {dialog === "invoice" ? <InvoiceForm orders={[order]} deliveries={data.deliveries} invoices={data.invoices} busy={mutation.isPending} onSubmit={(payload) => mutation.mutate({ run: () => salesService.createInvoice(payload), message: "Draft invoice created" })} /> : null}
      {dialog === "collection" && customer ? foundationMode ? <PersistentCollectionForm initialCustomerId={customer.id} initialOrderId={order.id} busy={mutation.isPending} onSubmit={(payload) => mutation.mutate({ run: () => salesService.createCollection(payload), message: "Collection posted and balances updated" })} /> : accounts.isPending ? <LoadingBlock /> : accounts.isError ? <ErrorBlock error={accounts.error} /> : <CollectionForm initialCustomerId={customer.id} initialOrderId={order.id} customers={[customer]} orders={[order]} invoices={data.invoices} collections={data.collections} accounts={accounts.data} busy={mutation.isPending} onSubmit={(payload) => mutation.mutate({ run: () => salesService.createCollection(payload), message: "Collection posted and balances updated" })} /> : null}
      {dialog === "order" ? <OrderReceivingDetailsForm order={order} busy={mutation.isPending} onSubmit={(payload) => mutation.mutate({ run: () => salesService.updateOrder(order.id, payload), message: "Order receiving details saved" })} /> : null}
    </Modal> : null}
    {cancelInvoice ? <Modal open title={`Cancel ${cancelInvoice.invoiceNumber}`} onClose={() => setCancelInvoice(undefined)}><CancelInvoiceForm busy={mutation.isPending} onSubmit={(reason) => mutation.mutate({ run: () => salesService.cancelInvoice(cancelInvoice.id, reason), message: "Invoice cancelled with receivable reversal" })} /></Modal> : null}
  </div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold text-blue-950">{value}</dd></div>;
}

function Rows({ headers, rows, empty = "No records." }: { headers: string[]; rows: ReactNode[][]; empty?: string }) {
  return <TableFrame><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-blue-950 text-[11px] uppercase text-white"><tr>{headers.map((header) => <th className="px-4 py-3" key={header}>{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((cells, index) => <tr key={index}>{cells.map((cell, column) => <td className="px-4 py-3 align-top text-slate-600" key={column}>{cell}</td>)}</tr>)}{!rows.length ? <tr><td className="p-6 text-center text-slate-500" colSpan={headers.length}>{empty}</td></tr> : null}</tbody></table></TableFrame>;
}
