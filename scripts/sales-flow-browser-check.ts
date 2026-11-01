import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { cashAccounts, customers, products, suppliers } from "../database/schema.js";
import { hostedHarness } from "../server/testing/hosted.js";
import { businessDate } from "../src/lib/date.js";
import { salesBackendBrowserSmoke } from "./sales-backend-browser-smoke.js";
let phase = "setup";
async function main() {
  process.env.APP_URL = "http://localhost:5187";
  const h = await hostedHarness("sales-flow"); const customerIds: string[] = [];
  let productId: string | undefined; let supplierId: string | undefined; let accountId: string | undefined;
  try {
    phase = "test-identity";
    const user = await h.employee("Super Admin", ["view_sensitive_cost", "edit_sensitive_cost", "finalize_landed_cost", "approve_stock_override"]);
    const today = businessDate(); const prior = new Date(`${today}T00:00:00Z`); prior.setUTCDate(prior.getUTCDate() - 1);
    const expiry = new Date(`${today}T00:00:00Z`); expiry.setUTCFullYear(expiry.getUTCFullYear() + 2);
    phase = "supplier";
    supplierId = (await h.expect("/suppliers", user.token, { name: `DEV TEST sales-flow ${h.suffix}`, country: "China" }, 201)).id;
    phase = "product";
    productId = (await h.expect("/products", user.token, { code: `TEST-FLOW-${h.suffix}`, name: "DEV TEST browser-flow dialyzer", family: "Dialyzer", variant: "Test", unit: "pcs", standardSalePrice: "1.00" }, 201)).id;
    phase = "import";
    const record = await h.expect("/imports", user.token, { supplierId, poNumber: `TEST-FLOW-${h.suffix}`, poDate: prior.toISOString().slice(0, 10), piNumber: "DEV TEST PI", paymentMode: "TT", ttReference: `TEST-FLOW-${h.suffix}`, currency: "BDT", exchangeRate: "1", items: [{ productId, quantity: "10", currency: "BDT", fobUnitForeign: "1", exchangeRate: "1", cbmMode: "MANUAL", totalCbm: "1" }] }, 201, h.key("import"));
    await h.expect(`/imports/${record.id}/costs`, user.token, { name: "Freight", category: "Freight", amountForeign: "10", currency: "BDT", exchangeRate: "1", allocationMethod: "QUANTITY" }, 201);
    await h.expect(`/imports/${record.id}/finalize`, user.token, {}, 200, h.key("finalize"));
    await h.expect(`/imports/${record.id}/receive`, user.token, { receivedDate: today, lines: [{ importItemId: record.items[0].id, quantityReceived: "10", quantityRejected: "0", lotNumber: `TEST-FLOW-${h.suffix}`, batchNumber: `TEST-FLOW-${h.suffix}`, manufacturingDate: prior.toISOString().slice(0, 10), expiryDate: expiry.toISOString().slice(0, 10), warehouse: "Main Warehouse", location: "DEV TEST" }] }, 201, h.key("receive"));
    accountId = (await h.expect("/settings/accounts", user.token, { name: `DEV TEST flow-bank ${h.suffix}`, type: "Bank", accountNumber: "TEST", balance: "0" }, 201, h.key("bank"))).id;
    phase = "browser-workflow";
    await salesBackendBrowserSmoke(h.bases[0], user.email, h.password, productId!, accountId!, h.suffix, (id) => customerIds.push(id));
    phase = "reconciliation";
    const stock = await h.expect(`/inventory/batches/page?productId=${productId}`, user.token); assert.equal(stock.rows.length, 1); assert.equal(stock.rows[0].quantityAvailable, process.env.BACKEND_BROWSER_ONLY_MOBILE === "true" ? "9.7000" : "9.4000");
    const accounts = await h.expect("/accounts", user.token); assert.equal(accounts.find((row: { id: string }) => row.id === accountId).balance, "0.00");
    console.log(`${process.env.BACKEND_BROWSER_ONLY_MOBILE === "true" ? "Mobile" : "Desktop/mobile"} quotation, partial FIFO deliveries, invoice approval, collection and reversal reconcile to saved stock and bank journals.`);
  } finally {
    if (productId) await h.ctx.db.update(products).set({ active: false }).where(eq(products.id, productId));
    if (supplierId) await h.ctx.db.update(suppliers).set({ active: false }).where(eq(suppliers.id, supplierId));
    if (accountId) await h.ctx.db.update(cashAccounts).set({ active: false }).where(eq(cashAccounts.id, accountId));
    if (customerIds.length) await h.ctx.db.update(customers).set({ active: false }).where(inArray(customers.id, customerIds));
    await h.close();
  }
}
main().catch((error) => { const code = error?.cause?.code ?? error?.code; const reason = error?.name === "AssertionError" ? String(error.message).split("\n")[0].slice(0, 250) : undefined; const location = String(error?.stack ?? "").match(/sales-backend-browser-smoke\.ts:\d+:\d+/)?.[0]; const waiting = Array.isArray(error?.log) ? error.log.find((line: string) => /waiting for getBy/.test(line))?.slice(0, 200) : undefined; console.error("Sales flow-browser check failed", { phase, type: error?.name, code: typeof code === "string" && /^[A-Z0-9_]+$/.test(code) ? code : "BROWSER_OR_DEPENDENCY", reason, location, waiting }); process.exitCode = 1; });
