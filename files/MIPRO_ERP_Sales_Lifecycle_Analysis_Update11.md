# MIPRO ERP — Sales Lifecycle Analysis (Update 11)

**Date:** 20 September 2026  
**Project:** Medical Supplier ERP / MIPRO Healthcare Corporation  
**Repository:** `AN-SWAPNIL/Medical_Supplier_ERP`  
**Audited branch:** `dev`  
**Audited head:** `f1fd0a985a8194437892cdd3f90e9f0f67292598` — `fix: unify report print preview actions`

## 1. Executive conclusion

The client's handwritten sales diagram is **not only a report specification**. It mixes three things:

1. real operational flow,
2. financial/ledger effects,
3. analytical/report outputs.

The clean interpretation for MIPRO is:

```text
Customer / Lead
    ↓
Quotation
    ↓
Sales Order
    ↓
Delivery Challan
    ↓
Stock Out
    ↓
Sales Invoice
    ↓
Invoice Approval
    ↓
Customer Ledger / Receivable
    ↓
Collection
    ↓
Cash / Bank + Reduced Due

The same linked records feed:
- product-wise reports
- customer-wise reports
- salesperson-wise reports
- collection report
- dues report
- monthly/period summaries
```

The current ERP already contains almost all of the required records and posting rules. The main missing piece is **one concise Order-centered lifecycle workspace** that lets the user follow all linked records as one business process, similar in concept to the current Import Case workspace.

This should therefore be a **Sales Lifecycle & Linked Documents update**, not a new Sales module, not a new accounting model, and not another reporting redesign.

---

## 2. Why Import is the correct project precedent

The current Imports module already follows a connected-case pattern:

```text
Imports Register
    ↓
Import Case Workspace
    ↓
Draft
→ PI Received
→ LC/TT Opened
→ In Production
→ Shipped
→ At Port
→ Costing
→ Cost Finalized
→ Partially Received
→ Received
```

`ImportWorkspacePage.tsx` combines milestones, commercial information, shipment, products, cost allocation, documents, landed-cost finalization and warehouse receipt in one case.

Sales should use the same **design principle**, but stay lighter:

```text
Sales Order Workspace
├── Quotation
├── Order
├── Delivery Challans
├── Invoices
├── Collections
└── Linked Ledger / Reports
```

Do not copy the large Import accordion structure into Sales.

---

## 3. Current Sales data model is already linked

The current types already contain the important relationships:

```text
Quotation
- customerId
- leadId
- ownerId

SalesOrder
- quotationId
- customerId
- ownerId

Delivery
- orderId
- customerId
- salesOwnerId
- batchId on each line

SalesInvoice
- orderId
- deliveryIds[]
- customerId
- ownerId

Collection
- orderId?
- invoiceId?
- customerId
- ownerId
```

Therefore **do not create a persistent `SalesCase` entity**. `SalesOrder` is already the natural lifecycle anchor.

---

## 4. Current backend flow audit

### 4.1 Quotation → Order

The current backend already:

- converts a Quotation into a Sales Order;
- carries customer snapshot and line items without re-entry;
- links with `quotationId`;
- creates an `SO-...` reference;
- changes the quotation to `Converted`;
- advances the marketing lead to the Order stage.

This is correct and should be reused.

### 4.2 Order → Delivery Challan → Inventory

Delivery posting currently:

- validates the Sales Order;
- prevents delivery of products not on the Order;
- prevents over-delivery;
- applies FIFO batch allocation;
- requires capability + reason for a FIFO override;
- creates a Delivery Challan;
- reduces batch stock immediately;
- writes Stock Movement dispatch records;
- updates Order status to `Partially Delivered` or `Delivered`;
- writes audit history.

So the current Delivery event is already a **final posted operational event**, even though the stored status is called `Dispatched`.

### 4.3 Delivery → Draft Invoice

One Invoice can include one or more posted Delivery Challans from the same Order and Customer.

The API blocks reusing a challan already included in another non-cancelled Invoice.

The Invoice begins as `Draft`, and at this point:

- Customer due does not increase;
- Order due does not increase.

This is correct.

### 4.4 Invoice Approval → Customer Receivable

Approval currently performs:

```text
Invoice.status = Approved
Customer.currentDue += invoice.total
Customer.totalSales += invoice.total
Order.due += invoice.total
```

This correctly makes **Approved Invoice** the financial sales event.

### 4.5 Invoice Cancellation

Current cancellation logic:

- requires a reason;
- reverses Customer due and total sales when previously Approved;
- reverses Order due;
- blocks cancellation while a Posted Collection remains linked;
- writes audit history.

