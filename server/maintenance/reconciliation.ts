import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Context } from "../foundation/context.js";
import { operationalChecks } from "../../database/schema.js";

const count = z.number().int().nonnegative();
export const reconciliationSchema = z.object({ stockMismatches: count, unbalancedJournals: count, invalidSourceLinks: count, approvalHistoryGaps: count, invalidHeldQuantities: count, negativeCashAccounts: count }).strict();
export const reconciliationHealthy = (value: unknown) => Object.values(reconciliationSchema.parse(value)).every(n => n === 0);

export async function recordOperationalCheck(ctx: Context, operation: typeof operationalChecks.$inferInsert.operation, healthy: boolean, summary: Record<string, number | boolean>) {
  await ctx.db.insert(operationalChecks).values({ operation, status: healthy ? "Passed" : "Failed", summary });
}

export async function reconcileSources(ctx: Context) {
  return ctx.db.transaction(async tx => {
    const [row] = (await tx.execute(sql`with movements as (
      select batch_id,sum(quantity_delta) quantity,sum(value_delta_bdt) value from erp_private.stock_movements group by batch_id
    ), held as (
      select batch_id,sum(erp_private.stock_hold_outstanding(id,(current_timestamp at time zone 'Asia/Dhaka')::date)) quantity from erp_private.stock_holds group by batch_id
    ), cash as (
      select account_id,sum(case when direction='In' then amount else -amount end) balance from erp_private.account_transactions group by account_id
    ) select
      (select count(*)::int from erp_private.stock_batches b left join movements m on m.batch_id=b.id where b.quantity_available<>coalesce(m.quantity,0) or b.available_value_bdt<>coalesce(m.value,0)) "stockMismatches",
      (select count(*)::int from erp_private.ledger_journals j where j.state='Posted' and ((select count(*) from erp_private.ledger_lines l where l.journal_id=j.id)<2 or j.total_bdt<>(select coalesce(sum(l.debit),0) from erp_private.ledger_lines l where l.journal_id=j.id) or j.total_bdt<>(select coalesce(sum(l.credit),0) from erp_private.ledger_lines l where l.journal_id=j.id))) "unbalancedJournals",
      (select count(*)::int from erp_private.ledger_source_events e left join erp_private.ledger_journals j on j.id=e.journal_id where e.state='Posted' and (j.id is null or j.state<>'Posted' or j.source_key is distinct from e.source_key or j.configuration_id is distinct from e.configuration_id)) "invalidSourceLinks",
      (select count(*)::int from erp_private.approval_requests r where not exists(select 1 from erp_private.approval_events e where e.approval_id=r.id and e.version=r.version and e.action=r.state)) "approvalHistoryGaps",
      (select count(*)::int from held h join erp_private.stock_batches b on b.id=h.batch_id where h.quantity<0 or h.quantity>b.quantity_available) "invalidHeldQuantities",
      (select count(*)::int from cash where balance<0) "negativeCashAccounts"`)).rows;
    return reconciliationSchema.parse(row);
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
