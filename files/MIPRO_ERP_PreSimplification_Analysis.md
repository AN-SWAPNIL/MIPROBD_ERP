# MIPRO Medical Supplier ERP — PreSimplification Analysis

**Planning date:** 24 August 2026
**Repository:** `AN-SWAPNIL/Medical_Supplier_ERP`
**Working branch:** `dev`
**Dev HEAD reviewed:** `614440c68cd9706249cbfdaf569fad51561cf1e7`
**Pre-simplification comparison baseline:** `b2548a37a79c22b2f272e42c233e942d53705237`

---

## 1. Core conclusion

The current `dev` branch is the correct baseline. The recent simplification fixed the most important business-flow problems: one shipment/import with multiple products, PO-first flow, PI/LC later, flexible landed-cost allocation, immutable cost snapshots, FIFO across batches, opening-stock migration, real date-range reports, customer ledgers, client stationery, and the Order Receiving Sheet.

But the simplification went too far in a few areas. Some removed features were not unnecessary ERP complexity; they were valid product capabilities:

- real user/role/access administration,
- user-specific access exceptions,
- employee-wise performance reporting,
- contextual document archive and PDF viewing,
- AI assistance and smart notifications,
- AI document extraction,
- management insights.

The next step should **not** restore the old system wholesale.

> Keep the simplified seven-area architecture and re-integrate important capabilities inside the corrected workflows.

---

## 2. Source priority

When requirements conflict, follow:

1. latest `conversation_transcript.md` and `meeting_minutes.md`,
2. `Importing Flow.jpeg`,
3. real client files:
   - `Mipro HealthCare Corp.xlsx`
   - `Sales_Ledger_1.2.1.xlsx`
   - `Daily Expenditure.xlsx`
   - `TA-DA.xlsx`
   - `Order_Receiving_Sheet1.pdf`
   - `MIPRO Pad Final Final 2026.pdf`
   - `LetterHeadPadLED Trackers.pdf`
4. current `dev` implementation,
5. simplified plans,
6. `hisabpati_deep_research.md`,
7. older generic proposal files only where later sources do not override them.

The last meetings clarified incorrect/ambiguous flows. They did not say fundamental administration, reporting, document, or AI capabilities should disappear.

---

## 3. Keep the current simplified architecture

Keep the current top-level navigation:

1. Dashboard
2. Imports
3. Inventory
4. Sales
5. Expenses & Accounts
6. Reports
7. Settings

Do **not** add top-level tabs for Users, Roles, Documents, AI Command Center, Audit, PO, PI, LC, Shipment, Customs, GRN, CRM, etc.

Use:

- Settings subviews for administration,
- contextual document panels/viewers,
- Reports subviews for employee reports,
- floating AI for global assistance,
- contextual AI actions inside Imports/Inventory/Sales/Reports.

---

## 4. Old feature restoration decision

| Old capability                   | Decision                                                             |
| -------------------------------- | -------------------------------------------------------------------- |
| Floating AI chat                 | **Restore, rewritten for current dev**                         |
| AI Recommendation Card           | **Restore as reusable pattern**                                |
| AI document extraction mock      | **Restore contextually in Import Documents**                   |
| AI Command Center                | **Do not restore as top-level module**                         |
| Role Matrix                      | **Restore a compact Role Templates view inside Settings**      |
| User permission toggles          | **Replace with real persisted user access overrides**          |
| ReportFilter                     | **Current report system is better; extend it**                 |
| ReportsCenter                    | **Do not restore; extend current ReportsPage**                 |
| DocumentArchivePanel             | **Rebuild as contextual document library + viewer**            |
| Old PrintPreview                 | **Do not restore; current PrintPage is better**                |
| Standalone Audit/Security        | **Keep integrated into Reports/Settings**                      |
| MobileSalesControlPage           | **Do not restore to web; preserve future mobile requirements** |
| Generic ModulePage/moduleConfigs | **Keep removed**                                               |
| Full HR/payroll/fleet            | **Keep deferred**                                              |
| Full GL/trial balance            | **Keep pending**                                               |
| Multi-company complexity         | **Keep removed for now**                                       |

