import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Request } from "express";
import type { Transaction } from "../../database/client.js";
import { documentNumbers, employees, postingKeys, sessions } from "../../database/schema.js";
import { hasCapability, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import type { PermissionAction, PermissionKey } from "../../src/types/index.js";
import type { Capability } from "../../src/domains/erp.types.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { digest, toUser, type Identity } from "../foundation/context.js";

export const newId = (prefix: string) => `${prefix}-${randomUUID()}`;
export async function lockSessionActor(tx: Transaction, actor: Identity) {
  const [row] = await tx.select({ employee: employees }).from(employees).innerJoin(sessions, eq(sessions.employeeId, employees.id))
    .where(and(eq(employees.id, actor.user.id), eq(sessions.id, actor.sessionId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()))).for("share");
  if (!row) throw new HttpError(401, "This session is no longer active.");
  const user = toUser(row.employee);
  assertAllowed(user.status === "Active");
  return user;
}
export async function lockActor(tx: Transaction, actor: Identity, area: PermissionKey, action: PermissionAction, capability?: Capability) {
  const user = await lockSessionActor(tx, actor);
  assertAllowed(hasEffectivePermission(user, area, action) && (!capability || hasCapability(user, capability)));
  return user;
}
export async function nextNumber(tx: Transaction, prefix: string, date: string) {
  const year = date.slice(0, 4);
  const [row] = await tx.insert(documentNumbers).values({ key: `${prefix}-${year}`, value: 1 }).onConflictDoUpdate({ target: documentNumbers.key, set: { value: sql`${documentNumbers.value} + 1` } }).returning();
  return `${prefix}-${year}-${String(row.value).padStart(3, "0")}`;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, canonical(val)]));
  return value;
}
export function postingIdentity(req: Request, namespace: string, payload: unknown) {
  const key = req.get("Idempotency-Key");
  if (!key || !/^[A-Za-z0-9_-]{8,100}$/.test(key)) throw new HttpError(422, "Supply an Idempotency-Key of 8-100 letters, numbers, hyphens or underscores.");
  return { id: digest(`${namespace}:${key}`), requestHash: digest(JSON.stringify(canonical(payload))) };
}
export async function previousPosting(tx: Transaction, identity: { id: string; requestHash: string }) {
  const [row] = await tx.select().from(postingKeys).where(eq(postingKeys.id, identity.id));
  if (row && row.requestHash !== identity.requestHash) throw new HttpError(409, "This posting key was already used with different inputs.");
  return row?.resourceId;
}
