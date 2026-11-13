import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { ledgerBusinessGroup, ledgerBusinessGroups } from "./setupGroups";

export default function LedgerSetupGroups<T extends { key: string }>({ rows, renderRow, initialGroup = "stock" }: { rows: T[]; renderRow: (row: T) => ReactNode; initialGroup?: string }) {
  return <div className="divide-y divide-blue-100 border-y border-blue-100">
    {ledgerBusinessGroups.map(group => {
      const entries = rows.filter(row => ledgerBusinessGroup(row.key) === group.id);
      if (!entries.length) return null;
      return <details className="group" key={group.id} open={group.id === initialGroup}>
        <summary className="flex cursor-pointer list-none items-center gap-2 bg-blue-50/60 px-3 py-3 text-sm font-semibold text-blue-950">
          <span className="min-w-0 flex-1">{group.title}</span><span className="text-xs font-normal text-slate-500">{entries.length} accounts</span><ChevronDown className="h-4 w-4 shrink-0 group-open:rotate-180" />
        </summary>
        <div className="divide-y divide-blue-100 px-3">{entries.map(row => <div key={row.key} className="min-w-0 py-3">{renderRow(row)}</div>)}</div>
      </details>;
    })}
  </div>;
}
