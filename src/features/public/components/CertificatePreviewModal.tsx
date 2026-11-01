import { useEffect } from "react";
import { Download, ExternalLink, X } from "lucide-react";
import type { PublicCertificate } from "../public.types";

type CertificatePreviewModalProps = {
  certificate: PublicCertificate;
  onClose: () => void;
};

export default function CertificatePreviewModal({ certificate, onClose }: CertificatePreviewModalProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div
      aria-label={`${certificate.title} preview`}
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="dialog"
    >
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-md bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-cyan-700">Manufacturer document preview</p>
            <h2 className="mt-1 truncate text-base font-bold text-slate-950 sm:text-lg">{certificate.title}</h2>
          </div>
          <button
            aria-label="Close certificate preview"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            onClick={onClose}
            title="Close preview"
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3 sm:p-6">
          <img className="mx-auto h-auto max-w-full bg-white shadow-sm" src={certificate.file.url} alt={certificate.file.alt} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:px-5">
          <p className="max-w-2xl text-xs leading-5 text-slate-600">{certificate.statusNote}</p>
          <div className="flex flex-wrap gap-2">
            <a className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50" href={certificate.file.url} rel="noreferrer" target="_blank">
              <ExternalLink className="h-4 w-4" /> Open full size
            </a>
            <a className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-900 px-3 text-sm font-bold text-white hover:bg-blue-800" download={certificate.file.downloadName} href={certificate.file.url}>
              <Download className="h-4 w-4" /> Download
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
