# MIPRO Medical Supplier ERP — Reports Consolidation Analysis (Update 10)

**Project:** MIPRO Healthcare Corporation / Medical Supplier ERP  
**Repository:** `AN-SWAPNIL/Medical_Supplier_ERP`  
**Target branch:** `dev`  
**Purpose:** Convert reporting into one simple, centralized, HishabPati-inspired Reports experience while preserving MIPRO's existing data model, RBAC, workflows, print system, and visual language.

> This document is based on the previous deep-research analysis and the client's latest reporting requirements. Before implementation, re-check the current `dev` head and map exact current component/service/route names so no already-completed work is duplicated.

## 1. Executive conclusion

The client is not asking for another analytics dashboard or for report subtabs to be added across the whole ERP. The requirement is simpler:

- **Reports becomes the single canonical location for all report outputs.**
- Employee, marketing, inventory, sales, import, expense, accounting and audit reports all appear inside Reports.
- Other modules may still show **small operational summaries/KPIs**, but their configurable/printable reports should deep-link to Reports.
- The Reports landing page should be a **single catalogue page**, visually similar in information architecture to HishabPati: clear grouped sections with report cards.
- There should be **no separate first-level "Marketing Analysis", "Print & Preview", or "Audit" report tabs**.
- Clicking one report opens a **dedicated report-detail/configuration page** with only the filters relevant to that report.
- All reports should share the same actions, especially one consistent **Print Preview** button/component and one common report-print shell.
- The ERP should not copy unsupported HishabPati accounting features blindly. MIPRO-specific reporting must follow MIPRO's actual import → landed cost → inventory → delivery/invoice → collection workflow.

The main design principle is:

> **One Reports catalogue, grouped by business meaning; one reusable report-detail shell; one authoritative report data source per report; one shared print style.**

## 2. What the client's HishabPati example means for MIPRO

The useful part of the HishabPati reference is its **report discovery model**:

1. One Reports area.
2. Reports grouped into recognizable business sections.
3. Each report appears as a simple card/list item.
4. Selecting a report opens a focused screen.
5. The focused screen contains date/period and business-specific filters.
6. The result is previewed, then printed/exported.

MIPRO should copy this **information architecture**, not HishabPati's full accounting domain.

### What to adopt

- Single Reports landing page.
- Grouped report sections.
- Simple cards with an icon, title and "View" affordance.
- Dedicated report page after selection.
- Standard period choices.
- Relevant entity filters such as employee, customer, supplier, product, account and status.
- Clear preview/export/print actions.

### What not to copy blindly

- Generic "Party" domain. MIPRO already has Customer and Supplier.
- Generic local "Purchase" flows. MIPRO purchasing is primarily import-led.
- Sales/Purchase Return reports unless corresponding posting workflows exist.
- Cash Adjustment report unless there is a real cash-adjustment transaction type.
- Formal Profit & Loss or Cash Flow labels without adequate accounting foundations.
- HishabPati's visual styling. MIPRO should retain its existing components, spacing, typography, colors and letterhead.

## 3. Current-state implications from the previous reporting update

The latest reporting work already established a substantial report engine and print workflow. The next update should **reorganize and extend** that work rather than create a second reporting system.

Existing/previously implemented report families include:

### Import / Cost
- Import / Shipment Register
- Import Cost Breakdown
- Landed Cost by Product
- Landed Cost History by Batch

### Inventory
- Current Batch Stock
- Expiry Attention
- Stock Movements

### Sales / Collection
- Delivery Challan Register
- Delivery vs Invoice Exceptions
- Sales Invoice Register
- Sales Sheet
- Delivered Sales by Product
- Invoiced Sales by Customer
- Invoiced Sales by Product
- Sales by Salesperson
- Invoiced Sales by Month
- Salesman Ledger
- Collections Received
- Customer Receivables
- Customer Running Ledger
- Sales Team Comparison / performance-related reports

