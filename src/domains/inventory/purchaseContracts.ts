import { z } from "zod";
import { Decimal } from "decimal.js";
import { isDecimalInput } from "../../lib/decimalInput.js";
const Money = Decimal.clone({ precision: 48, rounding: Decimal.ROUND_HALF_UP });
const text = z.string().trim().min(1).max(200);
const decimal = (scale: number) => z.string().superRefine((value, ctx) => {
  if (!isDecimalInput(value, scale)) ctx.addIssue({ code: "custom", message: `Enter up to 12 whole digits and ${scale} decimal places, without scientific notation.` });
  else if (new Decimal(value).lte(0)) ctx.addIssue({ code: "custom", message: "Must be greater than zero." });
});
export const purchaseInput = z.object({
  supplierId: text, reference: text, receivedDate: z.iso.date(), currency: z.string().regex(/^[A-Z]{3}$/), exchangeRate: decimal(6), notes: z.string().trim().max(2000).default(""),
  lines: z.array(z.object({ productId: text, quantity: decimal(4), unitPrice: decimal(6), lotNumber: text, batchNumber: text, manufacturingDate: z.iso.date(), expiryDate: z.iso.date(), location: text }).strict()).min(1).max(100)
}).strict().superRefine((v, ctx) => {
  const batches = new Set<string>();
  v.lines.forEach((line, index) => {
    if (line.expiryDate <= line.manufacturingDate || line.expiryDate <= v.receivedDate) ctx.addIssue({ code: "custom", path: ["lines", index, "expiryDate"], message: "Expiry must be after manufacturing and receipt dates." });
    if (line.manufacturingDate > v.receivedDate) ctx.addIssue({ code: "custom", path: ["lines", index, "manufacturingDate"], message: "Manufacturing cannot be after receipt." });
    if (batches.has(line.batchNumber.toLowerCase())) ctx.addIssue({ code: "custom", path: ["lines", index, "batchNumber"], message: "Each line needs a unique batch number." });
    batches.add(line.batchNumber.toLowerCase());
  });
});
export const purchaseRecord = z.object({ id: z.string(), number: z.string(), supplierId: z.string(), supplierName: z.string(), reference: z.string(), receivedDate: z.string(), currency: z.string(), totalBdt: z.string().optional(), lineCount: z.number(), createdByName: z.string() });
export type PurchaseInput = z.infer<typeof purchaseInput>;
export function purchaseValuation(line: { quantity: string; unitPrice: string }, currency: string, exchangeRate: string) {
  const total = new Money(line.quantity).mul(line.unitPrice).mul(currency === "BDT" ? "1" : exchangeRate).toDecimalPlaces(2);
  if (total.lte(0) || total.gte("1e22")) throw new Error("Purchase line value must be at least BDT 0.01 and within supported precision.");
  const unitCost = total.div(line.quantity).toDecimalPlaces(10);
  if (unitCost.gte("1e18")) throw new Error("Purchase unit cost exceeds supported precision. Check the price and exchange rate.");
  return { totalBdt: total.toFixed(2), unitCostBdt: unitCost.toFixed(10) };
}
