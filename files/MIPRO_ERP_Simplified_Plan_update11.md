# MIPRO ERP — Sales Lifecycle & Linked Documents Plan (Update 11)

**Target:** Add an Order-centered Sales lifecycle workspace without duplicating data or changing the simplified main navigation.

**Base branch audited:** `dev` at `f1fd0a985a8194437892cdd3f90e9f0f67292598`

## 1. Final target

Keep the existing main navigation unchanged.

Inside **Sales & Marketing**, keep:

```text
Customers
Marketing
Quotations & Orders
Deliveries
Collections
```

Add one dedicated record workspace:

```text
/app/sales/orders/:orderId
```

This becomes the canonical place to follow one Order from Quotation through Collection.

---

## 2. Use SalesOrder as the lifecycle anchor

Do not create a `SalesCase` entity.

Reuse existing links:

```text
Quotation.id
    ↓ SalesOrder.quotationId
SalesOrder.id
    ↓ Delivery.orderId
SalesOrder.id
    ↓ SalesInvoice.orderId
Delivery.id[]
    ↓ SalesInvoice.deliveryIds[]
SalesOrder.id / SalesInvoice.id
    ↓ Collection.orderId / Collection.invoiceId
```

Build a derived workspace response from these records.

---

## 3. Add `SalesOrderWorkspace` type/schema

Recommended shape:

```ts
type SalesOrderWorkspace = {
  order: SalesOrder;
  quotation?: Quotation;
  customer: Customer;
  salesperson?: {
    id: string;
    name: string;
    employeeCode?: string;
    title?: string;
    territory?: string;
  };

  deliveries: Delivery[];
  invoices: SalesInvoice[];
  collections: Collection[];
  stockMovements: StockMovement[];

  fulfilment: Array<{
    productId: string;
    productCode: string;
    productName: string;
    orderedQty: string;
    deliveredQty: string;
    draftInvoicedQty: string;
    approvedInvoicedQty: string;
    remainingToDeliverQty: string;
    deliveredNotInvoicedQty: string;
  }>;

  totals: {
    orderValue: string;
    deliveredValue: string;
    draftInvoiceValue: string;
    approvedInvoiceValue: string;
    collectedValue: string;
    outstandingValue: string;
  };

  stages: {
    quotation: "Complete" | "Direct";
    order: "Active" | "Cancelled";
    delivery: "Not Started" | "Partial" | "Complete";
    invoice: "Not Started" | "Draft Pending" | "Partial" | "Complete";
    collection: "Not Due" | "Unpaid" | "Partial" | "Paid";
  };
};
```

Use Decimal-based calculations server-side.

---

## 4. Add backend workspace endpoint

```text
GET /api/orders/:orderId/workspace
```

Responsibilities:

1. enforce Sales permission;
2. enforce Sales Executive own-record scope;
3. load Order;
4. resolve linked Quotation;
5. resolve Customer;
6. resolve Salesperson;
7. collect all Deliveries for Order;
8. collect all Invoices for Order;
9. collect all Posted Collections linked to the Order or its Invoices;
10. resolve dispatch Stock Movements through Delivery Challan references;
11. calculate per-product fulfilment;
12. calculate lifecycle stages;
13. calculate Order-specific financial totals;
14. return only allowed data.

Do not expose landed cost/profit by default.

---

## 5. P0 integrity fix: Collection must infer Order from Invoice

Current risk:

```text
invoiceId supplied
orderId omitted
→ Customer due updates
→ Cash/Bank updates
→ Order due can remain stale
```

Fix:

```ts
const linkedInvoice = ...;
const explicitOrder = ...;
const linkedOrder = explicitOrder
  ?? (linkedInvoice?.orderId
      ? orders.find(order => order.id === linkedInvoice.orderId)
      : undefined);
```

Then validate Customer / Invoice / Order consistency and update:

```text
order.amountReceived
order.due
```

---

## 6. Add frontend service

In `salesService` add:

```ts
orderWorkspace(orderId)
```

calling:

```text
/api/orders/:orderId/workspace
```

Add a Zod schema consistent with the rest of the project.

---

## 7. Add explicit route

In `src/App.tsx`, before the generic `sales/*` fallback:

```tsx
<Route
  path="sales/orders/:orderId"
  element={guarded("sales", <SalesOrderWorkspacePage />)}
/>
```

Do not let the wildcard redirect swallow this page.

---

## 8. Create `SalesOrderWorkspacePage.tsx`

Recommended file:

```text
src/domains/sales/SalesOrderWorkspacePage.tsx
```

### Header

Show:

- Order number
- Customer
- Salesperson
- Date
- Order status

Contextual actions:

- Back to Sales
- Print Order
- Customer Ledger
- Open Report
- New Delivery
- Create Invoice
- Record Collection

Hide actions when not allowed or not applicable.

---

## 9. Shared lifecycle progress component

Extract the current Import milestone UI into:

```text
src/components/ui/LifecycleProgress.tsx
```

