import { eq, inArray, sql } from "drizzle-orm";
import { products, stockBatches } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { StockControlSnapshot } from "../../src/domains/inventory/controlContracts.js";
import { HttpError } from "../foundation/errors.js";

export async function lockStockBatches(tx: Transaction, ids: string[]) {
  const refs = await tx.select({ id: stockBatches.id, productId: stockBatches.productId }).from(stockBatches).where(inArray(stockBatches.id, ids)).orderBy(stockBatches.productId, stockBatches.id);
  if (refs.length !== new Set(ids).size) throw new HttpError(404, "A selected stock batch no longer exists.");
  for (const productId of [...new Set(refs.map((r) => r.productId))]) await tx.select({ id: products.id }).from(products).where(eq(products.id, productId)).for("update");
  const rows: (typeof stockBatches.$inferSelect & { condition: StockControlSnapshot["condition"] })[] = [];
  for (const ref of refs) {
    const [row] = await tx.select({ batch: stockBatches, condition: sql<StockControlSnapshot["condition"]>`erp_private.stock_effective_condition(${stockBatches.id},(current_timestamp at time zone 'Asia/Dhaka')::date)` }).from(stockBatches).where(eq(stockBatches.id, ref.id)).for("update");
    rows.push({ ...row.batch, condition: row.condition });
  }
  return rows;
}
