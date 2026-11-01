# MIPRO Medical Supplier ERP — Real Update Plan

**Date:** 24 August 2026  
**Repository:** `AN-SWAPNIL/Medical_Supplier_ERP`  
**Branch to use from now on:** `dev`  
**Dev HEAD reviewed:** `614440c68cd9706249cbfdaf569fad51561cf1e7`  
**Purpose:** define only the **real remaining updates** after re-checking the current implementation, recent simplification commits, client meetings, supporting files, and important pre-simplification features.

---

# 1. Main conclusion

The current `dev` branch is already much more complete than the previous update plan implied.

Several things that looked “removed” are actually already implemented in a better/simpler place:

- user creation,
- user editing,
- role assignment,
- user status,
- passwords in mock auth,
- explicit sensitive capabilities,
- products/suppliers/business setup,
- migration tools,
- audit report,
- From/To report filtering,
- TA/DA employee filtering,
- customer running ledger,
- opening stock,
- opening customer balance,
- FIFO across batches,
- expiry checks,
- landed-cost controls,
- MIPRO / LED TRACKERS print identities,
- supplied letterhead backgrounds,
- Order Receiving Sheet,
- quotation/challan/receipt/import-cost print preview.

Therefore this plan **does not rebuild those features**.

The real next update should be focused:

1. **Extend per-person reporting beyond TA/DA to salesperson/employee performance.**
2. **Turn document metadata into a real attached-file/PDF viewing workflow.**
3. **Bring back the floating AI assistant, adapted to the current simplified system.**
4. **Bring back useful contextual AI features, especially document extraction and smart alerts.**
5. **Make only small access-control UX refinements if necessary; do not build a new IAM/role system.**
6. **Keep the current simplified navigation and corrected business flows unchanged.**

---

# 2. Source priority

Use requirements in this order:

1. `files/conversation_transcript.md`
2. `files/meeting_minutes.md`
3. `files/Importing Flow.jpeg`
4. Real client supporting files:
   - `Mipro HealthCare Corp.xlsx`
   - `Sales_Ledger_1.2.1.xlsx`
   - `Daily Expenditure.xlsx`
   - `TA-DA.xlsx`
   - `Order_Receiving_Sheet1.pdf`
   - `MIPRO Pad Final Final 2026.pdf`
   - `LetterHeadPadLED Trackers.pdf`
5. Current `dev` implementation
6. `files/Medical_Supplier_ERP_Simplified_Plan_update1.md`
7. `files/Medical_Supplier_ERP_Simplified_Plan.md`
8. `files/hisabpati_deep_research.md`
9. Older generic requirement/proposal documents only when later sources do not override them.

Important interpretation:

> The latest meetings corrected ambiguous business flow. They did not instruct us to remove fundamental administration, reporting, document, or AI capabilities.

---

# 3. Navigation — Keep It Exactly Simple

Current main navigation is good:

- Dashboard
- Imports
- Inventory
- Sales
- Expenses & Accounts
- Reports
- Settings

**Do not re-expand this.**

Do not add main sidebar items for:

- Users
- Roles
- Documents
- AI Command Center
- Audit
- PO
- PI
- LC
- Shipment
- Customs
- GRN
- CRM
- Targets
- HR
- Mobile Sales

Important features should be integrated into the existing areas.

---

# 4. Current Features That Are Already Good — Do Not Rebuild

## 4.1 User administration

Current:

`Settings → Users & Capabilities`

Already supports:

- New User
- Edit User
- Full Name
- Email
- Assigned Role
- Active / Pending / Inactive
- Job Title
- Department
- Phone
- Territory
- Profile image
- Initial password
- Password change
- Explicit capabilities

Current roles:

- Super Admin
- Managing Director
- Accounts
- Import Officer
- Warehouse Manager
- Sales Manager
- Sales Executive

Current explicit capabilities already cover important exceptions:

- View sensitive import cost
- Edit sensitive import cost
- Finalize landed cost
- Reopen landed cost
- View selling-profit information
- Approve FIFO override
- Manage users
- Approve special price

### Decision

**Do not build another user-management page.**

