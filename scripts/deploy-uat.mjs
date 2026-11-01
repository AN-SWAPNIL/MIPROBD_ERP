import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { run } from "./uat-vercel.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
if (!process.argv.includes("--apply")) throw new Error("Use --apply to deploy only the authorized mipro UAT snapshot.");
const target = JSON.parse(await readFile(resolve(root, "artifacts/private/uat-vercel.json"), "utf8"));
const release = JSON.parse(await readFile(resolve(root, "artifacts/private/uat-release.json"), "utf8"));
if (target.projectName !== "mipro-erp" || target.supabaseProjectRef !== "njbecypawzsuqiteooly" || release.projectId !== target.projectId || release.origin !== target.origin) throw new Error("UAT snapshot/target mismatch.");
const directory = resolve(root, release.directory), child = relative(resolve(root, "artifacts/releases"), directory);
if (!child || isAbsolute(child) || child === ".." || child.startsWith(`..${sep}`)) throw new Error("Invalid release directory.");
if (createHash("sha256").update(JSON.stringify(release.files)).digest("hex") !== release.sourceHash) throw new Error("Release manifest was altered.");
for (const file of release.files) {
  const path = resolve(directory, file.path), within = relative(directory, path);
  if (isAbsolute(within) || within.startsWith(`..${sep}`) || createHash("sha256").update(await readFile(path)).digest("hex") !== file.sha256) throw new Error("Release source no longer matches its manifest.");
}
const current = JSON.parse(run(["api", `/v9/projects/${target.projectId}`, "--raw"]));
if (current.name !== "mipro-erp" || current.accountId !== target.orgId) throw new Error("Unexpected deployment target.");
const output = run(["deploy", directory, "--project", target.projectId, "--prod", "--yes", "--no-wait", "--format=json", "--meta", `sourceHash=${release.sourceHash}`, "--meta", "releasePurpose=isolated-client-uat"]);
const response = JSON.parse(output.slice(output.indexOf("{")));
const deployment = response.deployment ?? response;
const result = { createdAt: new Date().toISOString(), project: "mipro-erp", projectId: target.projectId, origin: target.origin, sourceHash: release.sourceHash, releaseDirectory: release.directory, deploymentId: deployment.id ?? deployment.deploymentId ?? null, deploymentUrl: deployment.url ?? response.url ?? null, ready: false, existingProjectsUnchanged: true };
await writeFile(resolve(root, "artifacts/private/uat-deployment.json"), JSON.stringify(result, null, 2), { mode: 0o600 });
console.log(JSON.stringify(result));
