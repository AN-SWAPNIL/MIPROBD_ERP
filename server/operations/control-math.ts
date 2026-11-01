import { D, cumulativeShare } from "../trading/money.js";
import { HttpError } from "../foundation/errors.js";

export function stockVariance(input: { originalQuantity: string; originalValueBdt: string; bookQuantity: string; bookValueBdt: string; countedQuantity: string; unitCostBdt?: string | null }) {
  const book = new D(input.bookQuantity); const counted = new D(input.countedQuantity);
  if (!book.isFinite() || !counted.isFinite() || book.lt(0) || counted.lt(0)) throw new HttpError(422, "Physical quantities must be finite and non-negative.");
  const delta = counted.minus(book); let valueBdt: string | null = "0.00";
  if (delta.lt(0)) valueBdt = cumulativeShare(input.originalValueBdt, input.originalQuantity, new D(input.originalQuantity).minus(book).toString(), new D(input.originalValueBdt).minus(input.bookValueBdt).toString(), delta.abs().toString());
  else if (delta.gt(0)) {
    if (input.unitCostBdt === undefined || input.unitCostBdt === null) valueBdt = null;
    else {
      const cost = new D(input.unitCostBdt); if (!cost.isFinite() || cost.lt(0)) throw new HttpError(422, "Surplus stock needs an explicitly evidenced non-negative unit cost.");
      valueBdt = delta.mul(cost).toFixed(2);
    }
  }
  if (valueBdt && !/^(0|[1-9]\d{0,21})\.\d{2}$/.test(valueBdt)) throw new HttpError(422, "Stock variance value exceeds supported precision.");
  return { deltaQuantity: delta.toFixed(4), valueBdt };
}
