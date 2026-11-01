import { Check, LocateFixed, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Button from "../../components/ui/Button";
import { ErrorBlock, inputClass, textareaClass } from "../components";
import type { WorkforceReferences } from "./persistentContracts";
import type { VisitPosition } from "./visitContracts";
import { freshVisitPosition } from "./visitCapture";
import { visitService as api } from "./visitService";
import VisitPhotoCapture, { type VisitPhoto } from "./VisitPhotoCapture";
import { WorkforceField } from "./WorkforceUi";
import { ApiRequestError } from "../../lib/api/client";
import { useQuery } from "@tanstack/react-query";
import { workforceService } from "./workforceService";
import { businessDate } from "../../lib/date";

export default function FieldVisitCheckin({ references, actorId, onSaved, onBusy }: { references: WorkforceReferences; actorId: string; onSaved: (id: string) => void; onBusy: (value: boolean) => void }) {
  const [contact, setContact] = useState(""); const [purpose, setPurpose] = useState("");
  const [attempt, setAttempt] = useState<Awaited<ReturnType<typeof api.attempt>> | null>(null);
  const [photo, setPhoto] = useState<VisitPhoto | null>(null); const [photoReason, setPhotoReason] = useState("");
  const [position, setPosition] = useState<VisitPosition | null>(null); const [noLocation, setNoLocation] = useState(false); const [locationReason, setLocationReason] = useState("");
  const [busy, setBusy] = useState(false); const [photoBusy, setPhotoBusy] = useState(false); const [error, setError] = useState<Error | null>(null);
  const mounted = useRef(true);
  const pending = useRef<Record<string, unknown> | null>(null); const [retry, setRetry] = useState(false);
  const [activityId, setActivityId] = useState("");
  const notes = useQuery({ queryKey: ["workforce", "visit-linkable-notes", actorId, businessDate()], queryFn: () => workforceService.activities({ employee: actorId, from: businessDate(), to: businessDate(), pageSize: 100 }), enabled: Boolean(attempt) });
  const matchingNotes = notes.data?.rows.filter((r) => r.status === "Submitted" && (contact === `customer:${r.customerId}` || contact === `lead:${r.leadId}`)) ?? [];
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const task = async (run: () => Promise<void>) => {
    setBusy(true); onBusy(true); setError(null);
    try { await run(); } catch (e) { if (mounted.current) setError(e instanceof Error ? e : new Error("Please retry.")); }
    finally { if (mounted.current) { setBusy(false); onBusy(false); } }
  };
  const submit = () => void task(async () => {
    if (!attempt) return;
    if (!pending.current && Date.parse(attempt.expiresAt) <= Date.now()) throw new Error("Capture attempt expired. Close this form and start a fresh check-in.");
    // Evidence uploads finish first; refresh coordinates immediately before saving.
    if (!pending.current) {
      const latest = noLocation ? null : await freshVisitPosition();
      if (!mounted.current) return;
      setPosition(latest);
      if (latest && latest.accuracy > attempt.policy.data.accuracyMeters && locationReason.trim().length < 5) throw new Error(`Accuracy is about ${Math.round(latest.accuracy)} m. Add a location exception reason, then save again.`);
      pending.current = { attemptId: attempt.id, position: latest, locationReason, photoMethod: photo?.method ?? "NONE", photoReason, ...(photo ? { photoId: photo.id } : {}), ...(activityId ? { activityId } : {}) };
      setRetry(true);
    }
    let saved: { id: string };
    try { saved = await api.checkIn(pending.current); }
    catch (error) { if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500 && error.status !== 408) { pending.current = null; setRetry(false); } throw error; }
    if (mounted.current) { onBusy(false); onSaved(saved.id); }
  });
  return <div className="grid gap-4" data-testid="field-visit-checkin">
    <p className="border-l-4 border-cyan-600 bg-cyan-50 p-3 text-sm leading-6 text-blue-950">Location is captured only on request. Do not photograph patients, medical records or unauthorized faces. Record hospital photography restrictions as a no-photo reason.</p>
    {error ? <ErrorBlock error={error} /> : null}
    <fieldset disabled={busy || Boolean(attempt)} className="grid gap-3 sm:grid-cols-2">
      <WorkforceField label="Assigned Customer / Lead"><select aria-label="Check-in contact" className={inputClass} value={contact} onChange={(e) => setContact(e.target.value)}><option value="">Select contact</option><optgroup label="Customers">{references.customers.filter((r) => r.assignedTo === actorId).map((r) => <option key={r.id} value={`customer:${r.id}`}>{r.name}</option>)}</optgroup><optgroup label="Leads">{references.leads.filter((r) => r.assignedTo === actorId).map((r) => <option key={r.id} value={`lead:${r.id}`}>{r.name}</option>)}</optgroup></select></WorkforceField>
      <WorkforceField label="Visit Purpose"><input aria-label="Visit purpose" className={inputClass} maxLength={3000} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Procurement discussion, demonstration..." /></WorkforceField>
    </fieldset>
    {retry ? <p role="status" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Submission may already be saved. Retry sends the exact same capture to recover its result without creating another visit.</p> : null}
    {!attempt ? <><p className="text-xs text-slate-500">New prospect? Save a Lead first, then return here.</p><Button variant="primary" disabled={busy || !contact || purpose.trim().length < 3} icon={<Check className="h-4 w-4" />} onClick={() => void task(async () => { const split = contact.indexOf(":"); const saved = await api.attempt({ [contact.slice(0, split) === "customer" ? "customerId" : "leadId"]: contact.slice(split + 1), purpose }); if (mounted.current) setAttempt(saved); })}>Prepare Check-in</Button></> : <>
      {matchingNotes.length ? <WorkforceField label="Link Existing Activity (Optional)"><select aria-label="Link existing activity" disabled={busy || retry} className={inputClass} value={activityId} onChange={(e) => setActivityId(e.target.value)}><option value="">No linked activity</option>{matchingNotes.map((r) => <option key={r.id} value={r.id}>{r.reference} | {r.purpose}</option>)}</select><p className="mt-1 text-xs text-slate-500">Same contact and business date only. Linking avoids counting this note as an additional visit.</p></WorkforceField> : null}
      {notes.data && notes.data.total > 100 ? <p className="text-xs text-amber-900">Activity choices show the latest 100 notes today.</p> : null}
      <div className="grid gap-3 border-t border-blue-100 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-blue-950">1. Optional photo</strong><span className="text-xs text-slate-500">Expires {new Date(attempt.expiresAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka" })} (Dhaka)</span></div>
        <fieldset disabled={busy || retry}><VisitPhotoCapture attemptId={attempt.id} photo={photo} onChange={(p) => { setPhoto(p); setPosition(null); }} onBusy={(v) => { setPhotoBusy(v); onBusy(v); }} /></fieldset>
        {!photo ? <WorkforceField label="No-photo Reason"><textarea aria-label="No-photo reason" className={textareaClass} value={photoReason} maxLength={3000} onChange={(e) => setPhotoReason(e.target.value)} placeholder="Photography prohibited by the hospital..." /></WorkforceField> : null}
      </div>
      <div className="grid gap-3 border-t border-blue-100 pt-3"><strong className="text-sm text-blue-950">2. Location and submission</strong><fieldset disabled={busy || retry} className="grid gap-3">
        <div className="flex flex-wrap gap-2"><Button disabled={busy || photoBusy} icon={<LocateFixed className="h-4 w-4" />} onClick={() => void task(async () => { const p = await freshVisitPosition(); if (mounted.current) { setPosition(p); setNoLocation(false); } })}>Check Location</Button><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy || photoBusy} checked={noLocation} onChange={(e) => { setNoLocation(e.target.checked); setPosition(null); }} />Location unavailable</label></div>
        {position ? <p className="text-sm text-slate-600">Reported point: {position.latitude.toFixed(5)}, {position.longitude.toFixed(5)} | accuracy about {Math.round(position.accuracy)} m. Refreshed when saving.</p> : null}
        <WorkforceField label={noLocation || (position && position.accuracy > attempt.policy.data.accuracyMeters) ? "Location Exception Reason (Required)" : "Location Exception Reason (If Needed)"}><textarea aria-label="Location exception reason" className={textareaClass} maxLength={3000} value={locationReason} onChange={(e) => setLocationReason(e.target.value)} placeholder="Permission denied, indoor signal, site restrictions..." /></WorkforceField>
        </fieldset><Button variant="primary" disabled={busy || photoBusy || (!photo && photoReason.trim().length < 5) || (noLocation && locationReason.trim().length < 5)} icon={busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />} onClick={submit}>{busy ? "Saving / Capturing..." : retry ? "Retry Saved Submission" : "Save Check-in"}</Button>
      </div>
    </>}
  </div>;
}
