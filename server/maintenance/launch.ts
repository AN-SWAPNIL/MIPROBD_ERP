import { Router } from "express";
import { sql } from "drizzle-orm";
import { controlDomains } from "../../src/domains/controls/contracts.js";
import type { LaunchCheck } from "../../src/domains/settings/launchContracts.js";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { businessDate } from "../../src/lib/date.js";
import { identity, type Context } from "../foundation/context.js";
import { assertAllowed } from "../foundation/errors.js";

export function createLaunchRouter(ctx: Context) {
  const router = Router();
  router.get("/system/launch-checks", async (_req, res) => {
    const actor = identity(res).user;
    assertAllowed(actor.role === "Super Admin" && hasEffectivePermission(actor, "settings"));
    const data = await ctx.db.transaction(async (tx) => {
      const today = businessDate();
      const [row] = (await tx.execute<{ mappings: number; samples: number; invitationReviews: number; privacy: boolean }>(sql`select
        (select count(*)::int from erp_private.ledger_configurations where state='Approved' and data->>'effectiveFrom'<=${today}) mappings,
        ((select count(*) from erp_private.products where name ilike 'DEV TEST %')+(select count(*) from erp_private.customers where name ilike 'DEV TEST %')+(select count(*) from erp_private.suppliers where name ilike 'DEV TEST %'))::int samples,
        (select count(*)::int from erp_private.invitation_jobs where state='Review') "invitationReviews",
        coalesce((select (data->>'privacyApproved')::boolean from erp_private.field_visit_policies where id='company'),false) privacy`)).rows;
      const policies = (await tx.execute<{ domain: string }>(sql`select domain from erp_private.approval_policies where state='Approved' and data->>'effectiveFrom'<=${today}`)).rows.map((p) => p.domain);
      const operations = (await tx.execute<{ operation: string; status: string; createdAt: Date }>(sql`select distinct on(operation) operation,status,created_at "createdAt" from erp_private.operational_checks order by operation,created_at desc,id desc`)).rows;
      const recent = (name: string, minutes: number) => operations.some(r => r.operation === name && r.status === "Passed" && Date.now() - new Date(r.createdAt).getTime() <= minutes * 60000);
      const workerObserved = recent("Invitations", 20) && recent("Queue Health", 45);
      const reconciliationObserved = recent("Source Reconciliation", 26 * 60);
      const missing = controlDomains.filter((domain) => !policies.includes(domain));
      const jobsReady = process.env.ERP_SCHEDULED_JOBS_ENABLED === "true" && (process.env.CRON_SECRET?.length ?? 0) >= 32;
      const checks: LaunchCheck[] = [
        { id: "ledger", title: "Approved company ledger", status: row.mappings === 1 ? "Ready" : "Blocked", detail: row.mappings === 1 ? "An approved mapping covers today. Opening/control reconciliation still requires review." : "Super Admin must configure and approve the company chart and cash/bank mappings.", path: "/backend/accounts/ledger" },
        { id: "authorities", title: "Named approval authorities", status: missing.length ? "Blocked" : "Ready", detail: missing.length ? `No effective approved policy: ${missing.join(", ")}.` : "Policies cover each connected control domain; named people and limits still need business acceptance.", path: "/backend/settings/approvals" },
        { id: "dataset", title: "Clean company environment", status: row.samples ? "Blocked" : "Review", detail: row.samples ? `${row.samples} explicitly test-labelled product/customer/supplier records exist. Preserve development history and use an isolated UAT/production dataset.` : "No known DEV TEST master labels were found. This does not certify record provenance or production isolation." },
        { id: "invitations", title: "Scheduled invitation delivery", status: jobsReady && workerObserved && !row.invitationReviews ? "Ready" : "Blocked", detail: row.invitationReviews ? `${row.invitationReviews} invitation jobs require review.` : jobsReady && workerObserved ? "Successful worker and queue-health runs were recorded recently. SMTP and actual inbox/link acceptance remain separate checks." : jobsReady ? "Credentials are configured, but recent successful worker/health runs are missing or stale. Check the external scheduler." : "Configure a strong server-only CRON_SECRET and enable scheduled jobs only in the intended environment.", path: "/backend/employees/invitations" },
        { id: "reconciliation", title: "Daily source reconciliation", status: reconciliationObserved ? "Ready" : "Blocked", detail: reconciliationObserved ? "A recent saved-source check found no stock quantity/value, posted GL, approval-history, reservation or negative-cash mismatch. This is not certification of company opening figures." : "No successful source reconciliation was recorded in the last 26 hours. Run the authenticated daily reconciliation job; failures do not repair company records automatically." },
        { id: "field", title: "Field check-in privacy", status: row.privacy ? "Review" : "Blocked", detail: row.privacy ? "Privacy approval is recorded. Test actual phones, site pins, accuracy and retention handling before rollout." : "Production check-ins are blocked until the company records its privacy/retention decision. Photos remain optional.", path: "/backend/sales?view=marketing" },
        { id: "recovery", title: "Recovery and security acceptance", status: "Review", detail: "Verify database plus actual private file restoration, offsite recovery, exposed-credential rotation and account ownership. A successful health endpoint is not a recovery certificate." },
        { id: "business", title: "Production acceptance", status: "Review", detail: "Review the remaining engineering register, source corrections, company openings, financial reconciliation, device/printing checks and UAT. These automatic checks do not certify complete production readiness.", path: "/backend/settings/opening" }
      ];
      return { checkedAt: new Date().toISOString(), productionCertified: false as const, checks };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Read-only launch checks; no company settings changed" });
  });
  return router;
}
