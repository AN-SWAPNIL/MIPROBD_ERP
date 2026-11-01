import { execFileSync } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const project="hyttuapvvqqxcyhojbwq",origin="https://mipro-erp-staging.vercel.app";
const cli=new URL("../node_modules/supabase/dist/supabase.js",import.meta.url);
const hash=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
function command(args){try{return execFileSync(process.execPath,[cli.pathname.replace(/^\/([A-Za-z]:)/,"$1"),...args,"--project-ref",project,"--output-format","json"],{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:60000,maxBuffer:4*1024*1024});}catch{throw new Error("Auth configuration command failed; provider output withheld.");}}
const before=JSON.parse(command(["config","diff"]));
const allowed=new Set(["auth.site_url","auth.additional_redirect_urls"]);
const declared=before.changes.filter(c=>c.declared);
if(declared.some(c=>!allowed.has(c.path.join("."))))throw new Error("Unexpected declared Auth changes; refusing to change SMTP, templates or security settings.");
const config=await readFile(new URL("../supabase/config.toml",import.meta.url),"utf8");
if(!config.includes(`site_url = "${origin}"`))throw new Error("Staging Auth target mismatch.");
if(!process.argv.includes("--apply")){console.log(JSON.stringify({reviewOnly:true,changedKeys:declared.map(c=>c.path.join(".")),unchangedRemoteOnlySettings:before.changes.filter(c=>!c.declared).length}));}
else{
 const result=command(["config","push","--yes"]);
 await writeFile(new URL(`../artifacts/private/staging-auth-push-${Date.now()}.json`,import.meta.url),result,{flag:"wx",mode:0o600});
 const after=JSON.parse(command(["config","diff"]));
 if(after.changes.some(c=>c.declared))throw new Error("Declared staging Auth configuration did not converge.");
 const other=before.changes.filter(c=>!c.declared);
 if(other.some(c=>!after.changes.some(a=>!a.declared&&a.path.join(".")===c.path.join(".")&&hash(a.remote)===hash(c.remote))))throw new Error("A previously unmanaged provider setting changed; review the private diff.");
 console.log(JSON.stringify({configured:true,siteUrl:origin,changedKeys:declared.map(c=>c.path.join(".")),localhostRedirectsRetained:true,unmanagedSettingsUnchanged:other.length}));
}
