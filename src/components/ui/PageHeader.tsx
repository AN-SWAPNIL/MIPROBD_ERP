import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export default function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 rounded-md border border-blue-200 border-l-4 border-l-red-600 bg-[#f8fbff] p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
      <div>
        {eyebrow ? <span className="text-xs font-bold uppercase tracking-wide text-cyan-700">{eyebrow}</span> : null}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
