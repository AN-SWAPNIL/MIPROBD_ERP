import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Context } from "../foundation/context.js";
import { HttpError } from "../foundation/errors.js";
import { requireRestrictedRuntime } from "../foundation/database-security.js";
import { processInvitation } from "../foundation/invitation-outbox.js";
import { reconciliationHealthy, reconcileSources, recordOperationalCheck } from "./reconciliation.js";

export function authorizeScheduledJob(req: Pick<Request, "get">, env: NodeJS.ProcessEnv = process.env) {
  const secret = env.CRON_SECRET;
  if (!secret || secret.length < 32 || secret.length > 512) throw new HttpError(503, "Scheduled-job credentials are not configured.");
  const supplied = req.get("authorization") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (supplied.length > 1024 || !timingSafeEqual(digest(supplied), digest(`Bearer ${secret}`))) throw new HttpError(401, "Scheduled-job authorization required.");
  if (env.ERP_SCHEDULED_JOBS_ENABLED !== "true") throw new HttpError(503, "Scheduled jobs are disabled for this environment.");
}

export function createMaintenanceRouter(ctx: Context, process = processInvitation) {
  const router = Router();
  router.use("/jobs", (req, _res, next) => {
    authorizeScheduledJob(req);
    if (req.method !== "GET") throw new HttpError(405, "Use GET for scheduled jobs.");
    z.object({}).strict().parse(req.query);
    next();
  });
  router.get("/jobs/invitations", async (_req, res) => {
    await requireRestrictedRuntime(ctx);
    // Existing database leases, authority rechecks and bounded retries own delivery safety.
    // One provider call per tick fits the serverless deadline; retries use the durable outbox.
    const result = await process(ctx);
    const data = { processed: result ? 1 : 0, providerAccepted: result?.invitationSent ?? false };
    await recordOperationalCheck(ctx, "Invitations", !result || data.providerAccepted, data);
    console.info(JSON.stringify({ event: "invitation_job", requestId: res.get("X-Request-Id"), ...data }));
    res.json({ success: true, data, message: "Invitation tick completed; provider acceptance is not inbox confirmation" });
  });
  router.get("/jobs/health", async (_req, res) => {
    await requireRestrictedRuntime(ctx);
    const data = await ctx.db.transaction(async (tx) => {
      const [row] = (await tx.execute<{ review: number; overdue: number; expiredLeases: number }>(sql`select
        count(*) filter(where state='Review')::int review,
        count(*) filter(where state='Queued' and next_attempt_at < now()-interval '1 hour')::int overdue,
        count(*) filter(where state='Processing' and lease_until < now()-interval '5 minutes')::int "expiredLeases"
        from erp_private.invitation_jobs`)).rows;
      return row;
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    const healthy = Object.values(data).every((count) => count === 0);
    await recordOperationalCheck(ctx, "Queue Health", healthy, data);
    console.info(JSON.stringify({ event: "operational_health", requestId: res.get("X-Request-Id"), healthy, ...data }));
    res.status(healthy ? 200 : 503).json({ success: healthy, data, message: healthy ? "Operational queue healthy" : "Invitation delivery needs administrator review" });
  });
  router.get("/jobs/reconciliation", async (_req, res) => {
    await requireRestrictedRuntime(ctx);
    const data = await reconcileSources(ctx), healthy = reconciliationHealthy(data);
    await recordOperationalCheck(ctx, "Source Reconciliation", healthy, data);
    console.info(JSON.stringify({ event: "source_reconciliation", requestId: res.get("X-Request-Id"), healthy, ...data }));
    res.status(healthy ? 200 : 503).json({ success: healthy, data, message: healthy ? "Saved stock, cash and ledger sources reconcile" : "Source reconciliation needs administrator review; no records were repaired automatically" });
  });
  return router;
}
