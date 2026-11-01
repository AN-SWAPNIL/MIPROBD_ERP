import { eq, inArray } from "drizzle-orm";
import { Decimal } from "decimal.js";
import type { Transaction } from "../../database/client.js";
import { documents, employees, importCases, importCosts, importItems, landedSnapshots, products } from "../../database/schema.js";
import type { ImportCase, ImportItem } from "../../src/domains/erp.types.js";
import type { User } from "../../src/types/index.js";
import { hasCapability } from "../../src/lib/permissions/effectiveAccess.js";
import { importDisplayReference } from "../../src/domains/imports/costing.js";
import { HttpError } from "../foundation/errors.js";
import { newId } from "./common.js";
import { itemInput } from "./contracts.js";
import type { z } from "zod";

export const money = (value: Decimal.Value) => new Decimal(value).toFixed(2);
export async function loadImports(tx: Transaction, id?: string): Promise<ImportCase[]> {
  const records = await tx.select().from(importCases).where(id ? eq(importCases.id, id) : undefined).orderBy(importCases.createdAt, importCases.id);
  if (!records.length) return [];
  const ids = records.map((record) => record.id);
  const items = await tx.select().from(importItems).where(inArray(importItems.importId, ids)).orderBy(importItems.id);
  const costs = await tx.select().from(importCosts).where(inArray(importCosts.importId, ids)).orderBy(importCosts.id);
  const snapshots = await tx.select().from(landedSnapshots).where(inArray(landedSnapshots.importId, ids)).orderBy(landedSnapshots.version);
  const files = await tx.select({ document: documents, name: employees.name }).from(documents).innerJoin(employees, eq(documents.uploadedBy, employees.id)).where(inArray(documents.importId, ids));
  return records.map((record) => {
    const snapshotHistory = snapshots.filter((row) => row.importId === record.id).map((row) => row.data);
    const snapshot = record.currentSnapshotVersion === null ? undefined : snapshotHistory.find((row) => row.version === record.currentSnapshotVersion);
    const caseCosts = costs.filter((row) => row.importId === record.id).map(({ data, amountForeign, amountBdt, exchangeRate }) => ({ ...data, amountForeign, amountBdt, exchangeRate }));
    return {
      ...record.commercial, rateDate: record.commercial.rateDate ?? "", id: record.id, draftReference: record.draftReference,
      primaryReference: importDisplayReference({ ...record.commercial, draftReference: record.draftReference }),
      supplierId: record.supplierId, supplierName: record.supplierName, status: record.status, milestone: record.status,
      costingStatus: snapshot ? "Finalized" : caseCosts.length ? "In Progress" : "Not Started",
      warehouseStatus: record.status === "Received" || record.status === "Closed" ? "Received" : record.status === "Partially Received" ? "Partially Received" : snapshot ? "Ready" : "Not Ready",
      items: items.filter((row) => row.importId === record.id).map(({ importId: _importId, ...row }) => { void _importId; return row; }),
      costs: caseCosts, documents: files.filter(({ document }) => document.importId === record.id && document.status === "Attached").map(({ document, name }) => ({ id: document.id, importId: record.id, entityType: "import" as const, entityId: record.id, documentType: document.documentType, type: document.documentType, name: document.fileName, fileName: document.fileName, mimeType: document.mimeType, sizeBytes: document.sizeBytes, source: "UPLOADED" as const, previewUrl: `/api/documents/${document.id}`, sensitive: document.sensitive, createdByUserId: document.uploadedBy, createdByName: name, createdAt: document.createdAt.toISOString(), uploadedAt: document.attachedAt!.toISOString(), uploadedBy: name, status: "Available" as const })), snapshot, snapshotHistory, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString()
    };
  });
}
export async function loadImport(tx: Transaction, id: string) {
  const [record] = await loadImports(tx, id);
  if (!record) throw new HttpError(404, "Import not found.");
  return record;
}
export function visibleImport(record: ImportCase, user: User): ImportCase {
  if (hasCapability(user, "view_sensitive_cost")) return record;
  return { ...record, lcAmount: undefined, ttAmount: undefined, exchangeRate: "0", costs: [], snapshot: undefined, snapshotHistory: [], documents: record.documents.filter((document) => !document.sensitive), items: record.items.map((item) => ({ ...item, fobUnitForeign: "0", exchangeRate: "0", fobTotalBdt: "0" })) };
}
export async function lockImport(tx: Transaction, id: string, editable = false) {
  const [row] = await tx.select().from(importCases).where(eq(importCases.id, id)).for("update");
  if (!row) throw new HttpError(404, "Import not found.");
  if (editable && (["Cancelled", "Closed"].includes(row.status) || row.currentSnapshotVersion !== null)) throw new HttpError(423, "Finalized or terminal imports are locked. Reopen costing before editing.");
  return row;
}
export async function canonicalItem(tx: Transaction, input: z.infer<typeof itemInput>, user: User, old?: ImportItem) {
  const [product] = await tx.select().from(products).where(eq(products.id, input.productId)).for("share");
  if (!product || (!product.active && old?.productId !== product.id)) throw new HttpError(422, "Select an active canonical product.");
  const canEditCost = hasCapability(user, "edit_sensitive_cost");
  const sameProduct = old?.productId === input.productId;
  const fobUnitForeign = canEditCost ? input.fobUnitForeign : sameProduct ? old!.fobUnitForeign : "0";
  const exchangeRate = canEditCost ? input.currency === "BDT" ? "1" : input.exchangeRate : sameProduct ? old!.exchangeRate : "0";
  const fobTotalBdt = money(new Decimal(input.quantity).mul(fobUnitForeign).mul(exchangeRate));
  const totalCbm = input.cbmMode === "MANUAL" ? input.totalCbm : new Decimal(input.cbmPerCarton).mul(input.cartonCount).toFixed(8);
  if (new Decimal(fobTotalBdt).gte("1e22") || new Decimal(totalCbm).gte("1e10")) throw new HttpError(422, "Derived item value exceeds supported storage precision.");
  const currency = canEditCost ? input.currency : sameProduct ? old!.currency : "USD";
  return { ...input, currency, id: old?.id ?? newId("itm"), productCode: product.code, productName: product.name, unit: product.unit, hsCode: input.hsCode ?? product.hsCode, fobUnitForeign, exchangeRate, fobTotalBdt, totalCbm };
}
