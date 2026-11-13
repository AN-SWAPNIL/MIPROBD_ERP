import { attachmentAccept } from "../../lib/files/attachments";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowUp,
  Banknote,
  Calculator,
  CircleX,
  Check,
  FileText,
  Eye,
  LockKeyhole,
  PackagePlus,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Save,
  ScanText,
  Ship,
  Trash2,
  Upload,
  Warehouse
} from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { Decimal as DecimalJs } from "decimal.js";
import { useNavigate, useParams } from "react-router-dom";
import { foundationMode, workspacePath } from "../../lib/runtime";
import { operationalService } from "../settings/operationalService";
import LedgerSetupDialog from "../ledger/LedgerSetupDialog";
import { CommercialEditor, ShipmentEditor, ItemEditor, ImportLogisticsSummary } from "./ImportEditors";
import { decimalPreview, isDecimalInput } from "../../lib/decimalInput";
import OptionSelect from "../masters/OptionSelect";
import { currencies } from "../masters/options";
import { PresetForm } from "../settings/OperationalSettingsPage";
import type { PresetData } from "../settings/operationalContracts";
import Button from "../../components/ui/Button";
import LifecycleProgress from "../../components/ui/LifecycleProgress";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import DocumentViewer, { readDocumentUpload } from "../../components/documents/DocumentViewer";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import {
  ErrorBlock,
  KeyValue,
  LoadingBlock,
  Modal,
  ProductThumb,
  SectionAccordion,
  TableFrame,
  inputClass,
  labelClass,
  textareaClass
} from "../components";
import type {
  AllocationMethod,
  AIDocumentExtraction,
  AIDocumentExtractionField,
  DocumentRecord,
  DocumentUpload,
  ImportCase,
  ImportCostLine,
  ImportDocument,
  ImportItem,
  LandedCostPreview,
  WarehouseReceipt
} from "../erp.types";
import { aiService, importService, settingsService } from "../services";
import { useAuthStore } from "../../lib/auth/session";
import { businessDate } from "../../lib/date";
import { hasCapability, hasEffectivePermission } from "../../lib/permissions/matrix";
import { useToastStore } from "../../lib/ui/toast";

import { formatMoney as formatCurrency, formatQuantity as formatNumber } from "../../utils/precise";
import { importStepActions, importSteps, importWorkflow } from "./workflow";

const Decimal = DecimalJs.clone({ precision: 48, rounding: DecimalJs.ROUND_HALF_UP });

type ActionTask = { run: () => Promise<unknown>; success: string; stage?: number | null };

function scrollToImportSection(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }));
}

