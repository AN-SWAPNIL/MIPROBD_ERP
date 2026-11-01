import test from "node:test";
import assert from "node:assert/strict";
import { resolveBackendMode } from "./runtime-mode.js";

test("production never silently starts the header-authenticated prototype", () => {
  assert.equal(resolveBackendMode({}), "mock");
  assert.throws(() => resolveBackendMode({ NODE_ENV: "production" }), /explicit/);
  assert.throws(() => resolveBackendMode({ VERCEL_ENV: "production", ERP_BACKEND_MODE: "mock" }), /DEMO_DEPLOYMENT/);
  assert.equal(resolveBackendMode({ VERCEL_ENV: "production", ERP_BACKEND_MODE: "foundation" }), "foundation");
  assert.equal(resolveBackendMode({ NODE_ENV: "production", ERP_BACKEND_MODE: "mock", DEMO_DEPLOYMENT: "true", DEMO_MODE: "true", VITE_DEMO_MODE: "true" }), "mock");
});

test("mixed browser/API modes and foundation demo identities fail closed", () => {
  assert.throws(() => resolveBackendMode({ ERP_BACKEND_MODE: "foundation", VITE_BACKEND_MODE: "mock" }), /must match/);
  for (const flag of ["DEMO_MODE", "VITE_DEMO_MODE"]) assert.throws(() => resolveBackendMode({ ERP_BACKEND_MODE: "foundation", [flag]: "true" }), /demo identities/);
  assert.throws(() => resolveBackendMode({ ERP_BACKEND_MODE: "unknown" }), /Invalid/);
});
