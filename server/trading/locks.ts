import { eq, sql } from "drizzle-orm";
import { salesOrders } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import { businessDate } from "../../src/lib/date.js";
import { HttpError } from "../foundation/errors.js";
import { postingIdentity, previousPosting } from "../operations/common.js";
import { assertSalesOwner, lockCustomer } from "./records.js";

export async function lockPosting(tx: Transaction, key: ReturnType<typeof postingIdentity>) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key.id}, 0))`);
  return previousPosting(tx, key);
}

// All sales postings acquire customer before order, then child documents, products/batches and account.
export async function lockOrder(tx: Transaction, id: string, user: User) {
  const [reference] = await tx.select({ customerId: salesOrders.customerId }).from(salesOrders).where(eq(salesOrders.id, id));
  if (!reference) throw new HttpError(404, "Order not found.");
  const customer = await lockCustomer(tx, reference.customerId, user);
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, id)).for("update");
  if (!order) throw new HttpError(404, "Order not found.");
  assertSalesOwner(user, order.ownerId);
  return { order, customer };
}

export function checkPostingDate(date: string, minimum?: string) {
  if (date > businessDate()) throw new HttpError(422, "Future-dated postings are not allowed.");
  if (minimum && date < minimum) throw new HttpError(422, `Posting date cannot be before ${minimum}.`);
}
