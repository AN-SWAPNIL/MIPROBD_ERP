import { Router } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { cashAccounts, customers, openingDrafts, openingSources, products, suppliers } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import { businessDate } from "../../src/lib/date.js";
import { hasCapability, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { openingDraftData, openingKinds, type OpeningData, type WorkbookProfile } from "../../src/domains/opening/contracts.js";
import { audit, digest, identity, rateLimit, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { lockActor } from "../operations/common.js";
import { maximumWorkbookBytes, openingMime, profileWorkbook } from "./workbook.js";
import { previewOpening } from "./validation.js";
import { openingReadiness, postOpening, reconcileOpening } from "./posting.js";

const versionInput = z.object({ version: z.number().int().min(1) }).strict();
const uploadInput = z.object({ fileName: z.string().min(1).max(160).regex(/^[^/\\]+\.xlsx$/i), sizeBytes: z.number().int().min(1).max(maximumWorkbookBytes) }).strict();
function requireOpening(user: User) {
  assertAllowed(["Super Admin", "Accounts", "Managing Director"].includes(user.role) && hasEffectivePermission(user, "settings") && hasCapability(user, "view_sensitive_cost"), "Opening data requires Settings access and sensitive-cost authority.");
}
async function validateReferences(tx: Transaction, data: OpeningData, profile: WorkbookProfile) {
  const preview = previewOpening(data, profile, businessDate());
  for (const [kind, table] of [["Stock", products], ["Customer Due", customers], ["Supplier Due", suppliers], ["Supplier Advance", suppliers], ["Cash Bank", cashAccounts]] as const) {
    const ids = [...new Set(data.lines.filter((line) => line.kind === kind).map((line) => line.entityId))]; if (!ids.length) continue;
    const rows = await tx.select({ id: table.id, active: table.active }).from(table).where(inArray(table.id, ids));
    for (const line of data.lines.filter((line) => line.kind === kind)) if (!rows.some((row) => row.id === line.entityId && row.active)) preview.blockers.push({ lineId: line.id, message: "Selected ERP master is missing or inactive." });
  }
  for (const message of await openingReadiness(tx, data)) preview.blockers.push({ message });
  preview.canApprove = preview.blockers.length === 0; return preview;
}
function sourceDto(row: typeof openingSources.$inferSelect, detail = false) {
  const profile = row.profile ? { ...row.profile, sheets: row.profile.sheets.map((sheet) => ({ ...sheet, cells: [] })) } : undefined;
  return { id: row.id, fileName: row.fileName, sizeBytes: row.sizeBytes, sha256: row.sha256, state: row.state, createdAt: row.createdAt.toISOString(), ...(detail ? { profile } : {}) };
}
function draftDto(row: typeof openingDrafts.$inferSelect) { return { id: row.id, sourceId: row.sourceId, name: row.name, state: row.state, version: row.version, data: row.data, preview: row.preview, createdBy: row.createdBy, preparedBy: row.preparedBy, approvedBy: row.approvedBy, updatedAt: row.updatedAt.toISOString() }; }
export function createOpeningRouter(ctx: Context) {
  const router = Router();
  router.param("id", (_req, _res, next, value) => { z.uuid().parse(value); next(); });
  router.use("/opening", (_req, res, next) => { requireOpening(identity(res).user); next(); });
  router.get("/opening/masters", async (req, res) => {
    const q = z.object({ kind: z.enum(openingKinds), search: z.string().max(100).default(""), selectedId: z.string().max(200).default("") }).strict().parse(req.query);
    const table = q.kind === "Stock" ? products : q.kind === "Customer Due" ? customers : q.kind === "Cash Bank" ? cashAccounts : suppliers;
    const term = `%${q.search.replace(/[\\%_]/g, "\\$&")}%`;
    const rows = await ctx.db.select({ id: table.id, name: table.name }).from(table).where(and(eq(table.active, true), or(ilike(table.name, term), q.selectedId ? eq(table.id, q.selectedId) : undefined))).orderBy(table.name, table.id).limit(51);
    if (q.selectedId && !rows.slice(0, 50).some((r) => r.id === q.selectedId)) {
      const [selected] = await ctx.db.select({ id: table.id, name: table.name }).from(table).where(eq(table.id, q.selectedId));
      if (selected) rows.unshift(selected);
    }
    res.json({ success: true, data: { rows: rows.slice(0, 50), hasMore: rows.length > 50 }, message: "Exact master selection; refine search when more matches exist" });
  });
  router.get("/opening/sources", async (_req, res) => {
    const rows = await ctx.db.select().from(openingSources).orderBy(desc(openingSources.createdAt), openingSources.id).limit(50);
    res.json({ success: true, data: rows.map((row) => sourceDto(row)), message: "Latest 50 private source artifacts" });
  });
  router.post("/opening/sources/upload", async (req, res) => {
    const input = uploadInput.parse(req.body); const actor = identity(res); const id = randomUUID(); const objectPath = `sources/${id}.xlsx`;
    await rateLimit(ctx, `opening-upload:${actor.user.id}`, 10, 3600);
    await ctx.db.transaction(async (tx) => { const user = await lockActor(tx, actor, "settings", "create"); requireOpening(user);
      await tx.insert(openingSources).values({ id, objectPath, ...input, createdBy: user.id, expiresAt: new Date(Date.now() + 15 * 60000) });
      await audit(tx, user.id, "Opening source upload reserved", "Opening Source", id, { sizeBytes: input.sizeBytes });
    });
    const { data, error } = await ctx.admin.storage.from("erp-opening-sources").createSignedUploadUrl(objectPath, { upsert: false });
    if (error) throw new HttpError(503, "Private opening-source storage is unavailable. Run the reviewed opening-storage setup.");
    res.status(201).json({ success: true, data: { id, signedUrl: data.signedUrl, mimeType: openingMime }, message: "Upload directly to private Storage, then validate" });
  });
  router.post("/opening/sources/:id/complete", async (req, res) => {
    z.object({}).strict().parse(req.body); const actor = identity(res);
    const [row] = await ctx.db.select().from(openingSources).where(eq(openingSources.id, String(req.params.id)));
    if (!row) throw new HttpError(404, "Source not found.");
    if (row.state === "Ready") return res.json({ success: true, data: sourceDto(row, true), message: "Immutable source already profiled" });
    assertAllowed(row.createdBy === actor.user.id); if (row.expiresAt < new Date()) throw new HttpError(409, "Upload reservation expired. Create a new reservation.");
    await rateLimit(ctx, `opening-profile:${actor.user.id}`, 10, 3600);
    const { data: file, error } = await ctx.admin.storage.from("erp-opening-sources").download(row.objectPath);
    if (error || !file || file.size !== row.sizeBytes || file.size > maximumWorkbookBytes) throw new HttpError(422, "Uploaded source is missing or its byte count differs from the reservation.");
    const profile = await profileWorkbook(new Uint8Array(await file.arrayBuffer()));
    const result = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "settings", "create"); requireOpening(user);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${profile.sha256},77612015))`);
      const [same] = await tx.select().from(openingSources).where(eq(openingSources.sha256, profile.sha256)); if (same) return same;
      const [current] = await tx.select().from(openingSources).where(eq(openingSources.id, row.id)).for("update");
      if (current.state === "Ready") return current;
      if (current.expiresAt < new Date()) throw new HttpError(409, "Upload expired during profiling. Upload again.");
      const [updated] = await tx.update(openingSources).set({ state: "Ready", profile, sha256: profile.sha256 }).where(eq(openingSources.id, row.id)).returning();
      await audit(tx, user.id, "Opening source profiled", "Opening Source", row.id, { sha256: profile.sha256, sheets: profile.sheets.length, blockers: profile.issues.filter((v) => v.severity === "Blocker").length }); return updated;
    });
    res.json({ success: true, data: sourceDto(result, true), message: "Source evidence saved; no ERP balances posted" });
  });
  router.get("/opening/sources/:id", async (req, res) => {
    const [row] = await ctx.db.select().from(openingSources).where(eq(openingSources.id, String(req.params.id))); if (!row) throw new HttpError(404, "Source not found.");
    res.json({ success: true, data: sourceDto(row, true), message: "Source profile without raw contact data" });
  });
  router.get("/opening/sources/:id/cells", async (req, res) => {
    const q = z.object({ sheet: z.string().max(100), page: z.coerce.number().int().min(1).max(1000).default(1) }).strict().parse(req.query);
    const [row] = await ctx.db.select().from(openingSources).where(eq(openingSources.id, String(req.params.id))); const sheet = row?.profile?.sheets.find((sheet) => sheet.name === q.sheet);
    if (!sheet) throw new HttpError(404, "Profiled sheet not found.");
    res.json({ success: true, data: { rows: sheet.cells.slice((q.page - 1) * 50, q.page * 50), total: sheet.cells.length, page: q.page, pageSize: 50 }, message: "Original values and cached formulas; formulas are not recalculated" });
  });
  router.get("/opening/drafts", async (req, res) => {
    const { page } = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }).strict().parse(req.query);
    const data = await ctx.db.transaction(async (tx) => {
      const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(openingDrafts);
      const rows = await tx.select().from(openingDrafts).orderBy(desc(openingDrafts.updatedAt), openingDrafts.id).limit(25).offset((page - 1) * 25);
      return { rows: rows.map(draftDto), total, page, pageSize: 25 };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Opening drafts loaded" });
  });
  router.post("/opening/drafts", async (req, res) => {
    const input = z.object({ name: z.string().trim().min(1).max(160), sourceId: z.uuid(), data: openingDraftData }).strict().parse(req.body); const actor = identity(res);
    const row = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "settings", "create"); requireOpening(user);
      const [source] = await tx.select().from(openingSources).where(and(eq(openingSources.id, input.sourceId), eq(openingSources.state, "Ready")));
      if (!source) throw new HttpError(422, "Choose an immutable validated source artifact first.");
      const [row] = await tx.insert(openingDrafts).values({ ...input, createdBy: user.id, preparedBy: user.id }).returning(); await audit(tx, user.id, "Opening draft created", "Opening Draft", row.id, { sourceHash: source.sha256 }); return row;
    });
    res.status(201).json({ success: true, data: draftDto(row), message: "Draft saved without posting" });
  });
  router.get("/opening/drafts/:id", async (req, res) => {
    const [row] = await ctx.db.select().from(openingDrafts).where(eq(openingDrafts.id, String(req.params.id))); if (!row) throw new HttpError(404, "Draft not found.");
    const entityLabels: Record<string, string> = {};
    for (const [kind, table] of [["Stock", products], ["Customer Due", customers], ["Supplier Due", suppliers], ["Supplier Advance", suppliers], ["Cash Bank", cashAccounts]] as const) {
      const ids = [...new Set(row.data.lines.filter((line) => line.kind === kind && line.entityId).map((line) => line.entityId))];
      if (!ids.length) continue;
      const records = await ctx.db.select({ id: table.id, name: table.name }).from(table).where(inArray(table.id, ids));
      for (const record of records) entityLabels[`${kind}:${record.id}`] = record.name;
    }
    res.json({ success: true, data: { ...draftDto(row), entityLabels }, message: "Opening draft loaded" });
  });
  router.patch("/opening/drafts/:id", async (req, res) => {
    const input = z.object({ version: z.number().int().min(1), name: z.string().trim().min(1).max(160), data: openingDraftData }).strict().parse(req.body); const actor = identity(res);
    const row = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "settings", "edit"); requireOpening(user);
      const [current] = await tx.select().from(openingDrafts).where(eq(openingDrafts.id, String(req.params.id))).for("update");
      if (!current) throw new HttpError(404, "Draft not found.");
      if (current.version !== input.version) throw new HttpError(409, "Draft changed; reload before saving.");
      if (["Approved", "Posted", "Reconciled"].includes(current.state)) throw new HttpError(423, "Approved source data is immutable. Prepare a separate correction.");
      const [row] = await tx.update(openingDrafts).set({ name: input.name, data: input.data, preparedBy: user.id, state: "Draft", preview: null, previewHash: null, version: current.version + 1, updatedAt: new Date() }).where(eq(openingDrafts.id, current.id)).returning();
      await audit(tx, user.id, "Opening draft revised", "Opening Draft", row.id, { version: row.version }); return row;
    });
    res.json({ success: true, data: draftDto(row), message: "Draft saved; prior validation invalidated" });
  });
  for (const action of ["validate", "preview", "approve"] as const) router.post(`/opening/drafts/:id/${action}`, async (req, res) => {
    const input = versionInput.parse(req.body); const actor = identity(res);
    const row = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "settings", action === "approve" ? "approve" : "edit"); requireOpening(user);
      const [current] = await tx.select().from(openingDrafts).where(eq(openingDrafts.id, String(req.params.id))).for("update");
      if (!current) throw new HttpError(404, "Draft not found.");
      if (current.version !== input.version) throw new HttpError(409, "Draft changed; reload before continuing.");
      if (["Approved", "Posted", "Reconciled"].includes(current.state)) throw new HttpError(423, "Approved data is immutable.");
      const [source] = await tx.select().from(openingSources).where(eq(openingSources.id, current.sourceId)); if (!source?.profile) throw new HttpError(409, "Source profile unavailable.");
      const preview = await validateReferences(tx, current.data, source.profile); const hash = digest(JSON.stringify({ sha256: source.sha256, data: current.data, preview }));
      if (action === "preview" && current.state !== "Validated") throw new HttpError(409, "Validate this version before previewing.");
      if (action === "approve") {
        assertAllowed(user.role === "Super Admin", "Only Super Admin can approve opening data at this stage.");
        if (current.state !== "Previewed" || current.previewHash !== hash || !preview.canApprove) throw new HttpError(409, "A current, fully reconciled preview is required before approval.");
      }
      const state = action === "approve" ? "Approved" : action === "preview" ? "Previewed" : preview.canApprove ? "Validated" : "Draft";
      const [updated] = await tx.update(openingDrafts).set({ state, preview, previewHash: hash, approvedBy: action === "approve" ? user.id : null, version: current.version + 1, updatedAt: new Date() }).where(eq(openingDrafts.id, current.id)).returning();
      await audit(tx, user.id, `Opening ${action}`, "Opening Draft", current.id, { version: updated.version, blockerCount: preview.blockers.length, sourceHash: source.sha256, ...(action === "approve" ? { superAdminAuthority: true, selfApproval: current.createdBy === user.id || current.preparedBy === user.id } : {}) }); return updated;
    });
    res.json({ success: true, data: draftDto(row), message: "Opening review saved; no stock or financial journals posted" });
  });
  router.post("/opening/drafts/:id/post", async (req, res) => {
    const input = versionInput.parse(req.body); const actor = identity(res);
    const row = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "settings", "approve"); requireOpening(user);
      assertAllowed(user.role === "Super Admin", "Only Super Admin can post approved opening data.");
      return postOpening(tx, String(req.params.id), input.version, user);
    });
    res.json({ success: true, data: draftDto(row), message: "Approved opening posted atomically; existing journals preserved" });
  });
  router.get("/opening/drafts/:id/reconciliation", async (req, res) => {
    const data = await ctx.db.transaction((tx) => reconcileOpening(tx, String(req.params.id)), { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Approved source positions compared with original immutable journals" });
  });
  router.post("/opening/drafts/:id/reconcile", async (req, res) => {
    const input = versionInput.parse(req.body); const actor = identity(res);
    const row = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "settings", "approve"); requireOpening(user); assertAllowed(user.role === "Super Admin");
      const [draft] = await tx.select().from(openingDrafts).where(eq(openingDrafts.id, String(req.params.id))).for("update");
      if (!draft) throw new HttpError(404, "Opening draft not found.");
      if (draft.state === "Reconciled") return draft;
      if (draft.version !== input.version || draft.state !== "Posted") throw new HttpError(409, "Reload a posted opening before reconciliation.");
      const result = await reconcileOpening(tx, draft.id); if (!result.matches) throw new HttpError(409, "Opening source and journal totals differ.");
      const [row] = await tx.update(openingDrafts).set({ state: "Reconciled", version: draft.version + 1, updatedAt: new Date() }).where(eq(openingDrafts.id, draft.id)).returning();
      await audit(tx, user.id, "Opening schedule reconciled", "Opening Draft", draft.id, { lines: result.postedLines }); return row;
    });
    res.json({ success: true, data: draftDto(row), message: "Opening source and original journals reconcile" });
  });
  return router;
}
