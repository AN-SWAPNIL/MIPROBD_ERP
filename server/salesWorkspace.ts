import { Decimal } from "decimal.js";
import type { Collection, Customer, Delivery, Quotation, SalesInvoice, SalesLine, SalesOrder, SalesOrderWorkspace, StockMovement } from "../src/domains/erp.types.js";

type WorkspaceRecords = {
  order: SalesOrder; customer?: Customer; quotation?: Quotation;
  salesperson?: SalesOrderWorkspace["salesperson"];
  deliveries: Delivery[]; invoices: SalesInvoice[]; collections: Collection[]; stockMovements: StockMovement[];
};

const Amount = Decimal.clone({ precision: 48, rounding: Decimal.ROUND_HALF_UP });
const sum = (values: string[]) => values.reduce((total, value) => total.plus(value), new Amount(0));
const quantityFor = (lines: SalesLine[], productId: string) => sum(lines.filter((line) => line.productId === productId).map((line) => line.quantity));

// Lifecycle data is a projection of posted records, never a second transaction store.
export function buildSalesOrderWorkspace(records: WorkspaceRecords): SalesOrderWorkspace {
  const { order, customer, quotation, salesperson } = records;
  const deliveries = records.deliveries.filter((delivery) => delivery.orderId === order.id);
  const posted = deliveries.filter((delivery) => delivery.status !== "Draft");
  const invoices = records.invoices.filter((invoice) => invoice.orderId === order.id);
  const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
  const collections = records.collections.flatMap((collection) => {
    if (collection.status !== "Posted") return [];
    if (collection.allocations?.length) {
      const amount = sum(collection.allocations.filter((allocation) => allocation.orderId === order.id || Boolean(allocation.invoiceId && invoiceIds.has(allocation.invoiceId))).map((allocation) => allocation.amount));
      return amount.gt(0) ? [{ ...collection, receiptAmount: collection.receiptAmount ?? collection.amount, amount: amount.toFixed(2) }] : [];
    }
    return collection.orderId === order.id || Boolean(collection.invoiceId && invoiceIds.has(collection.invoiceId)) ? [collection] : [];
  });
  const approved = invoices.filter((invoice) => invoice.status === "Approved");
  const drafts = invoices.filter((invoice) => invoice.status === "Draft");
  const fulfilment = [...new Map(order.lines.map((line) => [line.productId, line])).values()].map((line) => {
    const ordered = quantityFor(order.lines, line.productId);
    const delivered = quantityFor(posted.flatMap((delivery) => delivery.lines), line.productId);
    const approvedQty = quantityFor(approved.flatMap((invoice) => invoice.lines), line.productId);
    const draftQty = quantityFor(drafts.flatMap((invoice) => invoice.lines), line.productId);
    return { productId: line.productId, productCode: line.productCode, productName: line.productName,
      orderedQty: ordered.toFixed(4), deliveredQty: delivered.toFixed(4), draftInvoicedQty: draftQty.toFixed(4), approvedInvoicedQty: approvedQty.toFixed(4),
      remainingToDeliverQty: Amount.max(0, ordered.minus(delivered)).toFixed(4), deliveredNotInvoicedQty: Amount.max(0, delivered.minus(approvedQty)).toFixed(4) };
  });
  const deliveredAny = fulfilment.some((line) => new Amount(line.deliveredQty).gt(0));
  const approvedValue = sum(approved.map((invoice) => invoice.total));
  const collected = sum(collections.map((collection) => collection.amount));
  const challans = new Set(posted.map((delivery) => delivery.challanNumber));
  return { order, customer, quotation, salesperson, financialVisible: true, deliveries, invoices, collections,
    stockMovements: records.stockMovements.filter((movement) => movement.type === "Dispatch" && challans.has(movement.reference)), fulfilment,
    totals: { orderValue: order.total, deliveredValue: sum(posted.flatMap((delivery) => delivery.lines).map((line) => line.lineTotal)).toFixed(2),
      draftInvoiceValue: sum(drafts.map((invoice) => invoice.total)).toFixed(2), approvedInvoiceValue: approvedValue.toFixed(2), collectedValue: collected.toFixed(2), outstandingValue: Amount.max(0, approvedValue.minus(collected)).toFixed(2) },
    stages: { quotation: quotation ? "Complete" : "Direct", order: order.status === "Cancelled" ? "Cancelled" : "Active",
      delivery: !deliveredAny ? "Not Started" : fulfilment.every((line) => new Amount(line.remainingToDeliverQty).eq(0)) ? "Complete" : "Partial",
      invoice: drafts.length ? "Draft Pending" : !approved.length ? "Not Started" : deliveredAny && fulfilment.every((line) => new Amount(line.approvedInvoicedQty).gte(line.deliveredQty)) ? "Complete" : "Partial",
      collection: approvedValue.eq(0) ? "Not Due" : collected.eq(0) ? "Unpaid" : collected.gte(approvedValue) ? "Paid" : "Partial" }
  };
}

const restrictedLine = <T extends SalesLine>(line: T): T => ({ ...line, unitPrice: "Restricted", discount: "Restricted", lineTotal: "Restricted" });

export function restrictOrderFinancials<T extends SalesOrder>(order: T): T {
  return { ...order, total: "Restricted", due: "Restricted", amountReceived: "Restricted", paymentConditions: "Restricted", paymentConfirmation: undefined, paymentReference: undefined, paymentDate: undefined, lines: order.lines.map(restrictedLine) };
}

export function restrictDeliveryFinancials<T extends Delivery>(delivery: T): T {
  return { ...delivery, lines: delivery.lines.map(restrictedLine) };
}

export function restrictWorkspaceFinancials(workspace: SalesOrderWorkspace): SalesOrderWorkspace {
  return { ...workspace, financialVisible: false, totals: undefined, customer: undefined, quotation: undefined, invoices: [], collections: [],
    order: restrictOrderFinancials(workspace.order),
    deliveries: workspace.deliveries.map(restrictDeliveryFinancials),
    fulfilment: workspace.fulfilment.map((line) => ({ ...line, draftInvoicedQty: "Restricted", approvedInvoicedQty: "Restricted", deliveredNotInvoicedQty: "Restricted" })),
    stages: { ...workspace.stages, invoice: undefined, collection: undefined }
  };
}
