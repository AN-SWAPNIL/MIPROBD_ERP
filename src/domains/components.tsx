import clsx from "clsx";
import { AlertCircle, ChevronDown, Inbox, LoaderCircle, X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api/client";
import { ApiRequestError } from "../lib/api/client";
import { fieldLabel, inputIssues } from "../lib/api/validation";
import { ZodError } from "zod";
import { safeErrorMessage } from "../lib/api/safeErrors";
import Button from "../components/ui/Button";

export const inputClass =
  "h-10 min-w-0 max-w-full w-full rounded-md border border-blue-200 bg-[#fbfdff] px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-blue-300 focus:border-cyan-600 focus:bg-white focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100 disabled:text-slate-500";
export const textareaClass =
  "min-h-24 w-full resize-y rounded-md border border-blue-200 bg-[#fbfdff] px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-blue-300 focus:border-cyan-600 focus:bg-white focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100";
export const labelClass = "mb-1 block text-xs font-bold uppercase text-blue-900";
let openModalCount = 0;
let bodyOverflowBeforeModal = "";

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("erp-panel min-w-0 overflow-hidden rounded-md border border-blue-200 bg-white shadow-sm", className)}>
      {title || actions ? (
        <div className="flex flex-col gap-3 border-b border-blue-200 border-l-4 border-l-red-600 bg-blue-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-bold text-blue-950">{title}</h2> : null}
            {subtitle ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel
}: {
  value: T;
  options: readonly { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex max-w-full gap-1 overflow-x-auto rounded-md border border-blue-200 bg-blue-50/70 p-1" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          className={clsx(
            "flex h-9 shrink-0 items-center gap-2 rounded px-3 text-sm font-semibold transition",
            value === option.value ? "bg-blue-950 text-white shadow-sm" : "text-blue-900 hover:bg-white"
          )}
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined ? (
            <span className={clsx("rounded px-1.5 py-0.5 text-[10px]", value === option.value ? "bg-white/15" : "bg-white text-blue-700")}>
              {option.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function TableFrame({ children }: { children: ReactNode }) {
  return <div className="erp-table-frame min-w-0 max-w-full overflow-x-auto bg-white">{children}</div>;
}

export function Modal({
  open,
  title,
  subtitle,
  children,
  onClose,
  footer,
  width = "max-w-2xl"
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  width?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const visibleControls = () => Array.from(root.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]') ?? []).filter(node => !node.hasAttribute("disabled") && node.tabIndex >= 0 && node.getClientRects().length > 0);
    const timer = requestAnimationFrame(() => root.current?.focus({ preventScroll: true }));
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelectorAll('[data-erp-dialog]').item(document.querySelectorAll('[data-erp-dialog]').length - 1) !== root.current || event.defaultPrevented) return;
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "Tab") {
        const controls = visibleControls(), first = controls[0], last = controls.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(timer); document.removeEventListener("keydown", onKey); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    if (!openModalCount) bodyOverflowBeforeModal = document.body.style.overflow;
    openModalCount++;
    document.body.style.overflow = "hidden";
    return () => { openModalCount--; if (!openModalCount) document.body.style.overflow = bodyOverflowBeforeModal; };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div ref={root} data-erp-dialog tabIndex={-1} className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-0 outline-none sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onSubmit={(event) => event.stopPropagation()}>
      <button className="absolute inset-0 cursor-default" type="button" tabIndex={-1} onClick={onClose} aria-label="Close dialog" />
      <div className={clsx("relative flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-md bg-white shadow-2xl sm:rounded-md", width)}>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-blue-900 bg-blue-950 px-4 py-3 text-white">
          <div className="min-w-0 break-words">
            <h2 className="text-lg font-bold text-white">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs leading-5 text-blue-100">{subtitle}</p> : null}
          </div>
          <button className="shrink-0 rounded p-1.5 text-blue-100 hover:bg-white/10 hover:text-white" type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain p-4">{children}</div>
        {footer ? <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">{footer}</div> : null}
      </div>
    </div>, document.body
  );
}

export function SectionAccordion({
  title,
  subtitle,
  status,
  icon: Icon,
  children,
  defaultOpen = true,
  hidden = false,
  alwaysOpen = false,
  highlighted = false,
  current = false,
  id,
  footer,
  onActivate,
  actions
}: {
  title: string;
  subtitle?: string;
  status?: ReactNode;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
  defaultOpen?: boolean;
  hidden?: boolean;
  alwaysOpen?: boolean;
  highlighted?: boolean;
  current?: boolean;
  id?: string;
  footer?: ReactNode;
  onActivate?: () => void;
  actions?: ReactNode;
}) {
  const Root = alwaysOpen ? "section" : "details";
  const Heading = alwaysOpen ? "header" : "summary";
  return (
    <Root id={id} onClickCapture={onActivate} aria-labelledby={id ? `${id}-heading` : undefined} data-highlighted={id ? highlighted : undefined} hidden={hidden} className={clsx("group scroll-mt-24 overflow-hidden rounded-md border bg-white shadow-sm", highlighted ? "border-cyan-600 ring-2 ring-cyan-500/30" : "border-blue-200")} {...(alwaysOpen ? {} : { open: defaultOpen })}>
      <Heading className={clsx("flex list-none flex-wrap items-center gap-3 border-l-4 px-4 py-3", !alwaysOpen && "cursor-pointer", highlighted ? "border-l-cyan-600 bg-cyan-50" : "border-l-red-600 bg-blue-50/70")}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-cyan-50 text-cyan-700"><Icon className="h-4 w-4" /></span>
        <div className="min-w-[140px] flex-1">
          <h2 id={id ? `${id}-heading` : undefined} className="break-words text-sm font-bold text-blue-950 sm:text-base">{title}</h2>
          {subtitle ? <p className="mt-0.5 break-words text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {status}
        {current ? <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900">Current step</span> : null}
        <span onClick={(event) => event.preventDefault()}>{actions}</span>
        {!alwaysOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" /> : null}
      </Heading>
      <div className="border-t border-blue-200">{children}</div>
      {footer}
    </Root>
  );
}

export function LoadingBlock({ label = "Loading data" }: { label?: string }) {
  return (
    <div className="grid min-h-48 place-items-center rounded-md border border-blue-200 bg-blue-50/50 p-8 text-center">
      <div><LoaderCircle className="mx-auto h-6 w-6 animate-spin text-cyan-700" /><p className="mt-2 text-sm font-semibold text-slate-600">{label}</p></div>
    </div>
  );
}

export function ErrorBlock({ error, onRetry, title = "Could not load this workspace" }: { error: unknown; onRetry?: () => void; title?: string }) {
  const issues = error instanceof ApiRequestError ? error.issues : error instanceof ZodError ? inputIssues(error.issues) : [];
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-5 text-red-800">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <strong className="text-sm">{title}</strong>
          {issues.length ? <ul className="mt-2 list-inside list-disc space-y-1 break-words text-sm">{issues.map((issue, index) => <li key={index}><strong>{fieldLabel(issue.field) || "Form"}:</strong> {issue.message}</li>)}</ul> : <p className="mt-1 break-words text-sm">{safeErrorMessage(error)}</p>}
          {onRetry ? <Button className="mt-3" onClick={onRetry}>Try again</Button> : null}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <div className="grid min-h-40 place-items-center p-6 text-center">
      <div>
        <Inbox className="mx-auto h-7 w-7 text-slate-300" />
        <strong className="mt-2 block text-sm text-slate-800">{title}</strong>
        <p className="mt-1 text-sm text-slate-500">{message}</p>
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}

export function ProductThumb({ src, name, size = "md" }: { src?: string; name: string; size?: "sm" | "md" | "lg" }) {
  const image = useQuery({ queryKey: ["product-image", src], enabled: Boolean(src?.startsWith("/api/documents/")), staleTime: 40_000, refetchInterval: 45_000, queryFn: async () => (await apiRequest<{ url: string }>(src!)).data.url });
  const dimensions = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-16 w-16" : "h-11 w-11";
  const [imagePath, sprite] = (src?.startsWith("/api/documents/") ? image.data : src)?.split("#") ?? [];
  const spritePosition: Record<string, string> = {
    dialyzer: "0% 0%",
    bloodline: "100% 0%",
    avf: "0% 100%",
    catheter: "100% 100%"
  };
  return (
    <div className={clsx("shrink-0 overflow-hidden rounded border border-slate-200 bg-white", dimensions)}>
      {imagePath && spritePosition[sprite] ? (
        <span
          className="block h-full w-full bg-white bg-[length:200%_200%] bg-no-repeat"
          style={{ backgroundImage: "url('" + imagePath + "')", backgroundPosition: spritePosition[sprite] }}
          role="img"
          aria-label={name}
        />
      ) : imagePath ? <img className="h-full w-full object-contain p-1" src={imagePath} alt={name} /> : <span className="grid h-full w-full place-items-center text-xs font-bold text-slate-400">{name.slice(0, 2).toUpperCase()}</span>}
    </div>
  );
}

export function KeyValue({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className={clsx("min-w-0 border-l-2 px-3 py-1", accent ? "border-cyan-600" : "border-slate-200")}>
      <dt className="text-[10px] font-bold uppercase text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-slate-900">{value || "-"}</dd>
    </div>
  );
}
