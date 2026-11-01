import "../server/config.js";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { connectDatabase } from "../database/client.js";
import { pathToFileURL } from "node:url";
import { assertHostedDatabaseProject } from "../database/project.js";

export async function backupDatabase() {
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error("DATABASE_MIGRATION_URL is required");
  assertHostedDatabaseProject(url, process.env.SUPABASE_URL!);
  const { client, db } = connectDatabase(url);
  try {
    const payload = await db.transaction(async (tx) => {
      const tables = await tx.execute<{ tablename: string }>(sql`select tablename from pg_catalog.pg_tables where schemaname = 'erp_private' order by tablename`);
      const records: Record<string, unknown[]> = {};
      for (const table of tables.rows) records[table.tablename] = (await tx.execute(sql`select * from erp_private.${sql.identifier(table.tablename)}`)).rows;
      return { format: "mipro-erp-backup-v1", capturedAt: new Date().toISOString(), projectRef: new URL(process.env.SUPABASE_URL!).hostname.split(".")[0], schema: "erp_private", records };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    const text = JSON.stringify(payload, null, 2);
    const ref = payload.projectRef;
    if (!/^[a-z]{20}$/.test(ref)) throw new Error("Unexpected backup project identity");
    const folder = new URL(`../artifacts/backups/${ref}/`, import.meta.url);
    await mkdir(folder, { recursive: true });
    const path = new URL(`database-${Date.now()}.json`, folder);
    await writeFile(path, text, { flag: "wx", mode: 0o600 });
    await writeFile(new URL(`${path.href}.sha256`), createHash("sha256").update(text).digest("hex"), { flag: "wx", mode: 0o600 });
    console.log("ERP schema backup saved in its project-specific artifacts/backups folder; tables:", Object.keys(payload.records).length);
    return path;
  } finally { await client.end(); }
}

async function main() {
  const command = process.argv[2];
  if (command === "backup") { await backupDatabase(); return; }
  if (command !== "migrate" || !process.argv.includes("--apply")) throw new Error("Use database.ts backup or database.ts migrate --apply");
  // Always capture the existing destination before an additive migration. Never reset/truncate.
  await backupDatabase();
  const { client } = connectDatabase(process.env.DATABASE_MIGRATION_URL!);
  try {
    const session = await client.connect();
    try {
      // Hold one dedicated session-pooler connection across Drizzle's migration transaction.
      await session.query("select pg_advisory_lock(77612001)");
      try {
        if ((await session.query("select to_regclass('erp_private.import_cases') as name")).rows[0]?.name) {
          const duplicates = await session.query("select count(*)::int as count from (select lower(btrim(commercial->>'lcNumber')) from erp_private.import_cases where nullif(btrim(commercial->>'lcNumber'), '') is not null group by 1 having count(*) > 1) duplicates");
          if (duplicates.rows[0].count) throw new Error("Duplicate LC references require reviewed reconciliation before migration; records were not altered.");
        }
        await migrate(drizzle(session), { migrationsFolder: "database/migrations", migrationsSchema: "erp_migrations" });
      } finally { await session.query("select pg_advisory_unlock(77612001)"); }
    } finally { session.release(); }
    console.log("Reviewed migrations applied; existing destination was backed up first.");
  } finally { await client.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const cause = error?.cause ?? error;
    console.error("Database operation failed", { code: /^[A-Z0-9_]+$/.test(cause?.code ?? "") ? cause.code : "CONFIGURATION_OR_CONNECTION", position: /^\d+$/.test(String(cause?.position ?? "")) ? cause.position : undefined });
    process.exitCode = 1;
  });
}
