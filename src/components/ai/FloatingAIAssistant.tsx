import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Bot, LoaderCircle, Send, Sparkles, UserRound, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { AISource } from "../../domains/erp.types";
import { aiService } from "../../domains/services";
import { useAIContextStore } from "../../lib/ai/context";
import { useAuthStore } from "../../lib/auth/session";

type Message = { id: string; role: "assistant" | "user"; text: string; sources?: AISource[]; restricted?: boolean };

function contextName(route: string) {
  if (route.includes("/imports/")) return "Current import case";
  if (route.includes("/imports")) return "Import register";
  if (route.includes("/inventory")) return "Inventory";
  if (route.includes("/employees")) return "Employees";
  if (route.includes("/sales")) return "Sales";
  if (route.includes("/reports")) return "Reports";
  if (route.includes("/accounts")) return "Expenses & Accounts";
  if (route.includes("/settings")) return "Settings";
  return "Dashboard";
}

export default function FloatingAIAssistant() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([{ id: "welcome", role: "assistant", text: "I can explain the current workflow and summarize only the records your role is allowed to see." }]);
  const session = useAuthStore((state) => state.session);
  const context = useAIContextStore((state) => state.context);
  const contextKey = useMemo(() => JSON.stringify(context), [context]);
  const recommendations = useQuery({ queryKey: ["ai", "recommendations", session?.user.id, contextKey], queryFn: () => aiService.recommendations(context), enabled: open });
  const chat = useMutation({
    mutationFn: (message: string) => aiService.chat(message, context),
    onSuccess: (response) => {
      setSuggestions(response.suggestions);
      setMessages((current) => [...current, { id: `assistant-${Date.now()}`, role: "assistant", text: response.answer, sources: response.sources, restricted: response.restricted }]);
    },
    onError: (error) => setMessages((current) => [...current, { id: `error-${Date.now()}`, role: "assistant", text: error instanceof Error ? error.message : "I could not read the current ERP context." }])
  });
  const defaultSuggestions = context.entityType === "import"
    ? ["Explain the current shipment stage", "Which documents are missing?"]
    : context.entityType === "inventory"
      ? ["Which lot should be issued first?", "Which batches need attention?"]
      : context.entityType === "sales"
        ? ["Which customers need follow-up?", "Which quotations are still pending?"]
        : context.entityType === "employees"
          ? ["Summarize this employee's activity", "Who has overdue follow-ups?", "Who is below target this month?"]
        : context.entityType === "field-team"
          ? ["Who is active in the field?", "Summarize today's visits", "Which location updates are stale?"]
          : context.entityType === "insights"
            ? ["What needs attention first?", "Summarize my operational alerts"]
            : context.entityType === "reports"
              ? ["Summarize this report period", "Compare salesperson performance"]
              : ["What needs attention today?", "Summarize my current workspace"];

  const ask = (value: string) => {
    const question = value.trim();
    if (!question || chat.isPending) return;
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", text: question }]);
    setDraft("");
    chat.mutate(question);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(draft);
  };

  return (
    <>
      {!open ? (
        <button className="fixed bottom-4 right-4 z-40 flex h-12 items-center gap-2 rounded-full border border-cyan-200 bg-blue-950 px-3 text-sm font-bold text-white shadow-xl transition hover:-translate-y-0.5 hover:bg-blue-900 sm:bottom-5 sm:right-5 sm:px-4" type="button" onClick={() => setOpen(true)} aria-label="Ask MIPRO AI" data-testid="ai-launcher">
          <Sparkles className="h-5 w-5 text-cyan-300" /><span className="hidden sm:inline">Ask MIPRO AI</span>
        </button>
      ) : (
        <section className="fixed inset-2 z-40 flex flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-2xl sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[620px] sm:max-h-[calc(100vh-40px)] sm:w-[390px]" aria-label="MIPRO AI assistant" data-testid="ai-assistant">
          <header className="shrink-0 bg-blue-950 px-4 py-3 text-white">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-cyan-500/20 text-cyan-200"><Bot className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1"><h2 className="text-sm font-bold">MIPRO AI</h2><p className="truncate text-[11px] text-blue-200">{session?.user.role} | {contextName(context.route)}</p></div>
              <button className="rounded p-1.5 text-blue-100 hover:bg-white/10" type="button" onClick={() => setOpen(false)} aria-label="Close MIPRO AI" title="Close"><X className="h-5 w-5" /></button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-3" aria-live="polite">
            <div className="grid gap-3">
              {messages.map((message) => (
                <div className={`flex items-start gap-2 ${message.role === "user" ? "flex-row-reverse" : ""}`} key={message.id}>
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded ${message.role === "assistant" ? "bg-cyan-100 text-cyan-800" : "bg-slate-200 text-slate-700"}`}>{message.role === "assistant" ? <Sparkles className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}</span>
                  <div className={`max-w-[84%] rounded-md border p-3 text-xs leading-5 ${message.role === "user" ? "border-blue-900 bg-blue-900 text-white" : message.restricted ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700"}`}>
                    <p>{message.text}</p>
                    {message.sources?.length ? <div className="mt-2 grid gap-1 border-t border-current/10 pt-2">{message.sources.map((source) => <Link className="inline-flex items-center gap-1 font-bold text-cyan-700 hover:underline" to={source.path} onClick={() => setOpen(false)} key={source.path}><ArrowRight className="h-3 w-3" />{source.label}</Link>)}</div> : null}
                  </div>
                </div>
              ))}
              {chat.isPending ? <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin text-cyan-700" />Reading permitted records...</div> : null}
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white p-3">
            {recommendations.data?.[0] ? <div className="mb-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-900"><strong>{recommendations.data[0].title}</strong><span className="mt-0.5 block text-amber-800">{recommendations.data[0].summary}</span></div> : null}
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">{(suggestions.length ? suggestions : defaultSuggestions).slice(0, 3).map((question) => <button className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:border-cyan-300 hover:text-cyan-800" type="button" onClick={() => ask(question)} key={question}>{question}</button>)}</div>
            <form className="flex items-end gap-2" onSubmit={submit}>
              <label className="min-w-0 flex-1"><span className="sr-only">Ask MIPRO AI</span><textarea className="min-h-10 max-h-24 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100" rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about this workspace..." /></label>
              <button className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-blue-950 text-white hover:bg-blue-900 disabled:opacity-50" type="submit" disabled={chat.isPending || !draft.trim()} aria-label="Send question" title="Send"><Send className="h-4 w-4" /></button>
            </form>
            <p className="mt-1.5 text-[9px] leading-4 text-slate-400">Answers follow your access. Saved business records and approvals remain the source of truth.</p>
          </div>
        </section>
      )}
    </>
  );
}
