import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, PackagePlus, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import { ErrorBlock, LoadingBlock, Panel, ProductThumb, inputClass, labelClass, textareaClass } from "../components";
import { importService, settingsService } from "../services";
import { useToastStore } from "../../lib/ui/toast";
import { businessDate } from "../../lib/date";
import { workspacePath } from "../../lib/runtime";

type DraftLine = { id: string; productId: string; quantity: string };

const blankLine = (): DraftLine => ({ id: `draft-line-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, productId: "", quantity: "1" });

export default function NewImportPage() {
  const navigate = useNavigate();
  const pushToast = useToastStore((state) => state.push);
  const suppliersQuery = useQuery({ queryKey: ["suppliers"], queryFn: settingsService.suppliers });
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: settingsService.products });
  const [form, setForm] = useState({ supplierId: "", poNumber: "", poDate: businessDate(), expectedShipmentDate: "", notes: "" });
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);

  const mutation = useMutation({
    mutationFn: () => {
      const supplier = suppliersQuery.data?.find((entry) => entry.id === form.supplierId);
      if (!supplier || !form.poNumber.trim() || !lines.length || lines.some((line) => !line.productId || Number(line.quantity) <= 0)) {
        throw new Error("Select a supplier, enter the PO, and add at least one product with a positive expected quantity.");
      }
      return importService.create({
        supplierId: supplier.id,
        supplierName: supplier.name,
        poNumber: form.poNumber.trim(),
        poDate: form.poDate,
        paymentMode: "Pending",
        currency: "USD",
        exchangeRate: "0",
        rateDate: "",
        rateSource: "Pending",
        expectedShipmentDate: form.expectedShipmentDate || undefined,
        notes: form.notes || undefined,
        items: lines.map((line) => {
          const product = productsQuery.data!.find((entry) => entry.id === line.productId)!;
          return {
            id: line.id,
            productId: product.id,
            productCode: product.code,
            productName: product.name,
            quantity: line.quantity,
            unit: product.unit,
            currency: "USD",
            fobUnitForeign: "0",
            exchangeRate: "0",
            fobTotalBdt: "0",
            cbmPerCarton: "0",
            cartonCount: "0",
            totalCbm: "0",
            cbmMode: "CALCULATED" as const,
            hsCode: product.hsCode
          };
        })
      });
    },
    onSuccess: (record) => {
      pushToast({ kind: "success", title: "Draft import created", message: `${record.draftReference} is ready for PI and LC/TT continuation.` });
      navigate(workspacePath(`/app/imports/${record.id}`));
    },
    onError: (error) => pushToast({ kind: "error", title: "Could not create draft import", message: error instanceof Error ? error.message : undefined })
  });

  if (suppliersQuery.isLoading || productsQuery.isLoading) return <LoadingBlock label="Loading supplier and product masters" />;
  if (suppliersQuery.isError || productsQuery.isError) return <ErrorBlock error={suppliersQuery.error ?? productsQuery.error} />;
  const products = productsQuery.data ?? [];
  const change = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const updateLine = (id: string, key: "productId" | "quantity", value: string) => setLines((current) => current.map((line) => line.id === id ? { ...line, [key]: value } : line));

  return (
    <>
      <PageHeader
        eyebrow="PO → Supplier → PI → LC / TT"
        title="Create draft import"
        subtitle="Start with the purchase commitment. PI, payment mode, bank reference, shipment details and costing are added progressively to this same record."
        actions={<Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate(workspacePath("/app/imports"))}>Back to Register</Button>}
      />
      <Panel title="Purchase order header" subtitle="The system generates an IMP reference immediately; no PI or LC decision is required yet.">
        <form className="grid gap-5 p-4" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="xl:col-span-2"><span className={labelClass}>Supplier</span><select className={inputClass} required value={form.supplierId} onChange={(event) => change("supplierId", event.target.value)}><option value="">Select supplier</option>{suppliersQuery.data?.filter((entry) => entry.active).map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.country}</option>)}</select></label>
            <label><span className={labelClass}>PO Number</span><input className={inputClass} required value={form.poNumber} onChange={(event) => change("poNumber", event.target.value)} placeholder="PO-2026-..." /></label>
            <label><span className={labelClass}>PO Date</span><input className={inputClass} type="date" required value={form.poDate} onChange={(event) => change("poDate", event.target.value)} /></label>
            <label><span className={labelClass}>Target Shipment <small className="font-normal normal-case">(optional)</small></span><input className={inputClass} type="date" value={form.expectedShipmentDate} onChange={(event) => change("expectedShipmentDate", event.target.value)} /></label>
            <label className="md:col-span-2 xl:col-span-3"><span className={labelClass}>Purchase / Production Notes <small className="font-normal normal-case">(optional)</small></span><textarea className={textareaClass} value={form.notes} onChange={(event) => change("notes", event.target.value)} placeholder="Initial specifications, supplier instruction or target timing" /></label>
          </div>

          <section className="rounded-md border border-slate-200">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="flex items-center gap-2 text-sm font-bold text-slate-950"><PackagePlus className="h-4 w-4 text-cyan-700" /> Expected Products</h2><p className="mt-1 text-xs text-slate-500">FOB, exchange rate, cartons and CBM are intentionally completed after the PI arrives.</p></div>
              <Button type="button" icon={<Plus className="h-4 w-4" />} onClick={() => setLines((current) => [...current, blankLine()])}>Add Product</Button>
            </div>
            <div className="grid gap-3 p-3">
              {lines.map((line, index) => {
                const product = products.find((entry) => entry.id === line.productId);
                return <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-[56px_minmax(0,1fr)_150px_40px] sm:items-end" key={line.id}>
                  <ProductThumb src={product?.imageUrl} name={product?.name ?? `Product ${index + 1}`} size="lg" />
                  <label><span className={labelClass}>Product Variant</span><select className={inputClass} required value={line.productId} onChange={(event) => updateLine(line.id, "productId", event.target.value)}><option value="">Select product</option>{products.filter((entry) => entry.active).map((entry) => <option key={entry.id} value={entry.id}>{entry.code} · {entry.name}</option>)}</select></label>
                  <label><span className={labelClass}>Expected Quantity</span><input className={inputClass} type="number" min="1" step="1" required value={line.quantity} onChange={(event) => updateLine(line.id, "quantity", event.target.value)} /></label>
                  <Button type="button" variant="ghost" icon={<Trash2 className="h-4 w-4 text-rose-600" />} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((entry) => entry.id !== line.id))} aria-label="Remove product" title="Remove product" />
                </div>;
              })}
            </div>
          </section>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" onClick={() => navigate(workspacePath("/app/imports"))}>Cancel</Button>
            <Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={mutation.isPending}>{mutation.isPending ? "Creating..." : "Create Draft Import"}</Button>
          </div>
        </form>
      </Panel>
    </>
  );
}
