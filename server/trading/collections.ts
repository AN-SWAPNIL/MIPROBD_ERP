import { Router } from "express";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { accountTransactions, cashAccounts, collectionAllocations, collections, customerEntries, openingPositions, postingKeys, salesInvoices } from "../../database/schema.js";
import { audit, identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { businessDate } from "../../src/lib/date.js";
import { lockActor, newId, nextNumber, postingIdentity } from "../operations/common.js";
import { collectionInput, reversalInput } from "./contracts.js";
import { checkPostingDate, lockOrder, lockPosting } from "./locks.js";
import { assertSalesOwner, lockCustomer, readCustomers } from "./records.js";
import { readCollections } from "./posting-records.js";
import { allocateOutstanding, D, money } from "./money.js";
import { postAccountEntry } from "./accounts.js";

export function createCollectionRouter(ctx: Context) {
  const router = Router();
  router.get("/collections", async (_req, res) => {
    const user = identity(res).user; assertAllowed(user.role !== "Warehouse Manager" && hasEffectivePermission(user, "sales", "view"));
    res.json({ success: true, data: await ctx.db.transaction((tx) => readCollections(tx, user)), message: "Receipts and allocations loaded" });
  });
  router.post("/collections", async (req, res) => {
    const actor = identity(res); const input = collectionInput.parse(req.body); const key = postingIdentity(req, `${actor.user.id}:collection`, input);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "sales", "post"); assertAllowed(user.role !== "Warehouse Manager");
      const previous = await lockPosting(tx, key); if (previous) return previous;
      const customer = await lockCustomer(tx, input.customerId, user); checkPostingDate(input.date);
      let orderId = input.orderId || undefined;
      if (input.invoiceId) {
        const [invoice] = await tx.select().from(salesInvoices).where(eq(salesInvoices.id, input.invoiceId));
        if (!invoice || invoice.customerId !== customer.id || invoice.status !== "Approved") throw new HttpError(422, "Select an approved invoice for this customer.");
        assertSalesOwner(user, invoice.ownerId);
        if (orderId && orderId !== invoice.orderId) throw new HttpError(422, "Selected invoice and order do not match.");
        orderId = invoice.orderId;
      }
      if (orderId) {
        const { order } = await lockOrder(tx, orderId, user);
        if (order.customerId !== customer.id || order.status === "Cancelled") throw new HttpError(422, "Select a valid order for this customer.");
      }
      const [current] = await readCustomers(tx, user, customer.id);
      if (!current || new D(input.amount).gt(current.currentDue)) throw new HttpError(409, "Collection cannot exceed current customer due.");
      const entries = await tx.select({ entry: customerEntries, invoice: salesInvoices, opening: openingPositions }).from(customerEntries).leftJoin(salesInvoices, eq(customerEntries.invoiceId, salesInvoices.id)).leftJoin(openingPositions, eq(customerEntries.openingPositionId, openingPositions.id))
        .where(and(eq(customerEntries.customerId, customer.id), inArray(customerEntries.type, ["Invoice", "Opening Due"]), lte(customerEntries.date, input.date), input.invoiceId ? eq(customerEntries.invoiceId, input.invoiceId) : undefined, orderId ? eq(customerEntries.orderId, orderId) : undefined));
      const openingBalances=(await tx.execute<{id:string;due:string}>(sql`select id,erp_private.opening_receivable_due(id)::text due from erp_private.customer_entries where customer_id=${customer.id} and type='Opening Due' and opening_position_id is not null`)).rows;
      const legacyPaid=entries.some(({entry})=>entry.type==="Opening Due"&&!entry.openingPositionId)?await tx.select({id:collectionAllocations.receivableEntryId,amount:sql<string>`sum(${collectionAllocations.amount})::text`}).from(collectionAllocations).innerJoin(collections,eq(collectionAllocations.collectionId,collections.id)).where(and(inArray(collectionAllocations.receivableEntryId,entries.map(({entry})=>entry.id)),eq(collections.status,"Posted"))).groupBy(collectionAllocations.receivableEntryId):[];
      const invoiceBalances=entries.some(({entry})=>entry.invoiceId)?(await tx.execute<{id:string;due:string}>(sql`select invoice_id id,sum(debit-credit)::text due from erp_private.customer_entries where customer_id=${customer.id} and date<=${input.date}::date and invoice_id is not null group by invoice_id`)).rows:[];
      const eligible = entries.filter(({ entry, invoice }) => entry.type === "Opening Due" || invoice?.status === "Approved").filter(({ invoice }) => user.role !== "Sales Executive" || !invoice || invoice.ownerId === user.id).map(({ entry, opening }) => ({ id: entry.id, date: opening?.snapshot.originalDocumentDate || entry.date, outstanding: entry.invoiceId?invoiceBalances.find((r)=>r.id===entry.invoiceId)?.due??"0":entry.openingPositionId?openingBalances.find(r=>r.id===entry.id)?.due??"0":new D(entry.debit).minus(legacyPaid.find(r=>r.id===entry.id)?.amount??"0").toFixed(2) }));
      let allocations;
      try { allocations = allocateOutstanding(input.amount, eligible); } catch (error) { throw new HttpError(409, (error as Error).message); }
      const allocationOrders = [...new Set(allocations.map((allocation) => entries.find(({ entry }) => entry.id === allocation.entryId)!.entry.orderId).filter((id): id is string => Boolean(id)))];
      const allocationOwners = [...new Set(allocations.map((allocation) => entries.find(({ entry }) => entry.id === allocation.entryId)!.invoice?.ownerId).filter((id): id is string => Boolean(id)))];
      const [account] = await tx.select().from(cashAccounts).where(eq(cashAccounts.id, input.accountId)).for("update");
      const expectedType = input.paymentMode === "Cash" ? "Cash" : input.paymentMode === "bKash" ? "Mobile Banking" : "Bank";
      if (!account?.active || account.type !== expectedType) throw new HttpError(422, `This payment mode requires an active ${expectedType} account.`);
      const id = newId("collection"); const number = await nextNumber(tx, "MR", input.date);
      await tx.insert(collections).values({ id, receiptNumber: number, customerId: customer.id, customerName: customer.name, orderId: orderId ?? (allocationOrders.length === 1 && allocations.every((allocation) => Boolean(entries.find(({ entry }) => entry.id === allocation.entryId)!.entry.orderId)) ? allocationOrders[0] : null), invoiceId: input.invoiceId || null, ownerId: user.role === "Sales Executive" ? user.id : allocationOwners.length === 1 ? allocationOwners[0] : customer.assignedSalesUserId || user.id, date: input.date, amount: money(input.amount), paymentMode: input.paymentMode, accountId: account.id, referenceNumber: input.referenceNumber, remarks: input.remarks, postedBy: user.id });
      for (const allocation of allocations) {
        const source = entries.find(({ entry }) => entry.id === allocation.entryId)!.entry; const allocationId = newId("payment-allocation");
        await tx.insert(collectionAllocations).values({ id: allocationId, collectionId: id, receivableEntryId: source.id, amount: allocation.amount });
        await tx.insert(customerEntries).values({ id: newId("customer-entry"), customerId: customer.id, orderId: source.orderId, invoiceId: source.invoiceId, collectionId: id, date: input.date, type: "Collection", sourceId: allocationId, reference: number, debit: "0", credit: allocation.amount, remarks: input.remarks || input.paymentMode, createdBy: user.id });
      }
      await postAccountEntry(tx, user, { accountId: account.id, date: input.date, direction: "In", amount: input.amount, sourceType: "Collection", sourceId: id, collectionId: id, description: `Collection from ${customer.name}`, partyId: customer.id, partyName: customer.name, reference: input.referenceNumber, remarks: input.remarks });
      await tx.insert(postingKeys).values({ ...key, resourceId: id }); await audit(tx, user.id, "Collection posted", "Collection", id, { receiptNumber: number, amount: input.amount, allocationCount: allocations.length }); return id;
    });
    res.status(201).json({ success: true, data: (await ctx.db.transaction((tx) => readCollections(tx, actor.user, { id })))[0], message: "Receipt allocated and cash/bank posted atomically" });
  });
  router.post("/collections/:id/reverse", async (req, res) => {
    const actor = identity(res); const id = String(req.params.id); const input = reversalInput.parse(req.body); const key = postingIdentity(req, `${actor.user.id}:collection-reverse:${id}`, input);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "accounts", "post");
      const previous = await lockPosting(tx, key); if (previous) return;
      const [locator] = await tx.select({ customerId: collections.customerId, orderId: collections.orderId }).from(collections).where(eq(collections.id, id));
      if (!locator) throw new HttpError(404, "Collection not found.");
      await lockCustomer(tx, locator.customerId, user);
      if (locator.orderId) await lockOrder(tx, locator.orderId, user);
      const [receipt] = await tx.select().from(collections).where(eq(collections.id, id)).for("update");
      if (receipt.status !== "Posted") throw new HttpError(409, "This receipt has already been reversed.");
      const date = businessDate(); const credits = await tx.select().from(customerEntries).where(and(eq(customerEntries.collectionId, id), eq(customerEntries.type, "Collection")));
      const [original] = await tx.select().from(accountTransactions).where(and(eq(accountTransactions.collectionId, id), eq(accountTransactions.sourceId, id)));
      if (!original || !credits.length) throw new HttpError(409, "Receipt journal needs administrator reconciliation before reversal.");
      await postAccountEntry(tx, user, { accountId: receipt.accountId, date, direction: "Out", amount: receipt.amount, sourceType: "Collection", sourceId: `reversal-${id}`, collectionId: id, reversalOfId: original.id, description: `Receipt reversal: ${receipt.receiptNumber}`, partyId: receipt.customerId, partyName: receipt.customerName, remarks: input.reason }, true);
      for (const credit of credits) await tx.insert(customerEntries).values({ id: newId("customer-entry"), customerId: credit.customerId, orderId: credit.orderId, invoiceId: credit.invoiceId, collectionId: id, date, type: "Reversal", sourceId: credit.sourceId, reference: receipt.receiptNumber, debit: credit.credit, credit: "0", remarks: input.reason, createdBy: user.id });
      await tx.update(collections).set({ status: "Reversed", reversedBy: user.id, reversedAt: new Date(), reversalReason: input.reason }).where(eq(collections.id, id));
      await tx.insert(postingKeys).values({ ...key, resourceId: id }); await audit(tx, user.id, "Collection reversed", "Collection", id, { reason: input.reason });
    });
    res.json({ success: true, data: (await ctx.db.transaction((tx) => readCollections(tx, actor.user, { id })))[0], message: "Receipt reversed with compensating journals; original preserved" });
  });
  return router;
}
