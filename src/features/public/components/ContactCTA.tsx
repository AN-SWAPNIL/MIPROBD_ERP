import { ArrowRight, PhoneCall } from "lucide-react";
import { Link } from "react-router-dom";
import { usePublicSettings } from "../usePublicSettings";

export default function ContactCTA() {
  const settings = usePublicSettings().data;
  return (
    <section className="bg-blue-950 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase text-cyan-300">Institutional supply inquiries</p>
          <h2 className="mt-2 text-3xl font-bold">Discuss the exact product and documentation you need.</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">Our team can review model, variant, manufacturer documentation and quotation requirements with your organization.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <a className="inline-flex h-11 items-center gap-2 rounded-md border border-white/30 px-4 text-sm font-bold text-white hover:bg-white/10" href={settings ? `tel:${settings.phoneHref}` : "/contact"}>
            <PhoneCall className="h-4 w-4" /> Call MIPRO
          </a>
          <Link className="inline-flex h-11 items-center gap-2 rounded-md bg-cyan-500 px-4 text-sm font-bold text-blue-950 hover:bg-cyan-300" to="/contact">
            Send inquiry <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