---

# 5. Users, Roles & Access

## 5.1 What dev already supports

Current dev already has:

- create user,
- edit user,
- active/pending/inactive status,
- role assignment,
- initial/change password in mock backend,
- title/department/phone/territory,
- explicit sensitive capabilities.

Keep the seven current business roles:

- Super Admin
- Managing Director
- Accounts
- Import Officer
- Warehouse Manager
- Sales Manager
- Sales Executive

Current capabilities such as `view_sensitive_cost`, `edit_sensitive_cost`, `finalize_landed_cost`, `view_profit`, `approve_stock_override`, and `approve_special_price` are useful and should remain.

## 5.2 Current gap

Authorization is still mostly fixed by role. It cannot cleanly express:

```text
Tanvir = Import Officer
+ Inventory view
+ Reports view/export
- sensitive cost
```

or:

```text
Senior Sales Executive
role = Sales Executive
+ export own reports
+ special-price approval
scope = own assigned customers only
```

Also `manage_users` is not very useful if Settings remains accessible only to Super Admin.

## 5.3 Correct model

Use three layers.

### Layer A — Role template

A role gives sensible defaults.

### Layer B — User-specific overrides

Super Admin can explicitly allow/deny exceptional actions.

### Layer C — Data scope

For sales-related data:

```text
OWN
TEAM
ALL
```

A user may have permission to view Sales but still be restricted to OWN records.

## 5.4 Effective permission rule

```text
effective access
  = role template
  + explicit grants
  - explicit denies
  constrained by data scope
```

The same resolver must drive:

- sidebar visibility,
- route guards,
- buttons/actions,
- Express API authorization,
- report filtering,
- document access,
- AI context.

## 5.5 Permission areas

Do not restore the old 20+ module matrix.

Use:

```text
dashboard
imports
inventory
sales
accounts
reports
settings
print
documents
ai
```

Actions:

```text
view
create
edit
delete
approve
post
export
```

Keep sensitive details as explicit capabilities rather than creating hundreds of field permissions.

## 5.6 Settings UX

Keep this under:

```text
Settings → Users & Access
```

User editor sections:

```text
Profile
Role
Access Overrides
Data Scope
Security
Activity
```

Add a secondary:

```text
[View Role Templates]
```

Do not add a new top-level Roles page.

### Effective Access Preview

Example:

```text
Effective access for Tanvir Hasan

Imports        View Create Edit
Inventory      View
Reports        View Export
Sensitive Cost Hidden
Profit         Hidden
Sales Scope    None
```

This is more useful than the old giant matrix.

## 5.7 Backend

Gradually replace fixed `areaRoles` logic with:

```ts
requirePermission(req, "imports", "view")
requirePermission(req, "reports", "export")

effectivePermissions(user)
scopeFor(user, resource)
```

Frontend hiding is not security; backend must enforce it.

## 5.8 Future Supabase

Recommended future tables:

```text
user_profiles
roles
permissions
role_permissions
user_permission_overrides
user_data_scopes
```

Supabase RLS must enforce own/team/all data access.

---

# 6. Employee / Salesperson Reports

This is a fundamental requirement.

The client described reports against a specific employee ID and also an all-employee summary. The later mobile app will add visits/plans/GPS, but the web ERP should already support reporting from the sales data it currently owns.

## 6.1 Keep current report engine

Current dev already correctly supports:

- From Date,
- To Date,
- server-side period filtering,
- real report tables,
- CSV export,
- TA/DA employee filtering.

Do not bring back the old ReportsCenter.

## 6.2 Add report

Place under:

```text
Reports → Sales & Collection → Salesperson Performance
```

Filters:

```text
From Date
To Date
Employee
Territory [optional/later]
```

Employee:

```text
All Sales Employees
Rafiq Ahmed
Shamima Sultana
...
```

## 6.3 Current-phase metrics

Use actual existing records:

- quotations created,
- quotation value,
- accepted quotations,
- conversion count/rate,
- orders placed,
- delivered sales,
- units delivered,
- collections received,
- customers handled,
- assigned-customer due,
- top customers,
- top products,
- discount totals where meaningful.

## 6.4 Future mobile metrics

When mobile data exists, extend the same report with:

- check-in/out,
- active days,
- monthly plans,
- daily plans,
- planned/completed visits,
- new leads,
- follow-ups,
- visit status/outcome,
- GPS compliance,
- target vs achievement.

Do not fake those fields now.

## 6.5 Printable individual report

```text
MIPRO HEALTHCARE CORPORATION
EMPLOYEE PERFORMANCE REPORT

Employee
Role
Territory
From / To

Summary
Quotations
Orders
Delivered Sales
Collections
Customers
Conversion

Quotation Details
Order/Delivery Details
Collection Details
Top Products
Top Customers

[future]
Plans / Visits / Leads / Follow-ups
```

## 6.6 All-employee comparison

| Employee | Quotes | Orders | Delivered Sales | Collections | Customers | Conversion |
| -------- | -----: | -----: | --------------: | ----------: | --------: | ---------: |

## 6.7 Report access

- Super Admin: all.
- Managing Director: all read/export.
- Sales Manager: team/all-sales.
- Sales Executive: own performance only.
- Accounts: collection/financial reports only as needed.

Sensitive landed cost/profit must never leak into a salesperson report unless explicitly granted.

---

# 7. Fix Sales Attribution

Before employee reports become authoritative, separate business ownership from who typed the transaction.

Recommended:

### Customer

```text
assignedSalesUserId
```

### Quotation / Order

```text
salesOwnerId
createdByUserId
```

### Delivery

```text
salesOwnerId      // inherited from order
dispatchedByUserId
```

### Collection

```text
salesOwnerId
collectedByUserId
postedByUserId
```

Reason: Accounts or a manager may post a collection on behalf of a salesperson. That must not change who owns the sale/customer relationship.

---

# 8. PDF / Document Viewer

The current Import Documents area is only metadata. It shows filenames but cannot actually open files.

Add a unified viewer.

## 8.1 Document model

Use a reusable record instead of an import-only filename:

```ts
type DocumentRecord = {
  id: string;
  entityType:
    | "import"
    | "import-cost"
    | "quotation"
    | "order"
    | "delivery"
    | "collection"
    | "expense";
  entityId: string;
  documentType: string;
  source: "UPLOADED" | "GENERATED";
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  storagePath?: string;
  previewUrl?: string;
  sensitive: boolean;
  notes?: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
};
```

## 8.2 Import documents

Support viewing:

- PO,
- PI,
- LC,
- TT/Swift,
- commercial invoice,
- packing list,
- BL,
- COA,
- CE,
- ISO,
- customs assessment,
- freight bill,
- insurance,
- C&F/port bills,
- other cost documents.

## 8.3 Cost attachments

Each cost line can have supporting PDFs:

```text
C&F Cost
Tk 120,000
Allocation: FOB Value

cf-bill.pdf   [View]
```

Prefer multiple attachments eventually, not only one `attachmentName`.

## 8.4 Generated documents

Keep the current `PrintPage`; it is now aligned with:

- MIPRO/LED identities,
- actual background images,
- A4 safe areas,
- digital/preprinted mode,
- quotation,
- Order Receiving Sheet,
- challan,
- receipt,
- landed-cost print.

Integrate those into the same document UX:

```text
[Preview]
[Print / Save PDF]
```

No need to rewrite the print engine.

## 8.5 Viewer component

Suggested:

```text
src/shared/documents/
  DocumentViewer.tsx
  DocumentList.tsx
  DocumentUpload.tsx
  DocumentBadge.tsx
```

