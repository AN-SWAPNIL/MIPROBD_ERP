# MIPRO Medical Supplier ERP — Current System Audit & Required Updates

**Audit date:** 23 August 2026  
**Repository:** `AN-SWAPNIL/Medical_Supplier_ERP`  
**Audited branch:** current `main`  
**Recent redesign baseline:** simplified workflow redesign merged into `main` on 23 August 2026  
**Purpose of this report:** compare the **current updated implementation** against the client's **latest meeting decisions, handwritten import flow, real spreadsheets, print/background PDFs, order form, and older requirement files**, then identify exactly what should be kept, fixed, added, deferred, or removed.

---

## 1. Executive Summary

The updated repository is **substantially better than the earlier overbuilt prototype**. Its architecture now follows the client's actual operating model rather than a generic enterprise ERP. The reduction to a small number of work areas, the single Import/Shipment workspace, deterministic landed-cost engine, batch/lot/expiry inventory, and connected quotation → order → delivery → collection flow are all strong decisions.

### Overall assessment

| Area | Current fit | Assessment |
|---|---:|---|
| Product architecture / simplification | **9/10** | Strongly aligned with the client's request for fewer tabs and a simpler workflow. |
| Import/shipment conceptual model | **8/10** | Correct one-shipment/multi-product model, but the draft-start sequence is still too rigid. |
| Landed-cost calculation engine | **9/10 math / 7/10 end-to-end integrity** | Allocation logic is strong; some authoritative values are still trusted from the frontend. |
| Inventory / medical traceability | **7.5/10** | Good batch, lot, MFG, expiry and FIFO base; opening stock and multi-batch FIFO remain gaps. |
| Sales / collection workflow | **7/10** | Core funnel works; customer-ledger depth, pricing/profit checks and print fidelity need work. |
| Expenses / operational accounts | **7.5/10** | Correctly simplified; needs client-format TA/DA and monthly/daily reporting refinements. |
| Reports / dashboard | **4.5/10** | Visually present but several filters/labels do not yet reflect actual period-specific business data. |
| Print / document fidelity | **3/10** | Biggest client-facing gap: supplied letterhead/background PDFs and Order Receiving Sheet are not reproduced faithfully. |
| RBAC / sensitive data protection | **8/10** | Strong capability model and read redaction; some write-side ownership checks still need tightening. |

### Practical overall alignment

**Estimated current match to the latest client intent: ~76%.**

This is not a test-derived percentage. It is an implementation audit estimate based on source-to-code coverage and the importance of the remaining gaps.

The project is now **structurally on the right path**, but it is **not yet client-demo-final**. The highest-priority remaining work is:

1. Make the import draft flow correctly support **PO → Supplier → PI → LC/TT** without forcing PI/LC decisions too early.
2. Make workflow status **server-derived**, not manually selectable.
3. Recompute authoritative FOB/CBM values server-side using Decimal arithmetic.
4. Prevent landed-cost reopening from corrupting already-received inventory history.
5. Support **FIFO allocation across multiple batches**, not only one batch.
6. Rebuild print outputs from the **actual supplied MIPRO / LED TRACKERS background PDFs and Order Receiving Sheet structure**.
7. Add the owner-only **selling-price vs landed-cost profit/loss preview** that motivated the costing requirement.
8. Make customer ledgers, reports, date filters, and dashboard numbers reflect the real supporting spreadsheets.
9. Add opening-stock / legacy-batch migration so FIFO works with stock that existed before this ERP.
10. Tighten Sales Executive write authorization and collection/account integrity.

---

# 2. Source Priority Used for This Audit

Requirements conflict in a few places because the client originally supplied a broad generic ERP proposal, then later explained the actual business process in meetings.

For this audit, the priority is:

1. **Latest conversation transcript and meeting minutes**
2. **Handwritten `Importing Flow.jpeg`** — especially because Meeting 1 recording started late and this image supplies the missing first steps
3. **Real operating files supplied by the client**
   - `Mipro HealthCare Corp.xlsx`
   - `Sales_Ledger_1.2.1.xlsx`
   - `Daily Expenditure.xlsx`
   - `TA-DA.xlsx`
   - `Order_Receiving_Sheet1.pdf`
   - `MIPRO Pad Final Final 2026.pdf`
   - `LetterHeadPadLED Trackers.pdf`
4. Current simplified plan: `files/Medical_Supplier_ERP_Simplified_Plan.md`
5. Older requirement/proposal files only where newer sources do not override them
   - `Medical_Supplier_ERP_Plan*.pdf`
   - `Medical_Supplier_ERP_Plan_Details.pdf`
   - `Project_Requirements_Presentation.pdf`
   - `Document (2).docx`
   - `Plan.docx`

**Important rule:** when the newer meeting contradicts an older generic ERP feature list, the meeting should win unless the client later changes it again.

---

# 3. What the Client Actually Wants Now

The current product should be thought of as **two practical operating flows joined mainly through inventory**, not dozens of independent ERP modules.

## 3.1 Flow A — Import → Landed Cost → Warehouse

The handwritten flow and Meeting 1 together resolve the intended sequence:

```text
PO
 ↓
Supplier
 ↓
PI
 ↓
Open LC / TT
 ↓
Production / shipment lead time
 ↓
China → Bangladesh sea freight
 ↓
Chattogram Port
 ↓
Product-wise customs duty input
 ↓
Port / C&F / gate / utility / labour / other costs
 ↓
Local transport
 ↓
Final product-wise and per-piece landed cost
 ↓
Warehouse receiving
 ↓
Lot / batch / MFG / expiry / FIFO-aware stock
```

### Critical interpretation

- One **import record represents one shipment/consignment**.
- One shipment can contain **one or many products**.
- Before an LC exists, the ERP can use an internal draft reference.
- Once an LC is opened, its LC number becomes the main visible business reference for that same shipment.
- TT shipments use the TT/shipment reference similarly.
- Do not recreate the shipment when the LC arrives.
- Do not create one import record per product.

## 3.2 Flow B — Sales / Collection

The latest meeting's core sales funnel is:

