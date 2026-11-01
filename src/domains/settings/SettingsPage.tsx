import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  Building2,
  CheckCircle2,
  Database,
  ExternalLink,
  FileQuestion,
  Gauge,
  Image as ImageIcon,
  Link2,
  PackagePlus,
  Pencil,
  Plus,
  Printer,
  Ruler,
  Save,
  Tags,
  Trash2,
  Warehouse
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { businessDate } from "../../lib/date";
import { useToastStore } from "../../lib/ui/toast";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { useAuthStore } from "../../lib/auth/session";
import { formatCurrency, formatNumber } from "../../utils/format";
import {
  ErrorBlock,
  LoadingBlock,
  Modal,
  Panel,
  ProductThumb,
  Segmented,
  TableFrame,
  inputClass,
  labelClass,
  textareaClass
} from "../components";
import type {
  AllocationMethod,
  BusinessDecision,
  CashBankAccount,
  CostPreset,
  Customer,
  CustomerOpeningBalance,
  MarketingScoreRule,
  PrintConfiguration,
  PrintIdentity,
  Product,
  ProductAlias,
  StockBatch,
  Supplier,
  WarehouseConfig
} from "../erp.types";
import { accountsService, inventoryService, marketingService, salesService, settingsService } from "../services";
import WebsiteContentWorkspace from "./WebsiteContentWorkspace";

