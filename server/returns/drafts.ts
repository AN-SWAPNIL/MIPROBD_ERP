import { eq } from "drizzle-orm";
import { customerReturnLines, customerReturns, invoiceLines } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import type { ReturnInput, ReturnLineSnapshot } from "../../src/domains/sales/returnContracts.js";
import { businessDate } from "../../src/lib/date.js";
import { audit, digest } from "../foundation/context.js";
import { HttpError } from "../foundation/errors.js";
import { newId, nextNumber } from "../operations/common.js";
import { checkPostingDate } from "../trading/locks.js";
import { cumulativeShare, D, sum } from "../trading/money.js";
import { loadReturn, returnPrior, returnSource } from "./records.js";

export async function assertReturnFresh(tx: Transaction,user: User,record: Awaited<ReturnType<typeof loadReturn>>) {
  const source = await returnSource(tx,user,record.row.deliveryId);
  if (record.row.kind==="Invoiced Return" ? source.invoice?.id!==record.row.invoiceId || source.invoice.status!=="Approved" : Boolean(source.invoice)) throw new HttpError(409,"The invoice coverage changed. Prepare a fresh reviewed return source.");
  for (const l of record.lines) if ((await returnPrior(tx,l.deliveryLineId,record.row.invoiceId)).fingerprint!==l.fingerprint) throw new HttpError(409,"Another return or invoice change superseded this snapshot. Prepare a reviewed revision.");
}
export async function draftReturn(tx: Transaction,user: User,input: ReturnInput,previous?: Awaited<ReturnType<typeof loadReturn>>) {
  const source = await returnSource(tx,user,input.deliveryId,true); checkPostingDate(input.receivedDate,source.delivery.date);
  if (input.kind==="Invoiced Return" ? source.invoice?.id!==input.invoiceId || source.invoice.status!=="Approved" : Boolean(source.invoice)) throw new HttpError(422,"Select the original approved invoice, or cancel the draft invoice before recording an uninvoiced refusal.");
  if(source.invoice)checkPostingDate(input.receivedDate,source.invoice.date);
  const invoiced = input.invoiceId ? await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId,input.invoiceId)) : [];
  const id=newId("return"); const lines: typeof customerReturnLines.$inferInsert[]=[];
  for (const [position,line] of input.lines.entries()) {
    const original=source.lines.find((l)=>l.line.id===line.deliveryLineId); if (!original) throw new HttpError(422,"Returned lines must belong to this challan.");
    const {line:dl,batch,unit}=original; const prior=await returnPrior(tx,dl.id,input.invoiceId);
    if (new D(line.quantity).gt(new D(dl.quantity).minus(prior.quantity))) throw new HttpError(409,"Return exceeds the delivered quantity less earlier posted returns/refusals.");
    if (line.condition==="Saleable" && batch.expiryDate<businessDate()) throw new HttpError(422,"Expired medical stock cannot be inspected as saleable.");
    const il=invoiced.find((l)=>l.deliveryLineId===dl.id); if (input.invoiceId&&!il) throw new HttpError(422,"This line is not covered by the selected invoice.");
    if(il&&new D(line.quantity).gt(new D(il.quantity).minus(prior.invoiceQuantity)))throw new HttpError(409,"Return exceeds the original invoiced quantity less its earlier credits.");
    const snapshot:ReturnLineSnapshot={productId:dl.productId,productCode:dl.productCode,productName:dl.productName,unit,batchNumber:batch.batchNumber,lotNumber:batch.lotNumber,manufacturingDate:batch.manufacturingDate,expiryDate:batch.expiryDate,warehouse:batch.warehouse,deliveredQuantity:dl.quantity,invoiceQuantity:il?.quantity??"0",originalCostBdt:dl.costBdt,originalCreditBdt:il?.lineTotal??"0",originalDiscountBdt:il?.discount??"0",previousQuantity:prior.quantity,previousInvoiceQuantity:prior.invoiceQuantity,previousCostBdt:prior.cost,previousCreditBdt:prior.credit,previousDiscountBdt:prior.discount};
    const costBdt=cumulativeShare(dl.costBdt,dl.quantity,prior.quantity,prior.cost,line.quantity);
    const creditBdt=il?cumulativeShare(il.lineTotal,il.quantity,prior.invoiceQuantity,prior.credit,line.quantity):"0.00";
    const discountBdt=il?cumulativeShare(il.discount,il.quantity,prior.invoiceQuantity,prior.discount,line.quantity):"0.00";
    lines.push({id:newId("return-line"),returnId:id,position,deliveryLineId:dl.id,quantity:new D(line.quantity).toFixed(4),condition:line.condition,location:line.location,costBdt,creditBdt,discountBdt,deliveryValueBdt:cumulativeShare(dl.lineTotal,dl.quantity,prior.quantity,prior.deliveryValue,line.quantity),deliveryDiscountBdt:cumulativeShare(dl.discount,dl.quantity,prior.quantity,prior.deliveryDiscount,line.quantity),fingerprint:prior.fingerprint,snapshot});
  }
  const creditBdt=sum(lines.map((l)=>l.creditBdt)).toFixed(2); const costBdt=sum(lines.map((l)=>l.costBdt)).toFixed(2); const exposureBdt=new D(creditBdt).plus(costBdt).toFixed(2);
  if (new D(exposureBdt).gte("1e22")) throw new HttpError(422,"Return exposure exceeds supported precision.");
  const preparerIds=[...new Set([...(previous?.row.preparerIds??[]),user.id])]; if (preparerIds.length>100) throw new HttpError(422,"Too many revisions; prepare a new independently reviewed source.");
  const data={...input,lines,creditBdt,costBdt,exposureBdt,preparerIds};
  await tx.insert(customerReturns).values({id,number:await nextNumber(tx,"RET",businessDate()),kind:input.kind,deliveryId:source.delivery.id,invoiceId:input.invoiceId??null,customerId:source.delivery.customerId,orderId:source.delivery.orderId,ownerId:source.delivery.ownerId,receivedDate:input.receivedDate,reason:input.reason,inspection:input.inspection,proofReference:input.proofReference,creditBdt,costBdt,exposureBdt,preparerIds,payloadHash:digest(JSON.stringify(data)),revisionOfId:previous?.row.id??null,createdBy:user.id});
  await tx.insert(customerReturnLines).values(lines); await audit(tx,user.id,"Return inspection prepared","Customer Return",id,{kind:input.kind,deliveryId:source.delivery.id,lineCount:lines.length}); return id;
}
