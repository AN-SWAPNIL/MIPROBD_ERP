import { execFileSync, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { environments, profileForBranch, validateProfile } from "./environment-profile.mjs";

const root = new URL("../", import.meta.url);
const branch = execFileSync("git", ["branch", "--show-current"], { cwd: root, encoding: "utf8" }).trim();
const args = process.argv.slice(2);
const requested = args[0] && !args[0].startsWith("--") ? args.shift() : undefined;
const selected = requested ? [requested, environments.profiles[requested]] : profileForBranch(branch);
if (!selected?.[1] || selected[1].mode !== "foundation") throw new Error("Use dev/main for the real ERP, or explicitly select staging/uat on a feature branch. The prototype has its own checkout.");
const [name, profile] = selected;
if (["dev", "main", "prototype"].includes(branch) && branch !== profile.branch) throw new Error(`Branch ${branch} cannot run ${name}. Switch to ${profile.branch} first.`);
const values = parseEnv(await readFile(new URL(profile.envFile, root), "utf8"));
const runtime = parseEnv(await readFile(new URL(profile.runtimeFile, root), "utf8"));
const env = { ...values, ...runtime, ERP_ENV_FILE: profile.envFile, ERP_RUNTIME_ENV_FILE: profile.runtimeFile, BACKEND_WEB_PORT: String(profile.webPort), BACKEND_API_PORT: String(profile.apiPort) };
validateProfile(profile, env);
console.log(`${name}: ${branch} -> ${profile.supabaseRef}; localhost:${profile.webPort}. Credentials withheld.`);
if (!args.includes("--check")) {
  const toolIndex = args.indexOf("--tool");
  const tool = toolIndex < 0 ? undefined : args[toolIndex + 1];
  const allowedTools = new Set(["scripts/database.ts", "scripts/migration-integrity.ts", "scripts/runtime-database.ts", "scripts/backend-bootstrap.ts", "scripts/storage-backup.ts", "scripts/verify-backups.ts", "scripts/backend-readiness.mjs", "scripts/opening-profile.ts", "scripts/opening-storage.ts", "scripts/invitation-worker.ts"]);
  if (toolIndex >= 0 && !allowedTools.has(tool)) throw new Error("Unsupported environment-scoped tool.");
  const command = tool ? ["--import", "tsx", fileURLToPath(new URL(tool, root)), ...args.slice(toolIndex + 2)] : [fileURLToPath(new URL("scripts/backend-dev.mjs", root))];
  const child = spawn(process.execPath, command, { cwd: root, env: { ...process.env, ...env }, stdio: "inherit" });
  child.on("error", () => { console.error("Environment process could not start."); process.exitCode = 1; });
  child.on("exit", (code) => { process.exitCode = code ?? 1; });
}
