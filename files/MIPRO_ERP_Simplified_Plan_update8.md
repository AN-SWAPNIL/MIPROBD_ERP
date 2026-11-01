# MIPRO ERP — Simplified Plan Update 8

**Date:** 08 September 2026  
**Repository:** `AN-SWAPNIL/Medical_Supplier_ERP`  
**Branch:** `dev`  
**Baseline commit:** `3ebd5d22541e07b24c8b98f0dc854df77e4972dc`  
**Update theme:** Official Product Literature + Invoice/Ledger Reporting + A/C Report Completion

---

# 1. Executive Decision

Update 8 will **not redesign the ERP**.

The Update 7 information architecture is already implemented and should remain:

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

Update 8 addresses three new source-backed requirements:

```text
1. Public website and product pages must use the newly supplied brochures.
2. Primary product images for core dialysis products must be cropped from those PDFs.
3. The handwritten report sketches clarify Invoice, Customer Ledger,
   Salesman Ledger, monthly reports, A/C summary, vouchers and Sales Sheet.
```

---

# 2. Source Precedence for Update 8

For the areas covered in this update:

1. latest handwritten report sketches;
2. newly supplied MIPRO / Jiangxi Hongda product brochures;
3. earlier client meeting requirements;
4. current `dev` implementation;
5. older broad ERP plans.

Where handwriting is ambiguous, do not invent the label.

---

# 3. Preserve Current Full-System Structure

Do not reopen:

- Employee Hub design;
- Sales & Marketing naming;
- main navigation grouping;
- Imports;
- Inventory;
- Expenses & Accounts;
- Reports architecture;
- Settings architecture;
- public/ERP separation.

The latest implementation is the baseline.

---

# 4. Public Website — Goal

The public website should look like a MIPRO medical-supply website whose strongest visible product evidence comes from the supplied literature.

The homepage should not look like:

```text
ERP marketing
or
an HD-17H-only microsite
```

It should present:

```text
MIPRO Healthcare Corporation
Precision in Healthcare

Core dialysis product families
+
institutional supply capability
+
manufacturer/product literature
+
contact/inquiry
```

---

# 5. Core Public Product Families for Update 8

Prioritize:

```text
Hollow Fiber Hemodialyzer
Blood Tubing Set for Hemodialysis
A.V. Fistula Needle Set
```

These three now have dedicated source material.

Other products remain in the catalogue but should not receive unsupported technical expansion.

---

# 6. Product Images — Mandatory Source Rule

For these products, primary website images must come from brochure crops:

```text
Hollow Fiber Hemodialyzer
→ crop from Dialyzer brochure

Blood Tubing Set
→ crop from Blood LIne brochure

A.V. Fistula Needle
→ crop from AV Fistula brochure
```

Do not use web stock photography for these primary product images.

---

# 7. Product Image File Plan

Create local public assets such as:

```text
/public/products/dialyzer-brochure.svg
/public/products/blood-tubing-brochure.svg
/public/products/av-fistula-brochure.svg
```

The implementation may embed the cropped JPEG screenshot in SVG when the repository write interface cannot upload binary assets directly.

Browser presentation remains a normal image.

Later, these may be replaced by direct JPG/WebP files without changing product data paths if desired.

---

# 8. Homepage Literature — Simplify

Replace the current dialyzer-heavy tab set:

```text
Product Range
HD-17H Focus
Features
Technical Data
```

with:

```text
Product Catalogue
Hemodialyzer
Blood Tubing
A.V. Fistula
```

This is both simpler and more representative of supplied client material.

---

# 9. Homepage — Product Catalogue Tab

Source:

```text
Front Page.pdf
```

Show:

- three main dialysis families;
- short catalogue context;
- selected additional disposable categories;
- Open Catalogue PDF.

Keep copy concise.

---

# 10. Homepage — Hemodialyzer Tab

Use:

```text
Dialyzer 1 / 2 / 3
```

Primary visual:

```text
HD-17H brochure/product crop
```

