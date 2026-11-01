import { useQuery } from "@tanstack/react-query";
import { Download, Eye, FileCheck2, Info, MessageSquareText, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import CertificatePreviewModal from "./components/CertificatePreviewModal";
import ContactCTA from "./components/ContactCTA";
import PublicPageHero from "./components/PublicPageHero";
import SectionHeading from "./components/SectionHeading";
import { publicSiteService } from "./publicSiteService";
import type { PublicCertificate } from "./public.types";
import { usePublicMeta } from "./usePublicMeta";

const statusClass: Record<PublicCertificate["status"], string> = {
  Current: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Expired: "border-rose-200 bg-rose-50 text-rose-800",
  "Historical reference": "border-amber-200 bg-amber-50 text-amber-900"
};

export default function CertificatesPage() {
  usePublicMeta({
    title: "Certificates & Product Documentation | MIPRO Healthcare Corporation",
    description: "Review how MIPRO presents manufacturer certificates, product conformity records and supply documentation with clear ownership and scope.",
    path: "/certificates",
    image: "/products/dialyzer.jpg"
  });
  const certificates = useQuery({ queryKey: ["public", "certificates"], queryFn: () => publicSiteService.certificates() });
  const [selectedCertificate, setSelectedCertificate] = useState<PublicCertificate | null>(null);

  return (
    <>
      <PublicPageHero eyebrow="Quality & documentation" title="Certificates presented with clear ownership" body="Documentation is matched to the exact manufacturer, product family and requested model. Partner certificates are never represented as MIPRO corporate certification." image="/products/dialyzer.jpg" imageAlt="Hemodialyzer product used as a documentation context" />
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex gap-4 rounded-md border border-blue-200 bg-blue-50 p-5 text-blue-950"><Info className="h-6 w-6 shrink-0 text-blue-700" /><div><h2 className="font-bold">Important document distinction</h2><p className="mt-2 text-sm leading-6">These are manufacturer documents migrated from MIPRO's previous public certificate page. They are not MIPRO corporate certificates. Status labels are based only on dates visible in each scan; buyers should verify the exact model and current issuing-body record before relying on a document.</p></div></div>
          <div className="mt-12"><SectionHeading eyebrow="Published documents" title="Manufacturer records with visible validity context" body="Preview or download each original scan. Historical and expired records remain visible for traceability, with their limitations stated beside the file." /></div>
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {(certificates.data ?? []).map((certificate) => (
              <article className="flex flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm" id={certificate.id} key={certificate.id}>
                <button className="group relative h-64 overflow-hidden border-b border-slate-200 bg-slate-100 p-4 text-left" onClick={() => setSelectedCertificate(certificate)} type="button">
                  <img className="mx-auto h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]" src={certificate.file.url} alt={certificate.file.alt} />
                  <span className="absolute bottom-3 right-3 inline-flex h-9 items-center gap-2 rounded-md bg-slate-950/85 px-3 text-xs font-bold text-white"><Eye className="h-4 w-4" /> Preview scan</span>
                </button>
                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-cyan-700">{certificate.type}</p>
                      <h2 className="mt-2 text-lg font-bold leading-6 text-slate-950">{certificate.title}</h2>
                    </div>
                    <span className={`rounded-md border px-2 py-1 text-xs font-bold ${statusClass[certificate.status]}`}>{certificate.status}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{certificate.summary}</p>
                  <dl className="mt-5 grid gap-4 border-t border-slate-200 pt-4 text-xs sm:grid-cols-2">
                    <div><dt className="font-semibold text-slate-500">Document owner</dt><dd className="mt-1 font-bold leading-5 text-slate-800">{certificate.documentOwner}</dd></div>
                    <div><dt className="font-semibold text-slate-500">Related product</dt><dd className="mt-1 font-bold leading-5 text-slate-800">{certificate.relatedProducts.join(", ")}</dd></div>
                    <div><dt className="font-semibold text-slate-500">Issued / first shown</dt><dd className="mt-1 font-bold text-slate-800">{certificate.issuedOn ?? "Not stated"}</dd></div>
                    <div><dt className="font-semibold text-slate-500">Visible valid-until date</dt><dd className="mt-1 font-bold text-slate-800">{certificate.validUntil ?? "Not stated"}</dd></div>
                  </dl>
                  <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">{certificate.statusNote}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                    <button className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-900 px-3 text-sm font-bold text-white hover:bg-blue-800" onClick={() => setSelectedCertificate(certificate)} type="button"><Eye className="h-4 w-4" /> Preview</button>
                    <a className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50" download={certificate.file.downloadName} href={certificate.file.url}><Download className="h-4 w-4" /> Download</a>
                    <Link className="inline-flex h-10 items-center gap-2 px-2 text-sm font-bold text-blue-900" to={`/contact?subject=${encodeURIComponent("Documentation request")}`}><MessageSquareText className="h-4 w-4" /> Request complete set</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="bg-slate-50 py-14">
        <div className="mx-auto grid max-w-7xl gap-5 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
          {[[ShieldCheck, "Verify the exact model", "Documents are checked against the specific quoted product and variant."], [FileCheck2, "Confirm the owner", "Manufacturer and MIPRO records remain clearly distinguished."], [MessageSquareText, "Request a review", "Institutional buyers can request relevant documents during quotation review."]].map(([Icon, title, body]) => {
            const ItemIcon = Icon as typeof ShieldCheck;
            return <div className="border-t-2 border-cyan-600 pt-5" key={title as string}><ItemIcon className="h-6 w-6 text-cyan-700" /><h2 className="mt-3 font-bold text-slate-950">{title as string}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{body as string}</p></div>;
          })}
        </div>
      </section>
      <ContactCTA />
      {selectedCertificate ? <CertificatePreviewModal certificate={selectedCertificate} onClose={() => setSelectedCertificate(null)} /> : null}
    </>
  );
}
