# MIPRO ERP — Report Navigation & Client Screenshot Analysis (Update 9)

**Date:** 18 September 2026  
**Repository:** `AN-SWAPNIL/Medical_Supplier_ERP`  
**Branch reviewed:** `dev`  
**Latest reviewed commit:** `7dcc4dc63c04619e3947d1437dd23de8e5c80649`  
**Commit message:** `feat: complete update 8 reporting and print workflow`

## 1. Executive conclusion

The client’s screenshots are primarily a **report-discovery / navigation requirement**, not a request to copy every HishabPati report blindly.

The current MIPRO ERP already has a strong report engine and Update 8 already implements many important reports, including Delivery Challan Register, Sales Invoice Register, Sales Sheet, Delivered/Invoiced Sales reports, Salesman Ledger, Customer Ledger, Collections, Dues, Monthly A/C Summary, expense reports, cash/bank reports, import/landed-cost reports, inventory reports, marketing analysis, employee reports, audit, A4 preview, invoice print and debit/credit vouchers.

So the correct Update 9 is:

> **Reorganize Reports into a simple “Print & Preview” report catalogue, reuse the existing report engine, and add only screenshot-inspired reports the current ERP can calculate correctly.**

## 2. What the client said

Client:

> “Print and preview report TAB include these sub tab for check report”

The screenshots show a mobile Reports screen organized under headings such as:

```text
Transactions Reports
Items / Stock Reports
Party Reports
Expense Reports
```

A user taps one report, such as Sales, then gets:

```text
Period
From
To
Seller / other report-specific filters
Report result
```

This is the important interaction pattern.

It does **not** mean every individual report should become a horizontal tab.

## 3. What the screenshots show

### Transaction Reports

Visible examples:

```text
Sales
Purchase
Sales Order
Purchase Order
Sales Order Difference
Purchase Order Difference
Profit & Loss
Sales Wise Profit Loss
Cash Flow
Day Book Report
Mobile Banking
Bank Transactions Report
Cash Adjustment Report
Balance Sheet
```

This is from a general accounting/business app. Several items are broader than MIPRO’s current accounting scope.

### Sales Report screen

The selected Sales Report shows:

```text
This Month
01/09/2026 — 13/09/2026
Both
Seller
```

This indicates the client values:

1. period presets;
2. From / To;
3. report-specific filters;
4. one clear result screen;
5. mobile-first simplicity.

MIPRO already has period presets and From/To filtering.

### Items / Stock Reports

Visible:

```text
Stock Summary
Stock Adjustment
Item Details
Item By Party Report
Item Wise Profit Loss
Item Wise Sales Report
Category Wise Sales Report
Item Wise Purchase Report
Category Wise Purchase Report
```

### Party Reports

Visible:

```text
Party Statement
All Parties
Party By Item Report
Sale/Purchase By Party
Profit Loss By Party
```

MIPRO should not necessarily copy generic “Party” terminology because it already distinguishes Customer, Supplier and Employee.

### Expense Reports

Visible:

```text
Expense
Expense Category Report
Expense Items Report
```

MIPRO already has richer expense reports.

## 4. Latest MIPRO Reports UI

The current Reports page has:

```text
Overview
Marketing Analysis
Import & Cost
Inventory
Sales & Collection
Expense & Cash-Bank
Audit
```

Inside an operational report group, each individual report is another `Segmented` selection.

This was acceptable when each group was small. It is becoming unwieldy now.

## 5. Current Sales report density

After Update 8, Sales & Collection contains approximately:

```text
Sales Team Comparison
Delivery Challan Register
Delivery vs Invoice Exceptions
Sales Invoice Register
Sales Sheet
Delivered Sales by Product
Invoiced Sales by Customer
Invoiced Sales by Product
Sales by Salesperson
Invoiced Sales by Month
Salesman Ledger
Collections Received
Customer Receivables
Customer Running Ledger
```

Around fourteen report choices are too many for one horizontal subtab strip, especially on mobile.

This is exactly where the client screenshot pattern helps.

## 6. Should we create subtabs for every top-level ERP tab?

# No.

That would make the ERP less simple.

Navigation consistency does **not** mean every page must have the same number of layers.

Use the pattern appropriate to the content:

```text
Dashboard
→ no subtabs

Imports
→ one case/register workflow
→ sections / accordion

Inventory
→ Stock / Batches / Movements tabs

Sales & Marketing
→ Customers / Marketing / Quotations & Orders / Deliveries / Collections tabs

Expenses & Accounts
→ Expenses / Cash & Bank / Account Ledger / Dues & Collections tabs

Employees
→ Directory / Access / Field Team / Activity & Reports tabs

Reports
→ many report documents
→ report catalogue, not one tab per report

Settings
→ stable configuration tabs
```

The consistent principle is not “everything has tabs.” The consistent principle is “one clear navigation pattern per type of work.”

