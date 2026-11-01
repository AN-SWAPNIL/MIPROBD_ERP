import test from "node:test";
import assert from "node:assert/strict";
import { isRestrictedRuntime, type DatabasePrivileges } from "./database-security.js";
import { backendConfig } from "../config.js";
import { assertHostedDatabaseProject } from "../../database/project.js";

test("administrative operations reject cross-project, unrecognized and local database targets", () => {
  const ref = "abcdefghijklmnopqrst", url = `https://${ref}.supabase.co`;
  assert.equal(assertHostedDatabaseProject(`postgresql://postgres.${ref}:placeholder@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`, url), ref);
  assert.equal(assertHostedDatabaseProject(`postgresql://postgres:placeholder@db.${ref}.supabase.co/postgres`, url), ref);
  for (const connection of ["postgresql://postgres.wrong:placeholder@aws-0-ap-south-1.pooler.supabase.com/postgres", "postgresql://postgres:placeholder@db.wrong.supabase.co/postgres", "postgresql://postgres:placeholder@localhost/postgres", "https://example.com"]) assert.throws(() => assertHostedDatabaseProject(connection, url));
});
test("runtime database checks fail closed for every dangerous privilege and incomplete results", () => {
  const flags: DatabasePrivileges = { unsafeRole: false, ownsPrivateTables: false, canCreateSchema: false, canReadAuth: false, canReadStorage: false, missingRls: false };
  assert.equal(isRestrictedRuntime(flags), true);
  for (const key of Object.keys(flags)) assert.equal(isRestrictedRuntime({ ...flags, [key]: true }), false);
  assert.equal(isRestrictedRuntime({} as DatabasePrivileges), false);
});
test("runtime configuration never requires broad migration credentials in the deployed app", () => {
  const sample = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "test-public", SUPABASE_SECRET_KEY: "test-secret", APP_URL: "https://staging.example.invalid", DATABASE_RUNTIME_URL: "postgresql://mipro_runtime:placeholder@localhost:5432/postgres" };
  const before = Object.fromEntries([...Object.keys(sample), "DATABASE_URL"].map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, sample); delete process.env.DATABASE_URL;
    assert.equal(backendConfig().DATABASE_URL, sample.DATABASE_RUNTIME_URL);
    process.env.DATABASE_RUNTIME_URL = "postgresql://mipro_runtime.otherproject:placeholder@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";
    assert.throws(() => backendConfig(), /project identities do not match/);
    process.env.DATABASE_RUNTIME_URL = "postgresql://mipro_runtime.example:placeholder@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";
    assert.ok(backendConfig().DATABASE_URL.includes("mipro_runtime.example"));
    delete process.env.DATABASE_RUNTIME_URL; assert.throws(() => backendConfig(), /DATABASE_RUNTIME_URL or DATABASE_URL/);
  } finally { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
