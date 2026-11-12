/// <reference lib="dom" />
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import type { hostedHarness } from "../server/testing/hosted.js";
import { authenticatorCode } from "../server/testing/totp.js";
import { mfaEnrollmentSchema } from "../src/lib/auth/mfaContracts.js";

export async function passwordRecoveryBrowserCheck(h: Awaited<ReturnType<typeof hostedHarness>>) {
  process.env.VITE_BACKEND_MODE = "foundation"; process.env.VITE_DEMO_MODE = "false";
  const origin = "http://localhost:5184";
  const web = await createServer({ cacheDir: "node_modules/.vite-recovery-browser", server: { host: "localhost", port: 5184, strictPort: true, proxy: { "/api": { target: new URL(h.bases[0]).origin, changeOrigin: true, localAddress: h.peer } } } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    await mkdir("artifacts/backend/password-recovery", { recursive: true }); await web.listen();
    for (const width of [1440, 390]) {
      const person = await h.employee("Sales Executive");
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      try {
        const page = await context.newPage(); page.setDefaultTimeout(30000); const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${origin}/login`);
        await page.getByLabel("Email", { exact: true }).fill(person.email);
        await page.getByLabel("Password", { exact: true }).fill(h.password);
        const loggedIn = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/login" && r.request().method() === "POST");
        await page.getByRole("button", { name: "Sign In", exact: true }).click();
        await loggedIn; await page.waitForURL("**/backend");
        // Mobile covers an enrolled account too; all secrets belong to this synthetic test user.
        let setup: ReturnType<typeof mfaEnrollmentSchema.parse> | undefined;
        if (width === 390) {
          await page.goto(`${origin}/backend/profile`);
          await page.getByLabel("Authenticator current password", { exact: true }).fill(h.password);
          const enrolling = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/mfa/enroll");
          await page.getByRole("button", { name: "Set Up Authenticator", exact: true }).click();
          setup = mfaEnrollmentSchema.parse((await (await enrolling).json()).data);
          await page.getByLabel("Six-digit code", { exact: true }).fill(authenticatorCode(setup.secret));
          await page.getByRole("button", { name: "Verify Authenticator", exact: true }).click();
          await expect(page.getByText("Authenticator verified for this session.", { exact: true })).toBeVisible();
        }
        const link = await h.ctx.admin.auth.admin.generateLink({ type: "recovery", email: person.email }); assert.equal(link.error, null);
        const verified = await h.ctx.publicClient().auth.verifyOtp({ type: "recovery", token_hash: link.data.properties.hashed_token }); assert.equal(verified.error, null); assert.ok(verified.data.session);
        await context.addInitScript(({ access, refresh }) => {
          if (window.location.pathname === "/reset-password") {
            const params = new URLSearchParams({ access_token: access, refresh_token: refresh, type: "recovery" });
            window.history.replaceState(null, "", `/reset-password#${params}`);
          }
        }, { access: verified.data.session.access_token, refresh: verified.data.session.refresh_token });
        await page.goto(`${origin}/reset-password`);
        const capture = async (name: string) => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true, `${name} fits ${width}px`);
          await page.screenshot({ path: `artifacts/backend/password-recovery/${name}-${width}.png`, fullPage: true });
        };
        if (setup) {
          await expect(page.getByLabel("Six-Digit Code", { exact: true })).toBeVisible(); await capture("authenticator");
          await pause(30500 - Date.now() % 30000);
          await page.getByLabel("Six-Digit Code", { exact: true }).fill(authenticatorCode(setup.secret));
          await page.getByRole("button", { name: "Verify Authenticator", exact: true }).click();
        }
        const password = page.getByLabel("New Password", { exact: true });
        const save = page.getByRole("button", { name: "Save New Password", exact: true });
        await expect(save).toBeEnabled();
        await password.fill(h.password); await save.click();
        await expect(page.getByRole("alert")).toContainText("Choose a different password");
        await expect(save).toBeEnabled(); await capture("reuse-error");
        await password.fill(`New!${randomUUID()}Aa9`); await save.click();
        await page.waitForURL("**/login");
        await expect(page.getByRole("status")).toContainText("Password updated.");
        assert.equal(await page.evaluate(() => localStorage.getItem("mipro-erp-session")), null, "Revoked login must be cleared without storing recovery credentials");
        await capture("success"); assert.deepEqual(errors, []);
        console.log(`PASS recovery browser ${width}px: ${setup ? "real MFA, " : ""}fresh link, explicit reuse error, retry and cleared login.`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); await web.close(); }
}
