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

test("hosted reinvitation: removed email/employee ID can be reused with a fresh identity, durable audit and no real mail", { skip: process.env.RUN_HOSTED_UPDATE13_TESTS !== "true", timeout: 240000 }, async () => {
  const h = await hostedHarness("reinvite");
  let fixture: (typeof h.identities)[number] | undefined;
  try {
    const admin = await h.employee("Super Admin"); const denied = await h.employee("Accounts");
    const email = `backend-reinvite-target-${h.suffix}@example.invalid`;
    const created = await h.ctx.admin.auth.admin.createUser({ email, password: h.password, email_confirm: true });
    assert.equal(created.error, null); assert.ok(created.data.user);
    fixture = { id: `test-reinvite-target-${h.suffix}`, authId: created.data.user.id, email, token: "", role: "Sales Executive" };
    h.identities.push(fixture);
    const oldId = fixture.authId;
    const employeeCode = `REINV-${h.suffix.slice(0, 8)}`;
    await h.ctx.db.insert(employees).values({ id: fixture.id, authUserId: oldId, email, name: "DEV TEST Old Onboarding", role: "Sales Executive", status: "Pending", employeeCode, capabilities: ["view_sensitive_cost"] });
    const oldSession = await h.ctx.publicClient().auth.signInWithPassword({ email, password: h.password });
    assert.ok(oldSession.data.session);
    const id = await h.ctx.db.transaction((tx) => queueInvitation(tx, fixture!.id, admin.id));
    let [job] = await h.ctx.db.select().from(invitationJobs).where(eq(invitationJobs.id, id));
    await h.expect(`/settings/invitations/${id}/cancel`, admin.token, { updatedAt: job.updatedAt.toISOString() });
    [job] = await h.ctx.db.select().from(invitationJobs).where(eq(invitationJobs.id, id));
    await h.expect(`/settings/invitations/${id}`, admin.token, { updatedAt: job.updatedAt.toISOString() }, 200, { method: "DELETE" });
    const input = { email, name: "DEV TEST Fresh Onboarding", employeeCode, role: "Sales Executive" };
    await h.expect("/employees/invite", denied.token, input, 403);
    const originalDelete = h.ctx.admin.auth.admin.deleteUser;
    h.ctx.admin.auth.admin.deleteUser = async () => ({ data: { user: null }, error: new AuthApiError("Synthetic provider outage", 503, "unexpected_failure") });
    try { await h.expect("/employees/invite", admin.token, input, 502); } finally { h.ctx.admin.auth.admin.deleteUser = originalDelete; }
    const [stillClosed] = await h.ctx.db.select().from(employees).where(eq(employees.id, fixture.id));
    assert.equal(stillClosed.status, "Inactive"); assert.equal(stillClosed.authUserId, oldId);
    assert.equal((await h.expect(`/workforce/employees?employee=${fixture.id}`, admin.token)).total, 0);
    const adminCode = `OWNER-${h.suffix.slice(0, 8)}`;
    await h.ctx.db.update(employees).set({ employeeCode: adminCode }).where(eq(employees.id, admin.id));
    await h.expect("/employees/invite", admin.token, { ...input, employeeCode: adminCode }, 409);
    assert.equal((await h.ctx.admin.auth.admin.getUserById(oldId)).error, null);
    let deliveries = 0;
    for (const ctx of [h.ctx, h.other]) ctx.admin.auth.admin.inviteUserByEmail = async (recipient) => {
      assert.equal(recipient, email); deliveries++;
      const users = await ctx.admin.auth.admin.listUsers({ perPage: 1000 });
      assert.equal(users.error, null);
      return { data: { user: users.data.users.find((user) => user.email === email)! }, error: null };
    };
    const responses = await Promise.all([h.call("/employees/invite", admin.token, input), h.call("/employees/invite", admin.token, input, { instance: 1 })]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]); assert.equal(deliveries, 1);
    const [restored] = await h.ctx.db.select().from(employees).where(eq(employees.id, fixture.id));
    assert.equal(restored.status, "Pending"); assert.notEqual(restored.authUserId, oldId); assert.ok(restored.authUserId);
    fixture.authId = restored.authUserId;
    assert.equal(restored.employeeCode, employeeCode); assert.equal(restored.name, input.name);
    assert.deepEqual(restored.capabilities, []); assert.deepEqual(restored.permissionOverrides, []);
    assert.equal((await h.expect(`/workforce/employees?employee=${fixture.id}`, admin.token)).total, 1);
    assert.equal((await h.ctx.admin.auth.admin.getUserById(oldId)).error?.status, 404);
    await h.expect("/auth/exchange", "", { accessToken: oldSession.data.session.access_token, refreshToken: oldSession.data.session.refresh_token }, 401);
    [job] = await h.ctx.db.select().from(invitationJobs).where(eq(invitationJobs.id, id));
    assert.equal(job.state, "Sent"); assert.equal(job.attempts, 1);
    const audits = await h.ctx.db.select().from(auditEvents).where(eq(auditEvents.entityId, fixture.id));
    for (const action of ["Invitation cancelled", "Invitation removed", "Employee reinvitation reserved"]) assert.ok(audits.some((event) => event.action === action));
    assert.equal((await h.ctx.admin.auth.admin.updateUserById(restored.authUserId, { password: h.password, email_confirm: true })).error, null);
    const fresh = await h.ctx.publicClient().auth.signInWithPassword({ email, password: h.password }); assert.ok(fresh.data.session);
    const accepted = await h.expect("/auth/exchange", "", { accessToken: fresh.data.session.access_token, refreshToken: fresh.data.session.refresh_token });
    assert.equal(accepted.user.id, fixture.id); assert.equal(accepted.user.status, "Active");
    await h.expect("/employees/invite", admin.token, input, 409);
    assert.equal(deliveries, 1);
  } finally {
    if (fixture) {
      const users = await h.ctx.admin.auth.admin.listUsers({ perPage: 1000 });
      const current = users.data.users.find((user) => user.email === fixture!.email);
      if (current) fixture.authId = current.id;
      else { await h.ctx.db.update(employees).set({ status: "Inactive", authUserId: null }).where(eq(employees.id, fixture.id)); h.identities.splice(h.identities.indexOf(fixture), 1); }
    }
    await h.close();
  }
});

