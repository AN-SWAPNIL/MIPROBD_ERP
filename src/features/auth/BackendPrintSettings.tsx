import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import { ErrorBlock, LoadingBlock, inputClass, labelClass } from "../../domains/components";
import type { PrintConfiguration, PrintIdentity } from "../../domains/erp.types";
import { settingsService } from "../../domains/services";
import { useAuthStore } from "../../lib/auth/session";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { useToastStore } from "../../lib/ui/toast";

export default function BackendPrintSettings() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.session?.user);
  const client = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const config = useQuery({ queryKey: ["settings", "print"], queryFn: settingsService.printConfiguration });
  const save = useMutation({
    mutationFn: settingsService.updatePrintConfiguration,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["settings", "print"] });
      await client.invalidateQueries({ queryKey: ["print", "configuration"] });
      toast({ kind: "success", title: "Company stationery saved" });
    }
  });
  return <>
    <PageHeader title="Company Stationery" subtitle="Company identities and A4 content alignment" actions={<Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate("/backend/settings")}>Settings</Button>} />
    {config.isPending ? <LoadingBlock /> : config.isError ? <ErrorBlock error={config.error} onRetry={() => void config.refetch()} /> : <StationeryForm key={config.data.version} config={config.data} editable={hasEffectivePermission(user, "settings", "edit")} busy={save.isPending} error={save.error} onSave={(value) => save.mutate(value)} onReload={() => { save.reset(); void config.refetch(); }} />}
  </>;
}

function StationeryForm({ config, editable, busy, error, onSave, onReload }: { config: PrintConfiguration; editable: boolean; busy: boolean; error: Error | null; onSave: (value: PrintConfiguration) => void; onReload: () => void }) {
  const [value, setValue] = useState(() => structuredClone(config));
  const update = (id: string, change: Partial<PrintIdentity>) => setValue((current) => ({ ...current, identities: current.identities.map((item) => item.id === id ? { ...item, ...change } : item) }));
  const submit = (event: FormEvent) => { event.preventDefault(); if (editable && !busy) onSave(value); };
  const limits = { topMm: [35, 65], rightMm: [5, 35], bottomMm: [20, 45], leftMm: [22.5, 40] };
  return <form className="space-y-6 border-y border-blue-200 bg-white px-4 py-5" onSubmit={submit}>
    <fieldset disabled={!editable || busy} className="grid gap-4 sm:grid-cols-2">
      <label><span className={labelClass}>Default company</span><select className={inputClass} value={value.defaultIdentityId} onChange={(event) => setValue({ ...value, defaultIdentityId: event.target.value as PrintIdentity["id"] })}>{value.identities.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
      <label><span className={labelClass}>Default print mode</span><select className={inputClass} value={value.defaultLetterheadMode} onChange={(event) => setValue({ ...value, defaultLetterheadMode: event.target.value as "Digital" | "Preprinted" })}><option value="Digital">With Background</option><option value="Preprinted">Without Background</option></select></label>
    </fieldset>
    {value.identities.map((item) => <fieldset disabled={!editable || busy} key={item.id} className="grid gap-4 border-t border-blue-100 pt-5 sm:grid-cols-2 lg:grid-cols-3">
      <legend className="px-2 text-sm font-bold text-blue-950">{item.displayName}</legend>
      <img src={item.backgroundImageUrl} alt={`${item.displayName} letterhead`} className="row-span-5 max-h-80 w-full object-contain lg:col-start-3" />
      {(["displayName", "companyName", "address", "phone", "email", "website", "authorizedSignatory", "footerText"] as const).map((key) => <label className="min-w-0" key={key}><span className={labelClass}>{({ displayName: "Short company name", companyName: "Registered company name", address: "Address", phone: "Phone", email: "Email", website: "Website", authorizedSignatory: "Signatory label", footerText: "Footer text" })[key]}</span><input className={inputClass} type={key === "email" ? "email" : "text"} required={["displayName", "companyName", "address", "email", "authorizedSignatory"].includes(key)} maxLength={key === "address" ? 500 : key === "footerText" ? 300 : 180} value={item[key]} onChange={(event) => update(item.id, { [key]: event.target.value })} /></label>)}
      <label><span className={labelClass}>Approved letterhead</span><select className={inputClass} value={item.backgroundImageUrl} onChange={(event) => update(item.id, { backgroundImageUrl: event.target.value })}><option value="/mipro-letterhead.jpg">MIPRO letterhead</option><option value="/led-letterhead.jpg">LED Trackers letterhead</option></select></label>
      <div className="sm:col-span-2 lg:col-span-3"><h2 className="mb-3 text-xs font-semibold text-slate-600">Content safe area (mm)</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(["topMm", "rightMm", "bottomMm", "leftMm"] as const).map((key) => <label key={key}><span className={labelClass}>{key.replace("Mm", "")}</span><input className={inputClass} type="number" step="0.1" required min={limits[key][0]} max={limits[key][1]} value={item.safeArea[key]} onChange={(event) => update(item.id, { safeArea: { ...item.safeArea, [key]: Number(event.target.value) } })} /></label>)}</div></div>
    </fieldset>)}
    {error ? <ErrorBlock error={error} onRetry={onReload} /> : null}
    <div className="flex justify-end">{editable ? <Button type="submit" variant="primary" disabled={busy} icon={<Save className="h-4 w-4" />}>Save Stationery</Button> : null}</div>
  </form>;
}
