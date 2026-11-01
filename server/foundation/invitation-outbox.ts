import { Router } from "express";
import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { employees, invitationJobs } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import { canAssignRole, canManageEmployees, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { invitationListInput } from "../../src/domains/employees/invitationContracts.js";
import { audit, identity, rateLimit, toUser, type Context } from "./context.js";
import { assertAllowed, HttpError } from "./errors.js";
import { deliverInvitation } from "./invitations.js";
import { invitationFailure, maximumInvitationAttempts } from "./invitation-policy.js";

export async function queueInvitation(tx: Transaction, employeeId: string, requestedBy: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${employeeId},77612014))`);
  const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId)).for("update");
  if (!employee || employee.status !== "Pending") throw new HttpError(409, "Only Pending employees can be invited.");
  const [requester] = await tx.select().from(employees).where(eq(employees.id, requestedBy));
  assertAllowed(requester && canManageEmployees(toUser(requester), "create") && canAssignRole(toUser(requester), employee.role));
  const [existing] = await tx.select().from(invitationJobs).where(eq(invitationJobs.employeeId, employeeId)).for("update");
  const now = new Date();
  if (existing && (existing.state === "Processing" && existing.leaseUntil && existing.leaseUntil > now || existing.updatedAt.getTime() > now.getTime() - 60000)) throw new HttpError(429, "Wait one minute before requesting another invitation.");
  const values = { requestedBy, state: "Queued" as const, attempts: 0, nextAttemptAt: now, leaseToken: null, leaseUntil: null, lastCode: "", updatedAt: now };
  const [job] = existing ? await tx.update(invitationJobs).set(values).where(eq(invitationJobs.id, existing.id)).returning() : await tx.insert(invitationJobs).values({ ...values, employeeId }).returning();
  await audit(tx, requestedBy, "Invitation queued", "Employee", employeeId, { jobId: job.id });
  return job.id;
}

export async function processInvitation(ctx: Context, id?: string) {
  const claim = await ctx.db.transaction(async (tx) => {
    const now = new Date();
    const eligible = or(and(eq(invitationJobs.state, "Queued"), lte(invitationJobs.nextAttemptAt, now)), and(eq(invitationJobs.state, "Processing"), lte(invitationJobs.leaseUntil, now)));
    const [candidate] = await tx.select({ id: invitationJobs.id, employeeId: invitationJobs.employeeId }).from(invitationJobs).where(and(id ? eq(invitationJobs.id, id) : undefined, eligible))
      .orderBy(asc(invitationJobs.nextAttemptAt), asc(invitationJobs.id)).limit(1);
    if (!candidate) return null;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${candidate.employeeId},77612014))`);
    const [job] = await tx.select().from(invitationJobs).where(and(eq(invitationJobs.id, candidate.id), eligible)).for("update", { skipLocked: true });
    if (!job) return null;
    const [employee] = await tx.select().from(employees).where(eq(employees.id, job.employeeId)).for("update");
    const [requester] = await tx.select().from(employees).where(eq(employees.id, job.requestedBy));
    if (!employee || employee.status !== "Pending" || !requester || !canManageEmployees(toUser(requester), "create") || !canAssignRole(toUser(requester), employee.role)) {
      await tx.update(invitationJobs).set({ state: "Cancelled", leaseToken: null, leaseUntil: null, lastCode: "AUTHORITY_OR_STATUS_CHANGED", updatedAt: now }).where(eq(invitationJobs.id, job.id));
      await audit(tx, null, "Invitation cancelled", "Employee", job.employeeId, { jobId: job.id }); return null;
    }
    if (job.attempts >= maximumInvitationAttempts) { await tx.update(invitationJobs).set({ state: "Review", lastCode: "ATTEMPT_LIMIT", leaseToken: null, leaseUntil: null, updatedAt: now }).where(eq(invitationJobs.id, job.id)); return null; }
    const leaseToken = randomUUID();
    await tx.update(invitationJobs).set({ state: "Processing", attempts: job.attempts + 1, leaseToken, leaseUntil: new Date(now.getTime() + 120000), updatedAt: now }).where(eq(invitationJobs.id, job.id));
    return { job, employee, leaseToken };
  });
  if (!claim) return null;
  let sent = false; let retryable = true; let code = "PROVIDER_UNAVAILABLE";
  try {
    await rateLimit(ctx, "invitation-outbox-global-hour", 30, 3600);
    // Persist the provider identity before delivery so accepting a fast email cannot race its ERP link.
    if (!claim.employee.authUserId) {
      const { data, error } = await ctx.admin.auth.admin.generateLink({ type: "invite", email: claim.employee.email, options: { redirectTo: `${ctx.config.origin}/reset-password` } });
      if (error || !data.user) { retryable = !error?.status || error.status === 429 || error.status >= 500; throw new Error("Identity preparation unavailable"); }
      await ctx.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${claim.employee.id},77612014))`);
        const [job] = await tx.select().from(invitationJobs).where(and(eq(invitationJobs.id, claim.job.id), eq(invitationJobs.leaseToken, claim.leaseToken))).for("update");
        const [row] = await tx.select().from(employees).where(eq(employees.id, claim.employee.id)).for("update");
        if (!job || !row || row.status !== "Pending" || row.authUserId && row.authUserId !== data.user.id) throw new HttpError(409, "Invitation identity requires review.");
        await tx.update(employees).set({ authUserId: data.user.id, updatedAt: new Date() }).where(eq(employees.id, row.id));
        claim.employee.authUserId = data.user.id;
      });
    }
    const result = await deliverInvitation(ctx, claim.employee); sent = result.sent;
    retryable = result.retryable ?? true; code = sent ? "PROVIDER_ACCEPTED" : result.failureCode ?? "DELIVERY_FAILED";
  } catch (error) { if (error instanceof HttpError) { retryable = error.status === 429; code = error.status === 429 ? "PROVIDER_LIMIT" : "IDENTITY_REVIEW"; } }
  const now = new Date(); const failure = invitationFailure(claim.job.attempts + 1, retryable, now);
  await ctx.db.transaction(async (tx) => {
    const [updated] = await tx.update(invitationJobs).set({ ...(sent ? { state: "Sent" as const, sentAt: now } : failure), lastCode: code, leaseUntil: null, leaseToken: null, updatedAt: now })
      .where(and(eq(invitationJobs.id, claim.job.id), eq(invitationJobs.state, "Processing"), eq(invitationJobs.leaseToken, claim.leaseToken))).returning();
    if (updated) await audit(tx, null, sent ? "Invitation sent" : "Invitation delivery deferred", "Employee", claim.employee.id, { jobId: updated.id, attempts: updated.attempts, state: updated.state, code });
  });
  return { id: claim.job.id, employeeId: claim.employee.id, invitationSent: sent };
}

export function createInvitationOutboxRouter(ctx: Context) {
  const router = Router();
  router.get("/settings/invitations", async (req, res) => {
    const actor = identity(res).user; assertAllowed(canManageEmployees(actor, "create")); const q = invitationListInput.parse(req.query);
    const data = await ctx.db.transaction(async (tx) => {
      const filters = and(q.state ? eq(invitationJobs.state, q.state) : undefined, actor.role === "Super Admin" ? undefined : eq(invitationJobs.requestedBy, actor.id));
      const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(invitationJobs).where(filters);
      const rows = await tx.select({ job: invitationJobs, employeeName: employees.name }).from(invitationJobs).innerJoin(employees, eq(employees.id, invitationJobs.employeeId)).where(filters).orderBy(sql`${invitationJobs.updatedAt} desc`, invitationJobs.id).limit(25).offset((q.page - 1) * 25);
      return { rows: rows.map(({ job, employeeName }) => ({ id: job.id, employeeId: job.employeeId, employeeName, state: job.state, attempts: job.attempts, nextAttemptAt: job.nextAttemptAt.toISOString(), lastCode: job.lastCode, sentAt: job.sentAt?.toISOString() ?? null, updatedAt: job.updatedAt.toISOString() })), total, page: q.page, pageSize: 25 };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Invitation delivery queue loaded without tokens" });
  });
  router.post("/settings/invitations/process", async (req, res) => {
    const actor = identity(res).user; assertAllowed(actor.role === "Super Admin" && hasEffectivePermission(actor, "users", "create"));
    // One email job per HTTP request; the CLI worker can process a larger bounded batch.
    const { limit } = z.object({ limit: z.literal(1).default(1) }).strict().parse(req.body);
    await rateLimit(ctx, `invitation-worker:${actor.id}`, 10);
    const results = []; for (let i = 0; i < limit; i++) { const result = await processInvitation(ctx); if (result) results.push(result); }
    res.json({ success: true, data: { processed: results.length }, message: "Due invitation jobs processed" });
  });
  return router;
}