Facts:

```text
HD-series hollow-fiber hemodialyzer
HD-17H high-flux focus
1.7 m² effective membrane area shown in supplied literature
```

Product Detail should carry the deeper feature/technical references.

---

# 11. Homepage — Blood Tubing Tab

Use the new Blood LIne source.

Facts can include:

```text
20-A / 20-B / 22-A / 22-B / 30-A / 30-B models shown
EO / Gamma configurations shown
30 pcs package shown
```

Avoid overloading homepage with the full model table.

---

# 12. Homepage — A.V. Fistula Tab

Use the new AV Fistula sources.

Facts:

```text
14G / 15G / 16G / 17G options
Rotating / fixed wing configurations
EO sterilization shown
```

Detailed color/model table belongs on Product Detail.

---

# 13. Public Product — Hemodialyzer

Keep existing detailed structure.

Update primary image to brochure crop.

Recommended image gallery:

```text
1. Product crop
2. HD-17H information sheet
3. membrane/features sheet
4. technical comparison sheet
```

---

# 14. Public Product — Blood Tubing

Update public record.

## Features

Use source-backed descriptions around:

```text
medical-grade tubing
smooth tubing construction
multiple structures / sizes
pump-tube fatigue resistance
```

## Variants

```text
20-A
20-B
22-A
22-B
30-A
30-B
```

## Specifications

Include source-present fields:

```text
Product family
Models
Pump tube / venous chamber
Sterilization
Package
Carton size
```

---

# 15. Public Product — A.V. Fistula Needle

Update public record.

## Features

```text
Triple-bevel needle tip
Silicone-coated needle
Rotating or fixed wing
Color-coded components
Anti-slip wing
Protective cap
Single-use sterile presentation
```

## Variants

```text
14G / 2.1 mm
15G / 1.8 mm
16G / 1.6 mm
17G / 1.4 mm
```

## Specifications

```text
Wing: Rotating / Fixed
Sterilization: EO
Packing: 50 pcs × 10 boxes
Carton: 60 × 44.5 × 28.5 cm
```

---

# 16. Manufacturer / Certification Copy Rule

When a statement originates from the brochure:

prefer:

```text
“The supplied product literature lists...”
```

rather than:

```text
“MIPRO certifies...”
```

Manufacturer documents remain manufacturer documents.

---

# 17. Product Detail Image UX

Keep the existing clean product page.

Optional P1:

add clickable thumbnail gallery when multiple images exist.

Do not turn Product Detail into a full PDF viewer.

---

# 18. Public Literature Files

Existing deployed Dialyzer/Front Page resource PDFs remain available.

For the new Blood Tubing / A.V. Fistula PDFs:

P0 options:

```text
A. deploy the source PDF into /public/resources
or
B. deploy a page preview and link only to Product Detail until binary PDF asset is available
```

Do not create a broken PDF link.

---

# 19. Report System — Main New Decision

The handwritten Sales sketch confirms:

# **Sales Invoice is required.**

Earlier “Invoice pending confirmation” is superseded for this workflow.

Invoice must now be designed as a real sales document.

---

# 20. Do Not Add Invoice as Main Navigation

Keep:

```text
Sales & Marketing
├── Customers
├── Marketing
├── Quotations & Orders
├── Deliveries
└── Collections
```

Invoice is contextual.

Recommended entry points:

```text
Order → Create / Open Invoice
Delivery → Create / Open Invoice
Customer → Invoice History
Reports → Invoice Register
```

---

# 21. Sales Workflow After Update 8

Recommended:

```text
Lead
→ Customer
→ Quotation
→ Order
→ Delivery Challan
→ Invoice
→ Collection
```

Delivery and Invoice have different authoritative responsibilities.

---

# 22. Delivery Challan Responsibility

Approved/posted Delivery:

```text
reduces stock
records product and quantity delivered
records batch allocation
feeds Delivered Product reports
```

Delivery does not create a second financial sale once Invoice posting becomes authoritative.