**Do not restore the old RoleMatrixPage or UserPermissionToggles verbatim.**

The current role + capability model is already a good balance between:

- simplicity,
- client-controlled access,
- sensitive costing protection.

---

## 4.2 Authentication

Current auth flow already includes:

- Login
- Signup / request
- Forgot password
- Reset password
- Protected routes
- Logout
- Profile

Keep it.

---

## 4.3 Import workflow

Current corrected import flow is good:

```text
Draft
→ PO / Supplier / Products
→ PI
→ LC / TT
→ Production
→ Shipment
→ Port
→ Costing
→ Finalized Landed Cost
→ Warehouse Receiving
```

Important current corrections already implemented:

- one import = one shipment/consignment,
- one shipment contains one or many products,
- PI can remain pending,
- LC/TT can remain pending,
- LC/TT becomes business reference when available,
- status transitions are controlled,
- server recomputes authoritative FOB/CBM,
- landed cost snapshot is immutable,
- normal reopen is blocked after receiving,
- costs are dynamically addable,
- product-specific duty works,
- multiple allocation methods work.

Do not disturb this.

---

## 4.4 Inventory

Current implementation already has:

- lot,
- batch,
- manufacturing date,
- expiry date,
- source import,
- stock movements,
- opening stock,
- FIFO,
- multi-batch FIFO allocation,
- expired-stock exclusion,
- FIFO override permission/reason.

Keep it.

---

## 4.5 Sales

Current flow is already correctly simplified:

```text
Customer
→ Quotation
→ Order
→ Delivery Challan
→ Collection
```

Also has:

- customer ledger,
- dues,
- opening balances,
- batch-aware dispatch,
- selling-profit preview for allowed user.

Keep this flow.

Do not add Invoice into the mandatory workflow until the client confirms it.

---

## 4.6 Reports

Current Reports already have:

- From Date
- To Date
- actual server-side date filtering
- Import reports
- Inventory reports
- Sales reports
- Expense reports
- Audit
- CSV export
- Print
- TA/DA employee filtering

This is already the correct report foundation.

Do not restore the old ReportsCenter.

---

## 4.7 Printing

Current `PrintPage` should remain the print engine.

It already supports:

- MIPRO identity
- LED TRACKERS identity
- real supplied background artwork
- digital letterhead
- preprinted-paper mode
- A4 210 × 297 mm calibration
- safe-area settings
- Quotation
- Order Receiving Sheet
- Delivery Challan
- Money Receipt
- Import Landed Cost

Do not replace this with the old generic PrintPreviewPage.

---

# 5. Real Gap 1 — Per-Person / Employee Performance Reports

This is the clearest report gap.

The client wants management to be able to select a person and a date period and see that person's activities/performance.

The conversation describes employee-ID-based monitoring and reports for:

- customer activity,
- quotations,
- active/pending sales,
- orders,
- sales collection,
- visits,
- leads,
- follow-ups,
- plans,
- achievement.

The mobile app will later provide some of that data.

But the web ERP already has enough data to implement the **sales-performance portion now**.

---

# 6. Extend Current Reports, Do Not Build a Separate Reporting System

Add a new table/report under:

```text
Reports
→ Sales & Collection
→ Salesperson Performance
```

Keep the existing From/To controls.

When this report is selected, show:

```text
Employee [All Sales Employees ▼]
```

No new top-level tab.

---

# 7. Salesperson Performance — Current Data

For a selected period and selected Sales Executive, calculate:

### Summary

- Quotations created
- Quotation total value
- Sent quotations
- Accepted quotations
- Converted quotations
- Orders created
- Orders delivered
- Delivered sales value
- Units delivered
- Collections received
- Number of customers handled
- Assigned customer outstanding due
- Average order value
- Quotation → order conversion rate

### Details

- Quotation list
- Order list
- Delivery/challan list
- Collection list
- Customer summary
- Product summary

### Optional useful metrics

If reliable from current data:

- Total discount given
- Average discount
- Cancelled/rejected quotations
- Pending quotation value

Do not invent data.

---

# 8. All-Employee Comparison

If:

```text
Employee = All Sales Employees
```

show:

