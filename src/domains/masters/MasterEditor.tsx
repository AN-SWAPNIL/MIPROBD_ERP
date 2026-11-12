import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Save, Upload, X } from "lucide-react";
import Button from "../../components/ui/Button";
import { ApiRequestError } from "../../lib/api/client";
import { ErrorBlock, ProductThumb, inputClass, labelClass } from "../components";
import { settingsService, salesService } from "../services";
import type { Product, Supplier, Customer, CashBankAccount } from "../erp.types";
import OptionSelect from "./OptionSelect";
import { imageAccept, productUnits, validateProductImage } from "./options";
import { uploadProductImage } from "./uploads";

export type MasterKind = "products" | "suppliers" | "customers" | "accounts";
export type MasterRecord = Product | Supplier | Customer | CashBankAccount;
export default function MasterEditor({ kind, record, onSaved, accountType, selectionMode = false }: { kind: MasterKind; record?: MasterRecord; onSaved: (row: MasterRecord) => void; accountType?: CashBankAccount["type"]; selectionMode?: boolean }) {
  const client = useQueryClient();
  const fields = kind === "products" ? ["code", "name", "family", "variant", "unit", "hsCode", "standardSalePrice"] : kind === "suppliers" ? ["name", "country", "contactPerson", "phone", "email", "paymentTerms"] : kind === "customers" ? ["name", "type", "contactPerson", "phone", "email", "address", "territory", "paymentTerms", "creditLimit"] : ["name", "type", "accountNumber"];
  const required = kind === "products" ? ["code", "name", "family", "variant", "unit"] : kind === "suppliers" ? ["name", "country"] : ["name", "type"];
  const [values, setValues] = useState<Record<string, string | boolean>>(() => ({
    ...Object.fromEntries(fields.map((key) => [key, String((record as unknown as Record<string, unknown>)?.[key] ?? (["standardSalePrice", "creditLimit"].includes(key) ? "0" : key === "type" ? kind === "customers" ? "Hospital" : accountType ?? "Cash" : key === "unit" ? "Piece" : ""))])),
    imageUrl: record && "imageUrl" in record ? record.imageUrl : "", active: record?.active ?? true
  }));
  const [uploading, setUploading] = useState(false); const [uploadError, setUploadError] = useState(""); const uploadVersion = useRef(0);
  const change = (key: string, value: string | boolean) => setValues((current) => ({ ...current, [key]: value }));
  const save = useMutation({ mutationFn: async (): Promise<MasterRecord> => {
    const data: Record<string, string | boolean | number | undefined> = { ...values, ...(record && "version" in record ? { version: record.version } : {}) };
    if (selectionMode) data.active = true;
    if (accountType) data.type = accountType;
    if (kind !== "products") delete (data as Record<string, unknown>).imageUrl;
    if (kind === "products") return record ? settingsService.updateProduct(record.id, data as Partial<Product>) : settingsService.createProduct(data as Partial<Product>);
    if (kind === "suppliers") return record ? settingsService.updateSupplier(record.id, data as Partial<Supplier>) : settingsService.createSupplier(data as Partial<Supplier>);
    if (kind === "customers") return record ? salesService.updateCustomer(record.id, data as Partial<Customer>) : salesService.createCustomer(data as Partial<Customer>);
    return record ? settingsService.updateAccount(record.id, data as Partial<CashBankAccount>) : settingsService.createAccount({ ...data, balance: "0" } as Partial<CashBankAccount>);
  }, onSuccess: async (row) => {
    client.setQueryData<MasterRecord[]>([kind], (old) => old ? [...old.filter((v) => v.id !== row.id), row] : [row]);
    await client.invalidateQueries({ queryKey: [kind] });
    if (kind === "suppliers") await client.invalidateQueries({ queryKey: ["accounts", "suppliers"] });
    await client.invalidateQueries({ queryKey: ["sales", "lookup"] });
    await client.invalidateQueries({ queryKey: ["sales", "page"] });
    await client.invalidateQueries({ queryKey: ["sales", "summary"] });
    await client.invalidateQueries({ queryKey: ["persistent-dashboard"] });
    await client.invalidateQueries({ queryKey: ["reports"] });
    await client.invalidateQueries({ queryKey: ["sales", "payment-accounts"] });
    if (kind === "accounts") {
      await client.invalidateQueries({ queryKey: ["payroll", "accounts"] });
      await client.invalidateQueries({ queryKey: ["sales", "refund-accounts"] });
      await client.invalidateQueries({ queryKey: ["ledger", "cash-masters"] });
    }
    onSaved(row);
  } });
  const selectImage = async (file?: File) => {
    const attempt = ++uploadVersion.current; setUploadError("");
    if (!file) { setUploading(false); return; }
    try { validateProductImage(file); setUploading(true); const path = await uploadProductImage(file); if (uploadVersion.current === attempt) change("imageUrl", path); }
    catch (error) { if (uploadVersion.current === attempt) setUploadError(error instanceof Error ? error.message : "Image upload failed."); }
    finally { if (uploadVersion.current === attempt) setUploading(false); }
  };
  const labels: Record<string, string> = { code: "Product code", name: "Name", family: "Product family", variant: "Variant / Specification", unit: "Unit", hsCode: "HS code", standardSalePrice: "Standard sale price (BDT)", country: "Country", contactPerson: "Contact person", phone: "Phone", email: "Email", paymentTerms: "Payment terms", type: kind === "customers" ? "Customer type" : "Account type", accountNumber: "Account number", address: "Address", territory: "Territory", creditLimit: "Credit limit (BDT)" };
  const issue = (key: string) => save.error instanceof ApiRequestError ? save.error.issues.find((v) => v.field === key)?.message : undefined;
  return <form className="grid min-w-0 gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); if (!uploading) save.mutate(); }}>
    {save.isError ? <div className="sm:col-span-2"><ErrorBlock error={save.error} title="Record could not be saved" /></div> : null}
    {fields.map((key) => <label className="min-w-0" key={key}><span className={labelClass}>{labels[key]}</span>
      {key === "unit" ? <OptionSelect kind="unit" label="Unit" required value={String(values[key])} options={productUnits} onChange={(v) => change(key, v)} /> : key === "family" ? <OptionSelect kind="product-family" label="Product family" required value={String(values[key])} options={["Dialyzer", "Bloodline", "AV Fistula", "Medical Consumables", "Equipment", "Other"]} onChange={(v) => change(key, v)} /> : key === "country" ? <OptionSelect kind="country" label="Country" required value={String(values[key])} options={["Bangladesh", "China", "Japan", "India", "Germany", "South Korea", "Taiwan", "Singapore", "United Kingdom", "United States"]} onChange={(v) => change(key, v)} /> : key === "type" ? <select aria-label={labels[key]} required disabled={Boolean(accountType)} className={inputClass} value={accountType ?? String(values[key])} onChange={(e) => change(key, e.target.value)}>{(kind === "customers" ? ["Hospital", "Clinic", "Dealer", "Pharmacy", "Other"] : ["Cash", "Bank", "Mobile Banking"]).map((v) => <option key={v}>{v}</option>)}</select> : <input name={key} className={inputClass} type={key === "email" ? "email" : ["standardSalePrice", "creditLimit"].includes(key) ? "number" : "text"} min="0" step="0.01" maxLength={200} required={required.includes(key)} aria-invalid={Boolean(issue(key))} value={String(values[key])} onChange={(e) => change(key, e.target.value)} />}
      {issue(key) ? <small className="mt-1 block text-red-700">{issue(key)}</small> : null}
    </label>)}
    {kind === "products" ? <div className="flex min-w-0 items-start gap-3 rounded-md border border-blue-100 bg-blue-50/40 p-3 sm:col-span-2"><ProductThumb src={String(values.imageUrl)} name={String(values.name || "Product")} size="lg" /><div className="min-w-0 flex-1"><label><span className={labelClass}>Product image</span><input aria-label="Product image" type="file" className={inputClass + " h-auto py-2"} accept={imageAccept} disabled={uploading || save.isPending} onChange={(e) => void selectImage(e.target.files?.[0])} /></label><p className="mt-1 text-xs text-slate-500">JPG, PNG or WebP. Smaller than 1 MB.</p>{uploading ? <p role="status" className="mt-2 flex items-center gap-2 text-xs text-cyan-800"><Upload className="h-4 w-4" />Uploading image...</p> : null}{uploadError ? <p role="alert" className="mt-2 text-sm text-red-700">{uploadError}</p> : null}</div>{values.imageUrl ? <Button type="button" title="Remove image" aria-label="Remove image" disabled={uploading} icon={<X className="h-4 w-4" />} onClick={() => change("imageUrl", "")} /> : null}</div> : null}
    {!selectionMode ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(values.active)} onChange={(e) => change("active", e.target.checked)} />Active</label> : null}
    <div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" disabled={save.isPending || uploading} icon={<Save className="h-4 w-4" />}>{save.isPending ? "Saving..." : "Save"}</Button></div>
  </form>;
}
