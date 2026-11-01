import { Router, type Request, type Response } from "express";
import { parse } from "cookie";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { employees, sessions } from "../../database/schema.js";
import { mfaChallengeInput, mfaEnrollInput, mfaRemoveInput, mfaVerifyInput } from "../../src/lib/auth/mfaContracts.js";
import { authenticate, audit, digest, rateLimit, toUser, type Context, type Identity } from "./context.js";
import { HttpError } from "./errors.js";
import { privilegedIdentity, sessionSecurity } from "./assurance.js";
import { clearSessionCookies, refreshCookie, writeSessionCookies } from "./session-cookies.js";

export function createMfaRouter(ctx: Context) {
  const router = Router();
  async function owner(req: Request) { return authenticate(ctx, req, false, true); }
  async function factors(actor: Identity) {
    const { data, error } = await ctx.admin.auth.getUser(actor.token);
    if (error || !data.user) throw new HttpError(401, "Please sign in again.");
    return { user: data.user, factors: data.user.factors ?? [] };
  }
  async function client(req: Request, actor: Identity) {
    const refresh = parse(req.headers.cookie ?? "")[refreshCookie];
    if (!refresh) throw new HttpError(401, "Sign in in this browser before managing your authenticator.");
    const api = ctx.publicClient(); const { data, error } = await api.auth.setSession({ access_token: actor.token, refresh_token: refresh });
    if (error || !data.session || data.session.access_token !== actor.token) throw new HttpError(401, "This security session expired. Please sign in again.");
    return api;
  }
  router.get("/mfa", async (req, res) => {
    const actor = await owner(req); const own = await factors(actor);
    res.json({ success: true, data: { security: actor.security, factors: own.factors.filter((f) => f.factor_type === "totp").map((f) => ({ id: f.id, name: f.friendly_name || "Authenticator", status: f.status })) }, message: "Own authenticator settings loaded" });
  });
  router.post("/mfa/enroll", async (req, res) => {
    const input = mfaEnrollInput.parse(req.body); const actor = await owner(req);
    await rateLimit(ctx, `mfa-enroll:${actor.user.id}`, 3, 3600);
    if (actor.security.enrolled && actor.security.assurance !== "aal2") throw new HttpError(428, "Verify an existing authenticator before adding another.");
    const own = await factors(actor); const verifier = ctx.publicClient();
    const confirmation = await verifier.auth.signInWithPassword({ email: actor.user.email, password: input.currentPassword });
    if (confirmation.error || confirmation.data.user?.id !== own.user.id) throw new HttpError(401, "Current password is incorrect.");
    await verifier.auth.signOut({ scope: "local" });
    const api = await client(req, actor);
    const { data, error } = await api.auth.mfa.enroll({ factorType: "totp", friendlyName: input.name, issuer: "MIPRO ERP" });
    if (error || !data) throw new HttpError(422, "Authenticator could not be added. Remove an unfinished setup or retry later.");
    await audit(ctx.db, actor.user.id, "Authenticator setup started", "Employee", actor.user.id, { factorId: data.id });
    res.status(201).json({ success: true, data: { id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri }, message: "Confirm a code to finish setup; keep the setup key private" });
  });
  router.post("/mfa/challenge", async (req, res) => {
    const input = mfaChallengeInput.parse(req.body); const actor = await owner(req);
    await rateLimit(ctx, `mfa-challenge:${actor.user.id}`, 20);
    const own = await factors(actor);
    if (!own.factors.some((f) => f.id === input.factorId && f.factor_type === "totp")) throw new HttpError(404, "Own authenticator not found.");
    const api = await client(req, actor); const { data, error } = await api.auth.mfa.challenge({ factorId: input.factorId });
    if (error || !data) throw new HttpError(422, "A verification challenge could not be created. Retry shortly.");
    res.json({ success: true, data: { id: data.id }, message: "Authenticator challenge created" });
  });
  router.post("/mfa/verify", async (req, res) => {
    const input = mfaVerifyInput.parse(req.body); const actor = await owner(req);
    await rateLimit(ctx, `mfa-verify:${actor.user.id}`, 10);
    const own = await factors(actor);
    if (!own.factors.some((f) => f.id === input.factorId && f.factor_type === "totp")) throw new HttpError(404, "Own authenticator not found.");
    const api = await client(req, actor); const result = await api.auth.mfa.verify(input);
    if (result.error || !result.data) { await audit(ctx.db, actor.user.id, "Authenticator verification failed", "Employee", actor.user.id); throw new HttpError(422, "Code is invalid, expired or already used. Try a fresh code."); }
    const { data: verified, error } = await ctx.admin.auth.getUser(result.data.access_token);
    if (error || verified.user?.id !== own.user.id) throw new HttpError(401, "Authenticator session could not be verified.");
    const data = await ctx.db.transaction(async (tx) => {
      const [row] = await tx.select({ employee: employees, session: sessions }).from(sessions).innerJoin(employees, eq(employees.id, sessions.employeeId)).where(and(eq(sessions.id, actor.sessionId), eq(sessions.tokenHash, digest(actor.token)), eq(employees.status, "Active"), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()))).for("update");
      if (!row || row.employee.authUserId !== own.user.id) throw new HttpError(401, "This ERP session was revoked. Please sign in again.");
      const user = toUser(row.employee); const security = sessionSecurity(user, verified.user!, result.data.access_token, ctx.config.requirePrivilegedMfa);
      if (security.assurance !== "aal2") throw new HttpError(401, "Second-factor assurance was not confirmed.");
      await tx.update(sessions).set({ tokenHash: digest(result.data.access_token), expiresAt: new Date((Date.now() / 1000 + result.data.expires_in) * 1000) }).where(eq(sessions.id, actor.sessionId));
      await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.employeeId, user.id), ne(sessions.id, actor.sessionId), isNull(sessions.revokedAt)));
      await audit(tx, user.id, "Authenticator verified", "Employee", user.id, { factorId: input.factorId, otherSessionsRevoked: true });
      return { token: result.data.access_token, user, security };
    });
    writeSessionCookies(ctx, res, { ...result.data, expires_at: Math.floor(Date.now() / 1000) + result.data.expires_in }, actor.sessionId);
    res.json({ success: true, data, message: "Authenticator verified; other ERP sessions revoked" });
  });
  router.post("/mfa/remove", async (req, res: Response) => {
    const input = mfaRemoveInput.parse(req.body); const actor = await owner(req); const own = await factors(actor);
    await rateLimit(ctx, `mfa-remove:${actor.user.id}`, 5, 3600);
    const factor = own.factors.find((f) => f.id === input.factorId && f.factor_type === "totp");
    if (!factor) throw new HttpError(404, "Own authenticator not found.");
    if (factor.status === "verified" && actor.security.assurance !== "aal2") throw new HttpError(428, "Verify your authenticator before removing it.");
    if (factor.status === "verified" && ctx.config.requirePrivilegedMfa && privilegedIdentity(actor.user) && own.factors.filter((f) => f.status === "verified").length <= 1) throw new HttpError(409, "Verify a replacement authenticator before removing the last required factor.");
    const api = await client(req, actor); const { error } = await api.auth.mfa.unenroll({ factorId: factor.id });
    if (error) throw new HttpError(422, "Authenticator could not be removed. Verify a current code and retry.");
    await ctx.db.transaction(async (tx) => { if (factor.status === "verified") await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.employeeId, actor.user.id)); await audit(tx, actor.user.id, "Authenticator removed", "Employee", actor.user.id, { factorId: factor.id, reason: input.reason }); });
    if (factor.status === "verified") { await ctx.admin.auth.admin.signOut(actor.token, "global").catch(() => {}); clearSessionCookies(ctx, res); }
    res.json({ success: true, data: { signOut: factor.status === "verified" }, message: "Authenticator removed" });
  });
  return router;
}
