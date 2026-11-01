# MIPRO ERP — Update 8 Source & Requirement Analysis

**Date:** 08 September 2026  
**Repository:** `AN-SWAPNIL/Medical_Supplier_ERP`  
**Branch reviewed:** `dev`  
**Latest reviewed commit:** `3ebd5d22541e07b24c8b98f0dc854df77e4972dc`  
**Commit message:** `fix: news and resources style`

---

## 1. Purpose

This document analyzes the newly supplied product brochures and the two handwritten report-system sketches against the **current** MIPRO ERP implementation.

The goal is not to re-design modules that are already working. The goal is to identify:

1. what the new source material actually says;
2. what is already implemented;
3. what is genuinely missing;
4. which new requirements change an earlier assumption;
5. how to add the missing behavior without making the ERP harder to use.

---

# 2. Current Project Baseline

The latest project is already beyond the earlier Update 7 planning stage.

The current sidebar is already organized as:

```text
Workspace
└── Dashboard

Operations
├── Imports
├── Inventory
├── Sales & Marketing
└── Expenses & Accounts

Management
├── Employees
└── Reports

System
└── Settings
```

The current Employees area already contains:

```text
Employee Directory
Access & Roles
Field Team
Activity & Reports
```

Therefore Update 8 must **preserve** this information architecture.

There is no reason to reopen the Employee Hub / navigation discussion unless a new source directly contradicts it.

---

# 3. Current Public Website Baseline

The public website is already a separate corporate/B2B experience.

Current public routes include:

```text
/
 /about
 /products
 /products/:slug
 /certificates
 /news
 /contact
 /login
```

The homepage already includes:

- hero carousel;
- published catalogue counts;
- MIPRO product-literature section;
- product families;
- featured products;
- supply-process content;
- company/corporate content;
- contact CTA.

The existing product-literature section is currently weighted heavily toward:

```text
Product Range
HD-17H Focus
Features
Technical Data
```

All three of the last tabs are dialyzer-focused.

The newly supplied Blood Tubing and A.V. Fistula brochures now justify balancing this section around the actual core dialysis product families.

---

# 4. Newly Supplied Product Sources

## 4.1 Front Page.pdf

The supplied catalogue front page groups the core portfolio into three prominent dialysis categories:

```text
HEMODIALYZER
BLOOD TUBING SET FOR HEMODIALYSIS
A.V FISTULA NEEDLE SET FOR SINGLE USE
```

It also shows selected additional disposable products:

```text
Burette Set
ET Tube
Scalp Vein Set
Foley's Catheter
```

### Interpretation

For the website, the first three are the strongest verified core product families because the client supplied dedicated product sheets for them.

The additional products shown only on the catalogue front page should not receive detailed technical claims unless dedicated source material exists.

---

# 5. Dialyzer Source Analysis

## 5.1 Dialyzer 1.pdf

The page is primarily a visual/campaign sheet.

Visible core information:

```text
MIPRO
Precision in Healthcare

Advanced Hemodialysis
Solutions for Better Life

HD-17H
Hollow Fiber Hemodialyzer
```

The visual presents the HD-17H dialyzer alongside blood-line products.

### Website use

Best uses:

- hero/landing-page visual;
- cropped primary product image;
- product-family literature preview;
- product detail image gallery.

Do not treat every marketing icon on the page as an independently verified regulatory claim.

---

## 5.2 Dialyzer 2.pdf

This is a stronger product-information sheet.

Important visible source-backed facts include:

```text
Hollow Fiber Hemodialyzer
High Flux HD-17H
Membrane Area 1.7 m²
PES membrane
```

The sheet also presents:

```text
S.E.T.
A.S.M.
P.E.T.
```

as named product technologies in the supplied manufacturer/product literature.

It visually explains a triple-layer asymmetric membrane structure.

### Recommended website use

Use only as:

> supplied product/manufacturer literature

Do not rewrite those branded technology statements as MIPRO clinical claims.

---

## 5.3 Dialyzer 3.pdf

This page contains the high-flux technical comparison table.

The table covers models approximately:

```text
HD-10H
...
HD-17H
...
HD-22H
```

HD-17H is visibly highlighted.

The source shows an effective membrane area of:

```text
1.7 m²
```

for HD-17H.

It also contains test-condition-dependent performance data.

### Website rule

