# MIPRO ERP — Simplified Plan Update 9
## Report Catalogue, Print & Preview UX

**Date:** 18 September 2026  
**Repository:** `AN-SWAPNIL/Medical_Supplier_ERP`  
**Branch:** `dev`  
**Baseline:** `7dcc4dc63c04619e3947d1437dd23de8e5c80649`  
**Baseline feature:** `feat: complete update 8 reporting and print workflow`

## 1. Objective

Update 8 completed the main Invoice, ledger, A/C reporting and print workflow.

Update 9 should primarily improve:

```text
report discoverability
report selection
mobile usability
print / preview access
```

Do not rebuild report calculations.

## 2. Preserve main ERP navigation

Keep:

```text
Dashboard

OPERATIONS
├── Imports
├── Inventory
├── Sales & Marketing
└── Expenses & Accounts

MANAGEMENT
├── Employees
└── Reports

SYSTEM
└── Settings
```

No new top-level module.

## 3. Reports first-level tabs

Change Reports to:

```text
Overview
Print & Preview
Marketing Analysis
Audit
```

The current Import / Inventory / Sales / Expense operational report groups move inside Print & Preview as categories.

## 4. Print & Preview categories

Use:

```text
Sales & Transactions
Inventory & Stock
Import & Purchase
Customers & Ledger
Expenses & Accounts
Employees & Marketing
```

Category tabs/chips are acceptable because there are only six.

## 5. Individual reports are not subtabs

Individual reports become:

```text
searchable report list items
or
compact report cards
```

Do not render fourteen Sales reports as horizontal tabs.

## 6. Desktop layout

```text
┌──────────────────────┬──────────────────────────────────────────┐
│ Report Library       │ Selected Report                          │
│                      │                                          │
│ Search reports       │ Title / Description                      │
│ Report A          >  │ Filters                                  │
│ Report B          >  │                                          │
│ Report C          >  │ [Generate] [A4 Preview] [Export CSV]    │
│ ...                  │                                          │
│                      │ Preview Table                            │
└──────────────────────┴──────────────────────────────────────────┘
```

## 7. Mobile layout

```text
Print & Preview
→ Category
→ Report list
→ Report
→ Filters
→ Result
```

Provide Back to Reports on the selected report screen.

## 8. Add report search

Search by:

```text
title
keywords
category
```

Examples:

```text
invoice
stock
salesman
bank
TA
customer
```

## 9. Central report registry

Add:

```text
src/domains/reports/reportCatalog.ts
```

Suggested shape:

```ts
type ReportCategory =
  | "sales"
  | "inventory"
  | "imports"
  | "customers"
  | "expenses"
  | "employees";

type ReportFilterKey =
  | "period"
  | "salesperson"
  | "customer"
  | "product"
  | "productFamily"
  | "supplier"
  | "employee"
  | "account"
  | "territory"
  | "status";

type ReportDefinition = {
  id: string;
  title: string;
  category: ReportCategory;
  description: string;
  tableId?: string;
  filters: ReportFilterKey[];
  printable: boolean;
  exportable: boolean;
  permission?: {
    key: PermissionKey;
    action: PermissionAction;
  };
  capability?: Capability;
};
```

## 10. Catalogue rule

Show a report only when:

```text
source exists
+
user permission permits it
+
required sensitive capability is present
```

No placeholder/fake report names.

## 11. Sales & Transactions — register existing

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

## 12. Add Sales Order Register

P0.

Fields:

```text
Date
Order
Customer
Salesperson
Status
Order Value
Delivered
Invoice
Due
```

## 13. Add Order Fulfilment Difference

P1.

Use clearer MIPRO wording instead of “Sales Order Difference.”

```text
Order
Customer
Product
Ordered Qty
Delivered Qty
Invoiced Qty
Remaining Qty
```

## 14. Customers & Ledger — register existing

```text
Customer Running Ledger
Customer Receivables / Dues
Salesman Ledger
Sales by Customer
```

Optional later:

```text
Customer by Product
Gross Profit by Customer
```

Profit requires `view_profit`.

## 15. Inventory & Stock — register existing

```text
Current Batch Stock
Expiry Attention
Stock Movements
```

Add:

```text
Stock Summary
Item Details
```

Add `Stock Adjustment Report` only if real adjustment records exist.

## 16. Add Sales by Product Family

