import { and, eq, sql } from "drizzle-orm";
import { approvalPolicies, approvalRequests, cashAccounts, customerEntries, customerReturnLines, customerReturnPostings, customerReturns, customers, deliveries, deliveryLines, employees, invoiceDeliveries, products, returnSettlements, salesInvoices, salesOrders, stockBatches } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import { hasCapability, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { returnSchema, returnSourceSchema } from "../../src/domains/sales/returnContracts.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { assertSalesOwner } from "../trading/records.js";
import { lockOrder } from "../trading/locks.js";
import { D } from "../trading/money.js";
import { remainingReturnCredit } from "./money.js";

export function assertReturnRead(user: User) { assertAllowed(hasEffectivePermission(user, "sales") || hasEffectivePermission(user, "inventory")); }
export async function returnSource(tx: Transaction, user: User, id: string, lock = false) {
  const [delivery] = await tx.select().from(deliveries).where(eq(deliveries.id, id));
  if (!delivery) throw new HttpError(404, "Delivery source not found"); assertSalesOwner(user, delivery.ownerId);
  if (lock) await lockOrder(tx, delivery.orderId, user);
  const [active] = await tx.select({ invoice: salesInvoices }).from(invoiceDeliveries).innerJoin(salesInvoices, eq(salesInvoices.id, invoiceDeliveries.invoiceId)).where(and(eq(invoiceDeliveries.deliveryId, id), eq(invoiceDeliveries.active, true)));
  const lines = await tx.select({ line: deliveryLines, batch: stockBatches, unit: products.unit }).from(deliveryLines).innerJoin(stockBatches, eq(stockBatches.id, deliveryLines.batchId)).innerJoin(products, eq(products.id, deliveryLines.productId)).where(eq(deliveryLines.deliveryId, id)).orderBy(deliveryLines.position);
  return { delivery, invoice: active?.invoice, lines };
}
export async function returnPrior(tx: Transaction, lineId: string, invoiceId?: string | null) {
  return (await tx.execute<{ quantity: string; cost: string; invoiceQuantity: string; credit: string; discount: string; deliveryValue: string; deliveryDiscount: string; fingerprint: string }>(sql`select coalesce(sum(l.quantity),0)::text quantity,coalesce(sum(l.cost_bdt),0)::text cost,coalesce(sum(l.delivery_value_bdt),0)::text "deliveryValue",coalesce(sum(l.delivery_discount_bdt),0)::text "deliveryDiscount",
    coalesce(sum(l.quantity) filter(where r.invoice_id=${invoiceId ?? null}),0)::text "invoiceQuantity",coalesce(sum(l.credit_bdt) filter(where r.invoice_id=${invoiceId ?? null}),0)::text credit,coalesce(sum(l.discount_bdt) filter(where r.invoice_id=${invoiceId ?? null}),0)::text discount,
    erp_private.return_line_fingerprint(${lineId}) fingerprint from erp_private.customer_return_lines l join erp_private.customer_returns r on r.id=l.return_id where l.delivery_line_id=${lineId} and r.state='Posted'`)).rows[0];
}
export async function sourceDto(tx: Transaction, user: User, id: string) {
  const source = await returnSource(tx,user,id);
  const lines = []; for (const { line, batch, unit } of source.lines) { const prior = await returnPrior(tx,line.id); lines.push({ id: line.id, productName: line.productName, batchNumber: batch.batchNumber, lotNumber: batch.lotNumber, expiryDate: batch.expiryDate, delivered: line.quantity, returned: prior.quantity, returnable: new D(line.quantity).minus(prior.quantity).toFixed(4), unit, location: batch.location }); }
  return returnSourceSchema.parse({ id, challanNumber: source.delivery.challanNumber, customerName: source.delivery.customerName, orderId: source.delivery.orderId, invoiceId: source.invoice?.id ?? null, invoiceNumber: source.invoice?.invoiceNumber ?? null, invoiceStatus: source.invoice?.status ?? null, lines });
}
export async function loadReturn(tx: Transaction, user: User, id: string, lock = false) {
  const [row] = await tx.select().from(customerReturns).where(eq(customerReturns.id,id)); if (!row) throw new HttpError(404,"Return source not found"); assertSalesOwner(user,row.ownerId);
  if (lock) { await lockOrder(tx,row.orderId,user); const [locked] = await tx.select().from(customerReturns).where(eq(customerReturns.id,id)).for("update"); return { row: locked, lines: await tx.select().from(customerReturnLines).where(eq(customerReturnLines.returnId,id)).orderBy(customerReturnLines.position) }; }
  return { row, lines: await tx.select().from(customerReturnLines).where(eq(customerReturnLines.returnId,id)).orderBy(customerReturnLines.position) };
}
export async function creditBalance(tx: Transaction, row: typeof customerReturns.$inferSelect) {
  const [{ settled }] = (await tx.execute<{ settled: string }>(sql`select coalesce(sum(amount_bdt),0)::text settled from erp_private.return_settlements where return_id=${row.id} and state='Posted'`)).rows;
  const [{ due }] = await tx.select({ due: sql<string>`coalesce(sum(${customerEntries.debit}-${customerEntries.credit}),0)::text` }).from(customerEntries).where(eq(customerEntries.customerId,row.customerId));
  return remainingReturnCredit(row.creditBdt,row.appliedBdt ?? row.creditBdt,settled,due);
}
export async function readReturn(tx: Transaction,user: User,id: string) {
  const {row,lines} = await loadReturn(tx,user,id); const finance = user.role !== "Warehouse Manager" && hasEffectivePermission(user,"sales"); const cost = hasCapability(user,"view_sensitive_cost");
  const [names] = await tx.select({ customerName: customers.name, createdByName: employees.name, orderNumber: salesOrders.orderNumber, challanNumber: deliveries.challanNumber }).from(customerReturns).innerJoin(customers,eq(customers.id,customerReturns.customerId)).innerJoin(employees,eq(employees.id,customerReturns.createdBy)).innerJoin(salesOrders,eq(salesOrders.id,customerReturns.orderId)).innerJoin(deliveries,eq(deliveries.id,customerReturns.deliveryId)).where(eq(customerReturns.id,id));
  const [invoice] = row.invoiceId ? await tx.select().from(salesInvoices).where(eq(salesInvoices.id,row.invoiceId)) : [];
  const [approval] = row.approvalId ? await tx.select({ request: approvalRequests, policy: approvalPolicies }).from(approvalRequests).innerJoin(approvalPolicies,eq(approvalPolicies.id,approvalRequests.policyId)).where(eq(approvalRequests.id,row.approvalId)) : [];
  const postings = await tx.select().from(customerReturnPostings).where(sql`${customerReturnPostings.lineId} in (select id from erp_private.customer_return_lines where return_id=${id})`);
  const settlements = finance ? await tx.select({ s: returnSettlements, request: approvalRequests, policy: approvalPolicies, accountName: cashAccounts.name, invoiceNumber: sql<string>`coalesce(${salesInvoices.invoiceNumber},(select e.reference from erp_private.customer_entries e where e.id=${returnSettlements.receivableEntryId}))` }).from(returnSettlements).innerJoin(approvalRequests,eq(approvalRequests.id,returnSettlements.approvalId)).innerJoin(approvalPolicies,eq(approvalPolicies.id,approvalRequests.policyId)).leftJoin(cashAccounts,eq(cashAccounts.id,returnSettlements.accountId)).leftJoin(salesInvoices,eq(salesInvoices.id,returnSettlements.invoiceId)).where(eq(returnSettlements.returnId,id)).orderBy(returnSettlements.createdAt) : [];
  return returnSchema.parse({ ...row,...names, invoiceNumber: invoice?.invoiceNumber ?? null, ...(finance ? {...await creditBalance(tx,row),appliedBdt:row.appliedBdt} : {creditBdt:undefined,appliedBdt:undefined}), costBdt:cost?row.costBdt:undefined, approvalState:approval?.request.state??null, policyActive:Boolean(approval&&approval.policy.state==="Approved"&&approval.policy.version===approval.request.policyVersion),
    lines:lines.map((l)=>({id:l.id,deliveryLineId:l.deliveryLineId,...l.snapshot,quantity:l.quantity,condition:l.condition,location:l.location, ...(finance?{creditBdt:l.creditBdt,discountBdt:l.discountBdt}:{}), ...(cost?{costBdt:l.costBdt}:{}),targetBatchId:postings.find((p)=>p.lineId===l.id)?.batchId??null})),
    settlements:settlements.map(({s,request,policy,accountName,invoiceNumber})=>({...s,accountName,invoiceNumber,approvalState:request.state,policyActive:policy.state==="Approved"&&policy.version===request.policyVersion})) });
}
