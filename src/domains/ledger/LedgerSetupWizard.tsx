import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Save } from "lucide-react";
import Button from "../../components/ui/Button";
import { ErrorBlock } from "../components";

export default function LedgerSetupWizard({ details, accounts, review, busy, error, assignmentsValid, saveDisabled, saveLabel, save }: {
  details: ReactNode; accounts: ReactNode; review: ReactNode; busy: boolean; error?: Error | null; assignmentsValid: boolean; saveDisabled: boolean; saveLabel: string; save: () => void;
}) {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const move = (next: number) => { setStep(next); requestAnimationFrame(() => { heading.current?.scrollIntoView({ block: "nearest" }); heading.current?.focus({ preventScroll: true }); }); };
  const titles = ["Company details", "Account assignments", "Review draft"];
  return <form className="grid min-w-0 gap-4" onSubmit={e => {
    e.preventDefault(); if (busy) return;
    if (step === 1 && !assignmentsValid) return;
    if (step < 2) move(step + 1); else if (!saveDisabled) save();
  }}>
    <ol aria-label="Accounting setup progress" className="grid grid-cols-3 gap-2 border-b border-blue-100 pb-3">
      {titles.map((title, index) => <li key={title}><button type="button" disabled={index >= step || busy} onClick={() => move(index)} aria-current={index === step ? "step" : undefined} className={`flex w-full items-start gap-2 rounded p-2 text-left text-xs ${index === step ? "bg-cyan-50 font-semibold text-cyan-900" : "text-slate-500"}`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${index <= step ? "bg-blue-950 text-white" : "bg-slate-100"}`}>{index < step ? <Check className="h-3 w-3" /> : index + 1}</span><span>{title}</span></button></li>)}
    </ol>
    <h3 ref={heading} tabIndex={-1} className="text-base font-semibold text-blue-950 outline-none">{titles[step]}</h3>
    {step === 0 ? details : step === 1 ? accounts : review}
    {error ? <ErrorBlock error={error} title="Setup draft could not be saved" /> : null}
    <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap justify-between gap-2 border-t border-blue-100 bg-white px-4 py-3">
      <div>{step > 0 ? <Button type="button" icon={<ArrowLeft className="h-4 w-4" />} disabled={busy} onClick={() => move(step - 1)}>Back</Button> : null}</div>
      <Button type="submit" variant="primary" icon={step === 2 ? <Save className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />} disabled={busy || (step === 1 && !assignmentsValid) || (step === 2 && saveDisabled)}>{step === 0 ? "Continue to Accounts" : step === 1 ? "Review Draft" : saveLabel}</Button>
    </div>
  </form>;
}
