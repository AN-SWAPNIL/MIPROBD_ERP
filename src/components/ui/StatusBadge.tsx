import clsx from "clsx";

type StatusBadgeProps = {
  status?: string;
};

const toneByStatus: Record<string, string> = {
  Active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Approved: "bg-blue-50 text-blue-700 ring-blue-200",
  Posted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Ready: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  Blocked: "bg-rose-50 text-rose-700 ring-rose-200",
  Review: "bg-amber-50 text-amber-700 ring-amber-200",
  Delivered: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Normal: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Open: "bg-blue-50 text-blue-700 ring-blue-200",
  Placed: "bg-blue-50 text-blue-700 ring-blue-200",
  Sent: "bg-blue-50 text-blue-700 ring-blue-200",
  Accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Converted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Dispatched: "bg-blue-50 text-blue-700 ring-blue-200",
  Received: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Closed: "bg-slate-100 text-slate-700 ring-slate-300",
  Shipped: "bg-blue-50 text-blue-700 ring-blue-200",
  "PI Received": "bg-cyan-50 text-cyan-700 ring-cyan-200",
  "LC/TT Opened": "bg-blue-50 text-blue-700 ring-blue-200",
  "In Production": "bg-indigo-50 text-indigo-700 ring-indigo-200",
  "At Port": "bg-amber-50 text-amber-700 ring-amber-200",
  Costing: "bg-sky-50 text-sky-700 ring-sky-200",
  "Cost Finalized": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Partially Received": "bg-cyan-50 text-cyan-700 ring-cyan-200",
  "Partially Delivered": "bg-cyan-50 text-cyan-700 ring-cyan-200",
  "Not Started": "bg-slate-50 text-slate-600 ring-slate-200",
  "In Progress": "bg-sky-50 text-sky-700 ring-sky-200",
  Finalized: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Not Ready": "bg-slate-50 text-slate-600 ring-slate-200",
  "Pending Client Confirmation": "bg-amber-50 text-amber-700 ring-amber-200",
  Confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Customs: "bg-amber-50 text-amber-700 ring-amber-200",
  Draft: "bg-slate-50 text-slate-600 ring-slate-200",
  Pending: "bg-amber-50 text-amber-700 ring-amber-200",
  "Pending Approval": "bg-amber-50 text-amber-700 ring-amber-200",
  Attention: "bg-orange-50 text-orange-700 ring-orange-200",
  Due: "bg-orange-50 text-orange-700 ring-orange-200",
  "6 Month Alert": "bg-amber-50 text-amber-700 ring-amber-200",
  "3 Month Alert": "bg-orange-50 text-orange-700 ring-orange-200",
  "1 Month Alert": "bg-rose-50 text-rose-700 ring-rose-200",
  Expired: "bg-rose-50 text-rose-700 ring-rose-200",
  Rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  Reversed: "bg-rose-50 text-rose-700 ring-rose-200",
  Cancelled: "bg-rose-50 text-rose-700 ring-rose-200",
  Inactive: "bg-slate-100 text-slate-500 ring-slate-200"
};

export default function StatusBadge({ status = "Draft" }: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        toneByStatus[status] ?? "bg-slate-50 text-slate-600 ring-slate-200"
      )}
    >
      {status}
    </span>
  );
}