### Expense / Accounts
- Monthly A/C Summary
- Daily Expenditure
- Expense Category Summary
- Expense by Person
- Expense by Office / Warehouse / Company
- Monthly Expense
- TA/DA data
- Cash / Bank Transactions

### Employee / Marketing / Audit
- Employee Performance
- Employee Activity
- Marketing Analysis / activity-related reporting
- Audit reporting

These reports should be **registered in the new catalogue first**. Do not rewrite their calculations unless a correctness problem is identified.

## 4. Recommended Reports information architecture

The Reports landing page should not use many horizontal report tabs. It should be one vertically scrollable catalogue with the following grouped sections:

1. **Sales Reports**
2. **Customer & Collection Reports**
3. **Supplier & Import Reports**
4. **Inventory & Product Reports**
5. **Expense & Accounts Reports**
6. **Employee & Marketing Reports**
7. **Audit & Control Reports**

These are **section headings on one page**, not separate top-level Report tabs.

A small search field ("Search reports") is useful but optional for the first implementation.

### Desktop pattern

```text
Reports

[ Search reports... ]

Sales Reports
┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐
│ Sales Summary      │ │ Invoice Register   │ │ Sales by Product   │
│ View             > │ │ View             > │ │ View             > │
└────────────────────┘ └────────────────────┘ └────────────────────┘

Customer & Collection Reports
┌────────────────────┐ ┌────────────────────┐ ...
│ Customer List      │ │ Customer Ledger    │
└────────────────────┘ └────────────────────┘

Supplier & Import Reports
...
```

### Mobile pattern

- one/two cards per row;
- sections remain vertically stacked;
- no long horizontal report-name selector;
- selecting a card navigates to a dedicated report page.

## 5. Canonical report-detail page

Every report opens the same reusable page shell:

```text
< Back to Reports

Sales Summary
Short description

Period
[ This Month v ]

From [ date ]     To [ date ]

Salesperson [ All v ]
Customer    [ All v ]
Product     [ All v ]

[ Generate / Refresh ]   [ Print Preview ]   [ Export CSV ]

Summary cards / totals if relevant

Report table
...
```

The shell should contain:

- title + short description;
- period selector;
- conditional filters;
- Generate/Refresh;
- Print Preview;
- CSV/export;
- report result table;
- totals/summary;
- empty/loading/error states.

Only filters defined for that report should appear.

## 6. Standard period model

Use one shared period component:

- Today
- Yesterday
- This Week
- Last Week
- This Month
- Last Month
- This Year
- Last Year
- Custom

For **Custom**, show From/To.

The client's daily/monthly/yearly requirement should be satisfied primarily by **one Sales Summary report with an aggregation/grouping option**, not by filling the catalogue with multiple nearly identical cards.

Recommended aggregation values for Sales Summary:

- Daily
- Weekly
- Monthly
- Yearly
- Custom / raw period

## 7. Report inventory — what MIPRO should contain

### 7.1 Sales Reports

**Must have now / reuse existing work**
- Sales Summary
- Sales Invoice Register
- Sales Sheet
- Delivery Challan Register
- Delivery vs Invoice Exceptions
- Sales by Product / Item
- Sales by Product Family
- Sales by Customer
- Sales by Salesperson
- Sales by Month
- Collections Received
- Sales Order Register
- Order Fulfilment Difference

**Important accounting rule**

Approved **Sales Invoice** is the financial sale / Accounts Receivable debit.

Approved **Delivery Challan** is physical fulfilment / stock movement.

Do not count both as financial sales.

### 7.2 Customer & Collection Reports

**Must have now**
- Customer List
- Customer Running Ledger
- Customer Dues / Receivables
- Customer Collection Report
- Customer Sales Summary

**Useful later**
- Customer by Product
- Customer profitability only after authoritative cost basis and capability gating are validated

