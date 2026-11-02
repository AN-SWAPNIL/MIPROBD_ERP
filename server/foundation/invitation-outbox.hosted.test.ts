import test from "node:test";
import assert from "node:assert/strict";
import { AuthApiError } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { auditEvents, employees, invitationJobs } from "../../database/schema.js";
import { hostedHarness } from "../testing/hosted.js";
import { processInvitation, queueInvitation } from "./invitation-outbox.js";
import { deletedInvitationCode } from "./invitation-policy.js";
import { invitationListSchema } from "../../src/domains/employees/invitationContracts.js";

test("hosted outbox: durable retries, worker leases, cooldown, authorization and safe projections", { skip: process.env.RUN_HOSTED_UPDATE13_TESTS !== "true", timeout: 180000 }, async () => {
  const h = await hostedHarness("outbox");
  try {
    const admin = await h.employee("Super Admin"); const target = await h.employee("Sales Executive");
    const denied = await h.employee("Accounts");
    await h.ctx.db.update(employees).set({ status: "Pending" }).where(eq(employees.id, target.id));
    const id = await h.ctx.db.transaction((tx) => queueInvitation(tx, target.id, admin.id));
    await assert.rejects(h.ctx.db.transaction((tx) => queueInvitation(tx, target.id, admin.id)), /one minute/);
    let calls = 0; let fail = false;
    // Exercise real DB/provider identity lookup, but never send test mail through the configured SMTP.
    for (const ctx of [h.ctx, h.other]) {
      const original = ctx.publicClient;
      ctx.publicClient = () => { const client = original(); client.auth.resetPasswordForEmail = async () => {
        calls++; await new Promise((resolve) => setTimeout(resolve, 100));
        return fail ? { data: null, error: new AuthApiError("Synthetic provider limit", 429, "over_email_send_rate_limit") } : { data: {}, error: null };
      }; return client; };
    }
    const parallel = await Promise.all([processInvitation(h.ctx, id), processInvitation(h.other, id)]);
    assert.equal(parallel.filter(Boolean).length, 1); assert.equal(calls, 1);
    let [job] = await h.ctx.db.select().from(invitationJobs).where(eq(invitationJobs.id, id));
    assert.equal(job.state, "Sent"); assert.equal(job.attempts, 1); assert.equal(job.leaseToken, null);
    const list = await h.expect("/settings/invitations", admin.token);
    const row = list.rows.find((value: { id: string }) => value.id === id); assert.ok(row);
    assert.equal("leaseToken" in row, false); assert.equal("email" in row, false); assert.equal("authUserId" in row, false);
    assert.equal((await h.call("/settings/invitations", denied.token)).status, 403);
    fail = true;
    await h.ctx.db.update(invitationJobs).set({ state: "Queued", attempts: 0, nextAttemptAt: new Date(0) }).where(eq(invitationJobs.id, id));
    await processInvitation(h.ctx, id);
    [job] = await h.ctx.db.select().from(invitationJobs).where(eq(invitationJobs.id, id));
    assert.equal(job.state, "Queued"); assert.equal(job.lastCode, "PROVIDER_LIMIT"); assert.ok(job.nextAttemptAt > new Date());
    assert.equal(await processInvitation(h.other, id), null);
    await h.ctx.db.update(invitationJobs).set({ state: "Processing", attempts: 4, leaseUntil: new Date(0) }).where(eq(invitationJobs.id, id));
    await processInvitation(h.ctx, id);
    [job] = await h.ctx.db.select().from(invitationJobs).where(eq(invitationJobs.id, id));
    assert.equal(job.state, "Review"); assert.equal(job.attempts, 5);
    await h.ctx.db.update(invitationJobs).set({ state: "Queued", attempts: 0, nextAttemptAt: new Date(0) }).where(eq(invitationJobs.id, id));
    await h.ctx.db.update(employees).set({ status: "Inactive" }).where(eq(employees.id, admin.id));
    const before = calls; await processInvitation(h.ctx, id);
    [job] = await h.ctx.db.select().from(invitationJobs).where(eq(invitationJobs.id, id));
    assert.equal(job.state, "Cancelled"); assert.equal(calls, before);
  } finally { await h.close(); }
});

