import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";

const root = new URL("../", import.meta.url), scope = "answapnil2003-5154s-projects", team = "team_XcSqmZo5GN5zap9crIA0zEil", name = "mipro-erp";
const metadataPath = new URL("artifacts/private/uat-vercel.json", root);
const command = execFileSync("where.exe", ["vercel.cmd"], { encoding: "utf8" }).trim().split(/\r?\n/)[0];
const cli = join(dirname(command), "node_modules/vercel/dist/index.js");
export function run(args, input) {
  try { return execFileSync(process.execPath, [cli, ...args, "--scope", scope], { cwd: root, input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 120000, maxBuffer: 8 * 1024 * 1024 }); }
  catch { throw new Error(`UAT Vercel ${args[0]} ${args[1]?.split("?")[0] ?? ""} failed; provider output withheld to protect credentials. No other project was targeted.`); }
}
async function main() {
  if (!process.argv.includes("--apply")) throw new Error("Use --apply for the authorized new mipro UAT project only.");
  const uat = JSON.parse(await readFile(new URL("artifacts/private/uat-project.json", root), "utf8"));
  const values = parseEnv(await readFile(new URL("artifacts/private/uat.env", root), "utf8"));
  const runtime = parseEnv(await readFile(new URL("artifacts/private/uat-runtime.env", root), "utf8"));
  if (uat.projectRef !== "njbecypawzsuqiteooly" || values.SUPABASE_URL !== `https://${uat.projectRef}.supabase.co` || decodeURIComponent(new URL(runtime.DATABASE_RUNTIME_URL).username) !== `mipro_runtime.${uat.projectRef}`) throw new Error("UAT credentials/identity mismatch; no provider changes attempted.");
  const projects = JSON.parse(run(["api", "/v9/projects?limit=100", "--raw"])).projects;
  let saved; try { saved = JSON.parse(await readFile(metadataPath, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; }
  let project = projects.find(p => p.name === name);
  if (project && (!saved || saved.projectId !== project.id)) throw new Error("A pre-existing mipro project was found without this UAT record. Refusing to repoint it.");
  if (!project) {
    project = JSON.parse(run(["api", "/v11/projects", "--method", "POST", "--input", "-", "--raw"], JSON.stringify({ name, framework: "vite", buildCommand: "npm run build", installCommand: "npm ci", outputDirectory: "dist" })));
    if (project.name !== name || project.accountId !== team) throw new Error("Created project did not match the authorized target.");
    saved = { projectId: project.id, projectName: name, orgId: team, supabaseProjectRef: uat.projectRef, createdAt: new Date().toISOString(), deployed: false };
    await writeFile(metadataPath, JSON.stringify(saved, null, 2), { flag: "wx", mode: 0o600 });
  }
  let domains = JSON.parse(run(["api", `/v9/projects/${project.id}/domains`, "--raw"])).domains;
  const desired = "mipro-erp.vercel.app";
  if (!domains.some(d => d.name === desired)) {
    try { run(["api", `/v10/projects/${project.id}/domains`, "--method", "POST", "--input", "-", "--raw"], JSON.stringify({ name: desired })); } catch { /* Do not take over or modify a name belonging to someone else. */ }
    domains = JSON.parse(run(["api", `/v9/projects/${project.id}/domains`, "--raw"])).domains;
  }
  const assigned = domains.find(d => d.name === desired) ?? domains.find(d => /^mipro-erp-[a-z0-9-]+\.vercel\.app$/.test(d.name));
  if (!assigned?.verified) throw new Error("No verified Vercel hostname was assigned to this new project. Review before publication.");
  const origin = `https://${assigned.name}`;
  if (!values.CRON_SECRET) {
    values.CRON_SECRET = randomBytes(48).toString("base64url");
    await writeFile(new URL("artifacts/private/uat.env", root), "# Private isolated UAT only. Never commit or paste these values.\n" + Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 });
  }
  const environment = {
    ERP_BACKEND_MODE: "foundation", VITE_BACKEND_MODE: "foundation", DEMO_MODE: "false", VITE_DEMO_MODE: "false", DEMO_DEPLOYMENT: "false", VITE_API_BASE_URL: "", APP_URL: origin,
    ERP_REQUIRE_MFA: "true", ERP_REQUIRE_RESTRICTED_DB: "true", ERP_REQUIRE_LEDGER_CONFIGURATION: "true", ERP_SCHEDULED_JOBS_ENABLED: "true", CRON_SECRET: values.CRON_SECRET,
    DATABASE_RUNTIME_URL: runtime.DATABASE_RUNTIME_URL, SUPABASE_URL: values.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: values.SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY: values.SUPABASE_SECRET_KEY,
    VITE_SUPABASE_URL: values.SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: values.SUPABASE_PUBLISHABLE_KEY,
  };
  run(["api", `/v9/projects/${project.id}`, "--method", "PATCH", "--input", "-", "--raw"], JSON.stringify({ nodeVersion: "24.x", framework: "vite", buildCommand: "npm run build", installCommand: "npm ci", outputDirectory: "dist" }));
  const secretNames = new Set(["DATABASE_RUNTIME_URL", "SUPABASE_SECRET_KEY", "CRON_SECRET"]);
  for (const [key, value] of Object.entries(environment)) {
    if (key === "VITE_API_BASE_URL" && value === "") continue;
    const result = JSON.parse(run(["api", `/v10/projects/${project.id}/env?upsert=true`, "--method", "POST", "--input", "-", "--raw"], JSON.stringify({ key, value, type: secretNames.has(key) ? "sensitive" : "plain", target: ["production"] })));
    if (result.failed?.length) throw new Error(`UAT variable ${key} could not be configured; values withheld.`);
  }
  const plan = JSON.parse(run(["api", `/v2/teams/${team}`, "--raw"])).billing?.plan ?? "unknown";
  const context = new URL("artifacts/uat-vercel/.vercel/", root); await mkdir(context, { recursive: true });
  await writeFile(new URL("project.json", context), JSON.stringify({ projectId: project.id, projectName: name, orgId: team }));
  saved = { ...saved, origin, plan, configuredAt: new Date().toISOString(), productionSecretsUploaded: true, developmentPreserved: true, deployed: false };
  await writeFile(metadataPath, JSON.stringify(saved, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ configured: true, project: name, projectId: project.id, origin, supabaseProjectRef: uat.projectRef, plan, variables: Object.keys(environment), migrationCredentialsUploaded: false, rootProjectLinkChanged: false, deployed: false }));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(error => { console.error(error.message); process.exitCode = 1; });
