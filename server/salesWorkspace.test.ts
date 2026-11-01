import assert from "node:assert/strict";
import test from "node:test";
import { collections, customers, deliveries, invoices, orders, quotations, stockMovements } from "./data.js";
import { buildSalesOrderWorkspace, restrictWorkspaceFinancials } from "./salesWorkspace.js";
import { SalesOrderWorkspaceSchema } from "../src/domains/schemas.js";

function records() {
  return structuredClone({ order: orders.find((order) => order.id === "so-3")!, customer: customers.find((customer) => customer.id === "cus-kuwait")!, quotation: quotations.find((quote) => quote.id === "quo-3"), deliveries, invoices, collections, stockMovements });
}

test("workspace derives order-specific totals, linked documents and stock without counting customer-wide collections", () => {
  const data = records();
  data.collections.push({ ...data.collections[0], id: "unrelated", customerId: data.order.customerId, orderId: undefined, invoiceId: undefined, amount: "999.00" });
  const workspace = SalesOrderWorkspaceSchema.parse(buildSalesOrderWorkspace(data));
  assert.equal(workspace.totals?.approvedInvoiceValue, "85200.00");
  assert.equal(workspace.totals?.collectedValue, "60000.00");
  assert.equal(workspace.totals?.outstandingValue, "25200.00");
  assert.equal(workspace.stages.collection, "Partial");
  assert.equal(workspace.stages.delivery, "Complete");
  assert.equal(workspace.stockMovements.length, 1);
  assert.equal(workspace.fulfilment[0].remainingToDeliverQty, "0.0000");
});

test("invoice-only collections resolve once and exclude reversed receipts", () => {
  const data = records();
  data.collections = data.collections.filter((entry) => entry.id === "col-4").map((entry) => ({ ...entry, orderId: undefined, amount: "85200.00" }));
  data.collections.push({ ...data.collections[0], id: "reversed", status: "Reversed" });
  const workspace = buildSalesOrderWorkspace(data);
  assert.equal(workspace.collections.length, 1);
  assert.equal(workspace.totals?.collectedValue, "85200.00");
  assert.equal(workspace.stages.collection, "Paid");
});

test("customer-level receipts count only their actual allocation to this order", () => {
  const data = records();
  data.collections = [{ ...data.collections[0], id: "multi-order", customerId: data.order.customerId, orderId: undefined, invoiceId: undefined, amount: "1000.00", allocations: [
    { entryId: "one", orderId: data.order.id, invoiceId: "inv-2", amount: "250.01" },
    { entryId: "two", orderId: "other-order", amount: "749.99" }
  ] }];
  const result = buildSalesOrderWorkspace(data);
  assert.equal(result.totals?.collectedValue, "250.01");
  assert.equal(result.collections[0].amount, "250.01");
  assert.equal(result.collections[0].receiptAmount, "1000.00");
});

test("partial quantities, draft coverage and cancelled invoices have separate lifecycle effects", () => {
  const data = records();
  data.deliveries = data.deliveries.filter((entry) => entry.orderId === data.order.id);
  data.deliveries[0].lines[0].quantity = "40";
  data.deliveries[0].lines[0].lineTotal = "28400.00";
  data.invoices = [];
  data.collections = [];
  let result = buildSalesOrderWorkspace(data);
  assert.equal(result.stages.delivery, "Partial");
  assert.equal(result.fulfilment[0].remainingToDeliverQty, "80.0000");
  assert.equal(result.stages.invoice, "Not Started");
  assert.equal(result.stages.collection, "Not Due");
  const invoice = structuredClone(invoices.find((entry) => entry.id === "inv-2")!);
  invoice.lines[0].quantity = "40";
  invoice.total = "28400.00";
  invoice.status = "Draft";
  data.invoices.push(invoice);
  result = buildSalesOrderWorkspace(data);
  assert.equal(result.stages.invoice, "Draft Pending");
  assert.equal(result.totals?.approvedInvoiceValue, "0.00");
  assert.equal(result.fulfilment[0].draftInvoicedQty, "40.0000");
  invoice.status = "Approved";
  assert.equal(buildSalesOrderWorkspace(data).stages.invoice, "Complete");
  invoice.status = "Cancelled";
  result = buildSalesOrderWorkspace(data);
  assert.equal(result.stages.invoice, "Not Started");
  assert.equal(result.fulfilment[0].approvedInvoicedQty, "0.0000");
});

test("draft delivery, product differences and duplicate order lines cannot fake fulfilment", () => {
  const data = records();
  data.order.lines.push({ ...data.order.lines[0], id: "more", quantity: "0.1" });
  data.order.lines.push({ ...data.order.lines[0], id: "other", productId: "other-product", quantity: "1" });
  const result = buildSalesOrderWorkspace(data);
  assert.equal(result.fulfilment.length, 2);
  assert.equal(result.fulfilment[0].orderedQty, "120.1000");
  assert.equal(result.fulfilment[0].remainingToDeliverQty, "0.1000");
  assert.equal(result.stages.delivery, "Partial");
  data.deliveries.forEach((entry) => { entry.status = "Draft"; });
  assert.equal(buildSalesOrderWorkspace(data).stages.delivery, "Not Started");
});

test("warehouse projection strips every financial value without changing authoritative records", () => {
  const result = buildSalesOrderWorkspace(records());
  const restricted = SalesOrderWorkspaceSchema.parse(restrictWorkspaceFinancials(result));
  assert.equal(restricted.financialVisible, false);
  assert.equal(restricted.totals, undefined);
  assert.equal(restricted.customer, undefined);
  assert.equal(restricted.quotation, undefined);
  assert.equal(restricted.invoices.length, 0);
  assert.equal(restricted.collections.length, 0);
  assert.equal(restricted.order.total, "Restricted");
  assert.equal(restricted.order.lines[0].unitPrice, "Restricted");
  assert.equal(restricted.deliveries[0].lines[0].lineTotal, "Restricted");
  assert.equal(result.order.total, "85200.00");
});

test("workspace totals preserve poisha near the database money precision", () => {
  const data = records(); const invoice = data.invoices.find((entry) => entry.orderId === data.order.id)!;
  invoice.total = "9999999999999999999999.99"; invoice.status = "Approved";
  data.invoices = [invoice];
  data.collections = [{ ...data.collections[0], orderId: data.order.id, invoiceId: invoice.id, amount: "0.01", status: "Posted" }];
  const result = buildSalesOrderWorkspace(data);
  assert.equal(result.totals?.outstandingValue, "9999999999999999999999.98");
});
