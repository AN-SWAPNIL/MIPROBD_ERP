import "../server/config.js";
import { connectDatabase } from "../database/client.js";
const connection = connectDatabase(process.env.DATABASE_MIGRATION_URL!);
try {
  const client = await connection.client.connect(); console.log("Read-only diagnostic database connection established."); client.release();
  const result = await connection.client.query(`select state,wait_event_type,wait_event,count(*)::int connections,
    max(extract(epoch from now()-query_start))::int oldest_seconds,
    case when query ilike 'begin%' then 'BEGIN' when query ilike 'commit%' then 'COMMIT' when query ilike 'rollback%' then 'ROLLBACK' else 'OTHER' end operation
    from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() group by 1,2,3,6`);
  console.log(JSON.stringify(result.rows));
  if(process.argv.includes("--test-locks")){
    const details=await connection.client.query(`select a.pid,a.application_name like 'mipro-hosted:%' tagged_test,a.application_name like 'mipro-hosted:payroll:%' payroll_test,a.state,a.xact_start,a.query_start,pg_blocking_pids(a.pid) blockers,
      exists(select 1 from pg_locks l where l.pid=a.pid and l.relation='erp_private.payroll_runs'::regclass and l.mode='RowExclusiveLock' and l.granted) writes_payroll,
      exists(select 1 from pg_locks l where l.pid=a.pid and l.relation='erp_private.ledger_configurations'::regclass and l.mode='RowExclusiveLock' and l.granted) writes_mapping,
      case when a.query ilike '%approval_requests%' then 'Approval query' when a.query ilike '%advisory_xact_lock%' then 'Advisory source lock' when a.query ilike '%payroll_%' then 'Payroll query' else 'Other (SQL withheld)' end query_class
      from pg_stat_activity a where a.datname=current_database() and a.pid<>pg_backend_pid() and (a.xact_start is not null or cardinality(pg_blocking_pids(a.pid))>0) order by a.xact_start`);
    console.log(JSON.stringify(details.rows));
  }
} catch (error) { const cause = error as { code?: string; message?: string }; const code = cause.code; console.error("Read-only pool diagnostics unavailable", { code: code && /^[A-Z0-9_]+$/.test(code) ? code : /connect/i.test(cause.message ?? "") ? "CONNECTION_TIMEOUT" : /query/i.test(cause.message ?? "") ? "QUERY_TIMEOUT" : "DEPENDENCY_UNAVAILABLE" }); process.exitCode = 1; }
finally { await connection.client.end(); }