| Employee | Quotes | Converted | Orders | Delivered Sales | Collections | Customers | Conversion |
|---|---:|---:|---:|---:|---:|---:|---:|

Management can then compare the whole sales team.

---

# 9. Printable Employee Report

Add:

```text
[Print Employee Report]
```

Example:

```text
MIPRO HEALTHCARE CORPORATION

SALES EMPLOYEE PERFORMANCE REPORT

Employee: Md. X
Designation: Sales Executive
Territory: Dhaka
Period: 01 Aug 2026 – 31 Aug 2026

SUMMARY

Quotations
Accepted
Orders
Delivered Sales
Collections
Outstanding Customer Due
Conversion Rate

CUSTOMER SUMMARY

QUOTATION DETAILS

ORDER / DELIVERY DETAILS

COLLECTION DETAILS

TOP PRODUCTS
```

Later the mobile app can extend the same report with:

- Attendance
- Check-in/out
- Daily Plan
- Monthly Plan
- Customer Visits
- Leads
- Follow-ups
- Visit outcomes
- GPS information
- Target vs achievement

Do **not** add fake placeholders to the report now unless clearly labelled “available after Sales App integration”.

---

# 10. Important: Correct Sales Attribution

Before using the employee report as authoritative, confirm that records are attributed to the correct salesperson.

Current model already has concepts like:

- assigned sales user,
- quotation owner,
- order owner,
- collection owner.

Do not over-redesign the schema now.

But check these cases:

### Case 1

Sales Executive creates quotation.

→ report belongs to that executive.

### Case 2

Sales Manager creates/edits an order for an executive.

→ business sales owner should remain the executive, not automatically become the manager.

### Case 3

Accounts posts a payment received for a salesperson's customer.

→ collection should still count toward the correct salesperson's customer/performance if that is the client's intended attribution.

### Recommended minimal fix

Where necessary, distinguish:

```text
salesOwnerId
createdBy
```

Do this only for entities where current `ownerId` semantics are ambiguous.

Do not redesign every record.

---

# 11. Report Access

Use existing role behavior.

Recommended:

### Super Admin
Can view all employee reports.

### Managing Director
Can view all employee reports.

### Sales Manager
Can view team/all salespeople.

### Sales Executive
Should be able to view **own report only**.

### Accounts
Only if business requires it; collection reports are already available.

Do not expose:

- secret landed cost,
- FOB,
- hidden profit,

inside ordinary employee performance reports.

---

# 12. Real Gap 2 — Attached PDF / File Viewer

Current Import → Documents already exists.

It currently stores/displays document metadata:

- document name,
- type,
- upload date.

But the user cannot actually open the PDF from the card.

This is the real missing feature.

---

# 13. Do Not Create a New Documents Main Module

Documents belong to their business record.

Examples:

```text
Import → PI.pdf
Import → LC.pdf
Import → BL.pdf
Import Cost → C&F bill.pdf
Expense → electricity_bill.pdf
Quotation → generated PDF preview
Delivery → generated Challan preview
```

Use contextual documents.

---

# 14. Uploaded File Viewer

Add a reusable component:

```text
src/components/documents/DocumentViewer.tsx
```

or:

```text
src/shared/documents/DocumentViewer.tsx
```

Behavior:

1. User clicks the document card or `View`.
2. Open a large modal/drawer.
3. For PDF:
   - render browser PDF preview using `<iframe>` or `<object>`.
4. For image:
   - show image preview.
5. Show file metadata.
6. Provide:
   - Open in new tab
   - Download
   - Close

For the frontend mock, browser-native PDF rendering is enough.

Do not add PDF.js unless page search/thumbnails/annotations are actually needed.

---

# 15. Import Documents

Import document types should comfortably support:

- PO
- PI
- LC
- TT / Swift Copy
- Commercial Invoice
- Packing List
- Bill of Lading
- COA
- CE
- ISO
- Customs Assessment
- Duty document
- Freight invoice
- Insurance document
- C&F bill
- Port bill
- Transport bill
- Other

Do not make each type a separate tab.

Use document cards/list + filter/type.

---

# 16. Cost Attachments

