import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { hostedHarness } from "../testing/hosted.js";
import { localApiRequest } from "../testing/http.js";
import { authenticatorCode } from "../testing/totp.js";
import { mfaEnrollmentSchema } from "../../src/lib/auth/mfaContracts.js";
import type { Session } from "../../src/types/index.js";

type Identity = { token: string; cookie: string };

test("hosted recovery: reused password retry, real MFA step-up, recovery isolation and session revocation", { skip: process.env.RUN_HOSTED_RECOVERY_TESTS !== "true", timeout: 300000 }, async () => {
  assert.equal(new URL(process.env.SUPABASE_URL!).hostname, "hyttuapvvqqxcyhojbwq.supabase.co", "Recovery tests use synthetic development accounts only");
  const h = await hostedHarness("recovery");
  const call = async (path: string, actor: Identity, body?: unknown, expected = 200) => {
    const response = await localApiRequest(h.bases[0] + path, h.peer, body === undefined ? "GET" : "POST", { "Content-Type": "application/json", Authorization: `Bearer ${actor.token}`, Cookie: actor.cookie }, body === undefined ? undefined : JSON.stringify(body));
    const result = response.json as { success: boolean; message: string; data: unknown };
    assert.equal(response.status, expected, `${path}: ${result.message}`);
    const cookie = response.headers["set-cookie"]?.map((value) => value.split(";")[0]).join("; ") || actor.cookie;
    return { data: result.data as Session, message: result.message, cookie };
  };
  const recovery = async (email: string): Promise<Identity> => {
    const link = await h.ctx.admin.auth.admin.generateLink({ type: "recovery", email }); assert.equal(link.error, null);
    const verified = await h.ctx.publicClient().auth.verifyOtp({ type: "recovery", token_hash: link.data.properties.hashed_token }); assert.equal(verified.error, null); assert.ok(verified.data.session);
    const exchange = await call("/auth/exchange", { token: "", cookie: "" }, { accessToken: verified.data.session.access_token, refreshToken: verified.data.session.refresh_token });
    return { token: exchange.data.token, cookie: exchange.cookie };
  };
  try {
    const person = await h.employee("Sales Executive"); let actor = await recovery(person.email);
    await call("/me", actor, undefined, 401);
    const reused = await call("/auth/reset-password", actor, { password: h.password }, 422);
    assert.match(reused.message, /different password/);
    const replacement = `New!${randomUUID()}Aa9`;
    await call("/auth/reset-password", actor, { password: replacement });
    await call("/auth/reset-password", actor, { password: replacement }, 401);
    await h.expect("/me", person.token, undefined, 401);
    await h.expect("/auth/login", "", { email: person.email, password: h.password }, 401);
    await h.expect("/auth/login", "", { email: person.email, password: replacement });
    console.log("PASS recovery: fresh link, same-password error, successful retry, old credentials and ERP sessions revoked.");

    const secured = await h.employee("Sales Executive");
    const login = await call("/auth/login", { token: "", cookie: "" }, { email: secured.email, password: h.password });
    actor = { token: login.data.token, cookie: login.cookie };
    const enrollment = mfaEnrollmentSchema.parse((await call("/auth/mfa/enroll", actor, { name: "DEV TEST recovery factor", currentPassword: h.password }, 201)).data);
    const challenge = (await call("/auth/mfa/challenge", actor, { factorId: enrollment.id })).data as unknown as { id: string };
    const enrolled = await call("/auth/mfa/verify", actor, { factorId: enrollment.id, challengeId: challenge.id, code: authenticatorCode(enrollment.secret) });
    actor = { token: enrolled.data.token, cookie: enrolled.cookie };
    const unfinished = mfaEnrollmentSchema.parse((await call("/auth/mfa/enroll", actor, { name: "DEV TEST unfinished factor", currentPassword: h.password }, 201)).data);
    actor = await recovery(secured.email);
    await call("/me", actor, undefined, 401);
    await call("/auth/mfa/enroll", actor, { name: "Forbidden recovery enrollment", currentPassword: h.password }, 401);
    await call("/auth/mfa/remove", actor, { factorId: enrollment.id, reason: "Forbidden recovery removal" }, 401);
    await call("/auth/reset-password", actor, { password: replacement }, 428);
    await call("/auth/mfa", actor);
    await call("/auth/mfa/challenge", actor, { factorId: randomUUID() }, 404);
    await call("/auth/mfa/challenge", actor, { factorId: unfinished.id }, 404);
    await call("/auth/mfa/verify", actor, { factorId: unfinished.id, challengeId: randomUUID(), code: "123456" }, 404);
    await pause(30500 - Date.now() % 30000);
    const next = (await call("/auth/mfa/challenge", actor, { factorId: enrollment.id })).data as unknown as { id: string };
    const verified = await call("/auth/mfa/verify", actor, { factorId: enrollment.id, challengeId: next.id, code: authenticatorCode(enrollment.secret) });
    actor = { token: verified.data.token, cookie: verified.cookie };
    assert.equal(verified.data.security?.assurance, "aal2");
    await call("/me", actor, undefined, 401);
    await call("/auth/reset-password", actor, { password: replacement });
    const after = await h.expect("/auth/login", "", { email: secured.email, password: replacement }); assert.equal(after.security.enrolled, true);
    console.log("PASS recovery: authenticator step-up enables reset without enabling normal ERP access or removing MFA.");
    if (process.env.RUN_RECOVERY_BROWSER_TESTS === "true") {
      h.ctx.config.origin = "http://localhost:5184";
      const { passwordRecoveryBrowserCheck } = await import("../../scripts/password-recovery-browser-check.js");
      await passwordRecoveryBrowserCheck(h);
    }
  } finally { await h.close(); }
});
