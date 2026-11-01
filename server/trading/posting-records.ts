import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { accountTransactions, cashAccounts, collectionAllocations, collections, customerEntries, customers, deliveries, deliveryLines, invoiceDeliveries, invoiceLines, salesInvoices, salesOrders } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { AccountTransaction, CashBankAccount, Collection, Delivery, SalesInvoice } from "../../src/domains/erp.types.js";
import type { User } from "../../src/types/index.js";
import { assertAllowed } from "../foundation/errors.js";
import { D, money, sum } from "./money.js";

async function customerHistory(tx: Transaction, user: User, id?: string) {
  if (!id || user.role !== "Sales Executive") return Boolean(id);
  const [row] = await tx.select().from(customers).where(eq(customers.id, id));
  assertAllowed(row?.assignedSalesUserId === user.id, "This customer history is outside your assigned records.");
  return true;
}

export async function readDeliveries(tx: Transaction, user: User, filters: { id?: string; ids?: string[]; orderId?: string; customerId?: string } = {}): Promise<Delivery[]> {
  const history = await customerHistory(tx, user, filters.customerId);
  const rows = await tx.select().from(deliveries).where(and(filters.ids ? inArray(deliveries.id, filters.ids) : undefined, filters.id ? eq(deliveries.id, filters.id) : undefined, filters.orderId ? eq(deliveries.orderId, filters.orderId) : undefined, filters.customerId ? eq(deliveries.customerId, filters.customerId) : undefined, user.role === "Sales Executive" && !history ? eq(deliveries.ownerId, user.id) : undefined)).orderBy(deliveries.date, deliveries.id);
  if (!rows.length) return [];
  const lines = await tx.select().from(deliveryLines).where(inArray(deliveryLines.deliveryId, rows.map((row) => row.id))).orderBy(deliveryLines.position);
  return rows.map((row) => ({ id: row.id, challanNumber: row.challanNumber, orderId: row.orderId, customerId: row.customerId, customerName: row.customerName, salesOwnerId: row.ownerId, dispatchedByUserId: row.dispatchedBy, postedAt: row.postedAt.toISOString(), date: row.date, remarks: row.remarks, receiverName: row.receiverName, overrideReason: row.overrideReason || undefined, status: "Dispatched", lines: lines.filter((line) => line.deliveryId === row.id).map((line) => ({ id: line.id, productId: line.productId, productCode: line.productCode, productName: line.productName, quantity: line.quantity, unitPrice: line.unitPrice, discount: line.discount, lineTotal: line.lineTotal, batchId: line.batchId, batchNumber: line.batchNumber })) }));
}

export async function readInvoices(tx: Transaction, user: User, filters: { id?: string; ids?: string[]; orderId?: string; customerId?: string } = {}): Promise<(SalesInvoice & { version: number })[]> {
  const history = await customerHistory(tx, user, filters.customerId);
  const rows = await tx.select().from(salesInvoices).where(and(filters.ids ? inArray(salesInvoices.id, filters.ids) : undefined, filters.id ? eq(salesInvoices.id, filters.id) : undefined, filters.orderId ? eq(salesInvoices.orderId, filters.orderId) : undefined, filters.customerId ? eq(salesInvoices.customerId, filters.customerId) : undefined, user.role === "Sales Executive" && !history ? eq(salesInvoices.ownerId, user.id) : undefined)).orderBy(salesInvoices.date, salesInvoices.id);
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const lines = await tx.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, ids)).orderBy(invoiceLines.position);
  const links = await tx.select().from(invoiceDeliveries).where(inArray(invoiceDeliveries.invoiceId, ids));
  return rows.map((row) => ({ ...row.snapshot, id: row.id, invoiceNumber: row.invoiceNumber, orderId: row.orderId, customerId: row.customerId, ownerId: row.ownerId, date: row.date, createdAt: row.createdAt.toISOString(), approvedAt: row.approvedAt?.toISOString(), approvedByUserId: row.approvedBy ?? undefined, status: row.status, remarks: row.remarks, cancellationReason: row.cancellationReason ?? undefined, subtotal: row.subtotal, discountTotal: row.discountTotal, total: row.total, version: row.version, deliveryIds: links.filter((link) => link.invoiceId === row.id).map((link) => link.deliveryId), lines: lines.filter((line) => line.invoiceId === row.id).map(({ invoiceId: _parent, deliveryLineId: _source, position: _position, costBdt:_cost, refusalLineIds:_refused, ...line }) => { void _parent; void _source; void _position; void _cost; void _refused; return line; }) }));
}