---

# 23. Invoice Responsibility

Approved Invoice:

```text
records sales receivable
posts debit to Customer Ledger
feeds Invoice/Sales reports
links customer and salesperson
```

Draft Invoice:

```text
does not change Customer Ledger
```

---

# 24. Collection Responsibility

Posted Collection:

```text
credits Customer Ledger
reduces due
posts cash/bank inflow
links salesperson/customer
```

No change to the existing principle.

---

# 25. Proposed Invoice Type

```ts
type SalesInvoice = {
  id: string;
  invoiceNumber: string;

  orderId?: string;
  deliveryIds: string[];

  customerId: string;
  customerName: string;

  ownerId: string;

  date: string;
  createdAt: string;
  approvedAt?: string;

  lines: SalesLine[];

  subtotal: DecimalString;
  discountTotal: DecimalString;
  total: DecimalString;

  status:
    | "Draft"
    | "Approved"
    | "Cancelled";

  remarks?: string;

  approvedByUserId?: string;
  cancellationReason?: string;
};
```

---

# 26. Invoice Number

Use business numbering such as:

```text
INV-2026-0001
```

The exact prefix can later be made configurable.

Do not reuse Quotation or Order number as Invoice number.

---

# 27. Invoice Creation

Simplest safe workflow:

```text
Create Invoice from Order / Delivery
```

Auto-fill:

- customer;
- salesperson owner;
- delivered/order lines;
- prices;
- discount;
- amount.

Allow authorized edit only while Draft.

---

# 28. Partial Delivery / Invoice

P0 recommendation:

support selecting delivered lines/quantities.

Prevent:

```text
invoiced quantity > eligible delivered quantity
```

unless client explicitly wants advance invoicing.

This makes delivery/invoice reconciliation safe.

---

# 29. Invoice Approval

Use existing access model.

Recommended:

```text
sales:approve
```

Draft:

```text
Create/Edit
```

Approved:

```text
financially posted / locked
```

Cancelled:

```text
reason required
audit event
ledger reversal if previously approved
```

---

# 30. Customer Ledger Update

Target ledger event types:

```text
Opening Due
Invoice
Collection
```

Optionally:

```text
Adjustment
Reversal
```

later.

---

# 31. Backward Compatibility for Existing Delivery-Based Ledger

Do not retroactively corrupt historical/demo balances.

Implementation approach:

```text
Legacy existing records
→ preserve calculated balance

New Invoice-enabled records
→ Invoice is financial debit
```

Then migrate demo data carefully if desired.

---

# 32. Customer Ledger UI

Keep one Customer Ledger.

Do not create “Invoice Ledger” separately.

Columns:

```text
Date
Type
Reference
Debit / Sale
Credit / Collection
Running Due
Remarks
```

---

# 33. Salesman Ledger

Add a report view, not a new persistent financial ledger.

Source:

```text
Invoice
Collection
Customer ownership
```

Suggested columns:

```text
Date
Salesperson
Customer
Type
Reference
Sales / Debit
Collection / Credit
Customer Running Due
```

---

# 34. Salesman Ledger Access

Sales Executive:

```text
own
```

Sales Manager:

```text
team
```

MD / Super Admin:

```text
all
```

Use current employee/report scope.

---

# 35. Salesman Ledger Shortcut

Expose from:

```text
Employees → Activity & Reports
```

as:

```text
Sales Ledger
```

which opens canonical Reports with employee preselected.

Do not duplicate the ledger implementation inside Employees.

---

# 36. Sales Reports — Final Required Set

Under:

```text
Reports → Sales & Collection
```

retain current tables and add/rename as needed:

```text
Delivered Product Report
Delivery Challan Register
Invoice Register
Sales by Product
Sales by Customer
Sales by Salesperson
Sales by Month
Salesman Ledger
Customer Ledger
Collections
Dues / Receivables
Sales Sheet
```

---

# 37. Sales by Product

Current implementation already exists.

