import { Router } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { auditEvents, employees, sessions } from "../../database/schema.js";
import { canAssignRole, canGrantCapability, canGrantPermission, canManageEmployees, canManageTargetUser, canManageUserAccess, hasEffectivePermission, normalizePermissionOverrides } from "../../src/lib/permissions/effectiveAccess.js";
import { accessSchema, inviteSchema, profileSchema } from "./contracts.js";
import { audit, identity, rateLimit, toUser, type Context } from "./context.js";
import { assertAllowed, HttpError } from "./errors.js";
import { lockActor } from "../operations/common.js";
import { processInvitation, queueInvitation } from "./invitation-outbox.js";

export function createEmployeeRouter(ctx: Context) {
  const router = Router();
  router.get("/me", (req, res) => {
    const actor = identity(res);
    res.json({ success: true, data: { token: actor.token, user: actor.user, security: actor.security }, message: "Current access loaded" });
  });
  router.patch("/profile", async (req, res) => {
    const body = profileSchema.parse(req.body);
    const actor = identity(res);
    const row = await ctx.db.transaction(async (tx) => {
      const [row] = await tx.update(employees).set({ ...body, updatedAt: new Date(), version: sql`${employees.version} + 1` }).where(and(eq(employees.id, actor.user.id), eq(employees.status, "Active"))).returning();
      if (!row) throw new HttpError(401, "This employee account is inactive.");
      await audit(tx, actor.user.id, "Profile updated", "Employee", row.id);
      return row;
    });
    res.json({ success: true, data: toUser(row), message: "Profile updated" });
  });

  router.get("/employees", async (req, res) => {
    assertAllowed(hasEffectivePermission(identity(res).user, "users", "view"));
    const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
    const rows = await ctx.db.select().from(employees).orderBy(asc(employees.name), asc(employees.id)).limit(100).offset((page - 1) * 100);
    res.json({ success: true, data: rows.map((row) => ({ ...toUser(row), version: row.version })), message: "Employees loaded", meta: { page, pageSize: 100 } });
  });

  router.get("/employees/directory", async (req, res) => {
    const user = identity(res).user;
    const companyScope = hasEffectivePermission(user, "users") || hasEffectivePermission(user, "accounts");
    assertAllowed(companyScope || hasEffectivePermission(user, "marketing"));
    const rows = await ctx.db.select().from(employees).where(companyScope ? undefined : eq(employees.id, user.id)).orderBy(asc(employees.name), asc(employees.id));
    const activeOnly = req.query.status === "Active";
    const search = String(req.query.search ?? "").slice(0, 200).toLowerCase();
    const data = rows.filter((row) => (!activeOnly || row.status === "Active") && `${row.name} ${row.employeeCode} ${row.title}`.toLowerCase().includes(search)).map((row) => ({ id: row.id, name: row.name, title: row.title, employeeCode: row.employeeCode, department: row.department, territory: row.territory, phone: row.phone, status: row.status }));
    res.json({ success: true, data, message: "Employee reference directory loaded without access or login fields" });
  });

  router.post("/employees/invite", async (req, res) => {
    const input = inviteSchema.parse(req.body);
    const actor = identity(res);
    // Reserve the employee first. A failed mail send leaves a resumable Pending record, not an orphan privileged identity.
    const reserved = await ctx.db.transaction(async (tx) => {
      const [current] = await tx.select().from(employees).where(eq(employees.id, actor.user.id)).for("update");
      assertAllowed(current && canManageEmployees(toUser(current), "create") && canAssignRole(toUser(current), input.role));
      const [existing] = await tx.select().from(employees).where(eq(employees.email, input.email)).for("update");
      if (existing) throw new HttpError(409, existing.status === "Pending" ? "This employee already exists. Use its invitation retry action." : "This email already belongs to an employee. Review the existing employee account instead of creating a duplicate.");
      const [row] = await tx.insert(employees).values({ ...input, id: `emp-${randomUUID()}`, status: "Pending" }).returning();
      await audit(tx, current.id, "Employee invitation reserved", "Employee", row.id, { role: row.role });
      const jobId = await queueInvitation(tx, row.id, current.id);
      return { row, jobId };
    });
    const result = await processInvitation(ctx, reserved.jobId);
    const sent = result?.invitationSent ?? false;
    res.status(sent ? 201 : 202).json({ success: true, data: { id: reserved.row.id, invitationSent: sent, jobId: reserved.jobId }, message: sent ? "Invitation accepted by mail provider" : "Employee saved; invitation queued for retry or review." });
  });

  async function reserveRetry(employeeId: string, actor: ReturnType<typeof identity>) {
    return ctx.db.transaction(async (tx) => {
      const current = await lockActor(tx, actor, "users", "create");
      const [row] = await tx.select().from(employees).where(eq(employees.id, employeeId));
      if (!row || row.status !== "Pending") throw new HttpError(409, "Only Pending employees can be invited.");
      assertAllowed(canManageEmployees(current, "create") && canAssignRole(current, row.role));
      return queueInvitation(tx, row.id, current.id);
    });
  }

  router.post("/employees/:id/invite", async (req, res) => {
    const [row] = await ctx.db.select().from(employees).where(eq(employees.id, String(req.params.id)));
    assertAllowed(row && canManageEmployees(identity(res).user, "create") && canAssignRole(identity(res).user, row.role));
    await rateLimit(ctx, `invite-retry:${row.id}`, 5, 3600);
    const jobId = await reserveRetry(row.id, identity(res));
    const result = await processInvitation(ctx, jobId); const sent = result?.invitationSent ?? false;
    res.status(sent ? 200 : 202).json({ success: true, data: { id: row.id, invitationSent: sent, jobId }, message: sent ? "Invitation accepted by mail provider" : "Invitation queued for retry or review; Pending employee preserved." });
  });

  router.patch("/employees/:id/access", async (req, res) => {
    const input = accessSchema.parse(req.body);
    const actor = identity(res);
    const updated = await ctx.db.transaction(async (tx) => {
      const [actorRow] = await tx.select().from(employees).where(eq(employees.id, actor.user.id)).for("update");
      if (!actorRow) throw new HttpError(401, "Employee not found.");
      const current = toUser(actorRow);
      assertAllowed(current.status === "Active" && canManageUserAccess(current));
      const [target] = await tx.select().from(employees).where(eq(employees.id, String(req.params.id))).for("update");
      if (!target) throw new HttpError(404, "Employee not found.");
      assertAllowed(canManageTargetUser(current, toUser(target)) && canAssignRole(current, input.role));
      assertAllowed(input.capabilities.every((capability) => canGrantCapability(current, capability)) && input.permissionOverrides.every((override) => canGrantPermission(current, override.permission, override.action, override.effect)));
      if (target.version !== input.version) throw new HttpError(409, "Access changed since this record was opened. Reload before saving.");
      if (target.status === "Pending") throw new HttpError(409,"Pending employees must complete verified invitation acceptance before access activation.");
      const [row] = await tx.update(employees).set({ role: input.role, status: input.status, capabilities: [...new Set(input.capabilities)], permissionOverrides: normalizePermissionOverrides(input.permissionOverrides), version: target.version + 1, updatedAt: new Date() }).where(eq(employees.id, target.id)).returning();
      await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.employeeId, target.id));
      await audit(tx, current.id, "Employee access changed", "Employee", target.id, { reason: input.reason, before: { role: target.role, status: target.status, capabilities: target.capabilities, permissionOverrides: target.permissionOverrides }, after: { role: row.role, status: row.status, capabilities: row.capabilities, permissionOverrides: row.permissionOverrides } });
      return row;
    });
    res.json({ success: true, data: { ...toUser(updated), version: updated.version }, message: "Access updated; existing sessions revoked" });
  });

  router.get("/audit", async (_req, res) => {
    const user = identity(res).user;
    assertAllowed(user.role === "Super Admin" && hasEffectivePermission(user, "reports", "view"));
    const rows = await ctx.db.select().from(auditEvents).orderBy(sql`${auditEvents.createdAt} desc`, sql`${auditEvents.id} desc`).limit(100);
    res.json({ success: true, data: rows, message: "Latest audit events loaded" });
  });
  return router;
}
