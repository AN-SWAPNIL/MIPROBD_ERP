import { z } from "zod";
import { AccountSchema, CollectionSchema, CustomerSchema, DeliverySchema, ProductSchema, QuotationSchema, SalesInvoiceSchema, SalesOrderSchema } from "../schemas.js";
export const SalesOverviewSchema = z.object({ customers: z.array(CustomerSchema), quotations: z.array(QuotationSchema), orders: z.array(SalesOrderSchema), deliveries: z.array(DeliverySchema), invoices: z.array(SalesInvoiceSchema), collections: z.array(CollectionSchema), products: z.array(ProductSchema), accounts: z.array(AccountSchema) });