export default function ImportWorkspacePage() {
  const { importId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const session = useAuthStore((state) => state.session);
  const [modal, setModal] = useState<"commercial" | "shipment" | "item" | "cost" | "document" | "receive" | "reopen" | null>(null);
  const [editingItem, setEditingItem] = useState<ImportItem | undefined>();
  const [editingCost, setEditingCost] = useState<ImportCostLine | undefined>();
  const [deleteItem, setDeleteItem] = useState<ImportItem | null>(null);
  const [deleteCost, setDeleteCost] = useState<ImportCostLine | null>(null);
  const [pendingTransition, setPendingTransition] = useState<"Cancelled" | "Closed" | null>(null);
  const [reopeningCase, setReopeningCase] = useState(false);
  const [accountingSetupOpen, setAccountingSetupOpen] = useState(false);
  const [preview, setPreview] = useState<LandedCostPreview | null>(null);
  const [viewingDocument, setViewingDocument] = useState<DocumentRecord | null>(null);
  const [extraction, setExtraction] = useState<AIDocumentExtraction | null>(null);
  const [selectedStage, setSelectedStage] = useState<number | null>(null);
  const [editingStage, setEditingStage] = useState(0);

  const recordQuery = useQuery({ queryKey: ["import", importId], queryFn: () => importService.get(importId), enabled: Boolean(importId) });
  const receiptsQuery = useQuery({ queryKey: ["import-receipts", importId], queryFn: () => importService.receipts(importId), enabled: Boolean(importId) });
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: settingsService.products });
  const receivingReadiness = useQuery({ queryKey: ["import-receiving-readiness", importId], queryFn: () => importService.receivingReadiness(importId), enabled: Boolean(importId) && recordQuery.data?.costingStatus === "Finalized" && hasEffectivePermission(session?.user, "inventory", "post") });

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["import", importId] }),
    queryClient.invalidateQueries({ queryKey: ["import-receipts", importId] }),
    queryClient.invalidateQueries({ queryKey: ["imports"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory"] }),
    queryClient.invalidateQueries({ queryKey: ["import-receiving-readiness", importId] })
  ]);
  const action = useMutation({
    mutationFn: (task: ActionTask) => task.run(),
    onSuccess: async (_data, task) => {
      if (_data && typeof _data === "object" && "draftReference" in _data && "items" in _data) queryClient.setQueryData(["import", importId], _data);
      await refresh();
      if (task.stage !== undefined) {
        setSelectedStage(task.stage);
        const fresh = queryClient.getQueryData<ImportCase>(["import", importId]);
        const next = task.stage ?? (fresh ? importWorkflow(fresh, hasCapability(session?.user, "view_sensitive_cost")).currentStep : undefined);
        if (next !== undefined) scrollToImportSection(`import-step-${next}`);
      }
      setModal(null);
      setEditingItem(undefined);
      setEditingCost(undefined);
      setPendingTransition(null);
      setReopeningCase(false);
      setPreview(null);
      setExtraction(null);
      pushToast({ kind: "success", title: task.success });
    },
    onError: (error) => { if (modal === "receive") void queryClient.invalidateQueries({ queryKey: ["import-receiving-readiness", importId] }); if (!modal || modal === "reopen") pushToast({ kind: "error", title: "Action could not be completed", message: error instanceof Error ? error.message : undefined }); }
  });
  const previewMutation = useMutation({
    mutationFn: () => importService.preview(importId),
    onSuccess: (data) => setPreview(data),
    onError: (error) => pushToast({ kind: "error", title: "Cost preview failed", message: error instanceof Error ? error.message : undefined })
  });
  const extractionMutation = useMutation({
    mutationFn: (document: ImportDocument) => aiService.extractDocument(importId, document.id),
    onSuccess: (data) => setExtraction(data),
    onError: (error) => pushToast({ kind: "error", title: "Field extraction failed", message: error instanceof Error ? error.message : undefined })
  });

  if (recordQuery.isLoading || productsQuery.isLoading) return <LoadingBlock label="Opening connected import workspace" />;
  if (recordQuery.isError || !recordQuery.data) return <ErrorBlock error={recordQuery.error} onRetry={() => void recordQuery.refetch()} />;
  const record = recordQuery.data;
  const products = productsQuery.data ?? [];
  const receipts = receiptsQuery.data ?? [];
  const locked = record.costingStatus === "Finalized";
  const terminal = ["Closed", "Cancelled"].includes(record.status);
  const canEdit = hasEffectivePermission(session?.user, "import", "edit") && !locked && !terminal;
  const canSeeCost = hasCapability(session?.user, "view_sensitive_cost");
  const canEditCost = hasEffectivePermission(session?.user, "import", "edit") && hasCapability(session?.user, "edit_sensitive_cost") && !locked && !terminal;
  const canFinalize = hasEffectivePermission(session?.user, "import", "edit") && hasCapability(session?.user, "finalize_landed_cost") && (!foundationMode || session?.user.role === "Super Admin") && !locked && !terminal;
  const canReopen = hasEffectivePermission(session?.user, "import", "edit") && hasCapability(session?.user, "reopen_landed_cost") && (!foundationMode || session?.user.role === "Super Admin") && locked && !receiptsQuery.isPending && !receiptsQuery.isError && receipts.length === 0;
  const canReceive = hasEffectivePermission(session?.user, "inventory", "post") && record.costingStatus === "Finalized" && record.warehouseStatus !== "Received";
  const result = record.snapshot ?? preview;
  const workflow = importWorkflow(record, canSeeCost);
  const stage = selectedStage ?? workflow.currentStep;
  const canCancel = canEdit && ["Draft", "PI Received", "LC/TT Opened", "In Production", "Shipped", "At Port", "Costing"].includes(record.status);
  const mayMark = (index: number) => index < 7 ? canEdit : index === 7 ? canFinalize : index === 8 ? hasEffectivePermission(session?.user, "inventory", "post") && !terminal : hasEffectivePermission(session?.user, "import", "edit") && !terminal;
  const blockers = (index: number) => [...workflow.steps[index].reasons, ...(index === 7 && !result ? ["Generate and review the landed-cost preview before finalizing."] : []), ...(index === 8 && receiptsQuery.isError ? ["Reload warehouse receipt history before posting."] : [])];
  const markStep = (index: number) => {
    setSelectedStage(index);
    if (index < 3) return action.mutate({ run: () => importService.confirmStep(record.id, index), success: `${importSteps[index]} confirmed`, stage: null });
    const transitions = { 3: "In Production", 4: "Shipped", 5: "At Port", 6: "Costing" } as const;
    if (index >= 3 && index <= 6) return action.mutate({ run: () => importService.transition(record.id, transitions[index as 3 | 4 | 5 | 6]), success: `Import moved to ${transitions[index as 3 | 4 | 5 | 6]}`, stage: null });
    if (index === 7) return action.mutate({ run: () => importService.finalize(record.id), success: "Landed cost finalized and locked", stage: null });
    if (index === 8) { action.reset(); setModal("receive"); }
    if (index === 9) setPendingTransition("Closed");
  };
  const logisticsTitle = ["LC / TT", "Production Follow-up", "Shipment"][editingStage - 2] ?? "Shipment";
  const selectStep = (index: number) => { setSelectedStage(index); action.reset(); scrollToImportSection(`import-step-${index}`); };
  const stepFooter = (index: number) => {
    const entry = workflow.steps[index], reasons = blockers(index);
    return <div className="border-t border-blue-100 bg-blue-50/40 p-4">
      {action.isError && !modal && stage === index ? <ErrorBlock error={action.error} title="Import action could not be completed" /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{!entry.completed && reasons.length ? <ul className="list-inside list-disc text-xs leading-5 text-amber-900">{(stage === index || workflow.currentStep === index ? reasons : reasons.slice(0, 1)).map(reason => <li key={reason}>{reason}</li>)}</ul> : null}</div>
        {entry.completed ? <Button disabled icon={<Check className="h-4 w-4" />}>Completed</Button> : mayMark(index) ? <Button variant="primary" icon={<Check className="h-4 w-4" />} disabled={action.isPending || reasons.length > 0 || index === 8 && (receiptsQuery.isPending || receivingReadiness.isPending || receivingReadiness.isError || !receivingReadiness.data?.ready)} onClick={() => markStep(index)}>{importStepActions[index]}</Button> : <span className="text-xs text-slate-600">{terminal || locked && index < 8 ? "Read-only section" : "Assigned role approval or posting authority required"}</span>}
      </div>
    </div>;
  };
  const sectionProps = (index: number) => ({ id: `import-step-${index}`, alwaysOpen: true, highlighted: stage === index, current: workflow.currentStep === index && !terminal, footer: stepFooter(index), onActivate: () => setSelectedStage(index) });
  const backToSteps = <Button variant="ghost" icon={<ArrowUp className="h-4 w-4" />} title="Back to import steps" aria-label="Back to import steps" onClick={() => scrollToImportSection("import-steps-navigation")} />;
  const recordedActivity = [
    { id: "created", date: record.createdAt, event: "Import created", reference: record.draftReference, by: "" },
    ...record.documents.map((document) => ({ id: `document-${document.id}`, date: document.uploadedAt, event: "Document attached", reference: document.name, by: document.uploadedBy })),
    ...(canSeeCost ? record.snapshotHistory ?? [] : []).map((snapshot) => ({ id: `snapshot-${snapshot.id}`, date: snapshot.finalizedAt, event: `Landed cost finalized (v${snapshot.version})`, reference: record.primaryReference, by: snapshot.finalizedBy })),
    ...receipts.map((receipt) => ({ id: `receipt-${receipt.id}`, date: receipt.receivedDate, event: "Warehouse receipt posted", reference: receipt.reference, by: receipt.receivedBy }))
  ].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const applyExtractedFields = (fields: AIDocumentExtractionField[]) => {
    action.mutate({
      success: `${fields.length} reviewed field${fields.length === 1 ? "" : "s"} applied through normal validation`,
      run: async () => {
        const importUpdates: Record<string, string> = {};
        const itemUpdates = new Map<string, Record<string, string>>();
        for (const field of fields) {
          if (field.target === "import") importUpdates[field.key] = field.value;
          if (field.target === "item" && field.targetId) itemUpdates.set(field.targetId, { ...(itemUpdates.get(field.targetId) ?? {}), [field.key]: field.value });
        }
        if (Object.keys(importUpdates).length) await importService.update(record.id, importUpdates as Partial<ImportCase>);
        for (const [itemId, updates] of itemUpdates) await importService.updateItem(record.id, itemId, updates as Partial<ImportItem>);
      }
    });
  };

  return (
    <>
      <PageHeader
        eyebrow="Import case workspace"
        title={record.primaryReference}
        subtitle={record.supplierName + " · " + record.poNumber + " · " + record.items.length + " product lines"}
        actions={
          <>
            <Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate(workspacePath("/app/imports"))}>Register</Button>
            {!terminal && hasEffectivePermission(session?.user, "import", "edit") ? <Button icon={<Paperclip className="h-4 w-4" />} onClick={() => { action.reset(); setSelectedStage(5); setModal("document"); }}>Attach Document</Button> : null}
            {foundationMode ? <Button icon={<Warehouse className="h-4 w-4" />} onClick={()=>navigate(`/backend/supplier-claims?import=${encodeURIComponent(record.id)}`)}>Supplier Claims</Button> : null}
            {canCancel ? <Button variant="danger" icon={<CircleX className="h-4 w-4" />} disabled={action.isPending} onClick={() => setPendingTransition("Cancelled")}>Cancel Case</Button> : null}
            {record.status === "Closed" && hasEffectivePermission(session?.user, "import", "edit") ? <Button icon={<RotateCcw className="h-4 w-4" />} disabled={action.isPending} onClick={() => { action.reset(); setReopeningCase(true); }}>Reopen Case</Button> : null}
            {canSeeCost && (foundationMode ? record.snapshot : result) && hasEffectivePermission(session?.user, "print", "view") ? <Button icon={<Printer className="h-4 w-4" />} onClick={() => navigate("/app/print/import-cost/" + record.id)}>Print Cost</Button> : null}
            <StatusBadge status={record.status} />
          </>
        }
      />

      <div id="import-steps-navigation" className="scroll-mt-24"><LifecycleProgress wrap label="Import stages" selectedId={String(stage)} onSelect={id => selectStep(Number(id))} steps={workflow.steps.map((entry, index) => ({ id: String(index), label: entry.label, detail: index === workflow.currentStep && !terminal ? "Current step" : undefined, state: record.status === "Cancelled" ? "cancelled" : entry.completed ? "complete" : index === workflow.currentStep ? "current" : "pending" }))} /></div>

      {locked ? (
        <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
          <p><strong>Finalized landed cost{record.snapshot ? ` v${record.snapshot.version}` : ""}.</strong> Commercial, product and cost values are locked. Reopening costing requires owner permission, a reason and an audit entry. Reopening a closed case does not unlock these values.</p>
        </div>
      ) : null}
      {locked && receipts.length ? <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><Warehouse className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Receipt-backed valuation is protected.</strong> This snapshot cannot be reopened because warehouse stock already inherited it. A future formal valuation adjustment must preserve sold and remaining stock history.</p></div> : null}

      <SectionAccordion
        {...sectionProps(0)}
        title="Purchase Order"
        subtitle="Supplier and purchase commitment"
        icon={PackagePlus}
        actions={<div className="flex items-center">{canEdit ? <Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingStage(0); setModal("commercial"); }} aria-label="Edit purchase order" title="Edit purchase order" /> : null}{backToSteps}</div>}
      >
        <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <KeyValue label="Draft Reference" value={record.draftReference} />
          <KeyValue label="Supplier" value={record.supplierName} />
          <KeyValue label="PO Number" value={record.poNumber} />
          <KeyValue label="PO Date" value={record.poDate} />
          <KeyValue label="Expected Shipment" value={record.expectedShipmentDate} />
          <KeyValue label="Notes" value={record.notes} />
        </dl>
      </SectionAccordion>

      <SectionAccordion {...sectionProps(1)} title="PI & Products" subtitle="Supplier PI and imported product lines" icon={PackagePlus} status={<span className="text-xs font-bold text-slate-500">{record.items.length} lines</span>} actions={<div className="flex items-center">{canEdit ? <Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingStage(1); setModal("commercial"); }} aria-label="Edit PI details" title="Edit PI details" /> : null}{backToSteps}</div>}>
        <dl className="grid gap-4 p-4 sm:grid-cols-2"><KeyValue label="PI Number" value={record.piNumber || "Pending supplier PI"} /><KeyValue label="PI Date" value={record.piDate} /></dl>
        <div className="border-t border-slate-200">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div><h3 className="text-sm font-bold text-slate-900">Imported products</h3><p className="text-xs text-slate-500">FOB, quantity and CBM are allocation bases.</p></div>
            {canEdit ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditingItem(undefined); setModal("item"); }}>Add Product</Button> : null}
          </div>
          <div className="grid gap-2 border-t border-slate-100 p-3 md:hidden">
            {record.items.map((item) => {
              const master = products.find((product) => product.id === item.productId);
              return (
                <article className="rounded-md border border-slate-200 p-3" key={item.id}>
                  <div className="flex min-w-0 items-center gap-3">
                    <ProductThumb src={master?.imageUrl} name={item.productName} />
                    <div className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{item.productName}</strong><span className="block text-xs text-slate-500">{item.productCode} | HS {item.hsCode ?? "-"}</span></div>
                    {canEdit ? <div className="flex shrink-0"><Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingItem(item); setModal("item"); }} aria-label="Edit product" title="Edit product" /><Button variant="ghost" icon={<Trash2 className="h-4 w-4 text-red-600" />} onClick={() => setDeleteItem(item)} aria-label="Delete product" title="Delete product" /></div> : null}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <KeyValue label="Quantity" value={formatNumber(item.quantity) + " " + item.unit} />
                    <KeyValue label="FOB / unit" value={canSeeCost ? `${item.currency} ${item.fobUnitForeign}` : "Restricted"} />
                    <KeyValue label="FOB total" value={canSeeCost ? formatCurrency(item.fobTotalBdt) : "Restricted"} />
                    <KeyValue label="Cartons / CBM" value={formatNumber(item.cartonCount) + " / " + item.totalCbm} />
                  </dl>
                </article>
              );
            })}
          </div>
          <div className="hidden md:block"><TableFrame>
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5 text-right">Quantity</th><th className="px-4 py-2.5 text-right">FOB / unit</th><th className="px-4 py-2.5 text-right">FOB BDT</th><th className="px-4 py-2.5 text-right">Cartons</th><th className="px-4 py-2.5 text-right">CBM</th>{canEdit ? <th className="px-4 py-2.5 text-right">Actions</th> : null}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {record.items.map((item) => {
                  const master = products.find((product) => product.id === item.productId);
                  return <tr key={item.id}><td className="px-4 py-3"><div className="flex items-center gap-3"><ProductThumb src={master?.imageUrl} name={item.productName} /><div><strong className="block text-slate-900">{item.productName}</strong><small className="text-slate-500">{item.productCode} · HS {item.hsCode ?? "-"}</small></div></div></td><td className="px-4 py-3 text-right font-semibold">{formatNumber(item.quantity)} {item.unit}</td><td className="px-4 py-3 text-right">{canSeeCost ? `${item.currency} ${item.fobUnitForeign}` : "Restricted"}</td><td className="px-4 py-3 text-right font-semibold">{canSeeCost ? formatCurrency(item.fobTotalBdt) : "Restricted"}</td><td className="px-4 py-3 text-right">{formatNumber(item.cartonCount)}</td><td className="px-4 py-3 text-right">{item.totalCbm}</td>{canEdit ? <td className="px-4 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingItem(item); setModal("item"); }} aria-label="Edit product" title="Edit product" /><Button variant="ghost" icon={<Trash2 className="h-4 w-4 text-red-600" />} onClick={() => setDeleteItem(item)} aria-label="Delete product" title="Delete product" /></div></td> : null}</tr>;
                })}
              </tbody>
            </table>
          </TableFrame></div>
        </div>
      </SectionAccordion>

      {[{ index: 2, title: "LC / TT", subtitle: "Payment reference and exchange-rate snapshot", edit: "Edit payment" }, { index: 3, title: "Production Follow-up", subtitle: "Supplier production status and target timing", edit: "Edit production" }, { index: 4, title: "Shipment", subtitle: "Commercial invoice, carrier and shipment dates", edit: "Edit shipment" }].map(section => <SectionAccordion key={section.index} {...sectionProps(section.index)} title={section.title} subtitle={section.subtitle} icon={Ship} actions={<div className="flex items-center">{canEdit ? <Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingStage(section.index); setModal("shipment"); }} aria-label={section.edit} title={section.edit} /> : null}{backToSteps}</div>}>
        <ImportLogisticsSummary record={record} stage={section.index} canSeeCost={canSeeCost} />
      </SectionAccordion>)}

      <SectionAccordion
        {...sectionProps(5)}
        title="Import Documents"
        subtitle="Shipment documents, certificates and supporting attachments"
        icon={FileText}
        status={<span className="text-xs font-bold text-slate-500">{record.documents.length} files</span>}
        actions={<div className="flex items-center">{!terminal && hasEffectivePermission(session?.user, "import", "edit") ? <Button variant="ghost" icon={<Upload className="h-4 w-4" />} onClick={() => setModal("document")} aria-label="Attach document" title="Attach document" /> : null}{backToSteps}</div>}
      >
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {record.documents.map((document) => (
            <article className="min-w-0 rounded-md border border-slate-200 p-3" key={document.id}>
              <div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-blue-50 text-blue-700"><Paperclip className="h-4 w-4" /></span><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900" title={document.name}>{document.name}</strong><span className="block text-xs text-slate-500">{document.type} | {document.uploadedAt.slice(0, 10)}</span></div></div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-2"><Button variant="ghost" icon={<Eye className="h-4 w-4" />} onClick={() => setViewingDocument(document)}>View</Button>{!foundationMode && document.mimeType === "application/pdf" ? <Button variant="ghost" icon={<ScanText className="h-4 w-4" />} disabled={extractionMutation.isPending} onClick={() => extractionMutation.mutate(document)}>Extract Fields</Button> : null}</div>
            </article>
          ))}
          {!record.documents.length ? <p className="text-sm text-slate-500">No documents attached yet.</p> : null}
        </div>
      </SectionAccordion>

      <SectionAccordion
        {...sectionProps(6)}
        title="Costs & Allocation"
        subtitle="Dynamic cost rows with an explicit allocation basis"
        icon={Banknote}
        status={<StatusBadge status={record.costingStatus} />}
        actions={<div className="flex items-center">{canEditCost ? <Button variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditingCost(undefined); setModal("cost"); }}>Add Cost</Button> : null}{backToSteps}</div>}
      >
        {!canSeeCost ? (
          <div className="flex items-start gap-3 bg-amber-50 p-4 text-sm text-amber-900"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" /><p><strong>Sensitive cost values are restricted for {session?.user.role}.</strong> Shipment and receiving status remain available without exposing supplier price, landed cost or profit.</p></div>
        ) : (
          <>
            <div className="grid gap-2 p-3 md:hidden">
              {record.costs.map((cost) => (
                <article className="rounded-md border border-slate-200 p-3" key={cost.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><strong className="block text-sm text-slate-900">{cost.name}</strong><span className="block text-xs text-slate-500">{cost.category}{cost.vendor ? " | " + cost.vendor : ""}</span></div>
                    {canEditCost ? <div className="flex shrink-0"><Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingCost(cost); setModal("cost"); }} aria-label="Edit cost" title="Edit cost" /><Button variant="ghost" icon={<Trash2 className="h-4 w-4 text-red-600" />} onClick={() => setDeleteCost(cost)} aria-label="Delete cost" title="Delete cost" /></div> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
                    <div><span className="block text-xs text-slate-500">{cost.currency} {formatNumber(cost.amountForeign)}</span><strong className="block text-sm text-slate-900">{formatCurrency(cost.amountBdt)}</strong></div>
                    <span className="rounded bg-cyan-50 px-2 py-1 text-xs font-bold text-cyan-800">{cost.allocationMethod.replace("_", " ")}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                    <span><b className="block text-slate-700">Scope</b>{cost.appliesToItemIds.length ? cost.appliesToItemIds.map((id) => record.items.find((item) => item.id === id)?.productCode).filter(Boolean).join(", ") : "All products"}</span>
                    <span><b className="block text-slate-700">Payment</b>{cost.paymentDate ?? "Not recorded"}<small className="block">{cost.accountId ?? "-"}</small></span>
                  </div>
                  {cost.attachment ? <div className="mt-2 border-t border-slate-100 pt-2"><Button variant="ghost" icon={<Eye className="h-4 w-4" />} onClick={() => setViewingDocument(cost.attachment!)}>View {cost.attachment.fileName}</Button></div> : null}
                </article>
              ))}
            </div>
            <div className="hidden md:block"><TableFrame>
              <table className="min-w-[1050px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-2.5">Cost</th><th className="px-4 py-2.5">Foreign / BDT</th><th className="px-4 py-2.5">Allocation</th><th className="px-4 py-2.5">Scope</th><th className="px-4 py-2.5">Payment</th><th className="px-4 py-2.5">Support</th>{canEditCost ? <th className="px-4 py-2.5 text-right">Actions</th> : null}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {record.costs.map((cost) => <tr key={cost.id}><td className="px-4 py-3"><strong className="block text-slate-900">{cost.name}</strong><small className="text-slate-500">{cost.category}{cost.vendor ? " · " + cost.vendor : ""}</small></td><td className="px-4 py-3"><span className="block">{cost.currency} {formatNumber(cost.amountForeign)}</span><strong className="text-slate-900">{formatCurrency(cost.amountBdt)}</strong></td><td className="px-4 py-3"><span className="rounded bg-cyan-50 px-2 py-1 text-xs font-bold text-cyan-800">{cost.allocationMethod.replace("_", " ")}</span></td><td className="px-4 py-3 text-slate-600">{cost.appliesToItemIds.length ? cost.appliesToItemIds.map((id) => record.items.find((item) => item.id === id)?.productCode).filter(Boolean).join(", ") : "All products"}</td><td className="px-4 py-3 text-slate-600">{cost.paymentDate ?? "Not recorded"}<small className="block text-slate-400">{cost.accountId ?? "-"}</small></td><td className="px-4 py-3">{cost.attachment ? <Button variant="ghost" icon={<Eye className="h-4 w-4" />} onClick={() => setViewingDocument(cost.attachment!)} aria-label={`View ${cost.attachment.fileName}`} title={cost.attachment.fileName}>View</Button> : <span className="text-xs text-slate-400">-</span>}</td>{canEditCost ? <td className="px-4 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingCost(cost); setModal("cost"); }} aria-label="Edit cost" title="Edit cost" /><Button variant="ghost" icon={<Trash2 className="h-4 w-4 text-red-600" />} onClick={() => setDeleteCost(cost)} aria-label="Delete cost" title="Delete cost" /></div></td> : null}</tr>)}
                </tbody>
              </table>
            </TableFrame></div>
            {!record.costs.length ? <p className="p-4 text-sm text-slate-500">No landed-cost rows entered. Operating rent, salary, utilities and TA/DA belong in Expenses & Accounts.</p> : null}
            <div className="flex justify-end border-t border-slate-200 p-4">
              <Button variant="primary" icon={<Calculator className="h-4 w-4" />} disabled={previewMutation.isPending || action.isPending || !record.items.length} onClick={() => { selectStep(7); if (!record.snapshot) previewMutation.mutate(); }}>{locked ? "View Landed Cost" : "Review Landed Cost"}</Button>
            </div>
          </>
        )}
      </SectionAccordion>

      <SectionAccordion
        {...sectionProps(7)}
        title="Landed-Cost Result"
        subtitle="Two-decimal cost allocation with exact totals"
        icon={Calculator}
        status={record.snapshot ? <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">Snapshot v{record.snapshot.version}</span> : undefined}
        actions={<div className="flex items-center">{canSeeCost ? <Button variant="ghost" icon={<Calculator className="h-4 w-4" />} onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending || !record.items.length}>Preview</Button> : null}{backToSteps}</div>}
      >
        {!canSeeCost ? (
          <div className="p-4 text-sm text-slate-600">Finalization state: <strong>{record.costingStatus}</strong>. Detailed costs and product margins are owner-only.</div>
        ) : result ? (
          <div>
            {result.validationErrors.length ? <div className="m-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{result.validationErrors.map((error) => <p key={error}>• {error}</p>)}</div> : null}
            <dl className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3">
              <KeyValue label="FOB Product Value" value={formatCurrency(result.totalProductValueBdt)} />
              <KeyValue label="Allocated Import Costs" value={formatCurrency(result.totalAdditionalCostBdt)} />
              <KeyValue label="Final Shipment Cost" value={formatCurrency(result.totalShipmentCostBdt)} accent />
            </dl>
            <div className="grid gap-2 p-3 md:hidden">
              {result.products.map((product) => (
                <article className="rounded-md border border-slate-200 p-3" key={product.importItemId}>
                  <div className="flex items-start justify-between gap-3"><strong className="text-sm text-slate-900">{product.productName}</strong><strong className="shrink-0 text-right text-sm text-blue-800">{formatCurrency(product.finalPerUnitBdt)}<small className="block font-normal text-slate-500">per unit</small></strong></div>
                  <dl className="mt-3 grid grid-cols-2 gap-2">
                    <KeyValue label="Quantity" value={formatNumber(product.quantity)} />
                    <KeyValue label="Final total" value={formatCurrency(product.finalTotalBdt)} />
                    <KeyValue label="FOB / unit" value={formatCurrency(product.fobPerUnitBdt)} />
                    <KeyValue label="Added / unit" value={formatCurrency(product.additionalPerUnitBdt)} />
                  </dl>
                  <details className="mt-3 border-t border-slate-100 pt-2"><summary className="cursor-pointer text-xs font-semibold text-cyan-700">Explain {product.components.length} allocations</summary><div className="mt-2 grid gap-1 rounded bg-slate-50 p-2">{product.components.map((component) => <p className="text-xs leading-5 text-slate-600" key={component.costLineId}>{component.explanation}</p>)}</div></details>
                </article>
              ))}
            </div>
            <div className="hidden md:block"><TableFrame>
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5 text-right">Qty</th><th className="px-4 py-2.5 text-right">FOB / unit</th><th className="px-4 py-2.5 text-right">Added / unit</th><th className="px-4 py-2.5 text-right">Landed / unit</th><th className="px-4 py-2.5 text-right">Final total</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{result.products.map((product) => <tr key={product.importItemId}><td className="px-4 py-3"><strong>{product.productName}</strong><details className="mt-1"><summary className="cursor-pointer text-xs font-semibold text-cyan-700">Explain {product.components.length} allocations</summary><div className="mt-2 grid gap-1 rounded bg-slate-50 p-2">{product.components.map((component) => <p className="text-xs leading-5 text-slate-600" key={component.costLineId}>{component.explanation}</p>)}</div></details></td><td className="px-4 py-3 text-right">{formatNumber(product.quantity)}</td><td className="px-4 py-3 text-right">{formatCurrency(product.fobPerUnitBdt)}</td><td className="px-4 py-3 text-right">{formatCurrency(product.additionalPerUnitBdt)}</td><td className="px-4 py-3 text-right font-bold text-blue-800">{formatCurrency(product.finalPerUnitBdt)}</td><td className="px-4 py-3 text-right font-semibold">{formatCurrency(product.finalTotalBdt)}</td></tr>)}</tbody>
              </table>
            </TableFrame></div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4">
              <p className="max-w-2xl text-xs leading-5 text-slate-500">Customs duty is entered as the final assessed amount for each product. The ERP does not invent HS-code duty, VAT or AIT formulas.</p>
              <div className="flex gap-2">
                {canReopen ? <Button icon={<RotateCcw className="h-4 w-4" />} onClick={() => setModal("reopen")}>Reopen with Reason</Button> : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-40 place-items-center p-5 text-center"><div><Calculator className="mx-auto h-8 w-8 text-slate-300" /><strong className="mt-2 block text-sm text-slate-800">Generate a landed-cost preview</strong><p className="mt-1 text-sm text-slate-500">Add product and cost lines, then preview the reconciled allocation before finalizing.</p></div></div>
        )}
      </SectionAccordion>

      <SectionAccordion
        {...sectionProps(8)}
        title="Warehouse Receiving"
        subtitle="Receiving is unlocked only after landed-cost finalization"
        icon={Warehouse}
        status={<StatusBadge status={record.warehouseStatus} />}
        actions={backToSteps}
      >
        {record.costingStatus !== "Finalized" ? <div className="flex items-start gap-3 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><p>Warehouse receiving remains locked until the authorized owner finalizes landed cost.</p></div> : null}
        {canReceive && receivingReadiness.isPending ? <LoadingBlock label="Checking accounting setup" /> : null}
        {canReceive && receivingReadiness.isError ? <ErrorBlock error={receivingReadiness.error} onRetry={() => void receivingReadiness.refetch()} /> : null}
        {canReceive && receivingReadiness.data && !receivingReadiness.data.ready ? <AccountingSetupNotice message={receivingReadiness.data.message} canConfigure={receivingReadiness.data.canConfigure} onSetup={() => setAccountingSetupOpen(true)} /> : null}
        {receiptsQuery.isError ? <ErrorBlock error={receiptsQuery.error} onRetry={() => void receiptsQuery.refetch()} /> : null}
        <div className="grid gap-3 p-4">
          {receipts.map((receipt) => (
            <article className="rounded-md border border-slate-200" key={receipt.id}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2"><div><strong className="text-sm text-slate-900">{receipt.id}</strong><span className="ml-2 text-xs text-slate-500">{receipt.receivedDate} · {receipt.receivedBy}</span></div><StatusBadge status={receipt.status} /></div>
              <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">{receipt.lines.map((line) => <div className="border-l-2 border-emerald-500 pl-3 text-sm" key={line.importItemId + line.batchNumber}><strong className="block text-slate-900">{line.productName}</strong><span className="block text-xs text-slate-500">Received {formatNumber(line.quantityReceived)} · Rejected {formatNumber(line.quantityRejected)}</span><span className="block text-xs text-slate-500">Lot {line.lotNumber} · {line.location}</span></div>)}</div>
            </article>
          ))}
          {!receipts.length && !receiptsQuery.isPending && !receiptsQuery.isError ? <p className="text-sm text-slate-500">No warehouse receipt has been posted against this import case.</p> : null}
        </div>
      </SectionAccordion>

      <SectionAccordion {...sectionProps(9)} title="Activity & Closure" subtitle="Recorded case events and completion status" icon={Archive} status={<StatusBadge status={record.status} />} actions={backToSteps}>
        <dl className="grid gap-4 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <KeyValue label="Import reference" value={record.primaryReference} />
          <KeyValue label="Landed cost" value={record.costingStatus} />
          <KeyValue label="Warehouse status" value={record.warehouseStatus} />
          <KeyValue label="Posted receipts" value={receiptsQuery.isError ? "Unavailable" : String(receipts.length)} />
        </dl>
        <ol className="divide-y divide-slate-100">
          {recordedActivity.map((entry) => <li key={entry.id} className="grid gap-2 p-4 sm:grid-cols-[140px_1fr]">
            <time dateTime={entry.date} className="text-xs text-slate-500">{businessDate(new Date(entry.date))}</time>
            <div className="min-w-0"><strong className="block text-sm text-slate-900">{entry.event}</strong><span className="block break-words text-sm text-slate-600">{entry.reference}</span>{entry.by ? <small className="block text-slate-500">{entry.by}</small> : null}</div>
          </li>)}
        </ol>
        <div className="flex justify-end border-t border-slate-200 p-4"><Button icon={<Warehouse className="h-4 w-4" />} onClick={() => selectStep(8)}>View Warehouse Receipts</Button></div>
      </SectionAccordion>

      {modal === "commercial" ? <Modal open title={editingStage === 1 ? "Edit PI details" : "Edit purchase order"} subtitle="Update the same import record." onClose={() => setModal(null)}>{action.isError ? <ErrorBlock error={action.error} title="Commercial data could not be saved" /> : null}<CommercialEditor record={record} busy={action.isPending} requirePi={editingStage === 1} onSubmit={(payload) => action.mutate({ run: () => importService.update(record.id, payload), success: "Commercial data updated" })} /></Modal> : null}
      {modal === "shipment" ? <Modal open title={logisticsTitle} onClose={() => setModal(null)}><ShipmentEditor record={record} stage={editingStage} error={action.error} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => importService.update(record.id, payload), success: `${logisticsTitle} details updated` })} /></Modal> : null}
      {modal === "item" ? <Modal open title={editingItem ? "Edit imported product" : "Add imported product"} subtitle="Choose a product variant and enter its FOB, quantity and CBM basis." onClose={() => { setModal(null); setEditingItem(undefined); }} width="max-w-3xl"><ItemEditor error={action.error} record={record} products={products} item={editingItem} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => editingItem ? importService.updateItem(record.id, editingItem.id, payload) : importService.addItem(record.id, payload), success: editingItem ? "Product line updated" : "Product line added" })} /></Modal> : null}
      {modal === "cost" ? <Modal open title={editingCost ? "Edit cost row" : "Add import cost"} subtitle="Every common or transport cost requires an explicit allocation decision." onClose={() => { setModal(null); setEditingCost(undefined); }} width="max-w-4xl">{action.isError ? <ErrorBlock error={action.error} title="Cost row could not be saved" /> : null}<CostEditor record={record} cost={editingCost} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => editingCost ? importService.updateCost(record.id, editingCost.id, payload) : importService.addCost(record.id, payload), success: editingCost ? "Cost row updated" : "Cost row added" })} /></Modal> : null}
      {modal === "document" ? <Modal open title="Attach import document" subtitle="Attach a PDF, image, spreadsheet or document to this import." onClose={() => setModal(null)}>{action.isError ? <ErrorBlock error={action.error} title="Document could not be attached" /> : null}<DocumentEditor busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => importService.addDocument(record.id, payload), success: "Document attached and ready to view" })} /></Modal> : null}
      {modal === "receive" ? <Modal open title="Receive to warehouse" subtitle="Product and finalized cost are inherited. Enter batch traceability and accepted/rejected quantities." onClose={() => setModal(null)} width="max-w-5xl">{action.isError ? <ErrorBlock error={action.error} title="Receipt could not be posted" /> : null}{receivingReadiness.isError ? <ErrorBlock error={receivingReadiness.error} onRetry={() => void receivingReadiness.refetch()} /> : receivingReadiness.data?.ready ? <ReceiptEditor record={record} receipts={receipts} busy={action.isPending} onSubmit={payload => action.mutate({ run: () => importService.receive(record.id, payload), success: "Warehouse receipt posted and stock batches created", stage: null })} /> : receivingReadiness.data ? <AccountingSetupNotice message={receivingReadiness.data.message} canConfigure={receivingReadiness.data.canConfigure} onSetup={() => { setModal(null); setAccountingSetupOpen(true); }} /> : <LoadingBlock label="Checking posting prerequisites" />}</Modal> : null}
      {accountingSetupOpen ? <LedgerSetupDialog onClose={() => setAccountingSetupOpen(false)} /> : null}
      {modal === "reopen" ? <ReopenModal busy={action.isPending} onClose={() => setModal(null)} onSubmit={(reason) => action.mutate({ run: () => importService.reopen(record.id, reason), success: "Landed cost reopened with an audit reason" })} /> : null}
      {extraction ? <Modal open title="AI Extracted Fields" subtitle={`${extraction.documentName} | review required; nothing is overwritten automatically.`} onClose={() => setExtraction(null)} width="max-w-3xl"><AIDocumentExtractReview extraction={extraction} busy={action.isPending} onApply={applyExtractedFields} /></Modal> : null}
      <DocumentViewer document={viewingDocument} onClose={() => setViewingDocument(null)} />

      <ConfirmDialog open={Boolean(deleteItem)} title="Remove product line?" message={foundationMode ? "Remove any costs scoped to this item first. Product removal is allowed only before landed-cost finalization." : "Any cost scoped to this product will also be removed. This is allowed only before landed-cost finalization."} confirmLabel="Remove product" onCancel={() => setDeleteItem(null)} onConfirm={() => deleteItem && action.mutate({ run: () => importService.removeItem(record.id, deleteItem.id), success: "Product line removed" })} />
      <ConfirmDialog open={Boolean(deleteCost)} title="Remove cost row?" message="The next landed-cost preview will be recalculated without this cost." confirmLabel="Remove cost" onCancel={() => setDeleteCost(null)} onConfirm={() => deleteCost && action.mutate({ run: () => importService.removeCost(record.id, deleteCost.id), success: "Cost row removed" })} />
      <ConfirmDialog open={Boolean(pendingTransition)} title={pendingTransition === "Closed" ? "Close this import case?" : "Cancel this import case?"} message={pendingTransition === "Closed" ? "The shipment is fully received. Closing removes it from active work while preserving every commercial, cost, receipt and stock record." : "Cancellation makes this unfinalized case read-only. It can still be audited or deleted from the register."} confirmLabel={pendingTransition === "Closed" ? "Close case" : "Cancel case"} onCancel={() => setPendingTransition(null)} onConfirm={() => pendingTransition && action.mutate({ run: () => importService.transition(record.id, pendingTransition), success: pendingTransition === "Closed" ? "Import case closed" : "Import case cancelled" })} />
      {reopeningCase ? <Modal open title="Reopen this import case?" onClose={() => { if (!action.isPending) setReopeningCase(false); }}><p className="text-sm leading-6 text-slate-700">Return this case to Received for follow-up. Existing receipts, stock, payments and finalized landed cost stay unchanged. Posted values remain protected.</p>{action.isError ? <ErrorBlock error={action.error} title="Case could not be reopened" /> : null}<div className="mt-4 flex justify-end"><Button variant="primary" icon={<RotateCcw className="h-4 w-4" />} disabled={action.isPending} onClick={() => action.mutate({ run: () => importService.reopenCase(record.id), success: "Import case reopened. Posted stock and costs are unchanged.", stage: 9 })}>Reopen Case</Button></div></Modal> : null}
    </>
  );
}



