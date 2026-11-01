import { sql, type SQL } from "drizzle-orm";

// A condition reservation does not change physical units or stock cost journals.
export function heldAt(batch: SQL, date: SQL) {
  return sql`erp_private.stock_held_quantity(${batch},${date})`;
}
export function lastHoldDate(batch: SQL) {
  return sql`erp_private.stock_last_control_date(${batch})`;
}
export function effectiveCondition(batch: SQL, date: SQL) { return sql`erp_private.stock_effective_condition(${batch},${date})`; }