**Customer List should include where available**
- Customer name
- Contact person
- Address
- Phone / mobile number
- Territory/area
- Assigned salesperson
- Opening due
- Period invoiced amount
- Period paid/collected amount
- Current due/balance
- Status

The current due must come from the financial ledger source, not from duplicated delivery values.

### 7.3 Supplier & Import Reports

**Must have / existing**
- Import / Shipment Register
- Import Cost Breakdown
- Landed Cost by Product
- Landed Cost History by Batch

**Add**
- Supplier List
- Supplier Statement / Ledger
- Import Purchase Order Register
- Imported Product Summary
- Supplier-wise Import Summary

**Useful next**
- PO / Import vs Warehouse Receipt

**Supplier List should include where available**
- Supplier name
- Country/address
- Contact
- Phone/email
- Import/PO value
- Paid amount
- Unpaid/payable amount
- Current balance
- Status

However, paid/unpaid/balance must be calculated from a real supplier financial source. It must not be guessed from import status.

### 7.4 Inventory & Product Reports

**Must have**
- Product List
- Stock Summary
- Current Batch Stock
- Product Details
- Stock Movements
- Expiry Attention
- Item-wise Sales
- Product Family-wise Sales

**Useful next**
- Product Family-wise Imports
- Product Gross Profit (restricted)

**Product List should include**
- Product name
- Product family/category
- Model/SKU/alias if present
- Unit
- Current stock
- Number of active batches
- Nearest expiry
- Status

Do not expose landed cost/profit to users who do not have the relevant sensitive-data capability.

### 7.5 Expense & Accounts Reports

**Reuse / must have**
- Monthly A/C Summary
- Daily Expenditure
- Expense Category Summary
- Expense by Person
- Expense by Office / Warehouse / Company
- Monthly Expense
- TA/DA
- Cash / Bank Transactions

**Add**
- Day Book
- Cash Transactions
- Bank Transactions
- Mobile Banking Transactions
- Cash & Bank Movement Summary
- Balance Sheet

Cash / Bank / Mobile Banking reports should be filtered views of the same AccountTransaction source rather than separate parallel accounting stores.

### 7.6 Employee & Marketing Reports

**Move under Reports / reuse**
- Employee Performance
- Employee Activity
- Sales Team Comparison
- Salesman Ledger
- Daily Marketing Activity
- Lead Funnel
- Follow-up Status
- Target vs Actual
- Visit Verification

**Add**
- Employee List, if management wants a printable employee roster

The Employees module should continue showing profile information, access controls, simple KPIs and recent activity. It should not maintain its own parallel report configuration/printing system.

### 7.7 Audit & Control Reports

**Move under Reports / reuse**
- Audit Trail
- Delivery vs Invoice Exceptions

**Useful later**
- Access / permission change audit
- FIFO override / stock exception audit

Audit is a section of the Reports catalogue, not a separate first-level Reports tab.

## 8. Balance Sheet analysis

The client explicitly requested a Balance Sheet. This should be implemented, but **not by pretending the current ERP already contains a complete accounting ledger**.

A correct Balance Sheet is an **as-of-date financial position**:

**Assets = Liabilities + Equity**

### 8.1 What can likely be derived from existing operational data

After verifying the latest `dev` models/services:

#### Assets
- Cash in hand from cash account balances
- Bank/mobile-financial balances from account transactions
- Accounts Receivable from Customer Ledger closing balances
- Inventory from on-hand quantities valued using the authoritative finalized costing method
- Recoverable employee/company advances, only if outstanding advances are tracked as recoverable balances

#### Liabilities
- Company loan outstanding, if loan inflow/repayment is persisted
- Supplier payable, only if supplier obligations and payments are persisted

### 8.2 Accounting gaps that must be checked

The previous simple analysis claimed that no data-model changes are needed. That is unsafe for a real Balance Sheet.

Verify whether the ERP currently has:

