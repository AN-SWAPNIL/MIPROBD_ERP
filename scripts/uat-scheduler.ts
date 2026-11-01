import "../server/config.js";
import { readFile, writeFile } from "node:fs/promises";
import { connectDatabase } from "../database/client.js";
import { backupDatabase } from "./database.js";

async function main() {
  if (!process.argv.includes("--apply")) throw new Error("Use --apply only for the authorized isolated UAT scheduler.");
  const target = JSON.parse(await readFile(new URL("../artifacts/private/uat-vercel.json", import.meta.url), "utf8"));
  const ref = new URL(process.env.SUPABASE_URL!).hostname.split(".")[0];
  if (ref !== "njbecypawzsuqiteooly" || target.supabaseProjectRef !== ref || target.projectName !== "mipro-erp" || !/^https:\/\/mipro-erp(?:-[a-z0-9-]+)?\.vercel\.app$/.test(target.origin)) throw new Error("Unsafe scheduler project or URL.");
  const secret = process.env.CRON_SECRET; if (!secret || secret.length < 32) throw new Error("A strong UAT-only server credential is required.");
  const health = await fetch(`${target.origin}/api/health`, { signal: AbortSignal.timeout(45000) });
  if (!health.ok || (await health.json()).data?.mode !== "foundation") throw new Error("Matching UAT API must be healthy before scheduling.");
  await backupDatabase();
  const connection = connectDatabase(process.env.DATABASE_MIGRATION_URL!);
  const jobs = [["invitations", "*/5 * * * *"], ["health", "*/15 * * * *"], ["reconciliation", "0 20 * * *"]] as const;
  try {
    const client = await connection.client.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(77612071)");
      await client.query("create extension if not exists pg_cron with schema pg_catalog");
      await client.query("create extension if not exists pg_net with schema extensions");
      const vault = (await client.query("select to_regclass('vault.decrypted_secrets') name")).rows[0];
      if (!vault.name) throw new Error("Supabase Vault is required; do not save job secrets in cron text.");
      const existing = (await client.query<{ matches: boolean }>("select decrypted_secret=$1 matches from vault.decrypted_secrets where name='mipro_uat_job_secret'", [secret])).rows;
      if (existing.length > 1 || existing.some(row => !row.matches)) throw new Error("An existing scheduler secret differs; no silent rotation was attempted.");
      if (!existing.length) await client.query("select vault.create_secret($1,'mipro_uat_job_secret','MIPRO UAT authenticated maintenance; never browser-accessible')", [secret]);
      for (const [path, schedule] of jobs) {
        const command = `select net.http_get(url := '${target.origin}/api/jobs/${path}', headers := jsonb_build_object('Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='mipro_uat_job_secret')), timeout_milliseconds := 55000);`;
        const name = `mipro-uat-${path}`;
        const old = (await client.query<{ command: string }>("select command from cron.job where jobname=$1", [name])).rows;
        if (old.length > 1 || old.some(row => row.command !== command)) throw new Error("Existing same-named job differs; review instead of overwriting it.");
        await client.query("select cron.schedule($1,$2,$3)", [name, schedule, command]);
      }
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
    const verified = (await connection.client.query<{ jobname: string; schedule: string; active: boolean }>("select jobname,schedule,active from cron.job where jobname like 'mipro-uat-%' order by jobname")).rows;
    if (verified.length !== jobs.length || verified.some(j => !j.active)) throw new Error("Scheduler verification did not pass.");
    const runs = [];
    for (const [path] of jobs) {
      const [{ id }] = (await connection.client.query<{ id: string }>("select net.http_get(url := $1, headers := jsonb_build_object('Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='mipro_uat_job_secret')), timeout_milliseconds := 55000)::text id", [`${target.origin}/api/jobs/${path}`])).rows;
      let completed: { status_code: number; timed_out: boolean; error: boolean } | undefined;
      for (let attempt = 0; attempt < 60; attempt++) {
        completed = (await connection.client.query<{ status_code: number; timed_out: boolean; error: boolean }>("select status_code,timed_out,error_msg is not null error from net._http_response where id=$1::bigint", [id])).rows[0];
        if (completed) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      if (!completed || completed.status_code !== 200 || completed.timed_out || completed.error) throw new Error("Actual Supabase HTTP job transport did not pass; inspect sanitized runtime logs.");
      runs.push({ path, status: completed.status_code, transport: "Supabase pg_net" });
    }
    const result = { configuredAt: new Date().toISOString(), projectRef: ref, origin: target.origin, scheduler: "Supabase pg_cron + pg_net", vaultBacked: true, plaintextSecretInJobText: false, jobs: verified, endpointChecks: runs, dailyReconciliationDhaka: "02:00", externalAlertDelivery: false, developerDatabaseChanged: false };
    await writeFile(new URL("../artifacts/private/uat-scheduler.json", import.meta.url), JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(result));
  } finally { await connection.client.end(); }
}
main().catch(error => { const code = error?.code ?? error?.cause?.code; console.error("UAT scheduler setup did not pass", { code: /^[A-Z0-9_]+$/.test(code ?? "") ? code : "REVIEW_REQUIRED" }); console.error("No other project was targeted; credentials/provider details withheld."); process.exitCode = 1; });
