# MIPRO Medical Supplier ERP — Simplified Implementation Plan (Update 10)

**Scope:** Centralize all reports under Reports, add client-requested reports, standardize report configuration/printing, and add the minimum accounting support needed for Supplier balances and a truthful Balance Sheet.

## 1. Final UI target

### Reports landing page

Use **one page only**.

Remove first-level Reports switches such as:
- Marketing Analysis
- Print & Preview
- Audit
- Import & Cost
- Inventory
- Sales & Collection
- Expense & Cash-Bank

Replace them with vertically stacked categories on the same page:

1. Sales Reports
2. Customer & Collection Reports
3. Supplier & Import Reports
4. Inventory & Product Reports
5. Expense & Accounts Reports
6. Employee & Marketing Reports
7. Audit & Control Reports

Each category contains simple MIPRO-styled report cards.

Clicking a card navigates to:

```text
/app/reports/:reportId
```

No large nested horizontal report tab system.

## 2. Report-detail page

Build one reusable `ReportDetailPage` / `ReportWorkspace` shell.

Common structure:

1. Back to Reports
2. Report title + description
3. Period preset
4. Conditional filters
5. Generate / Refresh
6. Print Preview
7. Export CSV
8. Summary/totals where relevant
9. Result table

### Shared period presets

- Today
- Yesterday
- This Week
- Last Week
- This Month
- Last Month
- This Year
- Last Year
- Custom

For Custom:
- From
- To

### Shared filter components

Reuse existing pickers/components wherever possible:

- Employee / Salesperson
- Customer
- Supplier
- Product
- Product Family
- Account
- Territory
- Status
- Batch
- Import/LC/TT reference
- Audit user/action/module

Only show filters supported by the selected report.

## 3. Report catalogue

### 3.1 Sales Reports

**P0**
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

**Sales Summary**
Use one report with grouping:
- Daily
- Weekly
- Monthly
- Yearly
- Custom

Optional breakdown:
- Summary
- By Product
- By Customer
- By Salesperson

Source financial sales from **Approved Sales Invoice**, not Delivery Challan.

### 3.2 Customer & Collection Reports

**P0**
- Customer List
- Customer Running Ledger
- Customer Dues / Receivables
- Customer Collection Report
- Customer Sales Summary

**P1**
- Customer by Product

**Customer List columns**
- Customer
- Contact person
- Address
- Phone/mobile
- Territory
- Salesperson
- Opening due
- Invoiced in selected period
- Paid/collected in selected period
- Current due/balance
- Status

Use the authoritative customer-ledger formula:

```text
Opening due
+ Approved invoice debit
- Posted collection credit
± approved reversal/adjustment
= Closing due
```

Do not financially debit both Delivery and Invoice.

### 3.3 Supplier & Import Reports

**P0 / reuse**
- Import / Shipment Register
- Import Cost Breakdown
- Landed Cost by Product
- Landed Cost History by Batch

**P1**
- Supplier List
- Supplier Statement / Ledger
- Import Purchase Order Register
- Imported Product Summary
- Supplier-wise Import Summary
- PO / Import vs Warehouse Receipt

**Supplier List columns**
- Supplier
- Country/address
- Contact
- Phone/email
- PO/import value
- Paid
- Unpaid/payable
- Current balance
- Status

Paid/unpaid/balance must come from persisted supplier financial events.

### 3.4 Inventory & Product Reports

**P0**
- Product List
- Stock Summary
- Current Batch Stock
- Product Details
- Stock Movements
- Expiry Attention
- Item-wise Sales
- Product Family-wise Sales

**P1/P2**
- Product Family-wise Imports
- Product Gross Profit — restricted

**Product List columns**
- Product
- Family/category
- Model/SKU/alias
- Unit
- Current stock
- Batch count
- Nearest expiry
- Status

### 3.5 Expense & Accounts Reports