```text
Quotation → Placed Order → Delivery Challan → Payment Collection
```

- It is **not e-commerce**.
- Sales employees create quotations/orders.
- Field-sales GPS, visit tracking, daily/monthly plans and mobile workflows are a **later app phase**.
- Warehouse stock/batches are the key connection between imports and sales.

---

# 4. Current Repository — What Is Now Correct

The redesign fixed most of the earlier structural problems.

## 4.1 Navigation is now appropriately small

The active app is reduced to:

- Dashboard
- Imports
- Inventory
- Sales
- Expenses & Accounts
- Reports
- Settings

This is much closer to the client's explicit request to avoid a maze of tabs.

**Keep this direction. Do not restore the old micro-module sidebar.**

## 4.2 Domain-based code organization is much healthier

The new code groups real business workflows rather than one folder/page per tiny noun:

```text
src/domains/
  imports/
  inventory/
  sales/
  accounts/
  reports/
  settings/
  print/
```

This should remain the architectural direction.

## 4.3 ImportCase correctly supports one shipment with multiple products

The domain model now has:

- draft reference
- primary LC/TT reference
- supplier
- PO / PI
- shipment details
- one or more import items
- independent cost lines
- attachments/documents
- landed-cost snapshot
- warehouse state

This matches the latest business understanding very well.

## 4.4 Landed-cost calculation is one of the strongest parts

The code supports:

- `CBM`
- `FOB_VALUE`
- `QUANTITY`
- `PRODUCT_SPECIFIC`
- `MANUAL`

It uses `decimal.js`, high precision, two-decimal BDT allocation, and deterministic residual-poisha assignment.

That directly addresses the client's concern that total costs must reconcile exactly and be converted to per-product / per-piece cost without unexplained missing amounts.

## 4.5 Dynamic `+ Add Cost` exists

This correctly avoids hardcoding every future cost category.

The design can represent items such as:

- Sea freight
- Assessed customs duty
- LC opening fee
- Insurance
- C&F cost
- Gate fee
- Port utility
- Labour
- Local transport
- Any later custom expense

Each line is separately named and reportable, which matches the client's requirement that he must later see **which reason consumed how much money**, rather than one opaque “utility cost” total.

## 4.6 Customs duty is correctly treated as manual product-specific input

The client explicitly does **not** want the ERP reproducing customs assessment formulas.

Current implementation is correct to accept the customs-assessed final product amount and allocate it to that product / divide by units.

Do not add an automated Bangladesh customs duty engine now.

## 4.7 Sensitive landed cost is protected

The capability model includes:

- `view_sensitive_cost`
- `edit_sensitive_cost`
- `finalize_landed_cost`
- `reopen_landed_cost`
- `view_profit`
- `approve_stock_override`
- `approve_special_price`

The API also redacts cost data for users who do not have cost permission.

This is much safer than UI-only hiding and follows the client's statement that costing is confidential.

## 4.8 Landed-cost finalization / immutable snapshot is a good design

A finalized cost snapshot is stored and used by warehouse receiving. That is the right accounting/traceability model.

The warehouse API also correctly ignores a client-submitted fake landed cost and inherits the finalized snapshot cost server-side.

## 4.9 Medical stock traceability is largely correct

The current system tracks:

- batch
- lot
- manufacturing date
- expiry date
- warehouse / location
- source import
- received quantity
- available quantity
- landed-cost snapshot

This is appropriate for the client's medical consumables.

## 4.10 FIFO logic matches the latest meeting direction

The system recommends an older matching receipt first and requires capability/reason to deliberately select a newer batch.

This follows the latest meeting better than making FEFO the default.

Expiry should still remain visible and alertable.

## 4.11 Sales flow is now connected instead of duplicated

Quotation converts to Sales Order without retyping the lines; delivery selects warehouse batch; stock reduces; due is created; collection reduces due.

That is exactly the kind of connected flow the client expects.

## 4.12 Operating expenses remain separate from landed cost

Office rent, salaries, utilities, TA/DA etc. are treated as operating expenses rather than silently increasing imported product cost.

This is explicitly correct according to Meeting 1.

## 4.13 Pending decisions are now visible

The confirmation queue is a good idea: unresolved client choices are not silently embedded as permanent rules.

It does need refinement, discussed later.

---

# 5. CRITICAL Updates Required Before Treating the Prototype as Correct

These are correctness/data-integrity gaps, not merely UI polish.

---

## C1. New Import starts too late and forces PI too early

### Current implementation

`src/domains/imports/NewImportPage.tsx` requires:

- Supplier
- PO Number
- PO Date
- PI Number
- PI Date
- Payment Mode LC/TT
- First product

The screen is titled roughly **“Start with PI and commercial data.”**

### Why this is wrong

The missing start of Meeting 1 is supplied by `Importing Flow.jpeg`:

```text
PO → Supplier → PI → Open LC/TT
```

So the case must be able to exist **before PI is received and before LC/TT is decided/opened**.

### Required update

Create the draft import with the minimum needed fields:

```text
Supplier
PO No / PO Date
one or more product lines
optional notes
```

Then inside the same workspace:

- PI No / Date can be added when received.
- Payment mode may initially be `Pending` / not selected.
- LC number / TT reference is added only when available.
- Same record continues throughout.

### Suggested UI

On creation:

```text
New Import / Shipment
Supplier              [select]
PO Number             [ ]
PO Date               [ ]
Expected / Target Shipment [optional]
Products              [Add Product]
Notes                 [optional]

[Create Draft Import]
```

PI and LC/TT belong in the workspace progress section rather than being mandatory at draft creation.

**Priority: P0**

---

## C2. Import workflow status can currently be manually spoofed

### Current implementation

Both Commercial Editor and Shipment Editor expose a full `Current Status / Milestone` select including stages such as:

- Cost Finalized
- Partially Received
- Received
- Closed

The API PATCH handler spreads incoming body values into the import record.

### Risk

An Import Officer could make a record appear `Received` or `Cost Finalized` without actually:

- finalizing the cost snapshot,
- posting a warehouse receipt,
- creating stock.

This breaks workflow integrity.

