import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, FileCheck2, Upload, X } from "lucide-react";
import Button from "../../components/ui/Button";
import DocumentViewer from "../../components/documents/DocumentViewer";
import StatusBadge from "../../components/ui/StatusBadge";
import { apiRequest } from "../../lib/api/client";
import { useAuthStore } from "../../lib/auth/session";
import { hasCapability } from "../../lib/permissions/effectiveAccess";
import { ErrorBlock, LoadingBlock, Modal, Panel, TableFrame, textareaClass } from "../components";
import type { DocumentRecord } from "../erp.types";
import { qualityEvidenceSchema, qualityFileInput, qualityUploadSchema, type QualityKind } from "./contracts";
import { attachmentAccept,attachmentMime } from "../../lib/files/attachments";

export default function QualityAttachments({ kind, sourceId }: { kind: QualityKind; sourceId: string }) {
  const client = useQueryClient(), input = useRef<HTMLInputElement>(null);
  const user = useAuthStore(s => s.session?.user), cost = hasCapability(user, "view_sensitive_cost");
  const [sensitive, setSensitive] = useState(false), [preview, setPreview] = useState<DocumentRecord | null>(null);
  const [withdraw, setWithdraw] = useState<string | null>(null), [reason, setReason] = useState("");
  const path = `/api/quality-evidence/${encodeURIComponent(kind)}/${encodeURIComponent(sourceId)}`;
  const query = useQuery({ queryKey: ["quality-evidence", kind, sourceId], queryFn: async ({ signal }) => qualityEvidenceSchema.parse((await apiRequest(path, { signal })).data) });
  const upload = useMutation({ mutationFn: async (file: File) => {
    if (!query.data) throw new Error("Inspection source is not loaded.");
    const mimeType=attachmentMime(file.name,file.type);
    const payload = qualityFileInput.parse({ version: query.data.version, fileName: file.name, mimeType, sizeBytes: file.size, sensitive });
    const auth = qualityUploadSchema.parse((await apiRequest(`${path}/uploads`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(payload) })).data);
    const result = await fetch(auth.signedUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file });
    if (!result.ok) throw new Error("Upload failed. Cancel the pending upload or try again.");
    await apiRequest(`/api/quality-evidence/uploads/${auth.id}/complete`, { method: "POST", body: "{}" });
  }, onSettled: async () => { if (input.current) input.current.value = ""; await client.invalidateQueries({ queryKey: ["quality-evidence", kind, sourceId] }); } });
  const cancel = useMutation({ mutationFn: async () => {
    if (!query.data || !withdraw) throw new Error("No attachment selected.");
    await apiRequest(`${path}/withdraw/${withdraw}`, { method: "POST", body: JSON.stringify({ version: query.data.version, reason: reason.trim() }) });
  }, onSuccess: async () => { setWithdraw(null); setReason(""); await client.invalidateQueries({ queryKey: ["quality-evidence", kind, sourceId] }); } });
  const data = query.data, busy = upload.isPending || cancel.isPending;
  return <Panel title="Inspection Attachments" subtitle={data?.sealed ? "Approval evidence frozen | Original files retained" : "Optional photos & supporting documents"} actions={data?.canEdit ? <>
    {cost ? <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={sensitive} disabled={busy} onChange={e => setSensitive(e.target.checked)} />Commercially sensitive</label> : null}
    <Button icon={<Upload className="h-4 w-4" />} disabled={busy} onClick={() => { upload.reset(); input.current?.click(); }}>{upload.isPending ? "Uploading..." : "Attach File"}</Button>
  </> : data?.sealed ? <FileCheck2 className="h-5 w-5 text-emerald-700" aria-label="Evidence frozen" /> : null}>
    <input ref={input} className="hidden" type="file" aria-label="Inspection attachment" accept={attachmentAccept} disabled={!data?.canEdit || busy} onChange={e => { const file = e.target.files?.[0]; if (file) upload.mutate(file); }} />
    {query.isPending ? <LoadingBlock /> : query.isError ? <ErrorBlock error={query.error} /> : null}
    {upload.isError ? <ErrorBlock error={upload.error} /> : null}
    {data?.files.length ? <TableFrame><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-blue-50 text-blue-950"><tr>{["File / Size", "Uploaded By", "Status", "Actions"].map(h => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{data.files.map(file => <tr key={file.id}>
      <td className="max-w-72 break-words p-3 font-semibold">{file.fileName}<small className="block font-normal">{(file.sizeBytes / 1024).toFixed(1)} KB{file.sensitive ? " | Restricted" : ""}{file.inherited ? " | Earlier revision" : ""}</small></td>
      <td className="p-3">{file.uploadedByName}<small className="block text-xs text-slate-500">{new Date(file.createdAt).toLocaleDateString("en-GB")}</small></td>
      <td className="max-w-64 break-words p-3"><StatusBadge status={file.state} />{file.reason ? <small className="mt-1 block">{file.reason}</small> : null}</td>
      <td className="p-3"><div className="flex gap-2">{["Attached", "Withdrawn"].includes(file.state) ? <Button title="View protected file" aria-label={`View ${file.fileName}`} icon={<Eye className="h-4 w-4" />} onClick={() => setPreview({ id: file.id, entityType: "quality", entityId: sourceId, documentType: "Inspection Evidence", source: "UPLOADED", fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, sha256: file.sha256 ?? undefined, previewUrl: "", sensitive: file.sensitive, createdByUserId: file.uploadedBy, createdByName: file.uploadedByName, createdAt: file.createdAt })} /> : null}
        {data.canEdit && ["Attached", "Pending"].includes(file.state) ? <Button disabled={busy} title={file.state === "Pending" ? "Cancel pending upload" : "Withdraw from current review"} aria-label={`Withdraw ${file.fileName}`} icon={<X className="h-4 w-4" />} onClick={() => { cancel.reset(); setReason(""); setWithdraw(file.id); }} /> : null}</div></td>
    </tr>)}</tbody></table></TableFrame> : data ? <p className="p-4 text-sm text-slate-500">No inspection attachments. Photos are optional.</p> : null}
    {data?.restrictedFiles ? <p className="border-t border-blue-100 p-3 text-xs text-slate-500">{data.restrictedFiles} commercial attachment(s) restricted to authorized finance reviewers.</p> : null}
    <DocumentViewer document={preview} onClose={() => setPreview(null)} />
    <Modal open={Boolean(withdraw)} title="Withdraw Attachment From Review" onClose={() => { if (!cancel.isPending) setWithdraw(null); }}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (!busy && reason.trim().length >= 5) cancel.mutate(); }}>
        <label className="block text-sm font-semibold">Reason<textarea className={`${textareaClass} mt-2`} required minLength={5} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <p className="text-xs text-slate-500">The original file and previous approval evidence remain retained.</p>
        {cancel.isError ? <ErrorBlock error={cancel.error} /> : null}
        <div className="flex justify-end gap-2"><Button type="button" disabled={busy} onClick={() => setWithdraw(null)}>Cancel</Button><Button type="submit" variant="primary" disabled={busy || reason.trim().length < 5}>Withdraw</Button></div>
      </form>
    </Modal>
  </Panel>;
}
