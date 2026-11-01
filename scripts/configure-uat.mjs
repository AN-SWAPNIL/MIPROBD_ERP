import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = new URL("../", import.meta.url), directory = new URL("artifacts/uat-cli/", root);
const metadata = JSON.parse(await readFile(new URL("artifacts/private/uat-project.json", root), "utf8"));
const path = new URL("artifacts/private/uat.env", root), saved = parseEnv(await readFile(path, "utf8"));
const ref = metadata.projectRef;
if (metadata.name !== "mipro-erp-uat" || metadata.organizationId !== "odyueakwbzolakluinup" || !/^[a-z]{20}$/.test(ref) || ref === "hyttuapvvqqxcyhojbwq") throw new Error("Unsafe UAT identity; stopped before provider changes.");
if (!process.argv.includes("--apply")) throw new Error("Use --apply for the newly authorized UAT project only.");
const cli = fileURLToPath(new URL("node_modules/supabase/dist/supabase.js", root));
function run(args) {
  try { return execFileSync(process.execPath, [cli, ...args, "--workdir", fileURLToPath(directory)], { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 120000 }); }
  catch { throw new Error("UAT CLI configuration failed; provider output and credentials withheld. Existing development settings are unchanged."); }
}
try {
  const projects = JSON.parse(run(["projects", "list", "--output", "json"]));
  if (!projects.some(p => p.id === ref && p.name === metadata.name && p.organization_id === metadata.organizationId)) throw new Error("UAT account/project verification failed.");
  run(["link", "--project-ref", ref, `--password=${saved.UAT_DATABASE_PASSWORD}`, "--yes"]);
  const pooler = new URL((await readFile(new URL("supabase/.temp/pooler-url", directory), "utf8")).trim());
  if (!pooler.hostname.endsWith(".pooler.supabase.com") || decodeURIComponent(pooler.username) !== `postgres.${ref}`) throw new Error("Unexpected UAT pooler; review required.");
  pooler.password = saved.UAT_DATABASE_PASSWORD; pooler.port = "5432"; const migration = pooler.toString(); pooler.port = "6543";
  const keys = JSON.parse(run(["projects", "api-keys", "--project-ref", ref, "--reveal", "--output", "json"]));
  if (!Array.isArray(keys)) throw new Error("Unexpected UAT API key format.");
  const publicKey = keys.find(k => k.type === "publishable") ?? keys.find(k => k.name === "anon");
  const secretKey = keys.find(k => k.type === "secret") ?? keys.find(k => k.name === "service_role");
  const publishable = publicKey?.api_key ?? publicKey?.key, secret = secretKey?.api_key ?? secretKey?.key;
  if (!publishable || !secret || publishable === secret || secret.includes("...")) throw new Error("Complete UAT server and public keys are required.");
  const values = {
    ...saved, ERP_BACKEND_MODE: "foundation", VITE_BACKEND_MODE: "foundation", DEMO_MODE: "false", VITE_DEMO_MODE: "false", VITE_API_BASE_URL: "",
    DATABASE_URL: pooler.toString(), DATABASE_MIGRATION_URL: migration,
    SUPABASE_URL: `https://${ref}.supabase.co`, SUPABASE_PUBLISHABLE_KEY: publishable, SUPABASE_SECRET_KEY: secret,
    SUPABASE_JWKS_URL: `https://${ref}.supabase.co/auth/v1/.well-known/jwks.json`,
    VITE_SUPABASE_URL: `https://${ref}.supabase.co`, VITE_SUPABASE_PUBLISHABLE_KEY: publishable,
    APP_URL: "http://localhost:5180", BACKEND_WEB_PORT: "5180", BACKEND_API_PORT: "4180",
    ERP_ENV_FILE: "artifacts/private/uat.env", ERP_RUNTIME_ENV_FILE: "artifacts/private/uat-runtime.env", ERP_BOOTSTRAP_DIR: "artifacts/private/uat-owner",
    ERP_REQUIRE_MFA: "true", ERP_REQUIRE_RESTRICTED_DB: "true", ERP_REQUIRE_LEDGER_CONFIGURATION: "true",
    SUPER_ADMIN_NAME: "Ahmmad Nur Swapnil", SUPER_ADMIN_EMAIL: "a.n.swapnilextra1@gmail.com",
  };
  await writeFile(path, "# Private isolated UAT only. Never commit or paste these values.\n" + Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 });
  run(["config", "push", "--project-ref", ref, "--yes"]);
  const diff = JSON.parse(run(["config", "diff", "--project-ref", ref, "--output-format", "json"]));
  if (diff.changes.some(c => c.declared)) throw new Error("UAT Auth settings did not converge.");
  console.log(JSON.stringify({ configured: true, projectRef: ref, credentialsFile: "artifacts/private/uat.env", localOrigin: values.APP_URL, publicSignup: false, passwordMinimum: 12, smtpCopied: false, developmentPreserved: true, deployed: false }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