### Required update

Status must be **derived from actual actions**, not a free-edit field.

Examples:

- PI added → `PI Received`
- LC/TT reference added → `LC/TT Opened`
- shipment details updated → `In Production` / `Shipped` via controlled transition
- cost entry begins → `Costing`
- finalize endpoint → `Cost Finalized`
- receipt endpoint → `Partially Received` / `Received`

For optional operational milestones such as “In Production” or “Shipped”, use explicit buttons/actions or a limited transition control that only allows legitimate next states.

On the server, whitelist updateable fields; do **not** blindly merge arbitrary status fields.

**Priority: P0**

---

## C3. FOB total and total CBM are still authoritatively computed in JavaScript Number on the frontend

### Current implementation

The frontend calculates values like:

```text
FOB total = quantity × FOB unit × exchange rate
Total CBM = cartons × CBM/carton
```

using `Number(...)`, then sends totals to the server. The server stores them from the request.

### Why this matters

The landed-cost engine itself uses Decimal correctly, but it later consumes `fobTotalBdt` and `totalCbm` that may have originated from untrusted or imprecise client calculations.

The system's most important requirement is accurate costing; these basis values must be authoritative.

### Required update

Frontend may calculate a preview, but server must recompute and store:

```text
FOB total foreign = qty × FOB/unit
FOB total BDT = FOB total foreign × captured exchange rate
Total CBM = carton count × CBM/carton
```

using Decimal arithmetic.

Also validate that any manually supplied total CBM mode is intentional if the business sometimes gets total CBM directly from PI.

**Priority: P0**

---

## C4. Reopening landed cost after warehouse receipt can create contradictory historical costs

### Current implementation

The reopen endpoint removes the active snapshot and reopens costing, but does not appear to block reopening after warehouse receipts / stock batches already exist.

### Risk

Suppose stock entered warehouse at Tk 420/unit from snapshot v1. Then owner reopens import and finalizes v2 at Tk 450/unit.

Existing inventory batches still hold Tk 420 unless a valuation adjustment is performed. The same import would now have two conflicting “truths.”

### Required update

Two separate cases:

**Before any warehouse receipt**
- ordinary reopen allowed with permission + reason.

**After any warehouse receipt**
- block ordinary reopen.
- if correction is truly required, use a formal **landed-cost adjustment** flow:
  - owner permission,
  - reason,
  - new snapshot/version,
  - inventory valuation adjustment for remaining stock,
  - audit trail,
  - no rewriting past sold/delivered cost silently.

For the prototype, simplest safe option: **block reopening after first receipt** and mark post-receipt adjustment as later functionality.

**Priority: P0**

---

## C5. FIFO dispatch cannot currently split one order quantity across several batches

### Current implementation

Dispatch chooses one batch per sales line. Server eligibility requires a single batch to have enough quantity for the requested line.

### Example failure

Order = 60 pcs.

```text
Old Lot A = 30 pcs
Next Lot B = 30 pcs
```

Correct FIFO allocation:

```text
30 from Lot A
30 from Lot B
```

Current design may fail because neither single batch contains 60.

### Required update

Implement a server-side allocator:

```text
requested qty
 ↓
oldest eligible batch → consume as much as available
 ↓
next oldest batch → consume remainder
 ↓
continue until fulfilled
```

UI should display the automatic split, for example:

```text
Dialyzer 1.7H — 60 pcs
  30 pcs · Lot 2025-09
  30 pcs · Lot 2026-02
```

Manual/newer-lot override should be needed only when the user intentionally bypasses older eligible stock.

**Priority: P0**

---

## C6. Sales Executive write-scoping is incomplete at API level

### What is good

Lists are scoped so a Sales Executive sees assigned customers / own sales records.

### Gap

A crafted API request can potentially create a quotation or collection using another executive's `customerId`, because create endpoints do not consistently validate ownership of the selected customer.

### Required update

For Sales Executive API writes:

- quotation create: customer must be assigned to current user.
- quotation edit/convert: quote must belong to current user.
- collection create: selected customer must be assigned; linked order must belong to the current user/customer.
- customer create/update: preserve assignment constraints.

Add explicit negative integration tests.

**Priority: P0**

---

## C7. Real payment collection can reduce due without a valid account

### Current implementation

UI asks for deposit account, but the API can accept a non-credit collection where `accountId` is missing/invalid; due may still be reduced even though no actual cash/bank account received the money.

### Required update

For actual payment modes:

- Cash
- bKash / mobile banking
- Bank Transfer
- Cheque

require a valid active account before posting.

Only then:

- reduce due,
- increase total collected,
- create account transaction.

**Priority: P0**

---

## C8. `Credit` is modeled as a Collection and can distort collection totals

### Current implementation

`Credit` appears as a payment mode under Collection. It creates no cash movement and does not reduce due, but remains in the collection data set. Aggregate “collection” reporting can therefore count something that is not a received payment.

### Better model

Credit/outstanding belongs to the sales/order payment condition, not a payment received event.

Recommended options:

1. Remove `Credit` from Collection modes and represent outstanding balance naturally through order/delivery due; **preferred**.
2. Or keep a non-cash marker but explicitly set `isCashMovement=false` and exclude it from all collected-total/account reports.

**Priority: P0**

---

# 6. PRINTING / CLIENT DOCUMENTS — Biggest Client-Facing Gap

The client supplied real stationery and form layouts. These were not decorative references; the latest meeting explicitly requested output compatible with them.

This area needs a significant update.

---

## 6.1 Actual supplied MIPRO / LED letterhead assets

### `MIPRO Pad Final Final 2026.pdf`

The supplied A4 design contains an actual corporate background, not merely a logo:

- blue/cyan sweeping header artwork,
- `MIPRO HEALTHCARE CORPORATION`,
- slogan `--PRECISION IN HEALTHCARE--`,
- left vertical company branding,
- repeating MIPRO watermark strip,
- large faint MIPRO watermark,
- blue/cyan footer artwork.

The supplied PDF also contains an **LED TRACKERS** variation.

### Actual contact details visible in supplied stationery

