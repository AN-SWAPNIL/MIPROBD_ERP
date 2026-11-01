import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import PrintPreviewButton from "../../components/ui/PrintPreviewButton";
import { useAuthStore } from "../../lib/auth/session";
import { businessDate } from "../../lib/date";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { useToastStore } from "../../lib/ui/toast";
import { ErrorBlock, LoadingBlock, Panel, TableFrame, inputClass, labelClass } from "../components";
import { reportService } from "../services";
import { reportFilterLabels } from "./reportFilters";
import { periodFor, presets, type PeriodPreset } from "./reportPeriod";
import { reportDisplay } from "./reportDisplay";
import { reportPresentation } from "./reportPresentation";
import type { PersistentReportQuery } from "./persistentContracts";

const filterKeys = Object.keys(reportFilterLabels);

export default function PersistentReportDetailPage() {
  const { reportId = "" } = useParams();
  const [params] = useSearchParams();
  // Remount filter drafts when moving between reports or using browser Back.
  return <ReportWorkspace key={`${reportId}:${params.toString()}`} id={reportId} params={params} />;
}

function ReportWorkspace({ id, params }: { id: string; params: URLSearchParams }) {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.session?.user);
  const toast = useToastStore((state) => state.push);
  const today = businessDate();
  const initialPreset = presets.some((p) => p.value === params.get("preset")) ? params.get("preset") as PeriodPreset : "this-month";
  const initial: PersistentReportQuery = {
    ...periodFor(initialPreset, today),
    ...(params.get("from") ? { from: params.get("from")! } : {}),
    ...(params.get("to") ? { to: params.get("to")! } : {}),
    grouping: (["Daily", "Weekly", "Monthly", "Yearly"].includes(params.get("grouping") ?? "") ? params.get("grouping") : "Daily") as PersistentReportQuery["grouping"],
    page: Number(params.get("page") ?? 1), pageSize: 50,
    ...Object.fromEntries(filterKeys.filter((key) => params.get(key)).map((key) => [key, params.get(key)!]))
  };
  const [draft, setDraft] = useState(initial);
  const [preset, setPreset] = useState<PeriodPreset>(params.has("from") ? "custom" : initialPreset);
  const [exporting, setExporting] = useState(false);
  const catalogue = useQuery({ queryKey: ["reports", "catalogue"], queryFn: reportService.catalogue });
  const definition = catalogue.data?.find((report) => report.id === id);
  const result = useQuery({ queryKey: ["reports", "persistent", id, initial], queryFn: () => reportService.run(id, initial), enabled: Boolean(definition?.available) });
  const data = result.data ? reportPresentation(result.data) : undefined;
  const change = (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const go = (query: PersistentReportQuery) => navigate(`/backend/reports/${encodeURIComponent(id)}?${new URLSearchParams(Object.entries(query).filter(([,value]) => value !== "" && value !== undefined).map(([key,value]) => [key,String(value)]))}`);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const url = URL.createObjectURL(await reportService.csv(id, initial));
      const link = document.createElement("a"); link.href = url; link.download = `${id}-${initial.from}-${initial.to}.csv`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast({ kind: "error", title: "Export unavailable", message: error instanceof Error ? error.message : "Try again." }); }
    finally { setExporting(false); }
  };
  if (catalogue.isLoading) return <LoadingBlock label="Loading authorized report" />;
  if (catalogue.isError) return <ErrorBlock error={catalogue.error} />;
  if (!definition) return <ErrorBlock error={new Error("This report is not available for your access profile.")} />;
  return <div className="grid min-w-0 gap-5" data-testid="persistent-report">
    <PageHeader eyebrow="Reports" title={definition.title} subtitle={definition.description} actions={<Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate("/backend/reports")}>All Reports</Button>} />
    {!definition.available ? <Panel title="Source migration pending"><p className="p-4 text-sm text-amber-800">{definition.pendingReason}</p></Panel> : <>
      <Panel title="Report Settings">
        <form className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => { event.preventDefault(); go({ ...draft, page: 1 }); }}>
          <label><span className={labelClass}>Period</span><select className={inputClass} aria-label="Period" value={preset} onChange={(event) => { const value = event.target.value as PeriodPreset; setPreset(value); if (value !== "custom") setDraft((current) => ({ ...current, ...periodFor(value, today) })); }}>{presets.map((p) => <option value={p.value} key={p.value}>{p.label}</option>)}</select></label>
          <label><span className={labelClass}>From</span><input type="date" aria-label="From" className={inputClass} required max={String(draft.to)} value={draft.from} onChange={(event) => { setPreset("custom"); change("from", event.target.value); }} /></label>
          <label><span className={labelClass}>To</span><input type="date" aria-label="To" className={inputClass} required min={draft.from} max={today} value={draft.to} onChange={(event) => { setPreset("custom"); change("to", event.target.value); }} /></label>
          {definition.supportsGrouping ? <label><span className={labelClass}>Group by</span><select aria-label="Group by" className={inputClass} value={draft.grouping} onChange={(event) => change("grouping", event.target.value)}>{["Daily", "Weekly", "Monthly", "Yearly"].map((value) => <option key={value}>{value}</option>)}</select></label> : null}
          {definition.filters.map((key) => <label className="min-w-0" key={key}><span className={labelClass}>{reportFilterLabels[key as keyof typeof reportFilterLabels] ?? key}</span><select aria-label={reportFilterLabels[key as keyof typeof reportFilterLabels] ?? key} className={inputClass} value={String(draft[key] ?? "")} onChange={(event) => change(key, event.target.value)}><option value="">All authorized records</option>{draft[key] && !data?.options[key]?.some((o) => o.value === draft[key]) ? <option value={String(draft[key])}>Selected record (outside period)</option> : null}{data?.options[key]?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
          <div className="flex items-end"><Button variant="primary" type="submit" icon={<RefreshCw className="h-4 w-4" />} disabled={result.isFetching}>Generate Report</Button></div>
        </form>
      </Panel>
      {result.isLoading ? <LoadingBlock label="Generating report from saved postings" /> : null}
      {result.isError ? <ErrorBlock error={result.error} /> : null}
      {data ? <Panel title={data.title} subtitle={`${data.from} to ${data.to} | ${data.rowCount} rows | ${data.grouping}`} actions={<>
        {hasEffectivePermission(user, "reports", "export") ? <Button icon={<Download className="h-4 w-4" />} disabled={exporting} onClick={() => void exportCsv()}>Export CSV</Button> : null}
        {hasEffectivePermission(user, "print") ? <PrintPreviewButton onClick={() => { const query = new URLSearchParams(Object.entries(initial).filter(([key,value]) => !["page", "pageSize"].includes(key) && value !== undefined && value !== "").map(([key,value]) => [key,String(value)])); navigate(`/backend/print/report/${encodeURIComponent(id)}?${query}`); }} /> : null}
      </>}>
        <p className="border-b border-blue-100 bg-blue-50/40 px-4 py-3 text-xs leading-5 text-slate-600">{data.basis}</p>
        <TableFrame><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-blue-950 text-[10px] uppercase text-white"><tr>{data.columns.map((column) => <th className={`whitespace-pre-line px-3 py-3 ${column.align === "right" ? "text-right" : ""}`} key={column.key}>{column.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{data.rows.map((row,index) => <tr className="hover:bg-cyan-50/40" key={index}>{data.columns.map((column) => <td className={`px-3 py-3 ${column.align === "right" ? "text-right font-semibold tabular-nums" : "text-slate-600"}`} key={column.key}>{reportDisplay(row[column.key], column.format)}</td>)}</tr>)}{!data.rows.length ? <tr><td colSpan={data.columns.length} className="px-4 py-12 text-center text-slate-500">No posted records match this period and filter set.</td></tr> : null}</tbody>{Object.keys(data.totals).length ? <tfoot className="border-t-2 border-blue-200 bg-blue-50 text-xs font-bold"><tr>{data.columns.map((column,index) => <td key={column.key} className={`px-3 py-3 ${column.align === "right" ? "text-right" : ""}`}>{data.totals[column.key] !== undefined ? reportDisplay(data.totals[column.key], column.format) : index === 0 ? "All filtered rows" : ""}</td>)}</tr></tfoot> : null}</table></TableFrame>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-blue-100 px-4 py-3 text-xs text-slate-500"><span>Page {data.page} of {Math.max(1,Math.ceil(data.rowCount / data.pageSize))}. Totals cover all filtered rows.</span><div className="flex gap-2"><Button aria-label="Previous page" icon={<ChevronLeft className="h-4 w-4" />} disabled={data.page <= 1} onClick={() => go({ ...initial, page: data.page-1 })} /><Button aria-label="Next page" icon={<ChevronRight className="h-4 w-4" />} disabled={data.page * data.pageSize >= data.rowCount} onClick={() => go({ ...initial, page: data.page+1 })} /></div></div>
        <details className="border-t border-blue-100 px-4 py-3 text-xs text-slate-500"><summary className="cursor-pointer font-semibold">Basis and reconciliation notes</summary>{data.notes.map((note) => <p className="mt-2 leading-5" key={note}>{note}</p>)}<p className="mt-2">Generated {new Date(data.generatedAt).toLocaleString("en-GB")}. CSV and print regenerate from saved records using these settings.</p></details>
      </Panel> : null}
    </>}
  </div>;
}
