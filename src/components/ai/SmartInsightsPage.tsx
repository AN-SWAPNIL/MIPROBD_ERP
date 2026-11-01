import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Filter, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { aiService } from "../../domains/services";
import { ErrorBlock, LoadingBlock, Segmented, inputClass, labelClass } from "../../domains/components";
import PageHeader from "../ui/PageHeader";
import Button from "../ui/Button";
import AIRecommendationCard from "./AIRecommendationCard";

const categories = ["All", "Imports", "Inventory", "Sales", "Collections", "Finance", "Field Team"] as const;

export default function SmartInsightsPage() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [severity, setSeverity] = useState("");
  const [dismissed, setDismissed] = useState<string[]>([]);
  const query = useQuery({ queryKey: ["ai", "smart-insights"], queryFn: () => aiService.recommendations({ route: "/app/insights", entityType: "insights" }) });
  const visible = useMemo(() => (query.data ?? []).filter((item) => !dismissed.includes(item.id) && (category === "All" || item.category === category) && (!severity || item.severity === severity)), [category, dismissed, query.data, severity]);
  if (query.isLoading) return <LoadingBlock label="Preparing role-safe operational insights" />;
  if (query.isError) return <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data ?? [];
  const summaryCards: Array<{ label: string; value: number; Icon: typeof Sparkles; tone: string }> = [
    { label: "Open insights", value: data.length - dismissed.length, Icon: Sparkles, tone: "text-cyan-800" },
    { label: "Needs attention", value: data.filter((item) => item.severity !== "Info" && !dismissed.includes(item.id)).length, Icon: AlertTriangle, tone: "text-amber-700" },
    { label: "Reviewed here", value: dismissed.length, Icon: CheckCircle2, tone: "text-emerald-700" }
  ];
  return <section className="grid gap-4" data-testid="smart-insights-page">
    <PageHeader eyebrow="Cross-workflow review queue" title="Smart Insights" subtitle="Rule-backed exceptions and recommended actions from records your current role can already access. No alert can post, approve or change a transaction." actions={<Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate("/app/dashboard")}>Dashboard</Button>} />
    <div className="grid gap-3 sm:grid-cols-3">{summaryCards.map(({ label, value, Icon, tone }) => <article className="rounded-md border border-slate-200 bg-white p-4 shadow-sm" key={label}><div className="flex items-center justify-between"><span className="text-xs text-slate-500">{label}</span><Icon className={`h-4 w-4 ${tone}`} /></div><strong className={`mt-1 block text-2xl ${tone}`}>{value}</strong></article>)}</div>
    <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm xl:grid-cols-[1fr_220px] xl:items-end"><Segmented value={category} onChange={setCategory} ariaLabel="Insight categories" options={categories.map((entry) => ({ value: entry, label: entry, count: entry === "All" ? data.length : data.filter((item) => item.category === entry).length }))} /><label><span className={labelClass}>Severity</span><span className="relative block"><Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><select className={inputClass + " pl-9"} value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="">All severity</option><option>Critical</option><option>Attention</option><option>Info</option></select></span></label></div>
    <div className="grid gap-3 lg:grid-cols-2">{visible.map((item) => <div className="grid gap-1" key={item.id}><div className="flex items-center justify-between px-1 text-[10px] font-bold uppercase text-slate-400"><span>{item.category ?? "Operational"}</span><time>{item.detectedAt ? new Date(item.detectedAt).toLocaleString() : "Current review"}</time></div><AIRecommendationCard recommendation={item} onDismiss={() => setDismissed((current) => [...current, item.id])} /></div>)}{!visible.length ? <div className="rounded-md border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 lg:col-span-2"><CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-emerald-600" />No open insight matches these filters.</div> : null}</div>
  </section>;
}
