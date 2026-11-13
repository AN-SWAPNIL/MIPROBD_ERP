import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { Decimal } from "decimal.js";
import { importCases, ledgerConfigurations, openingPositions, postingKeys, receiptLines, stockBatches, stockMovements, warehouseReceipts } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { DispatchPreview, StockBatch, WarehouseReceipt } from "../../src/domains/erp.types.js";
import type { User } from "../../src/types/index.js";
import { hasCapability, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { businessDate } from "../../src/lib/date.js";
import { inventoryPageInput } from "../../src/domains/inventory/pageContracts.js";
import { createInventoryReadRouter, inventoryPage } from "./inventory-read.js";
import { audit, identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { dispatchInput, receiptInput } from "./contracts.js";
import { lockActor, newId, nextNumber, postingIdentity, previousPosting } from "./common.js";
import { loadImport, lockImport } from "./import-records.js";
import { recordStockLedger } from "../ledger/service.js";
import { effectiveCondition, heldAt, lastHoldDate } from "./hold-query.js";

export function receiptValue(totalValue: string, importedQuantity: string, previousAccepted: string, previousValue: string, received: string) {
  return new Decimal(totalValue).mul(new Decimal(previousAccepted).plus(received)).div(importedQuantity).toDecimalPlaces(2).minus(previousValue).toFixed(2);
}
export async function readFifoBatches(tx: Transaction, productId: string, lock = false, date = businessDate()) {
  const held = heldAt(sql`${stockBatches.id}`, sql`${date}::date`);
  const query = tx.select({ batch: stockBatches, condition: sql<NonNullable<StockBatch["condition"]>>`${effectiveCondition(sql`${stockBatches.id}`, sql`${date}::date`)}`, heldQuantity: sql<string>`${held}::text`, eligibleQuantity: sql<string>`(${stockBatches.quantityAvailable}-${held})::text`, lastControlDate: sql<string | null>`${lastHoldDate(sql`${stockBatches.id}`)}::text`, availableFromDate: sql<string>`coalesce((select ${openingPositions.asOfDate} from ${openingPositions} where ${openingPositions.id}=${stockBatches.openingPositionId}),(select r.posted_date from erp_private.supplier_replacement_receipts r where r.id=${stockBatches.replacementReceiptId}),(select p.date from erp_private.stock_control_postings p where p.line_id=${stockBatches.correctionLineId}),${stockBatches.receivedDate})::text` }).from(stockBatches)
    .where(eq(stockBatches.productId, productId)).orderBy(stockBatches.receivedDate, stockBatches.id);
  const rows = lock ? await query.for("update") : await query;
  return rows.map(({ batch, ...availability }) => ({ ...batch, ...availability }));
}
export function fifoPreview(productId: string, quantity: string, date: string, batches: (Pick<StockBatch, "id" | "productId" | "quantityAvailable" | "batchNumber" | "lotNumber" | "receivedDate" | "expiryDate"> & Pick<StockBatch, "condition" | "availableFromDate" | "eligibleQuantity"> & { lastControlDate?: string | null })[], preferred?: string): DispatchPreview {
  const eligible = batches.filter((row) => row.productId === productId && (!row.condition || row.condition === "Saleable") && row.receivedDate <= date && (row.availableFromDate ?? row.receivedDate) <= date && (!row.lastControlDate || row.lastControlDate <= date) && row.expiryDate >= date && new Decimal(row.eligibleQuantity ?? row.quantityAvailable).gt(0))
    .sort((a, b) => a.receivedDate.localeCompare(b.receivedDate) || a.id.localeCompare(b.id));
  const available = eligible.reduce((total, row) => total.plus(row.eligibleQuantity ?? row.quantityAvailable), new Decimal(0));
  const requested = new Decimal(quantity);
  if (!requested.isFinite() || requested.lte(0)) throw new HttpError(422, "Dispatch quantity must be positive.");
  if (requested.gt(available)) throw new HttpError(409, `Only ${available.toFixed(4)} eligible units are available.`);
  const selected = preferred && preferred !== "AUTO" ? eligible.find((row) => row.id === preferred) : undefined;
  if (preferred && preferred !== "AUTO" && !selected) throw new HttpError(422, "Selected batch is unavailable, not yet received, expired or belongs to another product.");
  const ordered = selected ? [selected, ...eligible.filter((row) => row.id !== selected.id)] : eligible;
  let remaining = requested;
  const allocations: DispatchPreview["allocations"] = [];
  for (const row of ordered) {
    if (remaining.lte(0)) break;
    const take = Decimal.min(remaining, row.eligibleQuantity ?? row.quantityAvailable);
    allocations.push({ batchId: row.id, batchNumber: row.batchNumber, lotNumber: row.lotNumber, quantity: take.toFixed(4), receivedDate: row.receivedDate, expiryDate: row.expiryDate });
    remaining = remaining.minus(take);
  }
  const requiresOverride = Boolean(selected && eligible[0]?.id !== selected.id);
  return { productId, requestedQuantity: requested.toFixed(4), availableQuantity: available.toFixed(4), allocations, requiresOverride, warning: requiresOverride ? `Older matching lot ${eligible[0].lotNumber} is available. An authorized override and reason will be required when posting delivery.` : undefined };
}

async function readReceipts(tx: Transaction, importId: string, user: User, receiptId?: string): Promise<WarehouseReceipt[]> {
  const rows = await tx.select().from(warehouseReceipts).where(and(eq(warehouseReceipts.importId, importId), receiptId ? eq(warehouseReceipts.id, receiptId) : undefined)).orderBy(warehouseReceipts.createdAt);
  const result: WarehouseReceipt[] = [];
  const record = await loadImport(tx, importId);
  for (const row of rows) {
    const lines = await tx.select().from(receiptLines).where(eq(receiptLines.receiptId, row.id));
    result.push({ id: row.id, importId, reference: record.primaryReference, receivedDate: row.receivedDate, status: "Posted", receivedBy: row.receivedByName, lines: lines.map((line) => {
      const item = record.items.find((item) => item.id === line.importItemId)!;
      return { importItemId: item.id, productId: item.productId, productName: item.productName, quantityReceived: line.quantityReceived, quantityRejected: line.quantityRejected, lotNumber: line.lotNumber, batchNumber: line.batchNumber, manufacturingDate: line.manufacturingDate ?? "", expiryDate: line.expiryDate ?? "", warehouse: line.warehouse, location: line.location, landedCostPerUnit: hasCapability(user, "view_sensitive_cost") ? line.landedCostPerUnit : "0" };
    }) });
  }
  return result;
}
export function createInventoryRouter(ctx: Context) {
  const router = Router();
  router.use(createInventoryReadRouter(ctx));
  router.get("/imports/:id/receiving-readiness", async (req, res) => {
    const user = identity(res).user;
    assertAllowed(hasEffectivePermission(user, "inventory", "post"));
    const data = await ctx.db.transaction(async tx => {
      await loadImport(tx, String(req.params.id));
      const [configuration] = await tx.select({ id: ledgerConfigurations.id }).from(ledgerConfigurations).where(eq(ledgerConfigurations.state, "Approved")).limit(1);
      const strict = process.env.NODE_ENV === "production" || process.env.ERP_REQUIRE_LEDGER_CONFIGURATION === "true";
      const ready = !strict || Boolean(configuration);
      return { ready, canConfigure: user.role === "Super Admin" && hasEffectivePermission(user, "settings", "approve"), message: ready ? "Company accounting setup is approved." : "Super Admin must finish the company accounting setup in Expenses & Accounts > General Ledger > Accounting Setup. This is a company-wide prerequisite, not a setting for each warehouse receipt." };
    }, { accessMode: "read only", isolationLevel: "repeatable read" });
    res.json({ success: true, data, message: "Warehouse posting prerequisites checked" });
  });
  router.post("/imports/:id/receive", async (req, res) => {
    const input = receiptInput.parse(req.body);
    const actor = identity(res);
    const key = postingIdentity(req, `${actor.user.id}:receive:${req.params.id}`, input);
    const receiptId = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "inventory", "post");
      const row = await lockImport(tx, String(req.params.id));
      const previous = await previousPosting(tx, key);
      if (previous) return previous;
      if (row.currentSnapshotVersion === null || !["Cost Finalized", "Partially Received"].includes(row.status)) throw new HttpError(409, "Receive only a finalized import with outstanding quantities.");
      if (input.receivedDate > businessDate() || input.receivedDate < row.commercial.poDate) throw new HttpError(422, "Receipt date must be between the PO date and today.");
      const record = await loadImport(tx, row.id);
      const previousLines = await tx.select({ line: receiptLines }).from(receiptLines).innerJoin(warehouseReceipts, eq(receiptLines.receiptId, warehouseReceipts.id)).where(eq(warehouseReceipts.importId, row.id));
      const processed = new Map<string, Decimal>();
      const accepted = new Map<string, Decimal>();
      const values = new Map<string, Decimal>();
      for (const { line } of previousLines) {
        processed.set(line.importItemId, (processed.get(line.importItemId) ?? new Decimal(0)).plus(line.quantityReceived).plus(line.quantityRejected));
        accepted.set(line.importItemId, (accepted.get(line.importItemId) ?? new Decimal(0)).plus(line.quantityReceived));
        values.set(line.importItemId, (values.get(line.importItemId) ?? new Decimal(0)).plus(line.inventoryValueBdt));
      }
      const id = newId("grn");
      const ledgerMovements: Parameters<typeof recordStockLedger>[2][] = [];
      await tx.insert(warehouseReceipts).values({ id, importId: row.id, snapshotId: record.snapshot!.id, receiptNumber: await nextNumber(tx, "GRN", input.receivedDate), receivedDate: input.receivedDate, receivedBy: user.id, receivedByName: user.name });
      for (const line of input.lines) {
        const item = record.items.find((item) => item.id === line.importItemId);
        const result = record.snapshot?.products.find((item) => item.importItemId === line.importItemId);
        if (!item || !result) throw new HttpError(422, "Receipt item must belong to the finalized import snapshot.");
        const received = new Decimal(line.quantityReceived);
        const rejected = new Decimal(line.quantityRejected);
        if (received.plus(rejected).lte(0)) throw new HttpError(422, "Enter a received or rejected quantity.");
        const nextProcessed = (processed.get(item.id) ?? new Decimal(0)).plus(received).plus(rejected);
        if (nextProcessed.gt(item.quantity)) throw new HttpError(409, "Combined receipts and rejections would exceed the imported quantity.");
        if (received.gt(0) && (!line.lotNumber || !line.batchNumber || !line.manufacturingDate || !line.expiryDate || line.expiryDate <= line.manufacturingDate || line.expiryDate <= input.receivedDate || line.manufacturingDate > input.receivedDate)) throw new HttpError(422, "Accepted stock requires lot/batch, manufacturing on or before receipt, and unexpired stock with expiry after manufacturing.");
        const priorAccepted = accepted.get(item.id) ?? new Decimal(0);
        const priorValue = values.get(item.id) ?? new Decimal(0);
        const value = receiptValue(result.finalTotalBdt, item.quantity, priorAccepted.toString(), priorValue.toString(), received.toString());
        const rate = result.authoritativeUnitCostBdt ?? new Decimal(result.finalTotalBdt).div(item.quantity).toFixed(10);
        const lineId = newId("grn-line");
        await tx.insert(receiptLines).values({ ...line, manufacturingDate: line.manufacturingDate || null, expiryDate: line.expiryDate || null, id: lineId, receiptId: id, landedCostPerUnit: rate, inventoryValueBdt: value });
        if (received.gt(0)) {
          const batchId = newId("batch");
          await tx.insert(stockBatches).values({ id: batchId, productId: item.productId, receiptLineId: lineId, sourceImportId: row.id, sourceReference: record.primaryReference, lotNumber: line.lotNumber, batchNumber: line.batchNumber, manufacturingDate: line.manufacturingDate!, expiryDate: line.expiryDate!, receivedDate: input.receivedDate, quantityReceived: received.toFixed(4), quantityAvailable: received.toFixed(4), landedCostPerUnit: rate, receivedValueBdt: value, availableValueBdt: value, warehouse: line.warehouse, location: line.location });
          const movement = { id: newId("mov"), batchId, type: "Receive" as const, quantity: received.toFixed(4), valueBdt: value, date: input.receivedDate, reference: id, createdBy: user.id, createdByName: user.name };
          await tx.insert(stockMovements).values(movement); ledgerMovements.push(movement);
        }
        processed.set(item.id, nextProcessed);
        accepted.set(item.id, priorAccepted.plus(received));
        values.set(item.id, priorValue.plus(value));
      }
      const complete = record.items.every((item) => (processed.get(item.id) ?? new Decimal(0)).eq(item.quantity));
      for (const movement of ledgerMovements) await recordStockLedger(tx, user, movement);
      await tx.update(importCases).set({ status: complete ? "Received" : "Partially Received", updatedAt: new Date() }).where(eq(importCases.id, row.id));
      await tx.insert(postingKeys).values({ ...key, resourceId: id });
      await audit(tx, user.id, "Warehouse receipt posted", "Import", row.id, { receiptId: id, lines: input.lines.length });
      return id;
    });
    const [receipt] = await ctx.db.transaction((tx) => readReceipts(tx, String(req.params.id), actor.user, receiptId), { isolationLevel: "repeatable read", accessMode: "read only" });
    res.status(201).json({ success: true, data: receipt, message: "Warehouse receipt posted" });
  });
  router.get("/imports/:id/receipts", async (req, res) => {
    const user = identity(res).user;
    assertAllowed(hasEffectivePermission(user, "import") || hasEffectivePermission(user, "inventory"));
    const data = await ctx.db.transaction((tx) => readReceipts(tx, String(req.params.id), user), { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Warehouse receipt results loaded" });
  });
  for (const kind of ["stock", "batches", "movements"] as const) router.get(`/inventory/${kind}`, async (req, res) => {
    const data = await inventoryPage(ctx, identity(res).user, kind, inventoryPageInput.parse(req.query), true);
    res.json({ success: true, data: data.rows, meta: { total: data.total, limit: 500 }, message: "Bounded inventory reference list loaded" });
  });
  router.post("/inventory/dispatch-preview", async (req, res) => {
    const user = identity(res).user;
    assertAllowed(hasEffectivePermission(user, "inventory") || hasEffectivePermission(user, "sales"));
    const input = dispatchInput.parse(req.body);
    const rows = await ctx.db.transaction((tx) => readFifoBatches(tx, input.productId, false, input.date ?? businessDate()), { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data: fifoPreview(input.productId, input.quantity, input.date ?? businessDate(), rows, input.batchId), message: "FIFO preview only; no stock has been dispatched" });
  });
  return router;
}
