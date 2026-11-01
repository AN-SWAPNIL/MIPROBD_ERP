import test from "node:test";
import assert from "node:assert/strict";
import { balancedLines } from "./money.js";
import { twoSidedPlan } from "./service.js";
import { approvalPolicyInput } from "../../src/domains/controls/contracts.js";
import { ledgerConfigurationInput, ledgerMappingRoles, ledgerRoleKind } from "../../src/domains/ledger/contracts.js";
import { canReadLedger, canManageLedger, canReadPayroll } from "../../src/domains/ledger/access.js";
import { canReadApprovalDomain, canDecideApproval, canReadApprovalAmount } from "../../src/domains/controls/access.js";
import type { User } from "../../src/types/index.js";

const line = (accountId: string, debit: string, credit: string) => ({ accountId, debit, credit, note: "" });
test("ledger exact decimal balance and normalized poisha", () => {
  assert.deepEqual(balancedLines([line("bank", "0.1", "0"), line("bank", "0.2", "0"), line("ar", "0", "0.3")]), {
    lines: [line("bank", "0.10", "0.00"), line("bank", "0.20", "0.00"), line("ar", "0.00", "0.30")], totalBdt: "0.30"
  });
  assert.equal(balancedLines([line("bank", "9999999999999999999999.99", "0"), line("ar", "0", "9999999999999999999999.99")]).totalBdt, "9999999999999999999999.99");
});
test("ledger rejects unbalanced, invalid, zero, excessive-precision and overflow journals", () => {
  for (const lines of [[], [line("a", "1", "0")], [line("a", "0", "0"), line("b", "0", "0")], [line("a", "1", "1"), line("b", "0", "1")], [line("a", "1", "0"), line("b", "0", "1.01")], [line("a", "-1", "0"), line("b", "0", "-1")], [line("a", "1.001", "0"), line("b", "0", "1.001")], [line("a", "9999999999999999999999.99", "0"), line("a", "0.01", "0"), line("b", "0", "9999999999999999999999.99"), line("b", "0", "0.01")]]) assert.throws(() => balancedLines(lines));
});
test("ledger source plans keep signed debit/credit and cash identity explicit", () => {
  assert.deepEqual(twoSidedPlan("Cash", "Receivables", "12.1", "cash-1"), [{ role: "Cash", debit: "12.10", credit: "0.00", cashAccountId: "cash-1" }, { role: "Receivables", debit: "0.00", credit: "12.10" }]);
  assert.deepEqual(twoSidedPlan("Inventory", "Inventory Clearing", "0"), []);
});
test("approval inputs reject duplicate authorities and extra trusted fields", () => {
  const policy = { domain: "Ledger", name: "Accounting authority", effectiveFrom: "2026-10-01", maximumAmountBdt: "1000", verifierIds: ["v"], approverIds: ["a"], independentVerifier: true, proofReference: "Written authority" };
  assert.equal(approvalPolicyInput.safeParse(policy).success, true);
  assert.equal(approvalPolicyInput.safeParse({ ...policy, approverIds: ["a", "a"] }).success, false);
  assert.equal(approvalPolicyInput.safeParse({ ...policy, approvedBy: "a" }).success, false);
});
test("ledger mapping requires every posting role and separate unique bank identities", () => {
  const config = { effectiveFrom: "2026-10-01", proofReference: "Approved chart", mappings: ledgerMappingRoles.map((role) => ({ role, accountId: role })), cashMappings: [{ cashAccountId: "cash", accountId: "bank" }] };
  assert.equal(ledgerConfigurationInput.safeParse(config).success, true);
  assert.equal(ledgerConfigurationInput.safeParse({ ...config, mappings: config.mappings.slice(1) }).success, false);
  assert.equal(ledgerConfigurationInput.safeParse({ ...config, cashMappings: [...config.cashMappings, { cashAccountId: "other", accountId: "bank" }] }).success, false);
  assert.equal(ledgerConfigurationInput.safeParse({ ...config, mappings: config.mappings.map((m) => ({ ...m, accountId: "same" })) }).success, false);
  assert.equal(ledgerRoleKind("Sales Returns"), "Income");
});

const person = (changes: Partial<User> = {}): User => ({ id: "test", name: "Test", email: "test@example.invalid", title: "", department: "", phone: "", avatarUrl: "", role: "Accounts", status: "Active", capabilities: [], permissionOverrides: [], ...changes });
test("Super Admin retains authority; delegated ledger and payroll access honors grants and inactivity", () => {
  assert.equal(canReadLedger(person({ role: "Super Admin" })), true);
  for (const role of ["Managing Director", "Accounts", "Import Officer", "Warehouse Manager", "Sales Manager", "Sales Executive"] as const) assert.equal(canReadLedger(person({ role })), false);
  const operator = person({ capabilities: ["view_sensitive_cost", "manage_ledger"] });
  assert.equal(canReadLedger(operator), true); assert.equal(canManageLedger(operator), true); assert.equal(canDecideApproval(operator, "Ledger"), false); assert.equal(canReadPayroll(operator), false);
  assert.equal(canReadLedger({ ...operator, status: "Inactive" }), false);
  assert.equal(canReadLedger({ ...operator, permissionOverrides: [{ permission: "accounts", action: "view", effect: "DENY" }] }), false);
  const director = person({ role: "Managing Director", capabilities: ["view_sensitive_cost", "approve_ledger"] });
  assert.equal(canReadLedger(director), true); assert.equal(canManageLedger(director), false); assert.equal(canDecideApproval(director, "Ledger"), true);
  assert.equal(canReadApprovalDomain(person({ role: "Sales Executive" }), "Payroll"), false);
  assert.equal(canReadPayroll(person({ capabilities: ["view_payroll"] })), true);
  assert.equal(canReadApprovalAmount(person({ role: "Warehouse Manager" }), "Stock"), false);
  assert.equal(canReadApprovalAmount(operator, "Stock"), true);
  assert.equal(canReadApprovalAmount(operator, "Payroll"), false);
});
