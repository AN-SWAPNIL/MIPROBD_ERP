import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { resolveBackendMode } from "../server/runtime-mode.js";

const root = new URL("../", import.meta.url);
const json = async (path: string) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const config = await json("vercel.json");
assert.deepEqual(config.git.deploymentEnabled, { main: true, dev: true, "*": false });
assert.ok(!execFileSync("git", ["ls-files", "server/mock-app.ts", "server/data.ts"], { encoding: "utf8" }).trim(), "Mock API and fixture modules belong on prototype, not real backend branches");
assert.match(await readFile(new URL("src/lib/runtime.ts", root), "utf8"), /foundationMode = true/, "Real backend builds must never fall back to the mock UI");
const rootTypes = await json("tsconfig.json");
assert.equal(rootTypes.compilerOptions.target,"ES2022","The separate Vercel API compiler must support the deployed Node runtime");
assert.equal(rootTypes.compilerOptions.strict,true,"Vercel API compilation must keep strict DTO inference");
assert.equal(rootTypes.compilerOptions.moduleResolution,"NodeNext");
const ignored=await readFile(new URL(".vercelignore",root),"utf8");
for(const path of[".env",".env.*","/artifacts","/files"])assert.ok(ignored.split(/\r?\n/).includes(path),`${path} must not be uploaded`);
assert.ok(!ignored.split(/\r?\n/).includes("files"),"Client source exclusions must be root-anchored, not exclude src/lib/files");
assert.deepEqual(config.rewrites[0], { source: "/api/:path*", destination: "/api?path=:path*" }, "API rewrite must precede SPA fallback");
assert.equal(config.rewrites.at(-1).destination, "/index.html");
const headers = new Map<string, string>(config.headers.find((r: { source: string }) => r.source === "/(.*)").headers.map((h: { key: string; value: string }) => [h.key, h.value]));
assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
assert.equal(headers.get("X-Frame-Options"), "DENY");
const csp = headers.get("Content-Security-Policy") ?? "";
const directives = new Map(csp.split(";").filter((d) => d.trim()).map((d) => { const [name, ...values] = d.trim().split(/\s+/); return [name, values]; }));
assert.deepEqual(directives.get("script-src"), ["'self'"]);
assert.deepEqual(directives.get("object-src"), ["'none'"]);
assert.deepEqual(directives.get("frame-ancestors"), ["'none'"]);
assert.ok(directives.get("frame-src")?.includes("blob:"), "Private PDF blob previews must remain usable");
for (const path of ["/api/:path*", "/backend/:path*", "/app/:path*"]) {
  const rule = config.headers.find((r: { source: string }) => r.source === path);
  assert.ok(rule?.headers.some((h: { key: string; value: string }) => h.key === "Cache-Control" && h.value.includes("no-store")), `${path} cannot cache ERP data`);
}
console.log("PASS: API routing, production security headers and private document preview policy");

const sample = parseEnv(await readFile(new URL(".env.example", root), "utf8"));
assert.ok(Object.keys(sample).every((key) => !/^VITE_.*(?:SECRET|PASSWORD|DATABASE|SERVICE_ROLE)/i.test(key)), "Browser configuration must not contain server secrets");
const tracked = execFileSync("git", ["ls-files", "--cached", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
assert.ok(!tracked.some((path) => /(^|\/)\.env($|\.(?!example$|sample$))/.test(path) || path.startsWith("artifacts/") || path.endsWith(".backup")), "Private credentials, backups and test artifacts must stay untracked");
assert.equal(resolveBackendMode({ NODE_ENV: "production", ERP_BACKEND_MODE: "foundation", VITE_BACKEND_MODE: "foundation", DEMO_MODE: "false", VITE_DEMO_MODE: "false" }), "foundation");
assert.throws(() => resolveBackendMode({ NODE_ENV: "production", ERP_BACKEND_MODE: "mock" }));
console.log("PASS: production mode isolation and credential/artifact hygiene");
const workbookReader=await readFile(new URL("server/opening/excel-reader.ts",root),"utf8");
assert.match(workbookReader,/from "exceljs\/dist\/exceljs\.bare\.js"/,"The buffer-only XLSX runtime must use a statically traceable dependency import");

const journal = await json("database/migrations/meta/_journal.json");
assert.equal(new Set(journal.entries.map((entry: { tag: string }) => entry.tag)).size, journal.entries.length);
for (const [index, entry] of journal.entries.entries()) {
  assert.equal(entry.idx, index, "Migration indexes must remain sequential");
  assert.ok((await readFile(new URL(`database/migrations/${entry.tag}.sql`, root), "utf8")).trim());
}
const pkg = await json("package.json"); const lock = await json("package-lock.json");
assert.deepEqual(pkg.dependencies, lock.packages[""].dependencies);
assert.deepEqual(pkg.devDependencies, lock.packages[""].devDependencies);
for (const script of ["lint", "test", "build", "typecheck:api", "check:release", "test:security-backend"]) assert.ok(pkg.scripts[script]);
console.log(`PASS: ${journal.entries.length} ordered migrations, lockfile and CI commands (no network or credentials required)`);
