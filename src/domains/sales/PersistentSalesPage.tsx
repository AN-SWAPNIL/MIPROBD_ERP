import { lazy, Suspense, useDeferredValue, useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Banknote, BookOpenText, CheckCircle2, FileBarChart, Pencil, Plus, Printer, RotateCcw, Search, Trash2, Truck } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAuthStore } from "../../lib/auth/session";
import { hasCapability, hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { useToastStore } from "../../lib/ui/toast";
import { formatMoney } from "../../utils/precise";
import { ErrorBlock, LoadingBlock, Modal, Panel, Segmented, TableFrame, inputClass, labelClass, textareaClass } from "../components";
import type { Collection, Customer, Quotation, SalesInvoice } from "../erp.types";
import { salesService } from "../services";
import { WorkforcePager } from "../marketing/WorkforceUi";
import { getSalesPage, getSalesSummary } from "./pages";
import type { SalesRows } from "./pageContracts";
import { CustomerForm, QuotationForm } from "./SalesForms";
import { CancelInvoiceForm } from "./SalesDocumentForms";
import SalesRecordSelect from "./SalesRecordSelect";
import PersistentCollectionForm from "./PersistentCollectionForm";

const Marketing = lazy(() => import("../marketing/PersistentMarketingHub"));
type Register = "customers" | "quotations" | "orders" | "invoices" | "deliveries" | "collections";
type View = "customers" | "marketing" | "orders" | "deliveries" | "collections";
const titles: Record<Register, string> = { customers: "Customers", quotations: "Quotations", orders: "Sales orders", invoices: "Sales invoices", deliveries: "Delivery challans", collections: "Collections" };

export default function PersistentSalesPage() {
  const user = useAuthStore((state) => state.session?.user); const navigate = useNavigate(); const [params, setParams] = useSearchParams();
  const can = (area: Parameters<typeof hasEffectivePermission>[1], action: Parameters<typeof hasEffectivePermission>[2] = "view") => hasEffectivePermission(user, area, action);
  const financial = user?.role !== "Warehouse Manager";
  const views: { value: View; label: string }[] = [
    ...(can("customers") && financial ? [{ value: "customers" as const, label: "Customers" }] : []),
    ...(can("marketing") ? [{ value: "marketing" as const, label: "Marketing" }] : []),
    ...(can("sales") && financial && user?.role !== "Accounts" ? [{ value: "orders" as const, label: "Quotations & Orders" }] : []),
    ...(can("sales") && user?.role !== "Accounts" ? [{ value: "deliveries" as const, label: "Deliveries" }] : []),
    ...(can("sales") && financial ? [{ value: "collections" as const, label: "Collections" }] : [])
  ];
  const requested = params.get("view");
  const fallback = user?.role === "Accounts" ? "collections" : ["Sales Manager", "Sales Executive"].includes(user?.role ?? "") ? "marketing" : views[0]?.value;
  const view = (views.find((option) => option.value === requested)?.value ?? views.find((option) => option.value === fallback)?.value ?? views[0]?.value) as View;
  const orderRegister = params.get("register");
  const kind: Register = view === "orders" ? orderRegister === "orders" || orderRegister === "invoices" ? orderRegister : "quotations" : view === "marketing" ? "customers" : view;
  const [search, setSearch] = useState(""); const term = useDeferredValue(search); const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<"customer" | "quotation" | "convert" | "collection" | "workflow" | "cancel" | "reverse" | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer>(); const [editingQuote, setEditingQuote] = useState<Quotation>();
  const [quoteCustomer, setQuoteCustomer] = useState<Customer>(); const [leadId, setLeadId] = useState<string>();
  const [converting, setConverting] = useState<Quotation>(); const [instruction, setInstruction] = useState("");
  const [collectionCustomer, setCollectionCustomer] = useState(""); const [selectedOrder, setSelectedOrder] = useState("");
  const [ledgerId, setLedgerId] = useState(params.get("customerId") ?? "");
  const [invoice, setInvoice] = useState<SalesInvoice>(); const [receipt, setReceipt] = useState<Collection>();
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "customer" | "quotation"; id: string; label: string } | null>(null);
  const cache = useQueryClient(); const toast = useToastStore((state) => state.push);
  const query = useQuery({ queryKey: ["sales", "page", kind, page, term], enabled: view !== "marketing" && Boolean(view), queryFn: ({ signal }) => getSalesPage(kind, { page: String(page), pageSize: "25", search: term }, signal) });
  const summary = useQuery({ queryKey: ["sales", "summary"], enabled: can("sales") || can("customers"), queryFn: getSalesSummary });
  const action = useMutation({ mutationFn: (task: { run: () => Promise<unknown>; message: string }) => task.run(), onSuccess: async (_result, task) => {
    await Promise.all(["sales", "inventory", "accounts", "dashboard", "reports", "marketing"].map((key) => cache.invalidateQueries({ queryKey: [key] })));
    setDialog(null); setDeleteTarget(null); setEditingCustomer(undefined); setEditingQuote(undefined); setQuoteCustomer(undefined); setLeadId(undefined);
    if (task.message === "Quotation converted to order") { setPage(1); setSearch(""); setParams({ view: "orders", register: "orders" }); }
    toast({ kind: "success", title: task.message });
  }, onError: (error) => toast({ kind: "error", title: "Sales action failed", message: error.message }) });
  const run = (operation: () => Promise<unknown>, message: string) => action.mutate({ run: operation, message });
  const print = (type: string, id: string) => navigate(`/backend/print/${type}/${encodeURIComponent(id)}`);
  const openOrder = (id: string) => navigate(`/backend/sales/orders/${encodeURIComponent(id)}`);
  const switchView = (next: View) => { setSearch(""); setPage(1); setParams({ view: next }); };
  const newQuote = (customer?: Customer, lead?: string) => { switchView("orders"); setEditingQuote(undefined); setQuoteCustomer(customer); setLeadId(lead); setDialog("quotation"); };
  const requestedAction = params.get("action"); const canQuote = can("sales", "create") && can("customers"); const canCollect = can("sales", "post") && can("customers");
  useEffect(() => {
    if (requestedAction === "quotation" && canQuote) { setEditingQuote(undefined); setQuoteCustomer(undefined); setDialog("quotation"); setPage(1); setSearch(""); setParams({ view: "orders" }, { replace: true }); }
    else if (requestedAction === "collection" && canCollect) { setCollectionCustomer(""); setDialog("collection"); setPage(1); setSearch(""); setParams({ view: "collections" }, { replace: true }); }
  }, [requestedAction, canQuote, canCollect, setParams]);
  const openQuoteFor = async (customerId: string, lead?: string) => {
    try { const row = (await getSalesPage("customers", { selectedId: customerId, pageSize: "1" })).selected; if (!row) throw new Error("Customer is no longer accessible."); newQuote(row, lead); }
    catch (error) { toast({ kind: "error", title: "Could not open quotation", message: error instanceof Error ? error.message : undefined }); }
  };
  const printButton = (type: string, id: string) => can("print") ? <Button variant="ghost" title="Print Preview" aria-label="Print Preview" icon={<Printer className="h-4 w-4" />} onClick={() => print(type, id)} /> : null;
  const flowButton = (id: string) => <Button variant="ghost" icon={<ArrowRight className="h-4 w-4" />} onClick={() => openOrder(id)}>Open Flow</Button>;
  const row = (record: SalesRows[Register]): ReactNode[] => {
    if ("currentDue" in record) return [<strong>{record.name}</strong>, <>{record.type}<small className="block">{record.territory}</small></>, <>{record.contactPerson}<small className="block">{record.phone}</small><small className="block">{record.address}</small></>, formatMoney(record.totalSales), formatMoney(record.totalCollected), <strong className="text-red-700">{formatMoney(record.currentDue)}</strong>, <div className="flex flex-wrap justify-end gap-1">
      <Button variant="ghost" title="Customer Ledger" aria-label="Customer Ledger" icon={<BookOpenText className="h-4 w-4" />} onClick={() => setLedgerId(record.id)} />
      {canQuote ? <Button variant="ghost" title="New Quotation" aria-label={`Create quotation for ${record.name}`} icon={<Plus className="h-4 w-4" />} onClick={() => newQuote(record)} /> : null}
      {canCollect ? <Button variant="ghost" title="Record Collection" aria-label="Record Collection" icon={<Banknote className="h-4 w-4" />} onClick={() => { setCollectionCustomer(record.id); setDialog("collection"); }} /> : null}
      {can("customers", "edit") ? <Button variant="ghost" title="Edit Customer" aria-label="Edit Customer" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingCustomer(record); setDialog("customer"); }} /> : null}
      {can("customers", "delete") && record.active ? <Button variant="ghost" title="Deactivate Customer" aria-label="Deactivate Customer" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteTarget({ kind: "customer", id: record.id, label: record.name })} /> : null}
    </div>];
    if ("quotationNumber" in record) return [<strong>{record.quotationNumber}<small className="block font-normal">{record.date}</small></strong>, record.customerName, `${record.lines.length} product lines`, formatMoney(record.total), <StatusBadge status={record.status} />, <div className="flex flex-wrap justify-end gap-1">{printButton("quotation", record.id)}
      {can("sales", "edit") && !["Converted", "Rejected"].includes(record.status) ? <Button variant="ghost" aria-label="Edit quotation" title="Edit quotation" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingQuote(record); setQuoteCustomer(undefined); setDialog("quotation"); }} /> : null}
      {can("sales", "post") && !["Converted", "Rejected"].includes(record.status) ? <Button variant="ghost" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => { setConverting(record); setInstruction(""); setDialog("convert"); }}>Convert</Button> : null}
      {can("sales", "delete") && ["Draft", "Rejected"].includes(record.status) ? <Button variant="ghost" title="Archive Quotation" aria-label="Archive Quotation" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteTarget({ kind: "quotation", id: record.id, label: record.quotationNumber })} /> : null}
    </div>];
    if ("orderNumber" in record) return [<><button type="button" className="font-bold text-blue-900 hover:underline" onClick={() => openOrder(record.id)}>{record.orderNumber}</button><small className="block">{record.date}</small></>, record.customerName, record.deliveryInstruction, formatMoney(record.total), <StatusBadge status={record.status} />, <div className="flex justify-end gap-1">{flowButton(record.id)}{printButton("order", record.id)}</div>];
    if ("invoiceNumber" in record) return [<strong>{record.invoiceNumber}<small className="block font-normal">{record.date}</small></strong>, record.customerName, formatMoney(record.total), formatMoney(record.availableDue), <StatusBadge status={record.status} />, <div className="flex flex-wrap justify-end gap-1">{record.orderId ? flowButton(record.orderId) : null}{printButton("invoice", record.id)}
      {can("sales", "approve") && record.status === "Draft" ? <Button variant="ghost" disabled={action.isPending} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => run(() => salesService.approveInvoice(record.id), "Invoice approved and receivable posted")}>Approve</Button> : null}
      {can("sales", "approve") && record.status === "Approved" ? <Button variant="ghost" onClick={() => { setInvoice(record); setDialog("cancel"); }}>Cancel</Button> : null}
    </div>];
    if ("challanNumber" in record) return [<strong>{record.challanNumber}<small className="block font-normal">{record.date}</small></strong>, record.customerName, record.lines.map((line) => <small className="block" key={line.id}>{line.productCode} | {line.quantity} | {line.batchNumber}</small>), record.receiverName ?? "-", <StatusBadge status={record.status} />, <div className="flex justify-end gap-1">{flowButton(record.orderId)}{printButton("challan", record.id)}</div>];
    return [<strong>{record.receiptNumber}<small className="block font-normal">{record.date}</small></strong>, record.customerName, <>{record.paymentMode}<small className="block">{record.referenceNumber}</small></>, formatMoney(record.amount), <StatusBadge status={record.status} />, <div className="flex justify-end gap-1">{record.orderId ? flowButton(record.orderId) : null}{printButton("receipt", record.id)}{can("accounts", "post") && record.status === "Posted" ? <Button variant="ghost" title="Reverse Receipt" aria-label="Reverse Receipt" icon={<RotateCcw className="h-4 w-4" />} onClick={() => { setReceipt(record); setDialog("reverse"); }} /> : null}</div>];
  };
  const headers: Record<Register, string[]> = { customers: ["Customer", "Type / Territory", "Contact / Address", "Sales", "Collected", "Due", "Actions"], quotations: ["Quotation / Date", "Customer", "Products", "Total", "Status", "Actions"], orders: ["Order / Date", "Customer", "Delivery Instruction", "Value", "Status", "Actions"], invoices: ["Invoice / Date", "Customer", "Total", "Due", "Status", "Actions"], deliveries: ["Challan / Date", "Customer", "Products / Batches", "Receiver", "Status", "Actions"], collections: ["Receipt / Date", "Customer", "Mode / Reference", "Amount", "Status", "Actions"] };
  if (!views.length) return <ErrorBlock error={new Error("No Sales workspace is available for your current access.")} />;
  return <>
    <PageHeader title={can("marketing") ? "Sales & Marketing" : "Sales"} eyebrow="Commercial operations" subtitle="Customers, quotations, delivery and payment." actions={<>
      {can("sales") ? <Button icon={<RotateCcw className="h-4 w-4" />} onClick={() => navigate("/backend/returns")}>Returns & Credits</Button> : null}
      {can("reports") && view !== "marketing" ? <Button icon={<FileBarChart className="h-4 w-4" />} onClick={() => navigate(`/backend/reports/${kind === "customers" ? "customer-ledger" : kind === "quotations" || kind === "orders" ? "sales-order-register" : kind === "deliveries" ? "delivery-challan-register" : kind === "invoices" ? "invoice-register" : "collections"}`)}>Open Report</Button> : null}
      {view === "customers" && can("customers", "create") ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditingCustomer(undefined); setDialog("customer"); }}>New Customer</Button> : null}
      {view === "orders" && canQuote ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => newQuote()}>New Quotation</Button> : null}
      {view === "deliveries" && can("sales", "post") && can("inventory") ? <Button variant="primary" icon={<Truck className="h-4 w-4" />} onClick={() => { setSelectedOrder(""); setDialog("workflow"); }}>New Delivery</Button> : null}
      {view === "collections" && canCollect ? <Button variant="primary" icon={<Banknote className="h-4 w-4" />} onClick={() => { setCollectionCustomer(""); setDialog("collection"); }}>Record Collection</Button> : null}
    </>} />
    {summary.isError ? <ErrorBlock error={summary.error} /> : view !== "marketing" && summary.data ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ["Customers", String(summary.data.customers)], ["Open orders", String(summary.data.openOrders)],
      ...(summary.data.due !== null ? [["Outstanding due", formatMoney(summary.data.due)]] : []),
      ...(summary.data.collected !== null ? [["Posted collections", formatMoney(summary.data.collected)]] : [])
    ].map(([label, value]) => <div key={label} className="min-w-0 rounded-md border border-blue-200 bg-blue-50 p-4"><span className="text-xs text-slate-600">{label}</span><strong className="mt-1 block break-words text-xl text-blue-950">{value}</strong></div>)}</div> : null}
    <div className="flex flex-wrap items-center justify-between gap-3"><Segmented value={view} options={views} onChange={switchView} ariaLabel="Sales views" />{view !== "marketing" ? <div className="relative w-full min-w-0 sm:max-w-80"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search sales records" className={inputClass + " pl-9"} maxLength={120} placeholder="Search reference, product or customer" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div> : null}</div>
    {view === "orders" ? <Segmented value={kind} options={[{ value: "quotations", label: "Quotations" }, { value: "orders", label: "Orders" }, { value: "invoices", label: "Invoices" }]} onChange={(next) => { setPage(1); setSearch(""); setParams({ view: "orders", register: next }); }} ariaLabel="Sales registers" /> : null}
    {view === "marketing" ? <Suspense fallback={<LoadingBlock />}><Marketing onCreateQuotation={(customerId, lead) => { void openQuoteFor(customerId, lead); }} /></Suspense> : <Panel title={titles[kind]}>
      {query.isPending ? <LoadingBlock /> : query.isError ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} /> : <><TableFrame><table className="w-full min-w-[940px] text-left text-sm"><thead className="bg-blue-950 text-xs text-white"><tr>{headers[kind].map((header) => <th key={header} className="p-3">{header}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{query.data.rows.map((record) => <tr key={record.id}>{row(record).map((cell, column) => <td key={column} className="max-w-96 p-3 align-top text-slate-700">{cell}</td>)}</tr>)}{!query.data.rows.length ? <tr><td colSpan={headers[kind].length} className="p-8 text-center text-slate-500">No matching records.</td></tr> : null}</tbody></table></TableFrame><WorkforcePager page={page} pageSize={25} total={query.data.total} onChange={setPage} /></>}
    </Panel>}
    {dialog === "customer" ? <Modal open title={editingCustomer ? "Edit Customer" : "New Customer"} onClose={() => setDialog(null)}><CustomerForm customer={editingCustomer} busy={action.isPending} onSubmit={(payload) => run(() => editingCustomer ? salesService.updateCustomer(editingCustomer.id, payload) : salesService.createCustomer(payload), "Customer saved")} /></Modal> : null}
    {dialog === "quotation" ? <Modal open title={editingQuote ? "Edit Quotation" : "New Quotation"} onClose={() => setDialog(null)} width="max-w-5xl"><QuotationForm quotation={editingQuote} initialCustomerId={quoteCustomer?.id} leadId={leadId} customers={quoteCustomer ? [quoteCustomer] : []} products={[]} canViewProfit={hasCapability(user, "view_profit")} busy={action.isPending} onSubmit={(payload) => run(() => editingQuote ? salesService.updateQuotation(editingQuote.id, payload) : salesService.createQuotation(payload), "Quotation saved")} /></Modal> : null}
    {dialog === "convert" && converting ? <Modal open title={`Convert ${converting.quotationNumber}`} onClose={() => setDialog(null)}><form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); run(() => salesService.convertQuotation(converting.id, instruction, converting.version), "Quotation converted to order"); }}><p className="text-sm">{converting.customerName} | {formatMoney(converting.total)} | {converting.lines.length} lines</p><label><span className={labelClass}>Delivery Instruction</span><textarea className={textareaClass} required value={instruction} onChange={(e) => setInstruction(e.target.value)} /></label><Button type="submit" variant="primary" disabled={action.isPending || !instruction.trim()}>Create Sales Order</Button></form></Modal> : null}
    {dialog === "collection" ? <Modal open title="Record Collection" onClose={() => setDialog(null)}><PersistentCollectionForm initialCustomerId={collectionCustomer} busy={action.isPending} onSubmit={(payload) => run(() => salesService.createCollection(payload), "Collection posted and balances updated")} /></Modal> : null}
    {dialog === "workflow" ? <Modal open title="Select Sales Order" onClose={() => setDialog(null)}><div className="grid gap-4"><SalesRecordSelect kind="orders" label="Sales Order" value={selectedOrder} filters={{ activeOnly: "true" }} display={(order) => `${order.orderNumber} | ${order.customerName}`} onChange={(order) => setSelectedOrder(order?.id ?? "")} /><Button variant="primary" icon={<ArrowRight className="h-4 w-4" />} disabled={!selectedOrder} onClick={() => openOrder(selectedOrder)}>Open Order</Button></div></Modal> : null}
    {dialog === "cancel" && invoice ? <Modal open title={`Cancel ${invoice.invoiceNumber}`} onClose={() => setDialog(null)}><CancelInvoiceForm busy={action.isPending} onSubmit={(reason) => run(() => salesService.cancelInvoice(invoice.id, reason), "Invoice cancelled and receivable reversed")} /></Modal> : null}
    {dialog === "reverse" && receipt ? <Modal open title={`Reverse ${receipt.receiptNumber}`} onClose={() => setDialog(null)}><CancelInvoiceForm submitLabel="Reverse Receipt" busy={action.isPending} onSubmit={(reason) => run(() => salesService.reverseCollection(receipt.id, reason), "Receipt reversed and journals reconciled")} /></Modal> : null}
    <ConfirmDialog open={Boolean(deleteTarget)} title={deleteTarget?.kind === "customer" ? "Deactivate Customer?" : "Archive Quotation?"} message={`${deleteTarget?.label ?? ""}. Protected transaction history will be preserved.`} confirmLabel="Confirm" onCancel={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) run(() => deleteTarget.kind === "customer" ? salesService.removeCustomer(deleteTarget.id) : salesService.removeQuotation(deleteTarget.id), "Record updated; history preserved"); }} />
    {ledgerId ? <CustomerLedger id={ledgerId} onClose={() => setLedgerId("")} /> : null}
  </>;
}

