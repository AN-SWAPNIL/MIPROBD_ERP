import "../server/config.js";
import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { connectDatabase } from "../database/client.js";

const runtime=new URL(`../${process.env.ERP_RUNTIME_ENV_FILE ?? "artifacts/private/runtime-database.env"}`,import.meta.url);
if(existsSync(runtime))loadEnvFile(runtime);
const tables=["employees","products","suppliers","customers","import_cases","stock_batches","stock_movements","quotations","sales_orders","deliveries","sales_invoices","collections","expenses","documents","opening_sources","opening_positions","ledger_journals"];
let stage="runtime connection";
async function inspect(variable,run){
 const url=process.env[variable];if(!url)throw new Error("Configuration missing");const {client}=connectDatabase(url);let session;
 try{session=await client.connect();await session.query("begin isolation level repeatable read read only");if((await session.query("show transaction_read_only")).rows[0].transaction_read_only!=="on")throw new Error("Read-only guard failed");return await run(session);}finally{if(session){await session.query("rollback").catch(()=>{});session.release();}await client.end();}
}
try{
 const data=await inspect(process.env.DATABASE_RUNTIME_URL?"DATABASE_RUNTIME_URL":"DATABASE_URL",async c=>{
  stage="runtime aggregate queries";
  const counts={};for(const table of tables)counts[table]=(await c.query(`select count(*)::int n from erp_private.${table}`)).rows[0].n;
  const labelled=(await c.query(`select
   (select count(*)::int from erp_private.employees where id like 'test-%' or email like '%@example.invalid') reserved_test_employee_rows,
   (select count(*)::int from erp_private.products where name ilike 'DEV TEST %') labelled_test_products,
   (select count(*)::int from erp_private.suppliers where name ilike 'DEV TEST %') labelled_test_suppliers,
   (select count(*)::int from erp_private.customers where name ilike 'DEV TEST %') labelled_test_customers,
   (select count(*)::int from erp_private.stock_batches b join erp_private.products p on p.id=b.product_id where p.name ilike 'DEV TEST %' or b.lot_number ilike 'DEV TEST %' or b.lot_number like 'TEST-%') labelled_test_batches,
   (select count(*)::int from erp_private.employees where status='Active' and (id like 'test-%' or email like '%@example.invalid')) active_reserved_test_employee_rows,
   (select count(*)::int from erp_private.ledger_configurations where state='Approved') approved_ledger_mappings,
   (select count(*)::int from erp_private.opening_drafts where state in('Posted','Reconciled')) posted_opening_schedules
  `)).rows[0];
  const policies=(await c.query("select domain,state,count(*)::int count from erp_private.approval_policies group by domain,state order by domain,state")).rows;
  const employeeStatus=(await c.query("select status,count(*)::int count from erp_private.employees group by status order by status")).rows;
  const jobs=(await c.query("select state,count(*)::int count from erp_private.invitation_jobs group by state order by state")).rows;
  stage="visit policy query";
  const visitPolicy=(await c.query("select version,data->>'privacyApproved' privacy_approved,data->>'photoRetentionDays' photo_retention_days from erp_private.field_visit_policies where id='company'")).rows[0]??null;
  return{counts,labelled,policies,employeeStatus,invitationJobs:jobs,visitPolicy};
 });
 stage="storage metadata connection/query";
 const storage=await inspect("DATABASE_MIGRATION_URL",async c=>(await c.query(`select
  (select count(*)::int from storage.objects where bucket_id='erp-documents') document_objects,
  count(*)::int attached_document_references,
  count(*) filter(where o.id is null)::int missing_object_metadata,
  count(*) filter(where o.id is null and d.file_name ilike '%test%') missing_test_named_references
  from erp_private.documents d left join storage.objects o on o.bucket_id=d.bucket and o.name=d.object_path where d.status='Attached'
 `)).rows[0]);
 console.log(JSON.stringify({capturedAt:new Date().toISOString(),readOnly:true,releaseCertificate:false,...data,storage,limits:["Label counts are evidence of test-labelled history, not a deletion or real-data classification rule.","Unlabelled rows require provenance review; neither balances nor personal identities are printed.","Storage metadata existence does not prove file bytes are recoverable or that restoration succeeded.","No users, files, financial records, policies, settings or deployments were changed."]},null,2));
}catch(error){const code=typeof error?.code==="string"&&/^[A-Z0-9_]{2,32}$/.test(error.code)?error.code:"WITHHELD";console.error(JSON.stringify({error:"Read-only review audit failed; provider details and credentials withheld.",stage,code}));process.exitCode=1;}