After Invoice is introduced, provide a clear basis selector/preset if necessary:

```text
Invoiced Sales by Product
Delivered Product Report
```

Do not silently mix the two.

---

# 38. Sales by Customer

After Invoice implementation:

default financial Sales by Customer should use:

```text
Approved Invoice value
```

Operational Delivered by Customer may remain a separate table.

---

# 39. Sales by Salesperson

Derive:

```text
Approved Invoice sales
Posted collection
Customer due
```

plus existing activity/performance metrics where useful.

Do not create manual salesperson totals.

---

# 40. Monthly Sales Report Package

Add convenient presets:

```text
This Month — Sales Summary
This Month — Salesman-wise
This Month — Customer-wise
This Month — Collection
This Month — Dues
```

These use existing Period presets, not separate backend modules.

---

# 41. Sales Sheet

Add:

```text
Reports → Sales & Collection → Sales Sheet
```

Recommended Detail columns:

```text
Date
Invoice
Customer
Salesperson
Product
Qty
Rate
Amount
```

Recommended Summary mode:

```text
Date
Invoice
Customer
Salesperson
Total
Collection
Due
```

---

# 42. Sales Sheet Print

Extend PrintPage:

```text
documentType = sales-sheet
```

or use the existing operational-report print pipeline with a dedicated table.

Prefer reuse of:

```text
buildOperationalLetterheadPages
```

unless a special paper format is required.

---

# 43. A/C Report — New Preset/Table

Under:

```text
Reports → Expense & Cash-Bank
```

add:

```text
Monthly A/C Summary
```

The report should be usable for any selected period, despite the “monthly” preset.

---

# 44. Monthly A/C Summary — Operating Section

Show:

```text
Sales Collection
Office Expense
Salary
TA
DA
Business Entertainment
Donation
Boarding Expense
Other Operating Expense
```

Amounts come from posted records.

---

# 45. Monthly A/C Summary — Non-Expense Section

Show separately:

```text
Advance Paid
Advance Settled / Recovered
Company Loan Received
Company Loan Repaid
```

Do not mix these into the operating-expense subtotal.

---

# 46. Expense Category Changes

Add:

```text
Donation
Boarding Expense
```

For entertainment:

either keep:

```text
Office Entertainment
```

or rename/report it as:

```text
Business Entertainment
```

without breaking historical category records.

---

# 47. Advance Model — P0 Minimal

Do not add `Advance` as a generic Expense category.

Add a controlled account transaction / advance record.

Minimal fields:

```text
Date
Employee / Party
Amount
Paid From Account
Purpose
Reference
Status
Remarks
```

If client later confirms recoverable employee advances, extend to a balance subledger.

---

# 48. Company Loan Model — P0 Minimal

Do not add Company Loan as ordinary Expense.

Represent:

```text
Loan Received
Loan Repaid
```

as controlled Cash/Bank financing transactions.

Fields:

```text
Date
Party / Lender
Amount
Account
Reference
Remarks
Direction
```

No amortization engine required.

---

# 49. Account Transaction Type Extension

Current transaction source types are limited.

Extend safely for:

```text
Advance
Company Loan
Voucher / Manual Authorized Transaction
```

with audit trail.

---

# 50. Debit Voucher

Add printable Debit Voucher for eligible outgoing account transactions.

Suggested source:

```text
Expense
Advance Paid
Loan Repayment
authorized manual account debit
```

Print fields:

```text
Voucher No.
Date
Paid To / For
Purpose
Account
Amount
Reference
Prepared By
Approved By
```

---

# 51. Credit Voucher

Add printable Credit Voucher for eligible incoming account transactions.

Suggested source:

```text
Collection
Advance Recovery
Loan Received
authorized manual account credit
```

Print fields mirror Debit Voucher.

---

# 52. Voucher Numbering

Recommended:

```text
DV-2026-0001
CV-2026-0001
```

Do not use transaction database IDs as business-facing references.

---

# 53. Voucher Approval

P0:

