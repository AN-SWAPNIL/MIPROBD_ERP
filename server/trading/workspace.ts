import { Router } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { collections, customerEntries, deliveries, employees, products, salesInvoices, stockBatches, stockMovements } from "../../database/schema.js";
import { identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { buildSalesOrderWorkspace, restrictWorkspaceFinancials } from "../salesWorkspace.js";
import { readCustomers, readOrders, readQuotations } from "./records.js";
import { readCollections, readDeliveries, readInvoices } from "./posting-records.js";
import { D, money, sum } from "./money.js";
import type { CustomerLedger, StockMovement } from "../../src/domains/erp.types.js";

export function createSalesWorkspaceRouter(ctx: Context) {
  const router = Router();
  router.get("/orders/:id/workspace", async (req, res) => {
    const user = identity(res).user; assertAllowed(hasEffectivePermission(user, "sales", "view"));
    const data = await ctx.db.transaction(async (tx) => {
      const [order] = await readOrders(tx, user, String(req.params.id)); if (!order) throw new HttpError(404, "Order not found in your accessible records.");
      const quotation = order.quotationId ? (await readQuotations(tx, user, order.quotationId))[0] : undefined;
      const customer = hasEffectivePermission(user, "customers", "view") ? (await readCustomers(tx, user, order.customerId))[0] : undefined;
      const [owner] = await tx.select().from(employees).where(eq(employees.id, order.ownerId));
      const delivered = await readDeliveries(tx, user, { orderId: order.id });
      const invoices = await readInvoices(tx, user, { orderId: order.id }); const collections = await readCollections(tx, user, { orderId: order.id });
      let movements: StockMovement[] = [];
      if (hasEffectivePermission(user, "inventory", "view") && delivered.length) {
        const rows = await tx.select({ movement: stockMovements, batch: stockBatches, product: products }).from(stockMovements).innerJoin(stockBatches, eq(stockMovements.batchId, stockBatches.id)).innerJoin(products, eq(stockBatches.productId, products.id)).where(and(eq(stockMovements.type, "Dispatch"), inArray(stockMovements.reference, delivered.map((delivery) => delivery.challanNumber))));
        movements = rows.map(({ movement, batch, product }) => ({ id: movement.id, date: movement.date, productId: product.id, productName: product.name, batchId: batch.id, batchNumber: batch.batchNumber, type: movement.type, quantity: movement.quantity, reference: movement.reference, createdBy: movement.createdByName }));
      }
      const workspace = buildSalesOrderWorkspace({ order, quotation, customer, salesperson: owner ? { id: owner.id, name: owner.name, title: owner.title, employeeCode: owner.employeeCode, territory: owner.territory } : undefined, deliveries: delivered, invoices, collections, stockMovements: movements });
      const returned=(await tx.execute<{productId:string;returned:string;refused:string}>(sql`select dl.product_id "productId",coalesce(sum(l.quantity) filter(where r.kind='Invoiced Return'),0)::text returned,coalesce(sum(l.quantity) filter(where r.kind='Uninvoiced Refusal'),0)::text refused from erp_private.customer_return_lines l join erp_private.customer_returns r on r.id=l.return_id join erp_private.delivery_lines dl on dl.id=l.delivery_line_id where r.order_id=${order.id} and r.state='Posted' group by dl.product_id`)).rows;
      for(const f of workspace.fulfilment){const value=returned.find((r)=>r.productId===f.productId);f.returnedQty=value?.returned??"0";f.refusedQty=value?.refused??"0";f.deliveredNotInvoicedQty=D.max(0,new D(f.deliveredQty).minus(f.refusedQty).minus(f.approvedInvoicedQty)).toFixed(4);}
      if(!invoices.some((i)=>i.status==="Draft")&&invoices.some((i)=>i.status==="Approved")&&workspace.fulfilment.every((f)=>new D(f.deliveredNotInvoicedQty).isZero()))workspace.stages.invoice="Complete";
      workspace.invoiceableDeliveryIds=(await tx.execute<{id:string}>(sql`select d.id from erp_private.deliveries d where d.order_id=${order.id} and not exists(select 1 from erp_private.invoice_deliveries x where x.delivery_id=d.id and x.active) and exists(select 1 from erp_private.delivery_lines dl where dl.delivery_id=d.id and dl.quantity>coalesce((select sum(l.quantity) from erp_private.customer_return_lines l join erp_private.customer_returns r on r.id=l.return_id where l.delivery_line_id=dl.id and r.state='Posted' and r.kind='Uninvoiced Refusal'),0))`)).rows.map((r)=>r.id);
      if(workspace.totals){workspace.totals.outstandingValue=D.max(0,order.due).toFixed(2);workspace.totals.collectedValue=order.amountReceived;const adjusted=await tx.select({id:customerEntries.id}).from(customerEntries).where(and(eq(customerEntries.orderId,order.id),inArray(customerEntries.type,["Return Credit","Return Refund","Credit Transfer In","Credit Transfer Out"]))).limit(1);if(adjusted.length)workspace.stages.collection=new D(order.due).lte(0)?"Settled":new D(order.amountReceived).gt(0)?"Partial":"Unpaid";}
      if(delivered.length&&!invoices.some((i)=>i.status!=="Cancelled")&&workspace.fulfilment.every((f)=>new D(f.deliveredQty).eq(f.refusedQty??"0"))){workspace.stages.invoice="Not Required";workspace.stages.collection="Not Required";}
      return user.role === "Warehouse Manager" ? restrictWorkspaceFinancials(workspace) : workspace;
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Order lifecycle derived from persistent postings" });
  });
  router.get("/customers/:id/ledger", async (req, res) => {
    const user = identity(res).user; assertAllowed(hasEffectivePermission(user, "customers", "view") && user.role !== "Warehouse Manager");
    const data = await ctx.db.transaction(async (tx): Promise<CustomerLedger> => {
      const [customer] = await readCustomers(tx, user, String(req.params.id)); if (!customer) throw new HttpError(404, "Customer not found in your assigned records.");
      // A customer ledger includes the assigned customer's history; order registers remain owner-scoped.
      const delivered = await readDeliveries(tx, user, { customerId: customer.id }); const invoices = await readInvoices(tx, user, { customerId: customer.id });
      const collections = await readCollections(tx, user, { customerId: customer.id });
      const rows = await tx.select().from(customerEntries).where(eq(customerEntries.customerId, customer.id)).orderBy(customerEntries.date, customerEntries.createdAt, customerEntries.id);
      let balance = new D(0);
      const entries = rows.map((row) => { balance = balance.plus(row.debit).minus(row.credit); return { id: row.id, date: row.date, type: row.type, reference: row.reference, debit: row.debit, credit: row.credit, runningDue: money(balance), remarks: row.remarks }; });
      return { customer, deliveredSales: money(sum(delivered.flatMap((delivery) => delivery.lines.map((line) => line.lineTotal)))), invoicedSales: customer.totalSales, collected: customer.totalCollected, currentDue: customer.currentDue, entries, deliveries: delivered, invoices, collections };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Customer journal loaded" });
  });
  router.get("/sales/references/:type/:id", async (req, res) => {
    const user = identity(res).user; assertAllowed(hasEffectivePermission(user, "sales", "view")); const id = String(req.params.id);
    const data = await ctx.db.transaction(async (tx) => {
      let orderId: string | null | undefined;
      if (req.params.type === "SalesOrder") orderId = id;
      else if (["Delivery", "Challan"].includes(String(req.params.type))) orderId = (await tx.select().from(deliveries).where(req.params.type === "Delivery" ? eq(deliveries.id, id) : eq(deliveries.challanNumber, id)))[0]?.orderId;
      else if (req.params.type === "SalesInvoice") orderId = (await tx.select().from(salesInvoices).where(eq(salesInvoices.id, id)))[0]?.orderId;
      else if (req.params.type === "Collection") orderId = (await tx.select().from(collections).where(eq(collections.id, id)))[0]?.orderId;
      if (!orderId) return null;
      const [order] = await readOrders(tx, user, orderId); if (!order) throw new HttpError(404, "Linked order is not accessible."); return { id: order.id };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Linked order resolved" });
  });
  return router;
}
