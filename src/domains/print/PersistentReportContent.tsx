import type { PersistentReport } from "../reports/persistentContracts";
import { reportDisplay } from "../reports/reportDisplay";
import { reportFilterLabels } from "../reports/reportFilters";
import { reportPresentation } from "../reports/reportPresentation";

export default function PersistentReportContent({ report: source }: { report: PersistentReport }) {
  const report=reportPresentation(source);
  return <>
    <p className="mb-3 text-[9px] leading-4 text-slate-700">{report.basis}</p>
    {Object.keys(report.filters).length ? <dl className="mb-3 grid grid-cols-2 gap-2 border border-slate-300 p-2 text-[9px]">{Object.entries(report.filters).map(([key,value]) => <div key={key}><dt className="font-bold">{reportFilterLabels[key as keyof typeof reportFilterLabels] ?? key}</dt><dd>{report.options[key]?.find((option) => option.value === value)?.label ?? "Selected record (outside period)"}</dd></div>)}</dl> : null}
    <table className={`w-full table-fixed border-collapse ${["employee-activity","daily-marketing"].includes(report.id)?"text-[9px]":"text-[8px]"}`} data-persistent-report-table>
      {["employee-activity","daily-marketing"].includes(report.id)?<colgroup>{[16,19,18,17,21,9].map((width,index)=><col key={index} style={{width:`${width}%`}} />)}</colgroup>:null}
      <thead><tr className="bg-slate-800 text-white">{report.columns.map((column) => <th className={`whitespace-pre-line break-words border border-slate-400 px-1 py-2 ${column.align === "right" ? "text-right" : "text-left"}`} key={column.key}>{column.label}</th>)}</tr></thead>
      <tbody>{report.rows.map((row,index) => <tr key={index}>{report.columns.map((column) => <td className={`whitespace-pre-line break-words border border-slate-400 px-1 py-2 ${column.align === "right" ? "text-right tabular-nums" : ""}`} key={column.key}>{reportDisplay(row[column.key], column.format)}</td>)}</tr>)}{!report.rows.length ? <tr><td colSpan={report.columns.length} className="border border-slate-400 p-4 text-center">No posted records match this period and filter set.</td></tr> : null}</tbody>
    </table>
    {Object.keys(report.totals).length ? <dl className="mt-3 grid grid-cols-2 gap-2 border-y border-slate-400 py-2 text-[9px]">{report.columns.filter((column) => report.totals[column.key] !== undefined).map((column) => <div className="flex flex-wrap justify-between gap-2" key={column.key}><dt>{column.label}</dt><dd className="font-bold">{reportDisplay(report.totals[column.key], column.format)}</dd></div>)}</dl> : null}
    <p className="mt-3 text-[8px] leading-4 text-slate-600">{report.rowCount} rows | {report.grouping} | Generated {new Date(report.generatedAt).toLocaleString("en-GB")}</p>
    {report.notes.map((note) => <p className="mt-1 text-[8px] leading-4 text-slate-600" key={note}>{note}</p>)}
    <div className="mt-10 grid grid-cols-3 gap-6 text-center text-[9px]">{["Prepared By", "Reviewed By", "Approved By"].map((label) => <div className="border-t border-slate-500 pt-1" key={label}>{label}</div>)}</div>
  </>;
}