test("hosted invitations: cancellation blocks sessions/old links, logical deletion retains audit, and in-flight sends cannot restore onboarding", { skip: process.env.RUN_HOSTED_UPDATE13_TESTS !== "true", timeout: 240000 }, async () => {
  const h = await hostedHarness("invitation-cancel");
  try {
    const admin = await h.employee("Super Admin"); const denied = await h.employee("Accounts"); const target = await h.employee("Sales Executive");
    await h.ctx.db.update(employees).set({ status: "Pending" }).where(eq(employees.id, target.id));
    const id = await h.ctx.db.transaction((tx) => queueInvitation(tx, target.id, admin.id));
    const path = `/settings/invitations/${id}`;
    const list = invitationListSchema.parse(await h.expect("/settings/invitations", admin.token));
    const row = list.rows.find((row) => row.id === id)!;
    assert.equal(row.canCancel, true); assert.equal(row.canDelete, false);
    const input = { updatedAt: row.updatedAt };
    await h.expect(path, admin.token, input, 409, { method: "DELETE" });
    await h.expect(`${path}/cancel`, denied.token, input, 403);
    await h.expect(`${path}/cancel`, admin.token, {}, 422);
    await h.expect(`${path}/cancel`, admin.token, { ...input, employeeId: admin.id }, 422);
    await h.expect(`${path}/cancel`, admin.token, { updatedAt: new Date(0).toISOString() }, 409);
    await h.expect(`${path}/cancel`, admin.token, input);
    const [employee] = await h.ctx.db.select().from(employees).where(eq(employees.id, target.id));
    const [cancelled] = await h.ctx.db.select().from(invitationJobs).where(eq(invitationJobs.id, id));
    assert.equal(employee.status, "Inactive"); assert.equal(cancelled.state, "Cancelled");
    assert.equal(cancelled.leaseToken, null); assert.equal(await processInvitation(h.other, id), null);
    await h.expect("/me", target.token, undefined, 401);
    await h.expect("/auth/login", "", { email: target.email, password: h.password }, 403);
    await assert.rejects(h.ctx.db.transaction((tx) => queueInvitation(tx, target.id, admin.id)), /Only Pending/);
    // Old valid provider tokens must not reactivate a cancelled ERP employee.
    const session = await h.ctx.publicClient().auth.signInWithPassword({ email: target.email, password: h.password });
    assert.ok(session.data.session);
    await h.expect("/auth/exchange", "", { accessToken: session.data.session.access_token, refreshToken: session.data.session.refresh_token }, 403);
    const cancelledList = invitationListSchema.parse(await h.expect("/settings/invitations?state=Cancelled", admin.token));
    assert.equal(cancelledList.rows.find((row) => row.id === id)?.canDelete, true);
    await h.expect(path, denied.token, { updatedAt: cancelled.updatedAt.toISOString() }, 403, { method: "DELETE" });
    await h.expect(path, admin.token, input, 409, { method: "DELETE" });
    await h.expect(path, admin.token, { updatedAt: cancelled.updatedAt.toISOString() }, 200, { method: "DELETE" });
    const removedList = invitationListSchema.parse(await h.expect("/settings/invitations?state=Cancelled", admin.token));
    assert.equal(removedList.rows.some((row) => row.id === id), false);
    const [removed] = await h.ctx.db.select().from(invitationJobs).where(eq(invitationJobs.id, id));
    assert.equal(removed.lastCode, deletedInvitationCode);
    const audits = await h.ctx.db.select().from(auditEvents).where(eq(auditEvents.entityId, target.id));
    assert.equal(audits.filter((row) => row.action === "Invitation cancelled").length, 1);
    assert.equal(audits.filter((row) => row.action === "Invitation removed").length, 1);
    await h.expect(path, admin.token, { updatedAt: removed.updatedAt.toISOString() }, 404, { method: "DELETE" });

    const inFlight = await h.employee("Sales Executive");
    await h.ctx.db.update(employees).set({ status: "Pending" }).where(eq(employees.id, inFlight.id));
    const racingId = await h.ctx.db.transaction((tx) => queueInvitation(tx, inFlight.id, admin.id));
    let entered!: () => void; let release!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; }); const waiting = new Promise<void>((resolve) => { release = resolve; });
    const original = h.other.publicClient;
    h.other.publicClient = () => { const client = original(); client.auth.resetPasswordForEmail = async () => { entered(); await waiting; return { data: {}, error: null }; }; return client; };
    const send = processInvitation(h.other, racingId);
    try {
      await Promise.race([started, send.then(() => { throw new Error("Provider test did not start"); })]);
      const [processing] = await h.ctx.db.select().from(invitationJobs).where(eq(invitationJobs.id, racingId));
      assert.equal(processing.state, "Processing");
      await h.expect(`/settings/invitations/${racingId}/cancel`, admin.token, { updatedAt: processing.updatedAt.toISOString() });
    } finally { release(); await send; }
    const [afterRace] = await h.ctx.db.select().from(invitationJobs).where(eq(invitationJobs.id, racingId));
    assert.equal(afterRace.state, "Cancelled"); assert.equal(afterRace.lastCode, "CANCELLED_BY_ADMIN");
    await h.expect("/auth/login", "", { email: inFlight.email, password: h.password }, 403);

    const accepted = await h.employee("Sales Executive");
    await h.ctx.db.update(employees).set({ status: "Pending" }).where(eq(employees.id, accepted.id));
    const acceptedId = await h.ctx.db.transaction((tx) => queueInvitation(tx, accepted.id, admin.id));
    await h.ctx.db.update(employees).set({ status: "Active" }).where(eq(employees.id, accepted.id));
    const [acceptedJob] = await h.ctx.db.select().from(invitationJobs).where(eq(invitationJobs.id, acceptedId));
    await h.expect(`/settings/invitations/${acceptedId}/cancel`, admin.token, { updatedAt: acceptedJob.updatedAt.toISOString() }, 409);
    await h.expect("/me", accepted.token);
  } finally { await h.close(); }
});