Current cost line has attachment metadata.

Improve this so a cost can actually open its supporting document.

Example:

```text
C&F Charge
BDT 124,500
Allocation: FOB Value

Attachment:
C&F-Bill-0826.pdf   [View]
```

Eventually allow more than one supporting file per cost if needed.

For now one attachment can remain if that keeps the UI simple.

---

# 17. Expense Attachments

Expense already has `attachmentName`.

Make it consistent with the same viewer.

Example:

```text
Electricity
Tk 18,500
Attachment [View]
```

No separate expense-document module.

---

# 18. Generated Documents — Already Have Preview

Generated records are different.

Current `PrintPage` already behaves as a high-quality generated-document preview.

Use it.

Examples:

```text
Quotation       [Preview / Print]
Order Sheet     [Preview / Print]
Challan         [Preview / Print]
Receipt         [Preview / Print]
Import Cost     [Preview / Print]
```

Do not generate and store a real PDF binary in Express mock unless necessary.

Later backend can generate/store PDF if the client wants permanent document snapshots.

---

# 19. Future Supabase File Storage

Later:

```text
Supabase Storage
```

Recommended:

```text
private bucket
```

Store metadata in DB:

```text
id
entity_type
entity_id
document_type
file_name
mime_type
storage_path
uploaded_by
uploaded_at
sensitive
```

Use signed URLs.

Do not use public URLs for sensitive landed-cost/import documents.

---

# 20. Document Permission

Use existing role/capability rules.

Examples:

- a Sales Executive must not open confidential C&F/FOB/landed-cost files,
- a user without Import access should not access import documents,
- sensitive-cost attachment should require cost visibility,
- normal sales output follows Sales/Print access.

Backend must eventually protect the file URL, not only hide the button.

---

# 21. Real Gap 3 — Floating AI Assistant

This genuinely disappeared from the new UI.

Bring it back.

But **do not copy the old FloatingAIChat directly** because:

- old data structures are obsolete,
- old answers assumed old modules,
- old permissions/workflows differ,
- current import/sales architecture is now much better.

Rebuild it against current services/types.

---

# 22. Floating AI UX

Mount in:

```text
AppLayout
```

after authentication.

Collapsed:

```text
[ ✨ ]
```

or:

```text
✨ Ask MIPRO AI
```

fixed bottom-right.

Expanded:

```text
┌────────────────────────────────┐
│ MIPRO AI                   ×   │
│ Current role: Import Officer   │
├────────────────────────────────┤
│                                │
│ Conversation                   │
│                                │
├────────────────────────────────┤
│ Suggested questions            │
├────────────────────────────────┤
│ Ask something...        Send   │
└────────────────────────────────┘
```

Requirements:

- does not overlap important buttons,
- works with collapsed/expanded sidebar,
- mobile responsive,
- mobile can become near-full-screen drawer,
- below ConfirmDialog/Modal z-index.

No new sidebar tab.

---

# 23. Context-Aware AI

The assistant should understand what page/record the user is viewing.

Pass context such as:

```text
route
entityType
entityId
selected report period
```

Examples:

### On Import Workspace

- “Explain the current stage.”
- “Which documents are missing?”
- “Explain how this freight was allocated.”
- “What cost still needs attention?”

### On Inventory

- “Which lots need attention?”
- “Which batch should be sold first?”
- “Which products are near expiry?”

### On Sales

- “Which customers have high dues?”
- “Summarize this customer.”
- “Which quotations are still pending?”

### On Reports

- “Summarize 1 Aug to 31 Aug.”
- “Compare salesperson performance.”
- “Which customer owes the most?”

---

# 24. AI Must Use Current Permissions

This is critical.

Do not give AI unrestricted database context.

### Sales Executive AI

Can access only allowed sales/customer information.

Must not receive:

- landed cost,
- FOB,
- import-secret cost,
- hidden profit,
- another executive's private sales data.

### Import Officer

Can see import information according to current role.

Cost detail only if capability allows it.

### Warehouse Manager

AI can explain:

- FIFO,
- stock,
- expiry,
- batch warnings.

### MD / Super Admin

Can receive wider summaries.

---

