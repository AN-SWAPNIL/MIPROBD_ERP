import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { employees, sessions } from "../../database/schema.js";
import type { Role } from "../../src/types/index.js";
import type { Capability } from "../../src/domains/erp.types.js";
import { createContext } from "../foundation/context.js";
import { createFoundationRouter } from "../foundation/router.js";
import { isolatedPeer, localApiRequest } from "./http.js";

export async function hostedHarness(label: string, options: { serialRequests?: boolean } = {}) {
  const contexts = [createContext(), createContext()];
  const suffix = randomUUID(); const password = `T!${randomBytes(24).toString("hex")}`;
  const peer = isolatedPeer(suffix);
  const identities: { id: string; authId: string; email: string; token: string; role: Role }[] = [];
  const servers: ReturnType<ReturnType<typeof express>["listen"]>[] = [];
  const bases: string[] = [];
  let queue = Promise.resolve();
  for (const ctx of contexts) {
    const app = express(); app.use(express.json({ limit: "256kb" }));
    if (options.serialRequests) app.use(async (_req, res, next) => {
      const before = queue; let release!: () => void; const done = new Promise<void>((resolve) => { release = resolve; });
      queue = before.then(() => done);
      let closed = false; res.once("finish", release); res.once("close", () => { closed = true; release(); });
      await before; if (closed || res.writableEnded) { release(); return; } next();
    });
    app.use("/api", createFoundationRouter(ctx));
    const server = app.listen(0, "127.0.0.1"); servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve)); bases.push(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`);
  }
  async function call(path: string, token: string, body?: unknown, options: { method?: string; key?: string; instance?: number } = {}) {
    const response = await localApiRequest(bases[options.instance ?? 0] + path, peer, options.method ?? (body === undefined ? "GET" : "POST"), { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.key ? { "Idempotency-Key": options.key } : {}) }, body === undefined ? undefined : JSON.stringify(body));
    const data = z.object({ success: z.boolean(), message: z.string(), data: z.any() }).parse(response.json); return { status: response.status, ...data };
  }
  async function expect(path: string, token: string, body?: unknown, status = 200, options: Parameters<typeof call>[3] = {}) {
    const response = await call(path, token, body, options); assert.equal(response.status, status, `${options.method ?? (body === undefined ? "GET" : "POST")} ${path}: ${response.message}`); return response.data;
  }
  async function employee(role: Role, capabilities: Capability[] = []) {
    const index = identities.length; const email = `backend-${label}-${index}-${suffix}@example.invalid`;
    const { data, error } = await contexts[0].admin.auth.admin.createUser({ email, password, email_confirm: true }); assert.equal(error, null); assert.ok(data.user);
    const row = { id: `test-${label}-${index}-${suffix}`, authId: data.user.id, email, role, token: "" }; identities.push(row);
    await contexts[0].db.insert(employees).values({ id: row.id, authUserId: row.authId, email, role, name: `DEV TEST ${label} ${role}`, status: "Active", employeeCode: `TEST-${label}-${index}-${suffix}`, capabilities });
    row.token = (await expect("/auth/login", "", { email, password })).token; return row;
  }
  async function close() {
    const failures: string[] = [];
    for (const server of servers) await new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });
    for (const row of identities) {
      try {
        await contexts[0].db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.employeeId, row.id));
        await contexts[0].db.update(employees).set({ status: "Inactive" }).where(eq(employees.id, row.id));
        const removed = await contexts[0].admin.auth.admin.deleteUser(row.authId);
        if (removed.error) failures.push("Temporary Auth identity cleanup needs retry");
        else await contexts[0].db.update(employees).set({ authUserId: null }).where(eq(employees.id, row.id));
      } catch { failures.push("Temporary test employee cleanup needs retry"); }
    }
    for (const ctx of contexts) await ctx.client.end();
    assert.deepEqual(failures, [], "Hosted test identity cleanup must complete");
  }
  return { ctx: contexts[0], other: contexts[1], suffix, peer, password, identities, bases, employee, call, expect, close, key: (name: string) => ({ key: `${label}-${name}-${suffix}` }) };
}
