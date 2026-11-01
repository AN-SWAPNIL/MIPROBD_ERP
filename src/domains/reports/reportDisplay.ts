import { Decimal } from "decimal.js";
import type { PersistentColumn } from "./persistentContracts.js";
import { formatMoney, formatQuantity } from "../../utils/precise.js";

export function reportDisplay(value: string, format: PersistentColumn["format"]) {
  if (value === "" || value === undefined) return "-";
  if (format === "text") return value;
  if (!/^-?\d+(\.\d+)?$/.test(value)) return value;
  if (format === "money") return formatMoney(value);
  if (format === "quantity") return formatQuantity(value);
  return new Intl.NumberFormat("en-BD").format(BigInt(new Decimal(value).toFixed(0)));
}
