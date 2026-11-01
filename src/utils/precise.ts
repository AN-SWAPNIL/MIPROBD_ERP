import { Decimal } from "decimal.js";

function formattedDecimal(value: string | number, scale: number, trim: boolean) {
  if (value === "Restricted") return "Restricted";
  const amount = new Decimal(value || 0);
  if (!amount.isFinite()) return "-";
  const [whole, fractional] = amount.abs().toFixed(scale).split(".");
  const fraction = trim ? fractional.replace(/0+$/, "") : fractional;
  return `${amount.isNegative() ? "-" : ""}${new Intl.NumberFormat("en-BD").format(BigInt(whole))}${fraction ? "." + fraction : ""}`;
}

export const formatMoney = (value: string | number, currency = "BDT") => value === "Restricted" ? "Restricted" : `${currency} ${formattedDecimal(value, 2, false)}`;
export const formatQuantity = (value: string | number) => formattedDecimal(value, 4, true);
