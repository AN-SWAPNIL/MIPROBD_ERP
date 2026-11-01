import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";

const root = new URL("../", import.meta.url);
const organization = "odyueakwbzolakluinup", name = "mipro-erp-uat";
const credentials = new URL("artifacts/private/uat.env", root);
const cli = new URL("node_modules/supabase/dist/supabase.js", root);
const apply = process.argv.includes("--apply");
function run(args) {
  try { return execFileSync(process.execPath, [cli.pathname.replace(/^\/(\w:)/, "$1"), ...args], { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 180000 }); }
  catch {
    throw new Error("Supabase command failed; review CLI access or project limits. No paid upgrade, reset or deletion was attempted; provider output is withheld because command errors can contain credentials.");
  }
}
function list() {
  const result = JSON.parse(run(["projects", "list", "--output", "json"]));
  if (!Array.isArray(result)) throw new Error("Unexpected project-list format; no project changes attempted.");
  return result.filter(p => (p.organization_id ?? p.organizationId) === organization);
}
async function main() {
  const projects = list(); const matching = projects.filter(p => p.name === name);
  if (matching.length > 1) throw new Error("Ambiguous UAT project identity; review required.");
  let project = matching[0];
  if (!apply) { console.log(JSON.stringify({ dryRun: true, organization, projectName: name, existingProjectRef: project?.id ?? null, developmentPreserved: true, credentialsFile: "artifacts/private/uat.env" })); return; }
  await mkdir(new URL("artifacts/private/", root), { recursive: true });
  let values;
  try { values = parseEnv(await readFile(credentials, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!values) {
    if (project) throw new Error("Existing UAT project has no saved local credential; refusing to reset its password.");
    values = { UAT_DATABASE_PASSWORD: randomBytes(40).toString("base64url") };
    await writeFile(credentials, `# Private UAT setup. Never commit or paste these values.\nUAT_DATABASE_PASSWORD=${values.UAT_DATABASE_PASSWORD}\n`, { flag: "wx", mode: 0o600 });
  }
  if (!values.UAT_DATABASE_PASSWORD) throw new Error("Saved UAT database password is missing; no reset attempted.");
  if (!project) {
    // The official CLI accepts this credential only as a flag. Capture all output;
    // never interpolate it into shell text, logs, provider errors or chat.
    run(["projects", "create", name, "--org-id", organization, "--region", "ap-south-1", `--db-password=${values.UAT_DATABASE_PASSWORD}`, "--output", "json"]);
    project = list().find(p => p.name === name);
    if (!project) throw new Error("Create returned without an identifiable project; inspect Supabase before retrying.");
  }
  if (!/^[a-z]{20}$/.test(project.id) || project.id === "hyttuapvvqqxcyhojbwq") throw new Error("Unsafe UAT project identity.");
  await writeFile(new URL("artifacts/private/uat-project.json", root), JSON.stringify({ projectRef: project.id, organizationId: organization, name, region: project.region, status: project.status, createdAt: new Date().toISOString(), purpose: "Isolated client UAT; never import development transactions" }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ projectName: name, projectRef: project.id, status: project.status, region: project.region, credentialsFile: "artifacts/private/uat.env", developmentPreserved: true, migrated: false, deployed: false }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
