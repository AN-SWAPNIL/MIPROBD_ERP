import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import Button from "../../components/ui/Button";
import { formatMoney as formatCurrency } from "../../utils/precise";
import { ErrorBlock, LoadingBlock, TableFrame, inputClass } from "../components";
import { WorkforcePager } from "../marketing/WorkforceUi";
import type { OpeningSource, SourceCell } from "./contracts";
import { openingRequest } from "./client";
export default function OpeningSourceReview({ source }: { source: OpeningSource }) {
  const profile = source.profile; const [sheet, setSheet] = useState(profile?.sheets[0]?.name ?? ""); const [page, setPage] = useState(1); const [showCells, setShowCells] = useState(false);
  const cells = useQuery({ queryKey: ["opening", "cells", source.id, sheet, page], enabled: showCells && Boolean(sheet), queryFn: () => openingRequest<{ rows: SourceCell[]; total: number }>(`/sources/${source.id}/cells?${new URLSearchParams({ sheet, page: String(page) })}`) });
  if (!profile) return null;
  return <div className="space-y-4 p-4"><p className="break-all text-xs text-slate-500">SHA-256: {source.sha256}</p>
    <TableFrame><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-blue-50"><tr>{["Source / Cell", "Sales", "Paid", "Due", "Difference"].map((v) => <th key={v} className="p-3">{v}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{profile.totals.map((row) => <tr key={`${row.sheet}:${row.cells.join()}`}><td className="p-3">{row.sheet}: {row.label}<small className="block">{row.cells.join(", ")}</small></td><td className="p-3">{row.sales === undefined ? "Not recorded" : formatCurrency(row.sales)}</td><td className="p-3">{row.paid === undefined ? "Not recorded" : formatCurrency(row.paid)}</td><td className="p-3">{row.due === undefined ? "Not recorded" : formatCurrency(row.due)}</td><td className="p-3 font-semibold text-rose-700">{row.difference === undefined ? "Unverified" : formatCurrency(row.difference)}</td></tr>)}</tbody></table></TableFrame>
    <div className="space-y-2">{profile.issues.filter((i) => i.severity === "Blocker").map((row) => <div key={row.code} className="rounded border border-amber-200 bg-amber-50 p-3 text-xs"><strong>{row.code}</strong><p>{row.message}</p><small>{row.sheet} {row.cells.join(", ")}</small></div>)}</div>
    <div className="flex flex-wrap items-center gap-2"><Button icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => setShowCells(!showCells)}>{showCells ? "Hide Source Cells" : "Inspect Source Cells"}</Button>{showCells ? <select aria-label="Source sheet" className={inputClass + " w-auto"} value={sheet} onChange={(e) => { setSheet(e.target.value); setPage(1); }}>{profile.sheets.map((s) => <option key={s.name}>{s.name}</option>)}</select> : null}</div>
    {showCells ? cells.isPending ? <LoadingBlock /> : cells.isError ? <ErrorBlock error={cells.error} /> : <><TableFrame><table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-blue-50"><tr>{["Cell", "Type", "Value", "Formula / Shared", "Cached Result"].map((v) => <th className="p-2" key={v}>{v}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{cells.data.rows.map((c) => <tr key={c.address}><td className="p-2">{c.address}</td><td className="p-2">{c.type}</td><td className="max-w-72 break-words p-2">{String(c.value ?? "")}</td><td className="max-w-72 break-words p-2 font-mono">{c.formula ?? c.sharedFormula ?? "-"}</td><td className="p-2">{String(c.cached ?? "")}</td></tr>)}</tbody></table></TableFrame><WorkforcePager page={page} total={cells.data.total} pageSize={50} onChange={setPage} /></> : null}
  </div>;
}
