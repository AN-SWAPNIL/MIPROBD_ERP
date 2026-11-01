import { and, desc, eq, inArray } from "drizzle-orm";
import { documents, employees, expenses, financialPositionEntries, supplierSettlements } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { DocumentRecord, Expense, FinancialPositionEntry, SupplierSettlement } from "../../src/domains/erp.types.js";

const reversal = (row: { reversedBy: string | null; reversedAt: Date | null; reversalDate: string | null; reversalReason: string | null }) => ({ reversedByUserId: row.reversedBy ?? undefined, reversedAt: row.reversedAt?.toISOString(), reversalDate: row.reversalDate ?? undefined, reversalReason: row.reversalReason ?? undefined });

export async function readExpenses(tx: Transaction, id?: string): Promise<Expense[]> {
  const rows = await tx.select().from(expenses).where(id ? eq(expenses.id, id) : undefined).orderBy(desc(expenses.date), desc(expenses.createdAt), expenses.id);
  const evidence = rows.length ? await tx.select({ doc: documents, name: employees.name }).from(documents).innerJoin(employees, eq(documents.uploadedBy, employees.id)).where(and(inArray(documents.expenseId, rows.map((row) => row.id)), eq(documents.status, "Attached"), eq(documents.purpose, "expense-receipt"))) : [];
  return rows.map((row) => {
    const item = evidence.find(({ doc }) => doc.expenseId === row.id);
    const attachment: DocumentRecord | undefined = item ? { id: item.doc.id, entityType: "expense", entityId: row.id, source: "UPLOADED", documentType: "Expense Receipt", fileName: item.doc.fileName, mimeType: item.doc.mimeType, sizeBytes: item.doc.sizeBytes, previewUrl: `/api/documents/${item.doc.id}`, sensitive: true, createdByUserId: item.doc.uploadedBy, createdByName: item.name, createdAt: item.doc.createdAt.toISOString() } : undefined;
    return { id: row.id, date: row.date, categoryId: row.categoryId, categoryName: row.categoryName, subtype: row.subtype, amount: row.amount, paidFromAccountId: row.paidFromAccountId, expenseFor: row.expenseFor, ...row.attribution, employeeId: row.employeeId ?? undefined, taAmount: row.taAmount ?? undefined, daAmount: row.daAmount ?? undefined, remarks: row.remarks, enteredByUserId: row.enteredByUserId, enteredByName: row.enteredByName, status: row.status, ...reversal(row), attachment, attachmentName: attachment?.fileName };
  });
}
export async function readSettlements(tx: Transaction, id?: string): Promise<SupplierSettlement[]> {
  const rows = await tx.select().from(supplierSettlements).where(id ? eq(supplierSettlements.id, id) : undefined).orderBy(desc(supplierSettlements.date), desc(supplierSettlements.createdAt), supplierSettlements.id);
  return rows.map(({ reversedBy: _by, reversedAt: _at, reversalDate: _date, reversalReason: _reason, transactionId: _transaction, ...row }) => { void _by; void _at; void _date; void _reason; void _transaction; return { ...row, supplierClaimId: row.supplierClaimId ?? undefined, openingPositionId: row.openingPositionId ?? undefined, importId: row.importId ?? undefined, accountId: row.accountId ?? undefined, accountName: row.accountName ?? undefined, createdAt: row.createdAt.toISOString(), ...reversal({ reversedBy: _by, reversedAt: _at, reversalDate: _date, reversalReason: _reason }) }; });
}
export async function readPosition(tx: Transaction, id?: string): Promise<FinancialPositionEntry[]> {
  return (await tx.select().from(financialPositionEntries).where(id ? eq(financialPositionEntries.id, id) : undefined).orderBy(desc(financialPositionEntries.asOfDate), desc(financialPositionEntries.createdAt), financialPositionEntries.id)).map(({ reversedBy, reversedAt, reversalDate, reversalReason, ...row }) => ({ ...row, createdAt: row.createdAt.toISOString(), ...reversal({ reversedBy, reversedAt, reversalDate, reversalReason }) }));
}
