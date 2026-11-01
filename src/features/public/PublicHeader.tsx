import clsx from "clsx";
import { LockKeyhole, Mail, Menu, Phone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import MiproLogo from "../../components/branding/MiproLogo";
import { usePublicSettings } from "./usePublicSettings";

const publicNavigation = [
  ["Home", "/"],
  ["About", "/about"],
  ["Products", "/products"],
  ["Certificates", "/certificates"],
  ["News & Resources", "/news"],
  ["Contact", "/contact"]
] as const;

export default function PublicHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const settings = usePublicSettings().data;

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    clsx("border-b-2 px-1 py-2 text-sm font-semibold transition", isActive ? "border-cyan-600 text-blue-950" : "border-transparent text-slate-600 hover:text-blue-950");

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/98 shadow-sm">
      <div className="hidden bg-blue-950 text-xs text-slate-200 md:block">
        <div className="mx-auto flex h-8 max-w-7xl items-center justify-end gap-6 px-6 lg:px-8">
          {settings ? <><a className="inline-flex items-center gap-1.5 hover:text-white" href={`tel:${settings.phoneHref}`}><Phone className="h-3.5 w-3.5" /> {settings.phone}</a>
          <a className="inline-flex items-center gap-1.5 hover:text-white" href={`mailto:${settings.email}`}><Mail className="h-3.5 w-3.5" /> {settings.email}</a></> : null}
        </div>
      </div>
      <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link className="shrink-0 rounded focus:outline-none focus:ring-2 focus:ring-cyan-300" to="/" aria-label="MIPRO Healthcare Corporation home">
          <MiproLogo className="w-[174px] sm:w-[205px]" priority />
        </Link>
        <nav className="ml-auto hidden items-center gap-4 lg:flex" aria-label="Corporate navigation">
          {publicNavigation.map(([label, path]) => <NavLink className={navClass} end={path === "/"} key={path} to={path}>{label}</NavLink>)}
        </nav>
        <Link className="ml-auto hidden h-10 items-center gap-2 rounded-md bg-blue-900 px-4 text-sm font-bold text-white hover:bg-blue-800 lg:ml-2 lg:inline-flex" to="/login">
          <LockKeyhole className="h-4 w-4" /> Employee Portal
        </Link>
        <button className="ml-auto grid h-10 w-10 place-items-center rounded-md border border-slate-200 text-blue-950 hover:bg-slate-50 lg:hidden" type="button" onClick={() => setMobileOpen((value) => !value)} aria-expanded={mobileOpen} aria-label={mobileOpen ? "Close menu" : "Open menu"}>
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {mobileOpen ? (
        <nav className="border-t border-slate-200 bg-white px-4 py-4 shadow-lg lg:hidden" aria-label="Mobile corporate navigation">
          <div className="mx-auto grid max-w-7xl gap-1">
            {publicNavigation.map(([label, path]) => (
              <NavLink className={({ isActive }) => clsx("rounded-md px-3 py-2.5 text-sm font-semibold", isActive ? "bg-cyan-50 text-blue-950" : "text-slate-700 hover:bg-slate-50")} end={path === "/"} key={path} to={path}>{label}</NavLink>
            ))}
            <Link className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-900 px-4 text-sm font-bold text-white" to="/login"><LockKeyhole className="h-4 w-4" /> Employee Portal</Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
