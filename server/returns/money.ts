import { cumulativeShare, D } from "../trading/money.js";

export function returnedShare(source: { quantity: string; costBdt: string; creditBdt: string; discountBdt: string }, prior: { quantity: string; costBdt: string; creditBdt: string; discountBdt: string }, quantity: string) {
  if (!new D(quantity).isFinite() || new D(quantity).lte(0)) throw new Error("Return quantity must be positive");
  return { costBdt: cumulativeShare(source.costBdt, source.quantity, prior.quantity, prior.costBdt, quantity), creditBdt: cumulativeShare(source.creditBdt, source.quantity, prior.quantity, prior.creditBdt, quantity), discountBdt: cumulativeShare(source.discountBdt, source.quantity, prior.quantity, prior.discountBdt, quantity) };
}
export function remainingReturnCredit(credit: string, applied: string, settled: string, customerDue: string) {
  const available = new D(credit).minus(applied).minus(settled);
  if (available.lt(0)) throw new Error("Return credit is over-settled");
  return { availableCreditBdt: available.toFixed(2), refundableBdt: D.min(available, D.max(0, new D(customerDue).negated())).toFixed(2) };
}
