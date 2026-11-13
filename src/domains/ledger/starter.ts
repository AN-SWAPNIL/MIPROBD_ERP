import { z } from "zod";
import { ledgerAccountSchema, ledgerCashSchema, ledgerMappingRoles, ledgerRoleKind } from "./contracts.js";

export const ledgerStarterInput = z.object({ effectiveFrom: z.iso.date(), proofReference: z.string().trim().min(3).max(200), acknowledgeDraft: z.literal(true) }).strict();
const codes = ["1100", "1110", "1120", "2100", "1130", "4100", "4110", "5100", "5110", "5120", "4200", "5130", "2110", "1140", "1150", "2120", "2130", "1160"];
export function ledgerStarterProposal(chart: z.infer<typeof ledgerAccountSchema>[], cash: z.infer<typeof ledgerCashSchema>[]) {
  const desired = [
    ...ledgerMappingRoles.map((role, index) => ({ role, cashAccountId: undefined as string | undefined, code: codes[index], name: role, kind: ledgerRoleKind(role) })),
    ...[{ code: "3100", name: "Owner Capital" }, { code: "3200", name: "Retained Earnings" }].map(a => ({ ...a, kind: "Equity" as const, role: undefined, cashAccountId: undefined as string | undefined })),
    ...cash.filter(c => c.active).sort((a, b) => a.id.localeCompare(b.id)).map((c, index) => ({ role: undefined, cashAccountId: c.id, code: String(120001 + index), name: `Cash / Bank - ${c.name}`.slice(0, 120), kind: "Asset" as const }))
  ];
  if (cash.filter(c => c.active).length > 100) throw new Error("Use manual posting mapping when there are more than 100 payment accounts.");
  return desired.map(account => {
    const existing = chart.find(a => a.code.toLowerCase() === account.code.toLowerCase());
    if (existing && (!existing.active || existing.kind !== account.kind || existing.name !== account.name)) throw new Error(`Account code ${account.code} already has another purpose. Use New Mapping with your existing chart.`);
    return { ...account, existingId: existing?.id };
  });
}
