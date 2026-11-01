import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { strToU8,zipSync } from "fflate";
import { attachmentMime,attachmentMetadataMatches,hasDocumentPreview,officeMimes } from "../../src/lib/files/attachments.js";
import { qualityFileInput } from "../../src/domains/quality/contracts.js";
import { uploadSchema } from "./contracts.js";
import { inspectBusinessFile } from "./attachment-files.js";
import { inspectQualityFile } from "../quality/router.js";
import { officeFixture } from "../testing/attachment-fixtures.js";

test("business attachments normalize browser aliases without trusting renamed extensions",()=>{
 assert.equal(attachmentMime("PRICES.XLSX",""),officeMimes.xlsx);
 assert.equal(attachmentMime("prices.csv","application/vnd.ms-excel"),"text/csv");
 assert.equal(attachmentMime("inspection.docx","application/zip"),officeMimes.docx);
 for(const name of ["unsafe.exe","macro.xlsm","archive.zip","old.doc","old.xls","script.html","file.constructor","file.__proto__","xlsx","hidden\u202e.xlsx"])assert.throws(()=>attachmentMime(name,""));
 assert.throws(()=>attachmentMime("photo.png",officeMimes.docx));assert.equal(attachmentMetadataMatches("fake.docx",officeMimes.xlsx),false);
 assert.equal(hasDocumentPreview(officeMimes.docx),false);assert.equal(hasDocumentPreview("application/pdf"),true);
});
test("Office attachments have exact byte hashes and matching package/manifest types",async()=>{
 for(const kind of ["xlsx","docx","pptx"] as const){const bytes=officeFixture(kind),mime=officeMimes[kind],expected=createHash("sha256").update(bytes).digest("hex");assert.equal(inspectBusinessFile(bytes,mime).sha256,expected);assert.equal((await inspectQualityFile(bytes,mime)).sha256,expected);assert.throws(()=>inspectBusinessFile(bytes,kind==="xlsx"?officeMimes.docx:officeMimes.xlsx));}
});
test("Office attachments reject macros, embedded packages, external data, traversal and ZIP bombs",()=>{
 for(const path of ["word/vbaProject.bin","word/embeddings/oleObject1.bin","../escape","xl/externalLinks/externalLink1.xml","word/activeX/control.bin","xl/connections.xml","xl/queryTables/query1.xml","xl/macroSheets/sheet1.xml"])assert.throws(()=>inspectBusinessFile(officeFixture("docx",{[path]:strToU8("unsafe")}),officeMimes.docx));
 const external=strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" TargetMode="External" Target="https://example.invalid/template"/></Relationships>');
 assert.throws(()=>inspectBusinessFile(officeFixture("docx",{"word/_rels/document.xml.rels":external}),officeMimes.docx));
 assert.throws(()=>inspectBusinessFile(officeFixture("docx",{"word/media/oversized.bin":new Uint8Array(13*1024*1024)}),officeMimes.docx));
 assert.throws(()=>inspectBusinessFile(Buffer.from("PK not a package"),officeMimes.docx));
 assert.throws(()=>inspectBusinessFile(Buffer.from(zipSync({"[Content_Types].xml":strToU8('<!DOCTYPE Types [<!ENTITY x SYSTEM "file:///private">]><Types>&x;</Types>'),"_rels/.rels":strToU8("<Relationships/>"),"word/document.xml":strToU8("<document/>")})),officeMimes.docx));
});
test("text/CSV attachments remain opaque UTF-8 evidence and reject binary/mislabeled files",()=>{
 assert.ok(inspectBusinessFile(Buffer.from("Product,Quantity\r\nDialyzer,12"),"text/csv").sha256);
 assert.ok(inspectBusinessFile(Buffer.from("Field inspection notes"),"text/plain").sha256);
 assert.throws(()=>inspectBusinessFile(Buffer.from([0,255,0,1]),"text/csv"));assert.throws(()=>inspectBusinessFile(officeFixture("xlsx"),"text/plain"));
});
test("document workflows accept Office while avatar/check-in/opening-photo purposes stay image-only",()=>{
 const input={fileName:"prices.xlsx",mimeType:officeMimes.xlsx,sizeBytes:500};
 for(const parent of [{purpose:"employee-evidence",employeeId:"employee"},{purpose:"import-document",importId:"import",documentType:"PI"},{purpose:"expense-receipt"},{purpose:"marketing-evidence"}])assert.ok(uploadSchema.safeParse({...input,...parent}).success);
 assert.equal(uploadSchema.safeParse({...input,purpose:"employee-avatar",employeeId:"employee"}).success,false);
 assert.equal(uploadSchema.safeParse({...input,purpose:"field-visit-evidence",visitAttemptId:"attempt"}).success,false);
 assert.ok(qualityFileInput.safeParse({...input,version:1}).success);assert.equal(qualityFileInput.safeParse({...input,version:1,mimeType:officeMimes.docx}).success,false);
});
