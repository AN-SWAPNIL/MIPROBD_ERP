import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { approvalPolicies, approvalRequests, postingKeys, stockControls } from "../../database/schema.js";
import { stockControlInput, stockControlPageInput, stockControlRevisionInput, stockControlVersionInput } from "../../src/domains/inventory/controlContracts.js";
import { hasCapability, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { createApproval } from "../controls/service.js";
import { identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { lockPosting } from "../trading/locks.js";
import { lockActor, postingIdentity } from "./common.js";
import { draftStockControl } from "./control-drafts.js";
import { assertFreshControl, loadStockControl, readStockControl } from "./control-records.js";
import { postStockControl } from "./control-posting.js";
import { lockStockBatches } from "./stock-locks.js";

export function createStockControlRouter(ctx: Context) {
  const router = Router();
  router.get("/inventory/controls", async (req, res) => {
    const user = identity(res).user; assertAllowed(hasEffectivePermission(user, "inventory")); const q = stockControlPageInput.parse(req.query);
    const term = `%${q.search.replace(/[\\%_]/g, "\\$&")}%`;
    const data = await ctx.db.transaction(async (tx) => {
      const base = sql`select c.id,c.number,c.kind,to_char(c.count_date,'YYYY-MM-DD') "countDate",c.state,c.version,c.created_by "createdBy",e.name "createdByName",to_char(c.posted_date,'YYYY-MM-DD') "postedDate",(select count(*)::int from erp_private.stock_control_lines l where l.control_id=c.id) "lineCount" ${hasCapability(user, "view_sensitive_cost") ? sql`,c.total_bdt::text "totalBdt"` : sql``}
        from erp_private.stock_controls c join erp_private.employees e on e.id=c.created_by where concat_ws(' ',c.number,c.kind,c.reason,e.name) ilike ${term} ${q.kind ? sql`and c.kind=${q.kind}` : sql``} ${q.holdId ? sql`and exists(select 1 from erp_private.stock_control_lines l where l.control_id=c.id and l.hold_id=${q.holdId})` : sql``}`;
      const [{ total }] = (await tx.execute<{ total: number }>(sql`with scoped as (${base}) select count(*)::int total from scoped`)).rows;
      const rows = (await tx.execute(sql`with scoped as (${base}) select * from scoped order by "countDate" desc,id limit 25 offset ${(q.page - 1) * 25}`)).rows;
      return { rows, total, page: q.page, pageSize: 25 };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Paged stock control register loaded" });
  });
  router.get("/inventory/controls/:id", async (req, res) => {
    const user = identity(res).user; assertAllowed(hasEffectivePermission(user, "inventory"));
    res.json({ success: true, data: await ctx.db.transaction((tx) => readStockControl(tx, String(req.params.id), user), { isolationLevel: "repeatable read", accessMode: "read only" }), message: "Source stock control loaded" });
  });
  for (const revise of [false, true]) router.post(revise ? "/inventory/controls/:id/revise" : "/inventory/controls", async (req, res) => {
    const actor = identity(res); const input = revise ? stockControlRevisionInput.parse(req.body) : stockControlInput.parse(req.body);
    const parentId = String((req.params as Record<string, string>).id ?? "");
    const revisionVersion = revise ? stockControlVersionInput.parse({ version: req.body.version }).version : undefined;
    const key = postingIdentity(req, `${actor.user.id}:stock-control:${revise ? parentId : "new"}`, input);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "inventory", "post"); const prior = await lockPosting(tx, key); if (prior) return prior;
      const previous = revise ? await loadStockControl(tx, parentId) : undefined;
      if (previous) {
        await lockStockBatches(tx, [...new Set([...previous.lines.map((l) => l.batchId), ...input.lines.map((l) => l.batchId)])]);
        const [row] = await tx.select().from(stockControls).where(eq(stockControls.id, previous.row.id)).for("update"); previous.row = row;
        if (row.version !== revisionVersion || ["Posted", "Superseded"].includes(row.state) || row.kind !== input.kind) throw new HttpError(409, "This version cannot be revised. Reload the document.");
        if (row.approvalId) {
          const [approval] = await tx.select({ request: approvalRequests, policy: approvalPolicies }).from(approvalRequests).innerJoin(approvalPolicies, eq(approvalRequests.policyId, approvalPolicies.id)).where(eq(approvalRequests.id, row.approvalId));
          if (approval.request.state !== "Rejected" && approval.policy.state === "Approved") throw new HttpError(409, "Reject the pending approval before preparing a replacement snapshot.");
        }
        await tx.update(stockControls).set({ state: "Superseded", version: row.version + 1 }).where(eq(stockControls.id, row.id));
      }
      const id = await draftStockControl(tx, user, input, previous); await tx.insert(postingKeys).values({ ...key, resourceId: id }); return id;
    });
    res.status(201).json({ success: true, data: await ctx.db.transaction((tx) => readStockControl(tx, id, actor.user)), message: "Immutable source snapshot saved as a draft" });
  });
  router.post("/inventory/controls/:id/submit", async (req, res) => {
    const actor = identity(res); const input = stockControlVersionInput.parse(req.body); const id = String(req.params.id);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "inventory", "post"); const record = await loadStockControl(tx, id); await lockStockBatches(tx, record.lines.map((l) => l.batchId));
      const [row] = await tx.select().from(stockControls).where(eq(stockControls.id, id)).for("update");
      if (row.state !== "Draft" || row.version !== input.version) throw new HttpError(409, "Submit only the current draft version.");
      await assertFreshControl(tx, { row, lines: record.lines });
      const approvalId = await createApproval(tx, user, { domain: "Stock", resourceType: "Stock Control", resourceId: id, reference: row.number, amountBdt: row.totalBdt!, payloadHash: row.payloadHash, context: { excludedActorIds: row.preparerIds, kind: row.kind } });
      await tx.update(stockControls).set({ state: "Submitted", version: row.version + 1, approvalId }).where(eq(stockControls.id, id));
    });
    res.json({ success: true, data: await ctx.db.transaction((tx) => readStockControl(tx, id, actor.user)), message: "Stock control submitted for independent verification and approval" });
  });
  router.post("/inventory/controls/:id/post", async (req, res) => {
    const actor = identity(res); const input = stockControlVersionInput.parse(req.body);
    const id = await ctx.db.transaction(async (tx) => postStockControl(tx, await lockActor(tx, actor, "inventory", "post"), String(req.params.id), input.version));
    res.json({ success: true, data: await ctx.db.transaction((tx) => readStockControl(tx, id, actor.user)), message: "Approved stock, condition and accounting source posted atomically" });
  });
  return router;
}