A large modal/drawer is enough.

For prototype:

```html
<iframe>
<object>
```

is sufficient for PDF viewing. Do not add a heavy PDF library unless page thumbnails/search/annotation become necessary.

## 8.6 Mock vs real storage

### Now

- object URL for newly selected files,
- seeded static PDF URLs,
- Express metadata.

Clearly treat persistence as demo-only.

### Later

Use:

- Supabase Storage private bucket,
- `documents` table,
- signed URLs,
- RLS/authorization.

## 8.7 Document security

Document access follows the underlying entity.

Examples:

- sales employee cannot view secret landed-cost bills,
- cost attachment requires sensitive-cost permission,
- a user cannot open an import file if they cannot access that import,
- generated own quotation can be opened by its allowed sales user.

Never rely on an unprotected raw file URL.

---

# 9. AI: Restore the Capability, Not the Old Architecture

The previous simplification deferred AI too aggressively.

AI is supported by the original requirements, and the latest meeting explicitly expects smart FIFO/LIFO notifications.

Restore AI at the **frontend/service-contract level now**, without turning it into another giant module.

## 9.1 Floating AI Assistant

Restore it, rewritten for the current architecture.

Suggested:

```text
src/shared/ai/FloatingAIAssistant.tsx
```

Mount in `AppLayout` only after login.

Do not paste the old component unchanged because its old mock answers contain stale assumptions.

### UX

Collapsed:

```text
✨ Ask MIPRO AI
```

Bottom-right.

Expanded panel:

- current role,
- current context,
- conversation,
- source links,
- contextual suggested questions.

Responsive and lower z-index than critical modals.

## 9.2 Page context

Send:

```text
route
entityType
entityId
```

Examples:

### Import

- Explain current shipment stage.
- Which documents are missing?
- Explain this landed-cost allocation.

### Inventory

- Which batches need attention?
- Which lot should be issued first?
- Explain this FIFO warning.

### Sales

- Which customers need follow-up?
- Summarize this customer.
- Which quotations remain open?

### Reports

- Summarize this selected period.
- Compare salespeople.
- Which customers have the largest dues?

## 9.3 AI RBAC

AI must receive only data the current user is allowed to access.

Do not send all data and ask the model to hide it.

Sales Executive AI context:

- own customers,
- own quotations/orders,
- own collections,
- allowed stock visibility.

Never:

- confidential landed cost,
- supplier FOB if restricted,
- another rep's customer records,
- hidden profit.

## 9.4 AI service boundary

Add:

```text
src/shared/ai/aiService.ts
```

Mock endpoints:

```text
POST /api/ai/chat
POST /api/ai/document-extract
GET  /api/ai/insights
GET  /api/ai/recommendations
POST /api/ai/recommendations/:id/dismiss
```

Later replace internals with LangChain/LangGraph without changing UI.

## 9.5 AI features to integrate

### A. Import Document Extraction

Inside:

```text
Imports → Documents
```

Flow:

```text
Upload/choose PI.pdf
→ Preview
→ Extract Fields
→ show extracted supplier/PI/date/currency/products/qty/FOB/CBM
→ user reviews
→ Apply Selected Fields
```

Never silently overwrite records.

### B. Landed-cost explanation

`calculateLandedCost()` remains deterministic.

AI only:

- explains,
- summarizes,
- flags unusual ratios,
- answers questions.

AI must never be the source of truth for cost math.

### C. Inventory Smart Alerts

FIFO remains deterministic.

AI/smart layer:

- surfaces old/new lot issue,
- expiry risk,
- slow-moving batch,
- explanation/recommended action.

### D. Collection/follow-up risk

Rule-based now, AI explanation later:

- large due,
- partial collections,
- accepted quote without order,
- order waiting for delivery.

### E. Management Insight

Dashboard/Reports:

```text
Sales ...
Collections ...
Imports requiring attention ...
Batches requiring attention ...
```

Sensitive insight only for authorized roles.

