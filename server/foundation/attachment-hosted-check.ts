import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { documents } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { hostedHarness } from "../testing/hosted.js";
import { officeMimes } from "../../src/lib/files/attachments.js";
import { officeFixture } from "../testing/attachment-fixtures.js";

export async function checkBusinessAttachments(h:Awaited<ReturnType<typeof hostedHarness>>,tx:Transaction,importId:string,claimId:string,version:number,maker:{token:string},warehouse:{id:string;token:string},sales:{token:string},objects:string[]){
 const rows=[
  {actor:maker,parent:{purpose:"import-document",importId,documentType:"PI"},name:"supplier-prices.xlsx",mime:officeMimes.xlsx,bytes:officeFixture("xlsx")},
  {actor:maker,parent:{purpose:"employee-evidence",employeeId:warehouse.id},name:"employee-agreement.docx",mime:officeMimes.docx,bytes:officeFixture("docx")},
  {actor:maker,parent:{purpose:"expense-receipt"},name:"expense-schedule.csv",mime:"text/csv",bytes:Buffer.from("Expense,BDT\nTravel,300\n")},
  {actor:sales,parent:{purpose:"marketing-evidence"},name:"field-notes.txt",mime:"text/plain",bytes:Buffer.from("DEV TEST field activity notes")},
  {actor:maker,parent:{purpose:"import-document",importId,documentType:"Other"},name:"supplier-brief.pptx",mime:officeMimes.pptx,bytes:officeFixture("pptx")}
 ];
 for(const item of rows){
  const u=await h.expect("/uploads",item.actor.token,{...item.parent,fileName:item.name,mimeType:item.mime,sizeBytes:item.bytes.length},201),[row]=await tx.select().from(documents).where(eq(documents.id,u.id));objects.push(row.objectPath);
  assert.ok((await fetch(u.signedUrl,{method:"PUT",headers:{"Content-Type":item.mime},body:new Uint8Array(item.bytes)})).ok);
  await h.expect(`/uploads/${u.id}/complete`,item.actor.token,{});
  const read=await h.expect(`/documents/${u.id}`,item.actor.token);assert.equal(read.sha256,createHash("sha256").update(item.bytes).digest("hex"));
  assert.deepEqual(Buffer.from(await(await fetch(read.url)).arrayBuffer()),item.bytes);
  if(item.parent.purpose!=="marketing-evidence")await h.expect(`/documents/${u.id}`,sales.token,undefined,403);
 }
 const bytes=officeFixture("docx"),mime=officeMimes.docx,base=`/quality-evidence/Supplier%20Claim/${claimId}`;
 const u=await h.expect(`${base}/uploads`,maker.token,{version,fileName:"supplier-inspection.docx",mimeType:mime,sizeBytes:bytes.length},201,h.key("office-quality")),[row]=await tx.select().from(documents).where(eq(documents.id,u.id));objects.push(row.objectPath);
 assert.ok((await fetch(u.signedUrl,{method:"PUT",headers:{"Content-Type":mime},body:new Uint8Array(bytes)})).ok);
 await h.expect(`/quality-evidence/uploads/${u.id}/complete`,maker.token,{});
 assert.ok((await h.expect(base,maker.token)).files.some((f:{id:string;state:string})=>f.id===u.id&&f.state==="Attached"));
 const invalid=await h.expect("/uploads",maker.token,{purpose:"import-document",importId,documentType:"Other",fileName:"renamed.xlsx",mimeType:officeMimes.xlsx,sizeBytes:bytes.length},201),[bad]=await tx.select().from(documents).where(eq(documents.id,invalid.id));objects.push(bad.objectPath);
 assert.ok((await fetch(invalid.signedUrl,{method:"PUT",headers:{"Content-Type":officeMimes.xlsx},body:new Uint8Array(bytes)})).ok);
 await h.expect(`/uploads/${invalid.id}/complete`,maker.token,{},422);
 await h.expect(`/documents/${invalid.id}`,maker.token,undefined,404);
 console.log("Private Office/CSV/text uploads, protected reads, hash parity, unauthorized denial and mislabeled-package rejection pass");
}
