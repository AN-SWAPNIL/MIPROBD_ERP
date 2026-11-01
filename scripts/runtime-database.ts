import "../server/config.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { connectDatabase } from "../database/client.js";
import { backupDatabase } from "./database.js";
import { databasePrivileges, isRestrictedRuntime } from "../server/foundation/database-security.js";
import { parseEnv } from "node:util";
import { privateArtifactPath } from "./private-paths.js";
import { assertHostedDatabaseProject } from "../database/project.js";

const role = "mipro_runtime";
const path = privateArtifactPath(process.env.ERP_RUNTIME_ENV_FILE, "artifacts/private/runtime-database.env");
const mutableChildren = new Set(["import_items", "import_cost_lines", "quotation_lines", "lead_products", "activity_products"]);
async function main() {
  if (!process.argv.includes("--apply")) throw new Error("Use --apply to provision/reconcile only the restricted ERP role.");
  assertHostedDatabaseProject(process.env.DATABASE_URL!, process.env.SUPABASE_URL!);
  await backupDatabase();
  const migrationUrl = process.env.DATABASE_MIGRATION_URL; if (!migrationUrl) throw new Error("Migration connection is required.");
  const { client } = connectDatabase(migrationUrl);
  let runtimeUrl: string;
  try {
    const session = await client.connect();
    try {
      await session.query("begin"); await session.query("select pg_advisory_xact_lock(77612016)");
      const existing = (await session.query("select rolname from pg_roles where rolname=$1", [role])).rows.length > 0;
      if (existing) {
        const values = parseEnv(await readFile(path, "utf8")); const value = values.DATABASE_RUNTIME_URL;
        const project = new URL(process.env.SUPABASE_URL!).hostname.split(".")[0];
        if (!value || ![role, `${role}.${project}`].includes(decodeURIComponent(new URL(value).username)) || new URL(value).hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(new URL(value).username) !== `${role}.${project}`) throw new Error("Existing role credential requires owner review; never reset it automatically.");
        runtimeUrl = value;
      } else {
        const password = randomBytes(36).toString("base64url"); const url = new URL(process.env.DATABASE_URL!);
        const project = new URL(process.env.SUPABASE_URL!).hostname.split(".")[0];
        url.username = url.hostname.endsWith(".pooler.supabase.com") ? `${role}.${project}` : role; url.password = password; runtimeUrl = url.toString();
        const [{ ddl }] = (await session.query<{ ddl: string }>("select format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT', $1::text, $2::text) ddl", [role, password])).rows;
        await session.query(ddl);
        await mkdir(new URL("./", path), { recursive: true });
        await writeFile(path, `DATABASE_RUNTIME_URL="${runtimeUrl}"\nERP_REQUIRE_RESTRICTED_DB=true\n`, { flag: "wx", mode: 0o600 });
      }
      const tables = (await session.query<{ table_name: string; rls: boolean }>("select c.relname table_name,c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='erp_private' and c.relkind='r' order by c.relname")).rows;
      if (tables.some((table) => !table.rls)) throw new Error("Every private ERP table must have RLS before provisioning runtime access.");
      await session.query("GRANT USAGE ON SCHEMA erp_private TO mipro_runtime");
      for (const { table_name: name } of tables) {
        if (!/^[a-z_]+$/.test(name)) throw new Error("Unexpected table identifier");
        await session.query(`REVOKE ALL ON TABLE erp_private."${name}" FROM mipro_runtime`);
        const verbs = name === "operational_checks" ? "SELECT, INSERT" : `SELECT, INSERT, UPDATE${mutableChildren.has(name) ? ", DELETE" : ""}`;
        await session.query(`GRANT ${verbs} ON TABLE erp_private."${name}" TO mipro_runtime`);
        const policy = (await session.query("select 1 from pg_policies where schemaname='erp_private' and tablename=$1 and policyname='erp_server_runtime'", [name])).rows.length;
        if (!policy) await session.query(`CREATE POLICY erp_server_runtime ON erp_private."${name}" FOR ALL TO mipro_runtime USING (true) WITH CHECK (true)`);
      }
      await session.query("commit");
      console.log(`Restricted ERP role provisioned for ${tables.length} private tables; no DDL, ownership, bypass-RLS or authentication-schema grants.`);
    } catch (error) { await session.query("rollback"); throw error; } finally { session.release(); }
  } finally { await client.end(); }
  const runtime = connectDatabase(runtimeUrl!);
  try {
    if (!isRestrictedRuntime(await databasePrivileges(runtime))) throw new Error("Restricted-role verification failed.");
    await runtime.client.query("select count(*) from erp_private.products");
    for (const query of ["create table erp_private.runtime_permission_probe(id int)", "select * from auth.users limit 1", "select * from storage.objects limit 1", "delete from erp_private.audit_events where false"]) {
      let denied = false;
      try { await runtime.client.query("begin"); await runtime.client.query(query); } catch (error) { denied = (error as { code?: string }).code === "42501"; } finally { await runtime.client.query("rollback"); }
      if (!denied) throw new Error("A forbidden runtime operation was not denied.");
    }
    console.log(`Verified runtime reads and denied DDL/Auth/Storage/audit deletion. Credential file: ${process.env.ERP_RUNTIME_ENV_FILE ?? "artifacts/private/runtime-database.env"}. Values were not printed or deployed.`);
  } finally { await runtime.client.end(); }
}
main().catch((error) => { const code = (error as { code?: string })?.code; console.error("Restricted-role setup did not pass", { code: code && /^[A-Z0-9_]+$/.test(code) ? code : "REVIEW_REQUIRED" }); process.exitCode = 1; });