# 25. AI API Boundary

Add/restore a clean AI service now even while responses are mocked:

```text
POST /api/ai/chat
GET  /api/ai/insights
POST /api/ai/document-extract
GET  /api/ai/recommendations
```

Frontend:

```text
aiService.chat(...)
aiService.getInsights(...)
aiService.extractDocument(...)
```

Later replace server implementation with:

- LangChain
- LangGraph
- model provider
- Supabase queries/storage

without rewriting the UI.

---

# 26. AI Feature 1 — Smart Inventory/FIFO Alerts

The client explicitly described “AI notification” around FIFO/LIFO behavior.

The actual FIFO rule should stay deterministic.

Do not make an LLM decide stock allocation.

Current FIFO engine is already correct.

Add a **Smart Alert presentation layer**:

```text
⚠ Older lot is still available.

Product: Dialyzer
Older Lot: LOT-...
Available: 340 pcs
Selected newer lot: LOT-...

Recommended: use older lot first.
```

If the user deliberately uses newer stock:

- existing override permission remains,
- reason remains mandatory.

AI can explain the warning.

The transaction logic remains deterministic.

---

# 27. AI Feature 2 — Expiry / Inventory Attention

Use current stock data to surface:

- expired stock,
- ≤1 month,
- ≤3 months,
- ≤6 months,
- unusually old inventory,
- old lot still not issued.

Initially this can be pure rules.

AI can produce the readable summary.

Example:

```text
Inventory Insight

3 batches need attention:
- Blood Line LOT-X expires in 27 days.
- Dialyzer LOT-Y is older than the newer batch currently being selected.
...
```

---

# 28. AI Feature 3 — Import Document Extraction

This useful old concept should come back, but in the correct place.

Do not build an AI Command Center.

Inside:

```text
Import → Documents
```

for PDF types such as PI:

```text
[View]
[Extract Fields]
```

Then show:

```text
AI Extracted Fields

Supplier
PI Number
PI Date
Currency
Product
Quantity
FOB / unit
Carton Count
CBM / carton
Total CBM
```

Then:

```text
[Apply Selected Fields]
```

Important:

- extraction never silently overwrites import data,
- user checks result,
- user selects fields,
- normal server validation still applies.

Mock extraction is acceptable now.

Later LangChain/LangGraph can replace it.

---

# 29. AI Feature 4 — Management Insights

Current Dashboard can get a small AI/smart insight card.

Do not add a new page.

For MD/Super Admin:

```text
Management Insight

- Collection is behind delivered sales this month.
- 2 import shipments are still awaiting cost finalization.
- 3 stock batches need expiry attention.
- Salesperson X has the highest collection.
```

Use actual current data.

No fake numbers.

---

# 30. AI Feature 5 — Sales / Collection Follow-up

Use current records for rule-based suggestions:

- high outstanding due,
- quotation accepted but order not created,
- placed order not delivered,
- delivered order with low/no collection,
- customer with repeated unpaid balances.

Example:

```text
Follow-up Suggested

Popular Hospital
Outstanding Due: Tk ...
Last Collection: ...
Reason: Delivered order remains largely unpaid.
```

Later AI may phrase/rank recommendations.

---

# 31. AI Recommendation Card

The old `AIRecommendationCard` was a useful UI pattern.

Bring the concept back.

Suggested fields:

```text
Severity
Title
Reason
Source
Recommended Action
```

Buttons:

```text
View Record
Dismiss
Review
```

Do **not** add a generic “Approve” button that directly posts business transactions.

AI must not bypass:

- landed-cost finalization,
- warehouse receipt,
- FIFO override,
- order workflow,
- collection posting,
- permission checks.

---

# 32. Do Not Restore AI Command Center

Do not restore:

```text
AI Command Center
```

as a main page with many “agents”.

It adds navigation complexity without helping the daily workflow.

Use:

- Floating Assistant
- Contextual Extract
- Smart Alerts
- Dashboard Insight
- Report Summary

That is enough.

---

# 33. User Roles / Capabilities — Only Minor Update, Not Rebuild

After re-checking, the current implementation is already good enough for the client's present requirement.