## 9.6 AI Recommendation Cards

Rebuild the useful pattern:

```text
Type
Severity
Title
Reason
Sources
Recommended action
Status
```

Actions:

```text
View Source
Dismiss
Review Draft
```

Never let AI bypass normal finalization/posting/permission workflows.

## 9.7 Do not restore AI Command Center as a sidebar module

Use:

```text
Floating Assistant
+ contextual AI actions
+ Dashboard/Reports insight cards
```

An optional expanded assistant/history view can exist later, but not as another major module.

---

# 10. HishabPati UX lessons remain useful

The client currently uses HishabPati.

Do not clone its limitations.

Borrow:

- quick transaction entry,
- obvious Add buttons,
- easy party/customer selection,
- visible dues,
- understandable cash/bank language,
- minimal steps,
- Bangladeshi business familiarity,
- printable/exportable reports,
- mobile-friendly forms.

The target feeling should be:

> Familiar and simple like the current bookkeeping tool, but capable of import costing, batch/expiry traceability, controlled sales access, and management reporting that HishabPati cannot provide.

This is another reason to keep the seven-area navigation.

---

# 11. Main-area impact

## Dashboard

Add:

- Smart Alerts,
- management AI summary,
- employee/team performance summary for managers.

## Imports

Enhance existing workspace with:

- actual PDF viewer,
- cost attachments,
- AI extraction,
- missing-document suggestions,
- cost explanation.

## Inventory

Add:

- Smart Alerts,
- expiry/FIFO insight,
- no separate AI page.

## Sales

Keep current connected flow.

Enhance:

- salesperson attribution,
- follow-up/risk suggestions,
- generated-document preview links.

Do not build full mobile CRM here.

## Expenses & Accounts

Add attachment viewer and use user/employee references instead of uncontrolled free text where practical.

## Reports

Add:

- salesperson performance,
- employee selector,
- From/To,
- individual print,
- all-employee comparison,
- AI period summary.

## Settings

Evolve to:

```text
Users & Access
Role Templates
Effective Access Preview
Data Scope
Activity
```

without adding top-level Users/Roles navigation.

---

# 12. Suggested types

```ts
type DataScope = "OWN" | "TEAM" | "ALL";
type PermissionDecision = "ALLOW" | "DENY";

type UserPermissionOverride = {
  permission: PermissionKey;
  action: PermissionAction;
  decision: PermissionDecision;
};

type UserDataScopes = {
  sales?: DataScope;
  customers?: DataScope;
  reports?: DataScope;
};
```

Consider extending `PermissionKey` with:

```text
documents
ai
```

Keep sensitive costing/profit as capabilities.

---

# 13. API additions

## Access

```text
GET  /api/settings/role-templates
GET  /api/settings/users/:id/effective-access
PATCH /api/settings/users/:id/access
```

## Reports

Keep:

```text
GET /api/reports?from=&to=
```

Extend with `employeeId`, or add one focused salesperson endpoint. Do not create redundant APIs.

## Documents

```text
GET  /api/documents?entityType=&entityId=
POST /api/documents
GET  /api/documents/:id
DELETE /api/documents/:id
```

## AI

```text
POST /api/ai/chat
POST /api/ai/document-extract
GET  /api/ai/insights
GET  /api/ai/recommendations
```

---

# 14. Suggested components

```text
src/shared/access/
  EffectiveAccessPreview.tsx
  RoleTemplateMatrix.tsx
  UserAccessEditor.tsx

src/shared/documents/
  DocumentList.tsx
  DocumentViewer.tsx
  DocumentUpload.tsx
  DocumentBadge.tsx

src/shared/ai/
  FloatingAIAssistant.tsx
  AIRecommendationCard.tsx
  AIInsightCard.tsx
  AIDocumentExtractPanel.tsx
  aiService.ts

src/domains/reports/
  EmployeePerformanceReport.tsx
```

Do not recreate the old generic component hierarchy.

---