- supplier payable obligations;
- supplier payments;
- opening capital/equity;
- retained earnings/opening accumulated result;
- fixed assets;
- accumulated depreciation;
- statutory/tax payables;
- customer advances;
- other receivables/payables;
- migration/opening balances.

If these are absent, the Balance Sheet cannot truthfully display them.

### 8.3 Minimal compatible accounting foundation

Do not turn Update 10 into a full general-ledger project.

Add only the minimum structured balance sources needed by MIPRO.

#### A. Supplier settlement ledger

Persist:
- supplier;
- import/PO/reference;
- payable/obligation amount;
- payment amount;
- payment date;
- payment account;
- reference;
- notes;
- status;
- created/approved metadata.

This powers:
- Supplier List paid/unpaid/balance
- Supplier Statement
- Balance Sheet Accounts Payable

#### B. Controlled financial-position adjustments

For balances not derivable from normal operations, maintain a restricted accounts-only layer for:
- Owner / Opening Capital
- Fixed Assets
- Accumulated Depreciation
- Statutory Payables
- Other Receivables
- Other Payables
- Opening Retained Earnings / Accumulated Result

Every manual entry must be auditable.

#### C. Opening balance migration

Authorized Accounts/MD/Super Admin should be able to enter verified opening balances at the agreed cutover date.

Do not reconstruct historical balances from incomplete demo data.

### 8.4 Recommended Balance Sheet layout

**Assets**

Current Assets
- Cash in Hand
- Bank & Mobile Financial Accounts
- Accounts Receivable
- Inventory
- Recoverable Advances
- Other Current Assets, if configured

Non-current Assets
- Fixed Assets
- Less: Accumulated Depreciation

**Liabilities**

Current Liabilities
- Accounts Payable / Supplier Payable
- Statutory Payables, if configured
- Other Current Liabilities

Financing
- Company Loan Outstanding

**Equity**
- Owner / Opening Capital
- Retained Earnings / Opening Accumulated Result
- Current-period result only after the result calculation is validated

Then show:
- Total Assets
- Total Liabilities
- Total Equity
- Total Liabilities + Equity
- Difference/reconciliation warning for authorized users if non-zero

Do not copy irrelevant account names from the sample Balance Sheet.

## 9. Print analysis and correction

The client explicitly requested:

- **Left: 1.5 mm**
- **Right: 0.2 mm**

These must remain exactly 1.5 mm and 0.2 mm.

The earlier analysis included a contradictory `15mm` example. That is incorrect and must **not** be implemented.

### 9.1 Why margin alone does not solve the screenshot problem

The supplied print screenshot shows the report table/content entering the left-side vertical decorative branding on the MIPRO letterhead.

A 1.5 mm page-edge margin is much smaller than that decorative safe zone.

Therefore use **two separate concepts**:

1. Requested page-edge spacing:
   - left 1.5 mm
   - right 0.2 mm

2. Additional report-content safe inset:
   - calibrated against the actual MIPRO letterhead image/background;
   - prevents title/table/signatures from touching the vertical branding.

### 9.2 Shared report print shell

All report output should use one shared report-print shell with common:
- letterhead identity;
- title;
- date/filter metadata;
- summary;
- table styling;
- page-breaking behavior;
- totals;
- optional signatures;
- footer.

Use CSS variables/tokens such as:

```css
--report-page-left: 1.5mm;
--report-page-right: 0.2mm;
--report-safe-left: <calibrated>;
--report-safe-top: <calibrated>;
--report-safe-bottom: <calibrated>;
```

The **safe-left** value is not a replacement for the 1.5 mm page edge. It is an internal content zone.

### 9.3 Do not unnecessarily alter calibrated business documents

Existing Sales Invoice, Delivery Challan, Money Receipt, Debit Voucher, Credit Voucher, Quotation or other transactional documents may have their own calibrated print layouts.

Update 10 should standardize **reports**, while changing transaction-document templates only if the same overlap defect exists and the change passes UAT.

## 10. Cross-module cleanup

