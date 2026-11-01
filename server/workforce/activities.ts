import { Router } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { activityProducts, documents, employees, marketingActivities } from "../../database/schema.js";
import { activityRowSchema } from "../../src/domains/marketing/persistentContracts.js";
import { businessDate } from "../../src/lib/date.js";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { audit, identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { newId, nextNumber } from "../operations/common.js";
import { activityFields, activityUpdate, listInput, reasonInput } from "./contracts.js";
import { assertEmployeeScope, canonicalProducts, canonicalSubject } from "./scope.js";
import { activityBase, paged } from "./records.js";
import { checkVersion, pathId, postOnce, workforceWrite } from "./common.js";
import type { Transaction } from "../../database/client.js";

async function linkEvidence(tx:Transaction,employeeId:string,activityId:string,ids:string[]) {
  const existing=await tx.select({id:documents.id}).from(documents).where(eq(documents.activityId,activityId));
  if(existing.some((row)=>!ids.includes(row.id)))throw new HttpError(422,"Existing evidence cannot be detached from its activity history.");
  if(!ids.length)return;
  const rows=await tx.select().from(documents).where(inArray(documents.id,ids)).orderBy(documents.id).for("update");
  if(rows.length!==ids.length || rows.some((row)=>row.purpose!=="marketing-evidence" || row.status!=="Attached" || row.uploadedBy!==employeeId || row.employeeId!==employeeId || row.activityId && row.activityId!==activityId))throw new HttpError(422,"Use your own completed, unused marketing-evidence uploads.");
  await tx.update(documents).set({activityId}).where(inArray(documents.id,ids));
}
export function createActivityRouter(ctx:Context) {
  const router=Router();
  const read=async(id:string,user:ReturnType<typeof identity>["user"])=>{
    const rows=(await ctx.db.execute(activityBase(user,listInput.parse({}),id))).rows;
    if(!rows.length)throw new HttpError(404,"Activity not found in your permitted scope.");
    // Normalize timestamps through JSON just as the page-query JSON aggregation does.
    return activityRowSchema.parse(JSON.parse(JSON.stringify(rows[0])));
  };
  router.get("/workforce/activities",async(req,res)=>{
    const user=identity(res).user; assertAllowed(hasEffectivePermission(user,"marketing")); const q=listInput.parse(req.query);
    res.json({success:true,data:await paged(ctx.db,activityBase(user,q),q,sql`"occurredAt" desc,id desc`),message:"Scoped activity history loaded"});
  });
  router.post("/workforce/activities",async(req,res)=>{
    const input=activityFields.parse(req.body);
    const id=await postOnce(ctx,req,res,"create",input,async(tx,user)=>{
      await assertEmployeeScope(tx,user,user.id); await canonicalProducts(tx,input.productIds); const subject=await canonicalSubject(tx,user,input);
      const [employee]=await tx.select().from(employees).where(eq(employees.id,user.id));
      const id=newId("activity"); const reference=await nextNumber(tx,"ACT",businessDate());
      const {attachmentIds,productIds,occurredAt,nextFollowUpAt,...fields}=input;
      await tx.insert(marketingActivities).values({...fields,id,reference,employeeId:user.id,subject,occurredAt:new Date(occurredAt),nextFollowUpAt:nextFollowUpAt?new Date(nextFollowUpAt):null,submittedAt:input.status==="Submitted"?new Date():null,snapshot:{name:employee.name,employeeCode:employee.employeeCode,title:employee.title,department:employee.department,territory:employee.territory}});
      if(productIds.length)await tx.insert(activityProducts).values(productIds.map((productId)=>({activityId:id,productId})));
      await linkEvidence(tx,user.id,id,attachmentIds);
      await audit(tx,user.id,`Marketing activity ${input.status==="Submitted"?"submitted":"draft saved"}`,"MarketingActivity",id,{reference}); return id;
    });
    res.status(201).json({success:true,data:await read(id,identity(res).user),message:"Activity saved with authenticated employee identity"});
  });
  router.patch("/workforce/activities/:id",async(req,res)=>{
    const input=activityUpdate.parse(req.body); const id=pathId(req);
    await workforceWrite(ctx,res,"edit",async(tx,user)=>{
      const [row]=await tx.select().from(marketingActivities).where(and(eq(marketingActivities.id,id),eq(marketingActivities.employeeId,user.id))).for("update");
      if(!row)throw new HttpError(404,"Own activity not found."); checkVersion(row.version,input.version);
      if(row.status!=="Draft")throw new HttpError(423,"Submitted activities cannot be rewritten. Void with a reason, then submit a correction.");
      await canonicalProducts(tx,input.productIds); const subject=await canonicalSubject(tx,user,input);
      const {version,attachmentIds,productIds,occurredAt,nextFollowUpAt,...fields}=input;
      await tx.delete(activityProducts).where(eq(activityProducts.activityId,id));
      if(productIds.length)await tx.insert(activityProducts).values(productIds.map((productId)=>({activityId:id,productId})));
      await tx.update(marketingActivities).set({...fields,leadId:input.leadId??null,customerId:input.customerId??null,subject,occurredAt:new Date(occurredAt),nextFollowUpAt:nextFollowUpAt?new Date(nextFollowUpAt):null,submittedAt:input.status==="Submitted"?new Date():null,version:version+1}).where(eq(marketingActivities.id,id));
      await linkEvidence(tx,user.id,id,attachmentIds); await audit(tx,user.id,"Marketing activity draft updated/submitted","MarketingActivity",id,{version:version+1});
    });
    res.json({success:true,data:await read(id,identity(res).user),message:"Activity draft updated"});
  });
  router.post("/workforce/activities/:id/void",async(req,res)=>{
    const input=reasonInput.parse(req.body); const id=pathId(req);
    await postOnce(ctx,req,res,"edit",input,async(tx,user)=>{
      const [row]=await tx.select().from(marketingActivities).where(eq(marketingActivities.id,id)).for("update");
      if(!row)throw new HttpError(404,"Activity not found."); await assertEmployeeScope(tx,user,row.employeeId);
      assertAllowed(row.status!=="Draft" || row.employeeId===user.id,"Drafts remain private to their author.");
      assertAllowed(row.employeeId===user.id || hasEffectivePermission(user,"marketing","approve")); checkVersion(row.version,input.version);
      if(row.status==="Voided")throw new HttpError(409,"Activity is already voided.");
      await tx.update(marketingActivities).set({status:"Voided",voidedAt:new Date(),voidedBy:user.id,voidReason:input.reason,version:row.version+1}).where(eq(marketingActivities.id,id));
      await audit(tx,user.id,"Marketing activity voided","MarketingActivity",id,{reason:input.reason}); return id;
    });
    res.json({success:true,data:await read(id,identity(res).user),message:"Original retained with correction reason"});
  });
  return router;
}
