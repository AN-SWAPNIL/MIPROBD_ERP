import { Router, type Request, type Response } from "express";
import { parse } from "cookie";
import { and, eq, isNull, or } from "drizzle-orm";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { employees, sessions } from "../../database/schema.js";
import { authenticate, audit, bearer, digest, rateLimit, toUser, type Context } from "./context.js";
import { changePasswordSchema, exchangeSchema, loginSchema, recoverySchema, resetSchema } from "./contracts.js";
import { HttpError } from "./errors.js";
import { sessionSecurity } from "./assurance.js";
import { clearSessionCookies, refreshCookie, sessionCookie, writeSessionCookies } from "./session-cookies.js";

export function createAuthRouter(ctx: Context) {
  const router = Router();
  const cookies = (res: Response, session: SupabaseSession, id: string) => writeSessionCookies(ctx, res, session, id);
  const clear = (res: Response) => clearSessionCookies(ctx, res);
  async function issue(res: Response, session: SupabaseSession, purpose: "login" | "recovery") {
    const { data, error } = await ctx.admin.auth.getUser(session.access_token);
    if (error || !data.user?.email_confirmed_at) throw new HttpError(401, "Account verification is required.");
    const employee = await ctx.db.transaction(async (tx) => {
      const [employee] = await tx.select().from(employees).where(eq(employees.authUserId, data.user.id)).for("update");
      if (!employee || employee.status !== "Active") throw new HttpError(403, "An active assigned ERP employee account is required.");
      const [row] = await tx.insert(sessions).values({ employeeId: employee.id, tokenHash: digest(session.access_token), purpose, expiresAt: new Date(session.expires_at! * 1000) }).returning();
      await audit(tx, employee.id, purpose === "recovery" ? "Recovery verified" : "Signed in", "Session", row.id);
      cookies(res, session, row.id);
      return employee;
    });
    const user = toUser(employee);
    return { token: session.access_token, user, security: sessionSecurity(user, data.user, session.access_token, ctx.config.requirePrivilegedMfa) };
  }

  router.post("/login", async (req, res) => {
    const body = loginSchema.parse(req.body);
    await rateLimit(ctx, `login-ip:${req.ip}`, 60);
    await rateLimit(ctx, `login:${req.ip}:${body.email.toLowerCase()}`, 10);
    const { data, error } = await ctx.publicClient().auth.signInWithPassword(body);
    if (error || !data.session) {
      console.warn("Identity provider rejected login", { code: error?.code ?? "NO_SESSION", status: error?.status });
      throw new HttpError(401, "Invalid credentials or unavailable account.");
    }
    res.json({ success: true, data: await issue(res, data.session, "login"), message: "Signed in" });
  });

  router.post("/refresh", async (req, res) => {
    const saved = parse(req.headers.cookie ?? "");
    if (!saved[refreshCookie] || !saved[sessionCookie]) throw new HttpError(401, "Please sign in again.");
    const result = await ctx.db.transaction(async (tx) => {
      const [row] = await tx.select({ session: sessions, employee: employees }).from(sessions).innerJoin(employees, eq(sessions.employeeId, employees.id))
        .where(and(eq(sessions.id, saved[sessionCookie]!), isNull(sessions.revokedAt))).for("update");
      if (!row || row.employee.status !== "Active" || row.session.createdAt.getTime() < Date.now() - 30 * 86400000) throw new HttpError(401, "Please sign in again.");
      const { data, error } = await ctx.publicClient().auth.refreshSession({ refresh_token: saved[refreshCookie]! });
      if (error || !data.session || data.user?.id !== row.employee.authUserId) throw new HttpError(401, "Please sign in again.");
      await tx.update(sessions).set({ tokenHash: digest(data.session.access_token), expiresAt: new Date(data.session.expires_at! * 1000) }).where(eq(sessions.id, row.session.id));
      cookies(res, data.session, row.session.id);
      const user = toUser(row.employee);
      return { token: data.session.access_token, user, security: sessionSecurity(user, data.user!, data.session.access_token, ctx.config.requirePrivilegedMfa) };
    });
    res.json({ success: true, data: result, message: "Session refreshed" });
  });

  router.post("/logout", async (req, res) => {
    const token = bearer(req);
    const savedId = parse(req.headers.cookie ?? "")[sessionCookie];
    const sessionId = savedId && /^[a-f0-9-]{36}$/.test(savedId) ? savedId : null;
    await ctx.db.transaction(async (tx) => {
      const [row] = await tx.update(sessions).set({ revokedAt: new Date() }).where(and(or(eq(sessions.tokenHash, digest(token)), sessionId ? eq(sessions.id, sessionId) : undefined), isNull(sessions.revokedAt))).returning();
      if (row) await audit(tx, row.employeeId, "Signed out", "Session", row.id);
    });
    // ERP session revocation is authoritative even when the upstream service is unavailable.
    await ctx.admin.auth.admin.signOut(token, "local").catch(() => {});
    clear(res);
    res.json({ success: true, data: null, message: "Signed out" });
  });

  router.post("/forgot-password", async (req, res) => {
    const { email } = recoverySchema.parse(req.body);
    await rateLimit(ctx, `recovery:${req.ip}`, 10);
    const [employee] = await ctx.db.select().from(employees).where(and(eq(employees.email, email.toLowerCase()), eq(employees.status, "Active")));
    if (employee) {
      const { error } = await ctx.publicClient().auth.resetPasswordForEmail(email, { redirectTo: `${ctx.config.origin}/reset-password` });
      await audit(ctx.db, employee.id, error ? "Recovery delivery failed" : "Recovery requested", "Employee", employee.id);
    }
    res.json({ success: true, data: { email }, message: "If the account is eligible, recovery instructions will be sent." });
  });

  router.post("/exchange", async (req, res) => {
    const body = exchangeSchema.parse(req.body);
    await rateLimit(ctx, `exchange:${req.ip}`, 20);
    const { data, error } = await ctx.publicClient().auth.setSession({ access_token: body.accessToken, refresh_token: body.refreshToken });
    if (error || !data.session) throw new HttpError(401, "Recovery or invitation link is invalid or expired.");
    // A Pending account is activated only after the identity provider confirms the same linked user.
    const { data: verified, error: verificationError } = await ctx.admin.auth.getUser(data.session.access_token);
    if (verificationError || !verified.user?.email_confirmed_at) throw new HttpError(401, "Email verification required.");
    await ctx.db.transaction(async (tx) => {
      const [row] = await tx.select().from(employees).where(eq(employees.authUserId, verified.user.id)).for("update");
      if (row?.status === "Pending") {
        await tx.update(employees).set({ status: "Active", updatedAt: new Date() }).where(eq(employees.id, row.id));
        await audit(tx, row.id, "Invitation accepted", "Employee", row.id);
      }
    });
    res.json({ success: true, data: await issue(res, data.session, "recovery"), message: "Link verified" });
  });

  router.post("/reset-password", async (req: Request, res: Response) => {
    const { password } = resetSchema.parse(req.body);
    const actor = await authenticate(ctx, req, true, true);
    if (actor.purpose !== "recovery") throw new HttpError(403, "Use a verified recovery or invitation link to set a password.");
    const client = ctx.publicClient();
    // Updating through the user's verified token respects provider password policy.
    const refreshToken = parse(req.headers.cookie ?? "")[refreshCookie];
    if (!refreshToken) throw new HttpError(401, "Request a new recovery link.");
    const { error: sessionError } = await client.auth.setSession({ access_token: actor.token, refresh_token: refreshToken });
    if (sessionError) throw new HttpError(401, "Recovery session expired.");
    const { error } = await client.auth.updateUser({ password });
    if (error) throw new HttpError(422, "The password could not be updated. Check password policy or request a new link.");
    await ctx.db.transaction(async (tx) => {
      await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.employeeId, actor.user.id));
      await audit(tx, actor.user.id, "Password reset", "Employee", actor.user.id);
    });
    await ctx.admin.auth.admin.signOut(actor.token, "global");
    clear(res);
    res.json({ success: true, data: null, message: "Password updated. Please sign in." });
  });
  router.post("/change-password", async (req, res) => {
    const input = changePasswordSchema.parse(req.body);
    const actor = await authenticate(ctx, req);
    await rateLimit(ctx, `password-change:${actor.user.id}`, 5);
    const client = ctx.publicClient();
    const { data, error } = await client.auth.signInWithPassword({ email: actor.user.email, password: input.currentPassword });
    if (error || data.user?.id !== (await ctx.db.select().from(employees).where(eq(employees.id, actor.user.id)))[0]?.authUserId) throw new HttpError(401, "Current password is incorrect.");
    await client.auth.signOut({ scope: "local" });
    const authorized = ctx.publicClient(); const refreshToken = parse(req.headers.cookie ?? "")[refreshCookie];
    if (!refreshToken || (await authorized.auth.setSession({ access_token: actor.token, refresh_token: refreshToken })).error) throw new HttpError(401, "Please sign in again before changing your password.");
    const { error: updateError } = await authorized.auth.updateUser({ password: input.password });
    if (updateError) throw new HttpError(422, "Password does not meet the account policy.");
    await ctx.db.transaction(async (tx) => {
      await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.employeeId, actor.user.id));
      await audit(tx, actor.user.id, "Password changed", "Employee", actor.user.id);
    });
    await ctx.admin.auth.admin.signOut(actor.token, "global");
    clear(res);
    res.json({ success: true, data: null, message: "Password updated. Please sign in again." });
  });
  return router;
}
