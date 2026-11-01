import test from "node:test";
import assert from "node:assert/strict";
import { and, eq, sql } from "drizzle-orm";
import { approvalPolicies, approvalRequests, ledgerJournals } from "../../database/schema.js";
import { businessDate } from "../../src/lib/date.js";
import { hostedHarness } from "../testing/hosted.js";

test("hosted ledger: two independent API/database workers post one approved journal once", { skip: process.env.RUN_HOSTED_LEDGER_CONCURRENCY_TESTS !== "true", timeout: 180000 }, async (t) => {
  const h = await hostedHarness("glrace"); let policyId: string | undefined; let maker: Awaited<ReturnType<typeof h.employee>> | undefined;
  const chartIds: string[] = [];
  try {
    if ((await h.ctx.db.select().from(approvalPolicies).where(and(eq(approvalPolicies.domain, "Ledger"), eq(approvalPolicies.state, "Approved")))).length) { t.skip("An active company policy must not be replaced by a test"); return; }
    maker = await h.employee("Super Admin", ["view_sensitive_cost"]); const verifier = await h.employee("Super Admin", ["view_sensitive_cost"]); const approver = await h.employee("Super Admin", ["view_sensitive_cost"]);
    const today = businessDate(); const prefix = h.suffix.slice(0, 12);
    const debit = await h.expect("/ledger/accounts", maker.token, { code: `R-A-${prefix}`, name: `DEV TEST concurrency asset ${h.suffix}`, kind: "Asset" }, 201);
    chartIds.push(debit.id);
    const credit = await h.expect("/ledger/accounts", maker.token, { code: `R-E-${prefix}`, name: `DEV TEST concurrency equity ${h.suffix}`, kind: "Equity" }, 201);
    chartIds.push(credit.id);
    policyId = (await h.expect("/controls/policies", maker.token, { domain: "Ledger", name: `DEV TEST concurrency ${h.suffix}`, effectiveFrom: today, maximumAmountBdt: "1", verifierIds: [verifier.id], approverIds: [approver.id], independentVerifier: true, proofReference: "DEV TEST synthetic penny, not company funds" }, 201)).id;
    await h.expect(`/controls/policies/${policyId}/approve`, verifier.token, { version: 1, reason: "DEV TEST independent authority review" });
    const prepare = async (reverse: boolean) => {
      const journal = await h.expect("/ledger/journals", maker!.token, { date: today, reference: `DEV TEST concurrency ${reverse ? "offset" : "post"} ${h.suffix}`, proofReference: "DEV TEST only; compensation keeps the test chart at zero", description: "DEV TEST real database concurrency", type: "Adjustment", lines: [{ accountId: reverse ? credit.id : debit.id, debit: "0.01", credit: "0" }, { accountId: reverse ? debit.id : credit.id, debit: "0", credit: "0.01" }] }, 201);
      const submitted = await h.expect(`/ledger/journals/${journal.id}/submit`, maker!.token, { version: journal.version });
      let approval = (await h.ctx.db.select().from(approvalRequests).where(eq(approvalRequests.id, submitted.approvalId)))[0];
      await h.expect(`/controls/approvals/${approval.id}/verify`, verifier.token, { version: approval.version, reason: "DEV TEST independent verification" });
      approval = (await h.ctx.db.select().from(approvalRequests).where(eq(approvalRequests.id, approval.id)))[0];
      await h.expect(`/controls/approvals/${approval.id}/approve`, approver.token, { version: approval.version, reason: "DEV TEST final independent approval" });
      return submitted;
    };
    const journal = await prepare(false);
    const posts = await Promise.all([h.call(`/ledger/journals/${journal.id}/post`, maker.token, { version: journal.version }), h.call(`/ledger/journals/${journal.id}/post`, approver.token, { version: journal.version }, { instance: 1 })]);
    assert.deepEqual(posts.map((r) => r.status), [200, 200]);
    const [posted] = await h.ctx.db.select().from(ledgerJournals).where(eq(ledgerJournals.id, journal.id)); assert.equal(posted.version, 3);
    const [{ count }] = (await h.ctx.db.execute<{ count: number }>(sql`select count(*)::int count from erp_private.ledger_lines where journal_id=${journal.id}`)).rows; assert.equal(count, 2);
    const offset = await prepare(true); await h.expect(`/ledger/journals/${offset.id}/post`, maker.token, { version: offset.version });
    const balances = (await h.ctx.db.execute<{ balance: string }>(sql`select sum(l.debit-l.credit)::text balance from erp_private.ledger_lines l join erp_private.ledger_journals j on j.id=l.journal_id where j.state='Posted' and l.account_id in (${debit.id},${credit.id}) group by l.account_id`)).rows;
    assert.ok(balances.length === 2 && balances.every((r) => Number(r.balance) === 0));
  } finally {
    if (maker && policyId) { const [p] = await h.ctx.db.select().from(approvalPolicies).where(eq(approvalPolicies.id, policyId)); if (p?.state === "Approved") await h.expect(`/controls/policies/${p.id}/retire`, maker.token, { version: p.version, reason: "DEV TEST concurrency authority cleanup" }); }
    if (maker) for (const id of chartIds) await h.expect(`/ledger/accounts/${id}/archive`, maker.token, {});
    await h.close();
  }
});
