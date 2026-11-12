import test from "node:test";
import assert from "node:assert/strict";
import type { User } from "../../src/types/index.js";
import { sessionSecurity } from "./assurance.js";
import { mfaEnrollInput, mfaVerifyInput } from "../../src/lib/auth/mfaContracts.js";
import { staticPublicContent } from "../../src/features/public/staticContent.js";
import express from "express";
import type { AddressInfo } from "node:net";
import { jsonBodyError } from "../http-security.js";
import { localApiRequest } from "../testing/http.js";
import { logPasswordRejection, passwordUpdateError } from "./password-errors.js";

test("password errors distinguish reused passwords, strength, MFA and expired recovery without exposing provider text", () => {
  const reused = passwordUpdateError({ code: "same_password", status: 422 });
  assert.equal(reused.status, 422); assert.match(reused.message, /different password/);
  assert.match(passwordUpdateError({ code: "weak_password", reasons: ["characters"] }).message, /uppercase and lowercase/);
  assert.match(passwordUpdateError({ code: "weak_password", reasons: ["pwned"] }).message, /data breach/);
  assert.equal(passwordUpdateError({ code: "insufficient_aal" }).status, 428);
  assert.equal(passwordUpdateError({ code: "reauthentication_needed" }).status, 401);
  assert.equal(passwordUpdateError({ code: "session_not_found" }).status, 401);
  assert.equal(passwordUpdateError({ code: "over_request_rate_limit" }).status, 429);
  assert.equal(passwordUpdateError({ status: 500 }).status, 503);
  const logs: unknown[][] = []; const original = console.warn;
  try {
    console.warn = (...args) => { logs.push(args); };
    logPasswordRejection("reset", { code: "same_password", status: 422 });
    logPasswordRejection("reset", { code: "private\nmalformed", status: 9999 });
  } finally { console.warn = original; }
  assert.deepEqual(logs[0][1], { operation: "reset", code: "same_password", status: 422 });
  assert.deepEqual(logs[1][1], { operation: "reset", code: "unknown", status: undefined });
});

test("second-factor access fails closed and privileged production identities require enrollment", () => {
  const user = { role: "Super Admin", status: "Active", capabilities: [] } as unknown as User;
  const token = (aal: string) => `header.${Buffer.from(JSON.stringify({ aal })).toString("base64url")}.signature`;
  assert.deepEqual(sessionSecurity(user, {}, "invalid", true), { assurance: "aal1", required: true, enrolled: false });
  assert.equal(sessionSecurity(user, {}, token("aal1"), false).required, false);
  assert.equal(sessionSecurity(user, {}, token("aal2"), true).assurance, "aal2");
  assert.equal(sessionSecurity({ ...user, role: "Sales Executive" }, {}, token("aal1"), true).required, false);
  const factors = [{ id: "x", factor_type: "totp", status: "verified" }] as Parameters<typeof sessionSecurity>[1]["factors"];
  assert.equal(sessionSecurity({ ...user, role: "Sales Executive" }, { factors }, token("aal1"), false).required, true);
  assert.equal(sessionSecurity(user, {}, token("aal3"), true).assurance, "aal1");
});
test("authenticator inputs never accept account identities, assurance overrides or unbounded codes", () => {
  const input = { factorId: "51aa01ee-fd2c-4fae-a443-d61d83ca0c50", challengeId: "51aa01ee-fd2c-4fae-a443-d61d83ca0c51", code: "123456" };
  assert.ok(mfaVerifyInput.safeParse(input).success);
  for (const change of [{ code: "12345" }, { code: "abcdef" }, { userId: "other" }, { aal: "aal2" }]) assert.equal(mfaVerifyInput.safeParse({ ...input, ...change }).success, false);
  assert.equal(mfaEnrollInput.safeParse({ name: "Phone", currentPassword: "" }).success, false);
});
test("static public catalogue remains published-only, searchable and independent of ERP state", async () => {
  const products = await staticPublicContent.products(); assert.ok(products.length > 0); assert.ok(products.every((p) => p.published));
  const first = products[0]; assert.equal((await staticPublicContent.product(first.slug))?.name, first.name); assert.equal(await staticPublicContent.product("missing-private-product"), null);
  assert.ok((await staticPublicContent.products({ search: first.name })).some((p) => p.slug === first.slug));
  assert.ok((await staticPublicContent.products({ featured: true })).every((p) => p.featured));
  const snapshot = await staticPublicContent.product(first.slug); snapshot!.name = "Local mutation"; assert.equal((await staticPublicContent.product(first.slug))?.name, first.name);
  const json = JSON.stringify({ products, resources: await staticPublicContent.resources(), site: await staticPublicContent.settings() });
  for (const key of ["landedCost", "quantityAvailable", "assignedSalesUserId", "permissionOverrides", "tokenHash"]) assert.ok(!json.includes(`"${key}"`));
});

test("malformed and oversized JSON return bounded errors without echoing request content", async () => {
  const app = express(); app.use(express.json({ limit: "1kb" })); app.use(jsonBodyError);
  app.post("/", (_req, res) => res.json({ success: true }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    for (const [body, status] of [["{private-request-content", 400], [JSON.stringify({ private: "x".repeat(2048) }), 413]] as const) {
      const response = await localApiRequest(base, "127.77.10.12", "POST", { "Content-Type": "application/json" }, body);
      assert.equal(response.status, status); assert.equal(response.headers["cache-control"], "private, no-store");
      const data = response.json as { data: unknown; success: boolean; message: string };
      assert.equal(data.success, false); assert.equal(data.data, null); assert.ok(!data.message.includes("private-request-content"));
      assert.ok(!JSON.stringify(data).includes("stack"));
    }
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
