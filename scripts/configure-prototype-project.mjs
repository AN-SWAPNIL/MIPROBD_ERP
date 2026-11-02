import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { environments } from "./environment-profile.mjs";
import { run } from "./uat-vercel.mjs";

const name = "mipro-erp-prototype";
const metadata = new URL("../artifacts/private/branch-deployments/prototype-project.json", import.meta.url);
const repository = JSON.parse(execFileSync("gh", ["api", `repositories/${environments.repositoryId}`], { encoding: "utf8" }));
if (repository.full_name !== environments.repository) throw new Error("GitHub repository identity/label mismatch; stopped.");
const projects = JSON.parse(run(["api", "/v9/projects?limit=100", "--raw"])).projects;
let saved;
try { saved = JSON.parse(await readFile(metadata, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
let project = projects.find(candidate => candidate.name === name);
if (project && project.id !== environments.profiles.prototype.projectId && project.id !== saved?.projectId) throw new Error("An unrecognized existing prototype project must be reviewed before configuration.");
const apply = process.argv.includes("--apply");
if (apply) {
  if (!project) {
    project = JSON.parse(run(["api", "/v11/projects", "--method", "POST", "--input", "-", "--raw"], JSON.stringify({
      name, framework: "vite", buildCommand: "npm run build", installCommand: "npm ci", outputDirectory: "dist"
    })));
    if (project.name !== name || project.accountId !== environments.teamId) throw new Error("Created project identity mismatch.");
    await mkdir(new URL("./", metadata), { recursive: true });
    await writeFile(metadata, JSON.stringify({ projectId: project.id, name, teamId: project.accountId, createdAt: new Date().toISOString() }, null, 2), { flag: "wx", mode: 0o600 });
  }
  if (project.accountId !== environments.teamId) throw new Error("Unexpected project owner; stopped.");
  run(["api", `/v9/projects/${project.id}`, "--method", "PATCH", "--input", "-", "--raw"], JSON.stringify({ nodeVersion: "24.x", commandForIgnoringBuildStep: "node -e \"process.exit(process.env.VERCEL_GIT_COMMIT_REF==='prototype'?1:0)\"", previewDeploymentsDisabled: true, autoExposeSystemEnvs: true }));
  const existing = JSON.parse(run(["api", `/v9/projects/${project.id}/env`, "--raw"])).envs;
  if (existing.some(variable => /SUPABASE|DATABASE|CRON_SECRET|SMTP_|SUPER_ADMIN/.test(variable.key))) throw new Error("Real backend credentials found; refusing to enable a public demo.");
  const values = { ERP_BACKEND_MODE: "mock", VITE_BACKEND_MODE: "mock", DEMO_MODE: "true", VITE_DEMO_MODE: "true", DEMO_DEPLOYMENT: "true" };
  for (const [key, value] of Object.entries(values)) {
    const result = JSON.parse(run(["api", `/v10/projects/${project.id}/env?upsert=true`, "--method", "POST", "--input", "-", "--raw"], JSON.stringify({ key, value, type: "plain", target: ["production"] })));
    if (result.failed?.length) throw new Error(`Prototype variable ${key} failed.`);
  }
}
console.log(JSON.stringify({ applied: apply, project: project?.name ?? name, projectId: project?.id ?? null, realCredentialsUploaded: false, deployed: false }, null, 2));
