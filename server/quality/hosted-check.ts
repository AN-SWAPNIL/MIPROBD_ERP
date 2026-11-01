import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { eq, sql } from "drizzle-orm";
import { documents, qualityResources, qualitySeals } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { hostedHarness } from "../testing/hosted.js";
import { qualityEvidenceSchema, qualityUploadSchema } from "../../src/domains/quality/contracts.js";
import type { QualityKind } from "../../src/domains/quality/contracts.js";

export async function checkOptionalSourceEvidence(h:Awaited<ReturnType<typeof hostedHarness>>,tx:Transaction,kind:QualityKind,id:string,version:number,actor:{token:string},objects:string[]){
 const base=`/quality-evidence/${encodeURIComponent(kind)}/${id}`,png=await sharp({create:{width:32,height:32,channels:3,background:"white"}}).png().toBuffer();
 const file=qualityUploadSchema.parse(await h.expect(`${base}/uploads`,actor.token,{version,fileName:"inspection.png",mimeType:"image/png",sizeBytes:png.length},201,h.key(`source-file-${id.slice(-12)}`)));
 const [row]=await tx.select().from(documents).where(eq(documents.id,file.id));objects.push(row.objectPath);
 assert.equal((await fetch(file.signedUrl,{method:"PUT",headers:{"Content-Type":"image/png"},body:new Uint8Array(png)})).ok,true);await h.expect(`/quality-evidence/uploads/${file.id}/complete`,actor.token,{});
 const data=qualityEvidenceSchema.parse(await h.expect(base,actor.token)),attached=data.files.find(f=>f.id===file.id);assert.ok(attached);assert.equal(attached.state,"Attached");assert.equal(attached.sha256,createHash("sha256").update(png).digest("hex"));
}