voucher is generated only from an already authorized/posted transaction.

This avoids creating another posting workflow.

Later, if client wants voucher-first accounting entry:

```text
Draft Voucher
→ Approval
→ Posting
```

can be added.

---

# 54. PrintPage Extension

Add support for:

```text
Sales Invoice
Debit Voucher
Credit Voucher
Sales Sheet
```

Reuse:

- MIPRO / LED identities;
- digital/preprinted mode;
- A4 calibration;
- existing LetterheadSheet;
- existing access checks.

---

# 55. Marketing Activity Integration

Approved Invoice should automatically add:

```text
INVOICE_APPROVED
```

to the unified employee activity feed.

Fields:

```text
employee
customer
invoice
amount
time
```

No manual duplicate activity.

---

# 56. Marketing Score

Do **not** add Invoice points by default.

Current score rules remain.

If client later says Invoice approval should score:

add it as a configurable score rule.

---

# 57. Dashboard

Do not enlarge Dashboard significantly.

Potential manager quick metric:

```text
Uninvoiced Deliveries
```

only if nonzero/important.

P1.

---

# 58. Delivery vs Invoice Exception Report

P1 recommended table:

```text
Delivered but not invoiced
Invoice exceeds delivered quantity
Cancelled invoice with collection
```

This is a strong internal control after Invoice introduction.

---

# 59. Products and Internal ERP

The public website product content and internal Product Master should remain separate concepts.

Public:

```text
marketing/catalogue content
```

Internal:

```text
canonical SKU/variant/HS/sale price
```

Do not overwrite internal product variants with brochure-family prose.

---

# 60. Public Product Mapping

Map public family to internal products where useful, but do not require a 1:1 record.

Example:

```text
Public: A.V. Fistula Needle
Internal:
A14...
A15...
A16...
A17...
```

The public page can display family-level source specs.

---

# 61. Report Simplicity Rule

Do not add a new top-level Reports area for each handwritten label.

Use:

```text
one Reports module
+
clear report groups
+
presets
+
filters
+
print
```

This is compatible with the client's “several ways report generating” request without creating navigation overload.

---

# 62. Recommended Reports Structure After Update 8

```text
Reports
├── Overview
├── Marketing Analysis
│
├── Import & Cost
│
├── Inventory
│
├── Sales & Collection
│   ├── Delivered Product
│   ├── Delivery Challan Register
│   ├── Invoice Register
│   ├── Sales Sheet
│   ├── Sales by Product
│   ├── Sales by Customer
│   ├── Sales by Salesperson
│   ├── Sales by Month
│   ├── Salesman Ledger
│   ├── Customer Ledger
│   ├── Collections
│   └── Dues
│
├── Expense & Cash-Bank
│   ├── Monthly A/C Summary
│   ├── Daily Expenditure
│   ├── Expense Category Summary
│   ├── Expense by Person
│   ├── Expense by Unit
│   ├── TA/DA
│   └── Cash/Bank Transactions
│
└── Audit
```

---

# 63. Employee Hub Compatibility

Keep:

```text
Employees
├── Employee Directory
├── Access & Roles
├── Field Team
└── Activity & Reports
```

Add shortcuts inside Activity & Reports:

```text
Salesman Ledger
Full Performance Report
Field Map
```

No new Employee tab is required.

---

# 64. Sales & Marketing Compatibility

Keep current tabs.

Potential contextual Invoice UI:

### Quotations & Orders

Order row:

```text
Open
Invoice
```

### Deliveries

Delivery row:

```text
Print Challan
Create/Open Invoice
```

### Collections

Can link:

```text
Invoice / Order reference
```

when available.

---

# 65. Customer Detail Compatibility

Customer Ledger becomes stronger.

Recommended customer actions:

```text
Quotation
Order
Invoice
Collection
Ledger
Marketing History
```

These are contextual links, not main tabs.

---

# 66. RBAC

No new roles.

Reuse:

```text
sales
accounts
reports
print
users
marketing
```