The technical table may be exposed as manufacturer literature / reference.

Do not turn all test-table values into simplified marketing claims without retaining test-condition context.

---

# 6. Blood LIne.pdf Analysis

The document title is:

```text
BLOOD TUBING SET FOR HEMODIALYSIS
```

## 6.1 Product characteristics shown

The supplied page states, in substance:

- medical-grade material with biocompatibility and elasticity;
- smooth tubing / no knotting or deformation;
- precision extrusion and moulding;
- multiple sizes and structures;
- compatibility options for different hemodialysis equipment;
- pump tubing designed for fatigue resistance.

## 6.2 Models shown

The specification table visibly contains:

```text
20-A
20-B
22-A
22-B
30-A
30-B
```

References include EO and Gamma variants.

Pump tube / venous-chamber dimensions are shown by model.

The page shows:

```text
Package: 30 pcs
Carton size: 60 × 44.5 × 28.5 cm
```

## 6.3 Sterilization / visible badges

The brochure explicitly shows:

```text
EO / Gamma Radiation
DEHP FREE
LATEX FREE
NON PYROGENIC
EO GAS STERILE
ISO 80369-7 COMPLIANT
```

### Website interpretation

These items may be summarized only as claims **shown in the supplied product literature**.

The safest public copy is:

> “The supplied manufacturer/product sheet lists EO/Gamma configurations and shows DEHP-free, latex-free, non-pyrogenic and ISO 80369-7-related product information.”

Do not independently represent these as MIPRO-issued certifications.

---

# 7. AV Fistula1.pdf Analysis

The page title is:

```text
A.V FISTULA NEEDLE SET FOR SINGLE USE
```

The sheet describes vascular access for hemodialysis.

## 7.1 Features visibly listed

```text
Sharp triple-bevel needle tip
Silicone coated needle
Rotating or fixed wing
Color-coded clamps
Sterile, single-use
Anti-slip wing design
Safety design / protective cap
```

The sheet also highlights:

```text
Ultra-thin double-curved needle tip
Anti-slip wing concave-convex buckle
Safety protective cap
```

### Website interpretation

These are appropriate feature bullets for the A.V. Fistula product page because they are directly visible in the supplied product sheet.

---

# 8. Av Fistula 2.pdf Analysis

This is the stronger specification sheet.

## 8.1 Product characteristics

The sheet presents:

- multiple gauge/model options;
- medical-grade elastic material;
- smooth internal wall;
- imported needle components;
- double-curved sharp tips;
- siliconization;
- ergonomic clamp;
- anti-slip wing;
- protective safety-cap design.

## 8.2 Model / gauge table

Visible rows:

| Reference | Gauge | Approx. mm | Wing |
|---|---:|---:|---|
| A14R / A14F | 14G | 2.1 | Rotating / Fixed |
| A15R / A15F | 15G | 1.8 | Rotating / Fixed |
| A16R / A16F | 16G | 1.6 | Rotating / Fixed |
| A17R / A17F | 17G | 1.4 | Rotating / Fixed |

The table also uses color coding:

```text
14G — Purple
15G — Yellow
16G — Green
17G — Orange
```

Visible packaging:

```text
50 pcs × 10 boxes
Carton: 60 × 44.5 × 28.5 cm
```

Visible sterilization:

```text
Ethylene Oxide (EO)
```

### Website implication

The current A.V. Fistula product record is under-specified compared with this source.

Update 8 should enrich its variants/specification table from the brochure.

---

# 9. Product Image Requirement

The client explicitly requested:

> use cropped screenshots from these PDFs as product images.

This is a **content-authority requirement**, not merely a design preference.

Therefore:

```text
Dialyzer image
→ cropped from supplied Dialyzer brochure

Blood Tubing image
→ cropped from supplied Blood LIne brochure

A.V. Fistula image
→ cropped from supplied A.V. Fistula brochure
```

These images should become the primary public product images for the three products.

Existing unrelated stock/legacy images should not remain the first image where a supplied brochure image exists.

---

# 10. Recommended Homepage Literature Structure

The current literature section is too dialyzer-heavy after receiving the new sources.

Recommended simplified structure:

```text
Product Catalogue
Hemodialyzer
Blood Tubing
A.V. Fistula
```

Each tab should show:

- one official supplied visual;
- a short source-backed summary;
- 3 concise facts;
- View Product;
- Open Source Literature only where a deployable PDF is available.