export async function checkDraftEvidence(h:Awaited<ReturnType<typeof hostedHarness>>,tx:Transaction,sourceId:string,version:number,maker:{id:string;token:string},warehouse:{token:string},reviewer:{token:string},objects:string[]){
 const base=`/quality-evidence/Stock%20Control/${sourceId}`;
 const read=async(token=maker.token)=>qualityEvidenceSchema.parse(await h.expect(base,token));
 assert.equal((await read()).files.length,0);assert.equal((await read()).sealed,false);
 const png=await sharp({create:{width:48,height:32,channels:3,background:"#e0f2fe"}}).png().toBuffer();
 const auth=async(name:string,sensitive=false)=>qualityUploadSchema.parse(await h.expect(`${base}/uploads`,maker.token,{version,fileName:name,mimeType:"image/png",sizeBytes:png.length,sensitive},201,h.key(`file-${name.replace(/[^a-z0-9-]/gi,"-")}`)));
 await h.expect(`${base}/uploads`,reviewer.token,{version,fileName:"forbidden.png",mimeType:"image/png",sizeBytes:png.length},403,h.key("other-uploader"));
 await h.expect(`${base}/uploads`,maker.token,{version:version+1,fileName:"stale.png",mimeType:"image/png",sizeBytes:png.length},409,h.key("stale-file"));
 const first=await auth("inspection.png");const [row]=await tx.select().from(documents).where(eq(documents.id,first.id));objects.push(row.objectPath);
 assert.equal((await read()).files[0].state,"Pending");
 const stored=await fetch(first.signedUrl,{method:"PUT",headers:{"Content-Type":"image/png"},body:new Uint8Array(png)});assert.equal(stored.ok,true,"Private signed upload accepts only the new synthetic object");
 assert.equal((await fetch(first.signedUrl,{method:"PUT",headers:{"Content-Type":"image/png"},body:new Uint8Array(png)})).ok,false,"The same authorization must not overwrite saved bytes");
 await h.expect(`/uploads/${first.id}/complete`,maker.token,{},409);
 await h.expect(`/quality-evidence/uploads/${first.id}/complete`,reviewer.token,{},403);
 await h.expect(`/quality-evidence/uploads/${first.id}/complete`,maker.token,{});
 await h.expect(`/quality-evidence/uploads/${first.id}/complete`,maker.token,{});
 assert.equal((await read()).files[0].sha256,createHash("sha256").update(png).digest("hex"));
 const link=await h.expect(`/documents/${first.id}`,warehouse.token);assert.ok(link.url);const downloaded=await fetch(link.url);assert.equal(createHash("sha256").update(Buffer.from(await downloaded.arrayBuffer())).digest("hex"),createHash("sha256").update(png).digest("hex"));
 await h.expect(`${base}/uploads`,maker.token,{version,fileName:"forbidden-commercial.png",mimeType:"image/png",sizeBytes:png.length,sensitive:true},403,h.key("forbidden-sensitive"));
 const restricted=await auth("second-inspection.png");const [secret]=await tx.select().from(documents).where(eq(documents.id,restricted.id));objects.push(secret.objectPath);
 assert.equal((await fetch(restricted.signedUrl,{method:"PUT",headers:{"Content-Type":"image/png"},body:new Uint8Array(png)})).ok,true);await h.expect(`/quality-evidence/uploads/${restricted.id}/complete`,maker.token,{});
 assert.equal((await read(warehouse.token)).files.some(f=>f.id===restricted.id),true);
 await h.expect(`${base}/withdraw/${first.id}`,maker.token,{version,reason:"DEV TEST superseded photograph"});assert.equal((await read()).files.find(f=>f.id===first.id)?.state,"Withdrawn");await h.expect(`/documents/${first.id}`,maker.token);
 const pending=await auth("cancelled.png");await h.expect(`${base}/withdraw/${pending.id}`,maker.token,{version,reason:"DEV TEST cancel pending upload"});assert.equal((await read()).files.find(f=>f.id===pending.id)?.state,"Expired");
 await assert.rejects(tx.transaction(n=>n.update(documents).set({sha256:"0".repeat(64)}).where(eq(documents.id,restricted.id))));
 await assert.rejects(tx.transaction(n=>n.delete(documents).where(eq(documents.id,restricted.id))));
 return{activeId:restricted.id,withdrawnId:first.id};
}
export async function checkCommercialEvidence(h:Awaited<ReturnType<typeof hostedHarness>>,tx:Transaction,sourceId:string,version:number,maker:{token:string},warehouse:{token:string},objects:string[]){
 const base=`/quality-evidence/Stock%20Control/${sourceId}`,png=await sharp({create:{width:32,height:32,channels:3,background:"white"}}).png().toBuffer();
 const upload=qualityUploadSchema.parse(await h.expect(`${base}/uploads`,maker.token,{version,fileName:"commercial-cost.png",mimeType:"image/png",sizeBytes:png.length,sensitive:true},201,h.key("commercial-evidence")));
 const [d]=await tx.select().from(documents).where(eq(documents.id,upload.id));objects.push(d.objectPath);
 await h.expect(`/inventory/controls/${sourceId}/submit`,maker.token,{version},409);
 assert.equal((await fetch(upload.signedUrl,{method:"PUT",headers:{"Content-Type":"image/png"},body:new Uint8Array(png)})).ok,true);await h.expect(`/quality-evidence/uploads/${upload.id}/complete`,maker.token,{});
 const wh=qualityEvidenceSchema.parse(await h.expect(base,warehouse.token));assert.equal(wh.restrictedFiles,1);assert.equal(wh.files.some(f=>f.id===upload.id),false);await h.expect(`/documents/${upload.id}`,warehouse.token,undefined,403);
}
export async function checkSealedEvidence(h:Awaited<ReturnType<typeof hostedHarness>>,tx:Transaction,sourceId:string,token:string,activeId:string){
 const base=`/quality-evidence/Stock%20Control/${sourceId}`,data=qualityEvidenceSchema.parse(await h.expect(base,token));assert.equal(data.sealed,true);assert.equal(data.canEdit,false);assert.ok(data.files.find(f=>f.id===activeId)?.inherited);
 const [r]=await tx.select().from(qualityResources).where(eq(qualityResources.stockControlId,sourceId));const [seal]=await tx.select().from(qualitySeals).where(eq(qualitySeals.resourceId,r.id));assert.equal(seal.snapshot.files.length,2);assert.equal(seal.snapshot.withdrawals.length,1);assert.ok(seal.snapshot.files.some(f=>f.id===activeId));
 const [row]=(await tx.execute<{hash:string}>(sql`select context->>'qualityEvidenceHash' hash from erp_private.approval_requests where context->>'qualitySealId'=${seal.id}`)).rows;assert.equal(row.hash,seal.hash);
 await h.expect(`${base}/uploads`,token,{version:data.version,fileName:"late.png",mimeType:"image/png",sizeBytes:100},409,h.key("late-evidence"));await h.expect(`${base}/withdraw/${activeId}`,token,{version:data.version,reason:"DEV TEST forbidden frozen edit"},409);
 await assert.rejects(tx.transaction(n=>n.update(qualitySeals).set({hash:"0".repeat(64)}).where(eq(qualitySeals.id,seal.id))));
}
