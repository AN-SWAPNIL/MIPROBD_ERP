import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function privateArtifactPath(value: string | undefined, fallback: string, directory = false) {
  const workspace = fileURLToPath(new URL("../", import.meta.url));
  const boundary = resolve(workspace, "artifacts/private"), target = resolve(workspace, value ?? fallback);
  const child = relative(boundary, target);
  if (isAbsolute(child) || child === ".." || child.startsWith(`..${sep}`) || !directory && !child) throw new Error("Private artifact paths must stay within artifacts/private.");
  return pathToFileURL(target + (directory ? sep : ""));
}
