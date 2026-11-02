import assert from "node:assert/strict";
import test from "node:test";
import { loadSelectedEnvironment, selectedEnvironmentFile } from "./environment.js";

test("environment loading never falls back to root .env or .env.local", () => {
  const loaded: unknown[] = [];
  loadSelectedEnvironment({}, path => { loaded.push(path); });
  assert.deepEqual(loaded, []);
  assert.equal(selectedEnvironmentFile({}), undefined);
});

test("only an explicit private configuration can be loaded", () => {
  const loaded: unknown[] = [];
  loadSelectedEnvironment({ ERP_ENV_FILE: "artifacts/private/uat.env" }, path => { loaded.push(path); });
  assert.equal(loaded.length, 1);
  assert.match(String(loaded[0]), /artifacts[\\/]private[\\/]uat\.env$/);
  for (const path of [".env", ".env.local", "artifacts/private/../outside.env", "artifacts/private", "config/prototype.env"]) assert.throws(() => selectedEnvironmentFile({ ERP_ENV_FILE: path }));
  assert.throws(() => selectedEnvironmentFile({ ERP_ENV_FILE: "artifacts/private/uat.env", VERCEL: "1" }));
});

test("missing selected files fail instead of falling back to another environment", () => {
  assert.throws(() => loadSelectedEnvironment({ ERP_ENV_FILE: "artifacts/private/missing.env" }, () => { throw new Error("Missing selected configuration"); }), /Missing selected configuration/);
});