type View = "decisions" | "products" | "suppliers" | "business" | "migration" | "website";
type ModalType = "decision" | "product" | "alias" | "supplier" | "account" | "warehouse" | "preset" | "print" | "category" | "opening" | "customer-opening" | null;
type Task = { run: () => Promise<unknown>; success: string };
type DeleteTarget = { type: "product" | "supplier" | "account" | "preset" | "alias"; id: string; label: string };

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("view") as View | null;
  const [view, setViewState] = useState<View>(requested ?? "decisions");
  const [modal, setModal] = useState<ModalType>(null);
  const [editingDecision, setEditingDecision] = useState<BusinessDecision>();
  const [editingProduct, setEditingProduct] = useState<Product>();
  const [editingSupplier, setEditingSupplier] = useState<Supplier>();
  const [editingAccount, setEditingAccount] = useState<CashBankAccount>();
  const [editingPreset, setEditingPreset] = useState<CostPreset>();
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>();
  const actor = useAuthStore((state) => state.session?.user);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

  const viewAccess = useMemo<Record<View, boolean>>(() => ({
    decisions: hasEffectivePermission(actor, "settings", "view"),
    products: hasEffectivePermission(actor, "products", "view"),
    suppliers: hasEffectivePermission(actor, "suppliers", "view"),
    business: hasEffectivePermission(actor, "settings", "view"),
    migration: hasEffectivePermission(actor, "settings", "view"),
    website: actor?.role === "Super Admin"
  }), [actor]);
  const allowedViews = useMemo(() => (Object.keys(viewAccess) as View[]).filter((key) => viewAccess[key]), [viewAccess]);
  const settingsSubtitle = view === "website"
    ? "Publish the corporate homepage, public product catalogue, documents, resources and business inquiry queue without exposing ERP stock or cost data."
    : viewAccess.decisions
    ? "Master records, company setup, migration tools and client decisions stay here. Employee management belongs in Employees."
      : "Only the product and supplier master records assigned to this account are available here.";

  useEffect(() => {
    if (allowedViews.length && !viewAccess[view]) {
      const next = allowedViews[0];
      setViewState(next);
      setParams(next === "decisions" ? {} : { view: next }, { replace: true });
    }
  }, [allowedViews, setParams, view, viewAccess]);

  const decisionsQuery = useQuery({ queryKey: ["settings", "decisions"], queryFn: settingsService.decisions, enabled: view === "decisions" && viewAccess.decisions });
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: settingsService.products, enabled: (view === "products" || view === "migration") && (viewAccess.products || viewAccess.migration) });
  const aliasesQuery = useQuery({ queryKey: ["settings", "product-aliases"], queryFn: settingsService.productAliases, enabled: view === "products" && viewAccess.products });
  const suppliersQuery = useQuery({ queryKey: ["suppliers"], queryFn: settingsService.suppliers, enabled: view === "suppliers" && viewAccess.suppliers });
  const accountsQuery = useQuery({ queryKey: ["settings", "accounts"], queryFn: settingsService.accounts, enabled: view === "business" && viewAccess.business });
  const warehouseQuery = useQuery({ queryKey: ["settings", "warehouse"], queryFn: settingsService.warehouse, enabled: (view === "business" || view === "migration") && (viewAccess.business || viewAccess.migration) });
  const presetsQuery = useQuery({ queryKey: ["settings", "cost-presets"], queryFn: settingsService.costPresets, enabled: view === "business" && viewAccess.business });
  const printQuery = useQuery({ queryKey: ["settings", "print"], queryFn: settingsService.printConfiguration, enabled: view === "business" && viewAccess.business });
  const categoriesQuery = useQuery({ queryKey: ["accounts", "categories"], queryFn: accountsService.categories, enabled: view === "business" && viewAccess.business });
  const scoreRulesQuery = useQuery({ queryKey: ["marketing", "score-rules"], queryFn: marketingService.scoreRules, enabled: view === "business" && actor?.role === "Super Admin" });
  const batchesQuery = useQuery({ queryKey: ["inventory", "batches"], queryFn: inventoryService.batches, enabled: view === "migration" && viewAccess.migration });
  const customersQuery = useQuery({ queryKey: ["customers"], queryFn: salesService.customers, enabled: view === "migration" && viewAccess.migration });
  const customerOpeningsQuery = useQuery({ queryKey: ["settings", "customer-opening-balances"], queryFn: settingsService.customerOpeningBalances, enabled: view === "migration" && viewAccess.migration });
  const queries = view === "decisions" ? [decisionsQuery] : view === "products" ? [productsQuery, aliasesQuery] : view === "suppliers" ? [suppliersQuery] : view === "business" ? [accountsQuery, warehouseQuery, presetsQuery, printQuery, categoriesQuery, ...(actor?.role === "Super Admin" ? [scoreRulesQuery] : [])] : view === "migration" ? [productsQuery, warehouseQuery, batchesQuery, customersQuery, customerOpeningsQuery] : [];

  const closeEditor = () => {
    setModal(null);
    setEditingDecision(undefined);
    setEditingProduct(undefined);
    setEditingSupplier(undefined);
    setEditingAccount(undefined);
    setEditingPreset(undefined);
  };
  const action = useMutation({
    mutationFn: (task: Task) => task.run(),
    onSuccess: (_data, task) => {
      pushToast({ kind: "success", title: task.success });
      closeEditor();
      setDeleteTarget(undefined);
      void queryClient.invalidateQueries();
    },
    onError: (error) => pushToast({ kind: "error", title: "Could not save change", message: error instanceof Error ? error.message : "Unexpected API error." })
  });

  const setView = (next: View) => {
    setViewState(next);
    setParams(next === "decisions" ? {} : { view: next }, { replace: true });
  };

  if (!viewAccess[view]) return <LoadingBlock label="Opening permitted settings" />;
  if (queries.some((query) => query.isLoading)) return <LoadingBlock label="Loading business settings" />;
  const error = queries.find((query) => query.isError)?.error;
  if (error) return <ErrorBlock error={error} onRetry={() => queries.forEach((query) => void query.refetch())} />;

  const decisions = decisionsQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const aliases = aliasesQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
  const presets = presetsQuery.data ?? [];
  const warehouse = warehouseQuery.data!;
  const printConfiguration = printQuery.data!;
  const categories = categoriesQuery.data ?? [];
  const scoreRules = scoreRulesQuery.data ?? [];
  const openingBatches = (batchesQuery.data ?? []).filter((batch) => batch.sourceType === "Opening Stock");
  const customers = customersQuery.data ?? [];
  const customerOpenings = customerOpeningsQuery.data ?? [];

  const deleteRun = (target: DeleteTarget) => {
    if (target.type === "product") return settingsService.removeProduct(target.id);
    if (target.type === "supplier") return settingsService.removeSupplier(target.id);
    if (target.type === "account") return settingsService.removeAccount(target.id);
    if (target.type === "alias") return settingsService.removeProductAlias(target.id);
    return settingsService.removeCostPreset(target.id);
  };

  return (
    <>
      <PageHeader
        eyebrow="Controlled administration"
        title="Settings"
        subtitle={settingsSubtitle}
        actions={
          view === "products" && hasEffectivePermission(actor, "products", "create") ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setModal("product")}>New Product</Button> :
          view === "suppliers" && hasEffectivePermission(actor, "suppliers", "create") ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setModal("supplier")}>New Supplier</Button> :
          view === "migration" && hasEffectivePermission(actor, "settings", "create") ? <><Button icon={<Building2 className="h-4 w-4" />} onClick={() => setModal("customer-opening")}>Customer Balance</Button><Button variant="primary" icon={<Database className="h-4 w-4" />} onClick={() => setModal("opening")}>Opening Batch</Button></> : undefined
        }
      />

      <Segmented
        value={view}
        onChange={setView}
        ariaLabel="Settings groups"
        options={([
          { value: "decisions", label: "Confirmation Queue", count: decisions.filter((decision) => decision.status !== "Confirmed").length },
          { value: "products", label: "Products & Aliases", count: products.length },
          { value: "suppliers", label: "Suppliers", count: suppliers.length },
          { value: "business", label: "Business Setup" },
          { value: "migration", label: "Data Migration", count: openingBatches.length + customerOpenings.length },
          { value: "website", label: "Website Content" }
        ] as Array<{ value: View; label: string; count?: number }>).filter((option) => viewAccess[option.value])}
      />

      {view === "decisions" ? <DecisionQueue decisions={decisions} canEdit={hasEffectivePermission(actor, "settings", "edit")} onEdit={(decision) => { setEditingDecision(decision); setModal("decision"); }} /> : null}
      {view === "products" ? <ProductsWorkspace products={products} aliases={aliases} canCreate={hasEffectivePermission(actor, "products", "create")} canEdit={hasEffectivePermission(actor, "products", "edit")} canDelete={hasEffectivePermission(actor, "products", "delete")} onNewAlias={() => setModal("alias")} onEdit={(product) => { setEditingProduct(product); setModal("product"); }} onDelete={setDeleteTarget} /> : null}
      {view === "suppliers" ? <SuppliersTable suppliers={suppliers} canEdit={hasEffectivePermission(actor, "suppliers", "edit")} canDelete={hasEffectivePermission(actor, "suppliers", "delete")} onEdit={(supplier) => { setEditingSupplier(supplier); setModal("supplier"); }} onDelete={setDeleteTarget} /> : null}
      {view === "business" ? <BusinessSetup accounts={accounts} warehouse={warehouse} categories={categories} presets={presets} printConfiguration={printConfiguration} scoreRules={scoreRules} canCreate={hasEffectivePermission(actor, "settings", "create")} canEdit={hasEffectivePermission(actor, "settings", "edit")} canDelete={hasEffectivePermission(actor, "settings", "delete")} canEditScoreRules={actor?.role === "Super Admin"} busy={action.isPending} onModal={setModal} onEditAccount={(account) => { setEditingAccount(account); setModal("account"); }} onEditPreset={(preset) => { setEditingPreset(preset); setModal("preset"); }} onSaveScoreRule={(rule, payload) => action.mutate({ run: () => marketingService.updateScoreRule(rule.id, payload), success: `${rule.label} score rule updated` })} onDelete={setDeleteTarget} /> : null}
      {view === "migration" ? <MigrationWorkspace batches={openingBatches} customerOpenings={customerOpenings} canCreate={hasEffectivePermission(actor, "settings", "create")} onOpeningStock={() => setModal("opening")} onCustomerBalance={() => setModal("customer-opening")} /> : null}
      {view === "website" ? <WebsiteContentWorkspace /> : null}

      {modal === "decision" && editingDecision ? <Modal open title="Record client decision" subtitle="A confirmed item must store the answer, source and notes, not only a status flag." onClose={closeEditor}><DecisionForm decision={editingDecision} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => settingsService.updateDecision(editingDecision.id, payload), success: "Client decision recorded" })} /></Modal> : null}
      {modal === "product" ? <Modal open title={editingProduct ? "Edit product" : "Create product"} subtitle="Approved product variants prevent duplicate stock and sales records." onClose={closeEditor}><ProductForm product={editingProduct} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => editingProduct ? settingsService.updateProduct(editingProduct.id, payload) : settingsService.createProduct(payload), success: editingProduct ? "Product updated" : "Product created" })} /></Modal> : null}
      {modal === "alias" ? <Modal open title="Map legacy product name" subtitle="Map a spreadsheet spelling or historic item name to one approved product." onClose={closeEditor}><AliasForm products={products} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => settingsService.createProductAlias(payload), success: "Product alias mapped" })} /></Modal> : null}
      {modal === "supplier" ? <Modal open title={editingSupplier ? "Edit supplier" : "Create supplier"} onClose={closeEditor}><SupplierForm supplier={editingSupplier} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => editingSupplier ? settingsService.updateSupplier(editingSupplier.id, payload) : settingsService.createSupplier(payload), success: editingSupplier ? "Supplier updated" : "Supplier created" })} /></Modal> : null}
      {modal === "account" ? <Modal open title={editingAccount ? "Edit cash / bank account" : "Add cash / bank account"} subtitle="Posted transaction balances cannot be erased by deleting an account." onClose={closeEditor}><AccountForm account={editingAccount} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => editingAccount ? settingsService.updateAccount(editingAccount.id, payload) : settingsService.createAccount(payload), success: editingAccount ? "Account updated" : "Account created" })} /></Modal> : null}
      {modal === "warehouse" ? <Modal open title="Edit main warehouse" subtitle="Additional warehouses remain disabled until the client confirms scope." onClose={closeEditor}><WarehouseForm warehouse={warehouse} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => settingsService.updateWarehouse(payload), success: "Warehouse configuration updated" })} /></Modal> : null}
      {modal === "preset" ? <Modal open title={editingPreset ? "Edit cost preset" : "Add cost preset"} subtitle="Presets suggest a basis; unconfirmed common costs still require explicit choice." onClose={closeEditor}><PresetForm preset={editingPreset} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => editingPreset ? settingsService.updateCostPreset(editingPreset.id, payload) : settingsService.createCostPreset(payload), success: editingPreset ? "Cost preset updated" : "Cost preset created" })} /></Modal> : null}
      {modal === "print" ? <Modal open title="Stationery and A4 calibration" subtitle="Digital mode uses the supplied backgrounds; preprinted mode uses the same millimetre safe areas without printing artwork." onClose={closeEditor} width="max-w-4xl"><PrintForm configuration={printConfiguration} busy={action.isPending} onTest={() => window.open("/app/print/quotation/quo-1", "_blank", "noopener,noreferrer")} onSubmit={(payload) => action.mutate({ run: () => settingsService.updatePrintConfiguration(payload), success: "Print calibration updated" })} /></Modal> : null}
      {modal === "category" ? <Modal open title="Add expense category" subtitle="Dynamic categories appear immediately in daily expense entry and reports." onClose={closeEditor}><CategoryForm busy={action.isPending} onSubmit={(name) => action.mutate({ run: () => accountsService.createCategory(name), success: "Expense category added" })} /></Modal> : null}
      {modal === "opening" ? <Modal open title="Post opening stock batch" subtitle="Use this once for stock that existed before ERP. It joins the same FIFO and expiry sequence as import receipts." onClose={closeEditor} width="max-w-3xl"><OpeningStockForm products={products} warehouse={warehouse} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => settingsService.createOpeningStock(payload), success: "Opening stock batch posted" })} /></Modal> : null}
      {modal === "customer-opening" ? <Modal open title="Post customer opening balance" subtitle="Bring a legacy customer due into the connected running ledger at the cutover date." onClose={closeEditor} width="max-w-3xl"><CustomerOpeningForm customers={customers.filter((customer) => !customerOpenings.some((opening) => opening.customerId === customer.id))} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => settingsService.createCustomerOpeningBalance(payload), success: "Customer opening balance posted" })} /></Modal> : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.type ?? "record"}?`}
        message={`${deleteTarget?.label ?? "This record"} can be deleted only when it has no protected transaction references. Otherwise mark it inactive.`}
        confirmLabel="Delete"
        onCancel={() => setDeleteTarget(undefined)}
        onConfirm={() => deleteTarget && action.mutate({ run: () => deleteRun(deleteTarget), success: "Unused setup record deleted" })}
      />
    </>
  );
}

function DecisionQueue({ decisions, canEdit, onEdit }: { decisions: BusinessDecision[]; canEdit: boolean; onEdit: (decision: BusinessDecision) => void }) {
  return (
    <Panel title="Client confirmation queue" subtitle="Confirmed answers remain visible with their source. Pending decisions keep related automation disabled.">
      <div className="divide-y divide-slate-100">
        {decisions.map((decision) => (
          <article className="grid gap-4 p-4 lg:grid-cols-[1fr_220px]" key={decision.id}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><FileQuestion className="h-4 w-4 text-cyan-700" /><h3 className="font-bold text-slate-950">{decision.title}</h3><StatusBadge status={decision.status} /></div>
              <p className="mt-2 text-sm text-slate-700">{decision.question}</p>
              <p className="mt-2 rounded bg-slate-50 p-3 text-xs leading-5 text-slate-600"><b>Current behavior:</b> {decision.currentBehavior}</p>
              {decision.resolutionValue ? <p className="mt-2 text-sm text-emerald-800"><b>Recorded answer:</b> {decision.resolutionValue}{decision.resolutionNotes ? ` - ${decision.resolutionNotes}` : ""}</p> : null}
              {decision.sourceReference ? <p className="mt-1 text-xs text-slate-500"><b>Source:</b> {decision.sourceReference}</p> : null}
            </div>
            <div className="flex flex-col items-start justify-between gap-3 lg:items-end">
              <div className="flex flex-wrap gap-1">{decision.blocks.map((block) => <span className="rounded bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800" key={block}>{block}</span>)}</div>
              {canEdit ? <Button icon={decision.status === "Confirmed" ? <Pencil className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />} onClick={() => onEdit(decision)}>{decision.status === "Confirmed" ? "Review Decision" : "Record Answer"}</Button> : null}
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function ProductsWorkspace({ products, aliases, canCreate, canEdit, canDelete, onNewAlias, onEdit, onDelete }: { products: Product[]; aliases: ProductAlias[]; canCreate: boolean; canEdit: boolean; canDelete: boolean; onNewAlias: () => void; onEdit: (product: Product) => void; onDelete: (target: DeleteTarget) => void }) {
  return (
    <div className="grid gap-4">
      <Panel title="Product master" subtitle="Images, family and variant identify each medical item consistently across imports, stock and sales.">
        <TableFrame><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Family / Variant</th><th className="px-4 py-3">HS Code</th><th className="px-4 py-3 text-right">Standard Price</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{products.map((product) => <tr key={product.id}><td className="px-4 py-3"><div className="flex items-center gap-3"><ProductThumb src={product.imageUrl} name={product.name} /><div><strong className="block">{product.name}</strong><small className="text-cyan-700">{product.code}</small></div></div></td><td className="px-4 py-3 text-slate-600">{product.family}<small className="block">{product.variant}</small></td><td className="px-4 py-3 text-slate-600">{product.hsCode || "-"}</td><td className="px-4 py-3 text-right font-semibold">{formatCurrency(product.standardSalePrice)}</td><td className="px-4 py-3"><StatusBadge status={product.active ? "Active" : "Inactive"} /></td><td className="px-4 py-3 text-right">{canEdit ? <Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(product)} aria-label={`Edit ${product.name}`} /> : null}{canDelete ? <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => onDelete({ type: "product", id: product.id, label: product.name })} aria-label={`Delete ${product.name}`} /> : null}</td></tr>)}</tbody></table></TableFrame>
      </Panel>
      <Panel title="Legacy name mapping" subtitle="Spreadsheet spellings map to an approved variant so migration cannot create duplicate products." actions={canCreate ? <Button icon={<Link2 className="h-4 w-4" />} onClick={onNewAlias}>Map Alias</Button> : undefined}>
        <TableFrame><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Legacy / Alias Name</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Source</th><th className="px-4 py-3 text-right">Remove</th></tr></thead><tbody className="divide-y divide-slate-100">{aliases.map((alias) => <tr key={alias.id}><td className="px-4 py-3 font-semibold">{alias.aliasText}</td><td className="px-4 py-3 text-slate-600">{alias.productName}</td><td className="px-4 py-3 text-slate-500">{alias.source}</td><td className="px-4 py-3 text-right">{canDelete ? <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => onDelete({ type: "alias", id: alias.id, label: alias.aliasText })} aria-label={`Remove alias ${alias.aliasText}`} /> : null}</td></tr>)}{!aliases.length ? <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No legacy product aliases have been mapped.</td></tr> : null}</tbody></table></TableFrame>
      </Panel>
    </div>
  );
}

function SuppliersTable({ suppliers, canEdit, canDelete, onEdit, onDelete }: { suppliers: Supplier[]; canEdit: boolean; canDelete: boolean; onEdit: (supplier: Supplier) => void; onDelete: (target: DeleteTarget) => void }) {
  return (
    <Panel title="Supplier master" subtitle="Commercial contacts are reused by import drafts and shipment records.">
      <TableFrame><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Country</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Payment Terms</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{suppliers.map((supplier) => <tr key={supplier.id}><td className="px-4 py-3 font-semibold">{supplier.name}</td><td className="px-4 py-3 text-slate-600">{supplier.country}</td><td className="px-4 py-3 text-slate-600">{supplier.contactPerson}<small className="block">{supplier.email} | {supplier.phone}</small></td><td className="px-4 py-3 text-slate-600">{supplier.paymentTerms}</td><td className="px-4 py-3"><StatusBadge status={supplier.active ? "Active" : "Inactive"} /></td><td className="px-4 py-3 text-right">{canEdit ? <Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(supplier)} aria-label={`Edit ${supplier.name}`} /> : null}{canDelete ? <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => onDelete({ type: "supplier", id: supplier.id, label: supplier.name })} aria-label={`Delete ${supplier.name}`} /> : null}</td></tr>)}</tbody></table></TableFrame>
    </Panel>
  );
}

function BusinessSetup({ accounts, warehouse, categories, presets, printConfiguration, scoreRules, canCreate, canEdit, canDelete, canEditScoreRules, busy, onModal, onEditAccount, onEditPreset, onSaveScoreRule, onDelete }: { accounts: CashBankAccount[]; warehouse: WarehouseConfig; categories: { id: string; name: string; active: boolean }[]; presets: CostPreset[]; printConfiguration: PrintConfiguration; scoreRules: MarketingScoreRule[]; canCreate: boolean; canEdit: boolean; canDelete: boolean; canEditScoreRules: boolean; busy: boolean; onModal: (modal: ModalType) => void; onEditAccount: (account: CashBankAccount) => void; onEditPreset: (preset: CostPreset) => void; onSaveScoreRule: (rule: MarketingScoreRule, payload: Partial<MarketingScoreRule>) => void; onDelete: (target: DeleteTarget) => void }) {
  return (
    <div className="grid gap-4">
      <Panel title="Cash, bank and mobile accounts" subtitle="Collections and expenses must post to an active real account." actions={canCreate ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => onModal("account")}>Add Account</Button> : undefined}>
        <div className="divide-y divide-slate-100">{accounts.map((account) => <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center" key={account.id}><span className="grid h-10 w-10 place-items-center rounded bg-cyan-50 text-cyan-700"><Banknote className="h-5 w-5" /></span><div className="min-w-0 flex-1"><strong className="block">{account.name}</strong><span className="text-xs text-slate-500">{account.type} | {account.accountNumber || "No account number"}</span></div><strong>{formatCurrency(account.balance)}</strong><StatusBadge status={account.active ? "Active" : "Inactive"} /><div>{canEdit ? <Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => onEditAccount(account)} aria-label={`Edit ${account.name}`} /> : null}{canDelete ? <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => onDelete({ type: "account", id: account.id, label: account.name })} aria-label={`Delete ${account.name}`} /> : null}</div></div>)}</div>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Main warehouse" subtitle="One warehouse is active until the client confirms multi-warehouse operation." actions={canEdit ? <Button icon={<Pencil className="h-4 w-4" />} onClick={() => onModal("warehouse")}>Edit</Button> : undefined}><div className="flex gap-3 p-4"><Warehouse className="h-6 w-6 text-cyan-700" /><div><strong>{warehouse.name}</strong><p className="mt-1 text-sm text-slate-600">{warehouse.address}</p><p className="mt-2 text-xs text-slate-500">{warehouse.contactPerson} | {warehouse.phone}</p><div className="mt-3 flex flex-wrap gap-1">{warehouse.locations.map((location) => <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold" key={location}>{location}</span>)}</div></div></div></Panel>
        <Panel title="Expense categories" subtitle="Daily expenditure reports preserve the posted category name." actions={canCreate ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => onModal("category")}>Add</Button> : undefined}><div className="flex flex-wrap gap-2 p-4">{categories.map((category) => <span className="inline-flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm font-semibold" key={category.id}><Tags className="h-4 w-4 text-cyan-700" />{category.name}<StatusBadge status={category.active ? "Active" : "Inactive"} /></span>)}</div></Panel>
      </div>
      <Panel title="Import cost presets" subtitle="Local Transport defaults to confirmed CBM. Common-cost methods remain explicit until the client confirms a default." actions={canCreate ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => onModal("preset")}>Add Preset</Button> : undefined}>
        <TableFrame><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Preset</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Suggested Basis</th><th className="px-4 py-3">Explicit Choice</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{presets.map((preset) => <tr key={preset.id}><td className="px-4 py-3 font-semibold">{preset.name}</td><td className="px-4 py-3 text-slate-600">{preset.category}</td><td className="px-4 py-3">{preset.suggestedAllocationMethod?.replaceAll("_", " ") ?? "No suggestion"}</td><td className="px-4 py-3"><StatusBadge status={preset.requiresExplicitChoice ? "Pending" : "Confirmed"} /></td><td className="px-4 py-3 text-right">{canEdit ? <Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => onEditPreset(preset)} aria-label={`Edit ${preset.name}`} /> : null}{canDelete ? <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => onDelete({ type: "preset", id: preset.id, label: preset.name })} aria-label={`Delete ${preset.name}`} /> : null}</td></tr>)}</tbody></table></TableFrame>
      </Panel>
      {scoreRules.length ? <Panel title="Marketing activity score rules" subtitle="Points come from saved business activity. Manual notes cannot award transaction points.">
        <div className="divide-y divide-slate-100">{scoreRules.map((rule) => <ScoreRuleEditor rule={rule} canEdit={canEditScoreRules} busy={busy} onSave={(payload) => onSaveScoreRule(rule, payload)} key={rule.id} />)}</div>
      </Panel> : null}
      <Panel title="Supplied stationery and A4 calibration" subtitle="Quotation and order outputs use the real MIPRO / LED backgrounds with millimetre safe areas." actions={canEdit ? <Button icon={<Ruler className="h-4 w-4" />} onClick={() => onModal("print")}>Calibrate</Button> : undefined}>
        <div className="grid gap-4 p-4 md:grid-cols-2">{printConfiguration.identities.map((identity) => <div className="flex min-w-0 gap-3 border-b border-slate-100 pb-4 md:border-b-0" key={identity.id}><div className="h-28 w-20 shrink-0 overflow-hidden border border-slate-200 bg-slate-50">{identity.backgroundImageUrl ? <img className="h-full w-full object-cover object-top" src={identity.backgroundImageUrl} alt={`${identity.displayName} letterhead`} /> : <ImageIcon className="m-auto h-7 w-7 text-slate-300" />}</div><div className="min-w-0"><strong className="block">{identity.displayName}</strong><span className="block truncate text-xs text-slate-500">{identity.address}</span><span className="mt-2 block text-xs text-slate-600">Safe area: {identity.safeArea.topMm} / {identity.safeArea.rightMm} / {identity.safeArea.bottomMm} / {identity.safeArea.leftMm} mm</span>{printConfiguration.defaultIdentityId === identity.id ? <span className="mt-2 inline-block rounded bg-cyan-50 px-2 py-1 text-[10px] font-bold text-cyan-800">Default identity</span> : null}</div></div>)}</div>
      </Panel>
    </div>
  );
}

function ScoreRuleEditor({ rule, canEdit, busy, onSave }: { rule: MarketingScoreRule; canEdit: boolean; busy: boolean; onSave: (payload: Partial<MarketingScoreRule>) => void }) {
  const [points, setPoints] = useState(rule.points);
  const [active, setActive] = useState(rule.active);
  useEffect(() => { setPoints(rule.points); setActive(rule.active); }, [rule]);
  const changed = points !== rule.points || active !== rule.active;
  return <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_110px_120px_auto] sm:items-end"><div className="flex min-w-0 items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-cyan-50 text-cyan-800"><Gauge className="h-4 w-4" /></span><div className="min-w-0"><strong className="block text-sm">{rule.label}</strong><span className="block text-xs text-slate-500">{rule.event.replaceAll("_", " ")} | saved business event</span></div></div><label><span className={labelClass}>Points</span><input className={inputClass} type="number" min="0" max="100" step="1" disabled={!canEdit} value={points} onChange={(event) => setPoints(Number(event.target.value))} /></label><label className="flex min-h-10 items-center gap-2 text-sm font-semibold"><input type="checkbox" disabled={!canEdit} checked={active} onChange={(event) => setActive(event.target.checked)} /> Active</label><Button icon={<Save className="h-4 w-4" />} disabled={!canEdit || busy || !changed || !Number.isInteger(points) || points < 0 || points > 100} onClick={() => onSave({ points, active })}>Save</Button></div>;
}

function MigrationWorkspace({ batches, customerOpenings, canCreate, onOpeningStock, onCustomerBalance }: { batches: StockBatch[]; customerOpenings: CustomerOpeningBalance[]; canCreate: boolean; onOpeningStock: () => void; onCustomerBalance: () => void }) {
  return (
    <div className="grid gap-4">
      <Panel title="Opening stock / legacy batches" subtitle="Historical batches participate in FIFO before newer matching import receipts. Expired batches remain visible but are never dispatched." actions={canCreate ? <Button icon={<Database className="h-4 w-4" />} onClick={onOpeningStock}>Post Batch</Button> : undefined}>
        <TableFrame><table className="w-full min-w-[1040px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Lot / Batch</th><th className="px-4 py-3">Historic Receipt</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Expiry</th><th className="px-4 py-3">Location</th><th className="px-4 py-3 text-right">Available</th><th className="px-4 py-3 text-right">Landed / Unit</th></tr></thead><tbody className="divide-y divide-slate-100">{batches.map((batch) => <tr key={batch.id}><td className="px-4 py-3"><strong className="block">{batch.productName}</strong><small className="text-cyan-700">{batch.productCode}</small></td><td className="px-4 py-3">{batch.lotNumber}<small className="block text-slate-500">{batch.batchNumber}</small></td><td className="px-4 py-3 text-slate-600">{batch.receivedDate}</td><td className="px-4 py-3 text-slate-600">{batch.sourceReference}</td><td className="px-4 py-3">{batch.expiryDate}<small className="mt-1 block"><StatusBadge status={batch.expiryStatus} /></small></td><td className="px-4 py-3 text-slate-600">{batch.warehouse}<small className="block">{batch.location}</small></td><td className="px-4 py-3 text-right font-bold">{formatNumber(batch.quantityAvailable)}</td><td className="px-4 py-3 text-right font-semibold">{batch.landedCostPerUnit ? formatCurrency(batch.landedCostPerUnit) : "Not entered"}</td></tr>)}{!batches.length ? <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">No legacy batches have been posted yet.</td></tr> : null}</tbody></table></TableFrame>
      </Panel>
      <Panel title="Customer opening balances" subtitle="Legacy dues become the first entry in the customer's running ledger; later deliveries and collections continue from it." actions={canCreate ? <Button icon={<Building2 className="h-4 w-4" />} onClick={onCustomerBalance}>Post Balance</Button> : undefined}>
        <TableFrame><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Cutover Date</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3 text-right">Historical Sales</th><th className="px-4 py-3 text-right">Collected</th><th className="px-4 py-3 text-right">Opening Due</th><th className="px-4 py-3">Posted By</th></tr></thead><tbody className="divide-y divide-slate-100">{customerOpenings.map((opening) => <tr key={opening.id}><td className="px-4 py-3 text-slate-600">{opening.date}</td><td className="px-4 py-3 font-semibold">{opening.customerName}</td><td className="px-4 py-3 text-slate-600">{opening.reference}<small className="block max-w-64 truncate">{opening.remarks}</small></td><td className="px-4 py-3 text-right">{formatCurrency(opening.historicalSales)}</td><td className="px-4 py-3 text-right text-emerald-700">{formatCurrency(opening.historicalCollected)}</td><td className="px-4 py-3 text-right font-bold text-rose-700">{formatCurrency(opening.openingDue)}</td><td className="px-4 py-3 text-slate-500">{opening.createdBy}</td></tr>)}{!customerOpenings.length ? <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No customer opening balances have been posted in this session.</td></tr> : null}</tbody></table></TableFrame>
      </Panel>
    </div>
  );
}

function DecisionForm({ decision, busy, onSubmit }: { decision: BusinessDecision; busy: boolean; onSubmit: (payload: Partial<BusinessDecision>) => void }) {
  const [form, setForm] = useState({ status: decision.status, resolutionValue: decision.resolutionValue ?? "", resolutionNotes: decision.resolutionNotes ?? "", sourceReference: decision.sourceReference ?? "" });
  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}><label><span className={labelClass}>Decision Status</span><select className={inputClass} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as BusinessDecision["status"] }))}><option>Pending Client Confirmation</option><option>Confirmed</option></select></label><label><span className={labelClass}>Resolution / Confirmed Answer</span><input className={inputClass} required={form.status === "Confirmed"} value={form.resolutionValue} onChange={(event) => setForm((current) => ({ ...current, resolutionValue: event.target.value }))} placeholder="e.g. CBM, Optional invoice, One warehouse" /></label><label><span className={labelClass}>Resolution Notes</span><textarea className={textareaClass} value={form.resolutionNotes} onChange={(event) => setForm((current) => ({ ...current, resolutionNotes: event.target.value }))} /></label><label><span className={labelClass}>Source Reference</span><input className={inputClass} value={form.sourceReference} onChange={(event) => setForm((current) => ({ ...current, sourceReference: event.target.value }))} placeholder="Meeting date, email or requirement file" /></label><div className="flex justify-end"><Button type="submit" variant="primary" icon={<CheckCircle2 className="h-4 w-4" />} disabled={busy || (form.status === "Confirmed" && !form.resolutionValue.trim())}>Save Decision</Button></div></form>;
}

function ProductForm({ product, busy, onSubmit }: { product?: Product; busy: boolean; onSubmit: (payload: Partial<Product>) => void }) {
  const [form, setForm] = useState({ code: product?.code ?? "", family: product?.family ?? "", variant: product?.variant ?? "", name: product?.name ?? "", unit: product?.unit ?? "pcs", hsCode: product?.hsCode ?? "", imageUrl: product?.imageUrl ?? "", standardSalePrice: product?.standardSalePrice ?? "", active: product?.active ?? true });
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}><div className="flex items-center gap-3 rounded-md bg-slate-50 p-3 sm:col-span-2"><ProductThumb src={form.imageUrl} name={form.name || "Product"} size="lg" /><span className="text-sm text-slate-500">This image appears in product selection, stock and sales.</span></div>{[["code", "Product Code"], ["family", "Family"], ["variant", "Variant"], ["name", "Product Name"], ["unit", "Unit"], ["hsCode", "HS Code"], ["standardSalePrice", "Standard Sale Price"], ["imageUrl", "Product Image URL"]].map(([key, label]) => <label className={key === "imageUrl" ? "sm:col-span-2" : ""} key={key}><span className={labelClass}>{label}</span><input className={inputClass} type={key === "standardSalePrice" ? "number" : "text"} required={key !== "hsCode"} value={String(form[key as keyof typeof form])} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} /></label>)}<label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> Active product</label><div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" icon={<PackagePlus className="h-4 w-4" />} disabled={busy}>Save Product</Button></div></form>;
}

function AliasForm({ products, busy, onSubmit }: { products: Product[]; busy: boolean; onSubmit: (payload: Partial<ProductAlias>) => void }) {
  const [form, setForm] = useState({ aliasText: "", productId: "", source: "Sales Ledger Item Mapping" });
  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}><label><span className={labelClass}>Legacy / Alias Name</span><input className={inputClass} required minLength={2} value={form.aliasText} onChange={(event) => setForm((current) => ({ ...current, aliasText: event.target.value }))} /></label><label><span className={labelClass}>Product</span><select className={inputClass} required value={form.productId} onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))}><option value="">Select product</option>{products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.code} - {product.name}</option>)}</select></label><label><span className={labelClass}>Source</span><input className={inputClass} required value={form.source} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))} /></label><div className="flex justify-end"><Button type="submit" variant="primary" icon={<Link2 className="h-4 w-4" />} disabled={busy}>Map Alias</Button></div></form>;
}

function SupplierForm({ supplier, busy, onSubmit }: { supplier?: Supplier; busy: boolean; onSubmit: (payload: Partial<Supplier>) => void }) {
  const [form, setForm] = useState({ name: supplier?.name ?? "", country: supplier?.country ?? "China", contactPerson: supplier?.contactPerson ?? "", phone: supplier?.phone ?? "", email: supplier?.email ?? "", paymentTerms: supplier?.paymentTerms ?? "", active: supplier?.active ?? true });
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>{[["name", "Supplier Name"], ["country", "Country"], ["contactPerson", "Contact Person"], ["phone", "Phone"], ["email", "Email"], ["paymentTerms", "Payment Terms"]].map(([key, label]) => <label key={key}><span className={labelClass}>{label}</span><input className={inputClass} type={key === "email" ? "email" : "text"} required value={String(form[key as keyof typeof form])} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} /></label>)}<label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> Active supplier</label><div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy}>Save Supplier</Button></div></form>;
}

function AccountForm({ account, busy, onSubmit }: { account?: CashBankAccount; busy: boolean; onSubmit: (payload: Partial<CashBankAccount>) => void }) {
  const [form, setForm] = useState({ name: account?.name ?? "", type: account?.type ?? "Bank", accountNumber: account?.accountNumber ?? "", balance: account?.balance ?? "0.00", active: account?.active ?? true });
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(form as Partial<CashBankAccount>); }}><label><span className={labelClass}>Account Name</span><input className={inputClass} required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label><label><span className={labelClass}>Type</span><select className={inputClass} value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as CashBankAccount["type"] }))}><option>Cash</option><option>Bank</option><option>Mobile Banking</option></select></label><label><span className={labelClass}>Account Number</span><input className={inputClass} value={form.accountNumber} onChange={(event) => setForm((current) => ({ ...current, accountNumber: event.target.value }))} /></label><label><span className={labelClass}>{account ? "Current Balance" : "Opening Balance"}</span><input className={inputClass} type="number" min="0" step="0.01" required value={form.balance} onChange={(event) => setForm((current) => ({ ...current, balance: event.target.value }))} /></label><label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> Active account</label><div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy}>Save Account</Button></div></form>;
}

function WarehouseForm({ warehouse, busy, onSubmit }: { warehouse: WarehouseConfig; busy: boolean; onSubmit: (payload: Partial<WarehouseConfig>) => void }) {
  const [form, setForm] = useState({ name: warehouse.name, address: warehouse.address, contactPerson: warehouse.contactPerson, phone: warehouse.phone, locations: warehouse.locations.join(", "), active: warehouse.active });
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit({ ...form, locations: form.locations.split(",").map((value) => value.trim()).filter(Boolean) }); }}><label className="sm:col-span-2"><span className={labelClass}>Warehouse Name</span><input className={inputClass} required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label><label className="sm:col-span-2"><span className={labelClass}>Address</span><textarea className={textareaClass} required value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} /></label><label><span className={labelClass}>Contact Person</span><input className={inputClass} required value={form.contactPerson} onChange={(event) => setForm((current) => ({ ...current, contactPerson: event.target.value }))} /></label><label><span className={labelClass}>Phone</span><input className={inputClass} required value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></label><label className="sm:col-span-2"><span className={labelClass}>Rack / BIN Locations (comma separated)</span><textarea className={textareaClass} value={form.locations} onChange={(event) => setForm((current) => ({ ...current, locations: event.target.value }))} /></label><div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" icon={<Warehouse className="h-4 w-4" />} disabled={busy}>Save Warehouse</Button></div></form>;
}

function PresetForm({ preset, busy, onSubmit }: { preset?: CostPreset; busy: boolean; onSubmit: (payload: Partial<CostPreset>) => void }) {
  const [form, setForm] = useState({ name: preset?.name ?? "", category: preset?.category ?? "", suggestedAllocationMethod: preset?.suggestedAllocationMethod ?? "" as AllocationMethod | "", requiresExplicitChoice: preset?.requiresExplicitChoice ?? true, active: preset?.active ?? true });
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit({ ...form, suggestedAllocationMethod: form.suggestedAllocationMethod || undefined }); }}><label><span className={labelClass}>Preset Name</span><input className={inputClass} required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label><label><span className={labelClass}>Category</span><input className={inputClass} required value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} /></label><label className="sm:col-span-2"><span className={labelClass}>Suggested Allocation</span><select className={inputClass} value={form.suggestedAllocationMethod} onChange={(event) => setForm((current) => ({ ...current, suggestedAllocationMethod: event.target.value as AllocationMethod | "" }))}><option value="">No suggestion</option><option value="CBM">CBM</option><option value="FOB_VALUE">FOB Value</option><option value="QUANTITY">Quantity</option><option value="PRODUCT_SPECIFIC">Product-specific</option><option value="MANUAL">Manual split</option></select></label><label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={form.requiresExplicitChoice} onChange={(event) => setForm((current) => ({ ...current, requiresExplicitChoice: event.target.checked }))} /> Require explicit method choice</label><label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> Active preset</label><div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy}>Save Cost Preset</Button></div></form>;
}

function PrintForm({ configuration, busy, onTest, onSubmit }: { configuration: PrintConfiguration; busy: boolean; onTest: () => void; onSubmit: (payload: Partial<PrintConfiguration>) => void }) {
  const [form, setForm] = useState(configuration);
  const updateIdentity = (index: number, key: Exclude<keyof PrintIdentity, "safeArea" | "id">, value: string) => setForm((current) => ({ ...current, identities: current.identities.map((identity, identityIndex) => identityIndex === index ? { ...identity, [key]: value } : identity) }));
  const updateSafeArea = (index: number, key: keyof PrintIdentity["safeArea"], value: number) => setForm((current) => ({ ...current, identities: current.identities.map((identity, identityIndex) => identityIndex === index ? { ...identity, safeArea: { ...identity.safeArea, [key]: value } } : identity) }));
  return <form className="grid gap-5" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}><div className="grid gap-4 sm:grid-cols-2"><label><span className={labelClass}>Default Identity</span><select className={inputClass} value={form.defaultIdentityId} onChange={(event) => setForm((current) => ({ ...current, defaultIdentityId: event.target.value as PrintIdentity["id"] }))}>{form.identities.map((identity) => <option value={identity.id} key={identity.id}>{identity.displayName}</option>)}</select></label><label><span className={labelClass}>Default Letterhead Mode</span><select className={inputClass} value={form.defaultLetterheadMode} onChange={(event) => setForm((current) => ({ ...current, defaultLetterheadMode: event.target.value as PrintConfiguration["defaultLetterheadMode"] }))}><option>Digital</option><option>Preprinted</option></select></label></div>{form.identities.map((identity, index) => <fieldset className="grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2" key={identity.id}><legend className="flex items-center gap-2 pr-3 text-sm font-bold text-blue-950"><Printer className="h-4 w-4 text-cyan-700" />{identity.displayName}</legend><div className="flex gap-3 rounded-md bg-slate-50 p-3 sm:col-span-2"><img className="h-36 w-24 border border-slate-200 object-cover object-top" src={identity.backgroundImageUrl} alt={`${identity.displayName} stationery`} /><div className="min-w-0 text-xs leading-5 text-slate-600"><b>Digital:</b> prints this supplied background.<br /><b>Preprinted:</b> suppresses the artwork and preserves the same content safe area.<br /><b>Page:</b> A4 at 210 x 297 mm.</div></div>{(["displayName", "companyName", "address", "phone", "email", "website", "authorizedSignatory", "backgroundImageUrl"] as const).map((key) => <label className={["address", "backgroundImageUrl"].includes(key) ? "sm:col-span-2" : ""} key={key}><span className={labelClass}>{key.replace(/([A-Z])/g, " $1")}</span><input className={inputClass} value={identity[key]} onChange={(event) => updateIdentity(index, key, event.target.value)} /></label>)}<div className="sm:col-span-2"><span className={labelClass}>Content Safe Area (millimetres)</span><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(["topMm", "rightMm", "bottomMm", "leftMm"] as const).map((key) => <label key={key}><span className="mb-1 block text-xs capitalize text-slate-500">{key.replace("Mm", "")}</span><input className={inputClass} type="number" min="0" max="80" step="0.5" value={identity.safeArea[key]} onChange={(event) => updateSafeArea(index, key, Number(event.target.value))} /></label>)}</div></div></fieldset>)}<div className="flex flex-wrap justify-between gap-2"><Button type="button" icon={<ExternalLink className="h-4 w-4" />} onClick={onTest}>Open Calibration Preview</Button><Button type="submit" variant="primary" icon={<Ruler className="h-4 w-4" />} disabled={busy}>Save A4 Calibration</Button></div></form>;
}

function CategoryForm({ busy, onSubmit }: { busy: boolean; onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onSubmit(name); }}><label><span className={labelClass}>Category Name</span><input className={inputClass} required minLength={2} value={name} onChange={(event) => setName(event.target.value)} /></label><div className="flex justify-end"><Button type="submit" variant="primary" icon={<Plus className="h-4 w-4" />} disabled={busy}>Add Category</Button></div></form>;
}

function OpeningStockForm({ products, warehouse, busy, onSubmit }: { products: Product[]; warehouse: WarehouseConfig; busy: boolean; onSubmit: (payload: Record<string, unknown>) => void }) {
  const today = businessDate();
  const [form, setForm] = useState({ productId: "", quantity: "", lotNumber: "", batchNumber: "", manufacturingDate: "", expiryDate: "", receivedDate: today, sourceReference: "", warehouse: warehouse.name, location: warehouse.locations[0] ?? "", landedCostPerUnit: "" });
  const change = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(event) => { event.preventDefault(); onSubmit({ ...form, landedCostPerUnit: form.landedCostPerUnit || "0" }); }}><label className="sm:col-span-2 lg:col-span-3"><span className={labelClass}>Product / Variant</span><select className={inputClass} required value={form.productId} onChange={(event) => change("productId", event.target.value)}><option value="">Select product</option>{products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.code} - {product.name}</option>)}</select></label><label><span className={labelClass}>Opening Quantity</span><input className={inputClass} type="number" min="0.0001" step="0.0001" required value={form.quantity} onChange={(event) => change("quantity", event.target.value)} /></label><label><span className={labelClass}>Lot Number</span><input className={inputClass} required value={form.lotNumber} onChange={(event) => change("lotNumber", event.target.value)} /></label><label><span className={labelClass}>Batch Number</span><input className={inputClass} required value={form.batchNumber} onChange={(event) => change("batchNumber", event.target.value)} /></label><label><span className={labelClass}>Manufacturing Date</span><input className={inputClass} type="date" required value={form.manufacturingDate} onChange={(event) => change("manufacturingDate", event.target.value)} /></label><label><span className={labelClass}>Expiry Date</span><input className={inputClass} type="date" min={form.manufacturingDate} required value={form.expiryDate} onChange={(event) => change("expiryDate", event.target.value)} /></label><label><span className={labelClass}>Historical Received Date</span><input className={inputClass} type="date" max={today} required value={form.receivedDate} onChange={(event) => change("receivedDate", event.target.value)} /></label><label><span className={labelClass}>Old LC / Source Reference</span><input className={inputClass} value={form.sourceReference} onChange={(event) => change("sourceReference", event.target.value)} placeholder="OPENING-STOCK if unknown" /></label><label><span className={labelClass}>Warehouse</span><input className={inputClass} required value={form.warehouse} onChange={(event) => change("warehouse", event.target.value)} /></label><label><span className={labelClass}>Rack / BIN Location</span><select className={inputClass} value={form.location} onChange={(event) => change("location", event.target.value)}>{warehouse.locations.map((location) => <option key={location}>{location}</option>)}</select></label><label><span className={labelClass}>Historical Landed Cost / Unit</span><input className={inputClass} type="number" min="0" step="0.01" value={form.landedCostPerUnit} onChange={(event) => change("landedCostPerUnit", event.target.value)} placeholder="Optional owner-only value" /></label><div className="rounded-md border border-cyan-200 bg-cyan-50 p-3 text-xs leading-5 text-cyan-900 sm:col-span-2">Posting creates one opening batch and one Receive movement. It does not alter any import case.</div><div className="flex items-end justify-end"><Button type="submit" variant="primary" icon={<Database className="h-4 w-4" />} disabled={busy}>Post Opening Batch</Button></div></form>;
}

function CustomerOpeningForm({ customers, busy, onSubmit }: { customers: Customer[]; busy: boolean; onSubmit: (payload: Partial<CustomerOpeningBalance>) => void }) {
  const today = businessDate();
  const [form, setForm] = useState({ customerId: "", date: today, historicalSales: "", historicalCollected: "", reference: "LEGACY-SALES-LEDGER", remarks: "Opening balance imported from the legacy customer ledger." });
  const sales = Number(form.historicalSales || 0);
  const collected = Number(form.historicalCollected || 0);
  const openingDue = Math.max(0, sales - collected).toFixed(2);
  const valid = Boolean(form.customerId && sales >= 0 && collected >= 0 && collected <= sales);
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit({ ...form, openingDue }); }}><label className="sm:col-span-2"><span className={labelClass}>Customer</span><select className={inputClass} required value={form.customerId} onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))}><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} - {customer.territory}</option>)}</select>{!customers.length ? <small className="mt-1 block text-amber-700">Every current customer already has an explicit opening-balance record.</small> : null}</label><label><span className={labelClass}>Cutover Date</span><input className={inputClass} type="date" max={today} required value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></label><label><span className={labelClass}>Source Reference</span><input className={inputClass} required value={form.reference} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} /></label><label><span className={labelClass}>Historical Delivered Sales</span><input className={inputClass} type="number" min="0" step="0.01" required value={form.historicalSales} onChange={(event) => setForm((current) => ({ ...current, historicalSales: event.target.value }))} /></label><label><span className={labelClass}>Historical Collections</span><input className={inputClass} type="number" min="0" max={form.historicalSales || undefined} step="0.01" required value={form.historicalCollected} onChange={(event) => setForm((current) => ({ ...current, historicalCollected: event.target.value }))} /></label><div className="rounded-md border border-rose-200 bg-rose-50 p-3 sm:col-span-2"><span className="text-xs text-rose-700">Opening customer due</span><strong className="mt-1 block text-xl text-rose-800">{formatCurrency(openingDue)}</strong><small className="text-rose-700">Historical sales minus historical collections; this becomes the first running-ledger debit.</small></div><label className="sm:col-span-2"><span className={labelClass}>Migration Remarks</span><textarea className={textareaClass} required value={form.remarks} onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))} /></label><div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" icon={<Building2 className="h-4 w-4" />} disabled={busy || !valid}>Post Opening Balance</Button></div></form>;
}