Use canonical Product family.

This is the MIPRO equivalent of Category Wise Sales Report.

## 17. Gross Profit by Product

Optional restricted report.

Requires:

```text
view_profit
```

Use approved invoice revenue minus authoritative FIFO COGS.

## 18. Import & Purchase — register existing

```text
Import / Shipment Register
Import Cost Breakdown
Landed Cost by Product
Landed Cost History by Batch
```

Add:

```text
Import Purchase Order Register
Imported Product Summary
Supplier-wise Import Summary
```

## 19. Import Purchase Order Register

Use current ImportCase:

```text
PO Number
PO Date
Supplier
Primary Reference
Status
Products
Qty
FOB
```

No new Purchase module.

## 20. Imported Product Summary

MIPRO equivalent of Item Wise Purchase:

```text
Product
Imported Qty
FOB Value
Additional Cost
Final Landed Value
```

## 21. Import by Product Family

MIPRO equivalent of Category Wise Purchase.

P1.

## 22. PO / Import vs Warehouse Receipt

Optional P1:

```text
Expected Qty
Received Qty
Rejected Qty
Outstanding Qty
```

MIPRO equivalent of Purchase Order Difference.

## 23. Expenses & Accounts — register existing

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

## 24. Add filtered account reports

Reuse AccountTransaction:

```text
Day Book
Cash Transactions
Mobile Banking Transactions
Bank Transactions
```

No new accounting engine.

## 25. Day Book

Default:

```text
Today
```

Columns:

```text
Date / Time
Account
Direction
Source
Reference
Description
Amount
```

## 26. Cash Movement Summary

If the client wants “Cash Flow,” use:

```text
Cash Movement Summary
```

not a formal Cash Flow Statement.

Use real account transactions.

## 27. Do not add Balance Sheet

Not in current accounting scope.

A formal Balance Sheet requires a more complete double-entry model.

## 28. Do not add formal P&L

Safe alternatives later:

```text
Gross Profit Summary
Operational Profit Summary
Gross Profit by Product
Gross Profit by Customer
Gross Profit by Salesperson
```

with sensitive permission.

## 29. Employees & Marketing

Register/shortcut:

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

Reuse current employee/marketing services.

## 30. Keep Marketing Analysis separate

It remains the advanced interactive analysis workspace.

Print & Preview may expose fixed printable marketing reports that reuse the same data.

## 31. Reusable filter shell

Create:

```text
ReportFilterBar
```

Always:

```text
Period
From
To
```

Conditional:

```text
Salesperson
Customer
Product
Family
Supplier
Employee
Account
Territory
Status
```

## 32. Reuse current period presets

```text
Today
Yesterday
This Week
Last Week
This Month
Last Month
Custom
```

## 33. Generate behavior

For reports with several filters:

```text
Apply Filters / Generate
```

For simple period-only reports, auto-refresh is fine.

## 34. On-screen preview

Reuse current report table renderer.

Header shows:

```text
Report title
period
applied filters
row count
```

## 35. A4 Preview

Reuse existing PrintPage.

No new print framework.

## 36. Print / Save PDF

Keep inside PrintPage.

## 37. CSV export

Export only the currently selected and filtered report.

## 38. URL model

Recommended:

```text
/app/reports
?view=print
&category=sales
&report=invoice-register
&period=this-month
&from=2026-09-01
&to=2026-09-18
```

## 39. Backward compatibility

Map old:

```text
view=imports
view=inventory
view=sales
view=expenses
table=...
```

to the new Print & Preview selection.

Do not break Update 8 links.

## 40. Cross-module shortcuts

### Sales & Marketing

```text
Invoice → Invoice Register
Customer → Customer Ledger
Salesperson → Salesman Ledger
```

### Inventory

```text
Stock → Stock Summary
```

### Accounts

```text
Cash & Bank → Account Transactions
Expense → Expense Report
```

### Employees

```text
Activity & Reports → Employee Performance / Salesman Ledger
```

All open the canonical Reports workspace.

## 41. Overview redesign

Overview cards:

```text
Sales & Transactions
Inventory & Stock
Import & Purchase
Customers & Ledger
Expenses & Accounts
Employees & Marketing
```

Clicking a card opens Print & Preview at that category.

## 42. UI language

Use:

```text
Print & Preview
Sales & Transactions
Inventory & Stock
Import & Purchase
Customers & Ledger
Expenses & Accounts
Employees & Marketing
```

Avoid technical/developer terminology.

## 43. Report list row

Recommended:

```text
[icon] Sales Invoice Register
       Approved invoice list by period
                                      >
```

Optionally show:

```text
Sensitive
Manager only
```

when relevant.

## 44. Permission handling

Use existing:

```text
hasEffectivePermission()
hasCapability()
employee/record scope
```

Examples:

```text
Gross Profit → view_profit
Sensitive import cost → view_sensitive_cost
Employee reports → permitted employee scope
```

## 45. Sales Executive

Likely sees:

```text
Sales & Transactions
Customers & Ledger
Employees & Marketing
```

own records only.

No sensitive profit/cost.

## 46. Accounts

Likely sees:

```text
Sales & Transactions
Customers & Ledger
Expenses & Accounts
```

according to existing permissions.

## 47. Warehouse

Likely sees:

```text
Inventory & Stock
Delivery-related Sales & Transactions
receiving-related Import & Purchase
```

according to permissions.

## 48. Import Officer

Likely sees:

```text
Import & Purchase
Inventory & Stock where granted
```

## 49. Super Admin / MD

See all permitted categories.

Sensitive fields still follow capability checks.

## 50. UAT — Desktop

1. Reports.
2. Print & Preview.
3. Sales & Transactions.
4. Search `invoice`.
5. Open Sales Invoice Register.
6. This Month.
7. Generate.
8. Confirm preview.
9. A4 Preview.
10. Print/Save PDF.
11. CSV.

## 51. UAT — Mobile

1. Reports.
2. Print & Preview.
3. Inventory & Stock.
4. Stock Summary.
5. Apply filters.
6. View result.
7. A4 Preview.

No huge horizontal report tab strip.

## 52. UAT — Data consistency

For any selected report:

```text
on-screen preview
CSV
A4 preview
printed PDF
```

must use the same filtered data.

## 53. P0 — UX refactor

1. Add Print & Preview first-level view.
2. Reduce Reports first-level tabs.
3. Add six report categories.
4. Add searchable report list.
5. Add selected-report workspace.
6. Create report registry.
7. Register every existing Update 8 report.
8. Reuse period presets.
9. Reuse table renderer.
10. Reuse PrintPage.
11. Preserve CSV.
12. Add old-URL compatibility.

## 54. P1 — Screenshot-inspired reports supported by current data

```text
Sales Order Register
Order Fulfilment Difference
Stock Summary
Item Details
Sales by Product Family
Import Purchase Order Register
Imported Product Summary
Supplier-wise Import Summary
Day Book
Mobile Banking Transactions
Bank Transactions
Cash Transactions
```

## 55. P1/P2 — sensitive analytical reports

Only when validated:

```text
Gross Profit by Product
Gross Profit by Customer
Gross Profit by Salesperson
Operational Profit Summary
```

## 56. Deferred

Do not implement merely because the screenshot shows them:

```text
Balance Sheet
formal Profit & Loss Statement
formal Cash Flow Statement
generic Party accounting
Cash Adjustment Report
```

until the data model supports them.

## 57. No project-wide subtab redesign

Do not add extra nested tabs to:

```text
Dashboard
Imports
Inventory
Sales & Marketing
Expenses & Accounts
Employees
Settings
```

Their current patterns are appropriate.

Reports is different because it is a large and growing report library.

## 58. Final structure

```text
Reports
│
├── Overview
│
├── Print & Preview
│   │
│   ├── Sales & Transactions
│   ├── Inventory & Stock
│   ├── Import & Purchase
│   ├── Customers & Ledger
│   ├── Expenses & Accounts
│   └── Employees & Marketing
│
├── Marketing Analysis
│
└── Audit
```

Inside a category:

```text
Report list
→ report
→ filters
→ preview
→ A4 Preview
→ Print / Save PDF
→ CSV
```

## 59. Final recommendation

Use the client screenshots as **UX inspiration for finding and checking reports**, not as a literal feature checklist.

The current project already has most underlying report functionality.

The correct Update 9 is mainly to make it easier to find and print:

```text
Reports
→ Print & Preview
→ Category
→ Report
→ Filters
→ Preview
```

This is simpler, mobile-compatible, and fully aligned with the existing project.

---

**End of Plan**