Detailed dialyzer feature/technical sheets should remain available on the dialyzer product detail/resource area rather than consuming three homepage tabs.

---

# 11. Handwritten Report System 1 — Visual Interpretation

The first handwritten sheet is titled:

```text
Sales
```

There are two upper flows.

---

## 11.1 Left flow

Clearly readable:

```text
Delivered Products
↓
Delivery Challan
↓
Approved
↓
Report ...
```

The final handwritten words after “Report” are not sufficiently clear to treat as authoritative text.

### Safe interpretation

The client expects an approved Delivery Challan to be a reportable source document.

---

## 11.2 Right flow

Clearly readable:

```text
Sales by Product
↓
Invoice
↓
Approved
↓
Report
```

### Critical new requirement

This is the strongest new evidence that a **Sales Invoice** is part of the client's intended business/report workflow.

Earlier project notes treated Invoice as pending confirmation.

This source changes that assumption.

Invoice should now be treated as a real requirement unless later explicitly withdrawn by the client.

---

# 12. Customer Ledger Flow

Both upper flows visually feed:

```text
Customer Ledger
```

Then:

```text
Customer Ledger
→ Salesman Ledger
```

Then the diagram connects toward:

```text
Monthly Report
```

### Interpretation

The client expects reporting to be ledger-oriented:

```text
source business documents
→ customer ledger
→ salesperson/salesman ledger
→ monthly reports
```

This is more specific than simply showing disconnected report tables.

---

# 13. Monthly / Derived Sales Reports

The clearly readable handwritten list includes:

```text
Salesman-wise Report
Customer-wise Report
Collection Report
Dues Report
```

These should be treated as required report outputs.

The current ERP already provides much of this information, so the task is primarily to **organize and complete** it rather than build a new report engine.

---

# 14. Ambiguous Lower-Right Label

The first image contains a circled lower-right term that appears similar to:

```text
Sales Pattern
```

or another “Sales ...” analytical label.

The exact handwriting is not sufficiently reliable.

Below it are annotations indicating:

```text
Salesman wise
Customer wise
```

### Decision

Do not hardcode a report name from this ambiguous label.

The confirmed requirements are already covered by:

```text
Salesman-wise
Customer-wise
Collection
Dues
Monthly
```

If the client later names the circled report explicitly, it can be added as a report preset without architectural change.

---

# 15. Critical Ledger Accounting Interpretation

The sketch shows both:

```text
Delivery Challan
```

and:

```text
Invoice
```

feeding downstream reporting.

If both independently debit the Customer Ledger, sales will be double counted.

Therefore the safe business design is:

```text
Approved Delivery Challan
→ authoritative stock/quantity fulfilment
→ proves what was physically delivered

Approved Sales Invoice
→ authoritative sales/accounts-receivable debit
→ posts to Customer Ledger

Collection
→ authoritative credit
→ reduces Customer Ledger due
```

This preserves both documents without duplicate financial posting.

---

# 16. Current Customer Ledger vs New Requirement

Current ERP customer-ledger logic is delivery-based:

```text
Opening Due
Delivery
Collection
```

The handwritten flow introduces Invoice as the better financial sales document.

Recommended Update 8 target:

```text
Opening Due
Invoice
Collection
Adjustment / Reversal (future if needed)
```

Delivery remains linked to the invoice/order but is not the financial debit for new records.

### Backward compatibility

Existing demo / historical records may remain delivery-backed during migration.

Do not silently mutate historical balances.

---

# 17. Salesman Ledger Interpretation

A Salesman Ledger should **not** be a second financial ledger storing independent money values.

It should be a salesperson-filtered analytical view derived from:

```text
Invoices owned by salesperson
Collections attributed to salesperson
Customer balances assigned to salesperson
```

Example:

```text
Date
Salesperson
Customer
Type
Reference
Debit / Sales
Credit / Collection
Running Customer Due
```

This keeps one financial source of truth.

---

# 18. Current Report System — Already Present

The current server already exposes report tables including:

```text
Delivered Sales by Product
Sales by Customer
Sales by Product
Sales by Month
Collections Received
Customer Receivables
Customer Running Ledger
Salesperson Performance
```

Therefore these handwritten requirements are **partially already implemented**.

Do not create duplicate versions with slightly different names.

