import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Plus, Save } from "lucide-react";
import { cloneElement, useId, useState, type FormEvent, type ReactElement, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import { useAuthStore } from "../../lib/auth/session";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { ErrorBlock, LoadingBlock, Modal, Panel, Segmented, TableFrame, inputClass, labelClass, textareaClass } from "../components";
import { allocationChoice, importCostCategory, decisionInput, presetInput, warehouseInput, type DecisionData, type PresetData, type WarehouseData } from "./operationalContracts";
import { operationalService as api } from "./operationalService";

type View = "warehouse" | "presets" | "decisions";
type Preset = PresetData & { id: string; version: number };
type Decision = DecisionData & { id: string; version: number };
export default function OperationalSettingsPage() {
  const user = useAuthStore((s) => s.session!.user); const navigate = useNavigate(); const client = useQueryClient();
  const [view, setView] = useState<View>("warehouse"); const [preset, setPreset] = useState<Preset | "new" | null>(null); const [decision, setDecision] = useState<Decision | null>(null);
  const warehouse = useQuery({ queryKey: ["operational-settings", "warehouse"], queryFn: api.warehouse });
  const presets = useQuery({ queryKey: ["operational-settings", "presets"], queryFn: api.presets });
  const decisions = useQuery({ queryKey: ["operational-settings", "decisions"], queryFn: api.decisions, enabled: user.role === "Super Admin" });
  const canEdit = hasEffectivePermission(user, "settings", "edit"); const canCreate = hasEffectivePermission(user, "settings", "create");
  const save = useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onSuccess: () => { setPreset(null); setDecision(null); void client.invalidateQueries({ queryKey: ["operational-settings"] }); void client.invalidateQueries({ queryKey: ["settings"] }); } });
  return <div className="grid min-w-0 gap-5" data-testid="operational-settings">
    <PageHeader title="Operational Settings" subtitle="Single company | Main Warehouse" actions={<Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate("/backend/settings")}>Settings</Button>} />
    <Segmented value={view} onChange={setView} ariaLabel="Operational settings views" options={[{ value: "warehouse", label: "Warehouse" }, { value: "presets", label: "Cost Presets" }, ...(user.role === "Super Admin" ? [{ value: "decisions" as const, label: "Client Confirmation Queue" }] : [])]} />
    {save.isError && !preset && !decision ? <ErrorBlock error={save.error} /> : null}
    {view === "warehouse" ? warehouse.isPending ? <LoadingBlock label="Loading warehouse" /> : warehouse.isError ? <ErrorBlock error={warehouse.error} /> : <Panel title="Main Warehouse" subtitle={`Saved version ${warehouse.data.version}`}><div className="p-4"><WarehouseForm key={warehouse.data.version} value={warehouse.data} editable={canEdit} busy={save.isPending} onSave={(body) => save.mutate(() => api.saveWarehouse(body))} /></div></Panel> : null}
    {view === "presets" ? <Panel title="Import Cost Presets" subtitle="Suggestions only; every cost row still needs an explicit allocation choice" actions={canCreate ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { save.reset(); setPreset("new"); }}>Add Preset</Button> : null}>
      {presets.isPending ? <LoadingBlock label="Loading cost presets" /> : presets.isError ? <ErrorBlock error={presets.error} /> : <><TableFrame><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-blue-950 text-white"><tr>{["Name", "Category", "Suggested Basis", "Status", "Action"].map((c) => <th className="px-4 py-3" key={c}>{c}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{presets.data.map((p) => <tr key={p.id}><td className="px-4 py-3 font-semibold">{p.name}</td><td className="px-4 py-3">{p.category}</td><td className="px-4 py-3">{p.suggestedAllocationMethod ?? "Not confirmed"}</td><td className="px-4 py-3">{p.active ? "Active" : "Inactive"}</td><td className="px-4 py-3">{canEdit ? <Button title={`Edit ${p.name}`} aria-label={`Edit ${p.name}`} variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => { save.reset(); setPreset(p); }} /> : null}</td></tr>)}</tbody></table></TableFrame>{!presets.data.length ? <p className="p-8 text-center text-sm text-slate-500">No cost presets saved.</p> : null}</>}
    </Panel> : null}
    {view === "decisions" && user.role === "Super Admin" ? <Panel title="Client Confirmation Queue" subtitle="Recording an agreement does not automatically change financial or approval controls">
      {decisions.isPending ? <LoadingBlock label="Loading client decisions" /> : decisions.isError ? <ErrorBlock error={decisions.error} /> : <div className="divide-y divide-blue-100">{decisions.data.map((d) => <div key={d.id} className="flex flex-col gap-3 p-4 sm:flex-row"><div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-blue-950">{d.title}</h3><p className="mt-1 text-sm">{d.question}</p><p className="mt-2 text-xs leading-5 text-slate-500">{d.currentBehavior}</p><p className="mt-2 text-xs font-semibold text-cyan-800">{d.status}{d.confirmedBy ? ` | ${d.confirmedBy}` : ""}</p>{d.resolutionValue ? <p className="mt-2 break-words text-sm">{d.resolutionValue}<small className="mt-1 block text-slate-500">{d.resolutionNotes}</small></p> : null}</div>{canEdit ? <Button icon={<Pencil className="h-4 w-4" />} onClick={() => { save.reset(); setDecision(d); }}>Record Decision</Button> : null}</div>)}</div>}
    </Panel> : null}
    {preset ? <Modal open title={preset === "new" ? "New Cost Preset" : "Edit Cost Preset"} onClose={() => { if (!save.isPending) setPreset(null); }}>{save.isError ? <ErrorBlock error={save.error} /> : null}<PresetForm value={preset === "new" ? undefined : preset} busy={save.isPending} onSave={(body) => save.mutate(() => api.savePreset(preset === "new" ? null : preset.id, body))} /></Modal> : null}
    {decision ? <Modal open title={decision.title} onClose={() => { if (!save.isPending) setDecision(null); }}>{save.isError ? <ErrorBlock error={save.error} /> : null}<DecisionForm value={decision} busy={save.isPending} onSave={(body) => save.mutate(() => api.saveDecision(decision.id, body))} /></Modal> : null}
  </div>;
}
function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return <div className="min-w-0"><label htmlFor={id} className={labelClass}>{label}</label>{cloneElement(children, { id })}</div>;
}
function ValidatedForm({ children, schema, body, busy, onSave }: { children: ReactNode; schema: z.ZodType; body: unknown; busy: boolean; onSave: (body: unknown) => void }) {
  const [error, setError] = useState("");
  function submit(e: FormEvent) { e.preventDefault(); const parsed = schema.safeParse(body); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the entered values."); return; } setError(""); onSave(parsed.data); }
  return <form className="grid gap-4" onSubmit={submit}>{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}<fieldset disabled={busy} className="grid min-w-0 gap-4">{children}<div className="flex justify-end"><Button type="submit" variant="primary" disabled={busy} icon={<Save className="h-4 w-4" />}>Save Changes</Button></div></fieldset></form>;
}
function WarehouseForm({ value, editable, busy, onSave }: { value: WarehouseData & { version: number }; editable: boolean; busy: boolean; onSave: (b: unknown) => void }) {
  const [form, setForm] = useState(value); const [locations, setLocations] = useState(value.locations.join("\n")); const [reason, setReason] = useState("");
  const { version, ...data } = form;
  const fields = <><div className="grid gap-4 sm:grid-cols-2">{(["address", "contactPerson", "phone"] as const).map((key) => <Field key={key} label={{ address: "Address", contactPerson: "Contact Person", phone: "Phone" }[key]}><input className={inputClass} value={form[key]} maxLength={500} disabled={!editable} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></Field>)}</div><Field label="BIN / Rack Locations (one per line)"><textarea className={textareaClass} value={locations} disabled={!editable} onChange={(e) => setLocations(e.target.value)} /></Field></>;
  return editable ? <ValidatedForm schema={warehouseInput} body={{ version, data: { ...data, locations: locations.split("\n").map((s) => s.trim()).filter(Boolean) }, reason }} busy={busy} onSave={onSave}>{fields}<Field label="Reason for Change"><input className={inputClass} value={reason} minLength={5} maxLength={1000} required onChange={(e) => setReason(e.target.value)} /></Field></ValidatedForm> : <div className="grid gap-4">{fields}</div>;
}
function PresetForm({ value, busy, onSave }: { value?: Preset; busy: boolean; onSave: (b: unknown) => void }) {
  const [name, setName] = useState(value?.name ?? ""); const [category, setCategory] = useState(value?.category ?? "Freight"); const [method, setMethod] = useState(value?.suggestedAllocationMethod ?? ""); const [active, setActive] = useState(value?.active ?? true); const [reason, setReason] = useState("");
  return <ValidatedForm schema={presetInput} body={{ ...(value ? { version: value.version } : {}), data: { name, category, ...(method ? { suggestedAllocationMethod: method } : {}), active, requiresExplicitChoice: true }, reason }} busy={busy} onSave={onSave}>
    <Field label="Name"><input aria-label="Preset name" className={inputClass} required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Category"><select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>{importCostCategory.options.map((c) => <option key={c}>{c}</option>)}</select></Field>
    <Field label="Suggested Allocation Basis"><select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}><option value="">Not confirmed</option>{allocationChoice.options.map((m) => <option key={m}>{m}</option>)}</select></Field>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Active</label><Field label="Reason for Change"><input className={inputClass} required minLength={5} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
  </ValidatedForm>;
}
function DecisionForm({ value, busy, onSave }: { value: Decision; busy: boolean; onSave: (b: unknown) => void }) {
  const [status, setStatus] = useState(value.status); const [resolutionValue, setResolution] = useState(value.resolutionValue); const [resolutionNotes, setNotes] = useState(value.resolutionNotes); const [reason, setReason] = useState("");
  return <ValidatedForm schema={decisionInput} body={{ version: value.version, status, resolutionValue, resolutionNotes, reason }} busy={busy} onSave={onSave}>
    <p className="text-sm text-slate-600">{value.question}</p><Field label="Status"><select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option>Pending Client Confirmation</option><option>Confirmed</option></select></Field>
    <Field label="Agreed Decision"><input className={inputClass} value={resolutionValue} maxLength={500} required={status === "Confirmed"} onChange={(e) => setResolution(e.target.value)} /></Field><Field label="Approval Evidence / Notes"><textarea className={textareaClass} value={resolutionNotes} maxLength={3000} required={status === "Confirmed"} onChange={(e) => setNotes(e.target.value)} /></Field><Field label="Reason for Change"><input className={inputClass} required minLength={5} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
  </ValidatedForm>;
}
