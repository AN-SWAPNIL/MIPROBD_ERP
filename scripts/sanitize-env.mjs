import { readFile, writeFile, rename, unlink, stat } from "node:fs/promises";
import { parseEnv } from "node:util";

const file = new URL("../.env", import.meta.url);
const temporary = new URL("../.env.sanitizing", import.meta.url);
const original = await readFile(file, "utf8");
const lines = original.split(/\r?\n/);
const retained = lines.filter((line) => !/^\s*#\s*(?:database\s+)?password\s*:/i.test(line));
const removed = lines.length - retained.length;
if (!process.argv.includes("--apply")) {
  console.log(JSON.stringify({ reviewOnly: true, passwordCommentLines: removed, valuesPrinted: false }));
} else if (removed) {
  const sanitized = retained.join(original.includes("\r\n") ? "\r\n" : "\n");
  const before = parseEnv(original), after = parseEnv(sanitized);
  if (Object.keys(before).length !== Object.keys(after).length || Object.entries(before).some(([key, value]) => after[key] !== value)) throw new Error("Environment values must remain unchanged; replacement refused and values withheld");
  await writeFile(temporary, sanitized, { flag: "wx", mode: (await stat(file)).mode });
  try { await rename(temporary, file); } catch { await unlink(temporary); throw new Error("Could not replace the local environment file; original retained"); }
  console.log(JSON.stringify({ passwordCommentLinesRemoved: removed, environmentValuesChanged: false, credentialsRotated: false }));
} else {
  console.log(JSON.stringify({ passwordCommentLinesRemoved: 0, environmentValuesChanged: false, credentialsRotated: false }));
}