**P0 / reuse**
- Monthly A/C Summary
- Daily Expenditure
- Expense Category Summary
- Expense by Person
- Expense by Office / Warehouse / Company
- Monthly Expense
- TA/DA
- Cash / Bank Transactions

**P0/P1 additions**
- Day Book
- Cash Transactions
- Bank Transactions
- Mobile Banking Transactions
- Cash & Bank Movement Summary
- Balance Sheet

Cash / Bank / Mobile Banking should reuse one account-transaction source with filters.

Do not call Cash & Bank Movement Summary a formal Cash Flow Statement unless cash-flow classification is later implemented.

### 3.6 Employee & Marketing Reports

**P0**
- Employee List
- Employee Performance
- Employee Activity
- Sales Team Comparison
- Salesman Ledger
- Daily Marketing Activity
- Lead Funnel
- Follow-up Status
- Target vs Actual
- Visit Verification

All printing/configuration moves to Reports.

Employee/Marketing modules keep operational summaries and buttons that deep-link to the correct Reports page.

### 3.7 Audit & Control Reports

**P0**
- Audit Trail
- Delivery vs Invoice Exceptions

**P1**
- Access / Permission Change Audit
- Stock / FIFO Override Audit

Audit remains permission-restricted.

## 4. Central report registry

Create:

```text
src/domains/reports/reportCatalog.ts
```

Recommended definition:

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

The registry controls:
- card visibility;
- route metadata;
- filters;
- export/print actions;
- permission/capability rules.

Register existing Update 8 reports before adding new report calculations.

## 5. Shared report execution contract

Every report returns one normalized result object.

Example:

```ts
type ReportResult = {
  meta: {
    title: string;
    generatedAt: string;
    filters: Record<string, string>;
  };
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  summary?: ReportSummaryItem[];
  totals?: Record<string, number | string>;
};
```

Use this same result for:

```text
Screen preview
CSV
A4 Print Preview
Saved/printed PDF
```

Do not perform a second calculation in the print component.

## 6. Balance Sheet implementation

### Phase A — verify existing sources

Confirm availability of:
- cash account balances;
- bank/mobile account balances;
- customer receivables;
- stock quantity and authoritative cost;
- recoverable advance balances;
- company loan outstanding;
- supplier payable/payment events;
- opening equity/capital;
- fixed assets/depreciation;
- statutory payable;
- other receivable/payable.

### Phase B — add only missing minimum sources

#### Supplier settlement ledger

Add/persist:
- supplier ID;
- import/PO/reference;
- obligation/payable amount;
- payment amount;
- payment date;
- account;
- reference;
- notes;
- status;
- created/approved metadata.

#### Controlled financial-position accounts

Restricted Accounts/MD/SA entries for:
- Opening/Owner Capital
- Fixed Assets
- Accumulated Depreciation
- Statutory Payables
- Other Receivables
- Other Payables
- Opening Retained Earnings

Every entry:
- dated;
- referenced;
- reasoned;
- auditable.

#### Opening-balance migration

Provide a controlled opening-balance screen/import at cutover.

### Phase C — Balance Sheet report

Route:

```text
/app/reports/balance-sheet
```

Primary filter:
- As of date

Optional P2:
- Compare with previous date

Sections:

**Assets**
- Cash in Hand
- Bank & Mobile Financial Accounts
- Accounts Receivable
- Inventory
- Recoverable Advances
- Other Current Assets
- Fixed Assets
- Less Accumulated Depreciation

**Liabilities**
- Supplier Payable
- Statutory Payables
- Other Current Liabilities
- Company Loan Outstanding

**Equity**
- Owner / Opening Capital
- Opening Retained Earnings
- Current-period result only after validated

Validation:

```text
Assets - (Liabilities + Equity) = 0
```

If not zero, show an authorized reconciliation warning. Never silently create a balancing value.

## 7. Print standardization

### 7.1 Exact page-edge values

Use the client's exact values:

```text
Left: 1.5 mm
Right: 0.2 mm
```

