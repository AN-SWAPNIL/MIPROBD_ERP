import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, MapPin, Pencil, X } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import Button from "../../components/ui/Button";
import { useAuthStore } from "../../lib/auth/session";
import { hasEffectivePermission, isSuperAdmin } from "../../lib/permissions/effectiveAccess";
import { ErrorBlock, LoadingBlock } from "../components";
import { ReasonForm, titleCase } from "./WorkforceForms";
import { VisitSiteForm } from "./VisitSettingsForms";
import { visitService as api } from "./visitService";
import { workforceService } from "./workforceService";

export const visitTime = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" });
const RecordedVisitMap = lazy(() => import("./RecordedVisitMap"));
export default function FieldVisitDetail({ id }: { id: string }) {
  const actor = useAuthStore((s) => s.session!.user); const client = useQueryClient();
  const detail = useQuery({ queryKey: ["workforce", "visit", id], queryFn: () => api.detail(id) });
  const [mode, setMode] = useState<"complete" | "accept" | "reject" | "void" | "site" | null>(null);
  const [photoError, setPhotoError] = useState<Error | null>(null);
  const [showMap, setShowMap] = useState(false);
  const approve = hasEffectivePermission(actor, "marketing", "approve");
  const site = useQuery({ queryKey: ["workforce", "customer-site", detail.data?.visit.customerId], queryFn: () => api.site(detail.data!.visit.customerId!), enabled: mode === "site" && Boolean(detail.data?.visit.customerId) });
  const action = useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onSuccess: () => { setMode(null); void client.invalidateQueries({ queryKey: ["workforce"] }); void client.invalidateQueries({ queryKey: ["reports"] }); } });
  if (detail.isPending) return <LoadingBlock label="Loading visit timeline" />;
  if (detail.isError) return <ErrorBlock error={detail.error} />;
  const { visit: v, events, policySnapshot, site: originalSite } = detail.data;
  const own = v.employeeId === actor.id; const editable = hasEffectivePermission(actor, "marketing", "edit");
  const openPhoto = async () => {
    const tab = window.open("about:blank", "_blank"); if (tab) tab.opener = null; setPhotoError(null);
    try { const url = await workforceService.document(v.photoId!); if (tab) tab.location.replace(url); else throw new Error("Allow a new tab to open private evidence."); }
    catch (error) { tab?.close(); setPhotoError(error instanceof Error ? error : new Error("Evidence unavailable.")); }
  };
  return <div className="grid gap-4 text-sm" data-testid="field-visit-detail">
    <div className="grid gap-3 border-b border-blue-100 pb-4 sm:grid-cols-2"><div><strong className="text-blue-950">{v.reference}</strong><p>{v.employee} | {v.employeeCode}</p><p className="mt-1 text-slate-500">{v.subject}</p></div><div className="sm:text-right"><strong>{titleCase(v.status)} | Review: {v.review}</strong><p>Saved: {visitTime(v.receivedAt)} (Dhaka)</p>{v.completedAt ? <p>Completed: {visitTime(v.completedAt)}</p> : null}</div></div>
    <div><strong>Purpose</strong><p className="whitespace-pre-wrap break-words">{v.purpose}</p>{v.outcome ? <><strong className="mt-3 block">Outcome</strong><p className="whitespace-pre-wrap break-words">{v.outcome}</p></> : null}</div>
    <div className="grid gap-2 border-y border-blue-100 bg-blue-50/50 p-3"><strong>Recorded location evidence</strong><p>{titleCase(v.quality)} | Site: {titleCase(v.match)}</p>{v.position ? <><p>{v.position.latitude.toFixed(6)}, {v.position.longitude.toFixed(6)} | accuracy about {Math.round(v.position.accuracy)} m</p><p className="text-xs text-slate-500">Browser timestamp (unverified): {visitTime(v.position.capturedAt)}</p></> : <p>No location captured.</p>}{v.locationReason ? <p>Exception: {v.locationReason}</p> : null}<p>Distance to approved site: {v.distanceMeters === null ? "No approved reference" : `${v.distanceMeters} m`}</p><p className="text-xs leading-5 text-slate-500">Policy v{v.policyVersion}: age {policySnapshot.data.maxAgeSeconds}s, accuracy warning {policySnapshot.data.accuracyMeters}m, site radius {policySnapshot.data.radiusMeters}m. {originalSite ? `Site v${originalSite.version}: ${originalSite.source}.` : "No approved site was available."} This is a reported event, not current location or attendance proof. No visit score is awarded.</p></div>
    {v.position ? <div className="grid gap-2"><div className="flex flex-wrap items-center gap-3"><Button icon={<MapPin className="h-4 w-4" />} onClick={() => setShowMap(!showMap)}>{showMap ? "Hide Map" : "Show Map"}</Button><p className="max-w-lg text-xs leading-5 text-slate-500">Loading the map shares the approximate area and your IP with the map provider. Employee names and photos are not sent.</p></div>{showMap ? <Suspense fallback={<LoadingBlock label="Loading recorded point map" />}><RecordedVisitMap visit={v} /></Suspense> : null}</div> : null}
    <div>{v.photoId ? <Button icon={<Camera className="h-4 w-4" />} onClick={() => void openPhoto()}>Open Private Photo</Button> : <p>No photo: {v.photoReason}</p>}{v.photoId ? <p className="mt-1 text-xs text-slate-500">{titleCase(v.photoMethod)} is a source claim, not camera attestation.</p> : null}{photoError ? <ErrorBlock error={photoError} /> : null}</div>
    {v.status !== "Voided" ? <div className="flex flex-wrap gap-2">
      {own && editable && v.status === "CheckedIn" ? <Button variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => setMode("complete")}>Complete Visit</Button> : null}
      {(!own || isSuperAdmin(actor)) && approve ? <><Button icon={<Check className="h-4 w-4" />} onClick={() => setMode("accept")}>Accept for Review</Button><Button variant="danger" icon={<X className="h-4 w-4" />} onClick={() => setMode("reject")}>Reject for Review</Button></> : null}
      {(own && editable) || approve ? <Button variant="danger" icon={<X className="h-4 w-4" />} onClick={() => setMode("void")}>Void Visit</Button> : null}
      {approve && v.customerId && hasEffectivePermission(actor, "customers") ? <Button icon={<MapPin className="h-4 w-4" />} onClick={() => setMode("site")}>Customer Site Reference</Button> : null}
    </div> : null}
    {action.isError ? <ErrorBlock error={action.error} /> : null}
    {mode ? <div className="grid gap-3 border-t border-blue-100 pt-3"><div className="flex items-center justify-between"><strong>{titleCase(mode)}</strong><Button title="Cancel action" aria-label="Cancel action" variant="ghost" disabled={action.isPending} icon={<X className="h-4 w-4" />} onClick={() => { setMode(null); action.reset(); }} /></div>
      {mode === "site" ? site.isPending ? <LoadingBlock label="Loading approved reference" /> : site.isError ? <ErrorBlock error={site.error} /> : <VisitSiteForm key={site.data?.id ?? "new"} latitude={site.data?.latitude} longitude={site.data?.longitude} source={site.data?.source} busy={action.isPending} onSave={(value) => action.mutate(() => api.saveSite(v.customerId!, { ...value, version: site.data?.version ?? 0 }))} /> : <ReasonForm key={mode} busy={action.isPending} label={mode === "complete" ? "Visit Outcome" : "Reason"} nextDate={mode === "complete"} onSave={(reason, nextFollowUpAt) => action.mutate(() => mode === "complete" ? api.complete(id, { version: v.version, outcome: reason, ...(nextFollowUpAt ? { nextFollowUpAt } : {}) }) : mode === "void" ? api.void(id, { version: v.version, reason }) : api.review(id, { version: v.version, reason, decision: mode === "accept" ? "Accepted" : "Rejected" }))} />}
    </div> : null}
    <div className="border-t border-blue-100 pt-3"><h3 className="mb-3 flex items-center gap-2 font-bold text-blue-950"><Pencil className="h-4 w-4" />Saved Timeline</h3><ol className="grid gap-3">{events.map((e) => <li className="border-l-2 border-cyan-600 pl-3" key={e.id}><strong>{titleCase(e.type)}</strong><p className="text-xs text-slate-500">{visitTime(e.recordedAt)} | {e.actor}</p>{typeof e.details.reason === "string" ? <p className="mt-1 whitespace-pre-wrap break-words">{e.details.reason}</p> : null}</li>)}</ol></div>
  </div>;
}
