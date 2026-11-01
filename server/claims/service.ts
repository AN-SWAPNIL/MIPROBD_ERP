import { eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { stockBatches, stockMovements, supplierClaims, supplierClaimPostings, supplierReplacementReceipts, supplierSettlements } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import type { claimInput, replacementInput } from "../../src/domains/claims/contracts.js";
import { businessDate } from "../../src/lib/date.js";
import { hasCapability, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { createApproval, consumeApproval } from "../controls/service.js";
import { audit, digest } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { recordLedgerEvent, twoSidedPlan } from "../ledger/service.js";
import { newId, nextNumber } from "../operations/common.js";
import { D } from "../trading/money.js";
import { approval, loadClaim, source } from "./records.js";
import { claimCost, claimPlan } from "./math.js";
export async function draftClaim(tx:Transaction,user:User,{sourceKind,sourceId,quantity,resolution,creditBdt:enteredCredit,reason,inspection,proofReference}:z.infer<typeof claimInput>,previous?:typeof supplierClaims.$inferSelect){
 const input={sourceKind,sourceId,quantity,resolution,creditBdt:enteredCredit,reason,inspection,proofReference};
 const s=await source(tx,input.sourceKind,input.sourceId,true);if(new D(input.quantity).gt(s.availableQuantity))throw new HttpError(409,"Claim exceeds outstanding source quantity.");
 if(input.creditBdt!==null&&input.creditBdt!==previous?.creditBdt)assertAllowed(hasCapability(user,"view_sensitive_cost")&&hasEffectivePermission(user,"accounts","post"),"An authorized financial reviewer must enter the negotiated supplier credit.");
 const costBdt=claimCost(s.quantityPool,s.valuePool,s.priorQuantity,s.priorValue,input.quantity),creditBdt=input.creditBdt===null?null:new D(input.creditBdt).toFixed(2),preparerIds=[...new Set([...(previous?.preparerIds??[]),user.id])];
 if(preparerIds.length>100)throw new HttpError(422,"Create a new independent source after too many revisions.");
 const data={...input,quantity:new D(input.quantity).toFixed(4),costBdt,creditBdt,snapshot:s,preparerIds},id=newId("supplier-claim");
 await tx.insert(supplierClaims).values({...data,id,number:await nextNumber(tx,"SCL",businessDate()),receiptLineId:s.receiptLineId,holdId:s.holdId,batchId:s.batchId,supplierId:s.supplierId,importId:s.importId,productId:s.productId,fingerprint:s.fingerprint,exposureBdt:new D(costBdt).plus(creditBdt??0).toFixed(2),payloadHash:digest(JSON.stringify(data)),revisionOfId:previous?.id??null,createdBy:user.id});
 await audit(tx,user.id,"Supplier claim prepared","Supplier Claim",id,{sourceKind:input.sourceKind,resolution:input.resolution,revisionOfId:previous?.id??null});return id;
}
export async function fresh(tx:Transaction,row:typeof supplierClaims.$inferSelect){const s=await source(tx,row.sourceKind,row.sourceId,true);if(s.fingerprint!==row.fingerprint||new D(row.quantity).gt(s.availableQuantity))throw new HttpError(409,"Source quantity, hold or cost changed. Prepare a reviewed revision.");}
export async function postClaim(tx:Transaction,user:User,id:string,version:number){
 const initial=await loadClaim(tx,id);await source(tx,initial.sourceKind,initial.sourceId,true);const r=await loadClaim(tx,id,true);if(r.state==="Posted")return id;
 if(r.state!=="Submitted"||r.version!==version||!r.approvalId)throw new HttpError(409,"Post only the current independently approved claim.");
 await fresh(tx,r);await consumeApproval(tx,user,r.approvalId,{domain:"Rejections",resourceType:"Supplier Claim",resourceId:id,payloadHash:r.payloadHash});const date=businessDate();
 await tx.update(supplierClaims).set({state:"Posted",version:r.version+1,postedDate:date,postedBy:user.id}).where(eq(supplierClaims.id,id));
 if(r.sourceKind==="Held Stock"){
  const [b]=await tx.select().from(stockBatches).where(eq(stockBatches.id,r.batchId!));const movementId=newId("movement");
  await tx.insert(stockMovements).values({id:movementId,batchId:b.id,type:"Supplier Return",adjustmentSign:-1,quantity:r.quantity,valueBdt:r.costBdt,date,reference:r.number,createdBy:user.id,createdByName:user.name});
  await tx.insert(supplierClaimPostings).values({id:newId("supplier-claim-posting"),claimId:id,holdId:r.holdId!,batchId:b.id,movementId,quantity:r.quantity,valueBdt:r.costBdt,date});
  await tx.update(stockBatches).set({quantityAvailable:new D(b.quantityAvailable).minus(r.quantity).toFixed(4),availableValueBdt:new D(b.availableValueBdt).minus(r.costBdt).toFixed(2)}).where(eq(stockBatches.id,b.id));
 }
 if(r.resolution==="Credit")await tx.insert(supplierSettlements).values({id:newId("supplier-credit"),supplierClaimId:id,date,supplierId:r.supplierId,supplierName:r.snapshot.supplierName,importId:r.importId,reference:r.number,entryType:"Credit",amount:r.creditBdt!,notes:r.reason,createdByUserId:user.id,createdByName:user.name});
 const plan=claimPlan(r.sourceKind,r.resolution,r.costBdt,r.creditBdt);if(plan.length){const journal=await recordLedgerEvent(tx,user,{sourceKey:`supplier-claim:${id}`,date,reference:r.number,description:`Approved supplier ${r.resolution.toLowerCase()} from saved original source`,plan});if(!journal)throw new HttpError(409,"An effective approved ledger mapping is required before a supplier claim can post.");}
 await audit(tx,user.id,"Approved supplier claim posted","Supplier Claim",id,{resolution:r.resolution,sourceKind:r.sourceKind});return id;
}
export async function replacementFacts(tx:Transaction,id:string){return(await tx.execute<{quantity:string;value:string;fingerprint:string}>(sql`select coalesce(sum(quantity),0)::text quantity,coalesce(sum(value_bdt),0)::text value,md5(${id}||':'||coalesce(sum(quantity),0)::text||':'||coalesce(sum(value_bdt),0)::text) fingerprint from erp_private.supplier_replacement_receipts where claim_id=${id} and state='Posted'`)).rows[0];}
export async function draftReplacement(tx:Transaction,user:User,id:string,input:z.infer<typeof replacementInput>){
 const c=await loadClaim(tx,id,true);if(c.state!=="Posted"||c.resolution!=="Replacement")throw new HttpError(409,"Use a posted supplier replacement claim.");const f=await replacementFacts(tx,id);
 if(new D(input.quantity).plus(input.rejectedQuantity).plus(f.quantity).gt(c.quantity))throw new HttpError(409,"Replacement inspection exceeds the outstanding promise.");
 if(input.receivedDate>businessDate()||input.receivedDate<c.postedDate!||new D(input.quantity).gt(0)&&input.expiryDate<businessDate())throw new HttpError(422,"Replacement must be received since the claim; accepted units must remain unexpired.");
 const data=input;
 const valueBdt=new D(input.quantity).isZero()?"0.00":claimCost(c.quantity,c.costBdt,f.quantity,f.value,input.quantity),rid=newId("replacement"),number=await nextNumber(tx,"SRR",businessDate()),payloadHash=digest(JSON.stringify({claimId:id,...input,valueBdt,fingerprint:f.fingerprint}));
 // The database retains Submitted for the older deployment; the new workflow opts into Draft explicitly.
 await tx.insert(supplierReplacementReceipts).values({...data,id:rid,number,claimId:id,valueBdt,fingerprint:f.fingerprint,payloadHash,state:"Draft",createdBy:user.id});
 await audit(tx,user.id,"Supplier replacement inspected","Supplier Replacement Receipt",rid,{claimId:id});return id;
}
export async function submitReplacement(tx:Transaction,user:User,id:string,version:number){
 const [initial]=await tx.select().from(supplierReplacementReceipts).where(eq(supplierReplacementReceipts.id,id));
 if(!initial)throw new HttpError(404,"Replacement receipt not found.");
 const c=await loadClaim(tx,initial.claimId,true);
 const [r]=await tx.select().from(supplierReplacementReceipts).where(eq(supplierReplacementReceipts.id,id)).for("update");
 assertAllowed(r.createdBy===user.id,"Only the receipt preparer can submit its inspection evidence.");
 if(r.state!=="Draft"||r.version!==version)throw new HttpError(409,"Submit only the current replacement draft.");
 const f=await replacementFacts(tx,c.id);
 if(r.fingerprint!==f.fingerprint)throw new HttpError(409,"Another replacement posted. Inspect a new source against the remaining promise.");
 if(new D(r.quantity).gt(0)&&r.expiryDate<businessDate())throw new HttpError(409,"Accepted replacement stock has expired. Inspect a new source.");
 const approvalId=await createApproval(tx,user,{domain:"Rejections",resourceType:"Supplier Replacement Receipt",resourceId:id,reference:r.number,amountBdt:r.valueBdt,payloadHash:r.payloadHash,context:{claimId:c.id,excludedActorIds:[...c.preparerIds,r.createdBy]}});
 await tx.update(supplierReplacementReceipts).set({state:"Submitted",version:r.version+1,approvalId}).where(eq(supplierReplacementReceipts.id,id));
 await audit(tx,user.id,"Supplier replacement submitted","Supplier Replacement Receipt",id,{claimId:c.id});return c.id;
}
export async function postReplacement(tx:Transaction,user:User,rid:string,version:number){
 const [initial]=await tx.select().from(supplierReplacementReceipts).where(eq(supplierReplacementReceipts.id,rid));if(!initial)throw new HttpError(404,"Replacement receipt not found.");const c=await loadClaim(tx,initial.claimId,true);
 const [r]=await tx.select().from(supplierReplacementReceipts).where(eq(supplierReplacementReceipts.id,rid)).for("update");if(r.state==="Posted")return c.id;
 if(r.version!==version||r.state!=="Submitted"||!r.approvalId)throw new HttpError(409,"Reload the current independently approved replacement source.");const f=await replacementFacts(tx,c.id);if(f.fingerprint!==r.fingerprint)throw new HttpError(409,"Another replacement posted. Reject this stale request and inspect a new source.");
 await consumeApproval(tx,user,r.approvalId,{domain:"Rejections",resourceType:"Supplier Replacement Receipt",resourceId:rid,payloadHash:r.payloadHash});const date=businessDate();
 await tx.update(supplierReplacementReceipts).set({state:"Posted",version:r.version+1,postedDate:date,postedBy:user.id}).where(eq(supplierReplacementReceipts.id,rid));
 if(new D(r.quantity).isZero()){await audit(tx,user.id,"Supplier replacement fully rejected","Supplier Replacement Receipt",rid,{claimId:c.id,stockCreated:false});return c.id;}
 const batchId=newId("replacement-batch");await tx.insert(stockBatches).values({id:batchId,replacementReceiptId:rid,productId:c.productId,sourceReference:r.number,lotNumber:r.lotNumber,batchNumber:r.batchNumber,manufacturingDate:r.manufacturingDate,expiryDate:r.expiryDate,receivedDate:r.receivedDate,condition:"Saleable",quantityReceived:r.quantity,quantityAvailable:r.quantity,landedCostPerUnit:new D(r.valueBdt).div(r.quantity).toFixed(10),receivedValueBdt:r.valueBdt,availableValueBdt:r.valueBdt,warehouse:"Main Warehouse",location:r.location});
 await tx.insert(stockMovements).values({id:newId("movement"),batchId,type:"Receive",quantity:r.quantity,valueBdt:r.valueBdt,date,reference:r.number,createdBy:user.id,createdByName:user.name});
 if(new D(r.valueBdt).gt(0)){const journal=await recordLedgerEvent(tx,user,{sourceKey:`supplier-replacement:${rid}`,date,reference:r.number,description:"Approved replacement receipt at saved supplier claim value",plan:twoSidedPlan("Inventory","Supplier Claims",r.valueBdt)});if(!journal)throw new HttpError(409,"An effective approved Supplier Claims ledger mapping is required.");}
 await audit(tx,user.id,"Approved supplier replacement received","Supplier Replacement Receipt",rid,{claimId:c.id,batchId});return c.id;
}
export async function assertRevision(tx:Transaction,r:typeof supplierClaims.$inferSelect,version:number){if(r.version!==version||["Posted","Superseded"].includes(r.state))throw new HttpError(409,"Only the current unposted source can be revised.");const a=await approval(tx,r.approvalId);if(r.approvalId&&a.approvalState!=="Rejected"&&a.policyActive)throw new HttpError(409,"Reject the active request before revising.");}
