import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Eye, FileCheck2, MessageSquareText, PackageSearch } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import ContactCTA from "./components/ContactCTA";
import PublicProductCard from "./components/PublicProductCard";
import { publicSiteService } from "./publicSiteService";
import { usePublicMeta } from "./usePublicMeta";

export default function ProductDetailPage() {
  const { slug = "" } = useParams();
  const product = useQuery({ queryKey: ["public", "product", slug], queryFn: () => publicSiteService.product(slug) });
  const certificates = useQuery({ queryKey: ["public", "certificates"], queryFn: () => publicSiteService.certificates() });
  const related = useQuery({
    queryKey: ["public", "products", "related", product.data?.category ?? "none"],
    queryFn: async () => (await publicSiteService.products({ category: product.data?.category })).filter((entry) => entry.slug !== slug).slice(0, 3),
    enabled: Boolean(product.data)
  });
  usePublicMeta({
    title: product.data ? `${product.data.name} | MIPRO Healthcare Corporation` : "Product | MIPRO Healthcare Corporation",
    description: product.data?.shortDescription ?? "Review medical products supplied by MIPRO Healthcare Corporation.",
    path: `/products/${slug}`,
    image: product.data?.images[0] ?? "/medical-products.png"
  });

  if (product.isLoading) return <div className="grid min-h-[60vh] place-items-center bg-white text-sm font-semibold text-slate-500">Loading product...</div>;
  if (!product.data) {
    return <section className="grid min-h-[60vh] place-items-center bg-slate-50 px-4"><div className="max-w-lg text-center"><PackageSearch className="mx-auto h-10 w-10 text-cyan-700" /><h1 className="mt-4 text-3xl font-bold text-slate-950">Product not found</h1><p className="mt-3 text-sm leading-6 text-slate-600">This item is not in the current published MiproBD catalogue.</p><Link className="mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-blue-900 px-4 text-sm font-bold text-white" to="/products"><ArrowLeft className="h-4 w-4" /> Browse products</Link></div></section>;
  }

  const entry = product.data;
  const productCertificates = (certificates.data ?? []).filter((certificate) => entry.certificateIds.includes(certificate.id));

  return (
    <>
      <section className="border-b border-slate-200 bg-white py-10 sm:py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Link className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-blue-900" to="/products"><ArrowLeft className="h-4 w-4" /> Back to products</Link>
          <div className="mt-7 grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div><div className="grid aspect-square max-h-[580px] place-items-center overflow-hidden rounded-md border border-slate-200 bg-white p-7"><img className="h-full w-full object-contain" src={entry.images[0]} alt={entry.imageAlt} /></div>{entry.images.length > 1 ? <div className="mt-3 grid grid-cols-3 gap-3">{entry.images.map((image, index) => <a className="grid aspect-[4/3] place-items-center overflow-hidden rounded-md border border-slate-200 bg-white p-2 hover:border-cyan-500" href={image} target="_blank" rel="noreferrer" key={image}><img className="h-full w-full object-contain" src={image} alt={`${entry.name} supplied literature view ${index + 1}`} /></a>)}</div> : null}</div>
            <div>
              <p className="text-xs font-bold uppercase text-cyan-700">{entry.category}</p>
              <h1 className="mt-3 text-4xl font-bold leading-tight text-slate-950 sm:text-5xl">{entry.name}</h1>
              <p className="mt-5 text-lg leading-8 text-slate-600">{entry.shortDescription}</p>
              <dl className="mt-7 grid gap-3 border-y border-slate-200 py-5 text-sm sm:grid-cols-2">
                <div><dt className="font-semibold text-slate-500">Catalogue status</dt><dd className="mt-1 font-bold text-emerald-700">Published for inquiry</dd></div>
                <div><dt className="font-semibold text-slate-500">Brand presentation</dt><dd className="mt-1 font-bold text-slate-900">{entry.brand}</dd></div>
                {entry.manufacturer ? <div className="sm:col-span-2"><dt className="font-semibold text-slate-500">Manufacturer</dt><dd className="mt-1 font-bold text-slate-900">{entry.manufacturer}</dd></div> : null}
              </dl>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link className="inline-flex h-11 items-center gap-2 rounded-md bg-blue-900 px-4 text-sm font-bold text-white hover:bg-blue-800" to={`/contact?product=${encodeURIComponent(entry.name)}`}><MessageSquareText className="h-4 w-4" /> Contact sales</Link>
                <Link className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50" to={`/contact?product=${encodeURIComponent(entry.name)}&subject=${encodeURIComponent("Request product information")}`}><FileCheck2 className="h-4 w-4" /> Request information</Link>
              </div>
              <p className="mt-5 text-xs leading-5 text-slate-500">No public price or stock quantity is shown. Exact model, supply availability and commercial terms are confirmed through quotation.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-14 sm:py-18">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Application and product overview</h2>
            <p className="mt-4 text-base leading-8 text-slate-700">{entry.description}</p>
            <div className="mt-8">
              <h3 className="font-bold text-slate-950">Key features</h3>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">{entry.features.map((feature) => <li className="flex items-start gap-2 text-sm leading-6 text-slate-700" key={feature}><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" /> {feature}</li>)}</ul>
            </div>
            <div className="mt-8">
              <h3 className="font-bold text-slate-950">Available variants</h3>
              <ul className="mt-4 grid gap-2">{entry.variants.map((variant) => <li className="border-l-2 border-cyan-500 pl-3 text-sm leading-6 text-slate-700" key={variant}>{variant}</li>)}</ul>
            </div>
          </div>
          <div>
            <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold text-slate-950">Published specifications</h2></div>
              <dl>{entry.specifications.map((specification) => <div className="grid grid-cols-[0.8fr_1.2fr] gap-4 border-b border-slate-100 px-5 py-4 text-sm last:border-0" key={specification.label}><dt className="font-semibold text-slate-500">{specification.label}</dt><dd className="font-semibold text-slate-900">{specification.value}</dd></div>)}</dl>
            </div>
            <div className="mt-5 rounded-md border border-blue-200 bg-blue-50 p-5">
              <h2 className="font-bold text-blue-950">Intended application</h2>
              <p className="mt-2 text-sm leading-6 text-blue-900">{entry.intendedApplication}</p>
              <p className="mt-3 text-xs leading-5 text-blue-800">This catalogue is commercial information, not clinical guidance. Use is subject to approved instructions and qualified professional judgment.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-14 sm:py-18">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-slate-950">Related documentation</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">A linked document may cover a product family rather than the exact quoted model. Manufacturer documents are not represented as MIPRO corporate certificates, and visible expiry information remains prominent.</p>
          {productCertificates.length > 0 ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {productCertificates.map((certificate) => (
                <div className="flex gap-4 rounded-md border border-slate-200 bg-slate-50 p-5" key={certificate.id}>
                  <FileCheck2 className="h-6 w-6 shrink-0 text-cyan-700" />
                  <div>
                    <h3 className="font-bold text-slate-950">{certificate.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{certificate.statusNote}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <span className={`rounded-md border px-2 py-1 text-xs font-bold ${certificate.status === "Current" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{certificate.status}</span>
                      <a className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-900" href={certificate.file.url} rel="noreferrer" target="_blank"><Eye className="h-4 w-4" /> View scan</a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 flex gap-4 rounded-md border border-slate-200 bg-slate-50 p-5">
              <FileCheck2 className="h-6 w-6 shrink-0 text-cyan-700" />
              <div><h3 className="font-bold text-slate-950">Request model-specific documentation</h3><p className="mt-2 text-sm leading-6 text-slate-600">No public certificate scan is currently linked to this catalogue item. MIPRO can review the exact supplied model and relevant manufacturer file during quotation.</p></div>
            </div>
          )}
        </div>
      </section>

      {(related.data?.length ?? 0) > 0 ? <section className="bg-slate-50 py-14 sm:py-18"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><h2 className="text-2xl font-bold text-slate-950">Related products</h2><div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{related.data?.map((relatedProduct) => <PublicProductCard key={relatedProduct.slug} product={relatedProduct} />)}</div></div></section> : null}
      <ContactCTA />
    </>
  );
}
