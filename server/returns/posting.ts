import { eq, sql } from "drizzle-orm";
import { customerEntries, customerReturnPostings, customerReturns, products, stockBatches, stockMovements } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import { businessDate } from "../../src/lib/date.js";
import { consumeApproval } from "../controls/service.js";
import { audit } from "../foundation/context.js";
import { HttpError } from "../foundation/errors.js";
import { recordLedgerEvent, recordStockLedger, twoSidedPlan } from "../ledger/service.js";
import { newId } from "../operations/common.js";
import { D } from "../trading/money.js";
import { assertReturnFresh } from "./drafts.js";
import { loadReturn } from "./records.js";

export async function postReturn(tx:Transaction,user:User,id:string,version:number) {
  const record=await loadReturn(tx,user,id,true); const {row,lines}=record; if(row.state==="Posted")return id;
  if(row.state!=="Submitted"||row.version!==version||!row.approvalId)throw new HttpError(409,"Only the current independently approved return can post.");
  await assertReturnFresh(tx,user,record);
  for(const productId of [...new Set(lines.map((l)=>l.snapshot.productId))].sort())await tx.select({id:products.id}).from(products).where(eq(products.id,productId)).for("update");
  await consumeApproval(tx,user,row.approvalId,{domain:"Returns",resourceType:"Customer Return",resourceId:id,payloadHash:row.payloadHash});
  const date=businessDate(); let appliedBdt="0.00";
  if(row.invoiceId){const [{due}]=(await tx.execute<{due:string}>(sql`select coalesce(sum(debit-credit),0)::text due from erp_private.customer_entries where invoice_id=${row.invoiceId}`)).rows;appliedBdt=D.min(row.creditBdt,D.max(0,due)).toFixed(2);}
  await tx.update(customerReturns).set({state:"Posted",version:row.version+1,postedDate:date,postedAt:new Date(),postedBy:user.id,appliedBdt}).where(eq(customerReturns.id,id));
  for(const l of lines){
    const batchId=newId("returned-batch"),movementId=newId("movement"); const s=l.snapshot;
    await tx.insert(stockBatches).values({id:batchId,returnLineId:l.id,productId:s.productId,sourceReference:row.number,lotNumber:s.lotNumber,batchNumber:`${row.number}-${l.position+1}`,manufacturingDate:s.manufacturingDate,expiryDate:s.expiryDate,receivedDate:date,condition:l.condition,quantityReceived:l.quantity,quantityAvailable:l.quantity,landedCostPerUnit:new D(l.costBdt).div(l.quantity).toFixed(10),receivedValueBdt:l.costBdt,availableValueBdt:l.costBdt,warehouse:s.warehouse,location:l.location});
    const movement={id:movementId,batchId,type:"Return" as const,quantity:l.quantity,valueBdt:l.costBdt,date,reference:row.number,createdBy:user.id,createdByName:user.name};
    await tx.insert(stockMovements).values(movement); await tx.insert(customerReturnPostings).values({id:newId("return-posting"),lineId:l.id,batchId,movementId}); await recordStockLedger(tx,user,movement);
  }
  if(new D(row.creditBdt).gt(0)){
    await tx.insert(customerEntries).values({id:newId("customer-entry"),customerId:row.customerId,orderId:row.orderId,invoiceId:row.invoiceId,date,type:"Return Credit",sourceId:id,reference:row.number,debit:"0",credit:row.creditBdt,remarks:row.reason,createdBy:user.id});
    await recordLedgerEvent(tx,user,{sourceKey:`return:${id}`,date,reference:row.number,description:"Inspected customer return credit from original saved sale",plan:twoSidedPlan("Sales Returns","Receivables",row.creditBdt)});
  }
  await audit(tx,user.id,"Inspected customer return posted","Customer Return",id,{kind:row.kind,lineCount:lines.length}); return id;
}
