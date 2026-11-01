import { eq, sql } from "drizzle-orm";
import { approvalPolicies, approvalRequests, importCases, stockBatches, stockHolds, supplierClaims, supplierReplacementReceipts } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import { claimSchema, claimSourceSchema } from "../../src/domains/claims/contracts.js";
import { hasCapability, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { lockStockBatches } from "../operations/stock-locks.js";
import { D } from "../trading/money.js";
export function assertClaimRead(user:User){assertAllowed(["import","inventory","accounts"].some(k=>hasEffectivePermission(user,k as "import"|"inventory"|"accounts")));}
export function canPrepareClaim(user:User){return hasEffectivePermission(user,"import","create")||hasEffectivePermission(user,"inventory","post")||hasEffectivePermission(user,"accounts","post");}
export async function source(tx:Transaction,kind:string,id:string,lock=false){
 if(lock){if(kind==="Held Stock"){const [h]=await tx.select().from(stockHolds).where(eq(stockHolds.id,id));if(!h)throw new HttpError(404,"Supplier hold source not found");await lockStockBatches(tx,[h.batchId]);}
 const [ref]=(await tx.execute<{id:string}>(sql`select i.import_id id from erp_private.receipt_lines l join erp_private.import_items i on i.id=l.import_item_id where l.id=case when ${kind}='Receipt Rejection' then ${id} else (select b.receipt_line_id from erp_private.stock_holds h join erp_private.stock_batches b on b.id=h.batch_id where h.id=${id}) end`)).rows;
 if(!ref)throw new HttpError(404,"Use rejected receipt units or a held original import batch.");await tx.select({id:importCases.id}).from(importCases).where(eq(importCases.id,ref.id)).for("update");}
 const [result]=(await tx.execute<{data:unknown}>(sql`select erp_private.supplier_claim_source(${kind},${id}) data`)).rows;return claimSourceSchema.parse(result.data);
}
export async function loadClaim(tx:Transaction,id:string,lock=false){const query=tx.select().from(supplierClaims).where(eq(supplierClaims.id,id));const [row]=lock?await query.for("update"):await query;if(!row)throw new HttpError(404,"Supplier claim not found.");return row;}
export async function approval(tx:Transaction,id:string|null){if(!id)return{approvalState:null,policyActive:false};const [a]=await tx.select({a:approvalRequests,p:approvalPolicies}).from(approvalRequests).innerJoin(approvalPolicies,eq(approvalPolicies.id,approvalRequests.policyId)).where(eq(approvalRequests.id,id));return{approvalState:a?.a.state??null,policyActive:Boolean(a&&a.p.state==="Approved"&&a.p.version===a.a.policyVersion)};}
export async function readClaim(tx:Transaction,user:User,id:string){assertClaimRead(user);const r=await loadClaim(tx,id),cost=hasCapability(user,"view_sensitive_cost");
 const [names]=(await tx.execute<{createdByName:string}>(sql`select name "createdByName" from erp_private.employees where id=${r.createdBy}`)).rows;
 const replacements=await tx.select().from(supplierReplacementReceipts).where(eq(supplierReplacementReceipts.claimId,id)).orderBy(supplierReplacementReceipts.createdAt,supplierReplacementReceipts.id);
 const received=replacements.filter(p=>p.state==="Posted").reduce((v,p)=>v.plus(p.quantity),new D(0));
 const items=[];for(const p of replacements){const [batch]=await tx.select({id:stockBatches.id}).from(stockBatches).where(eq(stockBatches.replacementReceiptId,p.id));items.push({...p,valueBdt:cost?p.valueBdt:undefined,...await approval(tx,p.approvalId),batchId:batch?.id??null});}
 return claimSchema.parse({...r,costBdt:cost?r.costBdt:undefined,creditBdt:cost?r.creditBdt:undefined,source:{...r.snapshot,valuePool:cost?r.snapshot.valuePool:undefined,priorValue:cost?r.snapshot.priorValue:undefined},reference:r.snapshot.reference,supplierName:r.snapshot.supplierName,productName:r.snapshot.productName,...names,...await approval(tx,r.approvalId),replacementReceived:received.toFixed(4),replacementOutstanding:r.state==="Posted"&&r.resolution==="Replacement"?new D(r.quantity).minus(received).toFixed(4):"0.0000",replacements:items});
}