Do **not** use 15 mm.

### 7.2 Add internal letterhead safe area

The page-edge margin is separate from the decorative safe zone.

Use shared variables such as:

```css
--report-page-left: 1.5mm;
--report-page-right: 0.2mm;
--report-letterhead-safe-left: <calibrated>;
--report-letterhead-safe-top: <calibrated>;
--report-letterhead-safe-bottom: <calibrated>;
```

Calibrate `safe-left` against the actual MIPRO letterhead so report content never overlaps the vertical background text.

### 7.3 Shared report print components

Create/reuse:
- `ReportPrintSheet`
- `ReportPrintHeader`
- `ReportPrintMeta`
- `ReportPrintTable`
- `ReportPrintTotals`
- optional `ReportPrintSignatures`

All report pages use these.

### 7.4 Consistent actions

Create/reuse shared buttons:
- Generate / Refresh
- Print Preview
- Export CSV

`Print Preview` must use the same:
- label;
- icon;
- color;
- size;
- hover/focus state

everywhere.

### 7.5 Protect calibrated business documents

Do not automatically redesign:
- Invoice
- Delivery Challan
- Money Receipt
- Debit Voucher
- Credit Voucher
- Quotation

unless a specific overlap defect is confirmed and the changed template passes UAT.

## 8. Cross-module changes

### Employees

Keep normal employee UI.

Replace local print/report configuration with links such as:

```text
/app/reports/employee-performance?employeeId=<id>
```

### Sales & Marketing

Keep workflows.

Deep-link report actions to Sales Summary, Invoice Register, Sales Sheet, Customer Ledger, Salesman Ledger and Marketing reports.

### Inventory

Keep Stock, Batches and Movements.

Deep-link Product List, Stock Summary, Expiry Attention and Stock Movements.

### Imports

Keep current import case workflow.

Deep-link Import Register, Import Cost Breakdown, Landed Cost by Product and Supplier/Import reports.

### Expenses & Accounts

Keep operational entry screens.

Deep-link Expense reports, Day Book, Cash/Bank reports, Monthly A/C Summary and Balance Sheet.

No duplicate report calculations.

## 9. RBAC / scope

Use existing effective permission and capability logic.

### Sensitive
Gate:
- landed cost;
- import cost;
- valuation if cost-sensitive;
- profit;
- Balance Sheet;
- sensitive financial-position reports.

### Employee/team scope
Preserve:
- Sales Executive → SELF
- Sales Manager → TEAM
- MD / Super Admin → ALL
- other users → existing role/override rules

### Direct routes
A hidden card is not enough. The report data endpoint/service must enforce permission and scope.

## 10. URL migration

Canonical:

```text
/app/reports/:reportId
```

Optional filters in query parameters:
- period
- from
- to
- employeeId
- salespersonId
- customerId
- supplierId
- productId
- productFamily
- accountId
- status

Map old report links to the new routes so Update 8/9 links do not break.

## 11. P0 / P1 / P2 order

### P0 — UI consolidation + reuse

1. Re-check latest `dev` head.
2. Inventory exact existing report IDs/services.
3. Build `reportCatalog.ts`.
4. Replace current first-level Report subtabs with one catalogue page.
5. Add seven category sections.
6. Build shared report card component.
7. Add canonical `/app/reports/:reportId` route.
8. Build reusable report-detail shell.
9. Build shared period selector.
10. Build conditional filter renderer.
11. Register all existing reports.
12. Reuse existing result tables/services.
13. Standardize Generate / Print Preview / CSV.
14. Add old URL mapping.
15. Move Marketing and Audit discovery into the catalogue.
16. Update cross-module report buttons.
17. Apply shared report print shell and safe-area correction.

### P0 — client-requested reports that existing data can support

18. Sales Summary.
19. Customer List.
20. Product List.
21. Sales Order Register.
22. Order Fulfilment Difference.
23. Sales by Product Family.
24. Day Book.
25. Cash Transactions.
26. Bank Transactions.
27. Mobile Banking Transactions.
28. Employee List, if required for printing.

