import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { cashAccounts, customers, employees, expenseCategories, products, suppliers, salesOrders } from "../../database/schema.js";
import { hostedHarness } from "../testing/hosted.js";
import { PersistentReportSchema } from "../../src/domains/reports/persistentContracts.js";
import { businessDate } from "../../src/lib/date.js";

test("hosted reports: historical sales, stock, customer/cash/supplier journals and reversals reconcile", { skip: process.env.RUN_HOSTED_REPORT_TESTS !== "true", timeout: 420000 }, async () => {
  if (process.env.RUN_BACKEND_BROWSER_TESTS === "true") process.env.APP_URL = "http://localhost:5195";
  const h = await hostedHarness("reconcile"); const { expect, key, ctx } = h;
  const today = businessDate(); const date = new Date(`${today}T00:00:00Z`); date.setUTCDate(date.getUTCDate()-1); const yesterday = date.toISOString().slice(0,10);
  const masters: { table: typeof products | typeof suppliers | typeof customers | typeof cashAccounts | typeof expenseCategories; id: string }[] = [];
  try {
    const admin = await h.employee("Super Admin", ["view_sensitive_cost", "edit_sensitive_cost", "view_profit", "finalize_landed_cost"]);
    const sales = await h.employee("Sales Executive"); const other = await h.employee("Sales Executive"); const warehouse = await h.employee("Warehouse Manager"); const accounts = await h.employee("Accounts");
    const supplier = await expect("/suppliers", admin.token, { name: `DEV TEST Report Supplier ${h.suffix}`, country: "China" }, 201); masters.push({ table: suppliers, id: supplier.id });
    const product = await expect("/products", admin.token, { code: `TEST-RPT-${h.suffix}`, name: "DEV TEST Report Dialyzer", family: "Dialyzer", variant: "Report", unit: "pcs" }, 201); masters.push({ table: products, id: product.id });
    const customer = await expect("/customers", sales.token, { name: `DEV TEST Report Hospital ${h.suffix}`, type: "Hospital", address: "Uttara, Dhaka", phone: "0123456789" }, 201, key("customer")); masters.push({ table: customers, id: customer.id });
    const bank = await expect("/settings/accounts", admin.token, { name: `DEV TEST Report Bank ${h.suffix}`, type: "Bank", balance: "0" }, 201, key("bank")); masters.push({ table: cashAccounts, id: bank.id });
    const category = await expect("/expense-categories", admin.token, { name: `DEV TEST Report Expense ${h.suffix}` }, 201, key("category")); masters.push({ table: expenseCategories, id: category.id });
    const imp = await expect("/imports", admin.token, { supplierId: supplier.id, poNumber: `TEST-RPT-PO-${h.suffix}`, poDate: yesterday, piNumber: "TEST-PI", paymentMode: "TT", ttReference: `TEST-RPT-TT-${h.suffix}`, currency: "BDT", exchangeRate: "1", items: [{ productId: product.id, quantity: "3", currency: "BDT", fobUnitForeign: "0.11", exchangeRate: "1", cbmMode: "MANUAL", totalCbm: "1" }] }, 201, key("import"));
    await expect(`/imports/${imp.id}/finalize`, admin.token, {}, 200, key("finalize"));
    await expect(`/imports/${imp.id}/receive`, admin.token, { receivedDate: yesterday, lines: [{ importItemId: imp.items[0].id, quantityReceived: "3", quantityRejected: "0", lotNumber: "TEST-RPT", batchNumber: `TEST-RPT-${h.suffix}`, manufacturingDate: yesterday, expiryDate: `${Number(today.slice(0,4))+2}-12-31`, warehouse: "Main Warehouse" }] }, 201, key("receive"));
    const quote = await expect("/quotations", sales.token, { customerId: customer.id, date: yesterday, validityDays: 30, paymentTerms: "Credit", lines: [{ productId: product.id, quantity: "0.3", unitPrice: "12.34", discount: "0.01" }] }, 201, key("quote"));
    const order = await expect(`/quotations/${quote.id}/convert`, sales.token, { version: quote.version, deliveryInstruction: "DEV TEST report" }, 201, key("convert"));
    // Only this new, unposted TEST order is dated as a historical fixture; the API's current-day conversion policy stays intact.
    await ctx.db.update(salesOrders).set({ date: yesterday }).where(eq(salesOrders.id, order.id));
    const delivery = await expect("/deliveries", admin.token, { orderId: order.id, date: yesterday, lines: [{ productId: product.id, quantity: "0.3", batchId: "AUTO" }] }, 201, key("dispatch"));
    const invoice = await expect("/invoices", sales.token, { date: yesterday, deliveryIds: [delivery.id] }, 201, key("invoice")); await expect(`/invoices/${invoice.id}/approve`, admin.token, {}, 200, key("approve"));
    const receipt = await expect("/collections", admin.token, { customerId: customer.id, invoiceId: invoice.id, orderId: order.id, date: yesterday, amount: "3.69", paymentMode: "Bank Transfer", referenceNumber: "TEST REPORT", accountId: bank.id }, 201, key("receipt"));
    const expense = await expect("/expenses", admin.token, { date: yesterday, categoryId: category.id, subtype: "TA/DA", employeeId: sales.id, taAmount: "0.10", daAmount: "0.20", expenseFor: "Employee", paidFromAccountId: bank.id, remarks: "DEV TEST report allowance" }, 201, key("expense"));
    await expect("/supplier-settlements", admin.token, { date: yesterday, supplierId: supplier.id, reference: "TEST REPORT", entryType: "Obligation", amount: "0.40" }, 201, key("obligation"));
    const payment = await expect("/supplier-settlements", admin.token, { date: yesterday, supplierId: supplier.id, reference: "TEST REPORT", entryType: "Payment", amount: "0.10", accountId: bank.id, paymentReference: "TEST REPORT" }, 201, key("payment"));
    const report = async (id: string, from: string, to: string, filters: Record<string,string> = {}, token = admin.token) => PersistentReportSchema.parse(await expect(`/reports/${id}?${new URLSearchParams({ from, to, ...filters })}`, token));
    assert.equal((await report("sales-summary", yesterday, yesterday, { customer: customer.id })).totals.sales, "3.69");
    assert.equal((await report("gross-profit-product", yesterday, yesterday, { product: product.id })).totals.profit, "3.66");
    assert.equal((await report("current-stock", yesterday, yesterday, { product: product.id })).rows[0].quantity, "2.7000");
    assert.equal((await report("current-stock", yesterday, yesterday, { product: product.id })).totals.value, "0.30");
    assert.equal((await report("cash-movement-summary", yesterday, yesterday, { account: bank.id })).totals.closing, "3.29");
    assert.equal((await report("supplier-list", yesterday, yesterday, { supplier: supplier.id })).totals.unpaid, "0.30");
    await expect(`/supplier-settlements/${payment.id}/reverse`, admin.token, { reason: "DEV TEST report reversal" }, 200, key("reverse-payment"));
    await expect(`/expenses/${expense.id}/reverse`, admin.token, { reason: "DEV TEST report reversal" }, 200, key("reverse-expense"));
    await expect(`/collections/${receipt.id}/reverse`, admin.token, { reason: "DEV TEST report reversal" }, 200, key("reverse-receipt"));
    await expect(`/invoices/${invoice.id}/cancel`, admin.token, { reason: "DEV TEST report reversal" }, 200, key("cancel"));
    const old = await report("sales-summary", yesterday, yesterday, { customer: customer.id }); assert.equal(old.totals.sales, "3.69"); assert.equal(old.totals.collections, "3.69");
    const now = await report("sales-summary", today, today, { customer: customer.id }); assert.equal(now.totals.sales, "-3.69"); assert.equal(now.totals.collections, "-3.69");
    assert.equal((await report("sales-summary", yesterday, today, { customer: customer.id })).totals.sales, "0.00");
    assert.equal((await report("daily-expenditure", yesterday, yesterday, { employee: sales.id })).totals.amount, "0.30");
    assert.equal((await report("daily-expenditure", today, today, { employee: sales.id })).totals.amount, "-0.30");
    assert.equal((await report("cash-movement-summary", yesterday, yesterday, { account: bank.id })).totals.closing, "3.29");
    assert.equal((await report("cash-movement-summary", today, today, { account: bank.id })).totals.opening, "3.29");
    assert.equal((await report("cash-movement-summary", today, today, { account: bank.id })).totals.closing, "0.00");
    assert.equal((await report("supplier-list", today, today, { supplier: supplier.id })).totals.unpaid, "0.40");
    assert.equal((await report("supplier-list", yesterday, yesterday, { supplier: supplier.id })).totals.unpaid, "0.30");
    const statement = await report("supplier-statement", today, today, { supplier: supplier.id }); assert.equal(statement.rows[0].posting, "Opening"); assert.equal(statement.rows.at(-1)?.balance, "0.40");
    assert.equal((await report("customer-ledger", today, today, { customer: customer.id })).rows.at(-1)?.balance, "0.00");
    assert.equal((await report("customer-list", yesterday, yesterday, { customer: customer.id })).totals.due, "0.00");
    assert.equal((await report("sales-summary", yesterday, today, { customer: customer.id }, other.token)).rowCount, 0);
    assert.equal((await report("sales-summary", yesterday, today, { customer: customer.id }, sales.token)).rows.length, 2);
    const query = new URLSearchParams({ from: yesterday, to: today, customer: customer.id, grouping: "Monthly" });
    const screen = await report("sales-summary", yesterday, today, { customer: customer.id, grouping: "Monthly" });
    const print = PersistentReportSchema.parse(await expect(`/reports/sales-summary/print?${query}`, admin.token, undefined, 200, { instance: 1 })); assert.deepEqual(print.rows, screen.rows); assert.deepEqual(print.totals, screen.totals);
    const csv = await fetch(`${h.bases[1]}/reports/sales-summary/export?${query}`, { headers: { Authorization: `Bearer ${admin.token}` } }); assert.equal(csv.status, 200); assert.ok((await csv.text()).includes('"0.00"'));
    await expect(`/reports/sales-summary?from=${yesterday}&to=${today}`, warehouse.token, undefined, 403);
    await expect(`/reports/audit-trail?from=${yesterday}&to=${today}`, accounts.token, undefined, 403);
    await ctx.db.update(employees).set({ permissionOverrides: [{ permission: "reports", action: "view", effect: "ALLOW" }, { permission: "sales", action: "view", effect: "ALLOW" }] }).where(eq(employees.id, warehouse.id));
    const safe = await report("delivery-challan-register", yesterday, today, { order: order.id }, warehouse.token); assert.ok(safe.columns.every((c) => c.format !== "money")); assert.deepEqual(safe.totals, {}); assert.equal(JSON.stringify(safe).includes('"value":"3.69"'), false);
    await expect(`/reports/sales-summary?from=${yesterday}&to=${today}`, warehouse.token, undefined, 403);
    await ctx.db.update(employees).set({ permissionOverrides: [{ permission: "print", action: "view", effect: "DENY" }, { permission: "reports", action: "export", effect: "DENY" }] }).where(eq(employees.id, sales.id));
    await expect(`/reports/sales-summary/print?${query}`, sales.token, undefined, 403); await expect(`/reports/sales-summary/export?${query}`, sales.token, undefined, 403);
    if (process.env.RUN_BACKEND_BROWSER_TESTS === "true") {
      const { reportBackendBrowserSmoke } = await import("../../scripts/report-backend-browser-smoke.js");
      await reportBackendBrowserSmoke(h.bases[0], admin.email, h.password, customer.id, yesterday, today);
    }
    console.log("Report reconciliation verified: signed events, exact COGS, dated reversals, stock, scope and shared outputs.");
  } finally {
    for (const master of masters) await ctx.db.update(master.table).set({ active: false }).where(eq(master.table.id, master.id));
    await h.close();
  }
});
