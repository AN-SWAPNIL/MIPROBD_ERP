import { ArrowLeft, LockKeyhole } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import MiproLogo from "../../components/branding/MiproLogo";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export default function AuthShell({ title, subtitle, children }: AuthShellProps) {
  useEffect(() => {
    document.title = `${title} | MIPRO ERP Employee Portal`;
    let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    robots.content = "noindex,nofollow";
  }, [title]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden overflow-hidden bg-blue-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <img
            className="absolute inset-0 h-full w-full object-cover opacity-32"
            src="/mipro-warehouse.png"
            alt="Medical distribution warehouse"
          />
          <div className="absolute inset-0 bg-blue-950/88" />
          <div className="relative">
            <Link className="inline-block rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-blue-950" to="/" aria-label="Go to MIPRO ERP home">
              <MiproLogo className="w-[292px] rounded-md shadow-sm" priority />
            </Link>
            <p className="mt-16 text-sm font-bold uppercase text-cyan-300">MIPRO Healthcare Corporation</p>
            <h2 className="mt-4 max-w-3xl text-5xl font-bold leading-tight">Employee Operations Portal</h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
              Secure access to MIPRO's internal operations and management system.
            </p>
          </div>
          <div className="relative flex items-center gap-3 border-t border-white/15 pt-5 text-sm text-slate-300">
            <LockKeyhole className="h-5 w-5 text-cyan-300" />
            Authorized MIPRO employees only
          </div>
        </section>
        <main className="flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-xl rounded-md border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
            <div className="mb-7 lg:flex lg:justify-end">
              <Link className="inline-block rounded focus:outline-none focus:ring-2 focus:ring-cyan-200 lg:hidden" to="/" aria-label="Go to MIPRO ERP home">
                <MiproLogo className="w-[228px]" priority />
              </Link>
              <Link className="mt-3 flex w-fit items-center gap-1.5 text-sm font-semibold text-cyan-700 hover:text-cyan-900 lg:mt-0" to="/">
                <ArrowLeft className="h-4 w-4" />
                Back to home
              </Link>
            </div>
            <div className="mb-6">
              <p className="text-xs font-bold uppercase text-cyan-700">MIPRO ERP | Employee Portal</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-950">{title}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
