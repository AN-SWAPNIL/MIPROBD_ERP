import type { ReactNode } from "react";
import type { PrintConfiguration, PrintIdentity } from "../erp.types";

export type LetterheadMode = "digital" | "preprinted";

export const letterheadModeOptions = [
  { value: "digital" as const, label: "With Background" },
  { value: "preprinted" as const, label: "Without Background" }
];

export function LetterheadSheet({ identity, mode, title, subtitle, reference, date, children, className = "", reportLayout = false }: {
  identity: PrintIdentity;
  mode: LetterheadMode;
  title: string;
  subtitle?: string;
  reference: string;
  date: string;
  children: ReactNode;
  className?: string;
  reportLayout?: boolean;
}) {
  const digital = mode === "digital";
  return (
    <article
      className={`letterhead-sheet relative mx-auto overflow-hidden bg-white text-slate-950 ${className}`}
      data-letterhead-mode={mode}
      data-print-identity={identity.id}
      style={{
        width: "210mm",
        minHeight: "297mm",
        backgroundImage: digital ? `url(${identity.backgroundImageUrl})` : "none",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        backgroundSize: digital ? "213mm 300mm" : "210mm 297mm"
      }}
    >
      <div
        data-report-page-edge={reportLayout ? "1.5mm-left-0.2mm-right" : undefined}
        style={reportLayout ? { paddingLeft: "1.5mm", paddingRight: "0.2mm" } : undefined}
      >
      <div style={{ paddingTop: `${identity.safeArea.topMm}mm`, paddingRight: reportLayout ? `${Math.max(0, identity.safeArea.rightMm - 0.2)}mm` : `${identity.safeArea.rightMm}mm`, paddingBottom: `${identity.safeArea.bottomMm}mm`, paddingLeft: reportLayout ? `${Math.max(0, Math.max(identity.safeArea.leftMm, 27) - 1.5)}mm` : `${identity.safeArea.leftMm}mm` }}>
        {!digital ? <div className="no-print absolute left-2 top-2 border border-dashed border-cyan-400 bg-cyan-50 p-2 text-[9px] text-cyan-900">Preprinted {identity.displayName}: background artwork omitted.</div> : null}
        <header className="flex items-start justify-between gap-8 border-b border-blue-900 pb-3">
          <div><h1 className="text-[18px] font-black text-blue-950">{title}</h1>{subtitle ? <p className="mt-1 max-w-[120mm] text-[9px] leading-4 text-slate-600">{subtitle}</p> : null}<div className="mt-2 h-1 w-14 bg-cyan-500" /></div>
          <dl className="grid max-w-[52mm] shrink-0 gap-1 text-right text-[9px]"><div><dt className="inline text-slate-500">Reference: </dt><dd className="inline font-bold">{reference}</dd></div><div><dt className="inline text-slate-500">Date: </dt><dd className="inline font-bold">{date}</dd></div></dl>
        </header>
        <div className="mt-5">{children}</div>
      </div>
      </div>
    </article>
  );
}

export function printModeFromConfiguration(configuration: PrintConfiguration, mode: LetterheadMode | "") {
  return mode || (configuration.defaultLetterheadMode === "Digital" ? "digital" : "preprinted");
}
