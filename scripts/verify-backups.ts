import { createHash } from "node:crypto";
import { mkdir,readFile,readdir,realpath,stat,writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { sep } from "node:path";
import { z } from "zod";
import { existsSync } from "node:fs";

const digest=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const manifestSchema=z.object({format:z.literal("mipro-object-backup-v1"),state:z.literal("Complete"),projectRef:z.string().min(1),capturedAt:z.iso.datetime(),objects:z.array(z.object({bucket:z.enum(["erp-documents","website-media","erp-opening-sources"]),path:z.string().min(1).max(2048),sha256:z.string().regex(/^[a-f0-9]{64}$/),sizeBytes:z.number().int().min(1).max(10485760)})).max(1000)});
const databaseSchema=z.object({format:z.literal("mipro-erp-backup-v1"),projectRef:z.string(),capturedAt:z.iso.datetime(),schema:z.literal("erp_private"),records:z.record(z.string(),z.array(z.record(z.string(),z.unknown())))});
async function boundedRead(path:URL,limit:number,within:URL){
  const base=await realpath(within),resolved=await realpath(path),prefix=base.endsWith(sep)?base:base+sep;
  if(!(process.platform==="win32"?resolved.toLowerCase().startsWith(prefix.toLowerCase()):resolved.startsWith(prefix))||(await stat(resolved)).size>limit)throw new Error("Backup path/size is outside its approved boundary");
  return readFile(resolved);
}
export async function verifyLocalBackups(folder=new URL("../artifacts/backups/",import.meta.url)){
  const entries=await readdir(folder,{withFileTypes:true});
  const dbName=entries.filter((e)=>e.isFile()&&/^database-\d+\.json$/.test(e.name)).map((e)=>e.name).sort((a,b)=>Number(b.slice(9,-5))-Number(a.slice(9,-5)))[0];
  const objectName=entries.filter((e)=>e.isDirectory()&&/^storage-\d+$/.test(e.name)).map((e)=>e.name).sort((a,b)=>Number(b.slice(8))-Number(a.slice(8)))[0];
  if(!dbName||!objectName)throw new Error("A database backup and complete object backup are both required");
  const dbBytes=await boundedRead(new URL(dbName,folder),100*1024*1024,folder),dbHash=(await boundedRead(new URL(`${dbName}.sha256`,folder),100,folder)).toString("utf8").trim();
  if(digest(dbBytes)!==dbHash)throw new Error("Database backup checksum does not match");const database=databaseSchema.parse(JSON.parse(dbBytes.toString("utf8")));
  const objectRoot=new URL(`${objectName}/`,folder),manifestBytes=await boundedRead(new URL("manifest.json",objectRoot),2*1024*1024,objectRoot),manifestHash=(await boundedRead(new URL("manifest.sha256",objectRoot),100,objectRoot)).toString("utf8").trim();
  if(digest(manifestBytes)!==manifestHash)throw new Error("Object manifest checksum does not match");const manifest=manifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
  if(database.projectRef!==manifest.projectRef)throw new Error("Database and objects belong to different projects");
  const verified=new Set<string>(),objects=new Map<string,z.infer<typeof manifestSchema>["objects"][number]>();let totalBytes=0;
  for(const object of manifest.objects){const key=`${object.bucket}/${object.path}`;if(objects.has(key))throw new Error("Duplicate object identity in backup");objects.set(key,object);totalBytes+=object.sizeBytes;if(totalBytes>250*1024*1024)throw new Error("Object backup exceeds approved bound");
    if(!verified.has(object.sha256)){const bytes=await boundedRead(new URL(`objects/${object.sha256}`,objectRoot),10485760,objectRoot);if(bytes.length!==object.sizeBytes||digest(bytes)!==object.sha256)throw new Error("Private object bytes do not match manifest");verified.add(object.sha256);}
    else if((await stat(new URL(`objects/${object.sha256}`,objectRoot))).size!==object.sizeBytes)throw new Error("Duplicate content has inconsistent recorded size");
  }
  const links:(Record<string,unknown>&{bucket:string;object_path:string})[]=[];
  for(const d of database.records.documents??[])if(d.status==="Attached"&&typeof d.bucket==="string"&&typeof d.object_path==="string")links.push({...d,bucket:d.bucket,object_path:d.object_path});
  for(const d of database.records.opening_sources??[])if(d.state==="Ready"&&typeof d.object_path==="string")links.push({...d,bucket:"erp-opening-sources",object_path:d.object_path});
  const missing:Record<string,unknown>[]=[],mismatched:Record<string,unknown>[]=[];
  for(const link of links){const object=objects.get(`${link.bucket}/${link.object_path}`);if(!object){missing.push({id:link.id,bucket:link.bucket,path:link.object_path});continue;}const info=link.image_info as {sha256?:unknown}|undefined,expected=typeof link.sha256==="string"?link.sha256:typeof info?.sha256==="string"?info.sha256:null;
    if(Number(link.size_bytes)!==object.sizeBytes||expected&&expected!==object.sha256)mismatched.push({id:link.id,bucket:link.bucket,path:link.object_path});
  }
  const missingTestNamedFiles=missing.filter((m)=>links.some((l)=>l.id===m.id&&/^(?:DEV TEST\b|TEST\b|test[-.])/i.test(String(l.file_name??"")))).length;
  return{format:"mipro-backup-verification-v1",projectRef:database.projectRef,verifiedAt:new Date().toISOString(),databaseBackup:dbName,objectBackup:objectName,databaseChecksumVerified:true,manifestChecksumVerified:true,objectBytesVerified:true,privateTables:Object.keys(database.records).length,objects:manifest.objects.length,uniqueContentFiles:verified.size,totalBytes,linkedFiles:links.length,missingLinkedFiles:missing.length,missingTestNamedFiles,mismatchedLinkedFiles:mismatched.length,unreferencedObjects:[...objects.keys()].filter((key)=>!links.some((l)=>`${l.bucket}/${l.object_path}`===key)).length,captureSkewSeconds:Math.abs(Date.parse(database.capturedAt)-Date.parse(manifest.capturedAt))/1000,referentiallyComplete:missing.length===0&&mismatched.length===0,hostedRestoreVerified:false,offsite:false,privateDiagnostics:{missing,mismatched}};
}
async function main(){
  await import("../server/config.js");
  const ref=new URL(process.env.SUPABASE_URL!).hostname.split(".")[0];if(!/^[a-z]{20}$/.test(ref))throw new Error("Unexpected verification project identity");
  const scoped=new URL(`../artifacts/backups/${ref}/`,import.meta.url),folder=existsSync(scoped)?scoped:new URL("../artifacts/backups/",import.meta.url);
  const result=await verifyLocalBackups(folder);if(result.projectRef!==ref)throw new Error("Selected backups do not belong to the configured project");
  await mkdir(folder,{recursive:true});await writeFile(new URL(`verification-${Date.now()}.json`,folder),JSON.stringify(result,null,2),{flag:"wx",mode:0o600});const {privateDiagnostics:_private,...summary}=result;void _private;console.log(JSON.stringify(summary,null,2));if(!result.referentiallyComplete)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error("Local backup verification failed; private file contents, object paths and credentials withheld. Originals were not changed.");process.exitCode=1;});
