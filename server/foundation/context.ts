import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { connectDatabase, type Database, type Transaction } from "../../database/client.js";
import { auditEvents, employees, rateLimits, sessions } from "../../database/schema.js";
import { backendConfig } from "../config.js";
import type { User } from "../../src/types/index.js";
import { HttpError } from "./errors.js";
import { sessionSecurity } from "./assurance.js";
import type { Session } from "../../src/types/index.js";

export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function toUser(row: typeof employees.$inferSelect): User {
  return { id: row.id, name: row.name, email: row.email, role: row.role, title: row.title, department: row.department, phone: row.phone, avatarUrl: "", status: row.status, territory: row.territory, employeeCode: row.employeeCode, capabilities: row.capabilities, permissionOverrides: row.permissionOverrides };
}

export function createContext() {
  const config = backendConfig();
  const connection = connectDatabase(config.DATABASE_URL);
  const options = {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }) }
  };
  const admin = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, options);
  const publicClient = () => createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, options);
  return { ...connection, config, admin, publicClient };
}
export type Context = ReturnType<typeof createContext>;
export type Identity = { user: User; sessionId: string; token: string; purpose: "login" | "recovery"; security: NonNullable<Session["security"]> };

export function bearer(req: Request) {
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(req.get("authorization") ?? "");
  if (!match || match[1].length > 8192) throw new HttpError(401, "A valid ERP session is required.");
  return match[1];
}

export async function authenticate(ctx: Context, req: Request, allowRecovery = false, allowMfaSetup = false): Promise<Identity> {
  const token = bearer(req);
  const { data, error } = await ctx.admin.auth.getUser(token);
  if (error || !data.user?.email_confirmed_at) throw new HttpError(401, "Your session has expired. Please sign in again.");
  const [row] = await ctx.db.select({ session: sessions, employee: employees }).from(sessions)
    .innerJoin(employees, eq(sessions.employeeId, employees.id))
    .where(and(eq(sessions.tokenHash, digest(token)), eq(employees.authUserId, data.user.id), eq(employees.status, "Active"), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
  if (!row || (row.session.purpose === "recovery" && !allowRecovery)) throw new HttpError(401, "This ERP session is no longer active.");
  const user = toUser(row.employee); const security = sessionSecurity(user, data.user, token, ctx.config.requirePrivilegedMfa);
  if (!allowMfaSetup && security.required && security.assurance !== "aal2") throw new HttpError(428, "Authenticator verification is required before accessing ERP records.");
  return { user, sessionId: row.session.id, token, purpose: row.session.purpose, security };
}

export const identity = (res: Response) => res.locals.identity as Identity;

export async function audit(db: Database | Transaction, actorId: string | null, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
  await db.insert(auditEvents).values({ actorId, action, entityType, entityId, details });
}

export async function rateLimit(ctx: Context, key: string, limit: number, seconds = 900) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + seconds * 1000);
  const [row] = await ctx.db.insert(rateLimits).values({ key: digest(key), count: 1, expiresAt }).onConflictDoUpdate({
    target: rateLimits.key,
    set: { count: sql`case when ${rateLimits.expiresAt} <= now() then 1 else ${rateLimits.count} + 1 end`, expiresAt: sql`case when ${rateLimits.expiresAt} <= now() then excluded.expires_at else ${rateLimits.expiresAt} end` }
  }).returning({ count: rateLimits.count });
  if (row.count > limit) throw new HttpError(429, "Too many attempts. Please try again later.");
}
