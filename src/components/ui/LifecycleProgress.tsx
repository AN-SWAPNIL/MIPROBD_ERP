import { Check } from "lucide-react";

export type LifecycleStep = { id: string; label: string; state: "complete" | "current" | "pending" | "warning" | "cancelled"; detail?: string };

export default function LifecycleProgress({ steps, label = "Lifecycle progress" }: { steps: LifecycleStep[]; label?: string }) {
  return <section className="overflow-x-auto rounded-md border border-slate-200 bg-white px-3 py-4 shadow-sm" aria-label={label}>
    <ol className="flex items-start" style={{ minWidth: `${steps.length * 98}px` }}>
      {steps.map((step, index) => {
        const active = step.state === "complete" || step.state === "current";
        const warning = step.state === "warning";
        return <li className="relative flex min-w-24 flex-1 flex-col items-center px-1 text-center" key={step.id} aria-current={step.state === "current" ? "step" : undefined}>
          {index ? <span className={`absolute right-1/2 top-3 h-0.5 w-full ${active ? "bg-cyan-600" : "bg-slate-200"}`} /> : null}
          <span className={`relative z-10 grid h-6 w-6 place-items-center rounded-full border-2 text-[10px] font-bold ${active ? "border-cyan-600 bg-cyan-600 text-white" : warning ? "border-amber-500 bg-amber-50 text-amber-800" : step.state === "cancelled" ? "border-rose-400 bg-rose-50 text-rose-700" : "border-slate-300 bg-white text-slate-400"}`}>
            {step.state === "complete" ? <Check className="h-3.5 w-3.5" /> : index + 1}
          </span>
          <span className={`mt-2 text-[10px] font-semibold ${step.state === "current" ? "text-cyan-800" : "text-slate-500"}`}>{step.label}</span>
          {step.detail ? <span className="mt-1 text-[10px] text-slate-600">{step.detail}</span> : null}
        </li>;
      })}
    </ol>
  </section>;
}
