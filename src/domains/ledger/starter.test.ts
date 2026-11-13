import test from "node:test";
import assert from "node:assert/strict";
import { ledgerMappingRoles, ledgerRoleKind } from "./contracts.js";
import { ledgerStarterInput, ledgerStarterProposal } from "./starter.js";

test("starter proposes separate control/equity accounts and maps only real active payment masters", () => {
  const rows = ledgerStarterProposal([], [{ id: "b", name: "Bank", active: true }, { id: "a", name: "Cash", active: true }, { id: "closed", name: "Closed", active: false }]);
  assert.equal(new Set(rows.map(r => r.code)).size, rows.length);
  assert.equal(rows.filter(r => r.role).length, ledgerMappingRoles.length);
  for (const row of rows) if (row.role) assert.equal(row.kind, ledgerRoleKind(row.role));
  assert.deepEqual(rows.filter(r => r.cashAccountId).map(r => r.cashAccountId), ["a", "b"]);
  assert.equal(rows.filter(r => r.kind === "Equity").length, 2);
  assert.equal(ledgerStarterProposal([], []).some(r => r.cashAccountId), false);
  assert.ok(rows.every(r => !Object.hasOwn(r, "balance") && !Object.hasOwn(r, "approved")));
});
test("starter reuses only matching active chart accounts and never overwrites another company purpose", () => {
  const matching = { id: "existing", code: "1100", name: "Inventory", kind: "Asset" as const, active: true };
  assert.equal(ledgerStarterProposal([matching], [])[0].existingId, "existing");
  for (const row of [{ ...matching, kind: "Liability" as const }, { ...matching, name: "Another Purpose" }, { ...matching, active: false }]) assert.throws(() => ledgerStarterProposal([row], []), /another purpose/);
});
test("starter requires an explicit review acknowledgment and cannot accept balances or approval status", () => {
  const input = { effectiveFrom: "2026-11-13", proofReference: "Owner review", acknowledgeDraft: true };
  assert.equal(ledgerStarterInput.safeParse(input).success, true);
  for (const body of [{ ...input, acknowledgeDraft: false }, { ...input, state: "Approved" }, { ...input, balance: "1000" }]) assert.equal(ledgerStarterInput.safeParse(body).success, false);
});
