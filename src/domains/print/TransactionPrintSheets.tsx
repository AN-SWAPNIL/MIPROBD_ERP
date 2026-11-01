import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { PrintIdentity } from "../erp.types";
import { LetterheadSheet, type LetterheadMode } from "./LetterheadPrint";

type Props = { identity: PrintIdentity; mode: LetterheadMode; title: string; subtitle?: string; reference: string; date: string; children: ReactNode; onReady: (ready: boolean) => void; reportLayout?: boolean };

// CSS column fragmentation flows long tables/text into equal, measured A4 content areas.
export default function TransactionPrintSheets({ children, onReady, ...sheet }: Props) {
  const measure = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ height: number; width: number; pages: number; headers: Map<number, HTMLTableElement> }>();
  const [failure, setFailure] = useState("");
  useLayoutEffect(() => {
    let cancelled = false; onReady(false); setFailure("");
    void document.fonts.ready.then(() => {
      const content = measure.current; const article = content?.closest("article");
      if (!content || !article || cancelled) return;
      const paper = article.getBoundingClientRect(); const rect = content.getBoundingClientRect();
      const pxPerMm = paper.width / 210;
      const headings = Array.from(content.querySelectorAll("thead"));
      const headerHeight = Math.max(0, ...headings.map((header) => header.getBoundingClientRect().height));
      const height = Math.floor(297 * pxPerMm - (rect.top - paper.top) - sheet.identity.safeArea.bottomMm * pxPerMm - headerHeight - 3);
      content.style.height = `${height}px`;
      const width = content.getBoundingClientRect().width;
      const pages = Math.max(1, Math.ceil((content.scrollWidth - 1) / width));
      if (!Number.isFinite(pages) || height <= 0 || width <= 0 || pages > 100) {
        setFailure("This document exceeds the A4 layout limit. Narrow the report dates/filters or review the stationery safe area.");
        return;
      }
      const headers = new Map<number, HTMLTableElement>();
      for (const heading of headings) {
        const table = heading.closest("table")!;
        const repeated = table.cloneNode(false) as HTMLTableElement;
        repeated.style.tableLayout = "fixed"; repeated.style.width = "100%";
        const copy = heading.cloneNode(true) as HTMLTableSectionElement;
        Array.from(copy.querySelectorAll("th")).forEach((cell, index) => { cell.style.width = `${heading.querySelectorAll("th")[index].getBoundingClientRect().width}px`; });
        repeated.appendChild(copy);
        for (const row of table.querySelectorAll("tbody tr")) {
          const column = Math.floor((row.getBoundingClientRect().left - rect.left + 1) / width);
          if (column > 0 && column < pages) headers.set(column, repeated);
        }
      }
      setLayout({ height, width, pages, headers }); onReady(true);
    });
    return () => { cancelled = true; };
  }, [children, onReady, sheet.identity, sheet.mode, sheet.title, sheet.subtitle, sheet.reference, sheet.date, sheet.reportLayout]);
  const columns = { height: layout?.height ?? 1, width: "100%", columnWidth: "auto", columnCount: 1, columnGap: 0, columnFill: "auto" } as const;
  return <>
    {failure ? <p className="no-print border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">{failure}</p> : null}
    <div className="no-print pointer-events-none fixed -left-[10000px] top-0 invisible" aria-hidden="true">
      <LetterheadSheet {...sheet} subtitle={`${sheet.subtitle ? `${sheet.subtitle} | ` : ""}Page 999 of 999`}>
        <div ref={measure} className="transaction-print-flow" style={columns}>{children}</div>
      </LetterheadSheet>
    </div>
    {layout ? Array.from({ length: layout.pages }, (_, index) => <LetterheadSheet key={index} {...sheet} className="print-sheet shadow-xl" subtitle={`${sheet.subtitle ? `${sheet.subtitle} | ` : ""}Page ${index + 1} of ${layout.pages}`}>
      {layout.headers.has(index) ? <RepeatedHeader table={layout.headers.get(index)!} /> : null}
      <div className="overflow-hidden" style={{ height: layout.height }}>
        <div className="transaction-print-flow" style={{ ...columns, transform: `translateX(-${index * layout.width}px)` }}>{children}</div>
      </div>
    </LetterheadSheet>) : <p className="no-print py-8 text-center text-sm text-slate-600">Preparing A4 pages...</p>}
  </>;
}

function RepeatedHeader({ table }: { table: HTMLTableElement }) {
  const element = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { element.current?.replaceChildren(table.cloneNode(true)); }, [table]);
  return <div ref={element} data-repeated-header />;
}