Possible API:

```ts
type LifecycleStep = {
  id: string;
  label: string;
  state: "complete" | "current" | "pending" | "warning" | "cancelled";
  detail?: string;
};
```

Use it for both:

### Import

```text
Draft → PI Received → LC/TT Opened → ... → Received
```

### Sales

```text
Quotation → Order → Delivery → Invoice → Collection
```

Import behavior must remain unchanged.

---

## 10. Derived lifecycle rules

### Quotation

```text
linked converted quotation → Complete
no linked quotation         → Direct
```

### Delivery

```text
0 delivered               → Not Started
0 < delivered < ordered   → Partial
all ordered delivered     → Complete
```

### Invoice

```text
no invoice coverage                       → Not Started
draft invoice exists                      → Draft Pending
approved invoiced < delivered             → Partial
approved invoiced covers delivered        → Complete
```

Cancelled Invoices do not count.

### Collection

```text
approved invoice value = 0               → Not Due
approved > 0 and collected = 0           → Unpaid
0 < collected < approved invoice value   → Partial
collected >= approved invoice value      → Paid
```

Use Order/Invoice-linked collections, not Customer total due.

---

## 11. Workspace summary cards

Use only five:

```text
Order Value
Delivered Value
Approved Invoice
Collected
Outstanding
```

Do not turn the page into another dashboard.

---

## 12. Product fulfilment table

Main table:

```text
Product
Ordered
Delivered
Approved Invoiced
Remaining to Deliver
Delivered not yet Invoiced
```

Optional status:
- Pending
- Partial
- Complete

Do not show sensitive cost by default.

---

## 13. Linked document sections

### Quotation
- quotation number
- date
- total
- status
- Print

### Delivery Challans
- challan
- date
- quantity
- product/batch summary
- status
- Print
- New Delivery when remaining quantity exists

### Invoices
- invoice number
- date
- linked challans
- amount
- status
- Approve / Cancel when permitted
- Print
- Create Invoice when uninvoiced delivery exists

### Collections
- receipt
- date
- payment mode
- reference
- amount
- Print
- Record Collection when Approved outstanding amount exists

Reuse existing operations; do not add duplicate posting logic.

---

## 14. Reuse current forms

Reuse:

- `DeliveryForm`
- Collection form
- Invoice creation logic/UI
- Order Receiving Details form

Extract current inline forms only if needed so both SalesPage and SalesOrderWorkspacePage share the same components.

Do not maintain duplicate forms.

---

## 15. Update SalesPage

### Quotations & Orders

Add an `Open` / `Open Flow` action for each Sales Order:

```text
/app/sales/orders/:orderId
```

Keep current Order Receiving Details and Print actions.

### Deliveries

Add:
- Open Order

### Invoice register

Add:
- Open Order
- Customer Ledger

### Collections

Add where linked:
- Open Order
- Customer Ledger

Keep the existing Sales views unchanged.

---

## 16. Customer integration

Keep the current Customer Ledger operational UI.

Optional small addition:
- show `View Orders` from Customer context.

Do not embed every Order lifecycle inside Customer.

---

## 17. Inventory integration

No stock logic changes.

Keep:

```text
Delivery posting
→ FIFO allocation
→ StockBatch reduction
→ StockMovement Dispatch
```

Sales Order Workspace should show the actual batches used.

P1 optional:
- Inventory dispatch `Reference` opens related Sales Order when resolvable.

No new Inventory tab.

---

## 18. Accounts integration

No Expense workflow change.

Required:
- infer Sales Order from linked Invoice during Collection posting.

P1 optional:
- Collection AccountTransaction can navigate to Money Receipt / Order.

Do not duplicate Cash/Bank balances inside Sales.

---

## 19. Employees / Marketing integration

No new Employee model.

For ERP-generated activity references:

```text
SalesOrder  → Sales Order Workspace
Delivery    → related Sales Order Workspace
SalesInvoice→ related Sales Order Workspace
Collection  → related Sales Order Workspace
```

Keep formal Employee reports under Reports.

---

## 20. Reports integration

Do not redesign the Update 10 catalogue.

Add:

```ts
ReportFilterKey += "order"
```

where useful:

- Sales Order Register
- Order Fulfilment Difference
- Delivery Challan Register
- Sales Invoice Register
- Sales Sheet
- Customer Collection Report

Then allow:

```text
Sales Order Workspace → Open Report
```

with the current Order preselected.

Do not add a new Sales Lifecycle report in P0.

---

## 21. Delivery Approval business decision

Add/verify in Settings → Decisions:

**Title:** Delivery Challan Approval

**Question:** Does a Delivery Challan require separate manager approval before stock is deducted?

**Current behavior:** Posting/dispatching the challan is final and immediately performs FIFO stock-out.

If posting is final:
- no workflow change.

If separate approval is required later:

```text
Draft Delivery
→ Approved / Posted
→ Stock Out
```