---

# 19. Report System 1 — Genuine Gaps

The genuine missing / changed items are:

```text
Sales Invoice entity/document
Invoice approval
Invoice-based customer-ledger debit for new transactions
Invoice Register
Salesman Ledger
Approved Delivery Challan report/preset
Monthly sales-report package
Sales Sheet print/report
```

---

# 20. Handwritten Report System 2 — Visual Interpretation

The second handwritten sheet is titled:

```text
A/C
```

This appears to be a draft of a monthly or period account summary.

Clearly or reasonably readable lines include:

```text
Sales Collection
Office Expense
Salary
TA
DA
Entertainment (Business)
Advance
Donation
Boarding Exp
Company Loan
```

A crossed-out “Daily Expense (office)” appears to be replaced by an Office Expense concept.

---

# 21. Interpretation of A/C Draft

The sheet appears to describe a compact management accounts summary rather than a full double-entry accounting package.

Likely desired monthly/period summary:

```text
Sales Collection
Office Expense
Salary
TA
DA
Business Entertainment
Advance
Donation
Boarding Expense
Company Loan
```

The system should expose those values in a report without pretending to replace formal accounting software.

---

# 22. Important Category Distinction

Not every handwritten A/C line is necessarily an ordinary operating expense.

## Appropriate operating expense categories

```text
Office Expense
Salary
TA
DA
Business Entertainment
Donation
Boarding Expense
```

## Potential balance-sheet / financing items

```text
Advance
Company Loan
```

### Why this matters

A recoverable employee advance is not the same as an expense.

A company loan receipt/payment is not the same as normal operating expense.

Blindly inserting these into Expense Category would damage financial meaning.

---

# 23. Recommendation for Advance

Model `Advance` initially as an account transaction / controlled advance record.

At minimum capture:

```text
Date
Person / Party
Amount
Paid From
Purpose
Status / Settlement Note
Reference
```

If later confirmed as employee-recoverable advance, a dedicated employee-advance subledger can be added.

Do not count an outstanding recoverable advance in operating expense totals by default.

---

# 24. Recommendation for Company Loan

Model Company Loan as a financing/account transaction, not ordinary expense.

Possible transaction directions:

```text
Loan Received
Loan Repaid
```

It should affect cash/bank but remain separated from operating expense.

A full loan-amortization module is not required.

---

# 25. Donation and Boarding Expense

These can safely be represented as operating expense categories if they match the client's business practice.

Recommended additions:

```text
Donation
Boarding Expense
```

For Entertainment, existing:

```text
Office Entertainment
```

may be renamed or supplemented with:

```text
Business Entertainment
```

depending on desired reporting terminology.

---

# 26. Bottom of A/C Sheet

Three clearly readable outputs are listed:

```text
Debit Voucher
Credit Voucher
Sales Sheet
```

These are genuine document/report requirements.

The heading directly above them is unclear and should not be interpreted.

---

# 27. Debit Voucher / Credit Voucher Semantics

Use the existing Cash/Bank Transaction as the underlying accounting event.

Recommended:

```text
Debit Voucher
→ outgoing / debit-side account transaction document

Credit Voucher
→ incoming / credit-side account transaction document
```

Do not maintain separate voucher balances.

Voucher = printable representation of an authorized transaction.

---

# 28. Sales Sheet

A Sales Sheet should be a printable period report, not a second sales database.

Recommended columns:

```text
Date
Invoice
Customer
Salesperson
Product
Quantity
Sales Value
Collection (optional summary)
Due / Balance (where applicable)
```

Exact detail/summary mode can use the existing report framework.

---

# 29. Current Expenses/Accounts Reporting — Already Present

Current report system already has:

```text
Daily Expenditure
Expense Category Summary
Expense by Person
Expense by Office / Warehouse / Company
Monthly Expense
TA/DA Approved Sheet Data
Cash / Bank Transactions
```

The new handwritten A/C sheet therefore does **not** justify another accounting module.

It justifies:

- one management A/C summary report;
- a few category/transaction additions;
- debit/credit voucher print;
- sales sheet print/report.

---

# 30. Current Print System — Already Strong

The current PrintPage supports:

```text
Quotation
Order Receiving Sheet
Delivery Challan
Money Receipt
Import Landed Cost
Employee Performance
Employee Activity
Marketing Analysis
Operational Reports
```