# 15. Audit / Activity

Do not restore a full Security sidebar module.

Keep audit under Reports/Settings.

Show relevant user activity:

- login activity later with real auth,
- permission changes,
- cost finalization/reopen,
- FIFO override,
- quotation/order actions,
- collection posting/reversal,
- document upload/delete,
- AI-extracted fields applied.

Every access change should create an audit event.

---

# 16. Mobile sales requirement

Preserve but do not fake on web:

- employee login,
- GPS check-in/out,
- customer visit location/time,
- monthly plan,
- daily plan,
- visit feedback,
- leads,
- follow-ups,
- quotation/order/collection,
- employee monitoring.

The current web schema/report design should be compatible so mobile data can plug in later.

Do not restore the old web `MobileSalesControlPage`.

---

# 17. Still keep these removed/deferred

Do not re-add simply because old commits had them:

- huge generic module menu,
- separate PO/PI/LC/Shipment/Customs pages,
- full HR/payroll,
- leave/loan/increment,
- fleet/vehicle suite,
- multi-company selector,
- full GL/trial balance before confirmation,
- mandatory invoice before confirmation,
- universal VAT/AIT formula,
- automated customs duty engine,
- eight-card decorative AI Command Center,
- vector search without a real need,
- hardcoded report charts,
- fake visits/GPS data.

---

# 18. Priority backlog

## P0 — fundamental reintegration

### Access

1. Central effective-permission resolver.
2. Persisted user overrides.
3. User data scopes.
4. Compact Role Templates view.
5. Effective Access Preview.
6. Backend enforcement.

### Employee reports

7. Salesperson Performance.
8. Employee + From/To filter.
9. All-person comparison.
10. Printable individual report.
11. Sales attribution cleanup.

### Documents

12. Unified DocumentRecord.
13. PDF viewer.
14. Import document View action.
15. Cost attachment viewer.
16. Generated preview integration.
17. Document authorization.

### AI

18. Floating AI Assistant.
19. Context- and role-aware mock API.
20. Typed AI boundary.
21. Contextual quick prompts.
22. Rule-based smart insights.

## P1 — intelligence

23. AI import-document extraction review/apply.
24. AI recommendation cards.
25. Inventory smart alert feed.
26. Collection/follow-up risk.
27. MD/Super Admin management insights.
28. Source links to ERP records.
29. Better access/activity audit.

## P2 — mobile/real AI

30. Monthly/daily plans.
31. Visit logs.
32. Leads/follow-ups.
33. GPS/attendance.
34. richer employee performance.
35. LangChain/LangGraph orchestration.
36. vector/document retrieval only where justified.

---

# 19. Implementation order

## Phase 1 — Authorization foundation

Implement user overrides/scopes and one backend permission resolver first.

## Phase 2 — Documents

Add normalized document metadata, PDF viewer, cost attachments, generated-preview links and permission checks.

## Phase 3 — Employee reports

Clean attribution, add salesperson report, employee filter, print and CSV.

## Phase 4 — AI shell

Restore floating assistant with contextual role-safe mock answers and Smart Alerts.

## Phase 5 — AI workflow integration

Add document extraction/review, management insights and collection risk.

## Phase 6 — UAT

Test with every role and realistic client scenarios.

---

# 20. Required tests

## RBAC

- Sales Executive cannot access another rep's customer.
- User override grant works.
- Explicit deny wins.
- Sensitive costs remain hidden without capability.
- Backend direct calls are blocked.
- effective nav/actions match backend.

## Reports

- From/To excludes records outside period.
- Employee filter limits data correctly.
- All Employees aggregates correctly.
- Delivery sales belong to correct sales owner.
- Sales Executive cannot request another employee's report.

## Documents

- authorized file opens.
- unauthorized file returns 403.
- sensitive cost attachment remains protected.
- import file stays linked to correct import.
- generated document opens correct record.

## AI

