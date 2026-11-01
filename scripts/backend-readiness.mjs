import { loadEnvFile } from "node:process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { connectDatabase } from "../database/client.ts";
import { sql } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { databasePrivileges, isRestrictedRuntime } from "../server/foundation/database-security.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const exec = promisify(execFile);
const results = [];
const record = (status, check, detail) => {
  results.push({ status, check, detail });
  console.log(`${status}: ${check} - ${detail}`);
};

// Never log provider error messages: they can contain connection strings or user data.
function safeError(error) {
  const code = String(error?.code ?? error?.cause?.code ?? "CONNECTION_OR_AUTH_ERROR");
  return /^[A-Z0-9_]+$/.test(code) ? code : "CONNECTION_OR_AUTH_ERROR";
}

try {
  loadEnvFile(new URL(`../${process.env.ERP_ENV_FILE || ".env"}`, import.meta.url));
} catch {
  record("FAIL", "Local configuration", "Could not load .env");
  process.exit(1);
}

const privateRuntime = new URL(`../${process.env.ERP_RUNTIME_ENV_FILE ?? "artifacts/private/runtime-database.env"}`, import.meta.url);
if (existsSync(privateRuntime)) loadEnvFile(privateRuntime);
const required = ["DATABASE_URL", "DATABASE_MIGRATION_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "SUPER_ADMIN_NAME", "SUPER_ADMIN_EMAIL"];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  record("FAIL", "Required variables", missing.join(", "));
  process.exit(1);
}
record("PASS", "Required variables", "All present; values withheld");

const text = await readFile(new URL(`../${process.env.ERP_ENV_FILE || ".env"}`, import.meta.url), "utf8");
record(/^\s*\*#/m.test(text) ? "WARN" : "PASS", "Comment syntax", "Use plain # comments, not Markdown");
record(/password\s*:/i.test(text) ? "WARN" : "PASS", "Password comments", "Do not keep plaintext passwords in comments");
record(process.env.VITE_API_BASE_URL ? "WARN" : "PASS", "API base", "Same-origin deployments use a blank API base");
record(process.env.VITE_DEMO_MODE === "false" && process.env.DEMO_MODE === "false" ? "PASS" : "WARN", "Demo isolation", "Real-backend environments require both demo flags false");
record(process.env.SUPABASE_URL === process.env.VITE_SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY === process.env.VITE_SUPABASE_PUBLISHABLE_KEY ? "PASS" : "FAIL", "Browser/server configuration", "Project URLs and publishable keys must match");

let projectUrl;
try {
  projectUrl = new URL(process.env.SUPABASE_URL);
  if (projectUrl.protocol !== "https:") throw new Error();
} catch {
  record("FAIL", "Project URL", "Expected a plain HTTPS URL");
  process.exit(1);
}

try {
  const { stdout } = await exec(process.execPath, ["node_modules/supabase/dist/supabase.js", "projects", "list", "--output", "json"], { cwd: root, timeout: 30000, maxBuffer: 1024 * 1024 });
  const projects = JSON.parse(stdout);
  const ref = projectUrl.hostname.split(".")[0];
  const project = Array.isArray(projects) && projects.find((entry) => entry.id === ref);
  record(project ? "PASS" : "FAIL", "Supabase CLI access", project ? `Configured project accessible; region ${project.region}` : "Configured project not found in accessible projects");
} catch {
  record("FAIL", "Supabase CLI access", "Could not list projects; check CLI login and account access");
}

const fetchWithTimeout = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
try {
  const response = await fetchWithTimeout(new URL("/auth/v1/settings", projectUrl), { headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY } });
  if (!response.ok) throw new Error();
  const settings = await response.json();
  record("PASS", "Auth/publishable key", "Auth settings endpoint reachable");
  record(settings.disable_signup === true ? "PASS" : "WARN", "Employee registration", settings.disable_signup === true ? "Public signup disabled" : "Public signup appears enabled; disable before production");
  record(settings.external?.email === true ? "PASS" : "WARN", "Email/password provider", settings.external?.email === true ? "Enabled" : "Check provider configuration");
} catch {
  record("FAIL", "Auth/publishable key", "Auth settings request failed");
}

