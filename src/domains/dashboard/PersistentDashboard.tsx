import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import { businessDate } from "../../lib/date";
import { formatMoney, formatQuantity } from "../../utils/precise";
import { domainRequest } from "../services";
import { ErrorBlock, LoadingBlock, Panel, TableFrame, inputClass, labelClass } from "../components";
import { dashboardPayload } from "./persistentContracts";

export default function PersistentDashboard() {
  const today = businessDate();
  const [from, setFrom] = useState(today.slice(0, 7) + "-01"); const [to, setTo] = useState(today);
  const [period, setPeriod] = useState({ from, to });
  const valid = from <= to && to <= today && Date.parse(to) - Date.parse(from) <= 92 * 86400000;
  const result = useQuery({ queryKey: ["persistent-dashboard", period], queryFn: () => domainRequest(`/api/dashboard?${new URLSearchParams(period)}`, dashboardPayload), staleTime: 0, refetchOnWindowFocus: true, refetchInterval: 60000 });
  const data = result.data;
  return <div className="grid min-w-0 gap-5" data-testid="persistent-dashboard">
    <PageHeader title="Dashboard" subtitle="Business overview" actions={<Button aria-label="Refresh dashboard" title="Refresh dashboard" icon={<RefreshCw className="h-4 w-4" />} disabled={result.isFetching} onClick={() => void result.refetch()} />} />
    <form className="flex flex-wrap items-end gap-3 border-y border-blue-200 bg-blue-50/70 p-4" onSubmit={(e) => { e.preventDefault(); if (valid) setPeriod({ from, to }); }}>
      <label className="min-w-0 flex-1 sm:max-w-52"><span className={labelClass}>From</span><input aria-label="Dashboard from" type="date" className={inputClass} value={from} max={to} required onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="min-w-0 flex-1 sm:max-w-52"><span className={labelClass}>To</span><input aria-label="Dashboard to" type="date" className={inputClass} value={to} min={from} max={today} required onChange={(e) => setTo(e.target.value)} /></label>
      <Button variant="primary" type="submit" disabled={!valid || result.isFetching}>Apply Dates</Button>
      {!valid ? <p role="alert" className="w-full text-sm text-red-700">Choose at most 93 days ending no later than today.</p> : null}
    </form>
    {result.isPending ? <LoadingBlock label="Loading saved business totals" /> : null}{result.isError ? <ErrorBlock error={result.error} /> : null}
    {data ? <>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-600"><span>Period: {data.from} to {data.to}</span><span>Current operations: {data.operationalDate} | Bangladesh time</span></div>
      <dl className="grid gap-px overflow-hidden rounded-md border border-blue-200 bg-blue-200 sm:grid-cols-2 xl:grid-cols-3">{data.metrics.map((m) => <div key={m.id} className="min-w-0 border-t-2 border-t-cyan-500 bg-white p-4"><dt className="text-sm font-semibold text-blue-950">{m.label}</dt><dd className="mt-2 break-words text-2xl font-bold tabular-nums text-blue-950">{m.format === "money" ? formatMoney(m.value) : formatQuantity(m.value)}</dd><p className="mt-2 min-h-9 text-xs leading-5 text-slate-500">{m.basis}</p><Link to={m.path} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-cyan-800">Open Workspace <ArrowRight className="h-3 w-3" /></Link></div>)}</dl>
      {data.trend.length ? <Panel title="Sales & Collections" subtitle="Daily net postings (BDT)"><div className="h-72 min-w-0 p-3" data-testid="dashboard-trend"><ResponsiveContainer width="100%" height="100%" minWidth={0}><LineChart data={data.trend.map((r) => ({ ...r, sales: Number(r.sales), collections: Number(r.collections) }))} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dbe7ee" /><XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(s: string) => s.slice(5)} minTickGap={24} /><YAxis width={56} tick={{ fontSize: 11 }} tickFormatter={(n: number) => new Intl.NumberFormat("en", { notation: "compact" }).format(n)} /><Tooltip content={({ active, label }) => { const row = data.trend.find((r) => r.date === label); return active && row ? <div className="rounded border border-blue-200 bg-white p-3 text-xs shadow"><strong>{row.date}</strong><p className="mt-2">Sales: {formatMoney(row.sales)}</p><p>Collections: {formatMoney(row.collections)}</p></div> : null; }} /><Legend wrapperStyle={{ fontSize: 12 }} /><Line type="linear" dataKey="sales" name="Invoiced Sales" stroke="#173b78" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="linear" dataKey="collections" name="Collections" stroke="#0891b2" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div></Panel> : null}
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">{data.queues.map((queue) => <Panel key={queue.id} title={queue.title} subtitle={`${formatQuantity(queue.total)} matching records${Number(queue.total) > 8 ? " | First 8 shown" : ""}`} actions={<Link aria-label={`Open ${queue.title}`} title={`Open ${queue.title}`} to={queue.path} className="rounded border border-blue-200 bg-white p-2 text-blue-950"><ArrowRight className="h-4 w-4" /></Link>}><TableFrame><table className="w-full min-w-[470px] text-left text-xs"><thead className="bg-blue-950 text-white"><tr>{queue.columns.map((c) => <th key={c.key} className="px-3 py-3">{c.label}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{queue.rows.map((row, index) => <tr key={index}>{queue.columns.map((c) => <td key={c.key} className="max-w-56 break-words px-3 py-3 align-top">{c.format === "money" ? formatMoney(row[c.key]) : c.format === "quantity" ? formatQuantity(row[c.key]) : row[c.key]}</td>)}</tr>)}</tbody></table></TableFrame>{!queue.rows.length ? <p className="px-4 py-7 text-center text-sm text-slate-500">No matching records.</p> : null}</Panel>)}</div>
      <details className="border-t border-blue-200 py-3 text-xs text-slate-600"><summary className="cursor-pointer font-semibold text-blue-950">Calculation Basis</summary>{data.notes.map((note) => <p key={note} className="mt-2 leading-5">{note}</p>)}</details>
    </> : null}
  </div>;
}
