import test from "node:test";
import assert from "node:assert/strict";
import { ledgerMappingRoles, ledgerRoleKind } from "./contracts.js";
import { ledgerSetupReviewIssues, ledgerStarterInput, ledgerStarterProposal } from "./starter.js";
import { ledgerBusinessGroup, ledgerBusinessGroups } from "./setupGroups.js";

test("business sections cover every posting purpose exactly once, including payment and equity accounts", () => {
  const roles = ledgerBusinessGroups.flatMap(g => g.roles);
  assert.equal(new Set(roles).size, roles.length);
  assert.deepEqual([...roles].sort(), [...ledgerMappingRoles].sort());
  for (const row of ledgerStarterProposal([], [{ id: "bank-1", name: "Bank", active: true }])) assert.ok(ledgerBusinessGroup(row.key));
  assert.equal(ledgerBusinessGroup("cash:bank-1"), "cash");
  assert.equal(ledgerBusinessGroup("equity:Owner Capital"), "equity");
});

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
test("starter allows explicit existing accounts without overwriting their code or company name", () => {
  const existing = { id: "stock", code: "INV-01", name: "Company Medical Stock", kind: "Asset" as const, active: true };
  const rows = ledgerStarterProposal([existing], [], [{ key: "Inventory", accountId: existing.id }]);
  assert.equal(rows[0].existingId, existing.id); assert.equal(rows[0].name, existing.name); assert.equal(rows[0].code, existing.code);
  const collision = { ...existing, code: "1100" };
  assert.throws(() => ledgerStarterProposal([collision], []), /another purpose/);
  assert.equal(ledgerStarterProposal([collision], [], [{ key: "Inventory", accountId: collision.id }])[0].existingId, collision.id);
});
test("starter rejects unknown, inactive, wrong-type, duplicate and cross-purpose account choices", () => {
  const asset = { id: "asset", code: "A-1", name: "Existing Asset", kind: "Asset" as const, active: true };
  for (const chart of [[], [{ ...asset, active: false }], [{ ...asset, kind: "Expense" as const }]]) assert.throws(() => ledgerStarterProposal(chart, [], [{ key: "Inventory", accountId: asset.id }]), /active Asset/);
  assert.throws(() => ledgerStarterProposal([asset], [], [{ key: "cash:invented", accountId: asset.id }]), /actual setup purposes/);
  assert.throws(() => ledgerStarterProposal([asset], [], [{ key: "Inventory", accountId: asset.id }, { key: "Inventory Clearing", accountId: asset.id }]), /separate ledger account/);
  assert.throws(() => ledgerStarterProposal([asset], [{ id: "bank", name: "Bank", active: true }], [{ key: "Inventory", accountId: asset.id }, { key: "cash:bank", accountId: asset.id }]), /separate ledger account/);
  assert.equal(ledgerStarterInput.safeParse({ effectiveFrom: "2026-11-13", proofReference: "Reviewed", acknowledgeDraft: true, selections: [{ key: "Inventory", accountId: "asset" }, { key: "Inventory", accountId: "asset" }] }).success, false);
});
test("review blocks incomplete payment assignments, unavailable chart accounts and wrong control types", () => {
  const proposal = ledgerStarterProposal([], []), chart = proposal.map(a => ({ id: a.code, code: a.code, name: a.name, kind: a.kind, active: true }));
  const data = { effectiveFrom: "2026-11-13", proofReference: "Reviewed", mappings: proposal.flatMap(a => a.role ? [{ role: a.role, accountId: a.code }] : []), cashMappings: [] as { cashAccountId: string; accountId: string }[] };
  assert.deepEqual(ledgerSetupReviewIssues(data, chart, []), []);
  assert.ok(ledgerSetupReviewIssues(data, chart, [{ id: "bank", name: "Real Bank", active: true }]).some(s => s.includes("Real Bank")));
  assert.ok(ledgerSetupReviewIssues(data, chart.map(a => a.code === "1100" ? { ...a, active: false } : a), []).some(s => s.includes("Inventory")));
  assert.ok(ledgerSetupReviewIssues({ ...data, cashMappings: [{ cashAccountId: "bank", accountId: "1100" }] }, chart, [{ id: "bank", name: "Real Bank", active: true }]).some(s => s.includes("separate")));
});
