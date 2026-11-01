import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Transaction } from "../../database/client.js";
import { customerEntries, customers, employees, orderLines, products, quotationLines, quotations, salesOrders } from "../../database/schema.js";
import type { Customer, Quotation, SalesLine, SalesOrder } from "../../src/domains/erp.types.js";
import type { User } from "../../src/types/index.js";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { calculateSalesLine, salesLineInput } from "./contracts.js";
import { newId } from "../operations/common.js";
import type { z } from "zod";

export function assertSalesOwner(user: User, ownerId: string | null | undefined) {
  assertAllowed(user.role !== "Sales Executive" || user.id === ownerId, "This record is outside your assigned sales records.");
}
export function checkVersion(actual: number, requested: number) {
  if (actual !== requested) throw new HttpError(409, "This record changed since you opened it. Reload before saving.");
}
export async function activeSalesOwner(tx: Transaction, id: string) {
  const [owner] = await tx.select().from(employees).where(eq(employees.id, id)).for("share");
  if (!owner || owner.status !== "Active" || !hasEffectivePermission({ ...owner, avatarUrl: "" }, "sales", "view")) throw new HttpError(422, "Select an active employee with Sales access.");
  return owner;
}
export function customerSnapshot(row: typeof customers.$inferSelect) {
  return { customerName: row.name, customerAddressSnapshot: row.address, customerPhoneSnapshot: row.phone, customerContactSnapshot: row.contactPerson };
}
export async function readCustomers(tx: Transaction, user: User, id?: string, ids?: string[]): Promise<(Customer & { version: number })[]> {
  const rows = await tx.select().from(customers).where(and(ids ? inArray(customers.id, ids) : undefined, id ? eq(customers.id, id) : undefined, user.role === "Sales Executive" ? eq(customers.assignedSalesUserId, user.id) : undefined)).orderBy(asc(customers.name), asc(customers.id));
  if (!rows.length) return [];
  const balances = await tx.select({ id: customerEntries.customerId,
    due: sql<string>`coalesce(sum(${customerEntries.debit} - ${customerEntries.credit}), 0)::text`,
    sales: sql<string>`coalesce(sum(case when ${customerEntries.type} = 'Invoice' then ${customerEntries.debit} when ${customerEntries.type} in ('Reversal','Return Credit') then -${customerEntries.credit} else 0 end), 0)::text`,
    collected: sql<string>`coalesce(sum(case when ${customerEntries.type} = 'Collection' then ${customerEntries.credit} when ${customerEntries.type} in ('Reversal','Return Refund') then -${customerEntries.debit} else 0 end), 0)::text`
  }).from(customerEntries).where(inArray(customerEntries.customerId, rows.map((row) => row.id))).groupBy(customerEntries.customerId);
  return rows.map((row) => { const sums = balances.find((balance) => balance.id === row.id); return { id: row.id, name: row.name, type: row.type, contactPerson: row.contactPerson, phone: row.phone, email: row.email, address: row.address, territory: row.territory, assignedSalesUserId: row.assignedSalesUserId ?? undefined, paymentTerms: row.paymentTerms, creditLimit: user.role === "Warehouse Manager" ? "Restricted" : row.creditLimit, active: row.active, currentDue: user.role === "Warehouse Manager" ? "Restricted" : sums?.due ?? "0.00", totalSales: user.role === "Warehouse Manager" ? "Restricted" : sums?.sales ?? "0.00", totalCollected: user.role === "Warehouse Manager" ? "Restricted" : sums?.collected ?? "0.00", version: row.version }; });
}
export async function lockCustomer(tx: Transaction, id: string, user: User) {
  const [row] = await tx.select().from(customers).where(eq(customers.id, id)).for("update");
  if (!row) throw new HttpError(404, "Customer not found.");
  assertSalesOwner(user, row.assignedSalesUserId);
  return row;
}
export async function canonicalSalesLines(tx: Transaction, inputs: z.infer<typeof salesLineInput>[]): Promise<SalesLine[]> {
  const result: SalesLine[] = [];
  for (const input of [...inputs].sort((a, b) => a.productId.localeCompare(b.productId))) {
    const [product] = await tx.select().from(products).where(eq(products.id, input.productId)).for("share");
    if (!product?.active) throw new HttpError(422, "Select active canonical product variants.");
    try { result.push({ id: newId("line"), productId: product.id, productCode: product.code, productName: product.name, ...calculateSalesLine(input) }); }
    catch (error) { throw new HttpError(422, (error as Error).message); }
  }
  return inputs.map((input) => result.find((line) => line.productId === input.productId)!);
}
export async function readQuotations(tx: Transaction, user: User, id?: string, ids?: string[]): Promise<(Quotation & { version: number })[]> {
  const rows = await tx.select().from(quotations).where(and(ids ? inArray(quotations.id, ids) : undefined, eq(quotations.archived, false), id ? eq(quotations.id, id) : undefined, user.role === "Sales Executive" ? eq(quotations.ownerId, user.id) : undefined)).orderBy(quotations.date, quotations.id);
  if (!rows.length) return [];
  const lines = await tx.select().from(quotationLines).where(inArray(quotationLines.quotationId, rows.map((row) => row.id))).orderBy(quotationLines.position);
  return rows.map((row) => ({ ...row.snapshot, id: row.id, quotationNumber: row.quotationNumber, date: row.date, customerId: row.customerId, ownerId: row.ownerId, createdByUserId: row.createdByUserId, createdAt: row.createdAt.toISOString(), submittedAt: row.submittedAt?.toISOString(), validityDays: row.validityDays, paymentTerms: row.paymentTerms, remarks: row.remarks, status: row.status, subtotal: row.subtotal, discountTotal: row.discountTotal, total: row.total, version: row.version,
    lines: lines.filter((line) => line.quotationId === row.id).map(({ quotationId: _parent, position: _position, ...line }) => { void _parent; void _position; return line; }) }));
}
export async function readOrders(tx: Transaction, user: User, id?: string, ids?: string[]): Promise<(SalesOrder & { version: number })[]> {
  const rows = await tx.select().from(salesOrders).where(and(ids ? inArray(salesOrders.id, ids) : undefined, id ? eq(salesOrders.id, id) : undefined, user.role === "Sales Executive" ? eq(salesOrders.ownerId, user.id) : undefined)).orderBy(salesOrders.date, salesOrders.id);
  if (!rows.length) return [];
  const lines = await tx.select().from(orderLines).where(inArray(orderLines.orderId, rows.map((row) => row.id))).orderBy(orderLines.position);
  const balances = await tx.select({ id: customerEntries.orderId,
    due: sql<string>`coalesce(sum(${customerEntries.debit} - ${customerEntries.credit}), 0)::text`,
    collected: sql<string>`coalesce(sum(case when ${customerEntries.type} = 'Collection' then ${customerEntries.credit} when ${customerEntries.type} in ('Reversal','Return Refund') then -${customerEntries.debit} else 0 end), 0)::text`
  }).from(customerEntries).where(inArray(customerEntries.orderId, rows.map((row) => row.id))).groupBy(customerEntries.orderId);
  return rows.map((row) => { const balance = balances.find((balance) => balance.id === row.id); return { ...row.snapshot, ...row.instructions, id: row.id, orderNumber: row.orderNumber, quotationId: row.quotationId ?? undefined, date: row.date, customerId: row.customerId, ownerId: row.ownerId, createdByUserId: row.createdByUserId, createdAt: row.createdAt.toISOString(), amountReceived: balance?.collected ?? "0.00", due: balance?.due ?? "0.00", status: row.status, total: row.total, version: row.version,
    lines: lines.filter((line) => line.orderId === row.id).map(({ orderId: _parent, position: _position, ...line }) => { void _parent; void _position; return line; }) }; });
}