This is good and should not be rewritten.

### 4.6 Collection → Customer + Cash/Bank

A Posted Collection currently:

- validates the Customer;
- validates scope;
- requires a real payment mode;
- posts into an active Cash/Bank/Mobile Banking account;
- reduces Customer due;
- increases Customer total collected;
- increases the destination Account balance;
- creates an AccountTransaction;
- updates Order amount received/due when an Order is explicitly linked;
- writes audit history.

The accounting direction is correct.

---

## 5. Integrity issue found: invoice-linked collection can miss Order update

There is one edge case worth fixing now.

The Collection endpoint resolves `linkedOrder` only from an explicit `orderId`, while `linkedInvoice` is resolved separately.

If a collection is posted against an Approved Invoice but the request omits `orderId`, then:

- Customer due updates correctly;
- Cash/Bank updates correctly;
- Collection links to the Invoice;
- but `SalesOrder.amountReceived` and `SalesOrder.due` may stay stale.

Because an Invoice already contains `invoice.orderId`, the server should infer the Order:

```text
linkedInvoice = selected approved invoice

linkedOrder =
    explicit order
    OR invoice.orderId
    OR undefined
```

Then validate Customer / Invoice / Order consistency before posting.

This is a **P0 data-integrity fix** for the new lifecycle workspace.

---

## 6. Customer Ledger should stay exactly as it is conceptually

Current ledger logic derives financial history from:

```text
Opening Due
+ Approved Invoice debit
- Posted Collection credit
± Invoice reversal
```

Delivery remains operational context only.

Do **not** interpret the client's arrows as both Delivery and Invoice debiting the Customer.

Correct MIPRO rule:

```text
Delivery Challan
→ physical fulfilment
→ stock dispatch
→ delivery reports

Approved Invoice
→ financial sale
→ customer ledger debit

Posted Collection
→ customer ledger credit
→ cash/bank inflow
```

This prevents double-counting.

---

## 7. Reports are already in the right architecture

Update 10 already centralized reports into one catalogue with categories such as:

- Sales Reports
- Customer & Collection Reports
- Supplier & Import Reports
- Inventory & Product Reports
- Expense & Accounts Reports
- Employee & Marketing Reports
- Audit & Control Reports

Therefore Update 11 should **not redesign Reports again**.

The Sales Order Workspace should deep-link into those canonical reports.

---

## 8. Main UX gap in current Sales

`SalesPage.tsx` currently contains:

```text
Customers
Marketing
Quotations & Orders
Deliveries
Collections
```

This is good for day-to-day operations.

It also has an `Order Receiving Details` modal, but that modal is only for:

- payment conditions;
- requested delivery date;
- order-receiving metadata;
- sign-off text;
- print-sheet fields.

It is **not** a lifecycle workspace.

There is currently no dedicated route like:

```text
/app/sales/orders/:orderId
```

and `App.tsx` currently redirects generic `sales/*` back to `/app/sales`.

So the largest missing feature is:

> Open one Sales Order and see the entire linked history from Quotation through Delivery, Invoice and Collection.

---

## 9. Recommended derived lifecycle

Do not persist another lifecycle status field. Derive the stage states from authoritative records.

### Stages

```text
Quotation → Order → Delivery → Invoice → Collection
```

Customer and Salesperson belong in the workspace header/context, not as stages.

### Quotation stage

- `Complete` when a linked quotation exists and was converted.
- `Direct` if a future direct-order path exists without a quotation.

### Order stage

- Active when Order exists.
- Show actual Order status separately (`Placed`, `Partially Delivered`, `Delivered`, etc.).

### Delivery stage

Use quantity, not only status text:

```text
0 delivered               → Not Started
0 < delivered < ordered   → Partial
all ordered delivered     → Complete
```

### Invoice stage

Use active Invoice lines:

```text
no invoice coverage                      → Not Started
draft invoice exists                     → Draft Pending
approved invoiced < delivered            → Partial
approved invoiced covers delivered       → Complete
```

Cancelled Invoice quantities do not count.

### Collection stage

Use Approved Invoice value vs Order/Invoice-linked Posted Collections:

```text
approved invoice value = 0               → Not Due
approved > 0, collected = 0              → Unpaid
0 < collected < approved invoice value   → Partial
collected >= approved invoice value      → Paid
```

Do not use the Customer's total current due for this stage, because the Customer may have multiple Orders.

---

## 10. Recommended Sales Order Workspace

New route:

```text
/app/sales/orders/:orderId
```

### Header

Show:

- Order number
- Customer
- Salesperson
- Order date
- Order status

Contextual actions:

- Back to Sales
- Print Order
- Customer Ledger
- Open Report
- New Delivery
- Create Invoice
- Record Collection

Only show actions allowed by the current role and current lifecycle state.

### Progress

```text
Quotation → Order → Delivery → Invoice → Collection
```

Use the same visual language as Import milestones.

### Summary cards

Keep to five:

```text
Order Value
Delivered Value
Approved Invoice Value
Collected
Outstanding
```

### Fulfilment table

Main operational table:

```text
Product
Ordered
Delivered
Approved Invoiced
Remaining to Deliver
Delivered but Not Invoiced
```

### Linked document sections

**Quotation**
- reference
- date
- status
- Print

**Delivery Challans**
- challan
- date
- quantity
- batches
- status
- Print

**Invoices**
- invoice
- date
- linked challans
- amount
- status
- Approve / Cancel if permitted
- Print

**Collections**
- receipt
- date
- mode
- reference
- amount
- Print

### Customer context

Show only concise values:

- current due
- credit limit
- payment terms
- Open Customer Ledger

Do not duplicate the full ledger inside the Order workspace.

### Salesperson context

Show:

- salesperson name;
- territory;
- link to Employee Activity / Report if permitted.

Do not duplicate Employee reporting.

---

## 11. Cross-module impact

### Imports

No business logic update required.

Recommended UI-only refactor:

- extract the current Import milestone bar into a reusable `LifecycleProgress` component;
- use it in Import and Sales.

Import behavior must remain unchanged.

### Inventory

No stock logic update required.

Current Delivery already performs FIFO stock-out correctly.

The new Sales workspace should show Delivery batches and can resolve related Stock Movements by challan reference.

Optional P1:
- make an Inventory dispatch reference clickable to the related Sales Order.

Do not add a Sales Flow tab to Inventory.

### Expenses & Accounts

No expense/accounting redesign required.

Required:
- fix Invoice-only Collection to infer its Sales Order.

Optional P1:
- Collection account transaction can link to its Money Receipt / related Sales Order.

Do not mix operating Expense into Sales lifecycle.

### Employees / Marketing

No new Employee data model required.

ERP-generated activities already carry reference information. Make Sales-related references clickable where practical:

- SalesOrder → Sales Order Workspace
- Delivery → related Sales Order Workspace
- SalesInvoice → related Sales Order Workspace
- Collection → related Sales Order Workspace

Formal employee reports remain under Reports.

### Reports

No catalogue redesign required.

Useful small extension:
- add an `order` filter to relevant report definitions;
- let the Sales Order Workspace deep-link to a report with its Order already selected.

Relevant reports:

- Sales Order Register
- Order Fulfilment Difference
- Delivery Challan Register
- Sales Invoice Register
- Sales Sheet
- Customer Collection Report

Do not create a new Sales Lifecycle Report unless the client asks for one.

---

## 12. Delivery "Approved" ambiguity

The handwritten client diagram appears to say:

```text
Delivery Challan
    ↓
Approved
    ↓
Report
```

Current behavior is:

```text
Create / Post Delivery
    ↓
FIFO validation
    ↓
Stock reduced immediately
```

This means posting currently acts as the operational finalization.

Do **not** add another approval layer without client confirmation.

Use the existing Settings → Decisions mechanism for:

**Decision:** Does Delivery Challan require separate manager approval before stock is deducted, or is posting itself the approval/final action?

If client says posting is final: keep current behavior.

If client says separate approval is required: future flow becomes:

```text
Draft Delivery
→ Approved / Posted
→ Stock Out
```

That should be a separate confirmed change.

---

## 13. What should not be added

Do not add:

- new top-level Sales Flow navigation;
- a new `SalesCase` database/entity;
- duplicate Order/Invoice/Collection stores;
- another Customer Ledger;
- another Salesman Ledger;
- a second inventory store;
- a second report engine;
- another financial ledger;
- a giant Import-style Sales accordion;
- an unconfirmed Delivery approval workflow.

---

## 14. Final assessment

The project already has the correct transactional backbone.

Approximate readiness:

```text
Underlying Sales business logic:       ~90% present
Linked data model:                     ~90% present
Inventory/accounting integration:      ~90% present
Reports:                               already centralized
Lifecycle visibility/navigation:       main missing part
```

The correct architecture after Update 11 should be:

```text
Sales module = perform the work
Sales Order Workspace = follow the linked lifecycle
Inventory = authoritative stock/batch history
Accounts = authoritative cash/bank movement
Customer Ledger = authoritative receivable history
Employees = people/activity context
Reports = analyze / export / print
```

This is consistent with the current ERP structure and with the client's handwritten requirement.