test("hosted invitations: cancellation blocks sessions/old links, logical deletion retains audit, and in-flight sends cannot restore onboarding", { skip: process.env.RUN_HOSTED_UPDATE13_TESTS !== "true", timeout: 240000 }, async () => {
  const h = await hostedHarness("invitation-cancel");
  try {
    const admin = await h.employee("Super Admin"); const denied = await h.employee("Accounts"); const target = await h.employee("Sales Executive");
    await h.ctx.db.update(employees).set({ status: "Pending", name: `0 INVITATION ${h.suffix}` }).where(eq(employees.id, target.id));
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
    const rosterPath = `/workforce/employees?employee=${encodeURIComponent(target.id)}`;
    assert.equal((await h.expect(rosterPath, admin.token)).total, 1, "Cancellation alone retains an inactive employee");
    assert.equal((await h.expect("/employees", admin.token)).some((row: { id: string }) => row.id === target.id), true);
    assert.equal((await h.expect("/employees/directory", admin.token)).some((row: { id: string }) => row.id === target.id), true);
    const access = await h.expect(`/workforce/employees/${target.id}/access`, admin.token);
    const payrollPath = `/payroll/employees?employeeId=${encodeURIComponent(target.id)}`;
    assert.equal((await h.expect(payrollPath, admin.token)).total, 1);
    const reportPath = `/reports/employee-list?from=2026-11-02&to=2026-11-02&employee=${encodeURIComponent(target.id)}`;
    assert.equal((await h.expect(reportPath, admin.token)).rowCount, 1);
    await h.expect(path, denied.token, { updatedAt: cancelled.updatedAt.toISOString() }, 403, { method: "DELETE" });
    await h.expect(path, admin.token, input, 409, { method: "DELETE" });
    await h.expect(path, admin.token, { updatedAt: cancelled.updatedAt.toISOString() }, 200, { method: "DELETE" });
    const removedList = invitationListSchema.parse(await h.expect("/settings/invitations?state=Cancelled", admin.token));
    assert.equal(removedList.rows.some((row) => row.id === id), false);
    assert.equal((await h.expect(rosterPath, admin.token)).total, 0);
    assert.equal((await h.expect(`${rosterPath}&status=Inactive`, admin.token)).total, 0);
    assert.equal((await h.expect(payrollPath, admin.token)).total, 0);
    assert.equal((await h.expect(`/workforce/employees?search=${encodeURIComponent(employee.employeeCode)}`, admin.token)).total, 0);
    assert.equal((await h.expect("/employees", admin.token)).some((row: { id: string }) => row.id === target.id), false);
    assert.equal((await h.expect("/employees/directory", admin.token)).some((row: { id: string }) => row.id === target.id), false);
    const report = await h.expect(reportPath, admin.token);
    assert.equal(report.rowCount, 0); assert.equal(report.options.employee.some((option: { value: string }) => option.value === target.id), false);
    await h.expect(`/workforce/employees/${target.id}/access`, admin.token, undefined, 404);
    await h.expect(`/workforce/employees/${target.id}/photo`, admin.token, undefined, 404);
    await h.expect(`/employees/${target.id}/access`, admin.token, { role: access.role, status: "Active", capabilities: [], permissionOverrides: [], version: access.version, reason: "Test removed account protection" }, 404, { method: "PATCH" });
    await h.expect(`/workforce/employees/${target.id}`, admin.token, { name: employee.name, employeeCode: "REMOVED-TEST", title: employee.title, department: employee.department, territory: employee.territory, phone: employee.phone, managerId: employee.managerId, version: access.version, reason: "Test removed profile protection" }, 404, { method: "PATCH" });
    const [removed] = await h.ctx.db.select().from(invitationJobs).where(eq(invitationJobs.id, id));
    assert.equal(removed.lastCode, deletedInvitationCode);
    const audits = await h.ctx.db.select().from(auditEvents).where(eq(auditEvents.entityId, target.id));
    assert.equal(audits.filter((row) => row.action === "Invitation cancelled").length, 1);
    assert.equal(audits.filter((row) => row.action === "Invitation removed").length, 1);
    await h.expect(path, admin.token, { updatedAt: removed.updatedAt.toISOString() }, 404, { method: "DELETE" });
    await h.ctx.db.update(employees).set({ status: "Active" }).where(eq(employees.id, target.id));
    await h.expect("/auth/login", "", { email: target.email, password: h.password }, 403);
    assert.equal((await h.expect(rosterPath, admin.token)).total, 0, "Removal is distinct from the inactive status");
    await h.ctx.db.update(employees).set({ status: "Inactive" }).where(eq(employees.id, target.id));
    await h.expect("/employees/invite", admin.token, { email: target.email, name: "Do not reset accepted history", employeeCode: "NO-RESET-TEST", role: "Sales Executive" }, 409);
    assert.equal((await h.ctx.admin.auth.admin.getUserById(target.authId)).error, null);

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
