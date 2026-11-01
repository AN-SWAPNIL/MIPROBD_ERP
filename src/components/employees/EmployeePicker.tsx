import { Check, ChevronDown, Search, UserRound, Users } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SalespersonEmployee } from "../../domains/erp.types";

type Props = {
  employees: SalespersonEmployee[];
  value: string;
  onChange: (value: string) => void;
  allowAll?: boolean;
  allLabel?: string;
  disabled?: boolean;
  label?: string;
};

export default function EmployeePicker({ employees, value, onChange, allowAll = true, allLabel = "All Sales Employees", disabled, label = "Employee" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number }>();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const selected = employees.find((employee) => employee.id === value);
  const options = useMemo(() => {
    const term = query.trim().toLowerCase();
    const rows = employees.filter((employee) => !term || [employee.name, employee.employeeCode ?? employee.id, employee.title, employee.territory ?? ""].some((entry) => entry.toLowerCase().includes(term)));
    return allowAll && !term ? [{ id: "all", name: allLabel, title: "Team comparison", territory: "All territories", employeeCode: "ALL" }, ...rows] : rows;
  }, [allowAll, allLabel, employees, query]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const edge = 8;
    const width = Math.min(Math.max(rect.width, 280), window.innerWidth - edge * 2);
    const left = Math.min(Math.max(edge, rect.left), Math.max(edge, window.innerWidth - width - edge));
    const below = window.innerHeight - rect.bottom - edge;
    const above = rect.top - edge;
    const openAbove = below < 220 && above > below;
    const available = Math.max(140, openAbove ? above - 4 : below - 4);
    setPosition(openAbove
      ? { bottom: window.innerHeight - rect.top + 4, left, width, maxHeight: Math.min(360, available) }
      : { top: rect.bottom + 4, left, width, maxHeight: Math.min(360, available) });
  }, []);

  useEffect(() => {
    if (!open) {
      setPosition(undefined);
      return;
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (open) {
      setActiveIndex(Math.max(0, options.findIndex((option) => option.id === value)));
    } else setQuery("");
  }, [open, options, value]);

  useEffect(() => {
    if (open && position) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, position]);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  const menu = open && position ? (
    <div
      className="fixed z-[100] flex flex-col overflow-hidden rounded-md border border-blue-200 bg-white shadow-2xl ring-1 ring-blue-950/10"
      ref={menuRef}
      style={position}
    >
      <div className="relative shrink-0 border-b border-blue-100 bg-blue-50 p-2"><Search className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-700" /><input ref={inputRef} className="h-10 w-full rounded-md border border-blue-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100" type="search" autoComplete="off" placeholder="Search name, ID, designation..." value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(options.length - 1, index + 1)); }
        if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
        if (event.key === "Enter" && options[activeIndex]) { event.preventDefault(); choose(options[activeIndex].id); }
        if (event.key === "Escape") setOpen(false);
      }} /></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1" role="listbox" id={listboxId} aria-label={label}>
        {options.map((employee, index) => <button className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left ${index === activeIndex ? "bg-cyan-50" : "hover:bg-blue-50/70"}`} type="button" role="option" aria-selected={value === employee.id} key={employee.id} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(employee.id)}><span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-blue-50 text-blue-800">{employee.id === "all" ? <Users className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-blue-950">{employee.name}</strong><small className="block truncate text-slate-500">{employee.employeeCode ?? employee.id} | {employee.title} | {employee.territory ?? "No territory"}</small></span>{value === employee.id ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : null}</button>)}
        {!options.length ? <p className="px-3 py-8 text-center text-sm text-slate-500">No permitted employee matches this search.</p> : null}
      </div>
    </div>
  ) : null;

  return (
    <div className="relative" ref={rootRef} data-testid="employee-picker">
      <span className="mb-1 block text-xs font-bold uppercase text-blue-900">{label}</span>
      <button ref={triggerRef} className="flex min-h-11 w-full items-center gap-3 rounded-md border border-blue-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-cyan-500 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100" type="button" onClick={() => setOpen((current) => !current)} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listboxId : undefined}>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-cyan-50 text-cyan-800">{value === "all" ? <Users className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}</span>
        <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{selected?.name ?? (value === "all" ? allLabel : "Choose employee")}</strong><small className="block truncate text-slate-500">{selected ? `${selected.employeeCode ?? selected.id} | ${selected.title} | ${selected.territory ?? "No territory"}` : value === "all" ? "Compare the permitted team" : "Search name, ID, designation or territory"}</small></span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
