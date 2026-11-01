import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { documents, employees, expenseCategories, expenses, postingKeys } from "../../database/schema.js";
import { audit, identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { businessDate } from "../../src/lib/date.js";
import { lockActor, newId, postingIdentity } from "../operations/common.js";
import { postAccountEntry, reverseAccountEntry } from "../trading/accounts.js";
import { checkPostingDate, lockPosting } from "../trading/locks.js";
import { reversalInput } from "../trading/contracts.js";
import { checkVersion } from "../trading/records.js";
import { categoryInput, categoryUpdate, expenseAmounts, expenseInput } from "./contracts.js";
import { readExpenses } from "./records.js";

export function createExpenseRouter(ctx: Context) {
  const router = Router();
  router.get(["/expense-categories", "/settings/expense-categories"], async (_req, res) => {
    const user = identity(res).user; assertAllowed(hasEffectivePermission(user, "accounts") || hasEffectivePermission(user, "settings"));
    res.json({ success: true, data: await ctx.db.select().from(expenseCategories).orderBy(expenseCategories.name), message: "Expense categories loaded" });
  });
  router.post(["/expense-categories", "/settings/expense-categories"], async (req, res) => {
    const actor = identity(res); const input = categoryInput.parse(req.body); const key = postingIdentity(req, `${actor.user.id}:expense-category`, input);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "settings", "create"); const previous = await lockPosting(tx, key); if (previous) return previous;
      const id = newId("category"); await tx.insert(expenseCategories).values({ ...input, id });
      await tx.insert(postingKeys).values({ ...key, resourceId: id }); await audit(tx, user.id, "Expense category created", "ExpenseCategory", id); return id;
    });
    res.status(201).json({ success: true, data: (await ctx.db.select().from(expenseCategories).where(eq(expenseCategories.id, id)))[0], message: "Category created" });
  });
  router.patch(["/expense-categories/:id", "/settings/expense-categories/:id"], async (req, res) => {
    const actor = identity(res); const input = categoryUpdate.parse(req.body); const id = String(req.params.id);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "settings", "edit"); const [row] = await tx.select().from(expenseCategories).where(eq(expenseCategories.id, id)).for("update");
      if (!row) throw new HttpError(404, "Category not found."); checkVersion(row.version, input.version);
      await tx.update(expenseCategories).set({ name: input.name ?? row.name, active: input.active ?? row.active, version: row.version + 1 }).where(eq(expenseCategories.id, id));
      await audit(tx, user.id, "Expense category updated", "ExpenseCategory", id);
    });
    res.json({ success: true, data: (await ctx.db.select().from(expenseCategories).where(eq(expenseCategories.id, id)))[0], message: "Category updated; posted names preserved" });
  });
  router.get("/expenses", async (_req, res) => {
    assertAllowed(hasEffectivePermission(identity(res).user, "accounts"));
    res.json({ success: true, data: await ctx.db.transaction(readExpenses), message: "Operating expenses loaded" });
  });
  router.post("/expenses", async (req, res) => {
    const actor = identity(res); const input = expenseInput.parse(req.body);
    if (req.body.attachmentUpload) throw new HttpError(422, "Upload evidence directly to private Storage and pass its document ID.");
    const key = postingIdentity(req, `${actor.user.id}:expense`, input);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "accounts", "post"); const previous = await lockPosting(tx, key); if (previous) return previous;
      checkPostingDate(input.date);
      const [category] = await tx.select().from(expenseCategories).where(eq(expenseCategories.id, input.categoryId)).for("share");
      if (!category?.active) throw new HttpError(422, "Select an active expense category.");
      const expenseFor = input.subtype === "TA/DA" ? "Employee" : input.expenseFor;
      const [employee] = expenseFor === "Employee" && input.employeeId ? await tx.select().from(employees).where(eq(employees.id, input.employeeId)).for("share") : [];
      if (expenseFor === "Employee" && employee?.status !== "Active") throw new HttpError(422, "Select an active employee.");
      let values; try { values = expenseAmounts(input); } catch (error) { throw new HttpError(422, (error as Error).message); }
      const attribution = employee ? { expenseForId: employee.id, expenseForName: employee.name, employee: employee.name, employeeCode: employee.employeeCode, designation: employee.title, department: employee.department } : expenseFor === "Office" ? { expenseForId: "head-office", expenseForName: "Head Office" } : expenseFor === "Warehouse" ? { expenseForId: "main-warehouse", expenseForName: "MIPRO Main Warehouse" } : { expenseForId: "company", expenseForName: "MIPRO HealthCare Corporation" };
      if (input.attachmentDocumentId) {
        const [doc] = await tx.select().from(documents).where(eq(documents.id, input.attachmentDocumentId)).for("update");
        if (!doc || doc.uploadedBy !== user.id || doc.purpose !== "expense-receipt" || doc.status !== "Attached" || doc.expenseId) throw new HttpError(422, "Use your own completed, unused expense receipt upload.");
      }
      const id = newId("expense");
      const transactionId = await postAccountEntry(tx, user, { accountId: input.paidFromAccountId, date: input.date, direction: "Out", amount: values.amount, sourceType: "Expense", sourceId: id, description: input.remarks, partyId: attribution.expenseForId, partyName: attribution.expenseForName });
      await tx.insert(expenses).values({ id, date: input.date, categoryId: category.id, categoryName: category.name, subtype: input.subtype, ...values, paidFromAccountId: input.paidFromAccountId, transactionId, expenseFor, employeeId: employee?.id ?? null, attribution, remarks: input.remarks, enteredByUserId: user.id, enteredByName: user.name });
      if (input.attachmentDocumentId) await tx.update(documents).set({ expenseId: id }).where(eq(documents.id, input.attachmentDocumentId));
      await tx.insert(postingKeys).values({ ...key, resourceId: id }); await audit(tx, user.id, "Expense posted", "Expense", id, { amount: values.amount, category: category.name, employeeId: employee?.id }); return id;
    });
    res.status(201).json({ success: true, data: (await ctx.db.transaction((tx) => readExpenses(tx, id)))[0], message: "Expense and account outflow posted; landed cost unchanged" });
  });
  router.post("/expenses/:id/reverse", async (req, res) => {
    const actor = identity(res); const id = String(req.params.id); const input = reversalInput.parse(req.body); const key = postingIdentity(req, `${actor.user.id}:expense-reverse:${id}`, input);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "accounts", "post"); const previous = await lockPosting(tx, key); if (previous) return;
      const [row] = await tx.select().from(expenses).where(eq(expenses.id, id)).for("update");
      if (!row) throw new HttpError(404, "Expense not found."); if (row.status !== "Posted") throw new HttpError(409, "Expense is already reversed.");
      await reverseAccountEntry(tx, user, row.transactionId, input.reason);
      await tx.update(expenses).set({ status: "Reversed", reversedBy: user.id, reversedAt: new Date(), reversalDate: businessDate(), reversalReason: input.reason }).where(and(eq(expenses.id, id), eq(expenses.status, "Posted")));
      await tx.insert(postingKeys).values({ ...key, resourceId: id }); await audit(tx, user.id, "Expense reversed", "Expense", id, { reason: input.reason });
    });
    res.json({ success: true, data: (await ctx.db.transaction((tx) => readExpenses(tx, id)))[0], message: "Expense reversed with compensating cash inflow" });
  });
  return router;
}
