import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { environments, matchesLinkedRepository, profileForBranch, validateProfile } from "./environment-profile.mjs";

const profile = environments.profiles.uat;
test("repository identity survives renaming but never accepts a same-name different repository", () => {
  assert.equal(matchesLinkedRepository({ type: "github", repoId: environments.repositoryId, repo: "MIPROBD_ERP", org: "AN-SWAPNIL" }), true);
  assert.equal(matchesLinkedRepository({ type: "github", repoId: 1, repo: "Medical_Supplier_ERP", org: "AN-SWAPNIL" }), false);
  assert.equal(matchesLinkedRepository(undefined), false);
});
const valid = {
  ERP_BACKEND_MODE: "foundation", VITE_BACKEND_MODE: "foundation", DEMO_MODE: "false", VITE_DEMO_MODE: "false",
  SUPABASE_URL: `https://${profile.supabaseRef}.supabase.co`, VITE_SUPABASE_URL: `https://${profile.supabaseRef}.supabase.co`,
  SUPABASE_PUBLISHABLE_KEY: "public-fixture", VITE_SUPABASE_PUBLISHABLE_KEY: "public-fixture", SUPABASE_SECRET_KEY: "fixture-only",
  DATABASE_RUNTIME_URL: `postgresql://mipro_runtime.${profile.supabaseRef}:fixture@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
  APP_URL: profile.origin, VERCEL_PROJECT_ID: profile.projectId, VERCEL_ENV: "production", ERP_REQUIRE_MFA: "true", ERP_REQUIRE_RESTRICTED_DB: "true", ERP_REQUIRE_LEDGER_CONFIGURATION: "true"
};
test("branches select three unique projects without a prototype database", () => {
  assert.equal(profileForBranch("dev")[0], "staging"); assert.equal(profileForBranch("main")[0], "uat");
  assert.equal(profileForBranch("prototype")[1].supabaseRef, null); assert.equal(profileForBranch("feature/test"), undefined);
  assert.equal(new Set(Object.values(environments.profiles).map(p => p.projectId)).size, 3);
  assert.equal(environments.repository, "AN-SWAPNIL/MIPROBD_ERP");
  assert.equal(environments.profiles.prototype.project, "mipro-erp-prototype");
  assert.equal(environments.profiles.prototype.origin, "https://mipro-erp-prototype.vercel.app");
});
test("matching hosted UAT profile is valid, cross-environment credentials are rejected", () => {
  assert.doesNotThrow(() => validateProfile(profile, valid, { hosted: true }));
  for (const patch of [
    { VITE_SUPABASE_URL: environments.profiles.staging.origin },
    { DATABASE_RUNTIME_URL: valid.DATABASE_RUNTIME_URL.replace(profile.supabaseRef, environments.profiles.staging.supabaseRef) },
    { DATABASE_RUNTIME_URL: valid.DATABASE_RUNTIME_URL.replace("mipro_runtime", "postgres") },
    { VERCEL_PROJECT_ID: environments.profiles.staging.projectId }, { VERCEL_ENV: "preview" },
    { DEMO_MODE: "true" }, { ERP_BACKEND_MODE: "mock" }, { VITE_API_BASE_URL: environments.profiles.staging.origin },
    { DATABASE_MIGRATION_URL: "fixture-only" }, { ERP_REQUIRE_MFA: "false" }, { SUPABASE_SECRET_KEY: "" }
  ]) assert.throws(() => validateProfile(profile, { ...valid, ...patch }, { hosted: true }));
});
test("staging has its own matching database and cannot accept UAT credentials", () => {
  const staging = environments.profiles.staging;
  const env = { ...valid, SUPABASE_URL: `https://${staging.supabaseRef}.supabase.co`, VITE_SUPABASE_URL: `https://${staging.supabaseRef}.supabase.co`, DATABASE_RUNTIME_URL: valid.DATABASE_RUNTIME_URL.replace(profile.supabaseRef, staging.supabaseRef), APP_URL: staging.origin, VERCEL_PROJECT_ID: staging.projectId };
  assert.doesNotThrow(() => validateProfile(staging, env, { hosted: true }));
  assert.throws(() => validateProfile(staging, valid, { hosted: true }));
  assert.throws(() => validateProfile(environments.profiles.prototype, valid));
});
test("the build guard rejects a wrong branch or project before compiling", () => {
  for (const patch of [{ VERCEL_PROJECT_ID: environments.profiles.prototype.projectId }, { VERCEL_GIT_COMMIT_REF: "dev" }]) {
    const child = spawnSync(process.execPath, ["scripts/check-deployment-profile.mjs"], { env: { ...process.env, ...valid, VERCEL: "1", VERCEL_GIT_COMMIT_REF: "main", ...patch }, encoding: "utf8" });
    assert.notEqual(child.status, 0);
  }
});
