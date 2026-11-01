import { z } from "zod";
import { decimalInput } from "../operations/contracts.js";
import { D as MoneyDecimal } from "./money.js";

const text = z.string().trim().max(200);
const note = z.string().trim().max(3000);
const optionalDate = z.union([z.iso.date(), z.literal("")]).optional();
export const versionInput = z.number().int().positive();
export const customerInput = z.object({
  name: text.min(1), type: z.enum(["Hospital", "Clinic", "Dealer", "Pharmacy", "Other"]),
  contactPerson: text.default(""), phone: text.default(""), email: z.union([z.email(), z.literal("")]).default(""),
  address: note.default(""), territory: text.default(""), assignedSalesUserId: text.optional(),
  paymentTerms: note.default(""), creditLimit: decimalInput(2).default("0"), active: z.boolean().default(true)
});
export const salesLineInput = z.object({ productId: text.min(1), quantity: decimalInput(4, true), unitPrice: decimalInput(2, true), discount: decimalInput(2).default("0") });
export const quotationInput = z.object({
  customerId: text.min(1), date: z.iso.date(), ownerId: text.optional(), validityDays: z.number().int().min(1).max(3650),
  paymentTerms: note.default(""), remarks: note.default(""),
  lines: z.array(salesLineInput).min(1).max(100).refine((lines) => new Set(lines.map((line) => line.productId)).size === lines.length, "Use each product variant once")
});
export const quotationUpdate = quotationInput.extend({ paymentTerms: quotationInput.shape.paymentTerms.removeDefault(), remarks: quotationInput.shape.remarks.removeDefault() }).partial().extend({ version: versionInput, status: z.enum(["Draft", "Sent", "Accepted", "Rejected"]).optional() });
export const orderInstructions = z.object({
  paymentConditions: note.optional(), deliveryInstruction: note.optional(), paymentConfirmation: note.optional(), paymentReference: text.optional(), paymentDate: optionalDate,
  requestedDeliveryDate: optionalDate, orderReceivedByName: text.optional(), orderReceivedByDesignation: text.optional(), orderGivenBy: text.optional(),
  headOfSalesSignoff: text.optional(), coeSignoff: text.optional(), mdSignoff: text.optional()
});
export const convertInput = orderInstructions.extend({ version: versionInput });
export const orderUpdate = orderInstructions.extend({ version: versionInput });

export const deliveryInput = z.object({ orderId: text.min(1), date: z.iso.date(), remarks: note.default(""), receiverName: text.default(""), overrideReason: note.default(""),
  lines: z.array(z.object({ productId: text.min(1), quantity: decimalInput(4, true), batchId: text.optional() })).min(1).max(100)
    .refine((lines) => new Set(lines.map((line) => line.productId)).size === lines.length, "Use each product once per delivery") });
export const invoiceInput = z.object({ orderId: text.optional(), deliveryIds: z.array(text.min(1)).min(1).max(100).refine((ids) => new Set(ids).size === ids.length, "Select each challan once"), date: z.iso.date(), remarks: note.default("") });
export const invoiceUpdate = z.object({ version: versionInput, date: z.iso.date().optional(), remarks: note.optional() });
export const reversalInput = z.object({ reason: note.min(5) });
export const collectionInput = z.object({ customerId: text.min(1), orderId: text.optional(), invoiceId: text.optional(), date: z.iso.date(), amount: decimalInput(2, true),
  paymentMode: z.enum(["Cash", "bKash", "Bank Transfer", "Cheque"]), accountId: text.min(1), referenceNumber: text.default(""), remarks: note.default("")
}).refine((value) => value.paymentMode === "Cash" || Boolean(value.referenceNumber), "Non-cash receipts require a payment reference");
export const accountInput = z.object({ name: text.min(1), type: z.enum(["Cash", "Bank", "Mobile Banking"]), accountNumber: text.default(""), active: z.boolean().default(true), balance: decimalInput(2).default("0"), date: z.iso.date().optional() });

export function calculateSalesLine(input: z.infer<typeof salesLineInput>) {
  const gross = new MoneyDecimal(input.quantity).mul(input.unitPrice).toDecimalPlaces(2);
  const discount = new MoneyDecimal(input.discount);
  if (discount.gt(gross)) throw new Error("Discount cannot exceed the rounded gross line amount.");
  if (gross.gte("1e22")) throw new Error("Sales line exceeds supported money precision.");
  return { quantity: new MoneyDecimal(input.quantity).toFixed(4), unitPrice: new MoneyDecimal(input.unitPrice).toFixed(2), discount: discount.toFixed(2), lineTotal: gross.minus(discount).toFixed(2) };
}

export function salesTotals(lines: ReturnType<typeof calculateSalesLine>[]) {
  const total = lines.reduce((sum, line) => sum.plus(line.lineTotal), new MoneyDecimal(0));
  const discount = lines.reduce((sum, line) => sum.plus(line.discount), new MoneyDecimal(0));
  if (total.plus(discount).gte("1e22")) throw new Error("Document total exceeds supported money precision.");
  return { subtotal: total.plus(discount).toFixed(2), discountTotal: discount.toFixed(2), total: total.toFixed(2) };
}