export async function readCollections(tx: Transaction, user: User, filters: { id?: string; ids?: string[]; customerId?: string; orderId?: string } = {}): Promise<Collection[]> {
  const history = await customerHistory(tx, user, filters.customerId);
  if (user.role === "Sales Executive" && filters.orderId) {
    const [order] = await tx.select({ ownerId: salesOrders.ownerId }).from(salesOrders).where(eq(salesOrders.id, filters.orderId));
    assertAllowed(order?.ownerId === user.id, "This order receipt allocation is outside your assigned records.");
  }
  const rows = await tx.select().from(collections).where(and(filters.ids ? inArray(collections.id, filters.ids) : undefined, filters.id ? eq(collections.id, filters.id) : undefined, filters.customerId ? eq(collections.customerId, filters.customerId) : undefined, user.role === "Sales Executive" && !history && !filters.orderId ? eq(collections.ownerId, user.id) : undefined)).orderBy(collections.date, collections.id);
  if (!rows.length) return [];
  const allocations = await tx.select({ allocation: collectionAllocations, entry: customerEntries }).from(collectionAllocations).innerJoin(customerEntries, eq(collectionAllocations.receivableEntryId, customerEntries.id)).where(inArray(collectionAllocations.collectionId, rows.map((row) => row.id)));
  return rows.flatMap((row) => {
    const all = allocations.filter(({ allocation }) => allocation.collectionId === row.id).map(({ allocation, entry }) => ({ entryId: entry.id, orderId: entry.orderId ?? undefined, invoiceId: entry.invoiceId ?? undefined, amount: allocation.amount }));
    const selected = filters.orderId ? all.filter((allocation) => allocation.orderId === filters.orderId) : all;
    if (filters.orderId && !selected.length) return [];
    const applied = filters.orderId ? sum(selected.map((allocation) => allocation.amount)) : new D(row.amount);
    return [{ id: row.id, receiptNumber: row.receiptNumber, customerId: row.customerId, customerName: row.customerName, orderId: filters.orderId ?? row.orderId ?? undefined, invoiceId: filters.orderId && user.role === "Sales Executive" ? undefined : row.invoiceId ?? undefined, ownerId: row.ownerId, date: row.date, amount: money(applied), receiptAmount: filters.orderId && user.role !== "Sales Executive" ? row.amount : undefined, paymentMode: row.paymentMode, accountId: row.accountId, referenceNumber: row.referenceNumber, remarks: row.remarks, postedByUserId: row.postedBy, postedAt: row.postedAt.toISOString(), status: row.status, reversalReason: row.reversalReason ?? undefined, allocations: selected }];
  });
}

export async function accountBalance(tx: Transaction, id: string) {
  const [row] = await tx.select({ balance: sql<string>`coalesce(sum(case when ${accountTransactions.direction} = 'In' then ${accountTransactions.amount} else -${accountTransactions.amount} end), 0)::text` }).from(accountTransactions).where(eq(accountTransactions.accountId, id));
  return row.balance;
}
export async function readAccounts(tx: Transaction): Promise<(CashBankAccount & { version: number })[]> {
  const rows = await tx.select().from(cashAccounts).orderBy(cashAccounts.name, cashAccounts.id);
  const balances = await tx.select({ id: accountTransactions.accountId, balance: sql<string>`coalesce(sum(case when ${accountTransactions.direction} = 'In' then ${accountTransactions.amount} else -${accountTransactions.amount} end), 0)::text` }).from(accountTransactions).groupBy(accountTransactions.accountId);
  return rows.map((row) => ({ id: row.id, name: row.name, type: row.type, accountNumber: row.accountNumber, active: row.active, version: row.version, balance: balances.find((balance) => balance.id === row.id)?.balance ?? "0.00" }));
}
export async function readAccountTransactions(tx: Transaction): Promise<AccountTransaction[]> {
  const rows = await tx.select().from(accountTransactions).orderBy(asc(accountTransactions.date), asc(accountTransactions.createdAt), asc(accountTransactions.id));
  return rows.map(({ createdAt: _createdAt, collectionId: _collection, ...row }) => { void _createdAt; void _collection; return { ...row, reversalOfId: row.reversalOfId ?? undefined, partyId: row.partyId ?? undefined, partyName: row.partyName ?? undefined, reference: row.reference ?? undefined, remarks: row.remarks ?? undefined }; });
}
