import type { TrackingStatus } from "../../domains/erp.types";

const styles: Record<TrackingStatus, string> = {
  LIVE: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  RECENT: "bg-cyan-100 text-cyan-800 ring-cyan-200",
  STALE: "bg-amber-100 text-amber-900 ring-amber-200",
  OFFLINE: "bg-slate-200 text-slate-700 ring-slate-300",
  NOT_TRACKING: "bg-red-50 text-red-700 ring-red-200"
};

export default function TrackingStatusBadge({ status }: { status: TrackingStatus }) {
  return <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-bold ring-1 ring-inset ${styles[status]}`}><span className={`h-1.5 w-1.5 rounded-full ${status === "LIVE" ? "animate-pulse bg-emerald-500" : status === "RECENT" ? "bg-cyan-500" : status === "STALE" ? "bg-amber-500" : "bg-slate-400"}`} />{status.replace("_", " ")}</span>;
}
