import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { marketingFollowUps, marketingPlans, marketingScoreRules, marketingTargets } from "../../database/schema.js";
import { audit, identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { newId } from "../operations/common.js";
import { money } from "../trading/money.js";
import { activeOwner, assertEmployeeScope, canonicalProducts, canonicalSubject } from "./scope.js";
import { completeInput, followUpInput, followUpUpdate, listInput, planInput, reasonInput, reviewInput, ruleInput, targetInput } from "./contracts.js";
import { followUpBase, paged, planBase, targetBase } from "./records.js";
import { checkVersion, pathId, postOnce, workforceWrite } from "./common.js";
import { hasEffectivePermission, isSuperAdmin } from "../../src/lib/permissions/effectiveAccess.js";

export function createPlanningRouter(ctx:Context) {
  const router=Router();
  for(const [path,base,order] of [["follow-ups",followUpBase,sql`"dueAt",id`],["plans",planBase,sql`period desc,id`],["targets",targetBase,sql`month desc,id`]] as const) router.get(`/workforce/${path}`,async(req,res)=>{
    const user=identity(res).user; assertAllowed(hasEffectivePermission(user,"marketing")); const q=listInput.parse(req.query);
    const data=await paged(ctx.db,base(user,q),q,order);
    if(path==="targets"&&(!hasEffectivePermission(user,"sales")||user.role==="Warehouse Manager"))data.rows=data.rows.map((row)=>({...row,sales:"Restricted",collections:"Restricted"}));
    res.json({success:true,data,message:"Scoped planning records loaded"});
  });
  router.post("/workforce/follow-ups",async(req,res)=>{
    const input=followUpInput.parse(req.body);
    const id=await postOnce(ctx,req,res,"create",input,async(tx,user)=>{
      const assignedTo=input.assignedTo??user.id; await activeOwner(tx,user,assignedTo); const subject=await canonicalSubject(tx,user,input,assignedTo); const id=newId("follow-up");
      await tx.insert(marketingFollowUps).values({...input,id,assignedTo,subject,dueAt:new Date(input.dueAt),createdBy:user.id}); await audit(tx,user.id,"Follow-up scheduled","MarketingFollowUp",id,{assignedTo}); return id;
    });
    res.status(201).json({success:true,data:{id},message:"Follow-up scheduled"});
  });
  router.patch("/workforce/follow-ups/:id",async(req,res)=>{
    const input=followUpUpdate.parse(req.body); const id=pathId(req);
    await workforceWrite(ctx,res,"edit",async(tx,user)=>{
      const [row]=await tx.select().from(marketingFollowUps).where(eq(marketingFollowUps.id,id)).for("update"); if(!row)throw new HttpError(404,"Follow-up not found."); await assertEmployeeScope(tx,user,row.assignedTo); checkVersion(row.version,input.version);
      if(row.status!=="Pending")throw new HttpError(423,"Completed/cancelled follow-ups are historical records.");
      const assignedTo=input.assignedTo??row.assignedTo; await activeOwner(tx,user,assignedTo); const subject=await canonicalSubject(tx,user,input,assignedTo);
      await tx.update(marketingFollowUps).set({assignedTo,leadId:input.leadId??null,customerId:input.customerId??null,subject,dueAt:new Date(input.dueAt),purpose:input.purpose,version:row.version+1}).where(eq(marketingFollowUps.id,id)); await audit(tx,user.id,"Follow-up rescheduled","MarketingFollowUp",id,{before:{dueAt:row.dueAt,assignedTo:row.assignedTo},after:input});
    }); res.json({success:true,data:{id},message:"Follow-up updated"});
  });
  for(const action of ["complete","cancel"] as const)router.post(`/workforce/follow-ups/:id/${action}`,async(req,res)=>{
    const input=action==="complete"?completeInput.parse(req.body):reasonInput.parse(req.body); const id=pathId(req);
    await postOnce(ctx,req,res,"edit",input,async(tx,user)=>{
      const [row]=await tx.select().from(marketingFollowUps).where(eq(marketingFollowUps.id,id)).for("update"); if(!row)throw new HttpError(404,"Follow-up not found."); await assertEmployeeScope(tx,user,row.assignedTo); checkVersion(row.version,input.version);
      if(row.status!=="Pending")throw new HttpError(409,"Follow-up is already completed/cancelled.");
      assertAllowed(row.assignedTo===user.id || action==="cancel"&&hasEffectivePermission(user,"marketing","approve"),"Only the assigned employee can report completion.");
      let successorId:string|null=null;
      if("nextFollowUpAt" in input && input.nextFollowUpAt){ successorId=newId("follow-up"); await tx.insert(marketingFollowUps).values({id:successorId,assignedTo:row.assignedTo,leadId:row.leadId,customerId:row.customerId,subject:row.subject,dueAt:new Date(input.nextFollowUpAt),purpose:row.purpose,createdBy:user.id}); }
      await tx.update(marketingFollowUps).set({status:action==="complete"?"Completed":"Cancelled",outcome:"outcome" in input?input.outcome:input.reason,completedAt:action==="complete"?new Date():null,successorId,version:row.version+1}).where(eq(marketingFollowUps.id,id));
      await audit(tx,user.id,`Follow-up ${action}`,"MarketingFollowUp",id,{...input,successorId}); return id;
    });res.json({success:true,data:{id},message:action==="complete"?"Completion and any next follow-up saved together":"Follow-up cancelled; history retained"});
  });
  router.post("/workforce/plans",async(req,res)=>{
    const input=planInput.parse(req.body);
    const id=await postOnce(ctx,req,res,"create",input,async(tx,user)=>{
      await activeOwner(tx,user,user.id); await canonicalProducts(tx,input.productIds);
      const visits=[]; for(const visit of input.visits)visits.push({...visit,subject:await canonicalSubject(tx,user,visit)});
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`plan:${user.id}:${input.kind}:${input.period}`},0))`);
      const [existing]=await tx.select().from(marketingPlans).where(and(eq(marketingPlans.employeeId,user.id),eq(marketingPlans.kind,input.kind),eq(marketingPlans.period,input.period))).for("update");
      const data={notes:input.notes,priorities:input.priorities,productIds:input.productIds,plannedActivities:input.plannedActivities,visits};
      if(existing){checkVersion(existing.version,input.version); if(!["Draft","Rejected"].includes(existing.status))throw new HttpError(423,"Submitted/approved plans cannot be rewritten."); await tx.update(marketingPlans).set({data,status:input.status,reviewedBy:null,reviewReason:"",version:existing.version+1,updatedAt:new Date()}).where(eq(marketingPlans.id,existing.id)); await audit(tx,user.id,"Marketing plan revised/submitted","MarketingPlan",existing.id,{before:existing.data,after:data}); return existing.id;}
      if(input.version)throw new HttpError(409,"Plan no longer matches this period.");
      const id=newId("plan"); await tx.insert(marketingPlans).values({id,employeeId:user.id,kind:input.kind,period:input.period,status:input.status,data}); await audit(tx,user.id,"Marketing plan saved","MarketingPlan",id,{kind:input.kind,period:input.period}); return id;
    });res.status(201).json({success:true,data:{id},message:"Own plan saved"});
  });
  router.post("/workforce/plans/:id/review",async(req,res)=>{
    const input=reviewInput.parse(req.body); const id=pathId(req);
    await postOnce(ctx,req,res,"approve",input,async(tx,user)=>{
      const [row]=await tx.select().from(marketingPlans).where(eq(marketingPlans.id,id)).for("update"); if(!row)throw new HttpError(404,"Plan not found."); await assertEmployeeScope(tx,user,row.employeeId); checkVersion(row.version,input.version);
      assertAllowed(isSuperAdmin(user)||row.employeeId!==user.id,"Delegated employees cannot review their own plans.");
      if(row.status!=="Submitted")throw new HttpError(409,"Only submitted plans can be reviewed.");
      await tx.update(marketingPlans).set({status:input.status,reviewedBy:user.id,reviewReason:input.reason,version:row.version+1,updatedAt:new Date()}).where(eq(marketingPlans.id,id)); await audit(tx,user.id,`Marketing plan ${input.status}`,"MarketingPlan",id,{reason:input.reason,superAdminAuthority:isSuperAdmin(user),selfReview:row.employeeId===user.id});return id;
    });res.json({success:true,data:{id},message:"Plan review recorded"});
  });
  router.post("/workforce/targets",async(req,res)=>{
    const input=targetInput.parse(req.body);
    const id=await postOnce(ctx,req,res,"approve",input,async(tx,user)=>{
      assertAllowed(hasEffectivePermission(user,"sales")&&user.role!=="Warehouse Manager","Financial targets require Sales access.");
      await activeOwner(tx,user,input.employeeId); await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`target:${input.employeeId}:${input.month}`},0))`);
      const [row]=await tx.select().from(marketingTargets).where(and(eq(marketingTargets.employeeId,input.employeeId),eq(marketingTargets.month,input.month))).for("update");
      const {version,reason,...values}=input; const data={...values,sales:money(values.sales),collections:money(values.collections),updatedBy:user.id,updatedAt:new Date()};
      if(row){checkVersion(row.version,version); await tx.update(marketingTargets).set({...data,version:row.version+1}).where(eq(marketingTargets.id,row.id)); await audit(tx,user.id,"Monthly targets revised","MarketingTarget",row.id,{reason,before:row,after:data});return row.id;}
      if(version)throw new HttpError(409,"Target no longer matches this period."); const id=newId("target"); await tx.insert(marketingTargets).values({...data,id}); await audit(tx,user.id,"Monthly targets assigned","MarketingTarget",id,{reason,after:data}); return id;
    });res.status(201).json({success:true,data:{id},message:"Monthly targets saved with audit history"});
  });
  router.get("/workforce/score-rules",async(_req,res)=>{
    assertAllowed(hasEffectivePermission(identity(res).user,"marketing")); const rows=await ctx.db.select().from(marketingScoreRules).orderBy(marketingScoreRules.event);
    res.json({success:true,data:rows.map(({event,label,points,active,version})=>({event,label,points,active,version})),message:"Current score weights; manual notes never create scored commercial events"});
  });
  router.patch("/workforce/score-rules/:id",async(req,res)=>{
    const input=ruleInput.parse(req.body); const event=pathId(req);
    await workforceWrite(ctx,res,"approve",async(tx,user)=>{
      assertAllowed(user.role==="Super Admin"&&hasEffectivePermission(user,"settings","edit")); const [row]=await tx.select().from(marketingScoreRules).where(eq(marketingScoreRules.event,event)).for("update"); if(!row)throw new HttpError(404,"Score rule not found."); checkVersion(row.version,input.version);
      await tx.update(marketingScoreRules).set({points:input.points,active:input.active,version:row.version+1,updatedBy:user.id,updatedAt:new Date()}).where(eq(marketingScoreRules.event,event)); await audit(tx,user.id,"Marketing score weight changed","MarketingScoreRule",event,{reason:input.reason,before:row,after:input});
    });res.json({success:true,data:{id:event},message:"Current score weight updated"});
  });
  return router;
}