function AccountingSetupNotice({ message, canConfigure, onSetup }: { message: string; canConfigure: boolean; onSetup: () => void }) {
  return <div role="status" className="border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950"><strong>Company accounting setup is not finished</strong><p className="mt-1">{message}</p>{canConfigure ? <Button className="mt-3" variant="primary" icon={<Banknote className="h-4 w-4" />} onClick={onSetup}>Set Up Accounting</Button> : <p className="mt-2 text-xs">Contact your Super Admin. Warehouse staff do not need to choose accounting accounts.</p>}</div>;
}

function CostEditor({ record, cost, busy, onSubmit }: { record: ImportCase; cost?: ImportCostLine; busy: boolean; onSubmit: (payload: Omit<ImportCostLine, "id" | "enteredBy" | "createdAt"> & { attachmentUpload?: DocumentUpload }) => void }) {
  const client = useQueryClient(); const actor = useAuthStore((s) => s.session?.user); const [adding, setAdding] = useState(false);
  const createPreset = useMutation({ mutationFn: (body: unknown) => operationalService.savePreset(null, body), onSuccess: async (row) => { await client.invalidateQueries({ queryKey: ["operational-settings", "presets"] }); setPresetId(row.id); setAdding(false); } });
  const presets = useQuery({ queryKey: ["operational-settings", "presets"], queryFn: operationalService.presets, enabled: foundationMode && !cost });
  const [presetId, setPresetId] = useState(""); const selected = presets.data?.find((p) => p.id === presetId && p.active);
  return <div className="grid gap-4">{foundationMode && !cost ? <div className="grid gap-2 border-b border-blue-100 pb-4"><label><span className={labelClass}>Start from Saved Cost Preset</span><select aria-label="Cost preset" className={inputClass} value={presetId} onChange={(e) => { if (e.target.value === "__add_preset__") { createPreset.reset(); setAdding(true); } else setPresetId(e.target.value); }}><option value="">Custom cost row</option>{presets.data?.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}{hasEffectivePermission(actor, "settings", "create") ? <option value="__add_preset__">+ Add cost preset...</option> : null}</select></label>{selected?.suggestedAllocationMethod ? <p className="text-xs text-cyan-800">Suggested basis: {selected.suggestedAllocationMethod}. Confirm the allocation method below.</p> : null}{presets.isError ? <ErrorBlock error={presets.error} /> : null}</div> : null}<CostFields key={presetId} record={record} cost={cost} busy={busy} onSubmit={onSubmit} preset={selected} />{adding ? <Modal open title="Add cost preset" onClose={() => { if (!createPreset.isPending) setAdding(false); }}>{createPreset.isError ? <ErrorBlock error={createPreset.error} title="Preset could not be saved" /> : null}<PresetForm busy={createPreset.isPending} onSave={(body) => createPreset.mutate(body)} /></Modal> : null}</div>;
}
function CostFields({ record, cost, preset, busy, onSubmit }: { record: ImportCase; cost?: ImportCostLine; preset?: PresetData; busy: boolean; onSubmit: (payload: Omit<ImportCostLine, "id" | "enteredBy" | "createdAt"> & { attachmentUpload?: DocumentUpload }) => void }) {
  const [form, setForm] = useState({ name: cost?.name ?? preset?.name ?? "", category: cost?.category ?? preset?.category ?? "Freight", amountForeign: cost?.amountForeign ?? "", currency: cost?.currency ?? "BDT", exchangeRate: cost?.exchangeRate ?? "1", allocationMethod: (cost?.allocationMethod ?? "") as AllocationMethod | "", scope: cost?.appliesToItemIds.length ? "SELECTED" : "ALL", selected: cost?.appliesToItemIds ?? [], vendor: cost?.vendor ?? "", paymentDate: cost?.paymentDate ?? "", accountId: cost?.accountId ?? "", notes: cost?.notes ?? "", attachmentName: cost?.attachmentName ?? "" });
  const initialManual = Object.fromEntries(record.items.map((item) => [item.id, cost?.manualSplits?.find((split) => split.importItemId === item.id)?.amountBdt ?? ""]));
  const [manual, setManual] = useState<Record<string, string>>(initialManual);
  const [error, setError] = useState("");
  const [attachmentUpload, setAttachmentUpload] = useState<DocumentUpload>();
  const change = (key: keyof typeof form, value: string | string[]) => setForm((current) => ({ ...current, [key]: value }));
  const eligibleIds = form.scope === "ALL" ? record.items.map((item) => item.id) : form.selected;
  const converted = new Decimal(decimalPreview(form.amountForeign, 6)).mul(form.currency === "BDT" ? 1 : decimalPreview(form.exchangeRate, 6)).toDecimalPlaces(2);
  const manualTotal = eligibleIds.reduce((sum, id) => sum.plus(decimalPreview(manual[id] ?? "", 2)), new Decimal(0));
  const changeAttachment = (file?: File) => {
    change("attachmentName", file?.name ?? cost?.attachmentName ?? "");
    setAttachmentUpload(undefined);
    if (!file) return;
    void readDocumentUpload(file)
      .then((upload) => { setAttachmentUpload(upload); setError(""); })
      .catch((reason) => { change("attachmentName", cost?.attachmentName ?? ""); setError(reason instanceof Error ? reason.message : "Attachment could not be read."); });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!isDecimalInput(form.amountForeign, 6) || new Decimal(form.amountForeign).lte(0)) return setError("Amount: enter a positive decimal, without scientific notation.");
    if (form.currency !== "BDT" && (!isDecimalInput(form.exchangeRate, 6) || new Decimal(form.exchangeRate).lte(0))) return setError("Exchange rate: enter a positive rate with up to six decimal places.");
    if (form.allocationMethod === "MANUAL" && eligibleIds.some((id) => !isDecimalInput(manual[id] ?? "", 2))) return setError("Manual split: enter an amount for every selected product, including 0 where applicable.");
    if (!form.allocationMethod) return setError("Select an allocation method explicitly.");
    if (!eligibleIds.length) return setError("Select at least one product in scope.");
    if (form.allocationMethod === "PRODUCT_SPECIFIC" && eligibleIds.length !== 1) return setError("Product-specific allocation requires exactly one product.");
    if (form.allocationMethod === "MANUAL" && !manualTotal.eq(converted)) return setError("Manual splits must equal the converted BDT amount exactly.");
    setError("");
    onSubmit({ name: form.name, category: form.category, amountForeign: form.amountForeign, currency: form.currency, exchangeRate: form.currency === "BDT" ? "1" : form.exchangeRate, amountBdt: converted.toFixed(2), allocationMethod: form.allocationMethod, appliesToItemIds: form.scope === "ALL" ? [] : form.selected, manualSplits: form.allocationMethod === "MANUAL" ? eligibleIds.map((id) => ({ importItemId: id, amountBdt: new Decimal(manual[id] || 0).toFixed(2) })) : undefined, vendor: form.vendor, paymentDate: form.paymentDate, accountId: form.accountId, notes: form.notes, attachmentName: form.attachmentName, attachment: cost?.attachment, attachmentUpload });
  };
  return <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={submit}>{error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 md:col-span-2 xl:col-span-3">{error}</div> : null}<label><span className={labelClass}>Cost Name</span><input className={inputClass} value={form.name} onChange={(event) => change("name", event.target.value)} placeholder="e.g. Ocean Freight" required /></label><label><span className={labelClass}>Category</span><OptionSelect kind="import-cost-category" label="Cost category" value={form.category} onChange={(v) => change("category", v)} options={["Freight", "Customs Duty", "Bank Charge", "Insurance", "Port / C&F", "Local Transport", "Labour", "Other Import Cost"]} required /></label><label><span className={labelClass}>Allocation Method</span><select className={inputClass} value={form.allocationMethod} onChange={(event) => change("allocationMethod", event.target.value)} required><option value="">Choose explicitly</option><option value="CBM">CBM</option><option value="FOB_VALUE">FOB Value</option><option value="QUANTITY">Quantity</option><option value="PRODUCT_SPECIFIC">Product-specific</option><option value="MANUAL">Manual split</option></select></label><label><span className={labelClass}>Amount</span><input className={inputClass} type="number" min="0.000001" step="0.000001" value={form.amountForeign} onChange={(event) => change("amountForeign", event.target.value)} required /></label><label><span className={labelClass}>Currency</span><OptionSelect kind="currency" label="Currency" value={form.currency} onChange={(v) => setForm((current) => ({ ...current, currency: v, exchangeRate: v === "BDT" ? "1" : v === current.currency ? current.exchangeRate : "" }))} options={currencies} required /></label><label><span className={labelClass}>Exchange Rate Snapshot</span><input className={inputClass} type="number" min="0.000001" step="0.000001" value={form.currency === "BDT" ? "1" : form.exchangeRate} onChange={(event) => change("exchangeRate", event.target.value)} disabled={form.currency === "BDT"} required /></label><div className="rounded-md border border-cyan-200 bg-cyan-50 p-3 md:col-span-2 xl:col-span-3"><span className="text-xs text-cyan-800">Converted amount: <strong>{formatCurrency(converted.toFixed(2))}</strong>. Final allocations reconcile to this amount to the poisha.</span></div><fieldset className="rounded-md border border-slate-200 p-3 md:col-span-2 xl:col-span-3"><legend className="px-1 text-xs font-bold uppercase text-slate-500">Product Scope</legend><div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm font-semibold"><input type="radio" name="scope" checked={form.scope === "ALL"} onChange={() => change("scope", "ALL")} /> All products</label><label className="flex items-center gap-2 text-sm font-semibold"><input type="radio" name="scope" checked={form.scope === "SELECTED"} onChange={() => change("scope", "SELECTED")} /> Selected products</label></div>{form.scope === "SELECTED" ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{record.items.map((item) => <label className="flex items-center gap-2 rounded bg-slate-50 p-2 text-sm" key={item.id}><input type="checkbox" checked={form.selected.includes(item.id)} onChange={(event) => change("selected", event.target.checked ? [...form.selected, item.id] : form.selected.filter((id) => id !== item.id))} /> {item.productCode} · {item.productName}</label>)}</div> : null}</fieldset>{form.allocationMethod === "MANUAL" ? <fieldset className="rounded-md border border-amber-200 bg-amber-50 p-3 md:col-span-2 xl:col-span-3"><legend className="px-1 text-xs font-bold uppercase text-amber-800">Manual BDT Split</legend><div className="grid gap-3 sm:grid-cols-2">{record.items.filter((item) => eligibleIds.includes(item.id)).map((item) => <label key={item.id}><span className={labelClass}>{item.productCode} · {item.productName}</span><input className={inputClass} type="number" min="0" step="0.01" required value={manual[item.id] ?? ""} onChange={(event) => setManual((current) => ({ ...current, [item.id]: event.target.value }))} /></label>)}</div><p className="mt-2 text-xs font-semibold text-amber-800">Split total {formatCurrency(manualTotal.toFixed(2))} / required {formatCurrency(converted.toFixed(2))}</p></fieldset> : null}<label><span className={labelClass}>Vendor</span><input className={inputClass} value={form.vendor} onChange={(event) => change("vendor", event.target.value)} /></label><label><span className={labelClass}>Payment Date</span><input className={inputClass} type="date" value={form.paymentDate} onChange={(event) => change("paymentDate", event.target.value)} /></label><label><span className={labelClass}>{foundationMode ? "Payment reference (memo only)" : "Payment Account / Ref"}</span><input className={inputClass} value={form.accountId} onChange={(event) => change("accountId", event.target.value)} /></label>{!foundationMode ? <label><span className={labelClass}>Attachment</span><input className={inputClass + " pt-2"} type="file" accept={attachmentAccept} onChange={(event) => changeAttachment(event.target.files?.[0])} /></label> : null}<label className="md:col-span-2"><span className={labelClass}>Notes</span><textarea className={textareaClass} value={form.notes} onChange={(event) => change("notes", event.target.value)} /></label><div className="flex justify-end md:col-span-2 xl:col-span-3"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy}>Save Cost Row</Button></div></form>;
}

