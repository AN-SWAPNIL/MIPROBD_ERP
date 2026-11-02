import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import express, { type Request } from "express";
import { z } from "zod";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { employees, sessions } from "../../database/schema.js";
import { bearer, createContext, digest, toUser } from "./context.js";
import { createFoundationRouter } from "./router.js";
import { accessSchema, profileSchema, uploadSchema } from "./contracts.js";
import { matchesFileSignature } from "./documents.js";
import { deliverInvitation, retireCancelledIdentity } from "./invitations.js";

test("bearer identity never falls back to role or user headers", () => {
  const req = { get: () => undefined, headers: { "x-user-id": "u-super", "x-role": "Super Admin" } } as unknown as Request;
  assert.throws(() => bearer(req), /valid ERP session/);
  assert.throws(() => bearer({ get: () => "Bearer token with spaces" } as unknown as Request), /./);
});

test("file authorization rejects external paths, executable content and oversized avatars", () => {
  const valid = { employeeId: "employee-1", purpose: "employee-avatar", fileName: "photo.png", mimeType: "image/png", sizeBytes: 200 };
  assert.equal(uploadSchema.safeParse(valid).success, true);
  assert.equal(uploadSchema.safeParse({ ...valid, fileName: "../photo.png" }).success, false);
  assert.equal(uploadSchema.safeParse({ ...valid, mimeType: "image/svg+xml" }).success, false);
  assert.equal(uploadSchema.safeParse({ ...valid, sizeBytes: 3 * 1024 * 1024 }).success, false);
  assert.equal(uploadSchema.safeParse({ ...valid, url: "https://untrusted.example/file" }).success, false);
  assert.equal(matchesFileSignature("application/pdf", Buffer.from("%PDF-1.7")), true);
  assert.equal(matchesFileSignature("image/png", Buffer.from("<script>")), false);
});

test("profile changes cannot smuggle role/access fields and access changes require optimistic version", () => {
  assert.equal(profileSchema.safeParse({ name: "Employee Name", phone: "", role: "Super Admin" }).success, false);
  assert.equal(accessSchema.safeParse({ role: "Accounts", status: "Active", capabilities: [], permissionOverrides: [], reason: "Approved change" }).success, false);
  assert.equal(digest("token").length, 64);
});

test("database employee projection does not expose identity IDs or session data", () => {
  const row = { id: "emp-1", authUserId: randomUUID(), name: "Test Employee", email: "test@example.invalid", role: "Accounts", status: "Active", title: "", department: "", phone: "", territory: "", employeeCode: "T-1", permissionOverrides: [], capabilities: [], managerId: null, version: 1, createdAt: new Date(), updatedAt: new Date() } as typeof employees.$inferSelect;
  assert.equal("authUserId" in toUser(row), false);
  assert.equal("version" in toUser(row), false);
});

test("expired employee invitations can be retried without changing their linked identity", async () => {
  let confirmed = false;
  let invites = 0;
  let recoveries = 0;
  let mismatchedEmail = false;
  let deliveryFails = false;
  const ctx = {
    config: { origin: "https://example.invalid" },
    admin: { auth: { admin: {
      getUserById: async () => ({ data: { user: { id: "same", email: mismatchedEmail ? "other@example.invalid" : "one@example.invalid", email_confirmed_at: confirmed ? "2026-10-24" : null } }, error: null }),
      inviteUserByEmail: async () => { invites++; return { data: { user: { id: "same" } }, error: deliveryFails ? new Error("Mail unavailable") : null }; }
    } } },
    publicClient: () => ({ auth: { resetPasswordForEmail: async () => { recoveries++; return { error: null }; } } })
  } as unknown as Parameters<typeof deliverInvitation>[0];
  const employee = { email: "one@example.invalid", name: "One", authUserId: "same" };
  assert.deepEqual(await deliverInvitation(ctx, employee), { sent: true, authUserId: "same" });
  assert.equal(invites, 1);
  confirmed = true;
  assert.deepEqual(await deliverInvitation(ctx, employee), { sent: true, authUserId: "same" });
  assert.equal(recoveries, 1);
  mismatchedEmail = true;
  await assert.rejects(deliverInvitation(ctx, employee), /administrator review/);
  assert.equal(invites, 1);
  deliveryFails = true;
  assert.deepEqual(await deliverInvitation(ctx, { ...employee, authUserId: null }), { sent: false, authUserId: null, retryable: true, failureCode: "DELIVERY_FAILED" });
});

