import { spawn } from "node:child_process";
import { createServer } from "vite";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve, sep } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const privateRoot = resolve(root, "artifacts/private");
const runtimePath = resolve(root, process.env.ERP_RUNTIME_ENV_FILE ?? "artifacts/private/runtime-database.env");
const child = relative(privateRoot, runtimePath);
if (!child || isAbsolute(child) || child === ".." || child.startsWith(`..${sep}`)) throw new Error("Runtime credential file must stay under artifacts/private.");
const runtimeCredentials = runtimePath;
if (existsSync(runtimeCredentials)) loadEnvFile(runtimeCredentials);

const port = Number(process.env.BACKEND_WEB_PORT ?? 5178);
const apiPort = Number(process.env.BACKEND_API_PORT ?? 4178);
process.env.VITE_BACKEND_MODE = "foundation";
process.env.VITE_DEMO_MODE = "false";
const env = { ...process.env, ERP_BACKEND_MODE: "foundation", DEMO_MODE: "false", VITE_DEMO_MODE: "false", API_PORT: String(apiPort), APP_URL: `http://localhost:${port}` };
const api = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], { env, stdio: "inherit" });
const web = await createServer({ cacheDir: `node_modules/.vite-backend-${port}`, server: { host: "localhost", port, strictPort: true, proxy: { "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true } } } });
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  await web.close();
  api.kill();
  process.exitCode = code;
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
api.on("error", () => void stop(1));
api.on("exit", (code) => { if (!stopping) void stop(code ?? 1); });
try {
  await web.listen();
  console.log(`Foundation workspace: http://localhost:${port}/login`);
  console.log("Configure APP_URL and the Supabase Auth redirect allowlist to this origin before accepting invitations.");
} catch (error) {
  await stop(1);
  throw error;
}