### P1 — supplier finance + Balance Sheet foundation

29. Verify supplier payable/payment persistence.
30. Add minimal supplier settlement ledger if missing.
31. Supplier List.
32. Supplier Statement.
33. Supplier-wise Import Summary.
34. Import Purchase Order Register.
35. Imported Product Summary.
36. Add controlled financial-position accounts.
37. Add opening-balance migration.
38. Connect cash/bank balances.
39. Connect customer receivables.
40. Connect inventory valuation.
41. Connect recoverable advances.
42. Connect supplier payable.
43. Connect company loan.
44. Add fixed asset/depreciation balances if needed.
45. Add equity/opening capital.
46. Implement Balance Sheet with reconciliation check.

### P2 — optional analytics

47. Customer by Product.
48. Product Family-wise Imports.
49. Access Change Audit.
50. FIFO Override Audit.
51. Gross Profit by Product.
52. Gross Profit by Customer.
53. Gross Profit by Salesperson.
54. Operational Profit Summary.
55. Balance Sheet comparison view.

P2 must not delay the simple Reports catalogue.

## 12. UAT checklist

### Catalogue
- [ ] Reports opens one grouped page.
- [ ] No separate Marketing Analysis / Print Preview / Audit first-level tabs.
- [ ] Existing reports are present once in the correct category.
- [ ] New required reports are present.
- [ ] Mobile has no giant horizontal report tab strip.

### Report detail
- [ ] Clicking a card opens a dedicated page.
- [ ] Period presets work.
- [ ] Custom From/To works.
- [ ] Only relevant filters appear.
- [ ] Generate/Refresh updates result.
- [ ] Print Preview has identical styling across reports.
- [ ] CSV uses identical filtered data.

### Sales
- [ ] Sales Summary supports daily/weekly/monthly/yearly/custom.
- [ ] Financial totals use Approved Invoice.
- [ ] Delivery is not double-counted as revenue.
- [ ] Item-wise totals match invoice-line source.

### Customer
- [ ] Customer List includes address and phone when available.
- [ ] Paid/collection values come from posted collections.
- [ ] Current due comes from customer ledger.

### Supplier
- [ ] Supplier paid/unpaid/balance comes from persisted financial events.
- [ ] No guessed payable values.

### Inventory/Product
- [ ] Product List uses canonical product records.
- [ ] Current stock is consistent with inventory source.
- [ ] Sensitive landed-cost/profit is capability-gated.

### Employee/Marketing
- [ ] Employees module keeps simple operational information.
- [ ] Report/Print action opens Reports with entity preselected.
- [ ] SELF/TEAM/ALL scope remains enforced.

### Balance Sheet
- [ ] Uses an as-of date.
- [ ] Cash/bank is sourced from authoritative accounts.
- [ ] A/R uses customer ledger.
- [ ] Inventory uses authoritative cost basis.
- [ ] Supplier payable uses supplier ledger.
- [ ] Loan uses persisted outstanding balance.
- [ ] Manual financial-position entries are auditable.
- [ ] Assets vs Liabilities + Equity is checked.
- [ ] Missing accounting categories are not silently fabricated.

### Print
- [ ] Left page edge = **1.5 mm**.
- [ ] Right page edge = **0.2 mm**.
- [ ] Content does not overlap the left vertical letterhead branding.
- [ ] Title/table/footer remain in safe area.
- [ ] Multi-page reports remain readable.
- [ ] Preview and Save as PDF match.
- [ ] Existing transactional print templates are not accidentally broken.

### RBAC
- [ ] Hidden reports cannot be accessed by direct URL.
- [ ] Cost/profit/Balance Sheet access is capability-gated.
- [ ] Employee scope is enforced by backend/service.

## 13. Explicit non-goals

