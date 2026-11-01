import { useEffect, useState } from "react";
import { Download, ExternalLink, FileImage, FileSpreadsheet, FileText, LoaderCircle, X } from "lucide-react";
import Button from "../ui/Button";
import type { DocumentRecord, DocumentUpload } from "../../domains/erp.types";
import { fileService } from "../../domains/services";
import { attachmentMime, attachmentLabel, hasDocumentPreview, officeMimes } from "../../lib/files/attachments";
import { foundationMode } from "../../lib/runtime";

export function readDocumentUpload(file: File): Promise<DocumentUpload> {
  if (file.size > 5_000_000) return Promise.reject(new Error("Attachment must be 5 MB or smaller."));
  let mimeType:string;
  try{mimeType=attachmentMime(file.name,file.type,!foundationMode);}catch(error){return Promise.reject(error);}
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.onload = () => resolve({ fileName: file.name, mimeType, sizeBytes: file.size, fileDataUrl: String(reader.result) });
    reader.readAsDataURL(new Blob([file],{type:mimeType}));
  });
}

function formatBytes(bytes?: number) {
  if (!bytes) return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentViewer({ document, onClose }: { document: DocumentRecord | null; onClose: () => void }) {
  const [objectUrl, setObjectUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!document) return;
    let active = true;
    let currentUrl = "";
    setLoading(true);
    setError("");
    void fileService.open(document)
      .then((blob) => {
        if (!active) return;
        currentUrl = URL.createObjectURL(blob);
        setObjectUrl(currentUrl);
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Document could not be opened."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      setObjectUrl("");
    };
  }, [document]);

  useEffect(() => {
    if (!document) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [document, onClose]);

  if (!document) return null;
  const isImage = document.mimeType.startsWith("image/");
  const previewable = hasDocumentPreview(document.mimeType);
  const spreadsheet = [officeMimes.xlsx,"text/csv"].includes(document.mimeType);
  const download = () => {
    if (!objectUrl) return;
    const link = window.document.createElement("a");
    link.href = objectUrl;
    link.download = document.fileName;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`View ${document.fileName}`} data-testid="document-viewer">
      <button className="absolute inset-0" type="button" onClick={onClose} aria-label="Close document viewer" />
      <section className="relative flex h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-md bg-white shadow-2xl sm:h-[92vh] sm:rounded-md">
        <header className="flex shrink-0 items-start gap-3 border-b border-slate-200 px-3 py-3 sm:px-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-blue-50 text-blue-700">{isImage ? <FileImage className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold text-slate-950 sm:text-base" title={document.fileName}>{document.fileName}</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">{document.documentType} | {formatBytes(document.sizeBytes)} | Uploaded by {document.createdByName}</p>
          </div>
          <div className="hidden shrink-0 gap-2 sm:flex">
            {previewable?<Button icon={<ExternalLink className="h-4 w-4" />} disabled={!objectUrl} onClick={() => objectUrl && window.open(objectUrl, "_blank", "noopener,noreferrer")}>Open in New Tab</Button>:null}
            <Button icon={<Download className="h-4 w-4" />} disabled={!objectUrl} onClick={download}>Download</Button>
          </div>
          <button className="rounded p-2 text-slate-500 hover:bg-slate-100" type="button" onClick={onClose} aria-label="Close document viewer" title="Close"><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 bg-slate-100 p-2 sm:p-4">
          {loading ? <div className="grid h-full place-items-center"><div className="text-center text-sm font-semibold text-slate-500"><LoaderCircle className="mx-auto mb-2 h-6 w-6 animate-spin text-cyan-700" />Loading protected preview...</div></div> : null}
          {error ? <div className="grid h-full place-items-center"><div className="max-w-md rounded-md border border-red-200 bg-red-50 p-5 text-center"><FileText className="mx-auto h-8 w-8 text-red-400" /><strong className="mt-2 block text-sm text-red-800">Preview unavailable</strong><p className="mt-1 text-xs leading-5 text-red-700">{error}</p></div></div> : null}
          {!loading && !error && objectUrl ? isImage ? <div className="grid h-full place-items-center overflow-auto"><img className="max-h-full max-w-full rounded-sm bg-white object-contain shadow" src={objectUrl} alt={document.fileName} /></div> : previewable ? <iframe className="h-full w-full rounded-sm border-0 bg-white shadow" src={objectUrl} title={document.fileName} /> : <div className="grid h-full place-items-center p-4"><div className="min-w-0 max-w-md space-y-3 text-center">{spreadsheet?<FileSpreadsheet className="mx-auto h-12 w-12 text-emerald-700"/>:<FileText className="mx-auto h-12 w-12 text-blue-800"/>}<h3 className="break-words text-base font-bold text-blue-950">{attachmentLabel(document.mimeType)}</h3><p className="text-sm text-slate-600">Preview unavailable for this format.</p><Button variant="primary" icon={<Download className="h-4 w-4"/>} onClick={download}>Download File</Button></div></div> : null}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-white px-3 py-2 sm:hidden">
          {previewable?<Button icon={<ExternalLink className="h-4 w-4" />} disabled={!objectUrl} onClick={() => objectUrl && window.open(objectUrl, "_blank", "noopener,noreferrer")} aria-label="Open in new tab" title="Open in new tab" />:null}
          <Button icon={<Download className="h-4 w-4" />} disabled={!objectUrl} onClick={download}>Download</Button>
          <Button onClick={onClose}>Close</Button>
        </footer>
      </section>
    </div>
  );
}
