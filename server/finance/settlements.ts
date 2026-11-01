import { Router } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { cashAccounts, financialPositionEntries, importCases, openingPositions, postingKeys, supplierSettlements, suppliers } from "../../database/schema.js";
import { audit, identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { hasCapability, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { businessDate } from "../../src/lib/date.js";
import { lockActor, newId, postingIdentity } from "../operations/common.js";
import { postAccountEntry, reverseAccountEntry } from "../trading/accounts.js";
import { reversalInput } from "../trading/contracts.js";
import { checkPostingDate, lockPosting } from "../trading/locks.js";
import { money } from "../trading/money.js";
import { positionInput, settlementInput } from "./contracts.js";
import { readPosition, readSettlements } from "./records.js";
import { recordLedgerEvent, twoSidedPlan } from "../ledger/service.js";

export function createSettlementRouter(ctx: Context) {
  const router = Router();
  router.get("/accounts/suppliers", async (_req, res) => {
    assertAllowed(hasEffectivePermission(identity(res).user, "accounts"));
    res.json({ success: true, data: await ctx.db.select().from(suppliers).orderBy(suppliers.name), message: "Supplier references loaded for accounts" });
  });
  router.get("/accounts/import-references", async (_req, res) => {
    assertAllowed(hasEffectivePermission(identity(res).user, "accounts"));
    const rows = await ctx.db.select().from(importCases).orderBy(importCases.createdAt);
    res.json({ success: true, data: rows.filter((row) => row.status !== "Cancelled").map((row) => ({ id: row.id, supplierId: row.supplierId, reference: row.commercial.lcNumber || row.commercial.ttReference || row.draftReference })), message: "Import references loaded without cost details" });
  });
  router.get("/supplier-settlements", async (_req, res) => {
    assertAllowed(hasEffectivePermission(identity(res).user, "accounts"));
    res.json({ success: true, data: await ctx.db.transaction(readSettlements), message: "Supplier obligations and payments loaded" });
  });
  router.post("/supplier-settlements", async (req, res) => {
    const actor = identity(res); const input = settlementInput.parse(req.body); const key = postingIdentity(req, `${actor.user.id}:supplier-settlement`, input);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "accounts", "post"); const previous = await lockPosting(tx, key); if (previous) return previous;
      checkPostingDate(input.date);
      const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).for("update");
      if (!supplier?.active) throw new HttpError(422, "Select an active supplier.");
      if (input.entryType === "Obligation") {
        const [opening] = await tx.select({ id: openingPositions.id }).from(openingPositions).where(and(eq(openingPositions.entityId, supplier.id), inArray(openingPositions.kind, ["Supplier Due", "Supplier Advance"]), sql`lower(btrim(${openingPositions.sourceReference}))=lower(btrim(${input.reference}))`)).limit(1);
        if (opening) throw new HttpError(409, "This supplier reference is already represented in approved opening positions. Do not post its obligation twice.");
      }
      if (input.importId) {
        const [record] = await tx.select().from(importCases).where(eq(importCases.id, input.importId)).for("share");
        if (!record || record.supplierId !== supplier.id || record.status === "Cancelled") throw new HttpError(422, "Select a valid import belonging to this supplier.");
      }
      const id = newId("settlement"); let transactionId: string | null = null; let accountName: string | null = null;
      if (input.entryType === "Payment") {
        const [account] = await tx.select().from(cashAccounts).where(eq(cashAccounts.id, input.accountId!)).for("update");
        if (!account?.active) throw new HttpError(422, "Select an active payment account.");
        if (account.type !== "Cash" && !input.paymentReference) throw new HttpError(422, "Non-cash payments require a payment reference.");
        accountName = account.name;
        transactionId = await postAccountEntry(tx, user, { accountId: account.id, date: input.date, direction: "Out", amount: input.amount, sourceType: "Supplier Payment", sourceId: id, description: `Supplier payment: ${supplier.name}`, partyId: supplier.id, partyName: supplier.name, reference: input.paymentReference || input.reference, remarks: input.notes });
      }
      await tx.insert(supplierSettlements).values({ ...input, id, amount: money(input.amount), supplierName: supplier.name, importId: input.importId || null, accountId: input.entryType === "Payment" ? input.accountId! : null, accountName, transactionId, createdByUserId: user.id, createdByName: user.name });
      if (input.entryType === "Obligation") await recordLedgerEvent(tx, user, { sourceKey: `obligation:${id}`, date: input.date, reference: input.reference, description: "Supplier obligation from saved source", plan: twoSidedPlan("Inventory Clearing", "Payables", input.amount) });
      await tx.insert(postingKeys).values({ ...key, resourceId: id }); await audit(tx, user.id, `Supplier ${input.entryType.toLowerCase()} posted`, "SupplierSettlement", id, { amount: input.amount, reference: input.reference }); return id;
    });
    res.status(201).json({ success: true, data: (await ctx.db.transaction((tx) => readSettlements(tx, id)))[0], message: "Supplier entry posted; landed-cost allocation unchanged" });
  });
  router.post("/supplier-settlements/:id/reverse", async (req, res) => {
    const actor = identity(res); const id = String(req.params.id); const input = reversalInput.parse(req.body); const key = postingIdentity(req, `${actor.user.id}:supplier-reverse:${id}`, input);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "accounts", "post"); const previous = await lockPosting(tx, key); if (previous) return;
      const [reference] = await tx.select().from(supplierSettlements).where(eq(supplierSettlements.id, id));
      if (!reference) throw new HttpError(404, "Supplier entry not found.");
        if (reference.supplierClaimId) throw new HttpError(409, "Approved supplier credits require a separately reviewed source correction, not a payment reversal.");
      if (reference.openingPositionId) throw new HttpError(409, "Approved opening sources cannot be reversed as ordinary payments. Use a separately reviewed opening correction.");
      await tx.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, reference.supplierId)).for("update");
      const [row] = await tx.select().from(supplierSettlements).where(eq(supplierSettlements.id, id)).for("update");
      if (row.status !== "Posted") throw new HttpError(409, "Supplier entry is already reversed.");
      if (row.transactionId) await reverseAccountEntry(tx, user, row.transactionId, input.reason);
      await tx.update(supplierSettlements).set({ status: "Reversed", reversedBy: user.id, reversedAt: new Date(), reversalDate: businessDate(), reversalReason: input.reason }).where(eq(supplierSettlements.id, id));
      if (row.entryType === "Obligation") await recordLedgerEvent(tx, user, { sourceKey: `obligation-reversal:${id}`, date: businessDate(), reference: row.reference, description: "Supplier obligation reversal", plan: twoSidedPlan("Payables", "Inventory Clearing", row.amount) });
      await tx.insert(postingKeys).values({ ...key, resourceId: id }); await audit(tx, user.id, "Supplier entry reversed", "SupplierSettlement", id, { reason: input.reason });
    });
    res.json({ success: true, data: (await ctx.db.transaction((tx) => readSettlements(tx, id)))[0], message: "Supplier entry reversed; original preserved" });
  });
  router.get("/financial-position", async (_req, res) => {
    const user = identity(res).user; assertAllowed(hasEffectivePermission(user, "accounts") && hasCapability(user, "view_financial_position"));
    res.json({ success: true, data: await ctx.db.transaction(readPosition), message: "Verified financial-position sources loaded" });
  });
  router.post("/financial-position", async (req, res) => {
    const actor = identity(res); const input = positionInput.parse(req.body); const key = postingIdentity(req, `${actor.user.id}:financial-position`, input);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "accounts", "post", "view_financial_position"); const previous = await lockPosting(tx, key); if (previous) return previous;
      checkPostingDate(input.asOfDate); const id = newId("position");
      await tx.insert(financialPositionEntries).values({ ...input, amount: money(input.amount), id, createdByUserId: user.id, createdByName: user.name });
      await tx.insert(postingKeys).values({ ...key, resourceId: id }); await audit(tx, user.id, "Financial position posted", "FinancialPosition", id, { category: input.category, reference: input.reference }); return id;
    });
    res.status(201).json({ success: true, data: (await ctx.db.transaction((tx) => readPosition(tx, id)))[0], message: "Position source posted; cash balances unchanged" });
  });
  router.post("/financial-position/:id/reverse", async (req, res) => {
    const actor = identity(res); const id = String(req.params.id); const input = reversalInput.parse(req.body); const key = postingIdentity(req, `${actor.user.id}:position-reverse:${id}`, input);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "accounts", "post", "view_financial_position"); const previous = await lockPosting(tx, key); if (previous) return;
      const [row] = await tx.select().from(financialPositionEntries).where(eq(financialPositionEntries.id, id)).for("update");
      if (!row) throw new HttpError(404, "Position source not found."); if (row.status !== "Posted") throw new HttpError(409, "Position source already reversed.");
      await tx.update(financialPositionEntries).set({ status: "Reversed", reversedBy: user.id, reversedAt: new Date(), reversalDate: businessDate(), reversalReason: input.reason }).where(eq(financialPositionEntries.id, id));
      await tx.insert(postingKeys).values({ ...key, resourceId: id }); await audit(tx, user.id, "Financial position reversed", "FinancialPosition", id, { reason: input.reason });
    });
    res.json({ success: true, data: (await ctx.db.transaction((tx) => readPosition(tx, id)))[0], message: "Position source reversed with reason" });
  });
  return router;
}
