import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { environments, matchesLinkedRepository } from "./environment-profile.mjs";
import { run } from "./uat-vercel.mjs";

const apply = process.argv.includes("--apply");
if (apply) {
  const remote = execFileSync("git", ["ls-remote", "--heads", "origin", "prototype", "dev", "main"], { encoding: "utf8" });
  for (const profile of Object.values(environments.profiles)) if (!remote.includes(`refs/heads/${profile.branch}`)) throw new Error(`Push branch ${profile.branch} before linking projects. No settings changed.`);
}
const records = [];
for (const profile of Object.values(environments.profiles)) {
  let project = JSON.parse(run(["api", `/v9/projects/${profile.projectId}`, "--raw"]));
  if (project.id !== profile.projectId || project.name !== profile.project || project.accountId !== environments.teamId) throw new Error("Project ownership or target mismatch; stopped.");
  if (project.link && !matchesLinkedRepository(project.link)) throw new Error("Unexpected linked repository identity; refusing to replace it.");
  const envs = JSON.parse(run(["api", `/v9/projects/${profile.projectId}/env`, "--raw"])).envs;
  const prohibited = envs.filter(e => profile.mode === "mock" ? /SUPABASE|DATABASE|CRON_SECRET|SMTP_|SUPER_ADMIN/.test(e.key) : /^(DATABASE_URL|DATABASE_MIGRATION_URL|SUPER_ADMIN_NAME|SUPER_ADMIN_EMAIL)$/.test(e.key));
  if (prohibited.length) throw new Error(`Unexpected privileged configuration on ${profile.project}; manual review required.`);
  const ignoreCommand = `node -e "process.exit(process.env.VERCEL_GIT_COMMIT_REF==='${profile.branch}'?1:0)"`;
  if (apply) {
    const folder = new URL("../artifacts/private/branch-deployments/", import.meta.url);
    await mkdir(folder, { recursive: true });
    await writeFile(new URL(`${profile.project}-${Date.now()}.json`, folder), JSON.stringify({ id: project.id, name: project.name, link: project.link, commandForIgnoringBuildStep: project.commandForIgnoringBuildStep, previewDeploymentsDisabled: project.previewDeploymentsDisabled }, null, 2), { mode: 0o600 });
    // Pause automatic builds while linking; restore only this project's approved branch.
    run(["api", `/v9/projects/${project.id}`, "--method", "PATCH", "--input", "-", "--raw"], JSON.stringify({ commandForIgnoringBuildStep: "exit 0", previewDeploymentsDisabled: true, autoExposeSystemEnvs: true }));
    const [owner, repository] = environments.repository.split("/");
    if (project.link && (project.link.repo !== repository || project.link.org !== owner)) {
      // Reconnect only the already identity-checked repository after a GitHub rename.
      run(["api", `/v9/projects/${project.id}/link`, "--method", "DELETE", "--dangerously-skip-permissions", "--raw"]);
      project.link = undefined;
    }
    if (!project.link) run(["api", `/v9/projects/${project.id}/link`, "--method", "POST", "--input", "-", "--raw"], JSON.stringify({ type: "github", repo: environments.repository }));
    run(["api", `/v9/projects/${project.id}/branch`, "--method", "PATCH", "--input", "-", "--raw"], JSON.stringify({ branch: profile.branch }));
    run(["api", `/v9/projects/${project.id}`, "--method", "PATCH", "--input", "-", "--raw"], JSON.stringify({ commandForIgnoringBuildStep: ignoreCommand, previewDeploymentsDisabled: true }));
    project = JSON.parse(run(["api", `/v9/projects/${project.id}`, "--raw"]));
    if (!matchesLinkedRepository(project.link) || project.link.productionBranch !== profile.branch || project.commandForIgnoringBuildStep !== ignoreCommand || !project.previewDeploymentsDisabled) throw new Error("Deployment isolation verification failed.");
  }
  records.push({ project: profile.project, branch: project.link?.productionBranch ?? null, expectedBranch: profile.branch, linked: Boolean(project.link), previewsDisabled: project.previewDeploymentsDisabled === true, supabaseRef: profile.supabaseRef });
}
if (apply) await writeFile(new URL("../artifacts/private/branch-deployments/status.json", import.meta.url), JSON.stringify({ verifiedAt: new Date().toISOString(), records }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ applied: apply, records }, null, 2));