Use the exact confirmed stationery values rather than invented demo text:

```text
Flat-B2, House-26, Road-06, Sector-09, Uttara, Dhaka-1230
+88 018 05 050780
ledtrackers@gmail.com
www.miprobd.com
```

If the client later provides different contact values for MIPRO vs LED Trackers, make identity profiles configurable.

### Current implementation problem

The current print configuration still contains generic/demo values such as:

```text
Uttara, Dhaka, Bangladesh
+880 1711 000000
info@miprohealthcare.com
www.miprohealthcare.com
```

The current print header is a generic logo + text + **red line**, which does not match the supplied stationery.

### Required update

Create a real `PrintIdentity` / `LetterheadTemplate` concept:

```text
MIPRO Healthcare Corporation
LED Trackers
```

Each template stores:

- background asset
- logo if needed
- contact data
- signatory defaults
- print safe-area offsets
- digital/preprinted mode

**Priority: P0 client-facing**

---

## 6.2 Digital quotation must use the actual background

Latest meeting requirement:

> Digital/Virtual quotation = generated on the company's digital letterhead/background.

### Current implementation

“Digital Letterhead” means a generic HTML header, not the actual supplied background PDF.

### Required update

Prototype approach:

- render supplied letterhead as an A4 background image/SVG/PDF-rendered asset,
- overlay quotation content inside a calibrated content-safe area.

Production approach:

- use a PDF overlay pipeline (e.g. `pdf-lib` in server/edge function) to place content over the supplied A4 PDF exactly.

The business record remains one quotation; only the renderer changes.

---

## 6.3 Preprinted-paper mode needs real calibration, not just top padding

Latest meeting requirement:

> Physical print format should omit digital artwork and print correctly on already-preprinted company paper.

### Current implementation

Preprinted mode mainly adds large top padding.

That is not sufficient for real office printing.

### Required update

Use physical A4 measurements:

```css
@page {
  size: A4;
  margin: 0;
}

.print-sheet {
  width: 210mm;
  min-height: 297mm;
}
```

Per template, configure:

- top offset (mm)
- left offset (mm)
- right offset (mm)
- bottom safe zone (mm)
- first-page / later-page behavior if document becomes multi-page

Add a **Print Calibration** screen in Settings with a test page.

Do not maintain separate business data for digital vs physical print.

---

## 6.4 Application branding should match the stationery

Current app primary/active color is heavily red.

The real MIPRO identity is primarily **blue/cyan**.

### Recommendation

- MIPRO blue / navy → primary navigation/actions
- cyan/teal → accent
- red → danger, due, loss, expired/warning only
- green → success/paid/received

This will make the product feel like the client's system rather than a generic red-themed admin app.

**Priority: P1 visually, but ideally before the next client UI review**

---

# 7. Order Receiving Sheet — Needs a Dedicated Faithful Template

The supplied `Order_Receiving_Sheet1.pdf` provides a concrete structure that the current generic Sales Order print does not match.

## 7.1 Important structure in the supplied form

The document contains:

### Header

- LED TRACKERS
- MIPRO Healthcare Corporation
- `ORDER RECEIVING SHEET`
- Order No
- Date

### Item table

```text
Particulars | Qty in Pcs | Unit Price | Total Value
```

plus a Total row.

### Customer / payment section

- Customer's Address & Phone Number
- Payment Conditions
- Payment made to
- CQ / payment reference
- payment date

### Responsibility / office-use fields

- Demand Received by: Name
- Designation
- Order Given by: Seal & Sign
- Office Use Only
  - Order No
  - Date
  - Payment Confirmation
  - Delivery Date
- Head of Sales
- COE
- Managing Director

## 7.2 Current implementation

Current `OrderDocument` prints:

- customer name
- payment terms
- generic item table
- totals
- delivery instruction

It omits much of the actual client workflow/form structure.

## 7.3 Required update

Create a dedicated `OrderReceivingSheetDocument` renderer that preserves the **structure and intent** of the supplied form while allowing dynamic products.

Do not hardcode the old fixed product rows forever. Use dynamic order lines but retain the same business sections.

### Extend SalesOrder or an attached print-details record with optional fields

```text
customerAddressSnapshot
customerPhoneSnapshot
paymentConfirmation
paymentReference / chequeNo
paymentDate
requestedDeliveryDate / deliveryDate
orderReceivedByName
orderReceivedByDesignation
orderGivenBy / signatory text
headOfSalesSignoff
coeSignoff
mdSignoff
```

To keep normal entry simple, these fields can appear under:

> **Order Receiving / Office Details**

instead of cluttering the basic quotation/order form.

**Priority: P0 client-facing**

---

# 8. Invoice — Do Not Guess, But Prepare the System Correctly

Older requirement files include Invoice / invoicing, and `Mipro HealthCare Corp.xlsx` has a `Sales Tracking & Revenue` sheet with `Invoice No`.

However, the latest meeting's mandatory flow is:

```text
Quotation → Order → Delivery Challan → Collection
```

and the current Confirmation Queue correctly marks invoice behavior as unresolved.

## Current file audit

The current supporting-file set clearly contains:

- letterhead PDFs,
- Order Receiving Sheet,
- spreadsheets referring to invoice numbers,

but I did **not find a separately named client invoice-layout PDF** in the current repository file list.

### Recommendation

Keep invoice as a **pending client decision**, not a mandatory extra step yet.

Prepare architecture so that, if confirmed:

```text
Invoice = generated from Order / Delivery
```

without retyping product lines.

When the client identifies/provides the exact invoice format:

- add it to the same template engine,
- support digital background / preprinted modes as appropriate,
- preserve invoice number and tax fields as snapshots.

**Priority: P2 until confirmed; template infrastructure P0/P1**

---

# 9. Import Workflow — Additional Refinements

---

## I1. Mark local transport CBM behavior as confirmed, not unresolved

The current Confirmation Queue still asks whether local transport should use CBM.

In the latest Meeting 1 discussion, the client explicitly agreed that local covered-van transport behaves like sea freight in terms of volume.

### Update