try {
  const response = await fetchWithTimeout(new URL("/auth/v1/.well-known/jwks.json", projectUrl));
  const jwks = response.ok ? await response.json() : null;
  record(jwks && Array.isArray(jwks.keys) ? jwks.keys.length ? "PASS" : "WARN" : "FAIL", "JWKS endpoint", jwks?.keys?.length ? "Signing keys published" : "No published keys; verify signing configuration during Auth implementation");
} catch {
  record("FAIL", "JWKS endpoint", "Request failed");
}

const client = createClient(projectUrl.href, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: fetchWithTimeout }
});
try {
  const { error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) throw error;
  record("PASS", "Secret key / Auth admin", "Read-only administrator request accepted; no identities printed");
} catch (error) {
  record("FAIL", "Secret key / Auth admin", safeError(error));
}
try {
  const { data, error } = await client.storage.listBuckets();
  if (error) throw error;
  record("PASS", "Storage API", "Bucket listing accepted");
  for (const [name, expectedPublic] of [["erp-documents", false], ["website-media", true], ["erp-opening-sources", false]]) {
    const bucket = data.find((entry) => entry.name === name);
    record(!bucket ? "WARN" : bucket.public === expectedPublic ? "PASS" : "FAIL", `Storage ${name}`, !bucket ? "Not created yet; foundation setup can create it" : bucket.public === expectedPublic ? "Visibility correct; this read-only check does not certify domain file authorization" : "Incorrect bucket visibility");
  }
} catch (error) {
  record("FAIL", "Storage API", safeError(error));
}

const runtimeName = process.env.DATABASE_RUNTIME_URL ? "DATABASE_RUNTIME_URL" : "DATABASE_URL";
for (const name of [runtimeName, "DATABASE_MIGRATION_URL"]) {
  let connection;
  try {
    const url = new URL(process.env[name]);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hash || !url.password) throw new Error();
    connection = connectDatabase(url.href);
    await connection.db.transaction(async (tx) => {
      await tx.execute(sql`select 1 as connected`);
    }, { accessMode: "read only" });
    record("PASS", name, `TLS connection and read-only transaction succeeded on port ${url.port || "5432"}`);
    if (name === runtimeName) record(isRestrictedRuntime(await databasePrivileges(connection)) ? "PASS" : "FAIL", "Runtime privileges", "Requires non-owner, no DDL/bypass-RLS/Auth/Storage access and RLS on every private table");
    if (name === runtimeName) {
      const ledger = await connection.client.query("select to_regclass('erp_private.ledger_configurations') as name");
      if (!ledger.rows[0]?.name) record("FAIL", "General Ledger", "Apply the reviewed approval/ledger migrations before running the updated backend");
      else {
        const active = await connection.client.query("select count(*)::int count from erp_private.ledger_configurations where state='Approved'");
        const strict = process.env.NODE_ENV === "production" || process.env.ERP_REQUIRE_LEDGER_CONFIGURATION === "true";
        record(active.rows[0].count === 1 ? "PASS" : strict ? "FAIL" : "WARN", "General Ledger", active.rows[0].count === 1 ? "Approved mapping exists; independent opening/source reconciliation is still a separate acceptance gate" : "No approved company chart/cutover mapping; production operational posting will fail closed");
      }
    }
  } catch (error) {
    record("FAIL", name, safeError(error));
  } finally {
    if (connection) await connection.client.end();
  }
}

const failed = results.filter((result) => result.status === "FAIL").length;
const warnings = results.filter((result) => result.status === "WARN").length;
console.log(`\nRead-only readiness checks: ${failed} failures, ${warnings} warnings. No remote records, users, buckets or settings changed.`);
process.exitCode = failed ? 1 : 0;
