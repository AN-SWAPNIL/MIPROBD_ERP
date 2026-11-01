import { eq, sql } from "drizzle-orm";
import { cashAccounts, customerEntries, customers, returnSettlements, salesInvoices } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import { returnSettlementInput } from "../../src/domains/sales/returnContracts.js";
import type { z } from "zod";
import { createApproval, consumeApproval } from "../controls/service.js";
import { audit, digest } from "../foundation/context.js";
import { HttpError } from "../foundation/errors.js";
import { businessDate } from "../../src/lib/date.js";
import { newId, nextNumber } from "../operations/common.js";
import { postAccountEntry } from "../trading/accounts.js";
import { D } from "../trading/money.js";
import { creditBalance, loadReturn } from "./records.js";

async function checkSettlement(tx:Transaction,user:User,returnId:string,input:Pick<z.infer<typeof returnSettlementInput>,"kind"|"amountBdt"|"accountId"|"invoiceId"|"receivableEntryId">) {
  const record=await loadReturn(tx,user,returnId,true); const {row}=record; if(row.state!=="Posted"||!row.invoiceId)throw new HttpError(409,"Only a posted credit return can be settled.");
  const balances=await creditBalance(tx,row);
  if(new D(input.amountBdt).gt(balances.availableCreditBdt))throw new HttpError(409,"Amount exceeds this return's unapplied credit.");
  if(input.kind==="Refund"){
    if(new D(input.amountBdt).gt(balances.refundableBdt))throw new HttpError(409,"Refund exceeds the customer's net credit. Apply credit to open invoices first.");
    const [account]=await tx.select().from(cashAccounts).where(eq(cashAccounts.id,input.accountId!)); if(!account?.active)throw new HttpError(422,"Choose an active refund account.");
  } else if(input.receivableEntryId) {
    const [target]=await tx.select().from(customerEntries).where(eq(customerEntries.id,input.receivableEntryId)).for("update");
    if(!target||target.customerId!==row.customerId||target.type!=="Opening Due"||!target.openingPositionId||target.date>businessDate())throw new HttpError(422,"Choose an approved opening receivable for this customer.");
    const [{due}]=(await tx.execute<{due:string|null}>(sql`select erp_private.opening_receivable_due(${target.id})::text due`)).rows;
    if(due===null||new D(input.amountBdt).gt(due))throw new HttpError(409,"Credit exceeds the opening receivable's remaining due.");
  } else {
    const [invoice]=await tx.select().from(salesInvoices).where(eq(salesInvoices.id,input.invoiceId!)).for("update");
    if(!invoice||invoice.customerId!==row.customerId||invoice.id===row.invoiceId||invoice.status!=="Approved")throw new HttpError(422,"Choose a different approved invoice for this customer.");
    const [{due}]=(await tx.execute<{due:string}>(sql`select coalesce(sum(debit-credit),0)::text due from erp_private.customer_entries where invoice_id=${invoice.id}`)).rows;
    if(new D(input.amountBdt).gt(due))throw new HttpError(409,"Credit cannot exceed the target invoice's outstanding balance.");
  }
  return record;
}
export async function draftReturnSettlement(tx:Transaction,user:User,returnId:string,input:z.infer<typeof returnSettlementInput>) {
  const {row}=await checkSettlement(tx,user,returnId,input); const id=newId("return-settlement"),number=await nextNumber(tx,input.kind==="Refund"?"RF":"CA",businessDate());
  const payloadHash=digest(JSON.stringify({id,returnId,...input}));
  const approvalId=await createApproval(tx,user,{domain:"Returns",resourceType:"Return Settlement",resourceId:id,reference:number,amountBdt:input.amountBdt,payloadHash,context:{returnId:row.id,excludedActorIds:[user.id],kind:input.kind}});
  await tx.insert(returnSettlements).values({...input,id,number,returnId,accountId:input.accountId??null,invoiceId:input.invoiceId??null,receivableEntryId:input.receivableEntryId??null,payloadHash,approvalId,createdBy:user.id});
  await audit(tx,user.id,"Return settlement submitted","Return Settlement",id,{returnId,kind:input.kind});return id;
}
export async function postReturnSettlement(tx:Transaction,user:User,id:string,version:number) {
  const [ref]=await tx.select().from(returnSettlements).where(eq(returnSettlements.id,id));if(!ref)throw new HttpError(404,"Return settlement not found.");
  await loadReturn(tx,user,ref.returnId,true);
  const [row]=await tx.select().from(returnSettlements).where(eq(returnSettlements.id,id)).for("update");if(row.state==="Posted")return row.returnId;
  if(row.version!==version)throw new HttpError(409,"Settlement version changed. Reload before posting.");
  const {row:source}=await checkSettlement(tx,user,row.returnId,{...row,accountId:row.accountId??undefined,invoiceId:row.invoiceId??undefined,receivableEntryId:row.receivableEntryId??undefined});
  await consumeApproval(tx,user,row.approvalId,{domain:"Returns",resourceType:"Return Settlement",resourceId:id,payloadHash:row.payloadHash});const date=businessDate();let transactionId:string|null=null;
  if(row.kind==="Refund"){
    const [customer]=await tx.select({name:customers.name}).from(customers).where(eq(customers.id,source.customerId));
    transactionId=await postAccountEntry(tx,user,{accountId:row.accountId!,date,direction:"Out",amount:row.amountBdt,sourceType:"Return Refund",sourceId:id,partyId:source.customerId,partyName:customer.name,description:`Customer refund: ${source.number}`,reference:row.proofReference,remarks:row.reason});
    await tx.insert(customerEntries).values({id:newId("customer-entry"),customerId:source.customerId,orderId:source.orderId,invoiceId:source.invoiceId,date,type:"Return Refund",sourceId:id,reference:row.number,debit:row.amountBdt,credit:"0",remarks:row.reason,createdBy:user.id});
  } else {
    const [target]=row.invoiceId?await tx.select().from(salesInvoices).where(eq(salesInvoices.id,row.invoiceId)):[];
    for(const outbound of [true,false])await tx.insert(customerEntries).values({id:newId("customer-entry"),customerId:source.customerId,orderId:outbound?source.orderId:target?.orderId??null,invoiceId:outbound?source.invoiceId:target?.id??null,date,type:outbound?"Credit Transfer Out":"Credit Transfer In",sourceId:id,reference:row.number,debit:outbound?row.amountBdt:"0",credit:outbound?"0":row.amountBdt,remarks:row.reason,createdBy:user.id});
  }
  await tx.update(returnSettlements).set({state:"Posted",version:row.version+1,date,postedBy:user.id,transactionId}).where(eq(returnSettlements.id,id));
  await audit(tx,user.id,"Return settlement posted","Return Settlement",id,{returnId:source.id,kind:row.kind});return source.id;
}