function CustomerLedger({ id, onClose }: { id: string; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["sales", "customer-ledger", id], queryFn: () => salesService.customerLedger(id) });
  return <Modal open title={query.data?.customer.name ?? "Customer Ledger"} onClose={onClose} width="max-w-6xl">{query.isPending ? <LoadingBlock /> : query.isError ? <ErrorBlock error={query.error} /> : <div className="grid gap-4"><p className="text-sm text-slate-600">{query.data.customer.address} | {query.data.customer.phone}</p><div className="grid gap-3 sm:grid-cols-3">{[["Sales", query.data.invoicedSales], ["Collected", query.data.collected], ["Due", query.data.currentDue]].map(([label, value]) => <div key={label} className="rounded-md border border-blue-200 bg-blue-50 p-3"><span className="text-xs">{label}</span><strong className="block text-lg">{formatMoney(value)}</strong></div>)}</div><TableFrame><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-blue-950 text-xs text-white"><tr>{["Date", "Type", "Reference", "Debit", "Credit", "Running Due"].map((header) => <th key={header} className="p-3">{header}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{query.data.entries.slice((page-1)*25,page*25).map((entry) => <tr key={entry.id}>{[entry.date, entry.type, entry.reference, formatMoney(entry.debit), formatMoney(entry.credit), formatMoney(entry.runningDue)].map((value, column) => <td className="p-3" key={column}>{value}</td>)}</tr>)}</tbody></table></TableFrame><WorkforcePager page={page} pageSize={25} total={query.data.entries.length} onChange={setPage} /></div>}</Modal>;
}
