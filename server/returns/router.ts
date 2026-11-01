import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { approvalPolicies, approvalRequests, customerReturns, postingKeys } from "../../database/schema.js";
import { hasEffectivePermission, hasCapability } from "../../src/lib/permissions/effectiveAccess.js";
import { returnInput, returnPageInput, returnRevisionInput, returnSettlementInput, returnVersionInput } from "../../src/domains/sales/returnContracts.js";
import { createApproval } from "../controls/service.js";
import { identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { lockActor, postingIdentity } from "../operations/common.js";
import { lockPosting } from "../trading/locks.js";
import { assertReturnRead, loadReturn, readReturn, returnSource, sourceDto } from "./records.js";
import { assertReturnFresh, draftReturn } from "./drafts.js";
import { postReturn } from "./posting.js";
import { draftReturnSettlement, postReturnSettlement } from "./settlements.js";

export function createReturnRouter(ctx:Context) {
  const router=Router();
  router.get("/returns/sources",async(req,res)=>{
    const user=identity(res).user;assertReturnRead(user);const q=returnPageInput.parse(req.query),term=`%${q.search.replace(/[\\%_]/g,"\\$&")}%`;
    const data=await ctx.db.transaction(async(tx)=>{
      const base=sql`select d.id,d.challan_number "challanNumber",d.customer_name "customerName",d.date,d.order_id "orderId" from erp_private.deliveries d where concat_ws(' ',d.challan_number,d.customer_name) ilike ${term} ${q.orderId?sql`and d.order_id=${q.orderId}`:sql``} ${user.role==="Sales Executive"?sql`and d.owner_id=${user.id}`:sql``}`;
      const [{total}]=(await tx.execute<{total:number}>(sql`with scoped as (${base}) select count(*)::int total from scoped`)).rows;
      const rows=(await tx.execute(sql`with scoped as (${base}) select * from scoped order by date desc,id limit 25 offset ${(q.page-1)*25}`)).rows;return{rows,total,page:q.page,pageSize:25};
    },{isolationLevel:"repeatable read",accessMode:"read only"});res.json({success:true,data,message:"Authorized delivery sources loaded"});
  });
  router.get("/returns/sources/:id",async(req,res)=>{const user=identity(res).user;assertReturnRead(user);res.json({success:true,data:await ctx.db.transaction((tx)=>sourceDto(tx,user,String(req.params.id))),message:"Delivered batches and returnable quantities loaded"});});
  router.get("/returns",async(req,res)=>{
    const user=identity(res).user;assertReturnRead(user);const q=returnPageInput.parse(req.query),term=`%${q.search.replace(/[\\%_]/g,"\\$&")}%`;
    const finance=user.role!=="Warehouse Manager"&&hasEffectivePermission(user,"sales"),cost=hasCapability(user,"view_sensitive_cost");
    const data=await ctx.db.transaction(async(tx)=>{
      const base=sql`select r.id,r.number,r.kind,r.customer_id "customerId",c.name "customerName",r.order_id "orderId",o.order_number "orderNumber",r.delivery_id "deliveryId",d.challan_number "challanNumber",r.invoice_id "invoiceId",i.invoice_number "invoiceNumber",to_char(r.received_date,'YYYY-MM-DD') "receivedDate",to_char(r.posted_date,'YYYY-MM-DD') "postedDate",r.state,r.version,r.created_by "createdBy",e.name "createdByName" ${finance?sql`,r.credit_bdt::text "creditBdt"`:sql``} ${cost?sql`,r.cost_bdt::text "costBdt"`:sql``}
        from erp_private.customer_returns r join erp_private.customers c on c.id=r.customer_id join erp_private.sales_orders o on o.id=r.order_id join erp_private.deliveries d on d.id=r.delivery_id join erp_private.employees e on e.id=r.created_by left join erp_private.sales_invoices i on i.id=r.invoice_id where concat_ws(' ',r.number,c.name,d.challan_number,i.invoice_number) ilike ${term} ${q.orderId?sql`and r.order_id=${q.orderId}`:sql``} ${user.role==="Sales Executive"?sql`and r.owner_id=${user.id}`:sql``}`;
      const [{total}]=(await tx.execute<{total:number}>(sql`with scoped as (${base}) select count(*)::int total from scoped`)).rows;const rows=(await tx.execute(sql`with scoped as (${base}) select * from scoped order by "receivedDate" desc,id limit 25 offset ${(q.page-1)*25}`)).rows;return{rows,total,page:q.page,pageSize:25};
    },{isolationLevel:"repeatable read",accessMode:"read only"});res.json({success:true,data,message:"Paged customer return register loaded"});
  });
  router.get("/returns/:id/credit-targets",async(req,res)=>{
    const user=identity(res).user;assertAllowed(hasEffectivePermission(user,"accounts","post")&&hasEffectivePermission(user,"sales"));const q=returnPageInput.parse(req.query),term=`%${q.search.replace(/[\\%_]/g,"\\$&")}%`;
    const data=await ctx.db.transaction(async(tx)=>{const {row}=await loadReturn(tx,user,String(req.params.id));const base=sql`select i.id,i.invoice_number "invoiceNumber",'Invoice'::text kind,sum(j.debit-j.credit)::text due from erp_private.sales_invoices i join erp_private.customer_entries j on j.invoice_id=i.id where i.customer_id=${row.customerId} and i.status='Approved' and i.id<>${row.invoiceId??""} and i.invoice_number ilike ${term} group by i.id,i.invoice_number having sum(j.debit-j.credit)>0 union all select e.id,e.reference,'Opening Due'::text,erp_private.opening_receivable_due(e.id)::text from erp_private.customer_entries e where e.customer_id=${row.customerId} and e.type='Opening Due' and e.opening_position_id is not null and e.date<=(current_timestamp at time zone 'Asia/Dhaka')::date and e.reference ilike ${term} and erp_private.opening_receivable_due(e.id)>0`;const [{total}]=(await tx.execute<{total:number}>(sql`with scoped as (${base}) select count(*)::int total from scoped`)).rows;return{rows:(await tx.execute(sql`with scoped as (${base}) select * from scoped order by "invoiceNumber",id limit 25 offset ${(q.page-1)*25}`)).rows,total,page:q.page,pageSize:25};},{isolationLevel:"repeatable read",accessMode:"read only"});res.json({success:true,data,message:"Outstanding same-customer credit targets loaded"});
  });
  router.get("/returns/:id",async(req,res)=>{const user=identity(res).user;assertReturnRead(user);res.json({success:true,data:await ctx.db.transaction((tx)=>readReturn(tx,user,String(req.params.id)),{isolationLevel:"repeatable read",accessMode:"read only"}),message:"Return inspection, stock and credit sources loaded"});});
  for(const revise of [false,true])router.post(revise?"/returns/:id/revise":"/returns",async(req,res)=>{
    const actor=identity(res);assertAllowed(hasEffectivePermission(actor.user,"inventory","post")||hasEffectivePermission(actor.user,"sales","create"));const input=revise?returnRevisionInput.parse(req.body):returnInput.parse(req.body),parentId=String((req.params as Record<string,string>).id??"");
    const key=postingIdentity(req,`${actor.user.id}:return:${revise?parentId:"new"}`,input);
    const id=await ctx.db.transaction(async(tx)=>{
      const warehouse=hasEffectivePermission(actor.user,"inventory","post"),user=await lockActor(tx,actor,warehouse?"inventory":"sales",warehouse?"post":"create");const prior=await lockPosting(tx,key);if(prior)return prior;
      await returnSource(tx,user,input.deliveryId,true);const previous=revise?await loadReturn(tx,user,parentId,true):undefined;
      if(previous){const r=previous.row;if(r.deliveryId!==input.deliveryId||r.kind!==input.kind||["Posted","Superseded"].includes(r.state)||r.version!==req.body.version)throw new HttpError(409,"This source/version cannot be revised.");
        if(r.approvalId){const [a]=await tx.select({request:approvalRequests,policy:approvalPolicies}).from(approvalRequests).innerJoin(approvalPolicies,eq(approvalPolicies.id,approvalRequests.policyId)).where(eq(approvalRequests.id,r.approvalId));if(a.request.state!=="Rejected"&&a.policy.state==="Approved")throw new HttpError(409,"Reject the active request before revising its source.");}
        await tx.update(customerReturns).set({state:"Superseded",version:r.version+1}).where(eq(customerReturns.id,r.id));}
      const id=await draftReturn(tx,user,input,previous);await tx.insert(postingKeys).values({...key,resourceId:id});return id;
    });res.status(201).json({success:true,data:await ctx.db.transaction((tx)=>readReturn(tx,actor.user,id)),message:"Immutable return inspection saved"});
  });
  router.post("/returns/:id/submit",async(req,res)=>{
    const actor=identity(res),id=String(req.params.id),input=returnVersionInput.parse(req.body);
    await ctx.db.transaction(async(tx)=>{const warehouse=hasEffectivePermission(actor.user,"inventory","post"),user=await lockActor(tx,actor,warehouse?"inventory":"sales",warehouse?"post":"create");const record=await loadReturn(tx,user,id,true),{row}=record;
      if(row.state!=="Draft"||row.version!==input.version)throw new HttpError(409,"Submit only the current draft.");await assertReturnFresh(tx,user,record);
      const approvalId=await createApproval(tx,user,{domain:"Returns",resourceType:"Customer Return",resourceId:id,reference:row.number,amountBdt:row.exposureBdt,payloadHash:row.payloadHash,context:{excludedActorIds:row.preparerIds}});
      await tx.update(customerReturns).set({state:"Submitted",version:row.version+1,approvalId}).where(eq(customerReturns.id,id));
    });res.json({success:true,data:await ctx.db.transaction((tx)=>readReturn(tx,actor.user,id)),message:"Return submitted for inspection review and financial approval"});
  });
  router.post("/returns/:id/post",async(req,res)=>{const actor=identity(res),input=returnVersionInput.parse(req.body);const id=await ctx.db.transaction(async(tx)=>postReturn(tx,await lockActor(tx,actor,"inventory","post"),String(req.params.id),input.version));res.json({success:true,data:await ctx.db.transaction((tx)=>readReturn(tx,actor.user,id)),message:"Inspected stock and applicable credit posted atomically"});});
  router.post("/returns/:id/settlements",async(req,res)=>{
    const actor=identity(res),input=returnSettlementInput.parse(req.body),id=String(req.params.id),key=postingIdentity(req,`${actor.user.id}:return-settlement:${id}`,input);
    await ctx.db.transaction(async(tx)=>{const user=await lockActor(tx,actor,"accounts","post");assertAllowed(hasEffectivePermission(user,"sales"));if(await lockPosting(tx,key))return;const settlementId=await draftReturnSettlement(tx,user,id,input);await tx.insert(postingKeys).values({...key,resourceId:settlementId});});res.status(201).json({success:true,data:await ctx.db.transaction((tx)=>readReturn(tx,actor.user,id)),message:"Credit application/refund submitted for approval"});
  });
  router.post("/return-settlements/:id/post",async(req,res)=>{const actor=identity(res),input=returnVersionInput.parse(req.body);const id=await ctx.db.transaction(async(tx)=>{const user=await lockActor(tx,actor,"accounts","post");assertAllowed(hasEffectivePermission(user,"sales"));return postReturnSettlement(tx,user,String(req.params.id),input.version);});res.json({success:true,data:await ctx.db.transaction((tx)=>readReturn(tx,actor.user,id)),message:"Approved credit application/refund posted once"});});
  return router;
}
