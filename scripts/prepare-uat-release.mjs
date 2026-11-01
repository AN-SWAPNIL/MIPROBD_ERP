import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, realpath, copyFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./uat-vercel.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = JSON.parse(await readFile(join(root, "artifacts/private/uat-vercel.json"), "utf8"));
if (target.projectName !== "mipro-erp" || target.orgId !== "team_XcSqmZo5GN5zap9crIA0zEil" || target.supabaseProjectRef !== "njbecypawzsuqiteooly" || !target.origin?.startsWith("https://mipro")) throw new Error("UAT release target mismatch.");
const rootLink = await readFile(join(root, ".vercel/project.json"), "utf8");
const project = JSON.parse(run(["api", `/v9/projects/${target.projectId}`, "--raw"]));
if (project.id !== target.projectId || project.name !== target.projectName || project.accountId !== target.orgId) throw new Error("Authorized Vercel target was not verified.");
const output = run(["deploy", "--dry", "--format=json", "--project", target.projectId]);
const payload = JSON.parse(output.slice(output.indexOf("{"))), files = payload.files ?? payload.included ?? [];
if (!files.length) throw new Error("No source manifest returned; nothing copied or deployed.");
const paths = [];
for (const entry of files) {
  const path = String(entry.path ?? entry).replaceAll("\\", "/");
  if (isAbsolute(path) || path.split("/").includes("..")) throw new Error("Unsafe manifest path.");
  if ((await stat(resolve(root, path))).isDirectory()) continue;
  paths.push(path);
}
paths.sort();
for (const path of paths) if (isAbsolute(path) || path.split("/").includes("..") || /^(artifacts|files|\.git|\.vercel|\.supabase|\.aws|\.codex|\.agents|node_modules|dist)(\/|$)/i.test(path) || /(^|\/)\.env(?:$|\.(?!example$|sample$))/i.test(path) || /\.(?:backup|pem|log)$/i.test(path)) throw new Error(`Private or unsafe source path detected; upload is blocked: ${path}`);
for (const path of ["api/index.ts", "server/index.ts", "src/lib/files/attachments.ts", "config/environments.json", "scripts/check-deployment-profile.mjs", "scripts/environment-profile.mjs", "package.json", "package-lock.json", "vercel.json"]) if (!paths.includes(path)) throw new Error(`Missing deployment input ${path}`);
const destination = resolve(root, `artifacts/releases/uat-${Date.now()}`); await mkdir(destination, { recursive: true });
const manifest = [];
for (const path of paths) {
  const source = await realpath(resolve(root, path)), child = relative(root, source);
  if (isAbsolute(child) || child.startsWith(`..${sep}`) || !(await stat(source)).isFile()) throw new Error("Source path escaped the verified workspace.");
  const bytes = await readFile(source), sha256 = createHash("sha256").update(bytes).digest("hex");
  const to = resolve(destination, path); await mkdir(dirname(to), { recursive: true }); await copyFile(source, to);
  manifest.push({ path, sha256, sizeBytes: bytes.length });
}
await mkdir(join(destination, ".vercel"), { recursive: true });
await writeFile(join(destination, ".vercel/project.json"), JSON.stringify({ projectId: target.projectId, projectName: target.projectName, orgId: target.orgId }));
const sourceHash = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
const release = { format: "mipro-uat-release-v1", project: target.projectName, projectId: target.projectId, origin: target.origin, sourceHash, fileCount: manifest.length, files: manifest, baseCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), workingTreeSnapshot: true, createdAt: new Date().toISOString(), directory: relative(root, destination).replaceAll("\\", "/"), deployed: false };
await writeFile(join(root, "artifacts/private/uat-release.json"), JSON.stringify(release, null, 2), { mode: 0o600 });
if ((await readFile(join(root, ".vercel/project.json"), "utf8")) !== rootLink) throw new Error("Root project link changed unexpectedly.");
console.log(JSON.stringify({ prepared: true, project: target.projectName, origin: target.origin, sourceHash, fileCount: manifest.length, directory: release.directory, privateFilesIncluded: 0, rootProjectLinkChanged: false, deployed: false }));
