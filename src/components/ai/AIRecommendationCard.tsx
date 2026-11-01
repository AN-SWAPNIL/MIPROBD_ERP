import { AlertTriangle, ArrowRight, CircleAlert, Info, Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { AIRecommendation } from "../../domains/erp.types";

const tone = {
  Info: { border: "border-cyan-200", background: "bg-cyan-50", text: "text-cyan-800", Icon: Info },
  Attention: { border: "border-amber-200", background: "bg-amber-50", text: "text-amber-800", Icon: AlertTriangle },
  Critical: { border: "border-red-200", background: "bg-red-50", text: "text-red-800", Icon: CircleAlert }
};

export default function AIRecommendationCard({ recommendation, onDismiss, compact = false }: { recommendation: AIRecommendation; onDismiss?: () => void; compact?: boolean }) {
  const style = tone[recommendation.severity];
  const Icon = style.Icon;
  return (
    <article className={`rounded-md border ${style.border} ${style.background} ${compact ? "p-3" : "p-4"}`} data-testid="ai-recommendation">
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded bg-white/80 ${style.text}`}><Icon className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div><span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase ${style.text}`}><Sparkles className="h-3 w-3" /> Smart {recommendation.severity}</span><h3 className="mt-0.5 text-sm font-bold text-slate-950">{recommendation.title}</h3></div>
            {onDismiss ? <button className="rounded p-1 text-slate-400 hover:bg-white/70 hover:text-slate-700" type="button" onClick={onDismiss} aria-label="Dismiss recommendation" title="Dismiss"><X className="h-4 w-4" /></button> : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-700">{recommendation.summary}</p>
          {!compact ? <><p className="mt-2 text-xs leading-5 text-slate-600"><strong>Why:</strong> {recommendation.reason}</p><p className="text-xs leading-5 text-slate-600"><strong>Recommended:</strong> {recommendation.recommendedAction}</p></> : null}
          {recommendation.sourcePath ? <div className="mt-2"><Link className="inline-flex min-h-9 items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold text-cyan-800 hover:bg-white/70" to={recommendation.sourcePath}><ArrowRight className="h-4 w-4" />Review {recommendation.sourceLabel}</Link></div> : null}
        </div>
      </div>
    </article>
  );
}