function DocumentEditor({ busy, onSubmit }: { busy: boolean; onSubmit: (payload: { type: string; name: string; upload: DocumentUpload; sensitive: boolean }) => void }) {
  const [type, setType] = useState("PI");
  const [upload, setUpload] = useState<DocumentUpload>();
  const [sensitive, setSensitive] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const selection = useRef(0);
  const documentTypes = ["PO", "PI", "LC", "Swift Copy", "TT Advice", "Commercial Invoice", "Packing List", "Bill of Lading", "COA", "CE Certificate", "ISO Certificate", "Customs Assessment", "Duty Proof", "Freight Invoice", "Bank Advice", "Insurance", "C&F Bill", "Port Bill", "Transport Bill", "Other"];
  const selectFile = (file?: File) => {
    const current = ++selection.current;
    setUpload(undefined); setError("");
    if (!file) { setReading(false); return; }
    setReading(true);
    void readDocumentUpload(file).then((value) => { if (selection.current === current) setUpload(value); }).catch((reason) => { if (selection.current === current) setError(reason instanceof Error ? reason.message : "File could not be read."); }).finally(() => { if (selection.current === current) setReading(false); });
  };
  return (
    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (upload) onSubmit({ type, name: upload.fileName, upload, sensitive }); }}>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}
      <label><span className={labelClass}>Document Type</span><OptionSelect kind="document-type" label="Document type" value={type} onChange={setType} options={documentTypes} required /></label>
      <label><span className={labelClass}>Document</span><input className={inputClass + " pt-2"} type="file" accept={attachmentAccept} required disabled={busy} onChange={(event) => selectFile(event.target.files?.[0])} /></label>
      {reading ? <p role="status" className="text-xs text-cyan-800">Reading selected file...</p> : null}
      {upload ? <div className="rounded-md border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-900"><strong className="block truncate">{upload.fileName}</strong><span>{upload.mimeType} | {(upload.sizeBytes / 1024).toFixed(1)} KB | preview ready</span></div> : null}
      <label className="flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm"><input className="mt-1" type="checkbox" checked={sensitive} onChange={(event) => setSensitive(event.target.checked)} /><span><strong className="block">Sensitive cost/customs file</strong><small className="text-slate-500">Require explicit sensitive-cost visibility to open this file.</small></span></label>
      <p className="text-xs leading-5 text-slate-500">{foundationMode ? "Files are stored privately. PI, LC, invoices and payment documents require sensitive-cost permission to read." : "The mock keeps content in temporary server memory."}</p>
      <div className="flex justify-end"><Button type="submit" variant="primary" icon={<Upload className="h-4 w-4" />} disabled={busy || reading || !upload}>{busy ? "Uploading..." : "Attach Document"}</Button></div>
    </form>
  );
}

