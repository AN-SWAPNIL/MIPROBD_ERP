import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { documents, masterOptions, products, suppliers } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import { optionInput, optionKind } from "../../src/domains/masters/contracts.js";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { audit, identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { lockActor, newId } from "./common.js";
import { productInput, supplierInput } from "./contracts.js";

export function createMasterRouter(ctx: Context) {
  const router = Router();
  router.get("/settings/options", async (req, res) => {
    const kind = optionKind.parse(req.query.kind);
    const data = await ctx.db.select({ id: masterOptions.id, kind: masterOptions.kind, value: masterOptions.value }).from(masterOptions).where(eq(masterOptions.kind, kind)).orderBy(masterOptions.value).limit(500);
    res.json({ success: true, data, message: "Dropdown options loaded" });
  });
  router.post("/settings/options", async (req, res) => {
    const input = optionInput.parse(req.body);
    const row = await ctx.db.transaction(async (tx) => {
      const area = ["unit", "product-family"].includes(input.kind) ? "products" : input.kind === "country" ? "suppliers" : "import";
      const actor = identity(res).user;
      assertAllowed(hasEffectivePermission(actor, area, "create") || hasEffectivePermission(actor, area, "edit") || hasEffectivePermission(actor, "settings", "create"));
      await lockActor(tx, identity(res), hasEffectivePermission(actor, "settings", "create") ? "settings" : area, hasEffectivePermission(actor, "settings", "create") || hasEffectivePermission(actor, area, "create") ? "create" : "edit");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'master-options:' + input.kind},0))`);
      const existing = (await tx.select().from(masterOptions).where(sql`${masterOptions.kind}=${input.kind} and lower(${masterOptions.value})=lower(${input.value})`))[0];
      if (existing) return existing;
      const [{ count }] = (await tx.execute<{ count: number }>(sql`select count(*)::int count from erp_private.master_options where kind=${input.kind}`)).rows;
      if (count >= 500) throw new HttpError(409, "This option list has reached its 500-option limit.");
      const [row] = await tx.insert(masterOptions).values({ ...input, id: newId("option"), createdBy: actor.id }).returning();
      await audit(tx, actor.id, "Dropdown option added", "MasterOption", row.id, input);
      return row;
    });
    res.status(201).json({ success: true, data: { id: row.id, kind: row.kind, value: row.value }, message: "Option added" });
  });
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
      await validateImage(tx, actor, input.imageUrl);
      const [row] = await tx.insert(products).values({ ...input, id: newId("prd") }).returning();
      await linkImage(tx, input.imageUrl, row.id);
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
      if (input.unit.toLowerCase() !== existing.unit.toLowerCase()) {
        const [{ used }] = (await tx.execute<{ used: boolean }>(sql`select exists(select 1 from erp_private.stock_batches where product_id=${existing.id}) or exists(select 1 from erp_private.import_items where product_id=${existing.id}) or exists(select 1 from erp_private.quotation_lines where product_id=${existing.id}) used`)).rows;
        if (used) throw new HttpError(409, "Unit: this product is already used in imports, sales or inventory. Create a new product variant with the new unit; existing quantities cannot be reinterpreted as boxes, pieces or another unit.");
      }
      await validateImage(tx, actor, input.imageUrl, existing.id, existing.imageUrl);
      const [row] = await tx.update(products).set(input).where(eq(products.id, existing.id)).returning();
      await linkImage(tx, input.imageUrl, row.id);
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

async function validateImage(tx: Transaction, actor: User, path: string, productId?: string, previous?: string) {
  if (!path || path === previous) return;
  if (!/^\/api\/documents\/[a-f0-9-]{36}$/.test(path)) throw new HttpError(422, "Upload a product image instead of entering an image URL.", [{ field: "imageUrl", message: "Choose an uploaded product image smaller than 1 MB." }]);
  const [document] = await tx.select().from(documents).where(eq(documents.id, path.slice("/api/documents/".length))).for("update");
  if (!document || document.purpose !== "product-image" || document.status !== "Attached" || document.uploadedBy !== actor.id || document.productId && document.productId !== productId) throw new HttpError(422, "Product image: upload your own valid product image before saving.");
}
async function linkImage(tx: Transaction, path: string, productId: string) {
  if (path.startsWith("/api/documents/")) await tx.update(documents).set({ productId }).where(eq(documents.id, path.slice("/api/documents/".length)));
}