Do not implement this until confirmed by the client.

---

## 22. RBAC

Reuse existing access rules.

### Sales Executive
- own Orders / Customers / linked records only.

### Sales Manager
- team records according to existing scope.

### Warehouse Manager
- delivery/stock context only according to permissions.

### Accounts
- collection/receivable context according to existing permissions.

### MD / Super Admin
- broad access subject to sensitive capabilities.

The workspace endpoint must enforce scope server-side.

---

## 23. Financial invariants

Keep:

```text
Delivery Challan
≠ Customer Ledger debit

Approved Invoice
= Customer Ledger debit

Posted Collection
= Customer Ledger credit
= Cash/Bank inflow
```

Never count Delivery and Invoice as two financial sales.

---

## 24. Implementation order

### P0 — lifecycle visibility + integrity

1. Add `SalesOrderWorkspace` type/schema.
2. Add `GET /api/orders/:orderId/workspace`.
3. Enforce server-side own/team scope.
4. Fix Collection to infer Order from linked Invoice.
5. Add `salesService.orderWorkspace()`.
6. Add `/app/sales/orders/:orderId` route.
7. Create `SalesOrderWorkspacePage`.
8. Add lifecycle progress.
9. Add five summary cards.
10. Add product fulfilment table.
11. Add linked Quotation/Delivery/Invoice/Collection sections.
12. Reuse existing print routes.
13. Reuse current forms/actions.
14. Add Open Flow from Sales Orders.
15. Add Open Order links from Deliveries, Invoices and Collections.
16. Add Customer Ledger shortcut.
17. Add canonical Report shortcut.

### P0 — visual consistency

18. Extract `LifecycleProgress` from Import milestone UI.
19. Refactor Import to use it with no behavior change.
20. Use it in Sales Order Workspace.

### P1 — traceability

21. Add `order` report filter.
22. Deep-link Sales Order Workspace → filtered reports.
23. Make Employee sales references clickable.
24. Optionally make Inventory dispatch references clickable.
25. Optionally link Collection account transactions back to source Order/Receipt.

### P1 — client decision

26. Add/verify Delivery Challan Approval decision.
27. Keep current flow if posting = approval.
28. Plan separate approval only if client explicitly requires it.

---

## 25. UAT

### Quotation → Order
- [ ] Convert quotation.
- [ ] Quotation becomes Converted.
- [ ] Order preserves lines/prices/discount.
- [ ] Order Workspace shows both.

### Partial Delivery
- [ ] Post part of quantity.
- [ ] FIFO stock decreases exactly.
- [ ] Stock Movement uses challan reference.
- [ ] Delivery stage = Partial.
- [ ] Remaining quantity is correct.

### Full Delivery
- [ ] Deliver remaining quantity.
- [ ] Order = Delivered.
- [ ] Delivery stage = Complete.

### Draft Invoice
- [ ] Create from posted Delivery.
- [ ] Invoice stage = Draft Pending.
- [ ] Customer due unchanged.
- [ ] Order due unchanged.

### Approve Invoice
- [ ] Invoice = Approved.
- [ ] Customer due increases once.
- [ ] Customer sales increases once.
- [ ] Order due increases once.
- [ ] Delivery creates no second debit.

### Collection
- [ ] Post collection linked only to Invoice.
- [ ] Server infers its Order.
- [ ] Customer due decreases.
- [ ] Account balance increases.
- [ ] Order amountReceived increases.
- [ ] Order due decreases.
- [ ] Collection stage becomes Partial/Paid.

### Cancellation
- [ ] Approved Invoice reversal updates Customer and Order due.
- [ ] Cannot cancel while Posted Collection remains linked.
- [ ] Reason appears in audit.

### RBAC
- [ ] Sales Executive cannot open another owner's Order URL.
- [ ] Warehouse role does not gain financial access accidentally.
- [ ] Sensitive cost/profit remains hidden.

### Reports
- [ ] Open Report uses canonical Reports route.
- [ ] Order filter is preserved where supported.

### Import regression
- [ ] Import milestone bar still renders correctly.
- [ ] No Import costing/status/receipt behavior changes.

---

## 26. Definition of done

Update 11 is complete when one Sales Order screen can answer:

```text
Where did this Order come from?
What was ordered?
What has been delivered?
Which batches left stock?
What has been invoiced?
Which Invoice is approved?
How much has been collected?
How much remains outstanding?
Where are the linked documents?
Where is the Customer Ledger/report?
Who is the responsible salesperson?
```

All answers must come from the existing authoritative records, not duplicated lifecycle data.

Final architecture:

```text
Sales & Marketing
    ↓
Sales Order Workspace
    ├── Quotation
    ├── Deliveries
    │      └── Inventory stock movements
    ├── Invoices
    │      └── Customer Ledger debit on approval
    ├── Collections
    │      ├── Customer Ledger credit
    │      └── Cash/Bank inflow
    ├── Employee/Salesperson context
    └── Reports deep links
```
