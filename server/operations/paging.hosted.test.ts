import test from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { hostedHarness } from "../testing/hosted.js";
import { batchPageSchema, inventorySummarySchema, movementPageSchema, stockPageSchema } from "../../src/domains/inventory/pageContracts.js";
test("hosted inventory: paging, full aggregates, FIFO scope and sensitive-field authorization", { skip: process.env.RUN_HOSTED_UPDATE13_TESTS !== "true", timeout: 180000 }, async () => {
  const h = await hostedHarness("paging");
  try {
    const admin = await h.employee("Super Admin", ["view_sensitive_cost"]); const warehouse = await h.employee("Warehouse Manager"); const sales = await h.employee("Sales Executive");
    for (const [kind, schema] of [["stock", stockPageSchema], ["batches", batchPageSchema], ["movements", movementPageSchema]] as const) {
      const first = schema.parse(await h.expect(`/inventory/${kind}/page?pageSize=1`, admin.token));
      assert.ok(first.rows.length <= 1); assert.equal(first.pageSize, 1);
      if (first.total > 1) { const next = schema.parse(await h.expect(`/inventory/${kind}/page?pageSize=1&page=2`, admin.token)); assert.equal(next.rows.length, 1); assert.notDeepEqual(first.rows, next.rows); }
      const empty = schema.parse(await h.expect(`/inventory/${kind}/page?search=${h.suffix}`, admin.token)); assert.equal(empty.total, 0);
      assert.equal((await h.call(`/inventory/${kind}/page?pageSize=999999`, admin.token)).status, 422);
      assert.equal((await h.call(`/inventory/${kind}/page`, sales.token)).status, 403);
    }
    const summary = inventorySummarySchema.parse(await h.expect("/inventory/summary", admin.token));
    const [actual] = (await h.ctx.db.execute<{ products: number; batches: number; value: string }>(sql`select count(distinct product_id)::int products,count(*)::int batches,coalesce(sum(available_value_bdt),0)::text value from erp_private.stock_batches where quantity_available>0`)).rows;
    assert.equal(summary.batches, actual.batches); assert.equal(summary.products, actual.products); assert.equal(summary.inventoryValue, actual.value);
    const restricted = inventorySummarySchema.parse(await h.expect("/inventory/summary", warehouse.token)); assert.equal(restricted.inventoryValue, undefined);
    const batches = batchPageSchema.parse(await h.expect("/inventory/batches/page", warehouse.token)); assert.ok(batches.rows.every((row) => row.landedCostPerUnit === "0"));
    for (const row of batches.rows) if (row.isFifo) {
      const [older] = (await h.ctx.db.execute<{ count: number }>(sql`select count(*)::int count from erp_private.stock_batches where product_id=${row.productId} and quantity_available>0 and expiry_date>=current_date and received_date<=current_date and (received_date,id)<(${row.receivedDate}::date,${row.id})`)).rows; assert.equal(older.count, 0);
    }
  } finally { await h.close(); }
});
