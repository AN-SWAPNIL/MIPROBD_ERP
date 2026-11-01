import "../server/config.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { connectDatabase } from "../database/client.js";
import { createContext } from "../server/foundation/context.js";
import { verifyLocalBackups } from "./verify-backups.js";
import { types } from "pg";
import { assertHostedDatabaseProject } from "../database/project.js";

const digest = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]));
  return value;
}
const recordHash = (rows: unknown[]) => digest(JSON.stringify(rows.map(row => JSON.stringify(canonical(JSON.parse(JSON.stringify(row))))).sort()));
let stage = "backup-verification";

async function main() {
  if (!process.argv.includes("--apply") || new URL(process.env.SUPABASE_URL!).hostname !== "njbecypawzsuqiteooly.supabase.co") throw new Error("This rehearsal is restricted to the isolated UAT project, with --apply.");
  assertHostedDatabaseProject(process.env.DATABASE_MIGRATION_URL!, process.env.SUPABASE_URL!);
  const folder = new URL("../artifacts/backups/njbecypawzsuqiteooly/", import.meta.url);
  const verification = await verifyLocalBackups(folder);
  if (!verification.referentiallyComplete || verification.projectRef !== "njbecypawzsuqiteooly") throw new Error("A complete matching UAT backup is required.");
  const backup = JSON.parse(await readFile(new URL(verification.databaseBackup, folder), "utf8")) as { records: Record<string, Record<string, unknown>[]> };
  const ctx = createContext(), migration = connectDatabase(process.env.DATABASE_MIGRATION_URL!);
  const schema = `erp_recovery_${randomUUID().replaceAll("-", "").slice(0, 16)}`, rollback = new Error("ROLLBACK_REHEARSAL");
  const suffix = randomUUID(), paths = [`recovery-probe/${suffix}/source.txt`, `recovery-probe/${suffix}/restored.txt`];
  let restoredRows = 0, restoredTables = 0, objectsCreated = false;
  try {
    const session = await migration.client.connect();
    try {
      await session.query("begin");
      await session.query(`create schema "${schema}"`);
      await session.query(`revoke all on schema "${schema}" from public,anon,authenticated`);
      for (const [table, rows] of Object.entries(backup.records)) {
        stage = `restore:${table}`;
        if (!/^[a-z_]+$/.test(table) || rows.length > 100000) throw new Error("Unsupported backup table/bounds.");
        await session.query(`create table "${schema}"."${table}" (like erp_private."${table}" including all)`);
        await session.query(`alter table "${schema}"."${table}" enable row level security`);
        const columns = (await session.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema=$1 and table_name=$2 and is_generated='NEVER' order by ordinal_position", [schema, table])).rows.map(c => c.column_name);
        if (columns.some(c => !/^[a-z_][a-z0-9_]*$/.test(c))) throw new Error("Unsupported backup column identifier.");
        if (rows.length) {
          const names = columns.map(c => `"${c}"`).join(","), selected = columns.map(c => `p."${c}"`).join(",");
          await session.query(`insert into "${schema}"."${table}" (${names}) select ${selected} from jsonb_populate_recordset(null::"${schema}"."${table}",$1::jsonb) p`, [JSON.stringify(rows)]);
        }
        // Compare typed PostgreSQL values without JS Date's millisecond truncation.
        const parsers = { getTypeParser: (oid: number) => [1082,1114,1184].includes(oid) ? (value: string) => value : types.getTypeParser(oid) };
        const restored = (await session.query({ text: `select * from "${schema}"."${table}"`, types: parsers })).rows;
        const expected = rows.length ? (await session.query({ text: `select * from jsonb_populate_recordset(null::"${schema}"."${table}",$1::jsonb)`, values: [JSON.stringify(rows)], types: parsers })).rows : [];
        stage = `compare:${table}`;
        if (recordHash(restored) !== recordHash(expected)) throw new Error("Restored rows do not exactly match their saved source.");
        restoredRows += restored.length; restoredTables++;
      }
      throw rollback;
    } catch (error) { if (error !== rollback) throw error; }
    finally { await session.query("rollback"); session.release(); }
    if ((await migration.client.query("select 1 from pg_namespace where nspname=$1", [schema])).rows.length) throw new Error("Temporary recovery schema was not rolled back.");

    stage = "synthetic-private-object";
    const bucket = ctx.admin.storage.from("erp-documents"), bytes = Buffer.from(`MIPRO isolated UAT synthetic recovery probe ${suffix}\n`, "utf8");
    const source = await bucket.upload(paths[0], bytes, { contentType: "text/plain", upsert: false });
    if (source.error) throw new Error("Private synthetic source upload failed."); objectsCreated = true;
    const downloaded = await bucket.download(paths[0]); if (downloaded.error || !downloaded.data) throw new Error("Private synthetic source download failed.");
    const restoredBytes = Buffer.from(await downloaded.data.arrayBuffer());
    if (digest(restoredBytes) !== digest(bytes)) throw new Error("Backup bytes did not match source.");
    const evidence = new URL(`rehearsal-${Date.now()}/`, folder); await mkdir(evidence, { recursive: true });
    await writeFile(new URL("synthetic-object.txt", evidence), restoredBytes, { flag: "wx", mode: 0o600 });
    const restored = await bucket.upload(paths[1], await readFile(new URL("synthetic-object.txt", evidence)), { contentType: "text/plain", upsert: false });
    if (restored.error) throw new Error("Private synthetic restore upload failed.");
    const checked = await bucket.download(paths[1]); if (checked.error || !checked.data || digest(Buffer.from(await checked.data.arrayBuffer())) !== digest(bytes)) throw new Error("Restored private object hash did not match.");
    if ((await bucket.remove(paths)).error) throw new Error("Synthetic recovery objects need cleanup."); objectsCreated = false;
    const result = { format: "mipro-uat-recovery-rehearsal-v1", checkedAt: new Date().toISOString(), projectRef: verification.projectRef, restoredTables, restoredRows, exactRowsVerified: true, scratchSchemaRolledBack: true, syntheticPrivateObjectByteRestoreVerified: true, sourceObjectBackup: verification.objectBackup, fullProjectRestoreCertified: false, offsiteVerified: false, limits: ["Scratch schema restores types, defaults, checks, indexes and generated values, not business triggers, foreign keys, roles or Auth identities.", "The new UAT snapshot has no operational history. This is not proof of restoration of the development history or real company transactions.", "Only generated test text bytes were uploaded/restored; no development employee photos or business evidence were copied."] };
    await writeFile(new URL("result.json", evidence), JSON.stringify(result, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify(result));
  } finally {
    let cleanupFailed = false;
    if (objectsCreated) cleanupFailed = Boolean((await ctx.admin.storage.from("erp-documents").remove(paths)).error);
    await ctx.client.end(); await migration.client.end();
    if (cleanupFailed) { console.error("Synthetic recovery objects need cleanup; source business records were not changed."); process.exitCode = 1; }
  }
}
main().catch(error => { const code = error?.code ?? error?.cause?.code; console.error("UAT recovery rehearsal did not pass", { stage, code: /^[A-Z0-9_]+$/.test(code ?? "") ? code : "REVIEW_REQUIRED" }); console.error("Original data retained and private details withheld. Do not certify recovery from this attempt."); process.exitCode = 1; });
