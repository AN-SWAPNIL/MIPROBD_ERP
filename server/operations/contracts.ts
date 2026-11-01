import { z } from "zod";
import { Decimal } from "decimal.js";

export const decimalInput = (scale: number, positive = false) => z.string().regex(new RegExp(`^(0|[1-9]\\d{0,11})(\\.\\d{1,${scale}})?$`), "Enter a non-negative decimal string within the supported precision").refine((v) => !positive || new Decimal(v).gt(0), "Must be greater than zero");
const text = z.string().trim().max(200);
const optionalDate = z.union([z.iso.date(), z.literal("")]).optional();
const currency = z.string().regex(/^[A-Z]{3}$/);
export const productInput = z.object({ code: text.min(1), name: text.min(1), family: text.min(1), variant: text.min(1), unit: text.min(1), hsCode: text.default(""), imageUrl: z.string().max(2000).refine((v) => !v || /^\/(?!\/)/.test(v) || /^https:\/\//.test(v), "Use a local image path or HTTPS URL").default(""), standardSalePrice: decimalInput(2).default("0"), active: z.boolean().default(true) });
export const supplierInput = z.object({ name: text.min(1), country: text.min(1), contactPerson: text.default(""), phone: text.default(""), email: z.union([z.email(), z.literal("")]).default(""), paymentTerms: text.default(""), active: z.boolean().default(true) });
export const itemInput = z.object({
  productId: text.min(1), quantity: decimalInput(4, true), currency: currency.default("USD"),
  fobUnitForeign: decimalInput(6).default("0"), exchangeRate: decimalInput(6).default("0"),
  cbmPerCarton: decimalInput(8).default("0"), cartonCount: decimalInput(4).default("0"),
  totalCbm: decimalInput(8).default("0"), cbmMode: z.enum(["CALCULATED", "MANUAL"]).default("CALCULATED"), hsCode: text.optional()
});
export const commercialInput = z.object({
  poNumber: text.min(1), poDate: z.iso.date(), piNumber: text.optional(), piDate: optionalDate,
  paymentMode: z.enum(["Pending", "LC", "TT"]).default("Pending"), lcNumber: text.optional(), lcAmount: decimalInput(2).optional(), lcOpenDate: optionalDate, lcExpiryDate: optionalDate,
  ttReference: text.optional(), ttAmount: decimalInput(2).optional(), ttDate: optionalDate, bank: text.optional(),
  currency: currency.default("USD"), exchangeRate: decimalInput(6).default("0"), rateDate: optionalDate, rateSource: text.default("Pending"),
  expectedShipmentDate: optionalDate, commercialInvoiceNumber: text.optional(), commercialInvoiceDate: optionalDate,
  productionStatus: text.optional(), productionFollowUpNote: z.string().trim().max(2000).optional(),
  blNumber: text.optional(), containerNumber: text.optional(), containerType: text.optional(), vesselName: text.optional(), etd: optionalDate, eta: optionalDate, notes: z.string().trim().max(3000).optional()
});
export const createImportInput = commercialInput.extend({ supplierId: text.min(1), items: z.array(itemInput).min(1).max(100) });
export const updateImportInput = commercialInput.extend({
  paymentMode: commercialInput.shape.paymentMode.removeDefault(), currency: commercialInput.shape.currency.removeDefault(),
  exchangeRate: commercialInput.shape.exchangeRate.removeDefault(), rateSource: commercialInput.shape.rateSource.removeDefault()
}).partial();
export const costInput = z.object({
  name: text.min(1), category: text.min(1), amountForeign: decimalInput(6, true), currency,
  exchangeRate: decimalInput(6, true), allocationMethod: z.enum(["CBM", "FOB_VALUE", "QUANTITY", "PRODUCT_SPECIFIC", "MANUAL"]),
  appliesToItemIds: z.array(text.min(1)).max(100).default([]),
  manualSplits: z.array(z.object({ importItemId: text.min(1), amountBdt: decimalInput(2) })).max(100).optional(),
  vendor: text.optional(), paymentDate: optionalDate, accountId: text.optional(), notes: z.string().trim().max(2000).optional()
});
export const receiptInput = z.object({
  receivedDate: z.iso.date(), lines: z.array(z.object({
    importItemId: text.min(1), quantityReceived: decimalInput(4), quantityRejected: decimalInput(4).default("0"),
    lotNumber: text.default(""), batchNumber: text.default(""), manufacturingDate: optionalDate, expiryDate: optionalDate,
    warehouse: z.literal("Main Warehouse").default("Main Warehouse"), location: text.default("")
  })).min(1).max(100)
});
export const transitionInput = z.object({ status: z.enum(["In Production", "Shipped", "At Port", "Costing", "Closed", "Cancelled"]) });
export const reasonInput = z.object({ reason: z.string().trim().min(5).max(1000) });
export const dispatchInput = z.object({ productId: text.min(1), quantity: decimalInput(4, true), date: z.iso.date().optional(), batchId: text.optional() });
