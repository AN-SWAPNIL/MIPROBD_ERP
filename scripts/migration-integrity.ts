import "../server/config.js";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { connectDatabase } from "../database/client.js";

async function main() {
  if (!process.env.DATABASE_MIGRATION_URL) throw new Error("Migration connection is required");
  const { client, db } = connectDatabase(process.env.DATABASE_MIGRATION_URL);
  try {
    const files = readMigrationFiles({ migrationsFolder: "database/migrations" });
    const journal = JSON.parse(await readFile("database/migrations/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
    const acceptedHashes = new Map<number, Set<string>>();
    for (const [index, file] of files.entries()) {
      const source = await readFile(`database/migrations/${journal.entries[index].tag}.sql`, "utf8");
      const lf = source.replace(/\r\n/g, "\n");
      // Git may normalize Windows line endings; any actual SQL edit must still fail.
      acceptedHashes.set(file.folderMillis, new Set([file.hash, ...[lf, lf.replace(/\n/g, "\r\n")].map((text) => createHash("sha256").update(text).digest("hex"))]));
    }
    const applied = (await db.execute<{ hash: string; created_at: string }>(sql`select hash,created_at from erp_migrations.__drizzle_migrations order by created_at`)).rows;
    const mismatches = applied.filter((row) => !acceptedHashes.get(Number(row.created_at))?.has(row.hash));
    console.log(JSON.stringify({ localMigrations: files.length, appliedMigrations: applied.length, hashMismatches: mismatches.length }));
    if (mismatches.length) process.exitCode = 1;
  } finally { await client.end(); }
}
main().catch(() => { console.error("Migration integrity could not be verified; no records were changed."); process.exitCode = 1; });
