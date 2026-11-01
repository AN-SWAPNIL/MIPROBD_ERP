import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { qualityFileInput,qualityWithdrawal } from "../../src/domains/quality/contracts.js";
import { inspectQualityFile } from "./router.js";
import { qualityRead,qualityWrite,type QualitySource } from "./service.js";
import type { User } from "../../src/types/index.js";

test("inspection authorization is optional, bounded and cannot choose a source or uploader",()=>{
 const input={version:1,fileName:"inspection.png",mimeType:"image/png",sizeBytes:100};
 assert.equal(qualityFileInput.parse(input).sensitive,false);
 for(const patch of [{uploadedBy:"other"},{qualityResourceId:"other"},{version:0},{fileName:"../private.pdf"},{mimeType:"image/svg+xml"},{sizeBytes:5*1024*1024+1},{sizeBytes:0}])assert.equal(qualityFileInput.safeParse({...input,...patch}).success,false);
 assert.equal(qualityWithdrawal.safeParse({version:1,reason:"bad"}).success,false);
 assert.equal(qualityWithdrawal.safeParse({version:1,reason:"Replaced by clearer inspection"}).success,true);
});
test("inspection bytes are fully decoded, MIME checked and hashed",async()=>{
 const png=await sharp({create:{width:32,height:32,channels:3,background:"white"}}).png().toBuffer();
 const result=await inspectQualityFile(png,"image/png");assert.equal(result.sha256,createHash("sha256").update(png).digest("hex"));assert.equal(result.imageInfo?.width,32);
 await assert.rejects(inspectQualityFile(png,"image/jpeg"));await assert.rejects(inspectQualityFile(png.subarray(0,40),"image/png"));await assert.rejects(inspectQualityFile(Buffer.from("not a file"),"image/png"));
 const small=await sharp({create:{width:1,height:1,channels:3,background:"white"}}).png().toBuffer();await assert.rejects(inspectQualityFile(small,"image/png"));
});
test("inspection PDF requires complete framing and retains original hash",async()=>{
 const pdf=Buffer.from("%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF\n");assert.equal((await inspectQualityFile(pdf,"application/pdf")).sha256,createHash("sha256").update(pdf).digest("hex"));
 await assert.rejects(inspectQualityFile(Buffer.from("%PDF-1.4 incomplete"),"application/pdf"));await assert.rejects(inspectQualityFile(Buffer.alloc(5*1024*1024+1),"application/pdf"));
});
test("inspection access honors explicit grants, denies, preparation and own-customer scope",()=>{
 const user:User={id:"maker",name:"Test",email:"quality@example.invalid",role:"Sales Executive",title:"Test",department:"Test",phone:"",avatarUrl:"",status:"Active",capabilities:[],permissionOverrides:[]};
 const source:QualitySource={kind:"Stock Control",sourceId:"source",reference:"QA-1",state:"Draft",version:1,payloadHash:"a".repeat(64),preparerIds:["maker"],ownerId:null};
 assert.throws(()=>qualityRead(user,source));
 const delegated:User={...user,permissionOverrides:[{permission:"inventory",action:"view",effect:"ALLOW"},{permission:"inventory",action:"post",effect:"ALLOW"}]};qualityRead(delegated,source);qualityWrite(delegated,source,1);
 assert.throws(()=>qualityWrite(delegated,{...source,preparerIds:["other"]},1));assert.throws(()=>qualityWrite(delegated,source,2));assert.throws(()=>qualityWrite(delegated,{...source,state:"Submitted"},1));assert.throws(()=>qualityRead({...delegated,status:"Inactive"},source));
 assert.throws(()=>qualityRead({...delegated,permissionOverrides:[{permission:"inventory",action:"view",effect:"DENY"}]},source));
 qualityRead(user,{...source,kind:"Customer Return",ownerId:user.id});assert.throws(()=>qualityRead(user,{...source,kind:"Customer Return",ownerId:"other"}));
});

test("replacement evidence belongs to its warehouse preparer, not the original claim preparer",()=>{
 const user:User={id:"warehouse",name:"Test",email:"replacement@example.invalid",role:"Warehouse Manager",title:"Test",department:"Test",phone:"",avatarUrl:"",status:"Active",capabilities:[],permissionOverrides:[]};
 const source:QualitySource={kind:"Supplier Replacement Receipt",sourceId:"receipt",reference:"SRR-1",state:"Draft",version:1,payloadHash:"a".repeat(64),preparerIds:[user.id],ownerId:null};
 qualityRead(user,source);qualityWrite(user,source,1);
 assert.throws(()=>qualityWrite({...user,id:"other"},source,1));
 assert.throws(()=>qualityWrite(user,{...source,state:"Submitted"},2));
 assert.throws(()=>qualityWrite(user,{...source,state:"Posted"},3));
 assert.throws(()=>qualityWrite({...user,role:"Accounts"},source,1));
 assert.throws(()=>qualityRead({...user,role:"Sales Executive"},source));
});
