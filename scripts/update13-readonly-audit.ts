import "../server/config.js";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { connectDatabase } from "../database/client.js";
import { createContext } from "../server/foundation/context.js";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { verifyLocalBackups } from "./verify-backups.js";
import { privateArtifactPath } from "./private-paths.js";

const root = new URL("../", import.meta.url);
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
let stage = "configuration";
const runtimeCredential = privateArtifactPath(process.env.ERP_RUNTIME_ENV_FILE, "artifacts/private/runtime-database.env");
if (existsSync(runtimeCredential)) loadEnvFile(runtimeCredential);

async function inspectDatabase(variable: "DATABASE_URL" | "DATABASE_RUNTIME_URL" | "DATABASE_MIGRATION_URL", sourceHash: string) {
  const url = process.env[variable];
  if (!url) throw new Error("Missing database configuration");
  const { client } = connectDatabase(url);
  stage = `${variable}:connect`;
  const session = await client.connect().catch(async (error) => { await client.end(); throw error; });
  try {
    await session.query("begin isolation level repeatable read read only");
    if ((await session.query("show transaction_read_only")).rows[0]?.transaction_read_only !== "on") throw new Error("Read-only transaction could not be established");
    let queryIndex = 0;
    const one = async (query: string, values: unknown[] = []) => { stage = `${variable}:query-${++queryIndex}`; return (await session.query(query, values)).rows[0]; };
    const role = await one(`select current_user role,rolsuper superuser,rolbypassrls bypass_rls,rolcreaterole create_role,
      has_schema_privilege(current_user,'erp_private','CREATE') create_private_schema_objects,
      has_schema_privilege(current_user,'erp_migrations','USAGE') migration_schema_access
      from pg_roles where rolname=current_user`);
    const tables = await one(`select count(*)::int total,count(*) filter(where rowsecurity)::int rls_enabled,
      count(*) filter(where tableowner=current_user)::int owned_by_current_role from pg_tables where schemaname='erp_private'`);
    const migration = role.migration_schema_access ? await one("select count(*)::int total,max(id)::int latest_id,max(created_at)::text latest_timestamp from erp_migrations.__drizzle_migrations") : { access: "Not granted to runtime" };
    const applied = role.migration_schema_access ? (await session.query("select hash,created_at::text timestamp from erp_migrations.__drizzle_migrations order by created_at")).rows as { hash: string; timestamp: string }[] : [];
    const journal = JSON.parse(await readFile(new URL("database/migrations/meta/_journal.json", root), "utf8"));
    let unrecognizedMigrationHashes = 0;
    for (const row of applied) {
      const entry = journal.entries.find((entry: { when: number }) => String(entry.when) === row.timestamp);
      if (!entry) { unrecognizedMigrationHashes++; continue; }
      const bytes = await readFile(new URL(`database/migrations/${entry.tag}.sql`, root), "utf8");
      const lf = bytes.replace(/\r\n/g, "\n");
      if (![hash(bytes), hash(lf), hash(lf.replace(/\n/g, "\r\n"))].includes(row.hash)) unrecognizedMigrationHashes++;
    }
    migration.unrecognizedSourceHashes = unrecognizedMigrationHashes;
    migration.hashesChecked = applied.length;
    const access = await one(`select has_schema_privilege('anon','erp_private','USAGE') anonymous_private_access,
      has_schema_privilege('authenticated','erp_private','USAGE') browser_role_private_access`);
    const batchSources = (await session.query(`select column_name,is_nullable from information_schema.columns
      where table_schema='erp_private' and table_name='stock_batches' and column_name in ('receipt_line_id','source_import_id','opening_position_id','correction_line_id','return_line_id','replacement_receipt_id') order by column_name`)).rows;
    const integrity = await one(`with journal as (
      select batch_id,sum(quantity_delta) quantity,sum(value_delta_bdt) value from erp_private.stock_movements group by batch_id)
      select count(*)::int batches,count(*) filter(where b.quantity_available<>coalesce(j.quantity,0) or b.available_value_bdt<>coalesce(j.value,0))::int mismatched_batches
      from erp_private.stock_batches b left join journal j on j.batch_id=b.id`);
    const movements = await one(`select count(*)::int total,count(*) filter(where quantity_delta is null or value_delta_bdt is null)::int unsupported_by_current_reports from erp_private.stock_movements`);
    const ledgerIntegrity = await one(`select
      (select count(*)::int from erp_private.ledger_journals where state='Posted') posted_journals,
      (select count(*)::int from erp_private.ledger_journals j where (select count(*) from erp_private.ledger_lines l where l.journal_id=j.id)<2 or j.total_bdt<>(select coalesce(sum(l.debit),0) from erp_private.ledger_lines l where l.journal_id=j.id) or j.total_bdt<>(select coalesce(sum(l.credit),0) from erp_private.ledger_lines l where l.journal_id=j.id)) invalid_journals,
      (select count(*)::int from erp_private.ledger_source_events e left join erp_private.ledger_journals j on j.id=e.journal_id where e.state='Posted' and (j.id is null or j.state<>'Posted' or j.source_key<>e.source_key or j.configuration_id<>e.configuration_id)) invalid_posted_sources,
      (select count(*)::int from erp_private.approval_requests r where not exists(select 1 from erp_private.approval_events e where e.approval_id=r.id and e.version=r.version and e.action=r.state)) approvals_without_history,
      (select count(*)::int from erp_private.ledger_configurations where state='Approved') active_mapping_count,
      (select has_table_privilege(current_user,'erp_private.ledger_lines','DELETE')) can_delete_ledger_lines`);
    if (ledgerIntegrity.invalid_journals || ledgerIntegrity.invalid_posted_sources || ledgerIntegrity.approvals_without_history) throw new Error("Saved ledger or approval evidence does not reconcile");
    const holdIntegrity = await one(`with held as (select h.batch_id,sum(erp_private.stock_hold_outstanding(h.id,(current_timestamp at time zone 'Asia/Dhaka')::date)) quantity from erp_private.stock_holds h group by h.batch_id)
      select (select count(*)::int from erp_private.stock_holds) holds,
      (select count(*)::int from erp_private.stock_hold_releases where state='Posted') posted_releases,
      (select count(*)::int from held h join erp_private.stock_batches b on b.id=h.batch_id where h.quantity<0 or h.quantity>b.quantity_available) invalid_batch_reservations,
      (select count(*)::int from erp_private.stock_hold_releases r join erp_private.approval_requests a on a.id=r.approval_id where r.state='Posted' and (a.state<>'Posted' or a.resource_type<>'Stock Hold Release' or a.resource_id<>r.id or a.payload_hash<>r.payload_hash or a.amount_bdt<>r.value_bdt)) invalid_release_sources,
      has_table_privilege(current_user,'erp_private.stock_holds','DELETE') can_delete_holds`);
    if (integrity.mismatched_batches || movements.unsupported_by_current_reports || holdIntegrity.invalid_batch_reservations || holdIntegrity.invalid_release_sources) throw new Error("Saved stock or hold sources do not reconcile");
    const stockControlIntegrity = await one(`select
      (select count(*)::int from erp_private.stock_controls where state='Posted') posted_controls,
      (select count(*)::int from erp_private.stock_controls c left join erp_private.approval_requests a on a.id=c.approval_id where c.state='Posted' and (a.id is null or a.state<>'Posted' or a.resource_type<>'Stock Control' or a.resource_id<>c.id or a.payload_hash<>c.payload_hash or a.amount_bdt<>c.total_bdt)) invalid_approved_sources,
      (select count(*)::int from erp_private.stock_control_lines l join erp_private.stock_controls c on c.id=l.control_id left join erp_private.stock_control_postings p on p.line_id=l.id where (c.state='Posted' and p.id is null) or (c.state<>'Posted' and p.id is not null)) invalid_posting_links,
      (select count(*)::int from erp_private.stock_movements m left join erp_private.stock_control_postings p on p.movement_id=m.id where m.type='Adjustment' and p.id is null) unsigned_adjustments,
      has_table_privilege(current_user,'erp_private.stock_control_lines','DELETE') can_delete_control_lines`);
    if (stockControlIntegrity.invalid_approved_sources || stockControlIntegrity.invalid_posting_links || stockControlIntegrity.unsigned_adjustments) throw new Error("Stock correction approval/source links do not reconcile");
    const returnIntegrity = await one(`select
      (select count(*)::int from erp_private.customer_returns where state='Posted') posted_returns,
      (select count(*)::int from erp_private.customer_returns r left join erp_private.approval_requests a on a.id=r.approval_id where r.state='Posted' and (a.id is null or a.state<>'Posted' or a.resource_type<>'Customer Return' or a.resource_id<>r.id or a.payload_hash<>r.payload_hash or a.amount_bdt<>r.exposure_bdt)) invalid_approved_sources,
      (select count(*)::int from erp_private.customer_return_lines l join erp_private.customer_returns r on r.id=l.return_id left join erp_private.customer_return_postings p on p.line_id=l.id where (r.state='Posted' and p.id is null) or (r.state<>'Posted' and p.id is not null)) invalid_posting_links,
      (select count(*)::int from erp_private.stock_movements m left join erp_private.customer_return_postings p on p.movement_id=m.id where m.type='Return' and p.id is null) unsigned_returns,
      (select count(*)::int from erp_private.customer_returns r where r.state='Posted' and r.credit_bdt<>coalesce((select sum(j.credit-j.debit) from erp_private.customer_entries j where j.type='Return Credit' and j.source_id=r.id),0)) invalid_credit_sources,
      (select count(*)::int from erp_private.return_settlements s left join erp_private.approval_requests a on a.id=s.approval_id where s.state='Posted' and (a.id is null or a.state<>'Posted' or a.resource_type<>'Return Settlement' or a.resource_id<>s.id or a.payload_hash<>s.payload_hash or a.amount_bdt<>s.amount_bdt)) invalid_settlement_sources,
      has_table_privilege(current_user,'erp_private.customer_return_lines','DELETE') can_delete_return_lines`);
    if (returnIntegrity.invalid_approved_sources || returnIntegrity.invalid_posting_links || returnIntegrity.unsigned_returns || returnIntegrity.invalid_credit_sources || returnIntegrity.invalid_settlement_sources) throw new Error("Customer return stock, credit or approval evidence does not reconcile");
    const payrollIntegrity = await one(`select
      (select count(*)::int from erp_private.payroll_runs where state='Accrued') accrued_runs,
      (select count(*)::int from erp_private.payroll_runs r left join erp_private.approval_requests a on a.id=r.approval_id where r.state='Accrued' and (a.id is null or a.state<>'Posted' or a.resource_type<>'Payroll Run' or a.resource_id<>r.id or a.payload_hash<>r.payload_hash or a.amount_bdt<>r.gross or r.net<>coalesce((select sum(l.net) from erp_private.payroll_lines l where l.run_id=r.id),0) or r.gross<>coalesce((select sum(l.gross) from erp_private.payroll_lines l where l.run_id=r.id),0))) invalid_run_sources,
      (select count(*)::int from erp_private.payroll_lines l where l.net<>(l.snapshot->'math'->>'net')::numeric or l.gross<>(l.snapshot->'math'->>'gross')::numeric or l.commission<>(l.snapshot->'math'->>'commissionApplied')::numeric or coalesce((select sum(p.amount) from erp_private.payroll_payments p where p.line_id=l.id and p.state='Posted'),0)>l.net) invalid_line_balances,
      (select count(*)::int from erp_private.payroll_loans p where (p.state='Posted' and not exists(select 1 from erp_private.account_transactions t where t.id=p.transaction_id and t.source_id=p.id and t.source_type=case when p.kind='Advance' then 'Payroll Advance' else 'Payroll Loan' end and t.amount=p.amount and t.direction='Out' and t.account_id=p.account_id and t.date=p.date)) or coalesce((select sum(r.amount) from erp_private.payroll_recoveries r where r.loan_id=p.id),0)>p.amount) invalid_financing_sources,
      (select count(*)::int from erp_private.payroll_recoveries p join erp_private.payroll_lines l on l.id=p.line_id join erp_private.payroll_runs r on r.id=l.run_id join erp_private.payroll_loans f on f.id=p.loan_id where r.state<>'Accrued' or f.state<>'Posted' or l.employee_id<>f.employee_id or p.date<>r.posted_date) invalid_recovery_sources,
      (select count(*)::int from erp_private.payroll_payments p where p.state='Posted' and not exists(select 1 from erp_private.account_transactions t where t.id=p.transaction_id and t.source_id=p.id and t.source_type='Payroll Payment' and t.amount=p.amount and t.direction='Out' and t.account_id=p.account_id and t.date=p.date)) invalid_payment_sources,
      (select count(*)::int from erp_private.ledger_journals j where not j.confidential and (j.source_key like 'payroll:%' or exists(select 1 from erp_private.account_transactions t where j.source_key='account:'||t.id and t.source_type in ('Payroll Payment','Payroll Advance','Payroll Loan')))) public_payroll_journals,
      has_table_privilege(current_user,'erp_private.payroll_lines','DELETE') can_delete_payroll_lines`);
    if (payrollIntegrity.invalid_run_sources || payrollIntegrity.invalid_line_balances || payrollIntegrity.invalid_financing_sources || payrollIntegrity.invalid_recovery_sources || payrollIntegrity.invalid_payment_sources || payrollIntegrity.public_payroll_journals) throw new Error("Confidential payroll, financing or payment evidence does not reconcile");
    const claimIntegrity = await one(`select
      (select count(*)::int from erp_private.supplier_claims where state='Posted') posted_claims,
      (select count(*)::int from erp_private.supplier_claims c left join erp_private.approval_requests a on a.id=c.approval_id where c.state='Posted' and (a.id is null or a.state<>'Posted' or a.resource_type<>'Supplier Claim' or a.resource_id<>c.id or a.payload_hash<>c.payload_hash or a.amount_bdt<>c.exposure_bdt)) invalid_approvals,
      (select count(*)::int from erp_private.supplier_claim_postings p join erp_private.supplier_claims c on c.id=p.claim_id left join erp_private.stock_movements m on m.id=p.movement_id where c.state<>'Posted' or c.source_kind<>'Held Stock' or m.id is null or m.type<>'Supplier Return' or m.adjustment_sign<>-1 or m.batch_id<>c.batch_id or m.quantity<>c.quantity or m.value_bdt<>c.cost_bdt or p.quantity<>c.quantity or p.value_bdt<>c.cost_bdt) invalid_stock_links,
      (select count(*)::int from erp_private.stock_movements m where m.type='Supplier Return' and not exists(select 1 from erp_private.supplier_claim_postings p where p.movement_id=m.id)) unsigned_supplier_returns,
      (select count(*)::int from erp_private.supplier_settlements s join erp_private.supplier_claims c on c.id=s.supplier_claim_id where c.state<>'Posted' or c.resolution<>'Credit' or s.entry_type<>'Credit' or s.amount<>c.credit_bdt or s.supplier_id<>c.supplier_id or s.status<>'Posted' or s.transaction_id is not null) invalid_credit_links,
      (select count(*)::int from erp_private.supplier_replacement_receipts r left join erp_private.stock_batches b on b.replacement_receipt_id=r.id where (r.state='Posted' and ((r.quantity>0 and (b.id is null or b.quantity_received<>r.quantity or b.received_value_bdt<>r.value_bdt)) or (r.quantity=0 and (b.id is not null or r.value_bdt<>0)))) or (r.state<>'Posted' and b.id is not null) or not r.additional_costs_confirmed_zero) invalid_replacements,
      (select count(*)::int from erp_private.supplier_replacement_receipts r left join erp_private.approval_requests a on a.id=r.approval_id where (r.state='Draft' and r.approval_id is not null) or (r.state in('Submitted','Posted') and (a.id is null or a.resource_type<>'Supplier Replacement Receipt' or a.resource_id<>r.id or a.payload_hash<>r.payload_hash or a.amount_bdt<>r.value_bdt or (r.state='Posted' and a.state<>'Posted')))) invalid_replacement_approvals,
      has_table_privilege(current_user,'erp_private.supplier_claims','DELETE') can_delete_claims`);
    if (claimIntegrity.invalid_approvals || claimIntegrity.invalid_stock_links || claimIntegrity.unsigned_supplier_returns || claimIntegrity.invalid_credit_links || claimIntegrity.invalid_replacements || claimIntegrity.invalid_replacement_approvals) throw new Error("Supplier claim, credit or replacement evidence does not reconcile");
    const storageAccess = await one("select coalesce((select has_table_privilege(current_user,c.oid,'SELECT') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname='objects'),false) allowed");
    const qualityIntegrity=await one(`select
      (select count(*)::int from erp_private.quality_resources) resources,
      (select count(*)::int from erp_private.quality_seals) seals,
      (select count(*)::int from erp_private.documents where purpose='quality-evidence' and status='Attached' and (sha256 is null or sha256 !~ '^[a-f0-9]{64}$' or quality_resource_id is null or attached_at is null)) invalid_attached_files,
      (select count(*)::int from erp_private.quality_seals s where s.snapshot is distinct from erp_private.quality_manifest(s.resource_id) or s.source_hash is distinct from erp_private.quality_source(s.resource_id)->>'sourceHash' or s.hash<>encode(sha256(convert_to(s.snapshot::text,'UTF8')),'hex')) invalid_seals,
      (select count(*)::int from erp_private.quality_resources r where erp_private.quality_source(r.id)->>'state' in('Submitted','Posted') and not exists(select 1 from erp_private.quality_seals s join erp_private.approval_requests a on a.context->>'qualitySealId'=s.id::text and a.context->>'qualityEvidenceHash'=s.hash where s.resource_id=r.id and a.resource_id=erp_private.quality_source(r.id)->>'sourceId')) missing_approval_seals,
      has_table_privilege(current_user,'erp_private.quality_seals','DELETE') can_delete_seals`);
    if(qualityIntegrity.invalid_attached_files||qualityIntegrity.invalid_seals||qualityIntegrity.missing_approval_seals)throw new Error("Inspection evidence, approval seals or immutable file metadata do not reconcile");
    const objects = storageAccess.allowed ? await one("select count(*)::int private_object_metadata_rows from storage.objects where bucket_id='erp-documents'") : { access: "Not granted to runtime" };
    const sourceOpening = await one("select count(*)::int posted_lines from erp_private.opening_positions p join erp_private.opening_sources s on s.id=p.source_id where s.sha256=$1", [sourceHash]);
    const administrators = (await session.query("select email,auth_user_id from erp_private.employees where role='Super Admin' and status='Active' order by created_at,id limit 101")).rows as { email: string; auth_user_id: string | null }[];
    if (administrators.length > 100) throw new Error("Administrator metadata exceeds bounded audit size");
    return { role, tables, migration, access, batchSources, integrity, movements, ledgerIntegrity, holdIntegrity, stockControlIntegrity, returnIntegrity, payrollIntegrity, claimIntegrity, qualityIntegrity, objects, administrators, sourceOpening };
  } finally {
    await session.query("rollback").catch(() => undefined);
    session.release(); await client.end();
  }
}