Invoice approval:

```text
sales:approve
```

Voucher generation:

```text
accounts:view/post
+
print:view
```

Reports:

```text
reports:view/export
```

---

# 67. Audit Requirements

Audit:

```text
Invoice created
Invoice approved
Invoice cancelled/reversed
Voucher printed where significant
Advance posted
Advance settlement
Company loan received
Company loan repaid
```

Do not audit every report view.

---

# 68. Sensitive Information

Public website must never receive:

```text
landed cost
profit
internal stock valuation
supplier commercial terms
```

Sales reports must continue respecting:

```text
view_profit
view_sensitive_cost
```

Invoice does not grant cost visibility.

---

# 69. Implementation Phase 1 — Source Assets & Public Product Data

1. crop supplied PDFs;
2. create deployable brochure-derived product images;
3. change primary images for Dialyzer, Blood Tubing and A.V. Fistula;
4. enrich Blood Tubing public data;
5. enrich A.V. Fistula public data;
6. preserve existing Dialyzer technical material.

This can be implemented first with minimal ERP risk.

---

# 70. Implementation Phase 2 — Homepage Product Literature

1. reduce literature tabs to four:
   - Catalogue
   - Hemodialyzer
   - Blood Tubing
   - A.V. Fistula
2. use brochure-backed previews;
3. retain detailed dialyzer resource access from product detail/resources;
4. avoid broken PDF links.

---

# 71. Implementation Phase 3 — Non-Breaking Report Additions

Before changing financial posting:

1. add Delivery Challan Register;
2. add Sales by Salesperson;
3. add Salesman Ledger using current available transactions;
4. add Sales Sheet;
5. add Monthly A/C Summary;
6. add Donation / Boarding Expense categories;
7. keep Advance / Company Loan separate.

This lets the client review report shapes early.

---

# 72. Implementation Phase 4 — Invoice Domain

1. add SalesInvoice type/schema;
2. seed demo invoices;
3. add service/API endpoints;
4. create invoice from Order/Delivery;
5. approve/cancel;
6. add Print Invoice;
7. add Invoice Register;
8. add activity event;
9. add audit.

---

# 73. Implementation Phase 5 — Ledger Migration

1. make approved Invoice the financial sales debit for new records;
2. preserve existing demo/historical balances;
3. update Customer Ledger;
4. update Salesman Ledger;
5. update Sales by Customer/Product/Salesperson financial basis;
6. add delivered-vs-invoiced distinction.

Do not do this as an unreviewed silent change.

---

# 74. Implementation Phase 6 — Vouchers / Financing

1. add Donation/Boarding operating expense categories;
2. add minimal Advance transaction;
3. add minimal Company Loan transaction;
4. add Debit Voucher print;
5. add Credit Voucher print;
6. add A/C report non-operating section.

---

# 75. P0

## Public

- brochure-derived product crops;
- Blood Tubing page enrichment;
- A.V. Fistula page enrichment;
- balanced homepage literature.

## Reports

- acknowledge Invoice requirement;
- Delivery Challan Register;
- Salesman-wise report;
- Customer-wise report;
- Collection;
- Dues;
- Salesman Ledger;
- Sales Sheet;
- Monthly A/C Summary.

## Accounts

- Donation;
- Boarding Expense;
- separate Advance/Company Loan concept.

---

# 76. P1

- Invoice creation/approval UI;
- Invoice printing;
- Invoice-based Customer Ledger;
- Debit/Credit Voucher print;
- delivery/invoice exception report;
- searchable large report selectors;
- product image gallery thumbnails.

---

# 77. P2

- Supabase persistence;
- Realtime;
- mobile app;
- scheduled reminders;
- durable document storage;
- mature advance/loan subledgers if needed;
- LangGraph behind existing AI.

---

# 78. UAT — Landing Page

1. Open homepage.
2. Core literature shows Catalogue / Hemodialyzer / Blood Tubing / A.V. Fistula.
3. Images clearly come from supplied brochures.
4. No stretched full brochure is used as a tiny product thumbnail.
5. Product button opens matching Product Detail.
6. No internal ERP information is exposed.