- Make **CBM the default for Local Transport**.
- Still allow authorized manual override if a real invoice needs another basis.
- Remove this from “Pending Client Confirmation,” or mark it confirmed with source note.

---

## I2. Common-cost default should remain configurable/pending

For general costs such as bank/C&F/utility, the meeting debated quantity vs value. Value/FOB ratio seemed fairer, but the client said it still needs accuracy verification.

Current explicit selection is correct.

### Keep

- Require/show allocation method.
- Presets may suggest `FOB Value` but should not silently lock it yet.

---

## I3. Add optional LC/TT fields without adding new tabs

Older files contain useful operational fields that can be retained inside the same workspace:

### LC

- LC Amount
- LC Open Date
- LC Expiry Date
- Bank
- optional remarks

### TT

- TT Amount
- TT Date
- Swift Copy attachment

### Shipment

- Commercial invoice no/date
- production follow-up note/status
- BL no
- container no/type
- vessel
- ETD / ETA

Do not create separate top-level modules. Keep these in the single Import workspace.

**Priority: P1**

---

## I4. Expand import document types, but keep one Documents section

Older requirements explicitly reference:

- Commercial Invoice
- Packing List
- COA
- CE
- ISO
- Swift Copy
- customs assessment
- duty proof
- freight invoice
- bank advice
- insurance
- C&F bill

Current generic document metadata is a good base, but add these as named document types for easier filtering/completeness checks.

Do not create a separate Document Archive module.

**Priority: P1**

---

## I5. Cost-row attachments should become real stored files later

The current prototype records file names/metadata only.

That is acceptable for frontend approval.

When Supabase is introduced:

- upload to Supabase Storage,
- store path, MIME type, size, uploader, uploaded_at,
- bind attachment to exact import cost/document row,
- permission-protect sensitive files.

---

# 10. Inventory — Required Additions

---

## W1. Add Opening Stock / Legacy Batch Import

This is important and currently missing.

The client explicitly described having **old consignment stock already in warehouse** when a new shipment arrives. FIFO logic only makes sense if the system knows both old and new stock.

### Current limitation

Inventory is mainly created by receiving new imports in this ERP.

### Required update

Add an admin-only migration/setup tool, not another sidebar module:

**Settings → Data Migration / Opening Stock**

Fields:

- product/variant
- quantity
- lot number
- batch number
- manufacturing date
- expiry date
- historical received date
- source / old LC or reference if known
- warehouse/location
- landed cost per unit (owner-only; optional if unavailable)

This also enables a realistic first deployment.

**Priority: P1, but required before real use**

---

## W2. Keep FIFO, but improve eligibility logic

The latest meeting says older matching stock first.

Eligibility should consider:

- exact product variant
- available quantity
- not expired
- optionally blocked/held stock later

Expired stock must never be recommended.

Near-expiry status should be shown prominently even though FIFO controls default ordering.

---

## W3. Expiry API should use current date, not a fixed hardcoded cutoff

Some server dashboard/report logic currently checks against a fixed date like `2027-06-01`.

### Required update

Compute dynamically from current date:

```text
Expired
<= 1 month
<= 3 months
<= 6 months
Normal
```

Prefer returning `expiryStatus` from backend so dashboard/report/UI use one consistent rule.

**Priority: P0/P1**

---

# 11. Sales & Customer Ledger — Missing Real-World Depth

---

## S1. Add customer detail / transaction ledger

The current customer table shows aggregate:

- sales
- collected
- due

But the client's `Sales_Ledger_1.2.1.xlsx` contains much more useful history per customer:

```text
Month
Sales Date
Item
Qty
Unit Price
Total Price
Paid Amount
Dues Amount
Discount
Total After Discount
Collection Date
Collection Amount
Remarks
```

### Required update

Clicking a customer should open a detail page/drawer with:

#### Summary

- current due
- total delivered sales
- total collected
- credit terms

#### Sales history

- order / delivery / optional invoice reference
- date
- items
- qty
- unit sale price
- discount
- delivered amount

#### Collection history

- date
- amount
- mode
- account
- reference
- remarks

#### Running ledger

```text
Date | Type | Reference | Debit/Sale | Credit/Collection | Running Due | Remarks
```

This replaces one-worksheet-per-customer spreadsheets without adding top-level complexity.

**Priority: P1**

---

## S2. Owner-only quotation profit/loss preview is missing

This is one of the most important client motivations for the entire import-cost system.

The client explicitly wants to check:

> If I quote a hospital at this lower price, am I making profit or loss per piece?

### Current implementation

Quotation form shows standard sale price and lets the user set price/discount, but does not use `view_profit` meaningfully.

### Required update

For owner / authorized users:

```text
Proposed price       Tk 620
Current landed cost  Tk 565
Gross profit/unit    Tk 55
Margin               8.87%
```

If proposed selling price is below cost:

```text
⚠ LOSS: Tk 20 per unit
```

### Cost basis

For available inventory, use a clearly defined cost basis, preferably:

- cost of batch(es) expected to be dispatched under FIFO, or
- an explicitly labelled current/weighted stock cost for preview.

Do not show these values to Sales Executive.

If special-price approval is later confirmed:

- salesperson sees only `Approval required`,
- owner/manager sees the real cost and can approve.

**Priority: P0/P1**

---

## S3. Use customer contact/address snapshots in documents

Printed Order/Challan/Invoice documents should not rely only on current customer master values forever.

At transaction confirmation, store/snapshot:

- customer name
- address
- phone
- contact person if relevant

This prevents historical prints from changing when a customer's profile changes later.

---

## S4. Product alias / legacy mapping should become explicit

`Sales_Ledger_1.2.1.xlsx` includes an `Item Mapping` sheet because historical item names vary.

Current canonical product master is good, but migration needs alias support.

Recommended:

```text
product_aliases
  alias_text
  product_id
  source
  active
```

or an admin-only import mapper.

This is especially important for importing old Sales Ledger history without duplicating products because of spelling differences.

**Priority: P1 migration**

---

# 12. Tax / VAT / AIT — Keep Pending and Customer/Document-Specific