async function inspectBackup() {
  const folder = new URL("artifacts/backups/", root);
  const names = (await readdir(folder).catch(() => [] as string[])).filter((name) => /^database-\d+\.json$/.test(name)).sort((a, b) => Number(b.slice(9, -5)) - Number(a.slice(9, -5)));
  const name = names[0];
  if (!name) return { exists: false, restoreVerified: false, objectBytesBackedUp: "Not verified" };
  const path = new URL(name, folder);
  if ((await stat(path)).size > 100 * 1024 * 1024) throw new Error("Local backup exceeds bounded audit size");
  const bytes = await readFile(path);
  const checksum = (await readFile(new URL(`${name}.sha256`, folder), "utf8")).trim();
  const snapshot = JSON.parse(bytes.toString("utf8"));
  let objectBackup:Record<string,unknown>;
  try{const {privateDiagnostics:_private,...summary}=await verifyLocalBackups();void _private;objectBackup=summary;}catch{objectBackup={verified:false,reason:"Separate object backup is missing, incomplete or fails local integrity checks"};}
  return { exists: true, checksumMatches: hash(bytes) === checksum, capturedAt: snapshot.capturedAt,
    tableCount: Object.keys(snapshot.records ?? {}).length, format: snapshot.format,
    restoreVerified: false, objectBackup };
}

