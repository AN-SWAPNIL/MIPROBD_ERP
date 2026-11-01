import { z } from "zod";
import { StockBatchSchema, StockMovementSchema, StockSummarySchema } from "../schemas.js";

export const inventoryPageInput = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25), search: z.string().trim().max(120).default(""),
  productId: z.string().min(1).max(200).optional(), batchId: z.string().min(1).max(200).optional(), expiry: z.enum(["all", "normal", "attention", "expired"]).default("all"),
  eligibleOnly: z.enum(["true", "false"]).default("false"), asOfDate: z.iso.date().optional() }).strict();
const pager = { total: z.number().int(), page: z.number().int(), pageSize: z.number().int() };
export const stockPageSchema = z.object({ ...pager, rows: z.array(StockSummarySchema.extend({ unit: z.string(), eligibleQuantity: z.string(), heldQuantity: z.string() })) });
export const batchPageSchema = z.object({ ...pager, rows: z.array(StockBatchSchema.extend({ isFifo: z.boolean(), unit: z.string() })) });
export const movementPageSchema = z.object({ ...pager, rows: z.array(StockMovementSchema) });
export const inventorySummarySchema = z.object({ products: z.number().int(), batches: z.number().int(), expiryAttention: z.number().int(),
  units: z.array(z.object({ unit: z.string(), onHand: z.string(), eligible: z.string(), held: z.string() })), inventoryValue: z.string().optional() });
