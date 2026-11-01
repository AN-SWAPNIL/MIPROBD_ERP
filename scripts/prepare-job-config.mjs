import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// This creates local deployment configuration only; it neither deploys nor sends mail.
const root = new URL("../", import.meta.url);
const link = JSON.parse(await readFile(new URL(".vercel/project.json", root), "utf8"));
if (!link.projectName || link.projectName === "medical-supplier-erp") throw new Error("Link the intended isolated staging/production project first; the old public demo is not a job target");
const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8" });
if (dirty.trim()) throw new Error("Review and commit the release before preparing its scheduled deployment configuration");
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const config = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));
config.crons = [{ path: "/api/jobs/invitations", schedule: "*/5 * * * *" }, { path: "/api/jobs/health", schedule: "*/15 * * * *" }];
const directory = new URL("artifacts/release/", root);
await mkdir(directory, { recursive: true });
await writeFile(new URL("vercel-jobs.json", directory), JSON.stringify(config, null, 2) + "\n");
await writeFile(new URL("jobs-release.json", directory), JSON.stringify({ commit, project: link.projectName, projectId: link.projectId, generatedAt: new Date().toISOString(), deployed: false }, null, 2) + "\n");
console.log(JSON.stringify({ prepared: true, commit, project: link.projectName, config: "artifacts/release/vercel-jobs.json", deployed: false, requires: ["Same-environment CRON_SECRET of at least 32 characters", "ERP_SCHEDULED_JOBS_ENABLED=true", "Plan supporting these schedules", "Explicit matching-project deployment and real scheduler/monitor acceptance"] }));
