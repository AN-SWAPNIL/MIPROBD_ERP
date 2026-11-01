import { z } from "zod";
import { AccountSchema, CollectionSchema, CustomerSchema, DeliverySchema, ProductSchema, QuotationSchema, SalesInvoiceSchema, SalesOrderSchema } from "../schemas.js";

export const salesKinds = ["customers", "quotations", "orders", "deliveries", "invoices", "collections", "products", "accounts"] as const;
export const salesKindSchema = z.enum(salesKinds);
export type SalesKind = z.infer<typeof salesKindSchema>;
export const salesPageInput = z.object({
  kind: salesKindSchema,
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).default(""),
  selectedId: z.string().min(1).max(160).optional(),
  customerId: z.string().min(1).max(160).optional(),
  orderId: z.string().min(1).max(160).optional(),
  activeOnly: z.enum(["true", "false"]).default("false"),
  accountType: z.enum(["Cash", "Bank", "Mobile Banking"]).optional(),
  asOf: z.iso.date().optional()
}).strict();
const invoiceOption = SalesInvoiceSchema.extend({ availableDue: z.string() });
export const salesRowSchemas = { customers: CustomerSchema, quotations: QuotationSchema, orders: SalesOrderSchema, deliveries: DeliverySchema, invoices: invoiceOption, collections: CollectionSchema, products: ProductSchema, accounts: AccountSchema };
export type SalesRows = { [K in SalesKind]: z.infer<(typeof salesRowSchemas)[K]> };
export function salesPageSchema<K extends SalesKind>(kind: K) {
  return z.object({ rows: z.array(salesRowSchemas[kind]), selected: salesRowSchemas[kind].nullable(), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive() });
}
export const salesSummarySchema = z.object({ customers: z.number().int(), openOrders: z.number().int(), due: z.string().nullable(), collected: z.string().nullable() });
