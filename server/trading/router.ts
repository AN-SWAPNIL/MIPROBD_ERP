import { Router, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { customers, orderLines, postingKeys, quotationLines, quotations, salesOrders } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import { audit, identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { lockActor, newId, nextNumber, postingIdentity } from "../operations/common.js";
import { businessDate } from "../../src/lib/date.js";
import { convertInput, customerInput, orderUpdate, quotationInput, quotationUpdate, salesTotals, versionInput } from "./contracts.js";
import { activeSalesOwner, assertSalesOwner, canonicalSalesLines, checkVersion, customerSnapshot, lockCustomer, readCustomers, readOrders, readQuotations } from "./records.js";
import { lockPosting } from "./locks.js";
import { restrictOrderFinancials } from "../salesWorkspace.js";

async function lockQuotation(tx: Transaction, id: string, actor: ReturnType<typeof identity>["user"]) {
  assertAllowed(actor.role !== "Warehouse Manager", "Warehouse access does not include commercial pricing.");
  const [row] = await tx.select().from(quotations).where(and(eq(quotations.id, id), eq(quotations.archived, false))).for("update");
  if (!row) throw new HttpError(404, "Quotation not found.");
  assertSalesOwner(actor, row.ownerId);
  return row;
}
const pathId = (req: Request) => String(req.params.id);

export function createTradingRouter(ctx: Context) {
  const router = Router();
  router.get("/customers", async (_req, res) => {
    const user = identity(res).user; assertAllowed(hasEffectivePermission(user, "customers", "view"));
    const rows = await ctx.db.transaction(async (tx) => (await readCustomers(tx, user)).map((customer) => user.role === "Warehouse Manager" ? { ...customer, currentDue: "Restricted", totalSales: "Restricted", totalCollected: "Restricted", creditLimit: "Restricted" } : customer), { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data: rows, message: "Customers loaded" });
  });
  router.post("/customers", async (req, res) => {
    const input = customerInput.parse(req.body); const actor = identity(res);
    const key = postingIdentity(req, `${actor.user.id}:customer-create`, input);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "customers", "create");
      const previous = await lockPosting(tx, key); if (previous) return previous;
      const ownerId = user.role === "Sales Executive" ? user.id : input.assignedSalesUserId || null;
      if (ownerId) await activeSalesOwner(tx, ownerId);
      const id = newId("customer");
      await tx.insert(customers).values({ ...input, id, assignedSalesUserId: ownerId, createdBy: user.id });
      await tx.insert(postingKeys).values({ ...key, resourceId: id });
      await audit(tx, user.id, "Customer created", "Customer", id);
      return id;
    });
    res.status(201).json({ success: true, data: (await ctx.db.transaction((tx) => readCustomers(tx, actor.user, id)))[0], message: "Customer created" });
  });
  router.patch("/customers/:id", async (req, res) => {
    const actor = identity(res); const version = versionInput.parse(req.body.version);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "customers", "edit"); const row = await lockCustomer(tx, pathId(req), user);
      checkVersion(row.version, version);
      const input = customerInput.parse({ ...row, assignedSalesUserId: row.assignedSalesUserId ?? undefined, ...req.body });
      const ownerId = user.role === "Sales Executive" ? row.assignedSalesUserId : input.assignedSalesUserId || null;
      if (ownerId) await activeSalesOwner(tx, ownerId);
      await tx.update(customers).set({ ...input, assignedSalesUserId: ownerId, version: row.version + 1, updatedAt: new Date() }).where(eq(customers.id, row.id));
      await audit(tx, user.id, "Customer updated", "Customer", row.id);
    });
    res.json({ success: true, data: (await ctx.db.transaction((tx) => readCustomers(tx, actor.user, pathId(req))))[0], message: "Customer updated" });
  });
  router.delete("/customers/:id", async (req, res) => {
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, identity(res), "customers", "delete"); const row = await lockCustomer(tx, pathId(req), user);
      await tx.update(customers).set({ active: false, version: row.version + 1, updatedAt: new Date() }).where(eq(customers.id, row.id));
      await audit(tx, user.id, "Customer deactivated", "Customer", row.id);
    });
    res.json({ success: true, data: { id: pathId(req) }, message: "Customer deactivated; history preserved" });
  });

  router.get("/quotations", async (_req, res) => {
    const user = identity(res).user; assertAllowed(hasEffectivePermission(user, "sales", "view") && user.role !== "Warehouse Manager");
    res.json({ success: true, data: await ctx.db.transaction((tx) => readQuotations(tx, user)), message: "Quotations loaded" });
  });
  router.post("/quotations", async (req, res) => {
    const input = quotationInput.parse(req.body); const actor = identity(res); const key = postingIdentity(req, `${actor.user.id}:quotation-create`, input);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "sales", "create"); assertAllowed(user.role !== "Warehouse Manager" && hasEffectivePermission(user, "customers", "view"));
      const previous = await lockPosting(tx, key); if (previous) return previous;
      const customer = await lockCustomer(tx, input.customerId, user); if (!customer.active) throw new HttpError(422, "Select an active customer.");
      const ownerId = user.role === "Sales Executive" ? user.id : input.ownerId || customer.assignedSalesUserId || user.id;
      await activeSalesOwner(tx, ownerId);
      const lines = await canonicalSalesLines(tx, input.lines); let totals;
      try { totals = salesTotals(lines); } catch (error) { throw new HttpError(422, (error as Error).message); }
      const id = newId("quote"); const number = await nextNumber(tx, "QT", input.date);
      await tx.insert(quotations).values({ id, quotationNumber: number, date: input.date, customerId: customer.id, ownerId, snapshot: customerSnapshot(customer), validityDays: input.validityDays, paymentTerms: input.paymentTerms, remarks: input.remarks, ...totals, createdByUserId: user.id });
      await tx.insert(quotationLines).values(lines.map((line, position) => ({ ...line, quotationId: id, position })));
      await tx.insert(postingKeys).values({ ...key, resourceId: id }); await audit(tx, user.id, "Quotation created", "Quotation", id, { quotationNumber: number }); return id;
    });
    res.status(201).json({ success: true, data: (await ctx.db.transaction((tx) => readQuotations(tx, actor.user, id)))[0], message: "Draft quotation created" });
  });
  router.patch("/quotations/:id", async (req, res) => {
    const input = quotationUpdate.parse(req.body); const actor = identity(res);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "sales", "edit"); assertAllowed(hasEffectivePermission(user, "customers", "view"));
      const row = await lockQuotation(tx, pathId(req), user); checkVersion(row.version, input.version);
      if (["Converted", "Rejected"].includes(row.status)) throw new HttpError(423, "Finalized quotation is locked.");
      if (input.ownerId && input.ownerId !== row.ownerId) throw new HttpError(422, "Quotation ownership cannot be changed through this action.");
      const customer = await lockCustomer(tx, input.customerId ?? row.customerId, user); if (!customer.active) throw new HttpError(422, "Select an active customer.");
      const lines = input.lines ? await canonicalSalesLines(tx, input.lines) : undefined; let totals = {};
      if (lines) { try { totals = salesTotals(lines); } catch (error) { throw new HttpError(422, (error as Error).message); } }
      const status = input.status ?? row.status;
      await tx.update(quotations).set({ date: input.date ?? row.date, customerId: customer.id, snapshot: customerSnapshot(customer), validityDays: input.validityDays ?? row.validityDays, paymentTerms: input.paymentTerms ?? row.paymentTerms, remarks: input.remarks ?? row.remarks, status, submittedAt: row.submittedAt ?? (status !== "Draft" ? new Date() : null), version: row.version + 1, updatedAt: new Date(), ...totals }).where(eq(quotations.id, row.id));
      if (lines) { await tx.delete(quotationLines).where(eq(quotationLines.quotationId, row.id)); await tx.insert(quotationLines).values(lines.map((line, position) => ({ ...line, quotationId: row.id, position }))); }
      await audit(tx, user.id, "Quotation updated", "Quotation", row.id);
    });
    res.json({ success: true, data: (await ctx.db.transaction((tx) => readQuotations(tx, actor.user, pathId(req))))[0], message: "Quotation updated" });
  });
  router.delete("/quotations/:id", async (req, res) => {
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, identity(res), "sales", "delete"); const row = await lockQuotation(tx, pathId(req), user);
      if (!["Draft", "Rejected"].includes(row.status)) throw new HttpError(409, "Only draft or rejected quotations can be archived.");
      await tx.update(quotations).set({ archived: true, version: row.version + 1, updatedAt: new Date() }).where(eq(quotations.id, row.id));
      await audit(tx, user.id, "Quotation archived", "Quotation", row.id);
    });
    res.json({ success: true, data: { id: pathId(req) }, message: "Quotation archived; history preserved" });
  });
  router.post("/quotations/:id/convert", async (req, res) => {
    const actor = identity(res); const input = convertInput.parse(req.body); const key = postingIdentity(req, `${actor.user.id}:convert:${pathId(req)}`, input);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "sales", "post"); const previous = await lockPosting(tx, key); if (previous) return previous;
      const row = await lockQuotation(tx, pathId(req), user); checkVersion(row.version, input.version);
      if (["Converted", "Rejected"].includes(row.status)) throw new HttpError(409, "Only an open quotation can become an order.");
      const customer = await lockCustomer(tx, row.customerId, user); if (!customer.active) throw new HttpError(422, "The customer is inactive.");
      const lines = await tx.select().from(quotationLines).where(eq(quotationLines.quotationId, row.id)).orderBy(quotationLines.position);
      const date = businessDate(); const id = newId("order"); const number = await nextNumber(tx, "SO", date); const { version: _version, ...instructions } = input; void _version;
      await tx.insert(salesOrders).values({ id, orderNumber: number, quotationId: row.id, date, customerId: row.customerId, ownerId: row.ownerId, snapshot: row.snapshot, instructions: { ...instructions, paymentConditions: input.paymentConditions ?? row.paymentTerms, deliveryInstruction: input.deliveryInstruction ?? "" }, total: row.total, createdByUserId: user.id });
      await tx.insert(orderLines).values(lines.map(({ quotationId: _parent, ...line }) => { void _parent; return { ...line, id: newId("order-line"), orderId: id }; }));
      await tx.update(quotations).set({ status: "Converted", submittedAt: row.submittedAt ?? new Date(), version: row.version + 1, updatedAt: new Date() }).where(eq(quotations.id, row.id));
      await tx.insert(postingKeys).values({ ...key, resourceId: id }); await audit(tx, user.id, "Quotation converted", "SalesOrder", id, { quotationId: row.id, orderNumber: number }); return id;
    });
    res.status(201).json({ success: true, data: (await ctx.db.transaction((tx) => readOrders(tx, actor.user, id)))[0], message: "Quotation converted to order" });
  });
  router.get("/orders", async (_req, res) => {
    const user = identity(res).user; assertAllowed(hasEffectivePermission(user, "sales", "view"));
    const rows = await ctx.db.transaction((tx) => readOrders(tx, user));
    res.json({ success: true, data: user.role === "Warehouse Manager" ? rows.map(restrictOrderFinancials) : rows, message: "Orders loaded" });
  });
  router.patch("/orders/:id", async (req, res) => {
    const input = orderUpdate.parse(req.body); const actor = identity(res);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "sales", "edit"); assertAllowed(user.role !== "Warehouse Manager");
      const [row] = await tx.select().from(salesOrders).where(eq(salesOrders.id, pathId(req))).for("update");
      if (!row) throw new HttpError(404, "Order not found."); assertSalesOwner(user, row.ownerId); checkVersion(row.version, input.version);
      if (row.status === "Cancelled") throw new HttpError(423, "Cancelled orders are locked.");
      const { version: _version, ...instructions } = input; void _version;
      await tx.update(salesOrders).set({ instructions: { ...row.instructions, ...instructions }, version: row.version + 1, updatedAt: new Date() }).where(eq(salesOrders.id, row.id));
      await audit(tx, user.id, "Order instructions updated", "SalesOrder", row.id);
    });
    res.json({ success: true, data: (await ctx.db.transaction((tx) => readOrders(tx, actor.user, pathId(req))))[0], message: "Order details updated" });
  });
  return router;
}