## 7. Module tabs vs report choices

A module tab represents an ongoing peer workflow:

```text
Inventory → Batches
Sales → Collections
Employees → Field Team
```

A report is a selectable output/document:

```text
Invoice Register
Sales by Product
Customer Ledger
Expense Category Summary
```

Individual reports should behave as report list items/cards, not permanent application tabs.

## 8. Recommended Reports architecture

Simplify first-level Reports navigation to:

```text
Reports
├── Overview
├── Print & Preview
├── Marketing Analysis
└── Audit
```

This directly answers the client’s wording.

## 9. Print & Preview categories

Inside Print & Preview:

```text
Sales & Transactions
Inventory & Stock
Import & Purchase
Customers & Ledger
Expenses & Accounts
Employees & Marketing
```

These adapt the screenshot concept to MIPRO’s real business.

Do not copy “Party” blindly when “Customer” is clearer.

## 10. Category tabs are fine; individual-report tabs are not

Good:

```text
[Sales & Transactions]
[Inventory & Stock]
[Import & Purchase]
[Customers & Ledger]
[Expenses & Accounts]
[Employees & Marketing]
```

Then a list:

```text
Sales Invoice Register
Sales Sheet
Sales by Product
Sales by Salesperson
Collections
...
```

Bad:

```text
[Invoice Register] [Sales Sheet] [Sales by Product] [Sales by Customer]
[Sales by Salesperson] [Monthly Sales] [Salesman Ledger] ...
```

The second pattern will overflow and become difficult to understand.

## 11. Desktop interaction

Recommended:

```text
Reports → Print & Preview

[Sales & Transactions] [Inventory & Stock] ...

┌──────────────────────────────┬─────────────────────────────────────┐
│ REPORT LIST                  │ SELECTED REPORT                     │
│                              │                                     │
│ Search reports...            │ Sales Invoice Register              │
│                              │                                     │
│ Sales Invoice Register   >   │ Period: This Month                  │
│ Sales Sheet              >   │ From: 01/09/2026                   │
│ Sales by Product         >   │ To:   18/09/2026                   │
│ Sales by Salesperson     >   │ Salesperson: All                    │
│ Collections             >   │ Customer: All                       │
│ ...                          │                                     │
│                              │ [Generate] [A4 Preview] [CSV]       │
│                              │                                     │
│                              │ TABLE PREVIEW                       │
└──────────────────────────────┴─────────────────────────────────────┘
```

## 12. Mobile interaction

Recommended:

```text
Reports
→ Print & Preview
→ Category
→ Report list
→ Selected report
→ Filters
→ Result
```

This closely follows the client screenshots while preserving MIPRO branding and data model.

## 13. Standard selected-report shell

Common filters:

```text
Period
From
To
```

Optional report-specific filters:

```text
Salesperson
Customer
Product
Product Family
Supplier
Account
Employee
Status
Territory
```

Only show relevant filters.

## 14. Preview / print behavior

Use three clear actions:

```text
Generate / Refresh
→ update on-screen report

A4 Preview
→ use the existing calibrated PrintPage

Export CSV
→ export exactly the filtered report
```

Inside A4 Preview:

```text
Print / Save PDF
```

No new print engine is needed.

## 15. Report catalogue should be data-driven

Create a report registry containing:

```text
id
title
category
description
permissions
filters
printability
exportability
optional sensitive capability
```

This prevents navigation redesign every time a report is added.

## 16. Existing reports that map directly

### Sales & Transactions

Already supported:

```text
Sales Invoice Register
Sales Sheet
Delivery Challan Register
Delivery vs Invoice Exceptions
Delivered Sales by Product
Invoiced Sales by Product
Invoiced Sales by Customer
Sales by Salesperson
Invoiced Sales by Month
Collections Received
```

### Customers & Ledger

Already supported:

```text
Salesman Ledger
Customer Running Ledger
Customer Receivables / Dues
Sales by Customer
```

### Inventory & Stock

Already supported:

```text
Current Batch Stock
Expiry Attention
Stock Movements
```

### Import & Purchase

Already supported:

```text
Import / Shipment Register
Import Cost Breakdown
Landed Cost by Product
Landed Cost History by Batch
```

### Expenses & Accounts

Already supported:

```text
Monthly A/C Summary
Daily Expenditure
Expense Category Summary
Expense by Person
Expense by Office / Warehouse / Company
Monthly Expense
TA/DA
Cash / Bank Transactions
```

### Employees & Marketing

Already available through current report/employee/marketing services:

```text
Sales Team Comparison
Employee Performance
Employee Activity
Daily Marketing Activity
Lead Funnel
Follow-up Status
Target vs Actual
Visit Verification
```

## 17. Screenshot-inspired reports safe to add

### Sales Order Register

The SalesOrder domain already exists.

Recommended fields:

```text
Date
Order
Customer
Salesperson
Status
Order Value
Delivered Value / Qty
Invoice Status
Due
```

### Order Fulfilment Difference

Better MIPRO name than “Sales Order Difference.”

Use:

```text
Ordered Qty
Delivered Qty
Invoiced Qty
Remaining Qty
```

### Import Purchase Order Register

ImportCase already has PO data.

Use:

```text
PO Number
PO Date
Supplier
Import Reference
Status
Products
Quantity
FOB
```

### PO / Import vs Warehouse Receipt

Better MIPRO equivalent of Purchase Order Difference:

```text
Expected Qty
Received Qty
Rejected Qty
Outstanding Qty
```

### Stock Summary / Item Details

Can use current Product, StockBatch and stock data.

### Category-wise Sales

Use current Product family:

```text
Sales by Product Family
```

### Item-wise / category-wise Purchase

Use Import data:

```text
Imported Product Summary
Import by Product Family
```

### Day Book

Use AccountTransaction.

### Mobile Banking / Bank / Cash report

These are filtered AccountTransaction reports, not new accounting systems.

## 18. Screenshot reports that should not be copied blindly

### Formal Profit & Loss

Do not show a formal P&L from an incomplete accounting model.

Safe alternatives:

```text
Gross Profit Summary
Operational Profit Summary
Gross Profit by Product
Gross Profit by Customer
Gross Profit by Salesperson
```

with `view_profit`.

### Balance Sheet

Do not implement now.

A valid balance sheet requires a more complete accounting model.

### Formal Cash Flow Statement

Do not call a simple transaction report a formal accounting Cash Flow Statement.

Use:

```text
Cash Movement Summary
```

or:

```text
Cash & Bank Flow
```

### Generic Party accounting

Do not create a new Party domain just because the screenshot uses it.

Use Customer and Supplier.

### Cash Adjustment Report

Only show if a genuine cash-adjustment posting workflow exists.

## 19. Purchase terminology

The screenshot app uses generic Purchase.

MIPRO is import-led.

Prefer:

```text
Import Purchase Order
Supplier Import
Imported Product
PO vs Receipt
```

rather than building a local-purchase module that the client has not requested.

## 20. Profit report security

Any profit report must require:

```text
view_profit
```

and use authoritative cost.

Never show it to normal sales staff by default.

## 21. Current PrintPage compatibility

Update 8 already supports printing:

```text
Quotation
Order Receiving Sheet
Delivery Challan
Money Receipt
Sales Invoice
Debit Voucher
Credit Voucher
Import Landed Cost
Employee Performance
Employee Activity
Marketing Analysis
Operational Reports
```

So the new Print & Preview catalogue fits the existing architecture very well.

## 22. URL / deep link

Recommended:

```text
/app/reports?view=print
&category=sales
&report=invoice-register
&from=2026-09-01
&to=2026-09-18
```

This lets other modules open an exact report directly.

## 23. Backward compatibility

Current URLs such as:

```text
/app/reports?view=sales&table=invoice-register
```

should map to the new catalogue selection.

Do not break Update 8 links.

## 24. Overview role

Keep Overview as a management summary.

Cards can be:

```text
Sales & Transactions
Inventory & Stock
Import & Purchase
Customers & Ledger
Expenses & Accounts
Employees & Marketing
```

Each opens Print & Preview in that category.

## 25. Marketing Analysis role

Keep it separate because it is an interactive analysis workspace.

Printable marketing report shortcuts can also be listed in Employees & Marketing inside Print & Preview.

## 26. Audit role

Keep Audit separate and permission-protected.

## 27. Full-project navigation consistency

Use three patterns:

### A. Small peer workflows

Tabs / Segmented:

```text
Inventory
Sales & Marketing
Expenses & Accounts
Employees
Settings
```

### B. Large report/document library

```text
Category selector
+
searchable report list
+
selected report workspace
```

for Reports.

### C. Connected case workflow

Sections / accordion / status flow:

```text
Imports
```

This is more coherent than forcing nested subtabs everywhere.

## 28. Final answer to the user’s concern

> “If we create subtab, should not we create subtab for every tab?”

No.

The rule should be:

> **Use subtabs when a module has a small number of stable sibling workflows. Use a report catalogue when there are many report types.**

Reports has grown large enough that individual-report subtabs should actually be removed.

## 29. Final recommended structure

```text
Reports
├── Overview
├── Print & Preview
│   ├── Sales & Transactions
│   ├── Inventory & Stock
│   ├── Import & Purchase
│   ├── Customers & Ledger
│   ├── Expenses & Accounts
│   └── Employees & Marketing
├── Marketing Analysis
└── Audit
```

Inside a category:

```text
Report list
→ select report
→ filters
→ on-screen preview
→ A4 Preview
→ Print / Save PDF
→ CSV
```

This directly satisfies the client while remaining compatible with the simplified ERP.

---

**End of Analysis**
