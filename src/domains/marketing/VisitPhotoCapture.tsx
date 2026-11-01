import { Camera, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Button from "../../components/ui/Button";
import { ErrorBlock } from "../components";
import { compressVisitPhoto } from "./visitCapture";
import { visitService } from "./visitService";

export type VisitPhoto = { id: string; file: File; method: "IN_APP_CAMERA" | "FILE_SELECTED" };
export default function VisitPhotoCapture({ attemptId, photo, onChange, onBusy }: { attemptId: string; photo: VisitPhoto | null; onChange: (photo: VisitPhoto | null) => void; onBusy: (busy: boolean) => void }) {
  const video = useRef<HTMLVideoElement>(null); const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true); const requestId = useRef(0);
  const [camera, setCamera] = useState(false); const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<Error | null>(null); const [preview, setPreview] = useState("");
  const stop = () => { requestId.current++; stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop(); }; }, []);
  useEffect(() => { if (!photo) return; const url = URL.createObjectURL(photo.file); setPreview(url); return () => URL.revokeObjectURL(url); }, [photo]);
  useEffect(() => { if (camera && video.current && stream.current) { video.current.srcObject = stream.current; void video.current.play().catch(() => undefined); } }, [camera]);
  const task = async (run: () => Promise<void>) => {
    setBusy(true); onBusy(true); setError(null);
    try { await run(); } catch (e) { if (mounted.current) setError(e instanceof Error ? e : new Error("Please retry.")); }
    finally { if (mounted.current) { setBusy(false); onBusy(Boolean(stream.current)); } }
  };
  const upload = async (blob: Blob, method: VisitPhoto["method"]) => {
    const file = await compressVisitPhoto(blob); const id = await visitService.upload(file, attemptId);
    if (mounted.current) onChange({ id, file, method });
  };
  return <div className="grid gap-3">
    {error ? <ErrorBlock error={error} /> : null}
    {camera ? <><video ref={video} autoPlay muted playsInline onLoadedData={(e) => setReady(Math.min(e.currentTarget.videoWidth,e.currentTarget.videoHeight)>=16)} onResize={(e) => setReady(Math.min(e.currentTarget.videoWidth,e.currentTarget.videoHeight)>=16)} className="aspect-video w-full rounded-md bg-black object-contain" /><div className="flex gap-2"><Button disabled={busy || !ready} icon={<Camera className="h-4 w-4" />} onClick={() => void task(async () => {
      const v = video.current; if (!v || Math.min(v.videoWidth,v.videoHeight)<16 || v.readyState<2) throw new Error("Camera is not ready yet. Wait for the preview and retry.");
      const canvas = document.createElement("canvas"); const ratio = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight)); canvas.width = Math.round(v.videoWidth * ratio); canvas.height = Math.round(v.videoHeight * ratio);
      const context = canvas.getContext("2d"); if (!context) throw new Error("Camera capture is unavailable."); context.drawImage(v, 0, 0, canvas.width, canvas.height); stop(); setCamera(false);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85)); if (!blob) throw new Error("Could not capture photo."); await upload(blob, "IN_APP_CAMERA");
    })}>Take Photo</Button><Button disabled={busy} aria-label="Close camera" title="Close camera" icon={<X className="h-4 w-4" />} onClick={() => { stop(); setCamera(false); onBusy(false); }} /></div></> : null}
    {photo && preview ? <div className="flex items-center gap-3"><img src={preview} alt="Visit evidence preview" className="h-24 w-32 rounded border border-blue-200 object-contain" /><div className="text-xs text-slate-600">Private upload | {Math.ceil(photo.file.size / 1024)} KB<br />{photo.method === "IN_APP_CAMERA" ? "In-app camera (employee claim)" : "Selected file; not camera-attested"}<Button variant="ghost" disabled={busy} icon={<X className="h-4 w-4" />} onClick={() => onChange(null)}>Remove Photo</Button></div></div> : null}
    <div className="flex flex-wrap gap-2"><Button disabled={busy || camera} icon={<Camera className="h-4 w-4" />} onClick={() => void task(async () => {
      stop(); setReady(false); const request = requestId.current;
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera requires HTTPS. Choose a photo or record a no-photo reason.");
      const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      if (!mounted.current || request !== requestId.current) { next.getTracks().forEach((t) => t.stop()); return; }
      stream.current = next; setCamera(true); onBusy(true);
    })}>{photo ? "Retake Photo" : "Open Camera"}</Button><label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-950"><Upload className="h-4 w-4" />Choose Photo<input aria-label="Choose visit photo" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy || camera} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void task(() => upload(file, "FILE_SELECTED")); }} /></label></div>
  </div>;
}