The real Sales Ledger contains at least one customer sheet with fields such as:

- 7.5% VAT
- 7% AIT

The older proposal also mentions invoice tax calculation.

But the latest meeting did not finalize a universal sales-tax rule.

### Recommendation

Do not hardcode a global tax formula now.

Keep a pending decision:

- Which customers/documents require VAT?
- Is AIT deducted/withheld or added?
- Does tax differ by product/customer?
- Is invoice mandatory for taxed sales?

Data model can later support optional document tax lines.

**Priority: P2 pending confirmation**

---

# 13. Expense & Accounts — Good Scope, But Client Forms Need Better Support

---

## A1. Daily Expenditure should have a report matching the supplied sheet

`Daily Expenditure.xlsx` uses a simple pattern:

```text
Date | Expenditure Details | Cost | Remarks
```

and monthly category summaries.

Current expense entry is broadly compatible, but reporting should explicitly provide:

### Daily expenditure report

```text
Date | Category / Detail | Cost | Remarks | Paid From
```

### Monthly summary

```text
Category | Total Amount
```

Use dynamic categories.

**Priority: P1**

---

## A2. TA/DA entry exists, but the client-supplied approval sheet does not

`TA-DA.xlsx` is structured as:

```text
MIPRO HEALTHCARE CORPORATION
TA/DA Approved Sheet
Month
Name
Designation

Date | TA Amount | DA Amount | Remarks

Total TA/DA
Audited
Approved
```

Current system can enter individual TA/DA expenses, which is good.

### Required addition

Generate a **TA/DA Approved Sheet** from those expense rows:

Filters:

- employee
- month

Output:

- employee + designation
- dated TA/DA lines
- total TA
- total DA
- total combined
- audited by
- approved by
- print/PDF

Do not create a whole new TA/DA top-level module.

**Priority: P1**

---

## A3. Existing data contains owner/CEO/MD loan/funding notes

The Daily Expenditure workbook includes entries/remarks referring to funding such as owner/CEO/MD loans/advances.

A pure expense-out model does not fully represent this.

### Recommendation

Before migration, ask how these should be treated:

- Owner Advance / Loan to Company?
- temporary cash injection?
- reimbursement?

Then support a simple `Other Cash In / Owner Advance` account transaction if needed.

Do not silently classify such rows as expenses because it can distort balance and expenditure reports.

**Priority: P2 / migration confirmation**

---

# 14. Reports — Currently Much Less Complete Than the UI Suggests

This is one of the biggest functional gaps.

---

## R1. From/To date filters are currently visual, not functional

### Current implementation

Reports page has From Date / To Date state.

But `reportService.get()` calls simply:

```text
GET /api/reports
```

without sending date parameters, and server aggregates all in-memory rows.

Therefore changing the dates currently does **not actually filter report data**.

### Required update

Use:

```text
GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD&...
```

and apply filters server-side.

**Priority: P0**

---

## R2. Reports are mainly KPI summaries; client needs real tables

Implement one Reports page, but provide drillable/report-table outputs.

### Import / Cost

- Import / Shipment register
- LC/shipment cost sheet
- Cost breakdown by cost type
- Landed cost by product
- landed cost history by import/batch

### Inventory

- Current stock
- batch/lot stock
- expiry report
- stock movement
- opening/current stock reconciliation later

### Sales / Collection

- Sales by customer
- Sales by product
- Sales by month
- customer ledger
- due/receivable
- collection by period/mode
- realized profit — authorized only

### Expenses / Accounts

- Daily expenditure
- monthly expense/category summary
- TA/DA sheet/report
- cash/bank transactions

CSV/PDF export should export the actual filtered rows, not only a few KPI labels.

**Priority: P1**

---

## R3. Add owner-only realized-profit reporting

`Mipro HealthCare Corp.xlsx` explicitly contains:

- Unit Landed Cost / COGS
- Total Cost
- Gross Revenue
- Profit per unit
- Total Profit Realized

Current web system should eventually derive this from actual delivered batch costs.

Best formula:

```text
Realized revenue = delivered qty × actual sale price - discount
COGS = delivered qty × selected batch landed-cost snapshot
Realized gross profit = revenue - COGS
```

Only users with `view_profit` can see it.

**Priority: P1**

---

# 15. Dashboard — Several Labels Need Correct Business Semantics

Current dashboard is visually clean, but some server calculations do not match their labels.

## D1. “Sales This Month” currently sums orders without period filtering

That is not truly “this month.”

Also, order value is pipeline/commitment; delivered value is closer to realized sale in the current business flow.

### Recommended dashboard separation

```text
Delivered Sales This Month
Collections This Month
Outstanding Receivable
Operating Expense This Month
Available Stock / Inventory Value
Imports In Progress
```

Optionally show:

```text
Open Order Pipeline
```

separately.

## D2. “Collections This Month” must exclude non-cash credit markers

Only actual received payment should count.

## D3. Operating expenditure should exclude reversed entries

A reversed expense must not remain in total operating expense.

## D4. Expiry alert should be dynamic from today's date

Avoid fixed hardcoded cutoff dates.

**Priority: P0/P1**

---

# 16. Confirmation Queue — Good Idea, But It Must Record the Answer

Current Settings can toggle a decision between:

- Pending Client Confirmation
- Confirmed

But it does not store the actual resolution.

### Example problem

Question:

> Is invoice mandatory, optional, or generated from order/challan?

Changing status to `Confirmed` does not tell future developers **which answer** was confirmed.

### Required model

```text
BusinessDecision
  id
  title
  question
  currentBehavior
  status
  resolutionValue
  resolutionNotes
  confirmedBy
  confirmedAt
  sourceReference
```

For enumerated choices, store a structured value.

### Update current queue

- Local transport allocation → mark **confirmed CBM default** from latest meeting.
- FIFO older matching lot first → confirmed.
- Common cost default → still pending/configurable.
- Invoice → pending.
- accounting depth → pending.
- number of warehouses → pending.
- special price approval → pending.
- sales tax/VAT/AIT → pending.
- post-receipt landed-cost correction authority/process → should be explicitly defined.