Do not:
- add a new main navigation item;
- add report subtabs everywhere in the ERP;
- create a second report engine;
- keep duplicate employee/marketing report builders;
- create a generic Party module;
- create a generic local Purchase module;
- count Delivery and Invoice twice;
- infer supplier balances;
- fabricate Balance Sheet values;
- expose sensitive cost/profit data;
- rewrite landed-cost allocation;
- rewrite FIFO;
- rebuild RBAC;
- add payroll/HRMS;
- add a generic BI/report designer;
- copy unsupported HishabPati features.

## 14. Final target structure

```text
Reports
├── Sales Reports
│   ├── Sales Summary
│   ├── Sales Invoice Register
│   ├── Sales Sheet
│   ├── Delivery Challan Register
│   ├── Delivery vs Invoice Exceptions
│   ├── Sales by Product / Item
│   ├── Sales by Product Family
│   ├── Sales by Customer
│   ├── Sales by Salesperson
│   ├── Sales by Month
│   ├── Sales Order Register
│   ├── Order Fulfilment Difference
│   └── Collections Received
│
├── Customer & Collection Reports
│   ├── Customer List
│   ├── Customer Running Ledger
│   ├── Customer Dues / Receivables
│   ├── Customer Collection Report
│   ├── Customer Sales Summary
│   └── Customer by Product [P1]
│
├── Supplier & Import Reports
│   ├── Supplier List
│   ├── Supplier Statement / Ledger
│   ├── Import / Shipment Register
│   ├── Import Purchase Order Register
│   ├── Import Cost Breakdown
│   ├── Landed Cost by Product
│   ├── Landed Cost History by Batch
│   ├── Imported Product Summary
│   ├── Supplier-wise Import Summary
│   └── PO / Import vs Warehouse Receipt [P1]
│
├── Inventory & Product Reports
│   ├── Product List
│   ├── Stock Summary
│   ├── Current Batch Stock
│   ├── Product Details
│   ├── Stock Movements
│   ├── Expiry Attention
│   ├── Item-wise Sales
│   ├── Product Family-wise Sales
│   └── Product Gross Profit [P1, restricted]
│
├── Expense & Accounts Reports
│   ├── Monthly A/C Summary
│   ├── Daily Expenditure
│   ├── Expense Category Summary
│   ├── Expense by Person
│   ├── Expense by Unit
│   ├── Monthly Expense
│   ├── TA/DA
│   ├── Cash / Bank Transactions
│   ├── Day Book
│   ├── Cash Transactions
│   ├── Bank Transactions
│   ├── Mobile Banking Transactions
│   ├── Cash & Bank Movement Summary
│   └── Balance Sheet
│
├── Employee & Marketing Reports
│   ├── Employee List
│   ├── Employee Performance
│   ├── Employee Activity
│   ├── Sales Team Comparison
│   ├── Salesman Ledger
│   ├── Daily Marketing Activity
│   ├── Lead Funnel
│   ├── Follow-up Status
│   ├── Target vs Actual
│   └── Visit Verification
│
└── Audit & Control Reports
    ├── Audit Trail
    ├── Delivery vs Invoice Exceptions
    ├── Access Change Audit [P1]
    └── Stock/FIFO Override Audit [P1]
```

## 15. Definition of done

Update 10 is complete when:

- the user can find every report from one Reports catalogue;
- the old fragmented report navigation is removed/mapped;
- existing report calculations are reused rather than duplicated;
- the client-requested Customer, Supplier, Product, Sales Summary, Item-wise and Balance Sheet requirements are represented correctly;
- Balance Sheet does not fabricate missing accounting data;
- employee/marketing/etc. report printing is centralized;
- Print Preview and export behavior are consistent;
- left/right report page edges are exactly 1.5 mm / 0.2 mm while the internal letterhead safe zone prevents overlap;
- permissions, sensitive-data capabilities and employee/team scope still work;
- on-screen preview, CSV, A4 preview and PDF are generated from the same filtered result.
