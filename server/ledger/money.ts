import { ledgerLineInput, type LedgerLineInput } from "../../src/domains/ledger/contracts.js";
import { D } from "../trading/money.js";
import { HttpError } from "../foundation/errors.js";
export function balancedLines(input: LedgerLineInput[]) {
  if (input.length < 2 || input.length > 100) throw new HttpError(422, "A journal requires 2-100 lines.");
  const lines = input.map((line) => ledgerLineInput.parse(line)); let debit = new D(0); let credit = new D(0);
  for (const line of lines) {
    const d = new D(line.debit); const c = new D(line.credit);
    if (!(d.gt(0) && c.isZero() || c.gt(0) && d.isZero())) throw new HttpError(422, "Each journal line needs exactly one positive debit or credit.");
    debit = debit.plus(d); credit = credit.plus(c);
  }
  if (!debit.eq(credit)) throw new HttpError(422, "Journal debits and credits must balance exactly to the poisha.");
  if (debit.lte(0) || debit.gte("1e22")) throw new HttpError(422, "Journal total exceeds supported financial precision.");
  return { lines: lines.map((line) => ({ ...line, debit: new D(line.debit).toFixed(2), credit: new D(line.credit).toFixed(2) })), totalBdt: debit.toFixed(2) };
}