function AIDocumentExtractReview({ extraction, busy, onApply }: { extraction: AIDocumentExtraction; busy: boolean; onApply: (fields: AIDocumentExtractionField[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const selectedFields = extraction.fields.filter((field) => selected.includes(`${field.target}:${field.targetId ?? "record"}:${field.key}`));
  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3 rounded-md border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-950"><ScanText className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" /><div><strong>Review before apply</strong><p className="mt-1 text-xs leading-5">Extraction is advisory. Select only verified values; saving runs the same server validation as manual import editing.</p></div></div>
      <div className="grid gap-2">
        {extraction.fields.map((field) => {
          const id = `${field.target}:${field.targetId ?? "record"}:${field.key}`;
          return <label className="grid cursor-pointer gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[24px_minmax(0,1fr)_90px] sm:items-center" key={id}><input type="checkbox" checked={selected.includes(id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, id] : current.filter((value) => value !== id))} /><span className="min-w-0"><strong className="block text-xs text-slate-500">{field.label}</strong><span className="block break-words text-sm font-semibold text-slate-950">{field.value}</span></span><span className="text-xs font-bold text-cyan-700">{Number(field.confidence) * 100}% match</span></label>;
        })}
      </div>
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{extraction.warnings.map((warning) => <p key={warning}>- {warning}</p>)}</div>
      <div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-500">{selectedFields.length} of {extraction.fields.length} fields selected</span><Button variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy || !selectedFields.length} onClick={() => onApply(selectedFields)}>Apply Selected Fields</Button></div>
    </div>
  );
}

function ReceiptEditor({ record, receipts, busy, onSubmit }: { record: ImportCase; receipts: WarehouseReceipt[]; busy: boolean; onSubmit: (payload: Omit<WarehouseReceipt, "id" | "importId" | "reference" | "status" | "receivedBy">) => void }) {
  const warehouse = useQuery({ queryKey: ["operational-settings", "warehouse"], queryFn: operationalService.warehouse, enabled: foundationMode });
  if (foundationMode && warehouse.isPending) return <LoadingBlock label="Loading warehouse configuration" />;
  if (foundationMode && warehouse.isError) return <ErrorBlock error={warehouse.error} />;
  return <ReceiptFields record={record} receipts={receipts} busy={busy} onSubmit={onSubmit} locations={warehouse.data?.locations ?? []} />;
}
function ReceiptFields({ record, receipts, busy, onSubmit, locations }: { record: ImportCase; receipts: WarehouseReceipt[]; busy: boolean; onSubmit: (payload: Omit<WarehouseReceipt, "id" | "importId" | "reference" | "status" | "receivedBy">) => void; locations: string[] }) {
  const processed = useMemo(() => Object.fromEntries(record.items.map((item) => [item.id, receipts.flatMap((receipt) => receipt.lines).filter((line) => line.importItemId === item.id).reduce((sum, line) => sum.plus(line.quantityReceived).plus(line.quantityRejected), new Decimal(0)).toFixed(4)])), [record.items, receipts]);
  const [date, setDate] = useState(businessDate());
  const [error, setError] = useState("");
  const [rows, setRows] = useState(() => Object.fromEntries(record.items.map((item) => [item.id, { received: "", rejected: "0", lot: "", batch: "", manufacturing: "", expiry: "", warehouse: foundationMode ? "Main Warehouse" : "MIPRO Main Warehouse", location: "" }])));
  const update = (id: string, key: string, value: string) => { if (foundationMode && key === "warehouse") return; setRows((current) => ({ ...current, [id]: { ...current[id], [key]: value } })); };
  const issues: string[] = [];
  let hasQuantity = false;
  if (!date || date < record.poDate || date > businessDate()) issues.push("Receiving date must be between the PO date and today.");
  for (const item of record.items) {
    const row = rows[item.id], remaining = new Decimal(item.quantity).minus(processed[item.id] ?? "0");
    if (remaining.lte(0)) continue;
    if (![row.received || "0", row.rejected || "0"].every(value => isDecimalInput(value, 4))) { issues.push(`${item.productCode}: enter valid received/rejected quantities.`); continue; }
    const accepted = new Decimal(row.received || "0"), total = accepted.plus(row.rejected || "0");
    if (total.gt(0)) hasQuantity = true;
    if (total.gt(remaining)) issues.push(`${item.productCode}: received plus rejected exceeds the remaining quantity.`);
    if (accepted.gt(0)) {
      if (!row.lot.trim() || !row.batch.trim() || !row.location.trim()) issues.push(`${item.productCode}: enter lot, batch and BIN / rack location.`);
      if (!row.manufacturing || !row.expiry || row.manufacturing > date || row.expiry <= row.manufacturing || row.expiry <= date) issues.push(`${item.productCode}: manufacturing must be on/before receipt; expiry must be after receipt and manufacturing.`);
    }
  }
  if (!hasQuantity) issues.push("Enter a received or rejected quantity for at least one product.");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    for (const item of record.items) {
      const row = rows[item.id];
      if (![row.received || "0", row.rejected || "0"].every((value) => isDecimalInput(value, 4))) return setError(`${item.productCode}: enter received/rejected quantities with up to four decimal places.`);
      if (new Decimal(row.received || "0").plus(row.rejected || "0").gt(new Decimal(item.quantity).minus(processed[item.id] ?? "0"))) return setError(`${item.productCode}: received plus rejected quantity exceeds the remaining quantity.`);
    }
    const lines = record.items.flatMap((item) => {
      const row = rows[item.id];
        if (new Decimal(row.received || "0").plus(row.rejected || "0").lte(0)) return [];
      return [{ importItemId: item.id, productId: item.productId, productName: item.productName, quantityReceived: row.received || "0", quantityRejected: row.rejected || "0", lotNumber: row.lot || "REJECTED", batchNumber: row.batch || "REJECTED", manufacturingDate: row.manufacturing, expiryDate: row.expiry, warehouse: row.warehouse, location: row.location, landedCostPerUnit: "0.00" }];
    });
    if (!lines.length) return setError("Enter a received or rejected quantity for at least one product.");
    setError("");
      if (issues.length) return setError(issues.join(" "));
      onSubmit({ receivedDate: date, lines });
  };
  return <form className="grid gap-4" onSubmit={submit}>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    <label className="max-w-xs"><span className={labelClass}>Receiving Date</span><input className={inputClass} type="date" value={date} max={businessDate()} onChange={(event) => setDate(event.target.value)} required /></label>
    <datalist id="receiving-bin-locations">{locations.map((location) => <option key={location} value={location} />)}</datalist>
    <div className="grid gap-3">{record.items.map((item) => {
      const row = rows[item.id]; const remaining = Decimal.max(0, new Decimal(item.quantity).minus(processed[item.id] ?? 0));
      return <fieldset className="rounded-md border border-slate-200 p-3" key={item.id} disabled={remaining.lte(0) || busy}>
        <legend className="px-1 text-sm font-bold text-slate-900">{item.productCode} | {item.productName} <span className="font-normal text-slate-500">({formatNumber(remaining.toFixed(4))} {item.unit} remaining)</span></legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(["received", "rejected"] as const).map((key) => <label key={key}><span className={labelClass}>{key === "received" ? "Received Qty" : "Rejected Qty"}</span><input className={inputClass} type="number" min="0" max={remaining.toFixed(4)} step="0.0001" value={row[key]} onChange={(event) => update(item.id, key, event.target.value)} /></label>)}
          {(["lot", "batch"] as const).map((key) => <label key={key}><span className={labelClass}>{key === "lot" ? "Lot Number" : "Batch Number"}</span><input className={inputClass} maxLength={200} value={row[key]} onChange={(event) => update(item.id, key, event.target.value)} required={Number(row.received) > 0} /></label>)}
            {(["manufacturing", "expiry"] as const).map((key) => <label key={key}><span className={labelClass}>{key === "manufacturing" ? "Manufacturing Date" : "Expiry Date"}</span><input className={inputClass} type="date" value={row[key]} max={key === "manufacturing" ? date : undefined} onChange={(event) => update(item.id, key, event.target.value)} required={Number(row.received) > 0} /></label>)}
          <label><span className={labelClass}>Warehouse</span><input className={inputClass} value={row.warehouse} readOnly={foundationMode} onChange={(event) => update(item.id, "warehouse", event.target.value)} required /></label>
          <label><span className={labelClass}>BIN / Rack Location</span><input className={inputClass} list="receiving-bin-locations" value={row.location} maxLength={200} onChange={(event) => update(item.id, "location", event.target.value)} required={Number(row.received) > 0} /></label>
        </div>
      </fieldset>;
    })}</div>
    {issues.length ? <ul className="list-inside list-disc text-xs leading-5 text-amber-900">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : null}
    <div className="flex justify-end"><Button type="submit" variant="primary" icon={<Warehouse className="h-4 w-4" />} disabled={busy || issues.length > 0}>Post Warehouse Receipt</Button></div>
  </form>;
}

function ReopenModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return <Modal open title="Reopen finalized landed cost" subtitle="The finalized version stays in history. State why a correction is required." onClose={onClose}><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onSubmit(reason); }}><label><span className={labelClass}>Required Reason</span><textarea className={textareaClass} minLength={10} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe the source document or amount that must be corrected" /></label><div className="flex justify-end"><Button type="submit" variant="primary" icon={<RotateCcw className="h-4 w-4" />} disabled={busy || reason.trim().length < 10}>Reopen for Correction</Button></div></form></Modal>;
}