Update 8 should extend the same system with:

```text
Sales Invoice
Debit Voucher
Credit Voucher
Sales Sheet
```

Do not build another printing framework.

---

# 31. Sales Invoice Recommended Workflow

Keep the existing Sales tabs simple.

Do **not** add Invoice as a new main Sales tab.

Recommended workflow:

```text
Quotation
→ Order
→ Delivery Challan
→ Invoice
→ Collection
```

In UI, Invoice can be generated/managed contextually from:

```text
Quotations & Orders
or
Deliveries
```

Recommended simplest approach:

- Delivery row: `Create / Open Invoice`
- Order detail: `Invoice`
- Customer detail: invoice history
- Reports: Invoice Register

---

# 32. Invoice Approval

Recommended states:

```text
Draft
Approved
Cancelled
```

Optional later:

```text
Partially Paid
Paid
```

should preferably be derived from collections rather than manually maintained.

Approval should require:

```text
sales:approve
```

or an equivalent existing approved role/capability rule.

Do not create another RBAC architecture.

---

# 33. Invoice Posting Rule

Only `Approved` invoice posts the sales debit.

Draft Invoice:

```text
does not affect Customer Ledger
```

Approved Invoice:

```text
posts Customer Ledger debit
```

Collection:

```text
posts Customer Ledger credit
```

Cancelled/Reversed Invoice:

must not silently disappear; reversal/audit behavior is required.

---

# 34. Delivery Approval Rule

Approved/posted Delivery Challan:

```text
reduces stock
records delivered product/quantity
feeds Delivered Product reports
```

It does **not** independently add another sales receivable once Invoice is authoritative.

---

# 35. Relationship Between Delivered Sales and Invoiced Sales

After Update 8, reports should distinguish:

```text
Delivered Product / Delivered Value
```

from:

```text
Approved Invoice Sales
```

This is useful operationally.

Potential mismatch becomes visible:

```text
Delivered but not invoiced
Invoice approved but delivery incomplete
```

Such exceptions are valuable management controls.

---

# 36. Monthly Sales Reporting Package

Recommended report presets:

```text
Monthly Sales Summary
Salesman-wise Sales
Customer-wise Sales
Product-wise Sales
Collection Report
Dues Report
Invoice Register
Delivery Challan Report
Sales Sheet
Salesman Ledger
Customer Ledger
```

These are presets/tables in the existing Reports module.

No generic report designer is needed.

---

# 37. Monthly A/C Summary

Recommended summary:

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

Advance Paid / Outstanding
Company Loan Received
Company Loan Repaid
```

The final three financing/advance lines should be visually separated from operating expense.

---

# 38. Report UX Recommendation

Keep the current report hierarchy:

```text
Reports
├── Overview
├── Marketing Analysis
├── Import & Cost
├── Inventory
├── Sales & Collection
├── Expense & Cash-Bank
└── Audit
```

Within Sales & Collection, add presets/tables rather than more top-level tabs.

Within Expense & Cash-Bank, add A/C Summary and voucher-related views.

---

# 39. Compatibility With Employee Hub

The current Employee Hub already includes Activity & Reports.

Keep that.

Employee-specific report links should open the same canonical report data with:

```text
employee
period
```

preselected.

Salesman Ledger belongs in canonical Reports, with Employee Hub shortcuts.

---

# 40. Compatibility With Marketing

Marketing activities remain:

```text
Lead
Follow-up
Visit
Presentation
Sample
Negotiation
Quotation
Order
Delivery
Collection
```

Invoice should automatically appear as a system-derived activity when approved.

Salespeople should not manually report an invoice event.

---

# 41. Activity Feed Extension

Add system-derived:

```text
INVOICE_APPROVED
```

with:

```text
Invoice Number
Customer
Amount
Timestamp
Owner
```

No activity-score points should be added unless client explicitly defines an Invoice score.

---

# 42. RBAC Compatibility

Reuse current permissions.

Suggested:

```text
View invoices
→ sales:view

Create invoice
→ sales:create

Edit draft invoice
→ sales:edit

Approve invoice
→ sales:approve

Print invoice
→ print:view

Post account transaction / voucher
→ accounts:post

View A/C report
→ reports:view + accounts visibility

