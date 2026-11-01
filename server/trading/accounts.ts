import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { accountTransactions, cashAccounts, postingKeys } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { businessDate } from "../../src/lib/date.js";
import { audit, identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { lockActor, newId, nextNumber, postingIdentity } from "../operations/common.js";
import { accountInput, reversalInput, versionInput } from "./contracts.js";
import { checkPostingDate, lockPosting } from "./locks.js";
import { checkVersion } from "./records.js";
import { accountBalance, readAccounts, readAccountTransactions } from "./posting-records.js";
import { D, money } from "./money.js";
import { decimalInput } from "../operations/contracts.js";
import { recordAccountLedger } from "../ledger/service.js";

export async function postAccountEntry(tx: Transaction, user: User, entry: Omit<typeof accountTransactions.$inferInsert, "id" | "accountName" | "voucherNumber" | "createdByUserId" | "createdByName" | "createdAt">, allowInactive = false) {
  const [account] = await tx.select().from(cashAccounts).where(eq(cashAccounts.id, entry.accountId)).for("update");
  if (!account || (!account.active && !allowInactive)) throw new HttpError(422, "Select an active cash or bank account.");
  const amount = new D(entry.amount);
  if (!amount.isFinite() || amount.lte(0) || amount.gte("1e22")) throw new HttpError(422, "Enter a supported positive money amount.");
  const [latest] = await tx.select({ date: sql<string>`max(${accountTransactions.date})` }).from(accountTransactions).where(eq(accountTransactions.accountId, account.id));
  checkPostingDate(entry.date, latest.date || undefined);
  const balance = new D(await accountBalance(tx, account.id));
  const next = entry.direction === "In" ? balance.plus(amount) : balance.minus(amount);
  if (next.lt(0)) throw new HttpError(409, "The selected account has insufficient funds.");
  if (next.gte("1e22")) throw new HttpError(422, "Account balance exceeds supported precision.");
  const id = newId("account-transaction"); const voucherNumber = await nextNumber(tx, entry.direction === "In" ? "CV" : "DV", entry.date);
  await tx.insert(accountTransactions).values({ ...entry, amount: money(amount), id, voucherNumber, accountName: account.name, createdByUserId: user.id, createdByName: user.name });
  await recordAccountLedger(tx, user, { ...entry, id, voucherNumber, amount: money(amount) });
  return id;
}

export async function reverseAccountEntry(tx: Transaction, user: User, id: string, reason: string) {
  const [original] = await tx.select().from(accountTransactions).where(eq(accountTransactions.id, id));
  if (!original || original.reversalOfId) throw new HttpError(409, "Only an original account entry can be reversed.");
  // Match the posting lock order; original journal rows themselves are immutable.
  await tx.select({ id: cashAccounts.id }).from(cashAccounts).where(eq(cashAccounts.id, original.accountId)).for("update");
  const [reversed] = await tx.select({ id: accountTransactions.id }).from(accountTransactions).where(eq(accountTransactions.reversalOfId, id));
  if (reversed) throw new HttpError(409, "This account entry is already reversed.");
  return postAccountEntry(tx, user, { accountId: original.accountId, date: businessDate(), direction: original.direction === "In" ? "Out" : "In", amount: original.amount, sourceType: original.sourceType, sourceId: `reversal-${original.sourceId}`, collectionId: original.collectionId, reversalOfId: id, description: `Reversal: ${original.voucherNumber}`, partyId: original.partyId, partyName: original.partyName, reference: original.reference, remarks: reason }, true);
}

export function createCashAccountRouter(ctx: Context) {
  const router = Router();
  const masterResponse = async (user: User, id?: string) => ctx.db.transaction(async (tx) => (await readAccounts(tx)).filter((account) => !id || account.id === id).map((account) => ({ ...account, balance: hasEffectivePermission(user, "accounts", "view") ? account.balance : "Restricted" })));
  router.get(["/accounts", "/settings/accounts"], async (req, res) => {
    const user = identity(res).user; assertAllowed(hasEffectivePermission(user, "accounts", "view") || hasEffectivePermission(user, "settings", "view"));
    const canViewBalances = hasEffectivePermission(user, "accounts", "view");
    assertAllowed(req.path !== "/accounts" || canViewBalances);
    const data = await masterResponse(user);
    res.json({ success: true, data, message: "Cash/bank accounts loaded" });
  });
  router.get("/payment-accounts", async (_req, res) => {
    assertAllowed(hasEffectivePermission(identity(res).user, "sales", "view"));
    const data = await ctx.db.transaction(async (tx) => (await readAccounts(tx)).filter((account) => account.active).map((account) => ({ ...account, balance: "Restricted" })));
    res.json({ success: true, data, message: "Active receipt destinations loaded without balances" });
  });
  router.post("/settings/accounts", async (req, res) => {
    const actor = identity(res); const input = accountInput.parse(req.body); const key = postingIdentity(req, `${actor.user.id}:account-create`, input);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "settings", "create");
      const previous = await lockPosting(tx, key); if (previous) return previous;
      const date = input.date ?? businessDate(); checkPostingDate(date);
      const id = newId("account"); const { balance, date: _date, ...values } = input; void _date;
      await tx.insert(cashAccounts).values({ ...values, id, createdBy: user.id });
      if (new D(balance).gt(0)) {
        assertAllowed(hasEffectivePermission(user, "accounts", "post"));
        await postAccountEntry(tx, user, { accountId: id, direction: "In", amount: balance, date, sourceType: "Opening Balance", sourceId: id, description: "Authorized opening account balance" }, true);
      }
      await tx.insert(postingKeys).values({ ...key, resourceId: id }); await audit(tx, user.id, "Cash/bank account created", "Account", id, { openingBalance: balance }); return id;
    });
    res.status(201).json({ success: true, data: (await masterResponse(actor.user, id))[0], message: "Account created" });
  });
  router.patch("/settings/accounts/:id", async (req, res) => {
    const id = String(req.params.id); const version = versionInput.parse(req.body.version);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, identity(res), "settings", "edit");
      const [row] = await tx.select().from(cashAccounts).where(eq(cashAccounts.id, id)).for("update");
      if (!row) throw new HttpError(404, "Account not found."); checkVersion(row.version, version);
      const balance = await accountBalance(tx, id);
      const input = accountInput.parse({ ...row, balance, ...req.body });
      if (!new D(input.balance).eq(balance)) throw new HttpError(422, "Balances cannot be edited. Use an authorized journal transaction or reversal.");
      const [posted] = await tx.select({ id: accountTransactions.id }).from(accountTransactions).where(eq(accountTransactions.accountId, id)).limit(1);
      if (posted && input.type !== row.type) throw new HttpError(409, "An account with posted history cannot change its channel type.");
      await tx.update(cashAccounts).set({ name: input.name, type: input.type, accountNumber: input.accountNumber, active: input.active, version: row.version + 1 }).where(eq(cashAccounts.id, id));
      await audit(tx, user.id, "Cash/bank account updated", "Account", id);
    });
    res.json({ success: true, data: (await masterResponse(identity(res).user, id))[0], message: "Account updated" });
  });
  router.delete("/settings/accounts/:id", async (req, res) => {
    const id = String(req.params.id);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, identity(res), "settings", "delete");
      const [row] = await tx.update(cashAccounts).set({ active: false, version: sql`${cashAccounts.version} + 1` }).where(eq(cashAccounts.id, id)).returning();
      if (!row) throw new HttpError(404, "Account not found.");
      await audit(tx, user.id, "Cash/bank account deactivated", "Account", id);
    });
    res.json({ success: true, data: { id }, message: "Account deactivated; ledger preserved" });
  });
  router.get("/account-transactions", async (_req, res) => {
    assertAllowed(hasEffectivePermission(identity(res).user, "accounts", "view"));
    res.json({ success: true, data: await ctx.db.transaction(readAccountTransactions), message: "Account journal loaded" });
  });
  const manual = z.object({ date: z.iso.date(), accountId: z.string().min(1), direction: z.enum(["In", "Out"]), amount: decimalInput(2, true), sourceType: z.enum(["Advance", "Company Loan", "Manual Authorized"]), partyId: z.string().max(200).optional(), partyName: z.string().trim().min(1).max(200), description: z.string().trim().min(5).max(2000), reference: z.string().trim().max(200).optional(), remarks: z.string().trim().max(3000).optional() });
  router.post("/account-transactions", async (req, res) => {
    const actor = identity(res); const input = manual.parse(req.body); const key = postingIdentity(req, `${actor.user.id}:manual-account-entry`, input);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "accounts", "post"); const previous = await lockPosting(tx, key); if (previous) return previous;
      const id = await postAccountEntry(tx, user, { ...input, sourceId: newId("manual-source") });
      await tx.insert(postingKeys).values({ ...key, resourceId: id }); await audit(tx, user.id, "Authorized account transaction posted", "AccountTransaction", id, { direction: input.direction, amount: input.amount }); return id;
    });
    res.status(201).json({ success: true, data: (await ctx.db.transaction(readAccountTransactions)).find((row) => row.id === id), message: "Journal transaction posted" });
  });
  router.post("/account-transactions/:id/reverse", async (req, res) => {
    const actor = identity(res); const sourceId = String(req.params.id); const input = reversalInput.parse(req.body); const key = postingIdentity(req, `${actor.user.id}:manual-account-reverse:${sourceId}`, input);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "accounts", "post"); const previous = await lockPosting(tx, key); if (previous) return previous;
      const [original] = await tx.select().from(accountTransactions).where(and(eq(accountTransactions.id, sourceId)));
      if (!original) throw new HttpError(404, "Account entry not found.");
      if (!["Advance", "Company Loan", "Manual Authorized"].includes(original.sourceType)) throw new HttpError(409, "Reverse this entry through its source workflow, not the manual voucher action.");
      const id = await reverseAccountEntry(tx, user, original.id, input.reason);
      await tx.insert(postingKeys).values({ ...key, resourceId: id }); await audit(tx, user.id, "Account voucher reversed", "AccountTransaction", original.id, { reason: input.reason, reversalId: id }); return id;
    });
    res.json({ success: true, data: (await ctx.db.transaction(readAccountTransactions)).find((row) => row.id === id), message: "Voucher reversed; original entry preserved" });
  });
  return router;
}