The client said sensitive costing should be visible only to Super Admin initially, then access can be given to specific responsible people.

Current explicit capabilities already support this well.

Therefore:

## Keep

- fixed seven roles,
- role matrix,
- explicit user capabilities.

## Do not add now

- custom role creation,
- hundreds of permission toggles,
- OWN/TEAM/ALL generic permission framework,
- separate role-management main page.

Those can be reconsidered only if a real client case requires them.

---

# 34. Small Access UX Improvement

Inside User Edit, add a short read-only summary:

```text
Role Access Summary

Import Officer
Default:
✓ Dashboard
✓ Imports
× Inventory
× Sales
× Accounts
× Reports

Additional Capabilities:
✓ View Sensitive Cost
✓ Finalize Landed Cost
```

This solves the practical admin problem:

> “What will this user actually be able to see?”

without building another permission system.

Optional:

```text
[View Role Permissions]
```

small modal.

---

# 35. Check `manage_users` Capability

Currently user administration is under Super Admin-only Settings.

Therefore `manage_users` may be redundant unless you actually intend to allow another user to administer users.

Choose one:

### Recommended now

Keep user administration Super Admin-only.

Remove/hide `manage_users` from the UI if it has no effect.

### Only if client requests delegation

Make `manage_users` meaningful and let that user access only:

```text
Settings → Users & Capabilities
```

not the entire Settings area.

Do not implement delegation speculatively.

---

# 36. HishabPati Influence — Keep the Simplicity

Continue using HishabPati as a UX lesson, not a feature specification.

Borrow:

- simple entry forms,
- obvious Add actions,
- easy customer selection,
- clear dues,
- simple cash/bank language,
- quick daily transactions,
- easy reports,
- familiar Bangladesh business terminology.

Do not copy:

- generic accounting-first workflow,
- lack of import costing,
- weak batch/lot traceability,
- weak specialized permissions.

Goal:

> The custom ERP should feel as easy to operate as HishabPati, while handling the import, landed-cost, medical stock, and sales-control needs HishabPati cannot handle.

---

# 37. Current Main Areas After the Update

## Dashboard

**Keep current.**

Add only:

- Smart Alerts
- small AI/Management Insight
- optional employee/team summary for manager roles

No extra dashboard tabs unless clearly useful.

---

## Imports

**Keep current Import Workspace.**

Add:

- actual attachment preview,
- `View` document action,
- cost attachment preview,
- AI Extract Fields,
- contextual AI questions,
- missing-document/smart alert.

Do not separate PO/PI/LC/customs into new pages.

---

## Inventory

**Keep current.**

Add:

- Smart FIFO/expiry alerts,
- AI explanation,
- maybe “Needs Attention” filter.

Do not build another warehouse module.

---

## Sales

**Keep current.**

Add:

- reliable salesperson attribution where necessary,
- follow-up suggestions,
- generated-document preview links where not obvious.

Do not add the full mobile-sales feature set to the web ERP now.

---

## Expenses & Accounts

**Keep current.**

Add:

- attached file preview,
- consistent employee reference for TA/DA if needed.

Do not expand to full accounting until confirmed.

---

## Reports

**Keep current.**

Add:

- Salesperson Performance
- Employee selector for that report
- individual employee print
- All Employee comparison
- AI period summary

TA/DA employee filtering already exists.

---

## Settings

**Keep current.**

Do not rebuild users/roles.

Potential small additions:

- Role Access Summary
- role-permission reference modal
- hide/fix ineffective `manage_users`

---

# 38. Old Features — Final Decision Table