Export report
→ reports:export
```

No new role is necessary.

---

# 43. Public Website Content Safety

The supplied product sheets contain manufacturer/product claims.

Website copy should distinguish:

```text
MIPRO corporate claims
```

from:

```text
claims shown in supplied product/manufacturer literature
```

Recommended wording:

> “According to the supplied product sheet…”

or:

> “The supplied literature lists…”

where regulatory/technical precision matters.

---

# 44. Product Image Crop Strategy

Use the brochure itself as source.

Recommended primary crop targets:

### Dialyzer

Crop around:

```text
HD-17H dialyzer
```

without unrelated lower brochure text.

### Blood Tubing

Crop around:

```text
coiled red/blue blood tubing circuit
```

### A.V. Fistula

Crop around:

```text
needle/tubing assemblies with colored wing/clamp components
```

Images should:

- preserve product geometry;
- avoid text-heavy background where possible;
- use clean white/light brochure background;
- avoid watermarks not present in source;
- not invent or retouch clinical properties.

---

# 45. Landing Page Balance

Recommended homepage content hierarchy:

```text
Hero
Core product families
Product literature
Supply capability
Certificates / documentation
Why MIPRO
Resources / updates
Contact
```

The product literature section should no longer feel like an HD-17H mini-site.

It should represent the three strongest supplied dialysis products.

---

# 46. Product Page Enrichment

## Hollow Fiber Hemodialyzer

Keep existing strong content.

Primary image:

```text
new brochure crop
```

Gallery:

```text
HD-17H brochure
Feature sheet
Technical table
```

---

## Blood Tubing Set

Upgrade:

```text
features
models
sterilization information
packaging
source literature
```

Primary image:

```text
new brochure crop
```

---

## A.V. Fistula Needle

Upgrade:

```text
14G / 15G / 16G / 17G options
rotating/fixed wing
color coding
EO sterilization
packaging
safety/needle/wing features
```

Primary image:

```text
new brochure crop
```

---

# 47. Do Not Over-Publish Unverified Products

The Front Page shows additional products, but without dedicated source sheets in this batch.

Do not add detailed unsupported specifications for:

```text
Burette Set
ET Tube
Scalp Vein Set
Foley Catheter
```

They can remain catalogue references until dedicated product documents are supplied.

---

# 48. Update 8 Priority Assessment

## P0 — Product / public website

- use supplied PDF crops as primary images;
- balance homepage literature;
- enrich Blood Tubing;
- enrich A.V. Fistula;
- preserve existing corporate architecture.

## P0 — Reporting

- recognize Invoice as newly confirmed requirement;
- design invoice approval/posting correctly;
- add Invoice Register;
- add Salesman Ledger;
- add Sales Sheet;
- add A/C Monthly Summary;
- add Debit/Credit Voucher print support;
- separate Advance / Company Loan from operating expense.

## P1

- delivery-vs-invoice exception report;
- richer invoice payment status;
- dedicated advance subledger if confirmed;
- dedicated company-loan balance tracking if confirmed.

---

# 49. What Should NOT Change

Do not change:

```text
Main simplified navigation
Employee Hub
Import workflow
Landed cost rules
FIFO inventory
Marketing lead/follow-up workflow
Existing customer normalization
Sensitive cost protection
Current report engine architecture
Current PrintPage framework
Public website / ERP route separation
```

Update 8 should extend the current system, not reset it.

---

# 50. Final Requirement Interpretation

The new material adds two major clarifications.

### Public website clarification

The website should visually center the client-supplied:

```text
Hemodialyzer
Blood Tubing
A.V. Fistula
```

brochure content and use product images cropped from those official source sheets.

### Reporting clarification

The intended financial/report chain is now best understood as:

```text
Order
→ Delivery Challan
→ Approval
→ Delivered Product Report
        │
        └──────────────┐
                       ↓
Order / Delivery → Invoice → Approval
                       ↓
                Customer Ledger
                       ↓
                Salesman Ledger
                       ↓
                 Monthly Reports

Collection
→ Customer Ledger credit
```

and the A/C reporting side includes:

```text
Sales Collection
Operating Expenses
TA / DA
Salary
Entertainment
Donation / Boarding Expense
Advance / Company Loan (separately classified)
Debit Voucher
Credit Voucher
Sales Sheet
```

This is the strongest interpretation compatible with both the handwritten source and the current ERP without double-counting or unnecessary new modules.

---

**End of Analysis**
