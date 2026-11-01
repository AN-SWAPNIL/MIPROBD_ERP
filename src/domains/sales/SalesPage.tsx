import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSalesOverview } from "./overview";
import Decimal from "decimal.js";
import {
  ArrowRight,
  Banknote,
  BookOpenText,
  Building2,
  CheckCircle2,
  FileText,
  FileBarChart,
  History,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  ShoppingCart,
  Trash2,
  Truck
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import AIRecommendationCard from "../../components/ai/AIRecommendationCard";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import {
  ErrorBlock,
  LoadingBlock,
  Modal,
  Panel,
  Segmented,
  TableFrame,
  inputClass,
  labelClass,
  textareaClass
} from "../components";
import type { Collection, Customer, Quotation, SalesInvoice, SalesOrder } from "../erp.types";
import { aiService, inventoryService, salesService, settingsService } from "../services";
import { useAuthStore, useEffectiveRole } from "../../lib/auth/session";
import { hasCapability, hasEffectivePermission } from "../../lib/permissions/matrix";
import { useToastStore } from "../../lib/ui/toast";
import { formatMoney as formatCurrency, formatQuantity as formatNumber } from "../../utils/precise";
import { CollectionForm, CustomerForm, DeliveryForm, QuotationForm } from "./SalesForms";
import OrderReceivingDetailsForm from "./OrderReceivingDetailsForm";
import { CancelInvoiceForm, InvoiceForm } from "./SalesDocumentForms";
import { foundationMode, workspacePath } from "../../lib/runtime";

const MarketingHub = lazy(() => import("../marketing/MarketingHub"));
const PersistentMarketingHub = lazy(() => import("../marketing/PersistentMarketingHub"));
const Money = Decimal.clone({ precision: 48, rounding: Decimal.ROUND_HALF_UP });

type View = "customers" | "marketing" | "orders" | "deliveries" | "collections";
type ModalType = "customer" | "quotation" | "convert" | "delivery" | "collection" | "order-details" | "invoice" | "cancel-invoice" | "reverse-collection" | null;
type Task = { run: () => Promise<unknown>; success: string };

export default function SalesPage() {
  const role = useEffectiveRole();
  const session = useAuthStore((state) => state.session);
  const route = useNavigate();
  const navigate = (path: string) => route(workspacePath(path));
  const [params, setParams] = useSearchParams();
  const defaultView: View = role === "Accounts" ? "collections" : role === "Warehouse Manager" ? "deliveries" : ["Sales Manager", "Sales Executive"].includes(role) ? "marketing" : "customers";
  const requestedValue = params.get("view");
  const requested = (requestedValue === "field-team" ? "marketing" : requestedValue) as View | null;
  const [view, setViewState] = useState<View>(requested ?? defaultView);
  const [modal, setModal] = useState<ModalType>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | undefined>();
  const [editingQuotation, setEditingQuotation] = useState<Quotation | undefined>();
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | undefined>();
  const [converting, setConverting] = useState<Quotation | undefined>();
  const [orderDetails, setOrderDetails] = useState<SalesOrder | undefined>();
  const [deliveryInstruction, setDeliveryInstruction] = useState("");
  const [quotationContext, setQuotationContext] = useState<{ customerId: string; leadId?: string }>();
  const [collectionCustomerId, setCollectionCustomerId] = useState<string>();
  const [invoiceDeliveryIds, setInvoiceDeliveryIds] = useState<string[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice>();
  const [reversingCollection, setReversingCollection] = useState<Collection>();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ type: "customer" | "quotation"; id: string; label: string } | null>(null);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

  const canCreateQuote = hasEffectivePermission(session?.user, "sales", "create");
  const canViewSales = hasEffectivePermission(session?.user, "sales", "view");
  const canViewFinancialSales = canViewSales && role !== "Warehouse Manager";
  const canViewCustomers = hasEffectivePermission(session?.user, "customers", "view") && role !== "Warehouse Manager";
  const canViewMarketing = hasEffectivePermission(session?.user, "marketing", "view");
  const canViewReports = hasEffectivePermission(session?.user, "reports", "view");
  const canEditQuote = hasEffectivePermission(session?.user, "sales", "edit");
  const canDeleteQuote = hasEffectivePermission(session?.user, "sales", "delete");
  const canConvertQuote = hasEffectivePermission(session?.user, "sales", "post");
  const canDispatch = hasEffectivePermission(session?.user, "sales", "post") && hasEffectivePermission(session?.user, "inventory", "view");
  const canCollect = hasEffectivePermission(session?.user, "sales", "post");
  const canApproveInvoice = hasEffectivePermission(session?.user, "sales", "approve");
  const canCreateCustomer = hasEffectivePermission(session?.user, "customers", "create");
  const canEditCustomer = hasEffectivePermission(session?.user, "customers", "edit");
  const canDeleteCustomer = hasEffectivePermission(session?.user, "customers", "delete");
  const canPrint = hasEffectivePermission(session?.user, "print", "view");
  const overview = useQuery({ queryKey: ["sales", "overview", session?.user.id], queryFn: ({ signal }) => getSalesOverview(signal), enabled: foundationMode });
  const legacyCustomers = useQuery({ queryKey: ["sales", "customers", session?.user.id], queryFn: salesService.customers, enabled: canViewCustomers && !foundationMode });
  const legacyQuotations = useQuery({ queryKey: ["sales", "quotations", session?.user.id], queryFn: salesService.quotations, enabled: canViewFinancialSales && !foundationMode });
  const legacyOrders = useQuery({ queryKey: ["sales", "orders", session?.user.id], queryFn: salesService.orders, enabled: canViewSales && !foundationMode });
  const legacyDeliveries = useQuery({ queryKey: ["sales", "deliveries", session?.user.id], queryFn: salesService.deliveries, enabled: canViewSales && !foundationMode });
  const legacyInvoices = useQuery({ queryKey: ["sales", "invoices", session?.user.id], queryFn: salesService.invoices, enabled: canViewFinancialSales && !foundationMode });
  const legacyCollections = useQuery({ queryKey: ["sales", "collections", session?.user.id], queryFn: salesService.collections, enabled: canViewFinancialSales && !foundationMode });
  const legacyProducts = useQuery({ queryKey: ["products"], queryFn: settingsService.products, enabled: canViewSales && !foundationMode });
  const customersQuery = foundationMode ? { ...overview, data: overview.data?.customers } : legacyCustomers;
  const quotationsQuery = foundationMode ? { ...overview, data: overview.data?.quotations } : legacyQuotations;
  const ordersQuery = foundationMode ? { ...overview, data: overview.data?.orders } : legacyOrders;
  const deliveriesQuery = foundationMode ? { ...overview, data: overview.data?.deliveries } : legacyDeliveries;
  const invoicesQuery = foundationMode ? { ...overview, data: overview.data?.invoices } : legacyInvoices;
  const collectionsQuery = foundationMode ? { ...overview, data: overview.data?.collections } : legacyCollections;
  const productsQuery = foundationMode ? { ...overview, data: overview.data?.products } : legacyProducts;
  const batchesQuery = useQuery({ queryKey: ["inventory", "batches"], queryFn: inventoryService.batches, enabled: canDispatch && !foundationMode });
  const legacyAccounts = useQuery({ queryKey: ["sales", "payment-accounts"], queryFn: salesService.paymentAccounts, enabled: canCollect && !foundationMode });
  const accountsQuery = foundationMode ? { ...overview, data: overview.data?.accounts } : legacyAccounts;
  const ledgerQuery = useQuery({ queryKey: ["sales", "customer-ledger", ledgerCustomer?.id], queryFn: () => salesService.customerLedger(ledgerCustomer!.id), enabled: Boolean(ledgerCustomer) });
  const recommendationsQuery = useQuery({ queryKey: ["ai", "sales", session?.user.id], queryFn: () => aiService.recommendations({ route: "/app/sales", entityType: "sales" }), enabled: !foundationMode && role !== "Warehouse Manager" });

  const queries = [...(canViewCustomers ? [customersQuery] : []), ...(canViewFinancialSales ? [quotationsQuery, invoicesQuery, collectionsQuery] : []), ...(canViewSales ? [ordersQuery, deliveriesQuery, productsQuery] : []), ...(canDispatch && !foundationMode ? [batchesQuery] : []), ...(canCollect ? [accountsQuery] : [])];
  const error = queries.find((query) => query.error)?.error;
  const loading = queries.some((query) => query.isLoading);
  const refresh = () => Promise.all(["sales", "inventory", "dashboard", "accounts", "marketing"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
  const action = useMutation({
    mutationFn: (task: Task) => task.run(),
    onSuccess: async (_data, task) => {
      await refresh();
      setModal(null);
      setEditingCustomer(undefined);
      setEditingQuotation(undefined);
      setConverting(undefined);
      setOrderDetails(undefined);
      setQuotationContext(undefined);
      setCollectionCustomerId(undefined);
      setInvoiceDeliveryIds([]);
      setSelectedInvoice(undefined);
      setReversingCollection(undefined);
      setDeleteTarget(null);
      pushToast({ kind: "success", title: task.success });
    },
    onError: (error) => pushToast({ kind: "error", title: "Sales action failed", message: error instanceof Error ? error.message : undefined })
  });

  const setView = (next: View) => {
    setViewState(next);
    setParams({ view: next }, { replace: true });
  };
  const visibleOptions = useMemo(() => {
    if (role === "Accounts") return [{ value: "customers" as const, label: "Customer Dues", count: customersQuery.data?.length }, { value: "collections" as const, label: "Collections", count: collectionsQuery.data?.length }];
    if (role === "Warehouse Manager") return [{ value: "deliveries" as const, label: "Deliveries", count: deliveriesQuery.data?.length }];
    const options: Array<{ value: View; label: string; count?: number }> = [];
    if (canViewCustomers) options.push({ value: "customers", label: role === "Sales Executive" ? "My Customers" : "Customers", count: customersQuery.data?.length });
    if (canViewMarketing) options.push({ value: "marketing", label: "Marketing" });
    if (canViewSales) options.push({ value: "orders", label: role === "Sales Executive" ? "My Quotes & Orders" : "Quotations & Orders", count: quotationsQuery.data?.length });
    if (canViewSales && role !== "Sales Executive") options.push({ value: "deliveries", label: "Deliveries", count: deliveriesQuery.data?.length });
    if (canViewSales) options.push({ value: "collections", label: "Collections", count: collectionsQuery.data?.length });
    return options;
  }, [role, canViewCustomers, canViewMarketing, canViewSales, customersQuery.data, collectionsQuery.data, deliveriesQuery.data, quotationsQuery.data]);

  useEffect(() => {
    if (visibleOptions.length && !visibleOptions.some((option) => option.value === view)) {
      setViewState(visibleOptions[0].value);
      setParams({ view: visibleOptions[0].value }, { replace: true });
    }
  }, [setParams, view, visibleOptions]);

  useEffect(() => {
    const requestedAction = params.get("action");
    if (!requestedAction) return;
    if (requestedAction === "quotation" && canCreateQuote) {
      setViewState("orders");
      setEditingQuotation(undefined);
      setModal("quotation");
    } else if (requestedAction === "collection" && canCollect) {
      setViewState("collections");
      setCollectionCustomerId(undefined);
      setModal("collection");
    } else return;
    const next = new URLSearchParams(params);
    next.delete("action");
    setParams(next, { replace: true });
  }, [canCollect, canCreateQuote, params, setParams]);

  useEffect(() => {
    const customerId = params.get("customerId");
    if (customerId && canViewCustomers && customersQuery.data) setLedgerCustomer(customersQuery.data.find((customer) => customer.id === customerId));
  }, [params, canViewCustomers, customersQuery.data]);

  if (loading) return <LoadingBlock label="Loading connected sales workspace" />;
  if (error) return <ErrorBlock error={error} onRetry={() => queries.forEach((query) => void query.refetch())} />;

  const customers = customersQuery.data ?? [];
  const quotations = quotationsQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const deliveries = deliveriesQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const collections = collectionsQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const term = search.toLowerCase();
  const filteredCustomers = customers.filter((customer) => [customer.name, customer.territory, customer.phone, customer.type].some((value) => value.toLowerCase().includes(term)));
  const matches = (...values: (string | undefined)[]) => values.some((value) => value?.toLowerCase().includes(term));
  const visibleQuotations = quotations.filter((quote) => matches(quote.quotationNumber, quote.customerName, ...quote.lines.map((line) => `${line.productCode} ${line.productName}`)));
  const visibleOrders = orders.filter((order) => matches(order.orderNumber, order.customerName, order.deliveryInstruction));
  const visibleInvoices = invoices.filter((invoice) => matches(invoice.invoiceNumber, invoice.customerName));
  const visibleDeliveries = deliveries.filter((delivery) => matches(delivery.challanNumber, delivery.customerName, ...delivery.lines.map((line) => `${line.productCode} ${line.batchNumber}`)));
  const visibleCollections = collections.filter((collection) => matches(collection.receiptNumber, collection.customerName, collection.referenceNumber));
  const totalDue = customers.reduce((sum, customer) => sum.plus(customer.currentDue), new Money(0)).toFixed(2);
  const totalCollections = collections.filter((collection) => collection.status === "Posted").reduce((sum, collection) => sum.plus(collection.amount), new Money(0)).toFixed(2);

  return (
    <>
      <PageHeader
        eyebrow={role === "Sales Executive" ? "Own-record sales workspace" : "Commercial operations"}
        title={canViewMarketing ? "Sales & Marketing" : "Sales"}
        subtitle={view === "marketing" ? "Employee activity, leads, follow-ups, plans and targets." : "Customer ledger, quotation, order, actual batch delivery and collection remain connected without re-entering line items."}
        actions={
          <>
            {foundationMode && canViewSales ? <Button icon={<RotateCcw className="h-4 w-4"/>} onClick={()=>navigate("/backend/returns")}>Returns & Credits</Button>:null}
            {canViewReports && view !== "marketing" ? <Button icon={<FileBarChart className="h-4 w-4" />} onClick={() => navigate(`/app/reports/${view === "customers" ? "customer-ledger" : view === "orders" ? "sales-order-register" : view === "deliveries" ? "delivery-challan-register" : "collections"}`)}>Open Report</Button> : null}
            {view === "customers" && canCreateCustomer ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditingCustomer(undefined); setModal("customer"); }}>New Customer</Button> : null}
            {view === "orders" && canCreateQuote ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditingQuotation(undefined); setModal("quotation"); }}>New Quotation</Button> : null}
            {view === "deliveries" && canDispatch ? <Button variant="primary" icon={<Truck className="h-4 w-4" />} onClick={() => setModal("delivery")}>New Delivery</Button> : null}
            {view === "collections" && canCollect ? <Button variant="primary" icon={<Banknote className="h-4 w-4" />} onClick={() => { setCollectionCustomerId(undefined); setModal("collection"); }}>Post Collection</Button> : null}
          </>
        }
      />

      {view !== "marketing" ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"><span className="text-xs text-slate-500">Visible customers</span><strong className="mt-1 block text-2xl">{formatNumber(customers.length)}</strong><small className="text-slate-400">{role === "Sales Executive" ? "assigned to you" : "customer ledgers"}</small></div>
        <div className="min-w-0 rounded-md border border-slate-200 bg-white p-4 shadow-sm"><span className="text-xs text-slate-500">Outstanding due</span><strong className="mt-1 block break-words text-xl text-red-700">{formatCurrency(totalDue)}</strong><small className="text-slate-400">current visible balance</small></div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"><span className="text-xs text-slate-500">Open orders</span><strong className="mt-1 block text-2xl">{formatNumber(orders.filter((order) => !["Delivered", "Cancelled"].includes(order.status)).length)}</strong><small className="text-slate-400">awaiting or in delivery</small></div>
        <div className="min-w-0 rounded-md border border-slate-200 bg-white p-4 shadow-sm"><span className="text-xs text-slate-500">Collections shown</span><strong className="mt-1 block break-words text-xl text-emerald-700">{formatCurrency(totalCollections)}</strong><small className="text-slate-400">posted receipts only</small></div>
      </div> : null}

      {view !== "marketing" && recommendationsQuery.data?.length ? <section className="grid gap-3 lg:grid-cols-2" aria-label="Sales follow-up suggestions">{recommendationsQuery.data.filter((item) => item.id.startsWith("due-") || item.id.startsWith("quote-")).slice(0, 2).map((item) => <AIRecommendationCard recommendation={item} key={item.id} />)}</section> : null}

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <Segmented value={visibleOptions.some((option) => option.value === view) ? view : visibleOptions[0].value} onChange={setView} ariaLabel="Sales views" options={visibleOptions} />
        {view !== "marketing" ? <div className="relative w-full xl:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search sales records" className={inputClass + " pl-9"} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={view === "customers" ? "Search customer ledger" : "Search reference or customer"} /></div> : null}
        {view === "orders" && orders.length && canEditQuote ? <label className="w-full xl:w-80"><span className="sr-only">Edit order receiving details</span><select className={inputClass} value="" onChange={(event) => { const selected = orders.find((order) => order.id === event.target.value); if (selected) { setOrderDetails(selected); setModal("order-details"); } }}><option value="">Order receiving / office details...</option>{orders.map((order) => <option value={order.id} key={order.id}>{order.orderNumber} · {order.customerName}</option>)}</select></label> : null}
      </div>

      {view === "marketing" && canViewMarketing ? <Suspense fallback={<LoadingBlock label="Loading marketing workspace" />}>{foundationMode ? <PersistentMarketingHub onCreateQuotation={(customerId, leadId) => { setQuotationContext({ customerId, leadId }); setEditingQuotation(undefined); setView("orders"); setModal("quotation"); }} /> : <MarketingHub onCreateQuotation={(customerId, leadId) => { setQuotationContext({ customerId, leadId }); setEditingQuotation(undefined); setView("orders"); setModal("quotation"); }} />}</Suspense> : null}

      {view === "customers" ? (
        <Panel title="Customer ledger" subtitle="All spreadsheet histories are combined into one searchable customer list with running balances." actions={<label><span className="sr-only">Open customer ledger</span><select className={inputClass + " min-w-56"} value="" onChange={(event) => setLedgerCustomer(customers.find((customer) => customer.id === event.target.value))}><option value="">Open detailed ledger...</option>{filteredCustomers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></label>}>
          <TableFrame>
            <table className="min-w-[1220px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Type / Territory</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3 text-right">Sales</th><th className="px-4 py-3 text-right">Collected</th><th className="px-4 py-3 text-right">Due</th><th className="px-4 py-3">Collection</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{filteredCustomers.map((customer) => {
                const percent = Number(customer.totalSales) ? Math.min(100, Number(customer.totalCollected) / Number(customer.totalSales) * 100) : 0;
                return (
                  <tr key={customer.id}>
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-blue-50 text-blue-700"><Building2 className="h-5 w-5" /></span><div><strong className="block max-w-64 truncate text-slate-900">{customer.name}</strong><small className="text-slate-500">{customer.paymentTerms} · limit {formatCurrency(customer.creditLimit)}</small></div></div></td>
                    <td className="px-4 py-3 text-slate-600">{customer.type}<small className="block">{customer.territory}</small></td>
                    <td className="px-4 py-3 text-slate-600">{customer.contactPerson}<small className="block">{customer.phone}</small></td>
                    <td className="px-4 py-3 text-right">{formatCurrency(customer.totalSales)}</td>
                    <td className="px-4 py-3 text-right text-emerald-700">{formatCurrency(customer.totalCollected)}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-700">{formatCurrency(customer.currentDue)}</td>
                    <td className="px-4 py-3"><div className="h-1.5 w-24 rounded-full bg-slate-100"><span className="block h-full rounded-full bg-emerald-500" style={{ width: percent + "%" }} /></div><small className="text-slate-400">{percent.toFixed(0)}% collected</small></td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1">
                      {canViewMarketing && canViewReports ? <Button variant="ghost" icon={<History className="h-4 w-4 text-cyan-700" />} onClick={() => navigate(`/app/reports/daily-marketing?preset=this-month&subject=${encodeURIComponent(`customer:${customer.id}`)}`)} aria-label={`Open marketing history for ${customer.name}`} title="Marketing history" /> : null}
                      {canCreateQuote ? <Button variant="ghost" icon={<FileText className="h-4 w-4 text-blue-700" />} onClick={() => { setQuotationContext({ customerId: customer.id }); setEditingQuotation(undefined); setView("orders"); setModal("quotation"); }} aria-label={`Create quotation for ${customer.name}`} title="Create quotation" /> : null}
                      {canCollect && Number(customer.currentDue) > 0 ? <Button variant="ghost" icon={<Banknote className="h-4 w-4 text-emerald-700" />} onClick={() => { setCollectionCustomerId(customer.id); setView("collections"); setModal("collection"); }} aria-label={`Post collection for ${customer.name}`} title="Post collection" /> : null}
                      {canEditCustomer ? <Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingCustomer(customer); setModal("customer"); }} aria-label="Edit customer" title="Edit customer" /> : null}
                      {canDeleteCustomer ? <Button variant="ghost" icon={<Trash2 className="h-4 w-4 text-red-600" />} onClick={() => setDeleteTarget({ type: "customer", id: customer.id, label: customer.name })} aria-label="Delete customer" title="Delete customer" /> : null}
                    </div></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </TableFrame>
        </Panel>
      ) : null}

      {view === "orders" ? (
        <>
          <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-5">
            {[["Quotation", FileText], ["Order", ShoppingCart], ["Delivery", Truck], ["Invoice", ReceiptText], ["Collection", Banknote]].map(([label, Icon], index) => <div className="relative flex items-center gap-2 rounded bg-slate-50 p-3" key={String(label)}><span className="grid h-8 w-8 place-items-center rounded bg-red-50 text-red-700"><Icon className="h-4 w-4" /></span><strong className="text-xs sm:text-sm">{label as string}</strong>{index < 4 ? <ArrowRight className="absolute -right-2 z-10 hidden h-4 w-4 text-slate-400 sm:block" /> : null}</div>)}
          </div>
          <Panel title="Quotations" subtitle="Digital and preprinted letterhead modes use this same record.">
            <TableFrame>
              <table className="min-w-[1020px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Quotation</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Lines</th><th className="px-4 py-3">Terms</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{visibleQuotations.map((quote) => <tr key={quote.id}><td className="px-4 py-3"><strong>{quote.quotationNumber}</strong><small className="block text-slate-500">{quote.date} · {quote.validityDays} days</small></td><td className="max-w-72 px-4 py-3"><span className="block truncate font-semibold">{quote.customerName}</span></td><td className="px-4 py-3">{quote.lines.length}<small className="block text-slate-500">{formatNumber(quote.lines.reduce((sum, line) => sum + Number(line.quantity), 0))} units</small></td><td className="px-4 py-3 text-slate-600">{quote.paymentTerms}</td><td className="px-4 py-3 text-right font-bold">{formatCurrency(quote.total)}</td><td className="px-4 py-3"><StatusBadge status={quote.status} /></td><td className="px-4 py-3"><div className="flex justify-end gap-1">{canPrint ? <Button variant="ghost" icon={<Printer className="h-4 w-4" />} onClick={() => navigate("/app/print/quotation/" + quote.id)} aria-label="Print quotation" title="Print quotation" /> : null}{canEditQuote && !["Converted", "Rejected"].includes(quote.status) ? <Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingQuotation(quote); setModal("quotation"); }} aria-label="Edit quotation" title="Edit quotation" /> : null}{canConvertQuote && !["Converted", "Rejected"].includes(quote.status) ? <Button variant="ghost" icon={<CheckCircle2 className="h-4 w-4 text-emerald-700" />} onClick={() => { setConverting(quote); setDeliveryInstruction(""); setModal("convert"); }}>Convert</Button> : null}{canDeleteQuote && ["Draft", "Rejected"].includes(quote.status) ? <Button variant="ghost" icon={<Trash2 className="h-4 w-4 text-red-600" />} onClick={() => setDeleteTarget({ type: "quotation", id: quote.id, label: quote.quotationNumber })} aria-label="Delete quotation" title="Delete quotation" /> : null}</div></td></tr>)}</tbody>
              </table>
            </TableFrame>
          </Panel>
          <Panel title="Sales orders" subtitle="Converted quotation lines carry forward without re-entry. Delivery posts stock-out; only an approved invoice posts receivable.">
            <TableFrame>
              <table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Instruction</th><th className="px-4 py-3 text-right">Value</th><th className="px-4 py-3 text-right">Posted Due</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Print</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleOrders.map((order) => <tr key={order.id}><td className="px-4 py-3"><button type="button" className="font-bold text-blue-900 hover:underline" onClick={() => navigate(`/app/sales/orders/${order.id}`)}>{order.orderNumber}</button><small className="block text-slate-500">{order.date}</small></td><td className="px-4 py-3 font-semibold">{order.customerName}</td><td className="max-w-72 px-4 py-3 text-slate-600"><span className="block truncate">{order.deliveryInstruction}</span></td><td className="px-4 py-3 text-right font-semibold">{formatCurrency(order.total)}</td><td className="px-4 py-3 text-right font-bold text-red-700">{formatCurrency(order.due)}</td><td className="px-4 py-3"><StatusBadge status={order.status} /></td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-1"><Button variant="ghost" icon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate(`/app/sales/orders/${order.id}`)}>Open Flow</Button>{canPrint && canViewFinancialSales ? <Button variant="ghost" icon={<Printer className="h-4 w-4" />} onClick={() => navigate("/app/print/order/" + order.id)} aria-label="Print order" title="Print order" /> : null}</div></td></tr>)}</tbody></table>
            </TableFrame>
          </Panel>
          <Panel title="Invoice register" subtitle="Invoices are created from posted delivery challans. Drafts do not affect customer due until approval.">
            <TableFrame><table className="min-w-[1050px] w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Delivery reference</th><th className="px-4 py-3 text-right">Value</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleInvoices.map((invoice) => <tr key={invoice.id}><td className="px-4 py-3"><strong>{invoice.invoiceNumber}</strong><small className="block text-slate-500">{invoice.date}</small></td><td className="px-4 py-3 font-semibold">{invoice.customerName}</td><td className="px-4 py-3 text-slate-600">{invoice.deliveryIds.map((id) => deliveries.find((delivery) => delivery.id === id)?.challanNumber ?? id).join(", ")}</td><td className="px-4 py-3 text-right font-bold">{formatCurrency(invoice.total)}</td><td className="px-4 py-3"><StatusBadge status={invoice.status} /></td><td className="px-4 py-3"><div className="flex justify-end gap-1">{invoice.orderId ? <Button variant="ghost" icon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate(`/app/sales/orders/${invoice.orderId}`)}>Open Order</Button> : null}{canViewCustomers ? <Button variant="ghost" icon={<BookOpenText className="h-4 w-4" />} onClick={() => setLedgerCustomer(customers.find((customer) => customer.id === invoice.customerId))} title="Customer Ledger" aria-label="Customer Ledger" /> : null}{canPrint ? <Button variant="ghost" icon={<Printer className="h-4 w-4" />} onClick={() => navigate("/app/print/invoice/" + invoice.id)} title="Print invoice" aria-label="Print invoice" /> : null}{canApproveInvoice && invoice.status === "Draft" ? <Button variant="ghost" icon={<CheckCircle2 className="h-4 w-4 text-emerald-700" />} onClick={() => action.mutate({ run: () => salesService.approveInvoice(invoice.id), success: "Invoice approved and receivable posted" })}>Approve</Button> : null}{canApproveInvoice && invoice.status === "Approved" ? <Button variant="ghost" onClick={() => { setSelectedInvoice(invoice); setModal("cancel-invoice"); }}>Cancel</Button> : null}</div></td></tr>)}</tbody></table></TableFrame>
          </Panel>
        </>
      ) : null}

      {view === "deliveries" ? (
        <Panel title="Delivery challans" subtitle="Actual batch selection posts stock-out movements; a newer batch triggers a controlled FIFO warning.">
          <TableFrame>
            <table className="min-w-[1120px] w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Challan</th><th className="px-4 py-3">Order / Customer</th><th className="px-4 py-3">Products & Batches</th><th className="px-4 py-3">Receiver</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleDeliveries.map((delivery) => { const linkedInvoice = invoices.find((invoice) => invoice.deliveryIds.includes(delivery.id) && invoice.status !== "Cancelled"); return <tr key={delivery.id}><td className="px-4 py-3"><strong>{delivery.challanNumber}</strong><small className="block text-slate-500">{delivery.date}</small></td><td className="px-4 py-3"><button type="button" className="block font-semibold text-blue-900 hover:underline" onClick={() => navigate(`/app/sales/orders/${delivery.orderId}`)}>{orders.find((order) => order.id === delivery.orderId)?.orderNumber ?? delivery.orderId}</button><small className="text-slate-500">{delivery.customerName}</small></td><td className="px-4 py-3">{delivery.lines.map((line) => <span className="mb-1 block text-xs" key={line.id}>{line.productCode} · {formatNumber(line.quantity)} · <b>{line.batchNumber}</b></span>)}</td><td className="px-4 py-3 text-slate-600">{delivery.receiverName ?? "-"}</td><td className="px-4 py-3"><StatusBadge status={delivery.status} />{linkedInvoice ? <small className="mt-1 block text-blue-700">{linkedInvoice.invoiceNumber}</small> : null}{delivery.overrideReason ? <small className="mt-1 block max-w-48 text-amber-700">Override: {delivery.overrideReason}</small> : null}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" icon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate(`/app/sales/orders/${delivery.orderId}`)}>Open Order</Button>{canPrint ? <Button variant="ghost" icon={<Printer className="h-4 w-4" />} onClick={() => navigate("/app/print/challan/" + delivery.id)} aria-label="Print challan" title="Print challan" /> : null}{canCreateQuote && !linkedInvoice ? <Button variant="ghost" icon={<ReceiptText className="h-4 w-4 text-blue-700" />} onClick={() => { setInvoiceDeliveryIds([delivery.id]); setModal("invoice"); }}>Create Invoice</Button> : null}</div></td></tr>; })}</tbody></table>
          </TableFrame>
        </Panel>
      ) : null}

      {view === "collections" ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <Panel title="Collection register" subtitle="Posting updates customer due and the selected cash or bank ledger.">
            <TableFrame>
              <table className="min-w-[950px] w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Receipt</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Mode / Reference</th><th className="px-4 py-3">Invoice / Order</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Print</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleCollections.map((collection) => <tr key={collection.id}><td className="px-4 py-3"><strong>{collection.receiptNumber}</strong><StatusBadge status={collection.status} /><small className="block text-slate-500">{collection.date}</small></td><td className="px-4 py-3 font-semibold">{collection.customerName}</td><td className="px-4 py-3 text-slate-600">{collection.paymentMode}<small className="block">{collection.referenceNumber ?? "-"}</small></td><td className="px-4 py-3 text-slate-600">{invoices.find((invoice) => invoice.id === collection.invoiceId)?.invoiceNumber ?? orders.find((order) => order.id === collection.orderId)?.orderNumber ?? "Customer ledger"}</td><td className="px-4 py-3 text-right font-bold text-emerald-700">{formatCurrency(collection.amount)}</td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-1">{(collection.orderId || invoices.find((invoice) => invoice.id === collection.invoiceId)?.orderId) ? <Button variant="ghost" icon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate(`/app/sales/orders/${collection.orderId ?? invoices.find((invoice) => invoice.id === collection.invoiceId)?.orderId}`)}>Open Order</Button> : null}{canViewCustomers ? <Button variant="ghost" icon={<BookOpenText className="h-4 w-4" />} onClick={() => setLedgerCustomer(customers.find((customer) => customer.id === collection.customerId))} title="Customer Ledger" aria-label="Customer Ledger" /> : null}{foundationMode && hasEffectivePermission(session?.user, "accounts", "post") && collection.status === "Posted" ? <Button variant="ghost" icon={<RotateCcw className="h-4 w-4 text-red-700" />} title="Reverse receipt" aria-label={`Reverse ${collection.receiptNumber}`} onClick={() => { setReversingCollection(collection); setModal("reverse-collection"); }} /> : null}{canPrint ? <Button variant="ghost" icon={<Printer className="h-4 w-4" />} onClick={() => navigate("/app/print/receipt/" + collection.id)} aria-label="Print receipt" title="Print receipt" /> : null}</div></td></tr>)}</tbody></table>
            </TableFrame>
          </Panel>
          <Panel title="Due concentration" subtitle="Largest visible balances">
            <div className="divide-y divide-slate-100">{[...customers].sort((a, b) => Number(b.currentDue) - Number(a.currentDue)).slice(0, 6).map((customer) => <div className="px-4 py-3" key={customer.id}><div className="flex items-center justify-between gap-3"><strong className="min-w-0 truncate text-sm">{customer.name}</strong><span className="shrink-0 text-sm font-bold text-red-700">{formatCurrency(customer.currentDue)}</span></div><div className="mt-2 h-1.5 rounded bg-slate-100"><span className="block h-full rounded bg-red-500" style={{ width: Math.min(100, Number(customer.currentDue) / Math.max(1, Number(totalDue)) * 300) + "%" }} /></div></div>)}</div>
          </Panel>
        </div>
      ) : null}

      {ledgerCustomer ? <Modal open title={`${ledgerCustomer.name} · Transaction Ledger`} subtitle="Approved invoices, collections and running due are generated from connected records; delivery value remains operational context." onClose={() => setLedgerCustomer(undefined)} width="max-w-6xl">{ledgerQuery.isLoading ? <LoadingBlock label="Building customer ledger" /> : ledgerQuery.isError || !ledgerQuery.data ? <ErrorBlock error={ledgerQuery.error} /> : <div className="grid gap-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><div className="rounded-md border border-slate-200 p-3"><span className="text-xs text-slate-500">Current Due</span><strong className="mt-1 block text-xl text-rose-700">{formatCurrency(ledgerQuery.data.currentDue)}</strong></div><div className="rounded-md border border-slate-200 p-3"><span className="text-xs text-slate-500">Invoiced Sales</span><strong className="mt-1 block text-xl">{formatCurrency(ledgerQuery.data.invoicedSales)}</strong></div><div className="rounded-md border border-slate-200 p-3"><span className="text-xs text-slate-500">Delivered Value</span><strong className="mt-1 block text-xl">{formatCurrency(ledgerQuery.data.deliveredSales)}</strong></div><div className="rounded-md border border-slate-200 p-3"><span className="text-xs text-slate-500">Collections</span><strong className="mt-1 block text-xl text-emerald-700">{formatCurrency(ledgerQuery.data.collected)}</strong></div><div className="rounded-md border border-slate-200 p-3"><span className="text-xs text-slate-500">Terms</span><strong className="mt-1 block text-sm">{ledgerQuery.data.customer.paymentTerms}</strong><small className="text-slate-500">{ledgerQuery.data.customer.phone}</small></div></div><div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"><BookOpenText className="mr-2 inline h-4 w-4 text-cyan-700" />{ledgerQuery.data.customer.address} · Assigned territory {ledgerQuery.data.customer.territory}</div><TableFrame><table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2 text-right">Debit / Sale</th><th className="px-3 py-2 text-right">Credit / Collection</th><th className="px-3 py-2 text-right">Running Due</th><th className="px-3 py-2">Remarks</th></tr></thead><tbody className="divide-y divide-slate-100">{ledgerQuery.data.entries.map((entry) => <tr key={entry.id}><td className="px-3 py-3 text-slate-600">{entry.date}</td><td className="px-3 py-3"><StatusBadge status={entry.type} /></td><td className="px-3 py-3 font-semibold">{entry.reference}</td><td className="px-3 py-3 text-right">{Number(entry.debit) ? formatCurrency(entry.debit) : "-"}</td><td className="px-3 py-3 text-right text-emerald-700">{Number(entry.credit) ? formatCurrency(entry.credit) : "-"}</td><td className="px-3 py-3 text-right font-bold text-rose-700">{formatCurrency(entry.runningDue)}</td><td className="max-w-72 px-3 py-3 text-slate-600">{entry.remarks}</td></tr>)}</tbody></table></TableFrame></div>}</Modal> : null}
      {modal === "customer" ? <Modal open title={editingCustomer ? "Edit customer" : "Add customer"} subtitle="Each customer has one profile and one running sales and collection ledger." onClose={() => { setModal(null); setEditingCustomer(undefined); }}><CustomerForm customer={editingCustomer} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => editingCustomer ? salesService.updateCustomer(editingCustomer.id, payload) : salesService.createCustomer(payload), success: editingCustomer ? "Customer updated" : "Customer created" })} /></Modal> : null}
      {modal === "reverse-collection" && reversingCollection ? <Modal open title={`Reverse ${reversingCollection.receiptNumber}`} onClose={() => setModal(null)}><CancelInvoiceForm submitLabel="Reverse Receipt" busy={action.isPending} onSubmit={(reason) => action.mutate({ run: () => salesService.reverseCollection(reversingCollection.id, reason), success: "Receipt reversed; customer and bank journals reconciled" })} /></Modal> : null}
      {modal === "quotation" ? <Modal open title={editingQuotation ? "Edit quotation" : "New quotation"} subtitle="Choose product variants; conversion carries every line into the sales order." onClose={() => { setModal(null); setEditingQuotation(undefined); setQuotationContext(undefined); }} width="max-w-5xl"><QuotationForm quotation={editingQuotation} initialCustomerId={quotationContext?.customerId} leadId={quotationContext?.leadId} customers={customers} products={products} canViewProfit={hasCapability(session?.user, "view_profit")} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => editingQuotation ? salesService.updateQuotation(editingQuotation.id, payload) : salesService.createQuotation(payload), success: editingQuotation ? "Quotation updated" : "Quotation created" })} /></Modal> : null}
      {modal === "order-details" && orderDetails ? <Modal open title={`${orderDetails.orderNumber} · Order Receiving Details`} subtitle="These optional fields feed the supplied Order Receiving Sheet without cluttering the core quotation flow." onClose={() => { setModal(null); setOrderDetails(undefined); }} width="max-w-4xl"><OrderReceivingDetailsForm order={orderDetails} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => salesService.updateOrder(orderDetails.id, payload), success: "Order receiving details updated" })} /></Modal> : null}
      {modal === "convert" && converting ? <Modal open title={"Convert " + converting.quotationNumber + " to order"} subtitle="Products, quantities, prices, discount and customer carry forward without re-entry." onClose={() => { setModal(null); setConverting(undefined); }}><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); action.mutate({ run: () => salesService.convertQuotation(converting.id, deliveryInstruction, converting.version), success: "Quotation converted to sales order" }); }}><div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><strong>{converting.lines.length} product lines · {formatCurrency(converting.total)}</strong><p className="mt-1">The original quotation becomes locked and linked to the new order.</p></div><label><span className={labelClass}>Delivery Instruction</span><textarea className={textareaClass} required value={deliveryInstruction} onChange={(event) => setDeliveryInstruction(event.target.value)} /></label><div className="flex justify-end"><Button type="submit" variant="primary" icon={<ArrowRight className="h-4 w-4" />} disabled={action.isPending || !deliveryInstruction.trim()}>Create Sales Order</Button></div></form></Modal> : null}
      {modal === "delivery" ? <Modal open title="Create delivery challan" subtitle="Choose actual batches. The API validates FIFO and posts stock-out only after confirmation." onClose={() => setModal(null)} width="max-w-5xl"><DeliveryForm orders={orders} deliveries={deliveries} batches={batchesQuery.data ?? []} canOverride={hasCapability(session?.user, "approve_stock_override")} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => salesService.createDelivery(payload), success: "Delivery posted and stock reduced" })} /></Modal> : null}
      {modal === "collection" ? <Modal open title="Post customer collection" subtitle="Link the receipt to an approved invoice when available; the payment credits customer due and the selected cash or bank account." onClose={() => { setModal(null); setCollectionCustomerId(undefined); }}><CollectionForm initialCustomerId={collectionCustomerId} customers={customers} orders={orders} invoices={invoices} collections={collections} accounts={accountsQuery.data ?? []} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => salesService.createCollection(payload), success: "Collection posted and dues updated" })} /></Modal> : null}
      {modal === "invoice" ? <Modal open title="Create sales invoice" subtitle="Only posted delivery challans are included. Approval posts the receivable." onClose={() => setModal(null)}><InvoiceForm deliveries={deliveries} invoices={invoices} orders={orders} initialDeliveryIds={invoiceDeliveryIds} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => salesService.createInvoice(payload), success: "Draft invoice created" })} /></Modal> : null}
      {modal === "cancel-invoice" && selectedInvoice ? <Modal open title={`Cancel ${selectedInvoice.invoiceNumber}`} subtitle="Cancellation reverses the receivable and requires an auditable reason." onClose={() => setModal(null)}><CancelInvoiceForm busy={action.isPending} onSubmit={(reason) => action.mutate({ run: () => salesService.cancelInvoice(selectedInvoice.id, reason), success: "Invoice cancelled and receivable reversed" })} /></Modal> : null}

      <ConfirmDialog open={Boolean(deleteTarget)} title={"Delete " + (deleteTarget?.type ?? "record") + "?"} message={(deleteTarget?.label ?? "") + " can be removed only when no protected transaction history exists."} confirmLabel="Delete" onCancel={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && action.mutate({ run: () => deleteTarget.type === "customer" ? salesService.removeCustomer(deleteTarget.id) : salesService.removeQuotation(deleteTarget.id), success: "Draft record removed" })} />
    </>
  );
}
