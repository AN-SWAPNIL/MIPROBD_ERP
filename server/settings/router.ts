import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { businessDecisions, costPresets, postingKeys, warehouseSettings } from "../../database/schema.js";
import { decisionInput, decisionRecord, presetInput, presetRecord, warehouseInput, warehouseRecord } from "../../src/domains/settings/operationalContracts.js";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { audit, identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { lockActor, newId, postingIdentity, previousPosting } from "../operations/common.js";
import { checkVersion } from "../trading/records.js";

export function createOperationalSettingsRouter(ctx: Context) {
  const router = Router();
  router.get("/settings/warehouse", async (_req, res) => {
    const user = identity(res).user;
    assertAllowed(["settings", "inventory", "import"].some((area) => hasEffectivePermission(user, area as "settings" | "inventory" | "import")));
    const [row] = await ctx.db.select().from(warehouseSettings).where(eq(warehouseSettings.id, "main"));
    if (!row) throw new HttpError(503, "Warehouse configuration is not installed.");
    res.json({ success: true, data: warehouseRecord.parse({ ...row.data, version: row.version }), message: "Warehouse loaded" });
  });
  router.patch("/settings/warehouse", async (req, res) => {
    const input = warehouseInput.parse(req.body);
    const data = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, identity(res), "settings", "edit");
      const [row] = await tx.select().from(warehouseSettings).where(eq(warehouseSettings.id, "main")).for("update");
      if (!row) throw new HttpError(503, "Warehouse configuration is not installed.");
      checkVersion(row.version, input.version);
      await tx.update(warehouseSettings).set({ data: input.data, version: row.version + 1, updatedBy: user.id, updatedAt: new Date() }).where(eq(warehouseSettings.id, row.id));
      await audit(tx, user.id, "Warehouse configuration updated", "WarehouseSettings", row.id, { reason: input.reason, before: row.data, after: input.data, version: row.version + 1 });
      return warehouseRecord.parse({ ...input.data, version: row.version + 1 });
    });
    res.json({ success: true, data, message: "Warehouse details saved; historical receipts unchanged" });
  });
  router.get("/settings/cost-presets", async (_req, res) => {
    const user = identity(res).user;
    assertAllowed(hasEffectivePermission(user, "settings") || hasEffectivePermission(user, "import"));
    const rows = await ctx.db.select().from(costPresets).orderBy(costPresets.id).limit(501);
    if (rows.length > 500) throw new HttpError(413, "Cost preset capacity requires reviewed pagination.");
    res.json({ success: true, data: rows.map((r) => presetRecord.parse({ id: r.id, ...r.data, version: r.version })), message: "Explicit allocation suggestions loaded" });
  });
  router.post("/settings/cost-presets", async (req, res) => {
    const input = presetInput.parse(req.body);
    if (input.version !== undefined) throw new HttpError(422, "New presets have no prior version.");
    const key = postingIdentity(req, `${identity(res).user.id}:cost-preset`, input);
    const data = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, identity(res), "settings", "create");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('cost-preset-settings',0))`);
      const previous = await previousPosting(tx, key);
      if (previous) {
        const [row] = await tx.select().from(costPresets).where(eq(costPresets.id, previous));
        return presetRecord.parse({ id: row.id, ...row.data, version: row.version });
      }
      const [{ count }] = (await tx.execute<{ count: number }>(sql`select count(*)::int count from erp_private.cost_presets`)).rows;
      if (count >= 500) throw new HttpError(409, "The preset limit is 500. Reuse an existing preset.");
      const id = newId("preset");
      await tx.insert(costPresets).values({ id, data: input.data, updatedBy: user.id });
      await audit(tx, user.id, "Cost preset created", "CostPreset", id, { reason: input.reason, after: input.data, version: 1 });
      await tx.insert(postingKeys).values({ ...key, resourceId: id });
      return presetRecord.parse({ id, ...input.data, version: 1 });
    });
    res.status(201).json({ success: true, data, message: "Cost preset created" });
  });
  router.patch("/settings/cost-presets/:id", async (req, res) => {
    const input = presetInput.parse(req.body);
    if (input.version === undefined) throw new HttpError(422, "Reload the preset version before saving.");
    const expectedVersion = input.version;
    const data = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, identity(res), "settings", "edit");
      const [row] = await tx.select().from(costPresets).where(eq(costPresets.id, String(req.params.id))).for("update");
      if (!row) throw new HttpError(404, "Cost preset not found.");
      checkVersion(row.version, expectedVersion);
      await tx.update(costPresets).set({ data: input.data, version: row.version + 1, updatedBy: user.id, updatedAt: new Date() }).where(eq(costPresets.id, row.id));
      await audit(tx, user.id, "Cost preset updated", "CostPreset", row.id, { reason: input.reason, before: row.data, after: input.data, version: row.version + 1 });
      return presetRecord.parse({ id: row.id, ...input.data, version: row.version + 1 });
    });
    res.json({ success: true, data, message: "Preset saved; existing cost rows unchanged" });
  });
  router.get("/settings/decisions", async (_req, res) => {
    const user = identity(res).user;
    assertAllowed(user.role === "Super Admin" && hasEffectivePermission(user, "settings"));
    const rows = await ctx.db.select().from(businessDecisions).orderBy(businessDecisions.id).limit(100);
    res.json({ success: true, data: rows.map((r) => decisionRecord.parse({ id: r.id, ...r.data, version: r.version })), message: "Client confirmation queue loaded" });
  });
  router.patch("/settings/decisions/:id", async (req, res) => {
    const input = decisionInput.parse(req.body);
    const data = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, identity(res), "settings", "edit");
      assertAllowed(user.role === "Super Admin");
      const [row] = await tx.select().from(businessDecisions).where(eq(businessDecisions.id, String(req.params.id))).for("update");
      if (!row) throw new HttpError(404, "Client decision not found.");
      checkVersion(row.version, input.version);
      const data = { ...row.data, status: input.status, resolutionValue: input.resolutionValue, resolutionNotes: input.resolutionNotes, confirmedBy: input.status === "Confirmed" ? user.name : null, confirmedAt: input.status === "Confirmed" ? new Date().toISOString() : null };
      await tx.update(businessDecisions).set({ data, version: row.version + 1, updatedBy: user.id, updatedAt: new Date() }).where(eq(businessDecisions.id, row.id));
      await audit(tx, user.id, "Client decision recorded", "BusinessDecision", row.id, { reason: input.reason, before: row.data, after: data, version: row.version + 1 });
      return decisionRecord.parse({ id: row.id, ...data, version: row.version + 1 });
    });
    res.json({ success: true, data, message: "Decision recorded; no accounting or approval controls automatically changed" });
  });
  return router;
}