test("fresh onboarding retires only its matching old identity and fails closed for provider/mismatch errors", async () => {
  let removed = 0; let missing = false; let mismatched = false; let unavailable = false;
  const ctx = { admin: { auth: { admin: {
    getUserById: async () => ({ data: { user: missing ? null : { email: mismatched ? "another@example.invalid" : "old@example.invalid" } }, error: missing ? { status: 404 } : null }),
    deleteUser: async () => { removed++; return { error: unavailable ? { status: 500 } : null }; }
  } } } } as unknown as Parameters<typeof retireCancelledIdentity>[0];
  const employee = { email: "old@example.invalid", authUserId: "old-identity" };
  await retireCancelledIdentity(ctx, { ...employee, authUserId: null }); assert.equal(removed, 0);
  mismatched = true; await assert.rejects(retireCancelledIdentity(ctx, employee), /does not match/); assert.equal(removed, 0);
  mismatched = false; missing = true; await retireCancelledIdentity(ctx, employee); assert.equal(removed, 0);
  missing = false; unavailable = true; await assert.rejects(retireCancelledIdentity(ctx, employee), /could not be replaced/);
  unavailable = false; await retireCancelledIdentity(ctx, employee); assert.equal(removed, 2);
});

test("hosted foundation: real auth, persisted profiles, access revocation, private storage and append-only audit", { skip: process.env.RUN_HOSTED_BACKEND_TESTS !== "true", timeout: 180000 }, async () => {
  const ctx = createContext();
  const uid = randomUUID();
  const password = `T!${randomBytes(24).toString("hex")}`;
  const created: { employeeId: string; authId: string; email: string }[] = [];
  const objects: string[] = [];
  let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
  let base = "";
  async function start() {
    const app = express();
    app.use(express.json({ limit: "256kb" }));
    app.use("/api", createFoundationRouter(ctx));
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  }
  async function call(path: string, options: { method?: string; token?: string; body?: unknown; cookie?: string; origin?: string } = {}) {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
    if (options.cookie) headers.set("Cookie", options.cookie);
    if (options.origin) headers.set("Origin", options.origin);
    const response = await fetch(base + path, { method: options.method ?? "GET", headers, signal: AbortSignal.timeout(20000), body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    const body = z.object({ success: z.boolean(), data: z.any() }).parse(await response.json());
    return { response, body };
  }
  try {
    for (const [label, role] of [["admin", "Super Admin"], ["sales", "Sales Executive"]] as const) {
      const email = `backend-${label}-${uid}@example.invalid`;
      const { data, error } = await ctx.admin.auth.admin.createUser({ email, password, email_confirm: true });
      assert.equal(error, null, "Temporary test identity creation must succeed");
      assert.ok(data.user);
      const employeeId = `test-${label}-${uid}`;
      created.push({ employeeId, authId: data.user.id, email });
      await ctx.db.insert(employees).values({ id: employeeId, authUserId: data.user.id, email, name: "Backend Integration Test", role, status: "Active", employeeCode: `TEST-${label}-${uid}` });
    }
    await start();
    console.log("Hosted: testing login and persisted profile");
    assert.equal((await call("/health")).response.status, 200);
    const forged = await fetch(base + "/me", { headers: { "x-user-id": created[0].employeeId, "x-role": "Super Admin" } });
    assert.equal(forged.status, 401);
    assert.equal((await call("/auth/reset-password", { method: "POST", body: { email: created[0].email, password } })).response.status, 422);
    const adminLogin = await call("/auth/login", { method: "POST", body: { email: created[0].email, password } });
    assert.equal(adminLogin.response.status, 200);
    let adminToken = adminLogin.body.data.token as string;
    const cookies = adminLogin.response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    assert.ok(adminLogin.response.headers.getSetCookie().every((value) => /HttpOnly/i.test(value) && /SameSite=Strict/i.test(value)));
    assert.equal((await call("/me", { token: adminToken })).body.data.user.role, "Super Admin");
    assert.equal((await call("/profile", { method: "PATCH", token: adminToken, origin: "https://attacker.invalid", body: { name: "Blocked", phone: "" } })).response.status, 403);
    assert.equal((await call("/profile", { method: "PATCH", token: adminToken, body: { name: "Persisted Integration Profile", phone: "123" } })).response.status, 200);
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    await start();
    assert.equal((await call("/me", { token: adminToken })).body.data.user.name, "Persisted Integration Profile");
    const refresh = await call("/auth/refresh", { method: "POST", cookie: cookies, body: {} });
    assert.equal(refresh.response.status, 200);
    adminToken = refresh.body.data.token;
    const salesLogin = await call("/auth/login", { method: "POST", body: { email: created[1].email, password } });
    assert.equal(salesLogin.response.status, 200);
    let salesToken = salesLogin.body.data.token;
    console.log("Hosted: testing verified recovery and password reset");
    assert.equal((await call("/employees", { token: salesToken })).response.status, 403);
    assert.equal((await call("/profile", { method: "PATCH", token: salesToken, body: { name: "Bad", phone: "", role: "Super Admin" } })).response.status, 422);
    const { data: recoveryLink, error: recoveryLinkError } = await ctx.admin.auth.admin.generateLink({ type: "recovery", email: created[1].email });
    assert.equal(recoveryLinkError, null);
    const { data: recovery, error: recoveryError } = await ctx.publicClient().auth.verifyOtp({ token_hash: recoveryLink.properties.hashed_token, type: "recovery" });
    assert.equal(recoveryError, null);
    assert.ok(recovery.session);
    const exchanged = await call("/auth/exchange", { method: "POST", body: { accessToken: recovery.session.access_token, refreshToken: recovery.session.refresh_token } });
    assert.equal(exchanged.response.status, 200);
    const recoveryCookie = exchanged.response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    assert.equal((await call("/me", { token: exchanged.body.data.token })).response.status, 401, "Recovery session must not grant ordinary ERP access");
    const replacementPassword = `N!${randomBytes(24).toString("hex")}`;
    assert.equal((await call("/auth/reset-password", { method: "POST", token: exchanged.body.data.token, cookie: recoveryCookie, body: { password: replacementPassword } })).response.status, 200);
    assert.equal((await call("/auth/login", { method: "POST", body: { email: created[1].email, password } })).response.status, 401);
    const resetLogin = await call("/auth/login", { method: "POST", body: { email: created[1].email, password: replacementPassword } });
    assert.equal(resetLogin.response.status, 200);
    salesToken = resetLogin.body.data.token;
    console.log("Hosted: testing private upload and cross-employee denial");
    const upload = await call("/uploads", { method: "POST", token: adminToken, body: { employeeId: created[0].employeeId, purpose: "employee-avatar", fileName: "test.png", mimeType: "image/png", sizeBytes: 68 } });
    assert.equal(upload.response.status, 201);
    objects.push(upload.body.data.path);
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1sAAAAASUVORK5CYII=", "base64");
    const { error: uploadError } = await ctx.admin.storage.from("erp-documents").uploadToSignedUrl(upload.body.data.path, upload.body.data.token, bytes, { contentType: "image/png" });
    assert.equal(uploadError, null, "Signed upload should succeed");
    assert.equal((await call(`/uploads/${upload.body.data.id}/complete`, { method: "POST", token: adminToken, body: {} })).response.status, 200);
    assert.equal((await call(`/documents/${upload.body.data.id}`, { token: salesToken })).response.status, 403);
    const document = await call(`/documents/${upload.body.data.id}`, { token: adminToken });
    assert.equal(document.response.status, 200);
    assert.equal((await fetch(document.body.data.url)).status, 200);
    const publicUrl = ctx.admin.storage.from("erp-documents").getPublicUrl(upload.body.data.path).data.publicUrl;
    assert.notEqual((await fetch(publicUrl)).status, 200);
    console.log("Hosted: testing access revocation and audit integrity");
    const access = { role: "Sales Executive", status: "Inactive", capabilities: [], permissionOverrides: [], version: 1, reason: "Integration test access revocation" };
    assert.equal((await call(`/employees/${created[1].employeeId}/access`, { method: "PATCH", token: adminToken, body: access })).response.status, 200);
    assert.equal((await call("/me", { token: resetLogin.body.data.token })).response.status, 401);
    assert.equal((await call(`/employees/${created[1].employeeId}/access`, { method: "PATCH", token: adminToken, body: access })).response.status, 409);
    const { rows: [privileges] } = await ctx.client.query("select has_schema_privilege('anon', 'erp_private', 'usage') as anon, has_schema_privilege('authenticated', 'erp_private', 'usage') as authenticated");
    assert.equal(privileges.anon, false);
    assert.equal(privileges.authenticated, false);
    await assert.rejects(ctx.client.query("update erp_private.audit_events set action = 'tampered' where false"), { code: "55000" });
    assert.equal((await call("/auth/logout", { method: "POST", token: adminToken, body: {} })).response.status, 200);
    assert.equal((await call("/me", { token: adminToken })).response.status, 401);
    if (process.env.RUN_BACKEND_BROWSER_TESTS === "true") {
      const { backendBrowserSmoke } = await import("../../scripts/backend-browser-smoke.js");
      await backendBrowserSmoke(base, created[0].email, password);
    }
    console.log("Hosted integration passed; test identities will be removed and employee audit records retained as Inactive.");
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    if (objects.length) await ctx.admin.storage.from("erp-documents").remove(objects);
    for (const record of created) {
      try {
        await ctx.db.transaction(async (tx) => {
          await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.employeeId, record.employeeId));
          await tx.update(employees).set({ status: "Inactive", authUserId: null }).where(eq(employees.id, record.employeeId));
        });
      } finally { await ctx.admin.auth.admin.deleteUser(record.authId); }
    }
    await ctx.client.end();
  }
});
