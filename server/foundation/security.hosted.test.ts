import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { setTimeout as pause } from "node:timers/promises";
import { hostedHarness } from "../testing/hosted.js";
import { localApiRequest } from "../testing/http.js";
import { authenticatorCode } from "../testing/totp.js";
import { mfaEnrollmentSchema, mfaStatusSchema } from "../../src/lib/auth/mfaContracts.js";

test("hosted security: real TOTP enrollment, challenge, step-up, cross-worker protection and session revocation", { skip: process.env.RUN_HOSTED_SECURITY_TESTS !== "true", timeout: 600000 }, async () => {
  if (process.env.RUN_SECURITY_BROWSER_TESTS === "true") process.env.APP_URL = "http://localhost:5200";
  const h = await hostedHarness("security"); const original = h.ctx.config.requirePrivilegedMfa; h.ctx.config.requirePrivilegedMfa = true; h.other.config.requirePrivilegedMfa = true;
  const cookies = (headers: Awaited<ReturnType<typeof localApiRequest>>["headers"]) => (headers["set-cookie"] ?? []).map((c) => c.split(";")[0]).join("; ");
  type Login = { token: string; cookie: string };
  const call = async (path: string, actor: Login, body?: unknown, expected = 200, instance = 0) => {
    const response = await localApiRequest(h.bases[instance] + path, h.peer, body === undefined ? "GET" : "POST", { "Content-Type": "application/json", Authorization: `Bearer ${actor.token}`, Cookie: actor.cookie }, body === undefined ? undefined : JSON.stringify(body));
    const result = z.object({ success: z.boolean(), message: z.string(), data: z.any() }).parse(response.json); assert.equal(response.status, expected, `${path}: ${result.message}`);
    return { data: result.data, cookie: cookies(response.headers) || actor.cookie };
  };
  const login = async (email: string, password = h.password): Promise<Login> => { const response = await call("/auth/login", { token: "", cookie: "" }, { email, password }); return { token: response.data.token, cookie: response.cookie }; };
  try {
    const admin = await h.employee("Super Admin"); const outsider = await h.employee("Sales Executive");
    let actor = await login(admin.email);
    const state = mfaStatusSchema.parse((await call("/auth/mfa", actor)).data); assert.equal(state.security.required, true); assert.equal(state.security.enrolled, false);
    await call("/dashboard", actor, undefined, 428); assert.equal((await call("/me", actor)).data.security.assurance, "aal1");
    await call("/auth/mfa/enroll", actor, { name: "DEV TEST authenticator", currentPassword: "incorrect-password" }, 401);
    const setup = mfaEnrollmentSchema.parse((await call("/auth/mfa/enroll", actor, { name: "DEV TEST authenticator", currentPassword: h.password }, 201)).data);
    await call("/auth/mfa/challenge", { token: outsider.token, cookie: "" }, { factorId: setup.id }, 404);
    const first = (await call("/auth/mfa/challenge", actor, { factorId: setup.id })).data.id;
    const code = authenticatorCode(setup.secret); const wrong = String((Number(code) + 1) % 1000000).padStart(6, "0");
    await call("/auth/mfa/verify", actor, { factorId: setup.id, challengeId: first, code: wrong }, 422);
    const challenge = (await call("/auth/mfa/challenge", actor, { factorId: setup.id })).data.id;
    const verified = await call("/auth/mfa/verify", actor, { factorId: setup.id, challengeId: challenge, code: authenticatorCode(setup.secret) });
    const old = actor; actor = { token: verified.data.token, cookie: verified.cookie }; assert.equal(verified.data.security.assurance, "aal2");
    await call("/dashboard", actor, undefined, 200, 1); await call("/dashboard", old, undefined, 401);
    await h.expect("/dashboard", admin.token, undefined, 401);
    await call("/auth/mfa/remove", actor, { factorId: setup.id, reason: "DEV TEST last required factor must remain" }, 409);
    const signedInAgain = await login(admin.email); await call("/dashboard", signedInAgain, undefined, 428, 1);
    await pause(30500 - Date.now() % 30000);
    const next = (await call("/auth/mfa/challenge", signedInAgain, { factorId: setup.id })).data.id;
    const stepped = await call("/auth/mfa/verify", signedInAgain, { factorId: setup.id, challengeId: next, code: authenticatorCode(setup.secret) }); actor = { token: stepped.data.token, cookie: stepped.cookie };
    await call("/dashboard", actor); await call("/dashboard", { token: verified.data.token, cookie: verified.cookie }, undefined, 401);
    const newPassword = `${h.password}N1!`;
    await call("/auth/change-password", actor, { currentPassword: "incorrect-password", password: newPassword }, 401);
    await call("/auth/change-password", actor, { currentPassword: h.password, password: newPassword });
    await call("/me", actor, undefined, 401);
    actor = await login(admin.email, newPassword); await call("/dashboard", actor, undefined, 428);
    await pause(30500 - Date.now() % 30000);
    const afterPassword = (await call("/auth/mfa/challenge", actor, { factorId: setup.id })).data.id;
    const confirmed = await call("/auth/mfa/verify", actor, { factorId: setup.id, challengeId: afterPassword, code: authenticatorCode(setup.secret) }); actor = { token: confirmed.data.token, cookie: confirmed.cookie };
    // Removal is permitted in optional-development mode only; it must revoke every ERP session.
    h.ctx.config.requirePrivilegedMfa = false; h.other.config.requirePrivilegedMfa = false;
    assert.equal((await call("/auth/mfa/remove", actor, { factorId: setup.id, reason: "DEV TEST remove reserved development factor" })).data.signOut, true);
    await call("/me", actor, undefined, 401);
    if (process.env.RUN_SECURITY_BROWSER_TESTS === "true") {
      h.ctx.config.requirePrivilegedMfa = true; h.other.config.requirePrivilegedMfa = true;
      const { securityBrowserSmoke } = await import("../../scripts/security-browser-smoke.js");
      const browserActors = [await h.employee("Super Admin"), await h.employee("Super Admin")];
      await securityBrowserSmoke(h.bases[0], browserActors, h.password, h.peer);
    }
    console.log("Real Supabase authenticator and production access guards verified; no personal accounts were enrolled or changed.");
  } finally { h.ctx.config.requirePrivilegedMfa = original; await h.close(); }
});
