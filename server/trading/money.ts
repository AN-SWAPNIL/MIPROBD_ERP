import { Decimal } from "decimal.js";

export const D = Decimal.clone({ precision: 48, rounding: Decimal.ROUND_HALF_UP });
export const money = (value: Decimal.Value) => new D(value).toFixed(2);
export const sum = (values: string[]) => values.reduce((total, value) => total.plus(value), new D(0));

// Allocate saved, rounded document/batch totals cumulatively; never multiply a display unit rate.
export function cumulativeShare(total: string, quantity: string, previousQuantity: string, previousValue: string, nextQuantity: string) {
  const count = new D(quantity); const next = new D(previousQuantity).plus(nextQuantity);
  if (count.lte(0) || new D(nextQuantity).lte(0) || next.gt(count) || new D(previousQuantity).lt(0)) throw new Error("Invalid cumulative allocation quantity.");
  return new D(total).mul(next).div(count).toDecimalPlaces(2).minus(previousValue).toFixed(2);
}

export function allocateOutstanding(amount: string, entries: { id: string; date: string; outstanding: string }[]) {
  let remaining = new D(amount);
  if (!remaining.isFinite() || remaining.lte(0)) throw new Error("Collection amount must be positive.");
  const allocations: { entryId: string; amount: string }[] = [];
  for (const entry of [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    if (remaining.lte(0)) break;
    const take = D.min(remaining, D.max(0, entry.outstanding));
    if (take.gt(0)) { allocations.push({ entryId: entry.id, amount: take.toFixed(2) }); remaining = remaining.minus(take); }
  }
  if (remaining.gt(0)) throw new Error("Collection exceeds the eligible outstanding receivables.");
  return allocations;
}
