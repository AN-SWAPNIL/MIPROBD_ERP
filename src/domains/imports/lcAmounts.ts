import { Decimal } from "decimal.js";
import { isDecimalInput } from "../../lib/decimalInput.js";

const Money = Decimal.clone({ precision: 48, rounding: Decimal.ROUND_HALF_UP });
export const lcAmountLimit = "1000000000000";
type LcAmountFields = { lcAmount?: string; lcBankAmount?: string; lcOtherAmount?: string };

export function sumLcAmounts(bank: string, other: string) {
  if (!isDecimalInput(bank || "0", 2) || !isDecimalInput(other || "0", 2)) throw new Error("Enter LC amounts with up to two decimal places and without scientific notation.");
  return new Money(bank || "0").plus(other || "0").toFixed(2);
}

export function withLcAmountTotal<T extends { paymentMode?: string } & LcAmountFields>(record: T): T & LcAmountFields {
  if (record.paymentMode !== "LC" || record.lcBankAmount === undefined && record.lcOtherAmount === undefined) return record;
  return { ...record, lcBankAmount: new Money(record.lcBankAmount ?? "0").toFixed(2), lcOtherAmount: new Money(record.lcOtherAmount ?? "0").toFixed(2), lcAmount: sumLcAmounts(record.lcBankAmount ?? "0", record.lcOtherAmount ?? "0") };
}
