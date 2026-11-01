import { useState } from "react";
import Button from "../../components/ui/Button";
import { inputClass, textareaClass } from "../components";
import type { VisitPolicyData } from "./visitContracts";
import { WorkforceField } from "./WorkforceUi";

export function VisitPolicyForm({ data, busy, onSave }: { data: VisitPolicyData; busy: boolean; onSave: (data: VisitPolicyData, reason: string) => void }) {
  const [draft, setDraft] = useState(data); const [reason, setReason] = useState("");
  const fields = [{ key: "maxAgeSeconds", label: "Maximum Location Age (Seconds)", min: 10, max: 300 }, { key: "accuracyMeters", label: "Accuracy Warning (Meters)", min: 10, max: 2000 }, { key: "radiusMeters", label: "Advisory Site Radius (Meters)", min: 25, max: 2000 }, { key: "photoRetentionDays", label: "Photo Retention Policy (Days)", min: 1, max: 365 }] as const;
  return <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); onSave(draft, reason); }}>
    <div className="grid gap-3 sm:grid-cols-2">{fields.map((f) => <WorkforceField label={f.label} key={f.key}><input className={inputClass} required type="number" min={f.min} max={f.max} step={1} value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })} /></WorkforceField>)}</div>
    <label className="flex items-start gap-2 text-sm leading-6"><input className="mt-1" type="checkbox" checked={draft.privacyApproved} onChange={(e) => setDraft({ ...draft, privacyApproved: e.target.checked })} />Employee notice, authorized management access, correction route and retention procedures have been approved for this pilot.</label>
    <p className="text-xs leading-5 text-amber-900">Production check-ins are blocked until approval is recorded. Retention days are a policy snapshot, not a scheduled deletion job. Arrange evidence cleanup/backup handling before approval. Visit scoring is disabled.</p>
    <WorkforceField label="Approval Reference / Change Reason"><textarea className={textareaClass} minLength={5} maxLength={3000} required value={reason} onChange={(e) => setReason(e.target.value)} /></WorkforceField>
    <Button variant="primary" type="submit" disabled={busy}>Save Visit Policy</Button>
  </form>;
}

export function VisitSiteForm({ latitude, longitude, source, busy, onSave }: { latitude?: number; longitude?: number; source?: string; busy: boolean; onSave: (value: { latitude: number; longitude: number; source: string; reason: string }) => void }) {
  const [lat, setLat] = useState(latitude?.toString() ?? ""); const [lon, setLon] = useState(longitude?.toString() ?? ""); const [reference, setReference] = useState(source ?? ""); const [reason, setReason] = useState("");
  return <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); onSave({ latitude: Number(lat), longitude: Number(lon), source: reference, reason }); }}>
    <p className="text-sm leading-6 text-slate-600">Use a separately confirmed customer site, not an employee check-in. New versions affect future visits only.</p>
    <div className="grid gap-3 sm:grid-cols-2"><WorkforceField label="Latitude"><input className={inputClass} required type="number" min={-90} max={90} step="any" value={lat} onChange={(e) => setLat(e.target.value)} /></WorkforceField><WorkforceField label="Longitude"><input className={inputClass} required type="number" min={-180} max={180} step="any" value={lon} onChange={(e) => setLon(e.target.value)} /></WorkforceField></div>
    <WorkforceField label="Confirmed Source"><input className={inputClass} required minLength={5} maxLength={3000} value={reference} onChange={(e) => setReference(e.target.value)} /></WorkforceField>
    <WorkforceField label="Confirmation Reason"><textarea className={textareaClass} required minLength={5} maxLength={3000} value={reason} onChange={(e) => setReason(e.target.value)} /></WorkforceField>
    <Button variant="primary" disabled={busy} type="submit">Confirm Site Reference</Button>
  </form>;
}
