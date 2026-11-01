import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const origin = "http://localhost:5178";
const folder = resolve("artifacts/private"); const fileName = `dev-access-probe-${randomUUID()}.txt`; const file = resolve(folder, fileName);
assert.ok(file.startsWith(folder + (process.platform === "win32" ? "\\" : "/")));
await mkdir(folder, { recursive: true }); await writeFile(file, "DEV TEST file-access sentinel. No credentials or company information.\n", { flag: "wx", mode: 0o600 });
try {
const absolute = file.replaceAll("\\", "/");
for (const path of [`/artifacts/private/${fileName}`, `/ARTIFACTS/private/${fileName}`, `/@fs/${absolute}`, `/artifacts/private/${fileName}?raw`, `/artifacts/private/${fileName}?import`, `/artifacts/private/${fileName}?import&raw`, `/artifacts%2Fprivate/${fileName}`, "/server/config.ts", "/database/schema.ts", "/files/Stock,%20Delivery,%20Due%20list.xlsx"]) {
  const response = await fetch(`${origin}${path}`, { method: path.includes(fileName) ? "GET" : "HEAD", signal: AbortSignal.timeout(15000) });
  await response.body?.cancel();
  assert.ok([403, 404].includes(response.status), `Private development path must not be served: ${path} (${response.status})`);
}
for (const path of ["/", "/mipro-logo.png", "/api/health", "/src/lib/files/attachments.ts"]) {
  const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(60000) }); await response.body?.cancel(); assert.equal(response.status, 200, `Published path remains available: ${path}`);
}
console.log("PASS: private development files are denied, including Windows case variants and @fs paths; published assets and API health remain available. No private file bodies were inspected.");
} finally { await unlink(file); }
