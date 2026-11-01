import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Context } from "../foundation/context.js";
import { HttpError } from "../foundation/errors.js";
import { authorizeScheduledJob, createMaintenanceRouter } from "./router.js";
import { normalizeApiPath } from "../api-path.js";
import { resolveMapTiles } from "../../src/lib/maps/tiles.js";
import { reconciliationHealthy } from "./reconciliation.js";
import { privateArtifactPath } from "../../scripts/private-paths.js";

test("scheduled jobs require enabled, strong server credentials, never browser role headers", () => {
  const secret = "x".repeat(48);
  const request = (authorization?: string) => ({ get: () => authorization } as Parameters<typeof authorizeScheduledJob>[0]);
  assert.throws(() => authorizeScheduledJob(request(), {}), (e: unknown) => e instanceof HttpError && e.status === 503);
  assert.throws(() => authorizeScheduledJob(request(), { CRON_SECRET: secret, ERP_SCHEDULED_JOBS_ENABLED: "true" }), (e: unknown) => e instanceof HttpError && e.status === 401);
  assert.throws(() => authorizeScheduledJob(request(`Bearer ${secret}`), { CRON_SECRET: secret }), (e: unknown) => e instanceof HttpError && e.status === 503);
  assert.throws(() => authorizeScheduledJob(request("x".repeat(2000)), { CRON_SECRET: secret, ERP_SCHEDULED_JOBS_ENABLED: "true" }));
  authorizeScheduledJob(request(`Bearer ${secret}`), { CRON_SECRET: secret, ERP_SCHEDULED_JOBS_ENABLED: "true" });
});

test("invitation HTTP ticks authorize before work and reveal no identity/provider fields", async () => {
  const previous = { secret: process.env.CRON_SECRET, enabled: process.env.ERP_SCHEDULED_JOBS_ENABLED };
  process.env.CRON_SECRET = "local-test-".repeat(5); process.env.ERP_SCHEDULED_JOBS_ENABLED = "true";
  let calls = 0;
  const app = express();
  app.use(createMaintenanceRouter({ config: { requireRestrictedDatabase: false }, db: { insert: () => ({ values: async () => {} }) } } as unknown as Context, async () => {
    calls++; return { id: "private-job", employeeId: "private-employee", invitationSent: true };
  }));
  app.use(((error: unknown, _req: unknown, res: express.Response, _next: unknown) => { void _next; res.status(error instanceof HttpError ? error.status : 422).json({ message: "Rejected" }); }) as express.ErrorRequestHandler);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/jobs/invitations`;
  try {
    assert.equal((await fetch(url, { headers: { "x-user-role": "Super Admin" } })).status, 401); assert.equal(calls, 0);
    const headers = { authorization: `Bearer ${process.env.CRON_SECRET}` };
    assert.equal((await fetch(url + "?limit=999", { headers })).status, 422); assert.equal(calls, 0);
    assert.equal((await fetch(url, { method: "POST", headers })).status, 405);
    const response = await fetch(url, { headers }); assert.equal(response.status, 200);
    const text = await response.text(); assert.ok(!text.includes("private-")); assert.equal(calls, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
    if (previous.secret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous.secret;
    if (previous.enabled === undefined) delete process.env.ERP_SCHEDULED_JOBS_ENABLED; else process.env.ERP_SCHEDULED_JOBS_ENABLED = previous.enabled;
  }
});

test("source health fails closed for malformed counts and reports actual mismatches", () => {
  const good = { stockMismatches: 0, unbalancedJournals: 0, invalidSourceLinks: 0, approvalHistoryGaps: 0, invalidHeldQuantities: 0, negativeCashAccounts: 0 };
  assert.equal(reconciliationHealthy(good), true);
  for (const key of Object.keys(good)) assert.equal(reconciliationHealthy({ ...good, [key]: 1 }), false);
  for (const change of [{ stockMismatches: -1 }, { stockMismatches: "0" }, { stockMismatches: null }, { extra: 0 }]) assert.throws(() => reconciliationHealthy({ ...good, ...change }));
  assert.throws(() => reconciliationHealthy({}));
});

test("environment-specific runtime and bootstrap paths cannot escape the ignored private boundary", () => {
  assert.ok(privateArtifactPath("artifacts/private/uat-runtime.env", "artifacts/private/runtime-database.env").href.endsWith("/artifacts/private/uat-runtime.env"));
  assert.ok(privateArtifactPath("artifacts/private/uat-owner", "artifacts/private", true).href.endsWith("/artifacts/private/uat-owner/"));
  for (const value of [".env", "src/unsafe.env", "artifacts/private/../../unsafe.env", "../outside.env", "artifacts/private"]) assert.throws(() => privateArtifactPath(value, "artifacts/private/runtime.env"));
});

test("both API runtimes normalize versioned routes without changing query contents", () => {
  assert.equal(normalizeApiPath("health"), "/api/health");
  assert.equal(normalizeApiPath("/api/v1/health?search=a?b"), "/api/health?search=a?b");
  assert.equal(normalizeApiPath("/apiculture"), "/api/apiculture");
});

test("shared raster maps use the canonical endpoint, visible attribution and HTTPS", () => {
  assert.equal(resolveMapTiles().url, "https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  assert.throws(() => resolveMapTiles("http://example.com/{z}/{x}/{y}.png"));
  assert.throws(() => resolveMapTiles("https://user:secret@example.com/{z}/{x}/{y}.png"));
  assert.throws(() => resolveMapTiles(undefined, "<script>alert(1)</script>"));
  assert.throws(() => resolveMapTiles(undefined, "No attribution"));
  assert.equal(resolveMapTiles("https://example.com/{z}/{x}/{y}.png", "Example provider").attribution, "Example provider");
});
