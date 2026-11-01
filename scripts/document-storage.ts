import "../server/config.js";
import { attachmentMimes } from "../src/lib/files/attachments.js";
import { createContext } from "../server/foundation/context.js";

const ctx=createContext();
try{
 if(new URL(process.env.SUPABASE_URL??"").hostname!=="hyttuapvvqqxcyhojbwq.supabase.co")throw new Error("This command is scoped to the existing development project.");
 const {data,error}=await ctx.admin.storage.getBucket("erp-documents");
 if(error||!data||data.public||data.file_size_limit!==10*1024*1024)throw new Error("The existing private bucket or size policy differs. No settings changed.");
 if(!data.allowed_mime_types){console.log("Existing unrestricted bucket type policy preserved; application allowlists remain authoritative.");}
 else{
  const next=[...new Set([...data.allowed_mime_types,...attachmentMimes])],missing=next.length-data.allowed_mime_types.length;
  console.log(JSON.stringify({bucket:"erp-documents",private:true,sizeLimitUnchanged:true,additionalTypes:missing,apply:process.argv.includes("--apply")}));
  if(missing&&process.argv.includes("--apply")){
   const result=await ctx.admin.storage.updateBucket("erp-documents",{public:false,fileSizeLimit:data.file_size_limit,allowedMimeTypes:next});
   if(result.error)throw new Error("Bucket type update failed.");
   const verified=await ctx.admin.storage.getBucket("erp-documents");
   if(verified.error||verified.data.public||verified.data.file_size_limit!==data.file_size_limit||!next.every(m=>verified.data.allowed_mime_types?.includes(m)))throw new Error("Bucket type verification failed.");
   console.log("Private document type policy updated; no files, other buckets or Auth settings changed.");
  }
 }
}catch{console.error("Document storage configuration failed; credentials withheld.");process.exitCode=1;}finally{await ctx.client.end();}
