import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { Decimal } from "decimal.js";
import { products, purchaseLines, purchaseReceipts, stockBatches, stockMovements, postingKeys, suppliers, supplierSettlements } from "../../database/schema.js";
import { purchaseInput, purchaseValuation } from "../../src/domains/inventory/purchaseContracts.js";
import { hasCapability, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { audit, identity, type Context } from "../foundation/context.js";
import { HttpError, assertAllowed } from "../foundation/errors.js";
import { lockActor, newId, nextNumber, postingIdentity } from "./common.js";
import { lockPosting, checkPostingDate } from "../trading/locks.js";
import { recordLedgerEvent, recordStockLedger, twoSidedPlan } from "../ledger/service.js";
const Money = Decimal.clone({ precision: 48, rounding: Decimal.ROUND_HALF_UP });

export function createPurchaseRouter(ctx: Context) {
  const router = Router();
  router.get("/inventory/purchases", async (_req, res) => {
    const actor = identity(res).user; assertAllowed(hasEffectivePermission(actor, "inventory"));
    const cost = hasCapability(actor, "view_sensitive_cost");
    const rows = (await ctx.db.execute(sql`select r.id,r.number,r.supplier_id "supplierId",r.supplier_name "supplierName",r.reference,r.received_date::text "receivedDate",r.currency,${cost ? sql`r.total_bdt::text` : sql`null`} "totalBdt",(select count(*)::int from erp_private.purchase_lines l where l.receipt_id=r.id) "lineCount",r.created_by_name "createdByName" from erp_private.purchase_receipts r order by r.received_date desc,r.id desc limit 100`)).rows;
    res.json({ success: true, data: rows.map(({ totalBdt, ...row }) => ({ ...row, ...(totalBdt === null ? {} : { totalBdt }) })), message: "Latest 100 purchase receipts loaded" });
  });
  router.post("/inventory/purchases", async (req, res) => {
    const input = purchaseInput.parse(req.body); const actor = identity(res); const key = postingIdentity(req, `${actor.user.id}:inventory-purchase`, input);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "inventory", "post", "edit_sensitive_cost");
      const previous = await lockPosting(tx, key); if (previous) return previous;
      checkPostingDate(input.receivedDate);
      const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).for("update");
      if (!supplier?.active) throw new HttpError(422, "Supplier: select an active supplier.");
      const [obligation] = (await tx.execute<{ id: string }>(sql`select id from erp_private.supplier_settlements where supplier_id=${supplier.id} and entry_type='Obligation' and status='Posted' and lower(btrim(reference))=lower(btrim(${input.reference})) limit 1`)).rows;
      if (obligation) throw new HttpError(409, "Supplier invoice / reference already has a posted obligation. Reconcile that existing entry in Accounts before receiving it as a new purchase; do not double the supplier due.");
      const values = input.lines.map((line, i) => { try { return purchaseValuation(line, input.currency, input.exchangeRate); } catch (error) { throw new HttpError(422, `Line ${i + 1}: ${error instanceof Error ? error.message : "Invalid purchase value."}`); } });
      const aggregate = values.reduce((sum, line) => sum.plus(line.totalBdt), new Money(0));
      if (aggregate.gte("1e22")) throw new HttpError(422, "Purchase receipt total exceeds supported precision. Check quantities, unit prices and exchange rate.");
      const total = aggregate.toFixed(2);
      const id = newId("purchase"); const number = await nextNumber(tx, "PR", input.receivedDate);
      await tx.insert(purchaseReceipts).values({ id, number, supplierId: supplier.id, supplierName: supplier.name, reference: input.reference, receivedDate: input.receivedDate, currency: input.currency, exchangeRate: input.currency === "BDT" ? "1" : input.exchangeRate, totalBdt: total, notes: input.notes, createdBy: user.id, createdByName: user.name });
      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i]; const value = values[i];
        const [product] = await tx.select().from(products).where(eq(products.id, line.productId)).for("share");
        if (!product?.active) throw new HttpError(422, `Line ${i + 1}, product: select an active product.`);
        const lineId = newId("purchase-line"); const batchId = newId("batch");
        await tx.insert(purchaseLines).values({ id: lineId, receiptId: id, productId: product.id, quantity: line.quantity, unitPrice: line.unitPrice, valueBdt: value.totalBdt });
        await tx.insert(stockBatches).values({ id: batchId, purchaseLineId: lineId, productId: product.id, sourceReference: number, lotNumber: line.lotNumber, batchNumber: line.batchNumber, manufacturingDate: line.manufacturingDate, expiryDate: line.expiryDate, receivedDate: input.receivedDate, quantityReceived: line.quantity, quantityAvailable: line.quantity, landedCostPerUnit: value.unitCostBdt, receivedValueBdt: value.totalBdt, availableValueBdt: value.totalBdt, warehouse: "Main Warehouse", location: line.location });
        const movement = { id: newId("mov"), batchId, type: "Receive" as const, quantity: line.quantity, valueBdt: value.totalBdt, date: input.receivedDate, reference: number, createdBy: user.id, createdByName: user.name };
        await tx.insert(stockMovements).values(movement); await recordStockLedger(tx, user, movement);
      }
      const obligationId = newId("settlement");
      await tx.insert(supplierSettlements).values({ id: obligationId, purchaseReceiptId: id, supplierId: supplier.id, supplierName: supplier.name, date: input.receivedDate, reference: number, entryType: "Obligation", amount: total, notes: input.reference, createdByUserId: user.id, createdByName: user.name });
      await recordLedgerEvent(tx, user, { sourceKey: `obligation:${obligationId}`, date: input.receivedDate, reference: number, description: "Supplier obligation for purchase receipt", plan: twoSidedPlan("Inventory Clearing", "Payables", total) });
      await tx.insert(postingKeys).values({ ...key, resourceId: id });
      await audit(tx, user.id, "Purchase receipt posted", "PurchaseReceipt", id, { number, supplierId: supplier.id, lines: input.lines.length, totalBdt: total });
      return id;
    });
    res.status(201).json({ success: true, data: { id }, message: "Purchase received; stock and supplier payable posted atomically" });
  });
  return router;
}
