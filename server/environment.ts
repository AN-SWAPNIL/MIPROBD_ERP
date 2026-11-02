import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve, sep } from "node:path";

export function selectedEnvironmentFile(env: NodeJS.ProcessEnv = process.env) {
  if (!env.ERP_ENV_FILE) return undefined;
  if (env.VERCEL) throw new Error("Hosted deployments use platform variables, not local credential files.");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const privateRoot = resolve(root, "artifacts/private");
  const path = resolve(root, env.ERP_ENV_FILE);
  const child = relative(privateRoot, path);
  if (!child || isAbsolute(child) || child === ".." || child.startsWith(`..${sep}`) || !path.endsWith(".env")) throw new Error("ERP_ENV_FILE must select a private environment file under artifacts/private.");
  return path;
}

export function loadSelectedEnvironment(env: NodeJS.ProcessEnv = process.env, load: typeof loadEnvFile = loadEnvFile) {
  const path = selectedEnvironmentFile(env);
  if (path) load(path);
}
