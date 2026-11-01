import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";
import { dirname,join } from "node:path";

const target="mipro-erp-staging",scope="answapnil2003-5154s-projects",origin="https://mipro-erp-staging.vercel.app";
if(!process.argv.includes("--apply"))throw new Error("Use --apply only for the authorized isolated staging project.");
const root=new URL("../",import.meta.url);
const link=JSON.parse(await readFile(new URL(".vercel/project.json",root),"utf8"));
if(link.projectName!==target)throw new Error("Refusing to configure any project other than the dedicated staging target.");
const cliPath=execFileSync("where.exe",["vercel.cmd"],{encoding:"utf8"}).trim().split(/\r?\n/)[0];
const cli=join(dirname(cliPath),"node_modules","vercel","dist","index.js");
function run(args,input){try{return execFileSync(process.execPath,[cli,...args,"--scope",scope],{input,encoding:"utf8",stdio:["pipe","pipe","pipe"],timeout:60000});}catch{throw new Error("Staging configuration command failed. Provider output withheld to protect secrets.");}}
const project=JSON.parse(run(["api",`/v9/projects/${link.projectId}`,"--raw"]));
if(project.name!==target||project.id!==link.projectId)throw new Error("Staging project identity mismatch.");
const local=parseEnv(await readFile(new URL(".env",root),"utf8"));
const runtime=parseEnv(await readFile(new URL("artifacts/private/runtime-database.env",root),"utf8"));
const database=runtime.DATABASE_RUNTIME_URL;
if(!database||!new URL(database).username.startsWith("mipro_runtime"))throw new Error("A separate restricted runtime connection is required; migration credentials will not be deployed.");
for(const key of["SUPABASE_URL","SUPABASE_PUBLISHABLE_KEY","SUPABASE_SECRET_KEY"])if(!local[key])throw new Error(`Missing local configuration key: ${key}`);
const values={ERP_BACKEND_MODE:"foundation",VITE_BACKEND_MODE:"foundation",DEMO_MODE:"false",VITE_DEMO_MODE:"false",DEMO_DEPLOYMENT:"false",APP_URL:origin,ERP_REQUIRE_MFA:"true",ERP_REQUIRE_RESTRICTED_DB:"true",ERP_REQUIRE_LEDGER_CONFIGURATION:"true",DATABASE_RUNTIME_URL:database,SUPABASE_URL:local.SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY:local.SUPABASE_PUBLISHABLE_KEY,SUPABASE_SECRET_KEY:local.SUPABASE_SECRET_KEY,VITE_SUPABASE_URL:local.SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY:local.SUPABASE_PUBLISHABLE_KEY};
run(["api",`/v9/projects/${link.projectId}`,"--method","PATCH","--input","-","--silent"],JSON.stringify({framework:"vite",nodeVersion:"24.x",buildCommand:"npm run build",installCommand:"npm ci",outputDirectory:"dist"}));
const secrets=new Set(["DATABASE_RUNTIME_URL","SUPABASE_SECRET_KEY"]);
for(const[key,value]of Object.entries(values)){
 run(["env","add",key,"production","--force","--yes",secrets.has(key)?"--sensitive":"--no-sensitive"],`${value}\n`);
 console.log(`Configured staging ${key}${secrets.has(key)?" (sensitive; value withheld)":""}`);
}
console.log(`Configured ${target} only. Its Vercel Production environment is the stable staging URL, not the existing live-demo project. Migration credentials and local private files were not uploaded.`);
