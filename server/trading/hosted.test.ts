import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { z } from "zod";
import { eq, inArray, sql } from "drizzle-orm";
import { customerEntries, customers, employees, orderLines, products, sessions } from "../../database/schema.js";
import { createContext } from "../foundation/context.js";
import { createFoundationRouter } from "../foundation/router.js";
import { CustomerSchema, QuotationSchema, SalesOrderSchema } from "../../src/domains/schemas.js";
import { businessDate } from "../../src/lib/date.js";

test("hosted sales: customer ownership, quotation versions, canonical totals, concurrent conversion and restart persistence", { skip: process.env.RUN_HOSTED_TRADING_TESTS !== "true", timeout: 240000 }, async () => {
  const ctx = createContext(); const second = createContext(); const suffix = randomUUID();
  const password = `T!${randomBytes(24).toString("hex")}`;
  const identities: { id: string; authId: string; email: string; token: string }[] = [];
  const customerIds: string[] = []; const productIds: string[] = [];
  let cleanupFailed = false;
  const servers: ReturnType<ReturnType<typeof express>["listen"]>[] = [];
  async function start(context: typeof ctx) {
    const app = express(); app.use(express.json({ limit: "256kb" })); app.use("/api", createFoundationRouter(context));
    const server = app.listen(0, "127.0.0.1"); servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  }
  const base = await start(ctx); const other = await start(second);
  async function call(path: string, token: string, input?: unknown, method = input === undefined ? "GET" : "POST", key?: string, target = base) {
    const response = await fetch(target + path, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(key ? { "Idempotency-Key": key } : {}) }, body: input === undefined ? undefined : JSON.stringify(input), signal: AbortSignal.timeout(30000) });
    const json = z.object({ success: z.boolean(), data: z.any(), message: z.string() }).parse(await response.json()); return { status: response.status, ...json };
  }
  async function expect(path: string, token: string, input?: unknown, status = 200, method?: string, key?: string, target?: string) {
    const result = await call(path, token, input, method, key, target); assert.equal(result.status, status, `${path}: ${result.message}`); return result.data;
  }
  try {
    for (const [label, role] of [["admin", "Super Admin"], ["one", "Sales Executive"], ["two", "Sales Executive"], ["md", "Managing Director"]] as const) {
      const email = `backend-sales-${label}-${suffix}@example.invalid`;
      const { data, error } = await ctx.admin.auth.admin.createUser({ email, password, email_confirm: true }); assert.equal(error, null); assert.ok(data.user);
      const id = `test-sales-${label}-${suffix}`; const record = { id, authId: data.user.id, email, token: "" }; identities.push(record);
      await ctx.db.insert(employees).values({ id, authUserId: data.user.id, email, role, status: "Active", name: `DEV TEST Sales ${label}`, employeeCode: `TEST-sales-${label}-${suffix}` });
      record.token = (await expect("/auth/login", "", { email, password })).token;
    }
    const [admin, one, two, md] = identities;
    const product = await expect("/products", admin.token, { code: `TEST-sales-${suffix}`, name: "DEV TEST Sales Dialyzer", family: "Dialyzer", variant: "Test", unit: "pcs", standardSalePrice: "10.00" }, 201); productIds.push(product.id);
    const customerInput = { name: `DEV TEST Hospital ${suffix}`, type: "Hospital", address: "Test address", phone: "123", creditLimit: "50000.00", assignedSalesUserId: two.id, currentDue: "9999" };
    let customer = CustomerSchema.parse(await expect("/customers", one.token, customerInput, 201, "POST", `customer-${suffix}`)); customerIds.push(customer.id);
    assert.equal(customer.assignedSalesUserId, one.id); assert.equal(customer.currentDue, "0.00");
    assert.equal((await expect("/customers", one.token, customerInput, 201, "POST", `customer-${suffix}`)).id, customer.id);
    assert.equal((await expect("/customers", two.token)).some((row: { id: string }) => row.id === customer.id), false);
    await expect(`/customers/${customer.id}`, two.token, { version: customer.version, name: "Unauthorized" }, 403, "PATCH");
    customer = CustomerSchema.parse(await expect(`/customers/${customer.id}`, one.token, { version: customer.version, name: customer.name + " Updated" }, 200, "PATCH"));
    await expect(`/customers/${customer.id}`, one.token, { version: 1, phone: "outdated" }, 409, "PATCH");
    const unassigned = await expect("/customers", admin.token, { name: "DEV TEST Unassigned", type: "Clinic" }, 201, "POST", `unassigned-${suffix}`); customerIds.push(unassigned.id);
    await expect(`/customers/${unassigned.id}`, admin.token, { version: unassigned.version, phone: "456" }, 200, "PATCH");
    const quoteInput = { customerId: customer.id, date: businessDate(), validityDays: 30, paymentTerms: "30 days", remarks: "Original note", ownerId: two.id, total: "0.01", lines: [{ productId: product.id, productName: "Forged name", quantity: "1.0050", unitPrice: "1.00", discount: "0.01", lineTotal: "0.01" }] };
    await expect("/quotations", two.token, quoteInput, 403, "POST", `forbidden-${suffix}`);
    await expect("/quotations", md.token, quoteInput, 403, "POST", `md-forbidden-${suffix}`);
    let quote = QuotationSchema.parse(await expect("/quotations", one.token, quoteInput, 201, "POST", `quote-${suffix}`));
    assert.equal(quote.total, "1.00"); assert.equal(quote.ownerId, one.id); assert.equal(quote.lines[0].productName, product.name);
    assert.equal(quote.customerAddressSnapshot, "Test address");
    assert.equal((await expect("/quotations", one.token, quoteInput, 201, "POST", `quote-${suffix}`)).id, quote.id);
    await expect(`/quotations/${quote.id}`, two.token, { version: quote.version, remarks: "Forbidden" }, 403, "PATCH");
    quote = QuotationSchema.parse(await expect(`/quotations/${quote.id}`, one.token, { version: quote.version, remarks: "Updated note" }, 200, "PATCH"));
    assert.equal(quote.paymentTerms, "30 days"); assert.equal(quote.total, "1.00");
    await expect(`/quotations/${quote.id}`, one.token, { version: 1, remarks: "Stale" }, 409, "PATCH");
    const payload = { version: quote.version, deliveryInstruction: "Hospital reception" };
    const concurrent = await Promise.all([call(`/quotations/${quote.id}/convert`, one.token, payload, "POST", `convert-${suffix}`), call(`/quotations/${quote.id}/convert`, one.token, payload, "POST", `convert-${suffix}`, other)]);
    assert.deepEqual(concurrent.map((value) => value.status), [201, 201]); assert.equal(concurrent[0].data.id, concurrent[1].data.id);
    let order = SalesOrderSchema.parse(concurrent[0].data); assert.equal(order.total, quote.total); assert.equal(order.quotationId, quote.id); assert.equal(order.due, "0.00");
    await expect(`/quotations/${quote.id}/convert`, one.token, payload, 409, "POST", `other-conversion-${suffix}`);
    assert.equal((await expect("/orders", two.token)).some((row: { id: string }) => row.id === order.id), false);
    await expect(`/orders/${order.id}`, two.token, { version: order.version, deliveryInstruction: "No" }, 403, "PATCH");
    order = SalesOrderSchema.parse(await expect(`/orders/${order.id}`, one.token, { version: order.version, deliveryInstruction: "Reception 2" }, 200, "PATCH"));
    assert.equal(order.paymentConditions, "30 days"); assert.equal(order.deliveryInstruction, "Reception 2");
    await expect(`/orders/${order.id}`, one.token, { version: 1, deliveryInstruction: "Stale" }, 409, "PATCH");
    await expect(`/quotations/${quote.id}`, one.token, { version: quote.version! + 1, remarks: "Converted change" }, 423, "PATCH");
    assert.equal((await expect("/orders", one.token, undefined, 200, "GET", undefined, other)).find((row: { id: string }) => row.id === order.id).deliveryInstruction, "Reception 2");
    await assert.rejects(ctx.db.update(orderLines).set({ lineTotal: "0.01" }).where(eq(orderLines.orderId, order.id)), (error: unknown) => (error as { cause?: { code?: string }; code?: string }).cause?.code === "55000" || (error as { code?: string }).code === "55000");
    await assert.rejects(ctx.db.delete(customerEntries).where(eq(customerEntries.customerId, customer.id)), (error: unknown) => (error as { cause?: { code?: string }; code?: string }).cause?.code === "55000" || (error as { code?: string }).code === "55000");
    const exposed = await ctx.db.execute<{ count: number }>(sql`select count(*)::int as count from pg_tables where schemaname = 'erp_private' and tablename in ('customers','quotations','quotation_lines','sales_orders','order_lines','customer_entries') and not rowsecurity`);
    assert.equal(exposed.rows[0].count, 0);
    console.log("Hosted sales: all customer/quotation/order checks passed; no stock or receivable was posted by conversion.");
  } finally {
    for (const server of servers) await new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });
    if (customerIds.length) await ctx.db.update(customers).set({ active: false }).where(inArray(customers.id, customerIds));
    if (productIds.length) await ctx.db.update(products).set({ active: false }).where(inArray(products.id, productIds));
    for (const row of identities) {
      await ctx.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.employeeId, row.id));
      await ctx.db.update(employees).set({ status: "Inactive" }).where(eq(employees.id, row.id));
      const removed = await ctx.admin.auth.admin.deleteUser(row.authId);
      if (removed.error) { cleanupFailed = true; console.error("Temporary Auth cleanup needs retry; no business history was deleted."); }
      else await ctx.db.update(employees).set({ authUserId: null }).where(eq(employees.id, row.id));
    }
    await ctx.client.end(); await second.client.end();
  }
  assert.equal(cleanupFailed, false, "Temporary Auth cleanup must succeed");
});