---

# 79. UAT — Blood Tubing Product

Verify visible information matches source:

```text
20-A / 20-B / 22-A / 22-B / 30-A / 30-B
EO / Gamma
30 pcs
```

and source-backed product characteristics.

Do not display claims not shown in source.

---

# 80. UAT — A.V. Fistula Product

Verify:

```text
14G
15G
16G
17G

Rotating / Fixed
EO
50 pcs × 10 boxes
```

and source-backed feature descriptions.

---

# 81. UAT — Sales Invoice

1. Open eligible Order/Delivery.
2. Create Invoice.
3. Draft does not affect due.
4. Approve Invoice.
5. Customer Ledger gets one debit.
6. Delivery does not add a second debit.
7. Print Invoice works.
8. Invoice appears in Report.
9. Invoice appears in salesperson activity feed.
10. Cancel/reverse requires reason.

---

# 82. UAT — Customer Ledger

Example:

```text
Opening Due        10,000
Invoice            50,000
Collection         20,000
```

Expected:

```text
Running Due = 40,000
```

No duplicate debit from the Delivery Challan.

---

# 83. UAT — Salesman Ledger

Select salesperson.

Verify:

```text
only allowed salesperson scope
sales
collections
customer
references
period
```

match source transactions.

---

# 84. UAT — Monthly Reports

For one month generate:

```text
Salesman-wise
Customer-wise
Product-wise
Collection
Dues
Sales Sheet
```

Print/export must match on-screen data.

---

# 85. UAT — A/C Summary

Verify selected period shows:

```text
Sales Collection
Office Expense
Salary
TA
DA
Entertainment
Donation
Boarding
```

and separates:

```text
Advance
Company Loan
```

from operating expense.

---

# 86. UAT — Debit/Credit Voucher

Debit transaction:

```text
Print Debit Voucher
```

Credit transaction:

```text
Print Credit Voucher
```

Voucher must match the underlying account transaction exactly.

---

# 87. What Not To Do

Do not:

- redesign main navigation;
- remove Employees;
- create separate Marketing main module;
- create separate Invoice main module;
- create separate Ledger main module;
- create a second report engine;
- count Delivery and Invoice as two sales debits;
- treat recoverable Advance as normal Expense;
- treat Company Loan as operating Expense;
- publish internal pricing/cost;
- invent product claims from memory;
- use unrelated stock product photos when the supplied brochure has the product;
- break existing print calibration;
- rewrite FIFO or import costing.

---

# 88. Final Update 8 Business Flow

```text
PUBLIC PRODUCT FLOW

Supplied Brochure
→ Approved Crop / Product Facts
→ Public Product
→ Inquiry
→ Marketing Lead
```

```text
SALES FLOW

Lead
→ Customer
→ Quotation
→ Order
→ Delivery Challan
→ Invoice
→ Collection
```

```text
LEDGER FLOW

Approved Invoice
→ Customer Ledger Debit

Posted Collection
→ Customer Ledger Credit

Customer / Owner Attribution
→ Salesman Ledger

Ledgers
→ Monthly Reports
```

```text
ACCOUNT REPORT FLOW

Collections
+
Operating Expenses
+
TA / DA
+
Salary
+
Entertainment
+
Donation / Boarding
+
separately classified Advance / Company Loan
→ Monthly A/C Summary
```

---

# 89. Exact Update 8 Milestone

# **Update 8 — Official Product Literature + Invoice/Ledger Reporting**

The implementation should deliver the newly supplied client intent while preserving the simplified Update 7 architecture.

The first implementation commit should prioritize safe, visible improvements:

```text
Product brochure crops
Public product data enrichment
Balanced homepage literature
Non-breaking report additions
```

Then Invoice/ledger posting should be implemented as the next controlled step because it changes the financial source of truth.

---

**End of Plan**
