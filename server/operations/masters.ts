import { Router } from "express";
import { eq } from "drizzle-orm";
import { products, suppliers } from "../../database/schema.js";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { audit, identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { lockActor, newId } from "./common.js";
import { productInput, supplierInput } from "./contracts.js";

export function createMasterRouter(ctx: Context) {
  const router = Router();
  router.get(["/products", "/settings/products"], async (_req, res) => {
    const user = identity(res).user;
    assertAllowed(["products", "import", "inventory", "sales"].some((area) => hasEffectivePermission(user, area as "products" | "import" | "inventory" | "sales", "view")));
    const rows = await ctx.db.select().from(products).orderBy(products.code);
    res.json({ success: true, data: rows, message: "Product master loaded" });
  });
  router.get(["/suppliers", "/settings/suppliers"], async (_req, res) => {
    const user = identity(res).user;
    assertAllowed(hasEffectivePermission(user, "suppliers") || hasEffectivePermission(user, "import"));
    res.json({ success: true, data: await ctx.db.select().from(suppliers).orderBy(suppliers.name), message: "Supplier master loaded" });
  });
  router.post(["/products", "/settings/products"], async (req, res) => {
    const input = productInput.parse(req.body);
    const row = await ctx.db.transaction(async (tx) => {
      const actor = await lockActor(tx, identity(res), "products", "create");
      const [row] = await tx.insert(products).values({ ...input, id: newId("prd") }).returning();
      await audit(tx, actor.id, "Product created", "Product", row.id, { code: row.code });
      return row;
    });
    res.status(201).json({ success: true, data: row, message: "Product created" });
  });
  router.patch(["/products/:id", "/settings/products/:id"], async (req, res) => {
    const row = await ctx.db.transaction(async (tx) => {
      const actor = await lockActor(tx, identity(res), "products", "edit");
      const [existing] = await tx.select().from(products).where(eq(products.id, String(req.params.id))).for("update");
      if (!existing) throw new HttpError(404, "Product not found.");
      const input = productInput.parse({ ...existing, ...req.body });
      const [row] = await tx.update(products).set(input).where(eq(products.id, existing.id)).returning();
      await audit(tx, actor.id, "Product updated", "Product", row.id);
      return row;
    });
    res.json({ success: true, data: row, message: "Product updated" });
  });
  router.delete(["/products/:id", "/settings/products/:id"], async (req, res) => {
    await ctx.db.transaction(async (tx) => {
      const actor = await lockActor(tx, identity(res), "products", "delete");
      const [row] = await tx.update(products).set({ active: false }).where(eq(products.id, String(req.params.id))).returning();
      if (!row) throw new HttpError(404, "Product not found.");
      await audit(tx, actor.id, "Product deactivated", "Product", row.id);
    });
    res.json({ success: true, data: { id: req.params.id }, message: "Product deactivated; history preserved" });
  });
  router.post(["/suppliers", "/settings/suppliers"], async (req, res) => {
    const input = supplierInput.parse(req.body);
    const row = await ctx.db.transaction(async (tx) => {
      const actor = await lockActor(tx, identity(res), "suppliers", "create");
      const [row] = await tx.insert(suppliers).values({ ...input, id: newId("sup") }).returning();
      await audit(tx, actor.id, "Supplier created", "Supplier", row.id);
      return row;
    });
    res.status(201).json({ success: true, data: row, message: "Supplier created" });
  });
  router.patch(["/suppliers/:id", "/settings/suppliers/:id"], async (req, res) => {
    const row = await ctx.db.transaction(async (tx) => {
      const actor = await lockActor(tx, identity(res), "suppliers", "edit");
      const [existing] = await tx.select().from(suppliers).where(eq(suppliers.id, String(req.params.id))).for("update");
      if (!existing) throw new HttpError(404, "Supplier not found.");
      const input = supplierInput.parse({ ...existing, ...req.body });
      const [row] = await tx.update(suppliers).set(input).where(eq(suppliers.id, String(req.params.id))).returning();
      if (!row) throw new HttpError(404, "Supplier not found.");
      await audit(tx, actor.id, "Supplier updated", "Supplier", row.id);
      return row;
    });
    res.json({ success: true, data: row, message: "Supplier updated" });
  });
  router.delete(["/suppliers/:id", "/settings/suppliers/:id"], async (req, res) => {
    await ctx.db.transaction(async (tx) => {
      const actor = await lockActor(tx, identity(res), "suppliers", "delete");
      const [row] = await tx.update(suppliers).set({ active: false }).where(eq(suppliers.id, String(req.params.id))).returning();
      if (!row) throw new HttpError(404, "Supplier not found.");
      await audit(tx, actor.id, "Supplier deactivated", "Supplier", row.id);
    });
    res.json({ success: true, data: { id: req.params.id }, message: "Supplier deactivated; history preserved" });
  });
  return router;
}
