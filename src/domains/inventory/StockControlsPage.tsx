import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ClipboardList, Eye, FileBarChart, Search, ShieldCheck, ShieldX } from "lucide-react";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { apiRequest } from "../../lib/api/client";
import { useAuthStore } from "../../lib/auth/session";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { ErrorBlock, LoadingBlock, Panel, TableFrame, inputClass } from "../components";
import { WorkforcePager } from "../marketing/WorkforceUi";
import { stockControlKinds, stockControlPageSchema } from "./controlContracts";

export default function StockControlsPage() {
  const [params] = useSearchParams(); const holdId = params.get("hold") ?? "";
  const [search, setSearch] = useState(""); const term = useDeferredValue(search); const [kind, setKind] = useState(() => stockControlKinds.find((k) => k === params.get("kind")) ?? ""); const [page, setPage] = useState(1); const navigate = useNavigate(); const user = useAuthStore((s) => s.session?.user);
  const query = useQuery({ queryKey: ["inventory", "controls", term, kind, page, holdId], queryFn: async ({ signal }) => stockControlPageSchema.parse((await apiRequest(`/api/inventory/controls?${new URLSearchParams({ search: term, page: String(page), ...(kind ? { kind } : {}), ...(holdId ? { holdId } : {}) })}`, { signal })).data) });
  return <>
    <PageHeader title="Stock Counts & Write-offs" eyebrow="Inventory controls" subtitle="Physical source records and independent approval status." actions={<><Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate("/backend/inventory")}>Inventory</Button>{hasEffectivePermission(user, "inventory", "post") ? <><Button icon={<ShieldX className="h-4 w-4" />} onClick={() => navigate("/backend/inventory/controls/new?kind=Write-off")}>New Write-off</Button><Button icon={<ShieldCheck className="h-4 w-4" />} onClick={() => navigate("/backend/inventory/controls/new?kind=Condition%20Release")}>Condition Release</Button><Button variant="primary" icon={<ClipboardList className="h-4 w-4" />} onClick={() => navigate("/backend/inventory/controls/new?kind=Physical%20Count")}>New Count</Button></> : null}{hasEffectivePermission(user, "reports") ? <Button icon={<FileBarChart className="h-4 w-4" />} onClick={() => navigate("/backend/reports/stock-control-register")}>Open Report</Button> : null}</>} />
    <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_210px]"><div className="relative min-w-0"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search stock controls" className={inputClass + " pl-9"} value={search} maxLength={120} placeholder="Search document or preparer" onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div><select className={inputClass} aria-label="Stock control type" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}><option value="">All control types</option>{stockControlKinds.map((k) => <option key={k}>{k}</option>)}</select></div>
    <Panel title="Stock Control Register">{query.isPending ? <LoadingBlock /> : query.isError ? <ErrorBlock error={query.error} /> : <><TableFrame><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-blue-50 text-blue-950"><tr>{["Document", "Type", "Observed", "Batches", "Preparer", "Status", "Posted", "Actions"].map((h) => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{query.data.rows.map((r) => <tr key={r.id}><td className="p-3 font-semibold">{r.number}</td><td className="p-3">{r.kind}</td><td className="p-3">{r.countDate}</td><td className="p-3">{r.lineCount}</td><td className="p-3">{r.createdByName}</td><td className="p-3"><StatusBadge status={r.state} /></td><td className="p-3">{r.postedDate ?? "-"}</td><td className="p-3"><Button aria-label={`Open ${r.number}`} title="Open source record" icon={<Eye className="h-4 w-4" />} onClick={() => navigate(`/backend/inventory/controls/${r.id}`)} /></td></tr>)}</tbody></table></TableFrame>{!query.data.total ? <p className="p-8 text-center text-sm text-slate-500">No stock control documents.</p> : null}<WorkforcePager page={page} pageSize={25} total={query.data.total} onChange={setPage} /></>}</Panel>
  </>;
}