async function main() {
  if (!process.argv.includes("--hosted-read-only")) throw new Error("Use explicit --hosted-read-only to inspect the configured database; no hosted writes are performed");
  const source = await readFile(new URL("files/Stock, Delivery, Due list.xlsx", root));
  const runtime = await inspectDatabase(process.env.DATABASE_RUNTIME_URL ? "DATABASE_RUNTIME_URL" : "DATABASE_URL", hash(source));
  const migration = await inspectDatabase("DATABASE_MIGRATION_URL", hash(source));
  const ctx = createContext();
  stage = "administrator-metadata";
  const administratorChecks: Record<string, unknown>[] = [];
  try {
    for (const row of runtime.administrators) {
      const own = row.auth_user_id ? await ctx.admin.auth.admin.getUserById(row.auth_user_id) : null;
      const user = own?.data.user;
      const available = !own?.error;
      administratorChecks.push({ configuredAdministrator: row.email.toLowerCase() === process.env.SUPER_ADMIN_EMAIL?.toLowerCase(),
        identityLookupSucceeded: available, lookupHttpStatus: own?.error?.status ?? null,
        identityMapped: available ? !!user : null, emailMatchesEmployee: available ? user?.email?.toLowerCase() === row.email.toLowerCase() : null,
        emailConfirmed: available ? !!user?.email_confirmed_at : null, hasPriorSignIn: available ? !!user?.last_sign_in_at : null,
        verifiedTotpFactors: available ? user?.factors?.filter((f) => f.factor_type === "totp" && f.status === "verified").length ?? 0 : null });
    }
  } finally { await ctx.client.end(); }
  stage = "source-and-local-backup";
  const evidence = {
    capturedAt: new Date().toISOString(), readOnly: true, sqlTransactionsVerifiedReadOnly: true,
    git: { head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), branch: execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim() },
    localMode: { api: process.env.ERP_BACKEND_MODE ?? "mock", browser: process.env.VITE_BACKEND_MODE ?? "mock", helperOverridesToFoundation: true },
    database: { runtime: { role: { ...runtime.role, role: undefined }, tables: runtime.tables, migration: runtime.migration, dataApiAccess: runtime.access }, migrationConnection: { migration: migration.migration },
      runtimeAndMigrationUseSameRole: runtime.role.role === migration.role.role,
      batchSourceColumns: runtime.batchSources, stockIntegrity: runtime.integrity, movementTypes: runtime.movements, ledgerIntegrity: runtime.ledgerIntegrity, holdIntegrity: runtime.holdIntegrity, stockControlIntegrity: runtime.stockControlIntegrity, returnIntegrity: runtime.returnIntegrity, payrollIntegrity: runtime.payrollIntegrity, supplierClaimIntegrity: runtime.claimIntegrity, privateStorageInventory: runtime.objects },
    inspectionEvidenceIntegrity: runtime.qualityIntegrity,
    administrators: administratorChecks, source: { name: "Stock, Delivery, Due list.xlsx", bytes: source.length, sha256: hash(source), posted: runtime.sourceOpening.posted_lines > 0 },
    localBackup: await inspectBackup(),
    limits: ["No hosted SQL/Auth/Storage writes or email sends; only local audit evidence is saved", "Metadata and checksum checks do not establish restore success", "Administrator metadata does not prove human inbox receipt or current-session MFA", "No production or staging authorization is inferred"]
  };
  const folder = new URL("artifacts/update13/", root); await mkdir(folder, { recursive: true });
  const path = new URL(`readonly-audit-${Date.now()}.json`, folder);
  await writeFile(path, JSON.stringify(evidence, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(evidence, null, 2));
  console.log("Redacted audit evidence saved under ignored artifacts/update13. No restore or release gate is marked passed by this command.");
}

main().catch((error) => {
  const code = String(error?.code ?? error?.cause?.code ?? "AUDIT_CHECK");
  console.error("Read-only audit could not finish", { stage, code: /^[A-Z0-9_]{1,40}$/.test(code) ? code : "AUDIT_CHECK" });
  process.exitCode = 1;
});