**Priority: P1**

---

# 17. Global Search — Either Make It Work or Remove It for Now

The top bar currently contains a search box for:

- LC
- product
- customer
- challan

No functional global search behavior was evident in the audited implementation.

A fake global control is worse than not showing it.

### Minimal useful implementation

One endpoint/search service over:

```text
LC / TT / draft import ref
PO / PI
product code/name
customer
quotation/order/challan
```

Return grouped results and navigate to the appropriate workspace.

If not ready for next demo, remove/disable it visibly rather than implying it works.

**Priority: P2 unless client demo exposes it**

---

# 18. Test Coverage — Good Foundation, Missing the Dangerous Cases

Current tests are valuable:

- five allocation modes
- foreign currency
- exact rounding/reconciliation
- invalid denominator
- multi-product import
- immutable snapshot
- partial/final receipt
- basic FIFO delivery
- collection
- expense isolation
- role access

Add tests for the highest-risk unresolved behavior.

## Required new automated tests

### Import integrity

- server recomputes FOB total from qty × FOB × rate
- server recomputes CBM
- invalid direct `Received` / `Cost Finalized` status PATCH rejected
- duplicate LC warning/validation
- zero/invalid exchange rate rejected

### Snapshot integrity

- reopen before receipt allowed
- reopen after warehouse receipt blocked
- if later adjustment added, valuation update is tested

### Inventory

- 60-unit request splits 30+30 across two FIFO batches
- expired batch is never recommended
- unauthorized newer-batch override rejected

### Sales RBAC

- Sales Executive cannot create quote for another rep's customer
- cannot collect against another rep's customer/order
- cannot access another rep's records through direct IDs

### Collection integrity

- non-credit payment requires valid active account
- actual collection changes due and account together
- Credit/outstanding does not count as collected cash

### Reports

- date filters change result
- reversed expenses excluded
- delivered sales vs order pipeline are distinct

### Print

Add screenshot regression tests for:

- MIPRO digital quotation
- preprinted quotation calibration
- Order Receiving Sheet
- challan

**Priority: P1**

---

# 19. Supabase Migration — Correct Direction, But Keep Business Rules Server-Authoritative

The current mock Express API is acceptable for frontend approval.

When production backend starts:

## Use

- Supabase Auth
- Postgres
- Supabase Storage
- RLS
- database/server/edge functions for authoritative calculations

## Important tables / concepts

```text
imports
import_items
import_cost_lines
import_cost_allocations
landed_cost_snapshots
import_documents
stock_batches
stock_movements
customers
customer_ledger / derived transaction view
quotations
sales_orders
deliveries
collections
expense_categories
expenses
account_transactions
business_decisions
print_templates
print_identities
product_aliases
audit_logs
```

### Do not trust frontend calculations in production

Authoritative operations should be atomic:

- finalize landed cost
- receive stock
- dispatch stock
- post collection
- post/reverse expense
- special-price approval later

RLS must mirror role/capability privacy; hiding fields/components in React is not enough.

---

# 20. What Should NOT Be Added Back Now

To preserve the simplification the client asked for, do **not** expand the web ERP again just because older proposal files mention these features.

Unless the client explicitly confirms them, keep these out of the immediate redesign:

- separate Supplier Inquiry / PI / LC / TT / Shipment / Customs top-level pages
- native mobile app right now
- web GPS tracking screen
- field-sales route tracking now
- full HR / payroll / leave / loan suite
- fleet/vehicle management suite
- full general ledger / trial balance / contra/journal voucher suite
- enterprise multi-company consolidation
- complex warehouse BIN/quarantine/physical-count modules
- AI Command Center
- floating AI chatbot everywhere
- vector search
- automated customs HS-code/duty calculation
- mandatory invoice workflow before confirmation
- universal tax calculation before confirmation
- complex approval engine for every record

The current 7-area shell should stay.

---

# 21. Recommended Priority Backlog

## P0 — Correctness & next client demo blockers

### Business/data integrity

1. Draft import must allow **PO before PI/LC**.
2. Remove manually editable final workflow statuses; make transitions authoritative.
3. Recompute FOB/CBM server-side with Decimal.
4. Block ordinary landed-cost reopen after receiving stock.
5. Implement multi-batch FIFO split.
6. Enforce Sales Executive customer ownership on write endpoints.
7. Require valid destination account for actual collections.
8. Remove/reclassify `Credit` as non-collection/outstanding.
9. Make report From/To filters actually work.
10. Correct dashboard “this month” / delivered sales / reversed-expense semantics.
11. Remove hardcoded expiry cutoff.

### Client-facing output

12. Use actual **MIPRO / LED TRACKERS letterhead/background assets**.
13. Correct real stationery contact values.
14. Implement mm-based A4 digital/preprinted print calibration.
15. Rebuild **Order Receiving Sheet** to match supplied format.
16. Switch primary visual identity from red to MIPRO blue/cyan.

### Business-value requirement

17. Add owner-only **quotation price vs landed-cost profit/loss preview**.

---

## P1 — Before beta / real-data onboarding

1. Customer detail + running transaction ledger.
2. Opening stock / legacy batch import.
3. Opening customer dues / historical sales migration.
4. Product alias / legacy item mapping.
5. Detailed import/inventory/sales/expense reports.
6. Owner-only realized-profit report using actual delivered batch COGS.
7. TA/DA Approved Sheet print/report.
8. Daily Expenditure / Monthly Category Summary exports.
9. Add optional LC amount/expiry, TT date/amount, Swift Copy and production-follow-up fields.
10. Add explicit import document types: invoice, packing list, COA, CE, ISO, etc.
11. Confirmation Queue stores actual resolution/value/notes/date/user.
12. Expanded negative/integrity tests + CI.

---

## P2 — After explicit client confirmation

1. Invoice entity/template and exact workflow.
2. VAT/AIT/tax rules.
3. Full HishabPati replacement depth vs simple operational accounting.
4. Additional warehouses / transfers.
5. Owner/CEO loan/advance treatment for migrated records.
6. Low-price approval policy details.
7. Customer returns / sales returns if operationally used.

