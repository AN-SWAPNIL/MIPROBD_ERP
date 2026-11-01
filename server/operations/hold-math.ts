import { Decimal } from "decimal.js";
import { HttpError } from "../foundation/errors.js";

const D = Decimal.clone({ precision: 48, rounding: Decimal.ROUND_HALF_UP });
export function heldQuantity(holds: string, releases: string) {
  const remaining = new D(holds).minus(releases);
  if (!remaining.isFinite() || remaining.lt(0)) throw new HttpError(409, "Releases exceed the held quantity.");
  return remaining.toFixed(4);
}
export function saleableQuantity(onHand: string, held: string) {
  const result = new D(onHand).minus(held);
  if (!result.isFinite() || result.lt(0)) throw new HttpError(409, "Stock holds exceed physical on-hand quantity.");
  return result.toFixed(4);
}
export function holdReviewValue(value: string, physical: string, quantity: string) {
  const q = new D(quantity); const total = new D(physical);
  if (!q.isFinite() || q.lte(0) || total.lte(0) || q.gt(total)) throw new HttpError(422, "Hold/release quantity must be positive and within its saved source quantity.");
  return new D(value).mul(q).div(total).toFixed(2);
}
