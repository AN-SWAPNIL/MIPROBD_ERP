import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp,mkdir,writeFile,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename,dirname,join,resolve,sep } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyLocalBackups } from "../../scripts/verify-backups.js";

async function fixture(run:(root:URL,bytes:Uint8Array,sha:string)=>Promise<void>,missing=false){
  const folder=await mkdtemp(join(tmpdir(),"mipro-backup-test-")),root=pathToFileURL(folder+sep),objectRoot=new URL("storage-2/",root);const bytes=Buffer.from("DEV TEST backup bytes"),sha=createHash("sha256").update(bytes).digest("hex"),capturedAt=new Date().toISOString();
  const save=async(path:URL,value:unknown)=>{const data=JSON.stringify(value);await writeFile(path,data);await writeFile(new URL(path.href+".sha256"),createHash("sha256").update(data).digest("hex"));};
  try{await mkdir(new URL("objects/",objectRoot),{recursive:true});await writeFile(new URL(`objects/${sha}`,objectRoot),bytes);
    await save(new URL("database-1.json",root),{format:"mipro-erp-backup-v1",projectRef:"DEV-TEST",capturedAt,schema:"erp_private",records:{documents:[{id:"test",status:"Attached",bucket:"erp-documents",object_path:missing?"missing":"test",file_name:"DEV TEST proof",size_bytes:bytes.length}],opening_sources:[]}});
    const manifest={format:"mipro-object-backup-v1",state:"Complete",projectRef:"DEV-TEST",capturedAt,objects:[{bucket:"erp-documents",path:"test",sha256:sha,sizeBytes:bytes.length}]};const data=JSON.stringify(manifest);await writeFile(new URL("manifest.json",objectRoot),data);await writeFile(new URL("manifest.sha256",objectRoot),createHash("sha256").update(data).digest("hex"));await run(root,bytes,sha);
  }finally{assert.equal(dirname(resolve(folder)),resolve(tmpdir()));assert.match(basename(folder),/^mipro-backup-test-/);await rm(folder,{recursive:true,force:true});}
}
test("backup verification checks exact private bytes, manifest/database checksums and source links without reading hosted data",async()=>{
  await fixture(async(root,bytes,sha)=>{const result=await verifyLocalBackups(root);assert.equal(result.objectBytesVerified,true);assert.equal(result.referentiallyComplete,true);assert.equal(result.objects,1);assert.equal(result.hostedRestoreVerified,false);await writeFile(new URL(`storage-2/objects/${sha}`,root),Buffer.alloc(bytes.length,1));await assert.rejects(verifyLocalBackups(root));});
});
test("missing test evidence is reported, not fabricated or silently certified recoverable",async()=>{
  await fixture(async(root)=>{const result=await verifyLocalBackups(root);assert.equal(result.referentiallyComplete,false);assert.equal(result.missingLinkedFiles,1);assert.equal(result.missingTestNamedFiles,1);assert.equal(result.unreferencedObjects,1);assert.equal(result.hostedRestoreVerified,false);},true);
});
