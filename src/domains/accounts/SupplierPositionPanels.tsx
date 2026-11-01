import Decimal from "decimal.js";
import { RotateCcw } from "lucide-react";
import Button from "../../components/ui/Button";
import StatusBadge from "../../components/ui/StatusBadge";
import { foundationMode } from "../../lib/runtime";
import { formatMoney } from "../../utils/precise";
import { Panel, TableFrame } from "../components";
import type { FinancialPositionEntry, Supplier, SupplierSettlement } from "../erp.types";

const Money = Decimal.clone({ precision: 48, rounding: Decimal.ROUND_HALF_UP });
type Props = {
  suppliers: Supplier[]; settlements: SupplierSettlement[]; positions: FinancialPositionEntry[]; search: string;
  canViewPosition: boolean; canPost: boolean; busy: boolean;
  onReverse: (kind: "supplier" | "position", entry: { id: string; label: string; amount: string }) => void;
};
export default function SupplierPositionPanels({ suppliers, settlements, positions, search, canViewPosition, canPost, busy, onReverse }: Props) {
  const matches = (...values: (string | undefined)[]) => values.some((value) => value?.toLowerCase().includes(search.toLowerCase()));
  const balances = suppliers.map((supplier) => {
    const rows = settlements.filter((entry) => entry.supplierId === supplier.id && entry.status === "Posted");
    const obligation = rows.filter((entry) => entry.entryType === "Obligation").reduce((sum, entry) => sum.plus(entry.amount), new Money(0));
    const paid = rows.filter((entry) => entry.entryType === "Payment").reduce((sum, entry) => sum.plus(entry.amount), new Money(0));
    const openingAdvance = rows.filter((entry) => entry.entryType === "Opening Advance").reduce((sum, entry) => sum.plus(entry.amount), new Money(0));
    const credit = rows.filter((entry) => entry.entryType === "Credit").reduce((sum, entry) => sum.plus(entry.amount), new Money(0));
    return { supplier, obligation, paid, openingAdvance, credit, net: obligation.minus(paid).minus(openingAdvance).minus(credit), count: rows.length };
  }).filter((row) => (row.supplier.active || row.count) && (matches(row.supplier.name) || settlements.some((entry) => entry.supplierId === row.supplier.id && matches(entry.reference, entry.paymentReference, entry.notes))));
  const visible = settlements.filter((entry) => matches(entry.supplierName, entry.reference, entry.paymentReference, entry.notes));
  const visiblePositions = positions.filter((entry) => matches(entry.category, entry.label, entry.reference));
  return <div className="grid min-w-0 gap-4">
    <Panel title="Supplier balances" subtitle="Obligations less actual payments, historical opening advances and separately approved supplier credits.">
      <TableFrame><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-blue-50 text-blue-950"><tr>{["Supplier", "Obligations", "Paid", "Opening Advance", "Credit", "Payable", "Advance"].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{balances.map(({ supplier, obligation, paid, openingAdvance, credit, net }) => <tr key={supplier.id}><td className="px-4 py-3 font-semibold">{supplier.name}</td><td className="px-4 py-3">{formatMoney(obligation.toFixed(2))}</td><td className="px-4 py-3">{formatMoney(paid.toFixed(2))}</td><td className="px-4 py-3">{formatMoney(openingAdvance.toFixed(2))}</td><td className="px-4 py-3">{formatMoney(credit.toFixed(2))}</td><td className="px-4 py-3 font-bold text-rose-700">{formatMoney(Money.max(0, net).toFixed(2))}</td><td className="px-4 py-3 font-bold text-emerald-700">{formatMoney(Money.max(0, net.negated()).toFixed(2))}</td></tr>)}{!balances.length ? <tr><td colSpan={6} className="p-6 text-center text-slate-500">No supplier balance matches this search.</td></tr> : null}</tbody></table></TableFrame>
    </Panel>
    <Panel title="Supplier settlement ledger" subtitle="Obligations do not move cash; payments and payment reversals post to the selected account.">
      <TableFrame><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-blue-50 text-blue-950"><tr>{["Date", "Supplier / Reference", "Entry / Status", "Account", "Amount", "Actions"].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{visible.map((entry) => <tr key={entry.id}><td className="px-4 py-3">{entry.date}</td><td className="px-4 py-3"><strong className="block">{entry.supplierName}</strong><small>{entry.reference}</small>{entry.openingPositionId ? <small className="block text-cyan-800">Approved opening source</small> : null}</td><td className="px-4 py-3"><span className="mr-2">{entry.entryType}</span><StatusBadge status={entry.status} />{entry.reversalReason ? <small className="mt-1 block text-slate-500">{entry.reversalReason}</small> : null}</td><td className="px-4 py-3">{entry.accountName ?? "-"}</td><td className="px-4 py-3 font-bold">{formatMoney(entry.amount)}</td><td className="px-4 py-3">{foundationMode && canPost && entry.status === "Posted" && !entry.openingPositionId && !entry.supplierClaimId ? <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} disabled={busy} aria-label={`Reverse supplier entry ${entry.id}`} title="Reverse supplier entry" onClick={() => onReverse("supplier", { id: entry.id, label: entry.reference, amount: entry.amount })} /> : null}</td></tr>)}{!visible.length ? <tr><td colSpan={6} className="p-6 text-center text-slate-500">No supplier entries match this search.</td></tr> : null}</tbody></table></TableFrame>
    </Panel>
    {canViewPosition ? <Panel title="Controlled financial-position entries" subtitle="Verified opening/adjustment sources, separate from cash movements. This is not a general ledger.">
      <TableFrame><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-blue-50 text-blue-950"><tr>{["As Of", "Category / Label", "Source Reference", "Amount", "Status", "Actions"].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{visiblePositions.map((entry) => <tr key={entry.id}><td className="px-4 py-3">{entry.asOfDate}</td><td className="px-4 py-3"><strong className="block">{entry.category}</strong>{entry.label}</td><td className="px-4 py-3">{entry.reference}</td><td className="px-4 py-3 font-bold">{formatMoney(entry.amount)}</td><td className="px-4 py-3"><StatusBadge status={entry.status} />{entry.reversalReason ? <small className="block text-slate-500">{entry.reversalReason}</small> : null}</td><td className="px-4 py-3">{foundationMode && canPost && entry.status === "Posted" ? <Button variant="ghost" disabled={busy} icon={<RotateCcw className="h-4 w-4" />} aria-label={`Reverse position entry ${entry.id}`} title="Reverse position entry" onClick={() => onReverse("position", { id: entry.id, label: entry.label, amount: entry.amount })} /> : null}</td></tr>)}{!visiblePositions.length ? <tr><td colSpan={6} className="p-6 text-center text-slate-500">No financial-position entries match this search.</td></tr> : null}</tbody></table></TableFrame>
    </Panel> : null}
  </div>;
}
