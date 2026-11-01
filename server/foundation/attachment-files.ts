import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { SaxesParser } from "saxes";
import { officeMimes } from "../../src/lib/files/attachments.js";
import { HttpError } from "./errors.js";

const definitions = [
 {mime:officeMimes.xlsx,part:"xl/workbook.xml",type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"},
 {mime:officeMimes.docx,part:"word/document.xml",type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"},
 {mime:officeMimes.pptx,part:"ppt/presentation.xml",type:"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"}
];
function xml(bytes:Uint8Array,tag:(name:string,attrs:Record<string,string>)=>void){
 if(bytes.length>256*1024)throw new Error("Oversized package manifest");
 const parser=new SaxesParser({xmlns:true});
 parser.on("doctype",()=>{throw new Error("External entities are not allowed");});
 parser.on("opentag",node=>{const attrs:Record<string,string>={};for(const value of Object.values(node.attributes))attrs[value.local]=value.value;tag(node.local,attrs);});
 parser.write(new TextDecoder("utf-8",{fatal:true}).decode(bytes)).close();
}
export function inspectBusinessFile(bytes:Buffer,mime:string){
 if(!bytes.length||bytes.length>10*1024*1024)throw new HttpError(422,"Use a non-empty attachment of at most 10 MB.");
 const sha256=createHash("sha256").update(bytes).digest("hex"),definition=definitions.find(d=>d.mime===mime);
 if(definition){
  try{
   let expanded=0;const names=new Set<string>();
   const files=unzipSync(bytes,{filter(entry){
    const name=entry.name;
    expanded+=entry.originalSize;
    if(names.size>=1000||names.has(name)||expanded>32*1024*1024||entry.originalSize>12*1024*1024||[...name].some(c=>c.charCodeAt(0)<32)||/[\\:]/.test(name)||name.startsWith("/")||name.split("/").some(p=>p===".."||p===".")||/vbaProject|activeX|embeddings|externalLinks|customUI|macroSheets|queryTables|connections\.xml/i.test(name))throw new Error("Unsupported Office package");
    names.add(name);return true;
   }});
   const manifest=files["[Content_Types].xml"];if(!manifest||!files[definition.part]?.length||!files["_rels/.rels"])throw new Error("Wrong package type");
   let main=false,root=false;
   xml(manifest,(name,a)=>{if(/macro|vba|activex|oleobject/i.test(a.ContentType??""))throw new Error("Active Office content");if(name==="Override"&&a.PartName===`/${definition.part}`&&a.ContentType===definition.type)main=true;});
   for(const [name,content]of Object.entries(files).filter(([name])=>name.endsWith(".rels"))){
    xml(content,(tag,a)=>{
     if(tag!=="Relationship")return;
     if(/macro|vbaProject|oleObject|activeX|attachedTemplate|externalLink|connections|queryTable/i.test(a.Type??""))throw new Error("Active Office relationship");
     if(a.TargetMode?.toLowerCase()==="external"){
      if(!a.Type?.endsWith("/hyperlink")||!/^https?:|^mailto:/i.test(a.Target??""))throw new Error("External active content");
     }else if(name==="_rels/.rels"&&a.Type?.endsWith("/officeDocument")&&a.Target?.replace(/^\//,"")===definition.part)root=true;
    });
   }
   if(!main||!root)throw new Error("Office package does not match the authorized format");
  }catch{throw new HttpError(422,"Use a valid, unencrypted XLSX, DOCX or PPTX file without macros, embedded objects or external data connections.");}
  return{sha256};
 }
 if(mime==="text/plain"||mime==="text/csv"){
  try{const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c<32&&c!==9&&c!==10&&c!==13)throw new Error("Binary text");}}catch{throw new HttpError(422,"Save text and CSV attachments using UTF-8 encoding.");}
  return{sha256};
 }
 const starts=(...values:number[])=>values.every((v,i)=>bytes[i]===v);
 const valid=mime==="application/pdf"?starts(37,80,68,70,45):mime==="image/png"?starts(137,80,78,71,13,10,26,10):mime==="image/jpeg"?starts(255,216,255):mime==="image/webp"?starts(82,73,70,70)&&bytes.subarray(8,12).toString("ascii")==="WEBP":false;
 if(!valid)throw new HttpError(422,"File contents do not match the authorized type.");
 return{sha256};
}