| Removed old feature | Final decision |
|---|---|
| `FloatingAIChat.tsx` | **Rebuild/adapt** |
| `AIRecommendationCard.tsx` | **Rebuild/adapt** |
| `FileUploadMock.tsx` | **Rebuild as Import Document Extract UI** |
| `AICommandCenterPage.tsx` | **Keep removed** |
| `DocumentArchivePanel.tsx` | **Current Documents replaces it; add viewer only** |
| `ReportFilter.tsx` | **Keep removed; current report filters are real/better** |
| `ReportsCenterPage.tsx` | **Keep removed** |
| `RoleMatrixPage.tsx` | **Keep removed; optional tiny role summary only** |
| `UserPermissionToggles.tsx` | **Keep removed; current capabilities are enough now** |
| `PermissionGate.tsx` | **Keep removed if current guards/capabilities already enforce access** |
| `PrintPreviewPage.tsx` | **Keep removed; current PrintPage is better** |
| `MobileSalesControlPage.tsx` | **Keep removed from web; future mobile phase** |
| `AuditSecurityPage.tsx` | **Keep removed; audit already integrated in Reports** |
| Generic `ModulePage` system | **Keep removed** |
| Generic old `DataTable` | **Keep removed unless real reuse need appears** |
| Full HR / Payroll | **Defer** |
| Fleet / Transport suite | **Defer** |
| Full GL / Trial Balance | **Pending client confirmation** |
| Multi-company scope selector | **Keep removed for current single-company scope** |

---

# 39. Priority Plan

## P0 — Next update

### A. Employee report

1. Add Salesperson Performance report table.
2. Add employee selector for that table.
3. Use current From/To.
4. Add All Employees comparison.
5. Add individual print view.
6. Verify sales ownership/attribution.
7. Enforce role visibility.

### B. Documents

8. Add reusable PDF/image viewer.
9. Add `View` button to Import Documents.
10. Make real/mock upload retain preview URL/metadata.
11. Add cost attachment View.
12. Add expense attachment View.
13. Use current PrintPage for generated document Preview.

### C. AI

14. Add new floating MIPRO AI compatible with current AppLayout.
15. Add current-page context.
16. Add role-safe mock chat API.
17. Add Smart Inventory/FIFO/expiry alerts.
18. Add Dashboard/Report management summary.
19. Add Sales/Collection follow-up suggestions.

---

## P1 — After P0 works

20. AI Import Document Extraction.
21. Review/apply extracted fields.
22. AI Recommendation Card component.
23. Missing-document suggestions.
24. Cost-allocation explanation.
25. Better source links from AI to actual records.
26. Small User Role Access Summary.

---

## P2 — Later / mobile app

27. employee attendance/check-in/out,
28. GPS,
29. daily plans,
30. monthly plans,
31. visits,
32. leads,
33. follow-ups,
34. mobile quotation,
35. mobile order,
36. mobile collection,
37. richer employee performance report,
38. real LangChain/LangGraph orchestration.

---

# 40. Implementation Order

## Phase 1 — Employee Report

Do this first because:

- data mostly already exists,
- client explicitly requested it,
- low architectural risk.

Deliver:

```text
Salesperson Performance
From
To
Employee
All Employees
Print
CSV
```

---

## Phase 2 — Document Viewer

Implement one shared viewer and wire it into:

1. Import Documents
2. Import Cost attachment
3. Expense attachment
4. Generated print preview links

Do not create multiple viewer implementations.

---

## Phase 3 — Floating AI

Rebuild assistant using current:

- React app layout,
- current auth/session,
- current API client,
- current types,
- current business flow.

Start with deterministic/rule-backed mock responses.

---

## Phase 4 — Contextual AI

Add:

- FIFO/expiry insight,
- management summary,
- sales follow-up,
- document extraction.

---

## Phase 5 — UAT

Test every role.

---

# 41. Tests Required

## Employee Report

- From/To filters actual data.
- employee selection returns correct salesperson.
- All Employees aggregates correctly.
- Sales Executive sees only own performance.
- Sales Manager sees team data.
- MD/Super Admin see full report.
- no secret landed-cost information leaks.

## Document Viewer

- PDF opens.
- image opens.
- missing file shows proper error.
- sensitive attachment not visible to unauthorized user.
- import document stays linked to correct import.
- generated Preview goes to correct PrintPage record.

## AI

- floating assistant works on desktop/mobile.
- assistant does not obscure critical modal buttons.
- current import context is passed.
- Sales Executive cannot obtain landed cost through chat.
- role-specific responses work.
- FIFO recommendation matches deterministic engine.
- extracted fields require user review before apply.

---

# 42. UAT Scenarios

## Scenario 1 — Existing user management

