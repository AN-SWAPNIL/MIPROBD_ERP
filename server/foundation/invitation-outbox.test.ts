import test from "node:test";
import assert from "node:assert/strict";
import { invitationFailure } from "./invitation-policy.js";
import { invitationListInput } from "../../src/domains/employees/invitationContracts.js";

test("invitation retries are bounded with exponential backoff and dead-letter review", () => {
  const now = new Date("2026-10-28T00:00:00Z");
  for (const [attempt, seconds] of [[1, 60], [2, 120], [3, 240], [4, 480]]) {
    const result = invitationFailure(attempt, true, now); assert.equal(result.state, "Queued"); assert.equal(result.nextAttemptAt.getTime() - now.getTime(), seconds * 1000);
  }
  assert.equal(invitationFailure(5, true, now).state, "Review"); assert.equal(invitationFailure(1, false, now).state, "Review");
});
test("invitation queue filters reject identities and invalid pages/statuses", () => {
  assert.equal(invitationListInput.parse({}).page, 1);
  for (const value of [{ page: 0 }, { page: "1.5" }, { employeeId: "other" }, { state: "Approved" }, { role: "Super Admin" }]) assert.equal(invitationListInput.safeParse(value).success, false);
});