---

## Later phase

1. Sales mobile app
2. check-in/check-out
3. GPS
4. customer visits
5. daily/monthly plans
6. leads/follow-ups
7. mobile quotation/order/collection
8. manager monitoring
9. LangChain / LangGraph AI features
10. document extraction / AI summaries after clean operational data exists

---

# 22. Source-to-System Matching Matrix

| Client source | Key requirement/evidence | Current system | Needed action |
|---|---|---|---|
| `conversation_transcript.md` Meeting 1 | Total freight allocated by CBM to products and per piece | Strongly implemented | Keep; make server item basis authoritative |
| Meeting 1 | LC/shipment is main costing context with multiple products | Implemented | Keep |
| `Importing Flow.jpeg` | PO → Supplier → PI → LC/TT | Partially mismatched because PI is required at creation | Make PI/LC progressive/optional |
| Meeting 1 | Customs duty manually provided per product | Implemented | Keep |
| Meeting 1 | Dynamic named extra costs | Implemented | Keep |
| Meeting 1 | Common cost basis not fully confirmed | Explicit allocation implemented | Keep pending/configurable |
| Meeting 1 | Local transport like freight/volume | Implemented through CBM capability but decision still pending | Make CBM default/confirmed |
| Meeting 1 | landed cost confidential | Implemented with capabilities/redaction | Tighten write-side authorization |
| Meeting 1 | FIFO older matching lot; newer lot exception | Basic implementation | Add multi-batch FIFO + expired exclusion |
| Meeting 1 | old inventory may already exist | Missing | Add opening stock migration |
| Meeting 1 | warehouse/office rent are monthly expense | Implemented | Keep |
| Meeting 2 | Quote → Order → Challan → Collection | Implemented | Keep |
| Meeting 2 | digital letterhead + preprinted-paper quotation | Partial generic implementation | Rebuild using actual stationery |
| Meeting 2 | challan remarks + receiver signoff | Basic support | Improve exact printable structure/signature areas |
| Meeting 2 | payment modes / bank linkage | Mostly implemented | Fix Credit semantics + API account validation |
| `MIPRO Pad Final Final 2026.pdf` | Actual blue/cyan MIPRO background/contact identity | Not faithfully used | High priority print/brand update |
| `LetterHeadPadLED Trackers.pdf` | LED Trackers stationery identity | Not modeled as separate print identity | Add selectable identity/template |
| `Order_Receiving_Sheet1.pdf` | Exact order receiving form structure | Generic order print only | Dedicated faithful renderer |
| `Mipro HealthCare Corp.xlsx` | FOB + per-unit import-cost components + profit/unit | Costing exists; owner profit preview/report incomplete | Add owner preview + realized profit report |
| `Sales_Ledger_1.2.1.xlsx` | per-customer history, due, discount, collection, remarks | aggregate customer table only | Add customer transaction ledger |
| `Sales_Ledger_1.2.1.xlsx` | item mapping / aliases | canonical products only | Add alias/migration mapping |
| `Sales_Ledger_1.2.1.xlsx` | some VAT/AIT fields | not implemented | Correctly leave pending until confirmed |
| `Daily Expenditure.xlsx` | Date/detail/cost/remarks + monthly categories | basic expense ledger implemented | Add matching reports/export |
| `TA-DA.xlsx` | monthly employee TA/DA approved sheet | row entry exists | Add grouped approved-sheet print/report |
| older generic proposal | Invoice | omitted/pending | Keep pending until client clarifies |
| older generic proposal | HR/fleet/full accounting/AI | deferred | Correct — do not re-expand yet |

---

# 23. Suggested Revised Next Client Demo

The next demo should prove business correctness, not page count.

## Demo A — Import / Landed Cost

1. Create draft with PO + supplier before PI/LC.
2. Add 3 products under the same shipment.
3. Add PI later.
4. Add LC number when opened; same record now displays LC as primary ref.
5. Add sea freight once and show CBM allocation.
6. Add manually assessed duty for each product.
7. Add C&F / gate / bank / insurance / labour / local transport using `+ Add Cost`.
8. Click an allocated amount and show exactly how it was calculated.
9. Show final landed cost per product/unit.
10. Show owner-only selling-price/profit preview.
11. Finalize.
12. Receive by lot/MFG/expiry.

## Demo B — Old + New Stock FIFO

1. Load one opening/old batch.
2. Receive a new batch from current LC.
3. Create an order requiring more than one old/new batch.
4. Show system splitting quantity oldest-first.
5. Deliberately choose newer lot and show override warning/reason.

## Demo C — Sales / Print

1. Create quotation.
2. Preview on **actual MIPRO digital letterhead**.
3. Switch to **preprinted-paper mode**.
4. Convert to order.
5. Generate **Order Receiving Sheet** matching supplied structure.
6. Dispatch + challan.
7. Record collection with real account.
8. Open customer ledger and show due reduced.

## Demo D — Expenses

1. Post normal office expense.
2. Post employee TA/DA.
3. Show Daily Expenditure report.
4. Print TA/DA Approved Sheet.
5. Verify none of these changed landed cost.

This demonstration would be much more convincing to the client than restoring more modules.

---

# 24. Final Recommendation

The updated repository should **not be discarded or rewritten again**. The redesign is now fundamentally sound.

The correct strategy is:

> **Keep the simplified architecture, fix the transaction-integrity gaps, make printing faithfully use the client's real stationery/forms, deepen only the customer/reporting pieces supported by real files, and resist reintroducing generic ERP modules.**

The most urgent mismatch is no longer “too many pages.” It is now the difference between a **good generic-looking prototype** and a **business-faithful MIPRO operating system**.

The next iteration should therefore emphasize:

1. exact business sequence,
2. authoritative calculations,
3. historical inventory consistency,
4. actual document/letterhead fidelity,
5. customer/accounting reports based on the client's spreadsheets,
6. owner profitability visibility,
7. strict role/data integrity.

Once those are correct and the client approves the web flow, moving the service boundaries to Supabase should be straightforward without expanding the frontend unnecessarily.

---

## End of Audit
