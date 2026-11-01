import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { approvalEvents, approvalPolicies, approvalRequests, supplierReplacementReceipts } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { hostedHarness } from "../testing/hosted.js";
import { businessDate } from "../../src/lib/date.js";
import { claimSchema } from "../../src/domains/claims/contracts.js";
import { digest } from "../foundation/context.js";
import { newId, nextNumber } from "../operations/common.js";
import { loadClaim } from "./records.js";
import { replacementFacts } from "./service.js";
import { claimCost } from "./math.js";

export async function checkLegacyReplacement(h:Awaited<ReturnType<typeof hostedHarness>>,tx:Transaction,claimId:string,actor:{id:string;token:string},authorize:(id:string)=>Promise<void>){
 const c=await loadClaim(tx,claimId),f=await replacementFacts(tx,claimId),today=businessDate();
 const input={quantity:c.quantity,rejectedQuantity:"0",lotNumber:"DEV TEST legacy LOT",batchNumber:`DEV TEST legacy ${h.suffix}`,manufacturingDate:today,expiryDate:"2030-12-31",receivedDate:today,location:"DEV TEST legacy BIN",inspection:"DEV TEST old deployment receiving compatibility",proofReference:"DEV TEST legacy receipt",additionalCostsConfirmedZero:true};
 const valueBdt=claimCost(c.quantity,c.costBdt,f.quantity,f.value,input.quantity),payloadHash=digest(JSON.stringify({claimId,...input,valueBdt,fingerprint:f.fingerprint})),id=newId("legacy-replacement"),number=await nextNumber(tx,"SRR",today),approvalId=newId("legacy-approval");
 const [policy]=await tx.select().from(approvalPolicies).where(and(eq(approvalPolicies.domain,"Rejections"),eq(approvalPolicies.state,"Approved")));assert.ok(policy);
 // Reproduce the deployed pre-draft server: request approval, then insert without a status value.
 await tx.insert(approvalRequests).values({id:approvalId,domain:"Rejections",resourceType:"Supplier Replacement Receipt",resourceId:id,reference:number,amountBdt:valueBdt,payloadHash,policyId:policy.id,policyVersion:policy.version,policy:policy.data,requestedBy:actor.id,context:{claimId,excludedActorIds:[...c.preparerIds,actor.id]}});
 await tx.insert(approvalEvents).values({id:newId("legacy-event"),approvalId,actorId:actor.id,version:1,action:"Submitted",reason:"DEV TEST pre-draft deployment compatibility"});
 await tx.insert(supplierReplacementReceipts).values({...input,id,number,claimId,valueBdt,fingerprint:f.fingerprint,payloadHash,approvalId,createdBy:actor.id});
 const [saved]=await tx.select().from(supplierReplacementReceipts).where(eq(supplierReplacementReceipts.id,id));assert.equal(saved.state,"Submitted");assert.equal(saved.version,1);
 await authorize(approvalId);
 const posted=claimSchema.parse(await h.expect(`/supplier-replacements/${id}/post`,actor.token,{version:1})),receipt=posted.replacements.find(r=>r.id===id);assert.ok(receipt?.batchId);assert.equal(receipt.state,"Posted");assert.equal(posted.replacementOutstanding,"0.0000");
 console.log("Existing staging insert-without-status, independent approval and replacement posting remain compatible");
}
