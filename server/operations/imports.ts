import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { Decimal } from "decimal.js";
import { auditEvents, importCases, importItems, importCosts, suppliers, landedSnapshots, postingKeys, warehouseReceipts } from "../../database/schema.js";
import { calculateLandedCost } from "../../src/domains/imports/costing.js";
import type { ImportCase, ImportCostLine, LandedCostSnapshot } from "../../src/domains/erp.types.js";
import { hasCapability, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { audit, identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { createImportInput, itemInput, updateImportInput, costInput, transitionInput, reasonInput, validateCommercial } from "./contracts.js";
import { lockActor, newId, nextNumber, postingIdentity, previousPosting } from "./common.js";
import { canonicalItem, loadImport, loadImports, lockImport, money, visibleImport } from "./import-records.js";
import { activePaymentFields, paymentPayload } from "../../src/domains/imports/paymentPayload.js";
import { z } from "zod";
import { digest } from "../foundation/context.js";
import { confirmationEpoch, importConfirmationSource, importReviewEpoch, importWorkflow, retractedImportStatus } from "../../src/domains/imports/workflow.js";
const CostDecimal = Decimal.clone({ precision: 48, rounding: Decimal.ROUND_HALF_UP });

function baseStatus(commercial: Pick<ImportCase, "piNumber" | "paymentMode" | "lcNumber" | "ttReference">) {
  if (commercial.piNumber?.trim() && ((commercial.paymentMode === "LC" && commercial.lcNumber?.trim()) || (commercial.paymentMode === "TT" && commercial.ttReference?.trim()))) return "LC/TT Opened" as const;
  return commercial.piNumber?.trim() ? "PI Received" as const : "Draft" as const;
}
export function createImportRouter(ctx: Context) {
  const router = Router();
  const read = async (id: string, user: ReturnType<typeof identity>["user"]) => ctx.db.transaction(async (tx) => visibleImport(await loadImport(tx, id), user), { isolationLevel: "repeatable read", accessMode: "read only" });
  router.get("/imports", async (_req, res) => {
    const user = identity(res).user;
    assertAllowed(hasEffectivePermission(user, "import", "view"));
    const rows = await ctx.db.transaction(async (tx) => (await loadImports(tx)).map((row) => visibleImport(row, user)), { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data: rows, message: "Imports loaded" });
  });
  router.get("/imports/:id", async (req, res) => {
    const user = identity(res).user;
    assertAllowed(hasEffectivePermission(user, "import", "view"));
    res.json({ success: true, data: await read(String(req.params.id), user), message: "Import loaded" });
  });
  router.post("/imports", async (req, res) => {
    const input = createImportInput.parse(paymentPayload(req.body));
    const key = postingIdentity(req, `${identity(res).user.id}:import-create`, input);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, identity(res), "import", "create");
      // Serialize creation-key retries before allocating the permanent document number.
      const { sql } = await import("drizzle-orm");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key.id}, 0))`);
      const existing = await previousPosting(tx, key);
      if (existing) return existing;
      const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).for("share");
      if (!supplier?.active) throw new HttpError(422, "Select an active supplier.");
      const { items, supplierId, guidedWorkflow, ...commercialInput } = input;
      const commercial = activePaymentFields(validateCommercial(commercialInput));
      if (!hasCapability(user, "edit_sensitive_cost")) {
        commercial.exchangeRate = "0"; delete commercial.lcAmount; delete commercial.lcBankAmount; delete commercial.lcOtherAmount; delete commercial.ttAmount;
      }
      const id = newId("imp");
      const draftReference = await nextNumber(tx, "IMP", input.poDate);
      await tx.insert(importCases).values({ id, supplierId, supplierName: supplier.name, draftReference, commercial: { ...commercial, rateDate: commercial.rateDate ?? "" }, status: baseStatus(commercial), createdBy: user.id });
      for (const item of items) await tx.insert(importItems).values({ ...await canonicalItem(tx, item, user), importId: id });
      await tx.insert(postingKeys).values({ ...key, resourceId: id });
      await audit(tx, user.id, "Import created", "Import", id, { draftReference });
      if (guidedWorkflow) await audit(tx, user.id, "Import workflow started", "Import", id);
      return id;
    });
    res.status(201).json({ success: true, data: await read(id, identity(res).user), message: "Import created" });
  });
  router.patch("/imports/:id", async (req, res) => {
    const patch = updateImportInput.parse(paymentPayload(req.body));
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, identity(res), "import", "edit");
      const row = await lockImport(tx, String(req.params.id));
      if (["Closed", "Cancelled"].includes(row.status)) throw new HttpError(423, "Reopen the closed case before editing. Cancelled cases are read-only.");
      const followUpFields = ["poNumber", "poDate", "piNumber", "piDate", "lcNumber", "lcOpenDate", "lcExpiryDate", "ttReference", "ttDate", "bank", "productionStatus", "productionFollowUpNote", "commercialInvoiceNumber", "commercialInvoiceDate", "blNumber", "containerNumber", "containerType", "vesselName", "etd", "eta", "notes", "expectedShipmentDate"];
      const changedFields = Object.keys(patch).filter(key => JSON.stringify(patch[key as keyof typeof patch] ?? "") !== JSON.stringify(key === "supplierId" ? row.supplierId : row.commercial[key as keyof typeof row.commercial] ?? ""));
      const protectedChanges = changedFields.filter(key => !followUpFields.includes(key));
      if (row.currentSnapshotVersion !== null && protectedChanges.length) throw new HttpError(423, "Reopen unreceived landed cost before changing supplier or financial values. Received stock and its valuation cannot be rewritten; references, dates and follow-up remain editable.", protectedChanges.map(field => ({ field, message: "Protected by finalized costing. Reopen costing before changing this value; existing warehouse receipts prevent reopening." })));
      const { supplierId, ...commercialPatch } = patch;
      let supplierName = row.supplierName;
      if (supplierId && supplierId !== row.supplierId) {
        const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, supplierId)).for("share");
        if (!supplier?.active) throw new HttpError(422, "Select an active supplier.", [{ field: "supplierId", message: "Select an active supplier." }]);
        supplierName = supplier.name;
      }
      if (!hasCapability(user, "edit_sensitive_cost")) { delete commercialPatch.exchangeRate; delete commercialPatch.lcAmount; delete commercialPatch.lcBankAmount; delete commercialPatch.lcOtherAmount; delete commercialPatch.ttAmount; }
      const validated = validateCommercial(activePaymentFields({ ...row.commercial, ...commercialPatch }));
      const commercial = { ...validated, rateDate: validated.rateDate ?? "" };
      if (row.currentSnapshotVersion === null && !["Draft", "PI Received", "LC/TT Opened"].includes(row.status) && baseStatus(commercial) !== "LC/TT Opened") throw new HttpError(422, "Retract the relevant completion mark before removing required PI or LC/TT references.");
      await tx.update(importCases).set({ commercial, supplierId: supplierId ?? row.supplierId, supplierName, status: ["Draft", "PI Received", "LC/TT Opened"].includes(row.status) ? baseStatus(commercial) : row.status, updatedAt: new Date() }).where(eq(importCases.id, row.id));
      await audit(tx, user.id, "Import commercial details updated", "Import", row.id, { changedFields, ...(supplierId && supplierId !== row.supplierId ? { previousSupplierId: row.supplierId, supplierId } : {}) });
    });
    res.json({ success: true, data: await read(String(req.params.id), identity(res).user), message: "Import updated" });
  });

  for (const method of ["post", "patch", "delete"] as const) {
    const path = method === "post" ? "/imports/:id/items" : "/imports/:id/items/:itemId";
    router[method](path, async (req, res) => {
      await ctx.db.transaction(async (tx) => {
        const user = await lockActor(tx, identity(res), "import", "edit");
        const row = await lockImport(tx, String(req.params.id), true);
        const existing = method === "post" ? undefined : (await tx.select().from(importItems).where(and(eq(importItems.id, String((req.params as Record<string, string>).itemId)), eq(importItems.importId, row.id))))[0];
        if (method !== "post" && !existing) throw new HttpError(404, "Import item not found.");
        const costs = await tx.select().from(importCosts).where(eq(importCosts.importId, row.id));
        if (method === "delete") {
          if (costs.some((cost) => cost.data.appliesToItemIds.includes(existing!.id) || cost.data.manualSplits?.some((split) => split.importItemId === existing!.id))) throw new HttpError(409, "Remove the item's scoped/manual cost allocations before deleting it.");
          await tx.delete(importItems).where(eq(importItems.id, existing!.id));
        } else {
          const canonical = await canonicalItem(tx, itemInput.parse({ ...existing, ...req.body }), user, existing);
          if (existing) await tx.update(importItems).set(canonical).where(eq(importItems.id, existing.id));
          else await tx.insert(importItems).values({ ...canonical, importId: row.id });
        }
        await tx.update(importCases).set({ updatedAt: new Date() }).where(eq(importCases.id, row.id));
        await audit(tx, user.id, `Import item ${method === "delete" ? "removed" : "saved"}`, "Import", row.id);
      });
      res.status(method === "post" ? 201 : 200).json({ success: true, data: await read(String(req.params.id), identity(res).user), message: "Import items updated" });
    });
  }

  for (const method of ["post", "patch", "delete"] as const) {
    const path = method === "post" ? "/imports/:id/costs" : "/imports/:id/costs/:costId";
    router[method](path, async (req, res) => {
      await ctx.db.transaction(async (tx) => {
        const user = await lockActor(tx, identity(res), "import", "edit", "edit_sensitive_cost");
        const row = await lockImport(tx, String(req.params.id), true);
        const [existing] = method === "post" ? [] : await tx.select().from(importCosts).where(and(eq(importCosts.id, String((req.params as Record<string, string>).costId)), eq(importCosts.importId, row.id)));
        if (method !== "post" && !existing) throw new HttpError(404, "Cost line not found.");
        if (method === "delete") await tx.delete(importCosts).where(eq(importCosts.id, existing!.id));
        else {
          const input = costInput.parse({ ...existing?.data, ...existing && { amountForeign: existing.amountForeign, exchangeRate: existing.exchangeRate }, ...req.body });
          if (["rent", "office rent", "salary", "salaries", "office utilities", "ta/da", "ta-da", "operating expense"].some((name) => [input.name, input.category].some((value) => value.toLowerCase() === name))) throw new HttpError(422, "Operating expenses must not be included in landed cost.");
          if (/customs|duty/i.test(input.category) && input.allocationMethod !== "PRODUCT_SPECIFIC") throw new HttpError(422, "Enter final assessed customs duty per product using product-specific allocation.");
          const exchangeRate = input.currency === "BDT" ? "1" : input.exchangeRate;
          const cost: ImportCostLine = { ...input, exchangeRate, amountBdt: money(new CostDecimal(input.amountForeign).mul(exchangeRate)), id: existing?.id ?? newId("cost"), enteredBy: existing?.data.enteredBy ?? user.name, createdAt: existing?.data.createdAt ?? new Date().toISOString() };
          const record = await loadImport(tx, row.id);
          const preview = calculateLandedCost(row.id, record.items, [cost]);
          if (preview.validationErrors.length) throw new HttpError(422, preview.validationErrors.join(" "));
          const { amountForeign, amountBdt, exchangeRate: rate, ...data } = cost;
          if (existing) await tx.update(importCosts).set({ data, amountForeign, amountBdt, exchangeRate: rate }).where(eq(importCosts.id, existing.id));
          else await tx.insert(importCosts).values({ id: cost.id, importId: row.id, data, amountForeign, amountBdt, exchangeRate: rate });
        }
        await tx.update(importCases).set({ updatedAt: new Date() }).where(eq(importCases.id, row.id));
        await audit(tx, user.id, `Import cost ${method === "delete" ? "removed" : "saved"}`, "Import", row.id);
      });
      res.status(method === "post" ? 201 : 200).json({ success: true, data: await read(String(req.params.id), identity(res).user), message: "Costs updated" });
    });
  }

  router.post("/imports/:id/cost-preview", async (req, res) => {
    const actor = identity(res);
    assertAllowed(hasEffectivePermission(actor.user, "import") && hasCapability(actor.user, "view_sensitive_cost"));
    const record = await read(String(req.params.id), actor.user);
    res.json({ success: true, data: calculateLandedCost(record.id, record.items, record.costs), message: "Landed cost preview" });
  });
  router.post("/imports/:id/finalize", async (req, res) => {
    const actor = identity(res);
    const key = postingIdentity(req, `${actor.user.id}:finalize:${req.params.id}`, {});
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "import", "edit", "finalize_landed_cost");
      assertAllowed(user.role === "Super Admin", "Only Super Admin can finalize until client authority is confirmed.");
      const row = await lockImport(tx, String(req.params.id));
      if (await previousPosting(tx, key)) return;
      if (row.currentSnapshotVersion !== null || ["Closed", "Cancelled", "Received", "Partially Received"].includes(row.status)) throw new HttpError(409, "Import is already finalized or cannot be finalized in this state.");
      const record = await loadImport(tx, row.id);
      if (baseStatus(record) !== "LC/TT Opened" || !record.items.length || record.items.some((item) => new Decimal(item.fobUnitForeign).lte(0) || new Decimal(item.exchangeRate).lte(0))) throw new HttpError(422, "Complete PI, LC/TT reference and positive product FOB/exchange rates before finalization.");
      if (record.confirmedSteps !== undefined && [0, 1, 2].some(step => !record.confirmedSteps!.includes(step))) throw new HttpError(422, "Confirm the current PO, PI and LC/TT steps before finalizing cost.");
      if (record.confirmedSteps !== undefined && row.status !== "Costing") throw new HttpError(409, "Mark Costing before finalizing the landed-cost snapshot.");
      const preview = calculateLandedCost(row.id, record.items, record.costs);
      if (preview.validationErrors.length) throw new HttpError(422, preview.validationErrors.join(" "));
      const version = (record.snapshotHistory?.at(-1)?.version ?? 0) + 1;
      const snapshot: LandedCostSnapshot = { ...preview, id: newId("snapshot"), version, finalizedAt: new Date().toISOString(), finalizedBy: user.name, immutable: true };
      await tx.insert(landedSnapshots).values({ id: snapshot.id, importId: row.id, version, data: snapshot, totalProductValueBdt: preview.totalProductValueBdt, totalAdditionalCostBdt: preview.totalAdditionalCostBdt, totalShipmentCostBdt: preview.totalShipmentCostBdt });
      await tx.update(importCases).set({ currentSnapshotVersion: version, status: "Cost Finalized", updatedAt: new Date() }).where(eq(importCases.id, row.id));
      await tx.insert(postingKeys).values({ ...key, resourceId: snapshot.id });
      await audit(tx, user.id, "Landed cost finalized", "Import", row.id, { snapshotId: snapshot.id, version });
    });
    res.json({ success: true, data: await read(String(req.params.id), actor.user), message: "Landed cost finalized" });
  });
  router.post("/imports/:id/reopen", async (req, res) => {
    const input = reasonInput.parse(req.body);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, identity(res), "import", "edit", "reopen_landed_cost");
      assertAllowed(user.role === "Super Admin");
      const row = await lockImport(tx, String(req.params.id));
      const [receipt] = await tx.select().from(warehouseReceipts).where(eq(warehouseReceipts.importId, row.id)).limit(1);
      if (receipt || row.currentSnapshotVersion === null || row.status !== "Cost Finalized") throw new HttpError(409, "Only unreceived finalized costing can be reopened. Existing snapshots remain immutable.");
      await tx.update(importCases).set({ currentSnapshotVersion: null, status: "Costing", updatedAt: new Date() }).where(eq(importCases.id, row.id));
      await audit(tx, user.id, "Landed cost reopened", "Import", row.id, { reason: input.reason, previousVersion: row.currentSnapshotVersion });
    });
    res.json({ success: true, data: await read(String(req.params.id), identity(res).user), message: "Costing reopened; previous snapshot retained" });
  });

  router.post("/imports/:id/reopen-case", async (req, res) => {
    z.object({}).strict().parse(req.body);
    await ctx.db.transaction(async tx => {
      const user = await lockActor(tx, identity(res), "import", "edit");
      const row = await lockImport(tx, String(req.params.id));
      if (row.status !== "Closed") throw new HttpError(409, "Only a closed import case can be reopened. Its stock and finalized costs will remain unchanged.");
      await tx.update(importCases).set({ status: "Received", updatedAt: new Date() }).where(eq(importCases.id, row.id));
      await audit(tx, user.id, "Import case reopened", "Import", row.id, { from: "Closed", to: "Received", costingChanged: false, stockChanged: false });
    });
    res.json({ success: true, data: await read(String(req.params.id), identity(res).user), message: "Import case reopened for follow-up. Posted stock and costs are unchanged." });
  });
  router.post("/imports/:id/transition", async (req, res) => {
    const { status } = transitionInput.parse(req.body);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, identity(res), "import", "edit");
      const row = await lockImport(tx, String(req.params.id));
      const allowed: Record<string, string[]> = { "LC/TT Opened": ["In Production"], "In Production": ["Shipped"], "Shipped": ["At Port"], "At Port": ["Costing"], "Received": ["Closed"] };
      const record = await loadImport(tx, row.id);
      if (status !== "Cancelled" && record.confirmedSteps !== undefined && [0, 1, 2].some(step => !record.confirmedSteps!.includes(step))) throw new HttpError(422, "Confirm the current PO, PI and LC/TT steps first.");
      if (status === "Closed" && record.pendingReviewSteps?.length) throw new HttpError(422, "Complete the retracted import reviews before closing the case.");
      if (status === "Cancelled") {
        if (row.currentSnapshotVersion !== null || ["Received", "Partially Received", "Closed", "Cancelled"].includes(row.status)) throw new HttpError(409, "Posted/terminal imports cannot be cancelled.");
      } else if (!allowed[row.status]?.includes(status)) throw new HttpError(409, "This milestone transition is not allowed.");
      if (status === "Shipped" && (!row.commercial.blNumber || !row.commercial.etd)) throw new HttpError(422, "Record bill of lading and departure date before shipping.");
      await tx.update(importCases).set({ status, updatedAt: new Date() }).where(eq(importCases.id, row.id));
      await audit(tx, user.id, "Import milestone changed", "Import", row.id, { from: row.status, to: status });
    });
    res.json({ success: true, data: await read(String(req.params.id), identity(res).user), message: "Milestone updated" });
  });
  router.post("/imports/:id/confirm-step", async (req, res) => {
    const { step } = z.object({ step: z.number().int().min(0).max(6) }).strict().parse(req.body);
    await ctx.db.transaction(async tx => {
      const user = await lockActor(tx, identity(res), "import", "edit");
      const row = await lockImport(tx, String(req.params.id));
      if (["Closed", "Cancelled"].includes(row.status)) throw new HttpError(423, "Closed and cancelled cases are read-only. Reopen a closed case before changing completion marks.");
      const record = await loadImport(tx, row.id);
      if (step >= 3 && (row.currentSnapshotVersion === null || !record.pendingReviewSteps?.includes(step))) throw new HttpError(409, "Use the milestone action for this step. Only retracted reviews on finalized cases can be reconfirmed here.");
      if (step === 6) assertAllowed(hasCapability(user, "view_sensitive_cost"), "Cost-review access is required to reconfirm this step.");
      const workflow = importWorkflow(record, hasCapability(user, "view_sensitive_cost"));
      const target = workflow.steps[step];
      if (target.reasons.length) throw new HttpError(422, target.reasons.join(" "));
      if (record.confirmedSteps?.includes(step)) return;
      // Preserve inferred progress for pre-guided records when their first confirmation is saved.
      const inherited = record.confirmedSteps === undefined ? [0, 1, 2].filter(index => workflow.steps[index].completed) : [];
      const history = await tx.select({ action: auditEvents.action, details: auditEvents.details }).from(auditEvents).where(and(eq(auditEvents.entityType, "Import"), eq(auditEvents.entityId, row.id), eq(auditEvents.action, "Import stage retracted")));
      for (const index of new Set([...inherited, step])) await audit(tx, user.id, "Import stage confirmed", "Import", row.id, { step: index, epoch: confirmationEpoch(history, index), reviewEpoch: importReviewEpoch(history, index), fingerprint: digest(importConfirmationSource(record, index)) });
      if (["Draft", "PI Received", "LC/TT Opened"].includes(row.status) && step > 0) await tx.update(importCases).set({ status: step === 1 ? "PI Received" : "LC/TT Opened", updatedAt: new Date() }).where(eq(importCases.id, row.id));
    });
    res.json({ success: true, data: await read(String(req.params.id), identity(res).user), message: "Saved import stage confirmed" });
  });
  router.post("/imports/:id/retract-step", async (req, res) => {
    const { step, reason } = z.object({ step: z.number().int().min(0).max(7), reason: reasonInput.shape.reason.optional() }).strict().parse(req.body);
    await ctx.db.transaction(async tx => {
      const user = await lockActor(tx, identity(res), "import", "edit");
      const row = await lockImport(tx, String(req.params.id));
      if (["Closed", "Cancelled"].includes(row.status)) throw new HttpError(423, "Closed and cancelled cases are read-only. Reopen a closed case before retracting completion.");
      const record = await loadImport(tx, row.id);
      if (!importWorkflow(record).steps[step].completed) throw new HttpError(409, "This step is not completed. Reload the case before retracting a mark.");
      const [receipt] = await tx.select({ id: warehouseReceipts.id }).from(warehouseReceipts).where(eq(warehouseReceipts.importId, row.id)).limit(1);
      if (receipt && step === 7) throw new HttpError(409, "Landed cost cannot be retracted after receiving: existing stock uses this snapshot. Earlier review marks may still be retracted.");
      const reopenCosting = row.currentSnapshotVersion !== null && !receipt;
      if (reopenCosting) {
        assertAllowed(user.role === "Super Admin" && hasCapability(user, "reopen_landed_cost"), "Landed-cost reopening authority is required before changing finalized costing.");
        if (!reason) throw new HttpError(422, "Enter a reason to reopen finalized landed cost.", [{ field: "reason", message: "A correction reason is required." }]);
        await audit(tx, user.id, "Landed cost reopened", "Import", row.id, { reason, previousVersion: row.currentSnapshotVersion });
      }
      if (record.confirmedSteps === undefined) for (const index of [0, 1, 2].filter(i => i < step && importWorkflow(record).steps[i].completed)) await audit(tx, user.id, "Import stage confirmed", "Import", row.id, { step: index, fingerprint: digest(importConfirmationSource(record, index)), epoch: 0 });
      // After a receipt, checklist review is independent of physical stock and costing status.
      const status = receipt ? row.status : retractedImportStatus(step);
      await audit(tx, user.id, "Import stage retracted", "Import", row.id, { step, from: row.status, to: status, reviewOnly: Boolean(receipt), ...(reason ? { reason } : {}) });
      await tx.update(importCases).set({ status, ...(reopenCosting ? { currentSnapshotVersion: null } : {}), updatedAt: new Date() }).where(eq(importCases.id, row.id));
    });
    res.json({ success: true, data: await read(String(req.params.id), identity(res).user), message: "Completion retracted. Saved fields and documents are unchanged; later steps require completion again." });
  });
  router.delete("/imports/:id", async (req, res) => {
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, identity(res), "import", "delete");
      const row = await lockImport(tx, String(req.params.id), true);
      if (row.status !== "Draft") throw new HttpError(409, "Only draft imports may be removed. Use a permitted cancellation instead.");
      await tx.update(importCases).set({ status: "Cancelled", updatedAt: new Date() }).where(eq(importCases.id, row.id));
      await audit(tx, user.id, "Draft import archived", "Import", row.id);
    });
    res.json({ success: true, data: { id: req.params.id }, message: "Draft archived; history preserved" });
  });
  return router;
}