1. Super Admin opens Settings.
2. Create Sales Executive.
3. Assign role.
4. Set territory.
5. Edit capabilities.
6. Save.
7. Login as the user.
8. Verify current role restrictions.

No new user-management system should be required.

---

## Scenario 2 — Employee report

1. Login as Sales Manager.
2. Reports → Sales & Collection.
3. Select Salesperson Performance.
4. From = 01 Aug.
5. To = 31 Aug.
6. Employee = Sales Executive A.
7. Verify quotation/order/delivery/collection values.
8. Print.
9. Select All Employees.
10. Compare employees.

---

## Scenario 3 — PDF Viewer

1. Open Import.
2. Documents.
3. Click PI PDF.
4. PDF opens inside viewer.
5. Close.
6. Open freight bill from cost line.
7. PDF opens.
8. Login as Sales Executive.
9. Direct sensitive document access is rejected.

---

## Scenario 4 — AI Assistant

1. Open Import LC-....
2. Open floating assistant.
3. Ask:
   `What is the current status of this shipment?`
4. AI answers from current record.
5. Ask:
   `Which documents are missing?`
6. AI lists based on existing document types.

Sales Executive asks:

`What is the actual landed cost of Dialyzer?`

Expected:

- no secret value,
- permission-safe response.

---

## Scenario 5 — Inventory Alert

1. Older batch remains.
2. New batch also exists.
3. User prepares delivery.
4. Current deterministic FIFO recommends older stock.
5. Smart alert explains the recommendation.
6. Override still requires the existing permission/reason.

---

# 43. What “Simple” Means

Do not equate simple with feature deletion.

Simple means:

- fewer main navigation entries,
- connected workflows,
- contextual actions,
- no duplicate pages,
- no duplicate data entry,
- complex functions shown only where needed.

Examples:

### Correct

```text
Import
 ├─ Commercial
 ├─ LC/Shipment
 ├─ Documents
 ├─ Costs
 ├─ Landed Cost
 └─ Receiving
```

### Wrong

```text
PO
PI
LC
TT
Shipment
Customs
Cost
Document
GRN
```

### Correct AI

```text
Floating assistant
+ smart alert where problem happens
+ extract fields beside PDF
```

### Wrong AI

```text
separate AI page containing many decorative “agents”
```

---

# 44. Agent Instructions

When implementing:

1. **Use `dev` only.**
2. Re-read existing component before creating replacement.
3. Assume current feature exists until confirmed missing.
4. Do not rebuild Users & Capabilities.
5. Do not rebuild Reports.
6. Do not rebuild PrintPage.
7. Do not change the corrected Import/Costing/FIFO logic.
8. Do not restore old components by copy/paste.
9. Old commits are design references only.
10. Do not add new main navigation unless absolutely unavoidable.
11. Do not invent invoice/VAT/accounting rules.
12. Do not expose sensitive cost through AI/documents/reports.
13. Keep mock services replaceable by Supabase.
14. Keep AI boundary replaceable by LangChain/LangGraph.
15. Prefer shared small components over generic enterprise frameworks.
16. Add tests with every new behavior.

---

# 45. Exact Next Deliverable

The next development update should be titled:

## **Employee Reports + Document Viewer + Contextual AI**

It should deliver:

### Reports
- Salesperson Performance
- Employee + From/To
- All Employee comparison
- individual print

### Documents
- PDF/image viewer
- Import document View
- cost attachment View
- expense attachment View
- generated Preview links

### AI
- floating MIPRO AI
- current-page context
- RBAC-safe data
- FIFO/expiry smart alerts
- sales/collection follow-up
- management report summary

### Administration
- **no rebuild**
- optional Role Access Summary only

And it should leave the current seven-area architecture intact.

---

# 46. Final Product Direction

The system should remain:

> A simple operational ERP centered on accurate import/landed-cost tracking, medical batch inventory, controlled sales/collection, practical accounting/expense records, and management reporting — with user roles/capabilities, document visibility, and contextual AI integrated without turning each feature into a separate module.

That is the correct balance between **simplification** and **not losing important functionality**.

---

**End of plan**
