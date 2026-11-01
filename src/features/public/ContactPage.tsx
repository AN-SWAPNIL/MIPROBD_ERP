import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import BusinessInquiryForm from "./components/BusinessInquiryForm";
import PublicOfficeMap from "./components/PublicOfficeMap";
import PublicPageHero from "./components/PublicPageHero";
import SectionHeading from "./components/SectionHeading";
import { usePublicMeta } from "./usePublicMeta";
import { usePublicSettings } from "./usePublicSettings";
import { foundationMode } from "../../lib/runtime";

export default function ContactPage() {
  const settings = usePublicSettings().data;
  usePublicMeta({
    title: "Contact MIPRO Healthcare Corporation | MiproBD",
    description: "Contact MIPRO Healthcare Corporation in Uttara, Dhaka for medical product information, documentation and institutional supply inquiries.",
    path: "/contact",
    image: "/medical-products.png"
  });

  return (
    <>
      <PublicPageHero eyebrow="Contact MIPRO" title="Start a product or business inquiry" body="Tell us the product, model, documentation or supply requirement your organization needs reviewed." image="/medical-products.png" imageAlt="Medical consumable product collection" />
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr]">
            <div>
              <SectionHeading eyebrow="Office & contact" title="MIPRO Healthcare Corporation" body="Contact the team for product information, institutional quotations and relevant documentation." />
              {settings ? <div className="mt-7 grid gap-3">
                <div className="flex gap-3 border-b border-slate-200 pb-4"><MapPin className="mt-1 h-5 w-5 shrink-0 text-cyan-700" /><div><h2 className="text-sm font-bold text-slate-950">Office address</h2><p className="mt-1 text-sm leading-6 text-slate-600">{settings.addressLines.map((line) => <span className="block" key={line}>{line}</span>)}</p></div></div>
                <a className="flex gap-3 border-b border-slate-200 py-4 hover:text-blue-900" href={`tel:${settings.phoneHref}`}><Phone className="h-5 w-5 shrink-0 text-cyan-700" /><div><h2 className="text-sm font-bold text-slate-950">Phone</h2><p className="mt-1 text-sm text-slate-600">{settings.phone}</p></div></a>
                <a className="flex gap-3 border-b border-slate-200 py-4 hover:text-blue-900" href={`mailto:${settings.email}`}><Mail className="h-5 w-5 shrink-0 text-cyan-700" /><div><h2 className="text-sm font-bold text-slate-950">Email</h2><p className="mt-1 text-sm text-slate-600">{settings.email}</p></div></a>
                <a className="flex gap-3 py-4 hover:text-blue-900" href={`https://wa.me/${settings.whatsappHref}`} target="_blank" rel="noreferrer"><MessageCircle className="h-5 w-5 shrink-0 text-cyan-700" /><div><h2 className="text-sm font-bold text-slate-950">WhatsApp</h2><p className="mt-1 text-sm text-slate-600">Open a business conversation</p></div></a>
              </div> : <p className="mt-7 text-sm text-slate-500">Contact details are loading.</p>}
              {!foundationMode ? <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><strong>Prototype contact reference:</strong> These values follow the newer 2026 stationery and remain in the client confirmation checklist before final public launch.</div> : null}
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-5 sm:p-7">
              <h2 className="text-2xl font-bold text-slate-950">Business inquiry</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Required fields help the team identify and route your request. No ERP account is created.</p>
              <div className="mt-6"><BusinessInquiryForm /></div>
            </div>
          </div>
        </div>
      </section>
      <section className="bg-slate-50 py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6"><SectionHeading eyebrow="Location" title="Uttara, Dhaka" body="The map indicates the provisional office area from the supplied 2026 stationery. Use the address above when planning a visit." /></div>
          {settings ? <PublicOfficeMap center={settings.mapCenter} company={settings.company} /> : <div className="h-[360px] rounded-md bg-slate-200" />}
        </div>
      </section>
    </>
  );
}
