import { useQuery } from "@tanstack/react-query";
import { Mail, MapPin, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import MiproLogo from "../../components/branding/MiproLogo";
import { publicSiteService } from "./publicSiteService";
import { usePublicSettings } from "./usePublicSettings";

export default function PublicFooter() {
  const settings = usePublicSettings().data;
  const categories = useQuery({ queryKey: ["public", "categories"], queryFn: publicSiteService.categories }).data ?? [];
  return (
    <footer className="bg-slate-950 text-slate-300">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.35fr_0.8fr_0.8fr_1.25fr] lg:px-8">
        <div>
          <MiproLogo className="w-[220px] rounded-sm" />
          <p className="mt-5 max-w-sm text-sm leading-6">{settings?.description ?? "Medical devices and consumables for institutional healthcare supply in Bangladesh."}</p>
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">Products</h2>
          <div className="mt-4 grid gap-2 text-sm">
            {categories.slice(0, 4).map((category) => <Link className="hover:text-cyan-300" key={category.id} to={`/products?category=${encodeURIComponent(category.name)}`}>{category.name}</Link>)}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">Company</h2>
          <div className="mt-4 grid gap-2 text-sm">
            <Link className="hover:text-cyan-300" to="/about">About MIPRO</Link>
            <Link className="hover:text-cyan-300" to="/certificates">Certificates</Link>
            <Link className="hover:text-cyan-300" to="/news">News & Resources</Link>
            <Link className="hover:text-cyan-300" to="/contact">Contact</Link>
            <Link className="font-semibold text-cyan-300 hover:text-white" to="/login">Employee Portal</Link>
          </div>
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">Contact</h2>
          <div className="mt-4 grid gap-3 text-sm leading-6">
            {settings ? <><p className="flex items-start gap-2"><MapPin className="mt-1 h-4 w-4 shrink-0 text-cyan-400" /><span>{settings.addressLines.join(", ")}</span></p>
            <a className="flex items-center gap-2 hover:text-white" href={`tel:${settings.phoneHref}`}><Phone className="h-4 w-4 text-cyan-400" /> {settings.phone}</a>
            <a className="flex items-center gap-2 hover:text-white" href={`mailto:${settings.email}`}><Mail className="h-4 w-4 text-cyan-400" /> {settings.email}</a></> : <span>Contact details are loading.</span>}
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <span>&copy; {new Date().getFullYear()} {settings?.company ?? "MIPRO Healthcare Corporation"}. All rights reserved.</span>
          <span>{settings?.tagline ?? "Precision in Healthcare"} | MiproBD</span>
        </div>
      </div>
    </footer>
  );
}
