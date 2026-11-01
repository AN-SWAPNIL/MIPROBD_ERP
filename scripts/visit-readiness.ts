import "../server/config.js";
import { sql } from "drizzle-orm";
import { connectDatabase } from "../database/client.js";

for (const name of ["DATABASE_URL", "DATABASE_MIGRATION_URL"] as const) {
  const { client, db } = connectDatabase(process.env[name]!);
  try {
    const migrations = await db.execute(sql`select id,created_at from erp_migrations.__drizzle_migrations order by created_at desc limit 4`);
    const tables = await db.execute(sql`select tablename,rowsecurity from pg_tables where schemaname='erp_private' and (tablename like 'field_visit%' or tablename='customer_locations') order by tablename`);
    console.log(name, { migrations: migrations.rows, tables: tables.rows });
    if(tables.rows.length!==5||tables.rows.some((r)=>r.rowsecurity!==true))throw new Error("Field visit migrations/RLS are incomplete on this connection.");
  } finally { await client.end(); }
}
