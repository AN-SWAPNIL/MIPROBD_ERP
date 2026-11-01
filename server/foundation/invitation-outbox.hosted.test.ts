import test from "node:test";
import assert from "node:assert/strict";
import { AuthApiError } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { employees, invitationJobs } from "../../database/schema.js";
import { hostedHarness } from "../testing/hosted.js";
import { processInvitation, queueInvitation } from "./invitation-outbox.js";

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