### Employees
Keep:
- Employee Directory
- Access & Roles
- Field Team
- simple activity/performance summaries

Move report printing/configuration to Reports.

Example: `Employee → View Report` deep-links to Employee Performance report with employee preselected.

### Sales & Marketing
Keep operational customer/marketing/order/delivery/collection workflows.

Move canonical sales, customer and marketing report configuration/printing to Reports.

### Inventory
Keep Stock / Batches / Movements operational UI.

Report shortcuts open canonical Product List, Stock Summary, Expiry Attention and Stock Movements.

### Imports
Keep connected import case workflow.

Report shortcuts open Import Register, Import Cost Breakdown, Landed Cost by Product and Supplier/Import reports.

### Expenses & Accounts
Keep operational posting/transaction pages.

Report shortcuts open expense reports, Day Book, cash/bank views, Monthly A/C Summary and Balance Sheet.

No duplicate report calculations in modules.

## 11. Report registry architecture

Create a central report registry, for example:

`src/domains/reports/reportCatalog.ts`

Conceptual shape:

```ts
type ReportDefinition = {
  id: string;
  title: string;
  category: ReportCategory;
  description: string;
  icon?: string;
  sourceKey: string;
  periods: ReportPeriod[];
  filters: ReportFilterKey[];
  printable: boolean;
  csv: boolean;
  permission?: {
    key: PermissionKey;
    action: PermissionAction;
  };
  capability?: Capability;
  scope?: "SELF" | "TEAM" | "ALL" | "INHERIT";
};
```

The same registry should drive catalogue visibility, report route metadata, filters, print availability, export availability and RBAC/capability checks.

Do not create fake/disabled report cards merely to match HishabPati.

## 12. End-to-end data contract

For a given report and filter set:

**On-screen result = CSV = A4 Print Preview = Saved/printed PDF**

Use one normalized report result.

Recommended pipeline:

```text
Report filters
    ↓
Report service / endpoint
    ↓
Normalized report result
    ├── On-screen table
    ├── CSV serializer
    └── Shared report print renderer
```

Do not independently recalculate totals inside PrintPage.

## 13. RBAC and data scope

Centralizing reports must not widen access.

### Sensitive data
Require existing capabilities/permissions for:
- landed cost;
- import cost;
- inventory valuation if cost-sensitive;
- gross profit/profitability;
- Balance Sheet and financial position where appropriate.

### Employee scope
Keep current record scope:
- Sales Executive → SELF
- Sales Manager → TEAM
- MD / Super Admin → ALL
- other roles according to existing effective permission rules

### Direct URL protection
The report card can be hidden in the UI, but direct `/app/reports/:reportId` access must also be denied by the data/service layer.

## 14. Backward compatibility

Existing links such as older query-driven report URLs should map/redirect to the canonical report-detail route.

Example target:

```text
/app/reports/sales-invoice-register
?period=this-month
&from=...
&to=...
&salespersonId=...
```

Cross-module shortcuts should reuse these routes rather than creating their own report screens.

## 15. Important corrections to the earlier short Analysis file

Two points from the short analysis must not be implemented literally:

1. **Print margin:** the requirement is 1.5 mm left, not 15 mm. The example that used `15mm` was a unit error.
2. **Balance Sheet / supplier balance data:** it is not safe to assume that every required field already exists or that no data-model changes are needed. A real supplier payable ledger and financial-position/opening-balance support may be required.

The remainder of the high-level direction is retained: one Reports area, grouped report discovery, dedicated filter pages, consistent styling, and no forced subtab pattern in other modules.

## 16. Recommended target

The final product should feel simple:

> A user opens Reports, immediately sees grouped report cards, clicks exactly the report they need, selects a period and only the relevant filters, previews the same authoritative data that will be exported/printed, then uses one consistent Print Preview action.

That satisfies the client's HishabPati reference without turning MIPRO into a generic accounting application.
