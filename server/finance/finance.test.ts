import assert from "node:assert/strict";
import test from "node:test";
import { categoryInput, categoryUpdate, expenseAmounts, expenseInput, positionInput, settlementInput } from "./contracts.js";
import { uploadSchema } from "../foundation/contracts.js";

const expense = { date: "2026-10-24", categoryId: "category", subtype: "General", expenseFor: "Office", amount: "100.01", paidFromAccountId: "bank", remarks: "Office rent" };
test("operating expenses derive TA/DA with exact decimals and ignore supplied total/name fields", () => {
  const general = expenseInput.parse({ ...expense, employee: "Forged", categoryName: "Forged" });
  assert.deepEqual(expenseAmounts(general), { amount: "100.01", taAmount: null, daAmount: null });
  assert.equal("categoryName" in general, false);
  const tada = expenseInput.parse({ ...expense, subtype: "TA/DA", amount: "999", taAmount: "0.10", daAmount: "0.20" });
  assert.deepEqual(expenseAmounts(tada), { amount: "0.30", taAmount: "0.10", daAmount: "0.20" });
  assert.throws(() => expenseAmounts({ ...tada, taAmount: "0", daAmount: "0" }), /cannot both be zero/);
  assert.equal(expenseInput.safeParse({ ...expense, amount: 10 }).success, false);
  assert.equal(expenseInput.safeParse({ ...expense, amount: "10.001" }).success, false);
});
test("category edits require versions and financial sources require explicit references", () => {
  assert.deepEqual(categoryInput.parse({ name: "  Utilities  " }), { name: "Utilities", active: true });
  assert.equal(categoryUpdate.safeParse({ name: "Updated" }).success, false);
  assert.deepEqual(categoryUpdate.parse({ version: 1, active: false }), { version: 1, active: false });
  assert.equal(settlementInput.safeParse({ date: "2026-10-24", supplierId: "s", reference: "PI-1", entryType: "Payment", amount: "10" }).success, false);
  assert.equal(positionInput.safeParse({ asOfDate: "2026-10-24", category: "Owner Capital", label: "Opening capital", amount: "10", reference: "" }).success, false);
});
test("expense evidence cannot impersonate an employee or import parent", () => {
  const upload = { purpose: "expense-receipt", fileName: "receipt.pdf", mimeType: "application/pdf", sizeBytes: 100 };
  assert.equal(uploadSchema.safeParse(upload).success, true);
  assert.equal(uploadSchema.safeParse({ ...upload, employeeId: "another-employee" }).success, false);
  assert.equal(uploadSchema.safeParse({ ...upload, importId: "another-import" }).success, false);
  assert.equal(uploadSchema.safeParse({ ...upload, mimeType: "image/gif" }).success, false);
});