- Sales Executive AI never receives sensitive cost.
- Sales Executive AI remains own-data scoped.
- assistant receives current entity context.
- extraction cannot apply fields without user review.
- AI cannot bypass normal posting endpoints.

---

# 21. UAT scenarios

### A. Create and configure user

Create Sales Executive → assign territory → OWN scope → grant own-report export → login → verify only own data.

### B. Special access

Give Import Officer Inventory View but not Sensitive Cost → verify Inventory is visible and costing remains hidden.

### C. Employee report

Sales Manager → Reports → From/To → select Rafiq → print individual report → select All Employees → compare.

### D. PDF

Open LC/PI/freight/customs document → viewer opens → unauthorized sales user cannot open direct document link.

### E. Generated print

Preview MIPRO digital quotation → preprinted mode → Order Receiving Sheet → challan → receipt.

### F. AI

Open an import → ask current stage/missing docs → authorized costing user can ask allocation question → Sales Executive is redacted.

### G. FIFO smart alert

Old lot exists → delivery uses FIFO allocation → Smart Alert explains → any override still uses normal permission/reason flow.

---

# 22. Definition of “simple”

Simple does not mean few capabilities.

It means:

- one place for one workflow,
- no duplicate entry,
- no unnecessary navigation,
- advanced controls only where needed,
- contextual documents,
- contextual AI,
- reports from real records,
- role defaults plus exceptions,
- progressive disclosure.

Good:

```text
Imports
  Commercial & Products
  LC/TT & Shipment
  Documents
  Costs
  Landed Cost
  Receiving
```

Bad:

```text
PO tab
PI tab
LC tab
Shipment tab
Customs tab
Cost tab
GRN tab
Documents tab
```

Good access:

```text
Role default + a few explicit exceptions
```

Bad access:

```text
120 unrelated per-field toggles
```

Good AI:

```text
Ask here
Explain this record
Extract this PI
Warn about this stock
```

Bad AI:

```text
Eight decorative AI pages with hardcoded answers
```

---

# 23. Final target

The web ERP should be explainable as:

> MIPRO tracks each shipment from PO through PI and LC/TT, keeps shipment documents and actual costs together, calculates accurate product-wise landed cost, receives medical products by lot/batch/MFG/expiry, controls FIFO dispatch, connects quotations/orders/challans/collections, tracks customer dues and operating expenses, and gives management period- and employee-wise reports. Super Admin controls role defaults and user-specific access. Uploaded and generated documents can be viewed directly, while a role-aware AI assistant helps explain records, extract import documents, surface stock/collection risks and summarize management information without bypassing human approval.

That is the desired **simple but complete** system.

---

# 24. Exact next milestone

### Administration + Reporting + Documents + AI Reintegration

Deliver:

1. Settings → Users & Access improvements.
2. Role templates + user-specific overrides/scopes.
3. Effective permission enforcement.
4. Salesperson Performance report with From/To.
5. Single-person and all-person report.
6. Unified PDF/document viewer.
7. Import/cost attachment viewing.
8. Generated document preview integration.
9. Floating MIPRO AI assistant.
10. Context-aware role-safe mock AI.
11. Smart recommendation card pattern.
12. Import document extraction UI/service contract.

**Do this without changing the seven-area main navigation.**

---

# 25. Agent guardrails

- Work from `dev`, not `main`.
- Inspect current code before replacing anything.
- Do not cherry-pick old feature files blindly.
- Treat old code as reference only.
- Preserve corrected import/costing/FIFO/report/print logic.
- Use current domain/service boundaries.
- Keep server authorization authoritative.
- Do not invent unconfirmed invoice/VAT/accounting rules.
- Never expose confidential landed cost via reports, documents or AI.
- Avoid new top-level tabs unless a workflow truly cannot fit contextually.
- Keep mock APIs replaceable by Supabase.
- Keep AI replaceable by LangChain/LangGraph.
- Keep file storage replaceable by Supabase Storage.
- Add focused tests for every access/scope change.

---

**End of plan**
