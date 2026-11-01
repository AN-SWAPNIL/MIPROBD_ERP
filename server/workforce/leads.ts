import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { customers, leadProducts, marketingLeads } from "../../database/schema.js";
import { leadRowSchema } from "../../src/domains/marketing/persistentContracts.js";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { businessDate } from "../../src/lib/date.js";
import { audit, identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { newId, nextNumber } from "../operations/common.js";
import { money } from "../trading/money.js";
import { activeOwner, assertEmployeeScope, canonicalProducts } from "./scope.js";
import { leadFields, leadUpdate, convertInput, listInput } from "./contracts.js";
import { leadBase, paged } from "./records.js";
import { checkVersion, pathId, postOnce, workforceWrite } from "./common.js";

const qualified=(stage:string)=>["INTERESTED","PRESENTATION","SAMPLE","NEGOTIATION"].includes(stage);
export function createLeadRouter(ctx:Context) {
  const router=Router();
  const read=async(id:string,user:ReturnType<typeof identity>["user"])=>{
    const rows=(await ctx.db.execute(leadBase(user,listInput.parse({}),id))).rows;
    if(!rows.length)throw new HttpError(404,"Lead not found in your permitted scope."); return leadRowSchema.parse(JSON.parse(JSON.stringify(rows[0])));
  };
  router.get("/workforce/leads",async(req,res)=>{
    const user=identity(res).user; assertAllowed(hasEffectivePermission(user,"marketing")); const q=listInput.parse(req.query);
    res.json({success:true,data:await paged(ctx.db,leadBase(user,q),q,sql`"createdAt" desc,id desc`),message:"Scoped lead pipeline loaded"});
  });
  router.post("/workforce/leads",async(req,res)=>{
    const input=leadFields.parse(req.body);
    const id=await postOnce(ctx,req,res,"create",input,async(tx,user)=>{
      const assignedTo=input.assignedTo??user.id; await activeOwner(tx,user,assignedTo); await canonicalProducts(tx,input.productIds);
      const {productIds,nextFollowUpAt,...fields}=input; const id=newId("lead"); const reference=await nextNumber(tx,"LEAD",businessDate());
      await tx.insert(marketingLeads).values({...fields,id,reference,assignedTo,createdBy:user.id,nextFollowUpAt:nextFollowUpAt?new Date(nextFollowUpAt):null,qualifiedAt:qualified(input.stage)?new Date():null});
      await tx.insert(leadProducts).values(productIds.map((productId)=>({leadId:id,productId})));
      await audit(tx,user.id,"Marketing lead created","MarketingLead",id,{reference,assignedTo}); return id;
    });
    res.status(201).json({success:true,data:await read(id,identity(res).user),message:"Lead created"});
  });
  router.patch("/workforce/leads/:id",async(req,res)=>{
    const input=leadUpdate.parse(req.body); const id=pathId(req);
    await workforceWrite(ctx,res,"edit",async(tx,user)=>{
      const [row]=await tx.select().from(marketingLeads).where(eq(marketingLeads.id,id)).for("update"); if(!row)throw new HttpError(404,"Lead not found.");
      await assertEmployeeScope(tx,user,row.assignedTo); checkVersion(row.version,input.version);
      const assignedTo=input.assignedTo??row.assignedTo; await activeOwner(tx,user,assignedTo);
      if(assignedTo!==row.assignedTo && row.customerId)throw new HttpError(409,"Converted lead ownership is fixed; change customer assignment through its separate workflow.");
      await canonicalProducts(tx,input.productIds); const {productIds,version,nextFollowUpAt,...fields}=input;
      await tx.update(marketingLeads).set({...fields,assignedTo,nextFollowUpAt:nextFollowUpAt?new Date(nextFollowUpAt):null,qualifiedAt:row.qualifiedAt??(qualified(input.stage)?new Date():null),version:version+1,updatedAt:new Date()}).where(eq(marketingLeads.id,id));
      await tx.delete(leadProducts).where(eq(leadProducts.leadId,id)); await tx.insert(leadProducts).values(productIds.map((productId)=>({leadId:id,productId})));
      await audit(tx,user.id,"Marketing lead updated","MarketingLead",id,{before:{stage:row.stage,assignedTo:row.assignedTo},after:{stage:input.stage,assignedTo},reason:input.lostReason});
    });
    res.json({success:true,data:await read(id,identity(res).user),message:"Lead updated; commercial stages remain derived from ERP records"});
  });
  router.post("/workforce/leads/:id/convert",async(req,res)=>{
    const input=convertInput.parse(req.body); const id=pathId(req);
    await postOnce(ctx,req,res,"edit",input,async(tx,user)=>{
      assertAllowed(hasEffectivePermission(user,"customers","create"));
      const [row]=await tx.select().from(marketingLeads).where(eq(marketingLeads.id,id)).for("update"); if(!row)throw new HttpError(404,"Lead not found.");
      await assertEmployeeScope(tx,user,row.assignedTo); checkVersion(row.version,input.version); await activeOwner(tx,user,row.assignedTo);
      if(row.customerId || row.stage==="LOST")throw new HttpError(409,"This lead is already converted or lost.");
      const customerId=newId("customer");
      await tx.insert(customers).values({id:customerId,name:row.organization,type:row.organizationType as "Hospital"|"Clinic"|"Dealer"|"Pharmacy"|"Other",contactPerson:row.contact,phone:row.phone,email:row.email,address:row.address,assignedSalesUserId:row.assignedTo,paymentTerms:input.paymentTerms,creditLimit:money(input.creditLimit),createdBy:user.id});
      await tx.update(marketingLeads).set({customerId,convertedAt:new Date(),version:row.version+1,updatedAt:new Date()}).where(eq(marketingLeads.id,id));
      await audit(tx,user.id,"Lead converted to customer","MarketingLead",id,{customerId}); return id;
    });
    res.status(201).json({success:true,data:await read(id,identity(res).user),message:"Customer created once and linked to the original lead"});
  });
  return router;
}
