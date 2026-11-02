import test from "node:test";
import assert from "node:assert/strict";
import { deletedInvitationCode, invitationActions, invitationFailure } from "./invitation-policy.js";
import { invitationActionInput, invitationListInput } from "../../src/domains/employees/invitationContracts.js";
import type { User } from "../../src/types/index.js";

test("invitation retries are bounded with exponential backoff and dead-letter review", () => {
  const now = new Date("2026-10-28T00:00:00Z");
  for (const [attempt, seconds] of [[1, 60], [2, 120], [3, 240], [4, 480]]) {
    const result = invitationFailure(attempt, true, now); assert.equal(result.state, "Queued"); assert.equal(result.nextAttemptAt.getTime() - now.getTime(), seconds * 1000);
  }
  assert.equal(invitationFailure(5, true, now).state, "Review"); assert.equal(invitationFailure(1, false, now).state, "Review");
});

test("invitation actions need no reason but require a valid current revision and reject forged fields", () => {
  const input = { updatedAt: "2026-11-02T10:00:00.000Z" };
  assert.deepEqual(invitationActionInput.parse(input), input);
  for (const invalid of [{}, { updatedAt: "yesterday" }, { ...input, employeeId: "another" }, { ...input, state: "Cancelled" }, { ...input, reason: "Not a required input" }]) assert.equal(invitationActionInput.safeParse(invalid).success, false);
});

test("invitation cancellation/removal respects account state, ownership, self-protection and authority", () => {
  const actor: User = { id: "admin", name: "Admin", email: "admin@example.invalid", role: "Super Admin", status: "Active", title: "", department: "", phone: "", avatarUrl: "", capabilities: [], permissionOverrides: [] };
  const target = { employeeId: "pending", requestedBy: actor.id, role: "Sales Executive" as const, employeeStatus: "Pending" as const, state: "Sent", lastCode: "PROVIDER_ACCEPTED" };
  assert.deepEqual(invitationActions(actor, target), { canCancel: true, canDelete: false });
  assert.deepEqual(invitationActions(actor, { ...target, state: "Cancelled", employeeStatus: "Inactive" }), { canCancel: false, canDelete: true });
  for (const invalid of [{ ...actor, status: "Inactive" as const }, { ...actor, role: "Accounts" as const }]) assert.deepEqual(invitationActions(invalid, target), { canCancel: false, canDelete: false });
  for (const invalid of [{ ...target, employeeId: actor.id }, { ...target, employeeStatus: "Active" as const }, { ...target, lastCode: deletedInvitationCode }]) assert.deepEqual(invitationActions(actor, invalid), { canCancel: false, canDelete: false });
  assert.equal(invitationActions(actor, { ...target, state: "Cancelled" }).canDelete, false);
});
test("invitation queue filters reject identities and invalid pages/statuses", () => {
  assert.equal(invitationListInput.parse({}).page, 1);
  for (const value of [{ page: 0 }, { page: "1.5" }, { employeeId: "other" }, { state: "Approved" }, { role: "Super Admin" }]) assert.equal(invitationListInput.safeParse(value).success, false);
});
