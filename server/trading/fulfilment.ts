import { Router } from "express";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { deliveries, deliveryLines, orderLines, postingKeys, products, salesOrders, stockBatches, stockMovements } from "../../database/schema.js";
import type { Context } from "../foundation/context.js";
import { audit, identity } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { hasCapability, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { lockActor, newId, nextNumber, postingIdentity } from "../operations/common.js";
import { fifoPreview, readFifoBatches } from "../operations/inventory.js";
import { deliveryInput, quotationInput, salesTotals } from "./contracts.js";
import { checkPostingDate, lockOrder, lockPosting } from "./locks.js";
import { readDeliveries } from "./posting-records.js";
import { canonicalSalesLines } from "./records.js";
import { cumulativeShare, D, money, sum } from "./money.js";
import type { ProfitPreview } from "../../src/domains/erp.types.js";
import { businessDate } from "../../src/lib/date.js";
import { restrictDeliveryFinancials } from "../salesWorkspace.js";
import { recordStockLedger } from "../ledger/service.js";

export function createFulfilmentRouter(ctx: Context) {
  const router = Router();
  router.get("/deliveries", async (_req, res) => {
    const user = identity(res).user; assertAllowed(hasEffectivePermission(user, "sales", "view"));
    const rows = await ctx.db.transaction((tx) => readDeliveries(tx, user));
    const data = user.role === "Warehouse Manager" ? rows.map(restrictDeliveryFinancials) : rows;
    res.json({ success: true, data, message: "Delivery challans loaded" });
  });
  router.post("/deliveries", async (req, res) => {
    const actor = identity(res); const input = deliveryInput.parse(req.body); const key = postingIdentity(req, `${actor.user.id}:delivery`, input);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "sales", "post"); assertAllowed(hasEffectivePermission(user, "inventory", "view"));
      const previous = await lockPosting(tx, key); if (previous) return previous;
      const { order, customer } = await lockOrder(tx, input.orderId, user);
      if (!customer.active || order.status === "Cancelled") throw new HttpError(409, "Inactive customers or cancelled orders cannot be dispatched.");
      checkPostingDate(input.date, order.date);
      const orderedLines = await tx.select().from(orderLines).where(eq(orderLines.orderId, order.id)).orderBy(orderLines.position);
      const posted = await tx.select().from(deliveryLines).where(inArray(deliveryLines.orderLineId, orderedLines.map((line) => line.id)));
      // Lock product keys in stable order. Receipt FK inserts cannot introduce a batch during this allocation.
      for (const productId of input.lines.map((line) => line.productId).sort()) {
        const [product] = await tx.select().from(products).where(eq(products.id, productId)).for("update");
        if (!product) throw new HttpError(422, "Product not found.");
      }
      const id = newId("delivery");
      const plans: Array<typeof deliveryLines.$inferInsert> = [];
      const movements: Array<typeof stockMovements.$inferInsert> = [];
      let override = false;
      for (const request of [...input.lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
        const source = orderedLines.find((line) => line.productId === request.productId);
        if (!source) throw new HttpError(422, "A requested product is not on this order.");
        let issued = sum(posted.filter((line) => line.orderLineId === source.id).map((line) => line.quantity));
        let revenue = sum(posted.filter((line) => line.orderLineId === source.id).map((line) => line.lineTotal));
        let discounts = sum(posted.filter((line) => line.orderLineId === source.id).map((line) => line.discount));
        if (issued.plus(request.quantity).gt(source.quantity)) throw new HttpError(409, "Delivery exceeds the remaining ordered quantity.");
        const batches = await readFifoBatches(tx, source.productId, true, input.date);
        const plan = fifoPreview(source.productId, request.quantity, input.date, batches, request.batchId);
        if (plan.requiresOverride) {
          assertAllowed(hasCapability(user, "approve_stock_override"), "This role cannot override FIFO.");
          if (input.overrideReason.trim().length < 5) throw new HttpError(422, "Enter a clear reason to override FIFO.");
          override = true;
        }
        for (const allocation of plan.allocations) {
          const batch = batches.find((batch) => batch.id === allocation.batchId)!;
          const [latest] = await tx.select({ date: sql<string>`max(${stockMovements.date})` }).from(stockMovements).where(eq(stockMovements.batchId, batch.id));
          if (latest.date) checkPostingDate(input.date, latest.date);
          const lineTotal = cumulativeShare(source.lineTotal, source.quantity, issued.toString(), revenue.toString(), allocation.quantity);
          const discount = cumulativeShare(source.discount, source.quantity, issued.toString(), discounts.toString(), allocation.quantity);
          const cost = cumulativeShare(batch.receivedValueBdt, batch.quantityReceived, new D(batch.quantityReceived).minus(batch.quantityAvailable).toString(), new D(batch.receivedValueBdt).minus(batch.availableValueBdt).toString(), allocation.quantity);
          const remaining = new D(batch.quantityAvailable).minus(allocation.quantity).toFixed(4);
          const remainingValue = new D(batch.availableValueBdt).minus(cost).toFixed(2);
          const [updated] = await tx.update(stockBatches).set({ quantityAvailable: remaining, availableValueBdt: remainingValue }).where(and(eq(stockBatches.id, batch.id), gte(stockBatches.quantityAvailable, allocation.quantity))).returning({ id: stockBatches.id });
          if (!updated) throw new HttpError(409, "Stock changed during dispatch. Reload the FIFO selection.");
          const movementId = newId("movement");
          movements.push({ id: movementId, batchId: batch.id, type: "Dispatch", quantity: allocation.quantity, valueBdt: cost, date: input.date, reference: "", createdBy: user.id, createdByName: user.name });
          plans.push({ id: newId("delivery-line"), position: plans.length, deliveryId: id, orderLineId: source.id, productId: source.productId, productCode: source.productCode, productName: source.productName, quantity: allocation.quantity, unitPrice: source.unitPrice, discount, lineTotal, batchId: batch.id, batchNumber: batch.batchNumber, stockMovementId: movementId, costBdt: cost });
          issued = issued.plus(allocation.quantity); revenue = revenue.plus(lineTotal); discounts = discounts.plus(discount);
        }
      }
      const number = await nextNumber(tx, "DC", input.date);
      await tx.insert(deliveries).values({ id, challanNumber: number, orderId: order.id, customerId: order.customerId, customerName: order.snapshot.customerName, ownerId: order.ownerId, date: input.date, remarks: input.remarks, receiverName: input.receiverName, overrideReason: override ? input.overrideReason : "", dispatchedBy: user.id });
      await tx.insert(stockMovements).values(movements.map((movement) => ({ ...movement, reference: number })));
      for (const movement of movements) await recordStockLedger(tx, user, { ...movement, reference: number });
      await tx.insert(deliveryLines).values(plans);
      const complete = orderedLines.every((line) => sum([...posted, ...plans].filter((posted) => posted.orderLineId === line.id).map((posted) => posted.quantity)).eq(line.quantity));
      await tx.update(salesOrders).set({ status: complete ? "Delivered" : "Partially Delivered", version: order.version + 1, updatedAt: new Date() }).where(eq(salesOrders.id, order.id));
      await tx.insert(postingKeys).values({ ...key, resourceId: id });
      await audit(tx, user.id, "Delivery dispatched", "Delivery", id, { challanNumber: number, orderId: order.id, costBdt: money(sum(plans.map((line) => line.costBdt))), ...(override ? { reason: input.overrideReason, fifoOverride: true } : {}) });
      return id;
    });
    const [posted] = await ctx.db.transaction((tx) => readDeliveries(tx, actor.user, { id }));
    res.status(201).json({ success: true, data: actor.user.role === "Warehouse Manager" ? restrictDeliveryFinancials(posted) : posted, message: "Delivery posted with stock movements" });
  });
  router.post("/sales/profit-preview", async (req, res) => {
    const user = identity(res).user; assertAllowed(hasEffectivePermission(user, "sales", "view") && hasCapability(user, "view_profit"));
    const inputs = quotationInput.shape.lines.parse(req.body.lines);
    const data = await ctx.db.transaction(async (tx): Promise<ProfitPreview> => {
      const lines = await canonicalSalesLines(tx, inputs); const result: ProfitPreview["lines"] = []; let expectedCogs = new D(0);
      for (const line of lines) {
        const batches = await readFifoBatches(tx, line.productId);
        const plan = fifoPreview(line.productId, line.quantity, businessDate(), batches);
        const cost = sum(plan.allocations.map((allocation) => { const batch = batches.find((row) => row.id === allocation.batchId)!; return cumulativeShare(batch.receivedValueBdt, batch.quantityReceived, new D(batch.quantityReceived).minus(batch.quantityAvailable).toString(), new D(batch.receivedValueBdt).minus(batch.availableValueBdt).toString(), allocation.quantity); }));
        const profit = new D(line.lineTotal).minus(cost); expectedCogs = expectedCogs.plus(cost);
        result.push({ productId: line.productId, productCode: line.productCode, productName: line.productName, quantity: line.quantity, proposedUnitPrice: line.unitPrice, effectiveUnitPrice: money(new D(line.lineTotal).div(line.quantity)), expectedCostPerUnit: money(cost.div(line.quantity)), grossProfitPerUnit: money(profit.div(line.quantity)), grossProfitTotal: money(profit), marginPercent: new D(line.lineTotal).isZero() ? "0.00" : profit.div(line.lineTotal).mul(100).toFixed(2), stockCoverage: line.quantity, isLoss: profit.lt(0) });
      }
      const revenue = new D(salesTotals(lines).total); const profit = revenue.minus(expectedCogs);
      return { lines: result, revenue: money(revenue), expectedCogs: money(expectedCogs), grossProfit: money(profit), marginPercent: revenue.isZero() ? "0.00" : profit.div(revenue).mul(100).toFixed(2) };
    }, { isolationLevel: "repeatable read" });
    res.json({ success: true, data, message: "Non-binding FIFO profit preview" });
  });
  return router;
}
