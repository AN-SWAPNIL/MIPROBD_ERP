import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
const root = new URL("../", import.meta.url), cli = fileURLToPath(new URL("node_modules/supabase/dist/supabase.js", root));
const target = JSON.parse(await readFile(new URL("artifacts/private/uat-vercel.json", root), "utf8"));
if (!process.argv.includes("--apply") || target.projectName !== "mipro-erp" || target.supabaseProjectRef !== "njbecypawzsuqiteooly" || !/^https:\/\/mipro-erp(?:-[a-z0-9-]+)?\.vercel\.app$/.test(target.origin)) throw new Error("Unsafe UAT Auth target; stopped.");
const workdir = fileURLToPath(new URL("artifacts/uat-cli/", root));
function run(args) { try { return execFileSync(process.execPath, [cli, ...args, "--project-ref", target.supabaseProjectRef, "--workdir", workdir, "--output-format", "json"], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 120000 }); } catch { throw new Error("UAT Auth configuration failed; provider output withheld."); } }
const config = `project_id = "mipro-erp-uat"\n\n[auth]\nsite_url = "${target.origin}"\nadditional_redirect_urls = ["${target.origin}/reset-password", "http://localhost:5180/reset-password"]\nenable_signup = false\nminimum_password_length = 12\n\n[auth.email]\nenable_signup = true\nenable_confirmations = true\n`;
await writeFile(new URL("artifacts/uat-cli/supabase/config.toml", root), config);
const before = JSON.parse(run(["config", "diff"]));
const allowed = new Set(["auth.site_url", "auth.additional_redirect_urls"]);
if (before.changes.some(c => c.declared && !allowed.has(c.path.join(".")))) throw new Error("Unexpected declared Auth change; SMTP/security settings were not changed.");
run(["config", "push", "--yes"]);
const after = JSON.parse(run(["config", "diff"]));
if (after.changes.some(c => c.declared)) throw new Error("UAT Auth redirect verification failed.");
const env = parseEnv(await readFile(new URL("artifacts/private/uat.env", root), "utf8"));
try { execFileSync(process.execPath, ["--import", "tsx", "scripts/backend-bootstrap.ts", "--apply", "--issue-link"], { cwd: root, env: { ...process.env, ...env, APP_URL: target.origin }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180000 }); }
catch { throw new Error("UAT owner link could not be issued; no personal password or MFA was changed."); }
console.log(JSON.stringify({ configured: true, origin: target.origin, publicSignup: false, localhostRedirectRetained: true, smtpChanged: false, ownerSetupFolder: "artifacts/private/uat-owner", emailSent: false, personalPasswordChanged: false, mfaChanged: false }));
