import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { postingKeys, stockHolds, stockHoldReleases } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import { holdInput, holdPageInput, holdPostInput, holdReleaseInput, releasePageInput } from "../../src/domains/inventory/holdContracts.js";
import { hasCapability, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { businessDate } from "../../src/lib/date.js";
import { createApproval, consumeApproval } from "../controls/service.js";
import { audit, digest, identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { lockPosting } from "../trading/locks.js";
import { lockActor, newId, nextNumber, postingIdentity } from "./common.js";
import { holdReviewValue, saleableQuantity } from "./hold-math.js";
import { heldAt } from "./hold-query.js";
import { lockStockBatches } from "./stock-locks.js";

async function lockBatch(tx: Transaction, batchId: string) {
  return (await lockStockBatches(tx, [batchId]))[0];
}
async function releaseList(tx: Transaction, id: string, user: User, page: number) {
  const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(stockHoldReleases).where(eq(stockHoldReleases.holdId, id));
  const rows = (await tx.execute(sql`select r.id,r.number,r.hold_id "holdId",r.quantity::text,r.reason,r.proof_reference "proofReference",r.state,r.version,to_char(r.date,'YYYY-MM-DD') date,e.name "createdByName",r.approval_id "approvalId",a.state "approvalState",(p.state='Approved' and p.version=a.policy_version) "policyActive"
    ${hasCapability(user, "view_sensitive_cost") ? sql`,r.value_bdt::text "valueBdt"` : sql``}
    from erp_private.stock_hold_releases r join erp_private.employees e on e.id=r.created_by join erp_private.approval_requests a on a.id=r.approval_id join erp_private.approval_policies p on p.id=a.policy_id where r.hold_id=${id} order by r.created_at desc,r.id limit 25 offset ${(page - 1) * 25}`)).rows;
  return { rows, total, page, pageSize: 25 };
}
export function createStockHoldRouter(ctx: Context) {
  const router = Router();
  router.get("/inventory/holds", async (req, res) => {
    const user = identity(res).user; assertAllowed(hasEffectivePermission(user, "inventory")); const q = holdPageInput.parse(req.query);
    const term = `%${q.search.replace(/[\\%_]/g, "\\$&")}%`;
    const data = await ctx.db.transaction(async (tx) => {
      const scoped = sql`select h.id,h.number,h.batch_id "batchId",b.product_id "productId",p.name "productName",b.batch_number "batchNumber",b.lot_number "lotNumber",p.unit,h.condition,to_char(h.date,'YYYY-MM-DD') date,h.quantity::text,h.reason,h.proof_reference "proofReference",e.name "createdByName",
        coalesce((select sum(r.quantity) from erp_private.stock_hold_releases r where r.hold_id=h.id and r.state='Posted'),0)::text "releasedQuantity",coalesce((select sum(w.quantity) from erp_private.stock_hold_writeoffs w where w.hold_id=h.id),0)::text "writtenOffQuantity",(coalesce((select sum(p.quantity) from erp_private.supplier_claim_postings p where p.hold_id=h.id),0))::text "supplierReturnedQuantity",erp_private.stock_hold_outstanding(h.id,(current_timestamp at time zone 'Asia/Dhaka')::date)::text "outstandingQuantity"
        ${hasCapability(user, "view_sensitive_cost") ? sql`,h.value_bdt::text "valueBdt"` : sql``}
        from erp_private.stock_holds h join erp_private.stock_batches b on b.id=h.batch_id join erp_private.products p on p.id=b.product_id join erp_private.employees e on e.id=h.created_by
        where concat_ws(' ',h.number,p.name,p.code,b.batch_number,b.lot_number) ilike ${term} ${q.holdId ? sql`and h.id=${q.holdId}` : sql``}`;
      const filter = q.state === "open" ? sql`where "outstandingQuantity"::numeric>0` : sql``;
      const [{ total }] = (await tx.execute<{ total: number }>(sql`with scoped as (${scoped}) select count(*)::int total from scoped ${filter}`)).rows;
      const rows = (await tx.execute(sql`with scoped as (${scoped}) select * from scoped ${filter} order by date desc,id limit 25 offset ${(q.page - 1) * 25}`)).rows;
      return { rows, total, page: q.page, pageSize: 25 };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Stock holds loaded" });
  });
  router.post("/inventory/holds", async (req, res) => {
    const actor = identity(res); const input = holdInput.parse(req.body); const key = postingIdentity(req, `${actor.user.id}:stock-hold`, input);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "inventory", "post"); const prior = await lockPosting(tx, key); if (prior) return prior;
      const batch = await lockBatch(tx, input.batchId); const today = businessDate();
      if (batch.condition !== "Saleable") throw new HttpError(409, "This entire batch is already held by its opening condition. Use its reviewed disposition workflow.");
      const [{ held }] = (await tx.execute<{ held: string }>(sql`select ${heldAt(sql`${batch.id}`, sql`${today}::date`)}::text held`)).rows;
      holdReviewValue(batch.availableValueBdt, saleableQuantity(batch.quantityAvailable, held), input.quantity);
      const valueBdt = holdReviewValue(batch.availableValueBdt, batch.quantityAvailable, input.quantity);
      const id = newId("hold"); const number = await nextNumber(tx, "HOLD", today);
      await tx.insert(stockHolds).values({ ...input, id, number, valueBdt, date: today, createdBy: user.id });
      await tx.insert(postingKeys).values({ ...key, resourceId: id });
      await audit(tx, user.id, "Partial stock hold placed", "Stock Hold", id, { number, batchId: batch.id, quantity: input.quantity, condition: input.condition, reason: input.reason });
      return id;
    });
    res.status(201).json({ success: true, data: { id }, message: "Stock is held immediately; physical units and cost are unchanged" });
  });
  router.get("/inventory/holds/:id/releases", async (req, res) => {
    const user = identity(res).user; assertAllowed(hasEffectivePermission(user, "inventory")); const q = releasePageInput.parse(req.query);
    res.json({ success: true, data: await ctx.db.transaction((tx) => releaseList(tx, String(req.params.id), user, q.page), { isolationLevel: "repeatable read", accessMode: "read only" }), message: "Inspected stock release requests loaded" });
  });
  router.post("/inventory/holds/:id/releases", async (req, res) => {
    const actor = identity(res); const input = holdReleaseInput.parse(req.body); const holdId = String(req.params.id); const key = postingIdentity(req, `${actor.user.id}:stock-release:${holdId}`, input);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "inventory", "post"); const prior = await lockPosting(tx, key); if (prior) return prior;
      const [hold] = await tx.select().from(stockHolds).where(eq(stockHolds.id, holdId)); if (!hold) throw new HttpError(404, "Stock hold not found.");
      await lockBatch(tx, hold.batchId);
      const [{ available }] = (await tx.execute<{ available: string }>(sql`select erp_private.stock_hold_outstanding(${hold.id},${businessDate()}::date)::text available`)).rows;
      holdReviewValue(hold.valueBdt, available, input.quantity);
      const valueBdt = holdReviewValue(hold.valueBdt, hold.quantity, input.quantity); const id = newId("release"); const number = await nextNumber(tx, "REL", businessDate());
      const payloadHash = digest(JSON.stringify({ id, holdId, ...input, valueBdt }));
      const approvalId = await createApproval(tx, user, { domain: "Stock", resourceType: "Stock Hold Release", resourceId: id, reference: number, amountBdt: valueBdt, payloadHash, context: { holdId, holdNumber: hold.number, batchId: hold.batchId, quantity: input.quantity } });
      await tx.insert(stockHoldReleases).values({ ...input, id, number, holdId, valueBdt, payloadHash, approvalId, createdBy: user.id });
      await tx.insert(postingKeys).values({ ...key, resourceId: id });
      return id;
    });
    res.status(201).json({ success: true, data: { id }, message: "Release submitted for inspection review and approval" });
  });
  router.post("/inventory/releases/:id/post", async (req, res) => {
    const actor = identity(res); const input = holdPostInput.parse(req.body);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "inventory", "post");
      const [ref] = await tx.select({ release: stockHoldReleases, hold: stockHolds }).from(stockHoldReleases).innerJoin(stockHolds, eq(stockHoldReleases.holdId, stockHolds.id)).where(eq(stockHoldReleases.id, String(req.params.id)));
      if (!ref) throw new HttpError(404, "Release not found.");
      await lockBatch(tx, ref.hold.batchId);
      const [release] = await tx.select().from(stockHoldReleases).where(eq(stockHoldReleases.id, ref.release.id)).for("update");
      if (release.state === "Posted") return release.id;
      if (release.version !== input.version) throw new HttpError(409, "The release changed. Reload before posting.");
      const [{ remaining }] = (await tx.execute<{ remaining: string }>(sql`select erp_private.stock_hold_outstanding(${release.holdId},${businessDate()}::date)::text remaining`)).rows;
      holdReviewValue(ref.hold.valueBdt, remaining, release.quantity);
      await consumeApproval(tx, user, release.approvalId, { domain: "Stock", resourceType: "Stock Hold Release", resourceId: release.id, payloadHash: release.payloadHash });
      await tx.update(stockHoldReleases).set({ state: "Posted", version: release.version + 1, date: businessDate(), postedBy: user.id, postedAt: new Date() }).where(eq(stockHoldReleases.id, release.id));
      await audit(tx, user.id, "Inspected stock released", "Stock Hold Release", release.id, { holdId: release.holdId, quantity: release.quantity, reason: release.reason });
      return release.id;
    });
    res.json({ success: true, data: { id }, message: "Approved release posted; expiry rules still apply" });
  });
  return router;
}
