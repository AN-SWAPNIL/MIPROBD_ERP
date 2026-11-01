import { Router } from "express";
import { eq, inArray } from "drizzle-orm";
import { accountTransactions, deliveries, printConfigurations, salesInvoices, salesOrders } from "../../database/schema.js";
import { audit, identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { lockActor } from "../operations/common.js";
import { loadImport } from "../operations/import-records.js";
import { checkVersion, readOrders, readQuotations } from "../trading/records.js";
import { readCollections, readDeliveries, readInvoices } from "../trading/posting-records.js";
import { restrictDeliveryFinancials } from "../salesWorkspace.js";
import { hasCapability, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { PrintConfigurationSchema, TransactionPrintPayloadSchema } from "../../src/domains/schemas.js";
import type { TransactionPrintPayload } from "../../src/domains/erp.types.js";
import { printableType, printConfigurationInput } from "./contracts.js";

export function createPrintRouter(ctx: Context) {
  const router = Router();
  router.get(["/settings/print", "/print/config"], async (req, res) => {
    const user = identity(res).user;
    assertAllowed(hasEffectivePermission(user, req.path === "/settings/print" ? "settings" : "print"));
    const [row] = await ctx.db.select().from(printConfigurations).where(eq(printConfigurations.id, "company"));
    if (!row) throw new HttpError(503, "Company stationery has not been configured.");
    res.json({ success: true, data: PrintConfigurationSchema.parse({ ...row.data, version: row.version }), message: "Saved company stationery loaded" });
  });
  router.patch("/settings/print", async (req, res) => {
    const actor = identity(res); const input = printConfigurationInput.parse(req.body);
    const data = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "settings", "edit");
      const [row] = await tx.select().from(printConfigurations).where(eq(printConfigurations.id, "company")).for("update");
      if (!row) throw new HttpError(503, "Company stationery has not been configured.");
      checkVersion(row.version, input.version);
      const { version: _version, ...data } = input; void _version;
      await tx.update(printConfigurations).set({ data, version: row.version + 1, updatedBy: user.id, updatedAt: new Date() }).where(eq(printConfigurations.id, row.id));
      await audit(tx, user.id, "Company stationery updated", "PrintConfiguration", row.id, { previousVersion: row.version, version: row.version + 1, before: row.data, after: data });
      return { ...data, version: row.version + 1 };
    });
    res.json({ success: true, data, message: "Company stationery saved" });
  });
  router.get("/print/records/:type/:id", async (req, res) => {
    const user = identity(res).user;
    assertAllowed(hasEffectivePermission(user, "print"));
    const type = printableType.parse(req.params.type); const id = String(req.params.id);
    const data = await ctx.db.transaction(async (tx): Promise<TransactionPrintPayload> => {
      if (type === "import-cost") {
        assertAllowed(hasEffectivePermission(user, "import") && hasCapability(user, "view_sensitive_cost"));
        const record = await loadImport(tx, id);
        if (!record.snapshot) throw new HttpError(409, "Finalize landed cost before printing its saved result.");
        return { kind: type, record: { ...record, documents: [], snapshotHistory: [] } };
      }
      if (type === "debit-voucher" || type === "credit-voucher") {
        assertAllowed(hasEffectivePermission(user, "accounts"));
        const [record] = await tx.select().from(accountTransactions).where(eq(accountTransactions.id, id));
        if (!record || record.direction !== (type === "credit-voucher" ? "In" : "Out")) throw new HttpError(404, "Matching voucher not found.");
        const [reversal] = await tx.select({ voucherNumber: accountTransactions.voucherNumber }).from(accountTransactions).where(eq(accountTransactions.reversalOfId, record.id));
        return { kind: "voucher", record: { ...record, reversalOfId: record.reversalOfId ?? undefined, partyId: record.partyId ?? undefined, partyName: record.partyName ?? undefined, reference: record.reference ?? undefined, remarks: record.remarks ?? undefined }, voucherType: type === "credit-voucher" ? "CREDIT VOUCHER" : "DEBIT VOUCHER", reversalReference: reversal?.voucherNumber };
      }
      // Print permission never grants source access or bypasses own-record restrictions.
      assertAllowed(hasEffectivePermission(user, "sales") && (user.role !== "Warehouse Manager" || type === "challan"));
      if (type === "quotation") {
        const [record] = await readQuotations(tx, user, id); if (record) return { kind: type, record };
      } else if (type === "order") {
        const [record] = await readOrders(tx, user, id); if (record) return { kind: type, record };
      } else if (type === "challan") {
        const [record] = await readDeliveries(tx, user, { id }); if (record) return { kind: type, record: user.role === "Warehouse Manager" ? restrictDeliveryFinancials(record) : record, financialVisible: user.role !== "Warehouse Manager" };
      } else if (type === "invoice") {
        const [record] = await readInvoices(tx, user, { id });
        if (record) {
          const [order] = record.orderId ? await tx.select({ number: salesOrders.orderNumber }).from(salesOrders).where(eq(salesOrders.id, record.orderId)) : [];
          const links = record.deliveryIds.length ? await tx.select({ number: deliveries.challanNumber }).from(deliveries).where(inArray(deliveries.id, record.deliveryIds)).orderBy(deliveries.date, deliveries.id) : [];
          return { kind: type, record, references: { order: order?.number, deliveries: links.map((row) => row.number) } };
        }
      } else if (type === "receipt") {
        const [record] = await readCollections(tx, user, { id });
        if (record) {
          const [order] = record.orderId ? await tx.select({ number: salesOrders.orderNumber }).from(salesOrders).where(eq(salesOrders.id, record.orderId)) : [];
          const [invoice] = record.invoiceId ? await tx.select({ number: salesInvoices.invoiceNumber }).from(salesInvoices).where(eq(salesInvoices.id, record.invoiceId)) : [];
          return { kind: type, record, references: { order: order?.number, invoice: invoice?.number } };
        }
      }
      throw new HttpError(404, "Printable record not found in your accessible records.");
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data: TransactionPrintPayloadSchema.parse(data), message: "Saved printable record loaded" });
  });
  return router;
}
