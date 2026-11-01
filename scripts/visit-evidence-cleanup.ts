import { eq, sql } from "drizzle-orm";
import { documents } from "../database/schema.js";
import { audit, createContext } from "../server/foundation/context.js";

// Wait beyond the Storage token lifetime; never remove linked business evidence here.
const ctx=createContext();
try{
  const rows=await ctx.db.select().from(documents).where(sql`${documents.purpose}='field-visit-evidence' and ${documents.visitId} is null and ${documents.expiresAt}<now()-interval '3 hours' and ${documents.status}<>'Expired'`).orderBy(documents.expiresAt,documents.id).limit(50);
  console.log(`Abandoned visit uploads eligible: ${rows.length}; maximum 50 per run.`);
  if(process.argv.includes("--apply"))for(const row of rows){
    await ctx.db.transaction(async tx=>{const [d]=await tx.select().from(documents).where(eq(documents.id,row.id)).for("update");if(!d||d.visitId||d.status==="Expired"||d.expiresAt.getTime()>Date.now()-3*3600000)return;
      const {error}=await ctx.admin.storage.from(d.bucket).remove([d.objectPath]);if(error)throw new Error("Private storage cleanup failed; metadata retained for retry.");
      await tx.update(documents).set({status:"Expired"}).where(eq(documents.id,d.id));await audit(tx,null,"Abandoned visit upload removed","Document",d.id,{reason:"Unused attempt expired beyond signed-upload window"});
    });
  }
}finally{await ctx.client.end();}
