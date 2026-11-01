# MIPRO ERP — Client Review Marketing Management Update Plan

**Date:** 26 August 2026  
**Repository:** `AN-SWAPNIL/Medical_Supplier_ERP`  
**Working branch:** `dev`  
**Purpose:** Update the current plan after re-evaluating the latest client review, with special focus on **discoverability, fewer clicks, daily marketing activity, practical report generation, and reuse of features that already exist**.

---

## Implementation Clarifications

The current frontend-first approval build implements the P0 and P1 web scope in this
plan. P2 items require production infrastructure and remain visibly deferred: durable
Supabase persistence, realtime subscriptions, background mobile GPS, offline sync,
push notifications, scheduled reminders, production media storage, and LangGraph.

The following rules are authoritative for this implementation:

- Business dates use `Asia/Dhaka`.
- `OVERDUE` is derived from `dueAt` and pending status; it is not independently stored.
- Employee identity for submitted activity and expense `Entered By` comes from the
  authenticated session. Request payloads cannot impersonate another employee.
- Marketing scope is separate from feature access: Sales Executive = self, Sales
  Manager = active sales team, Managing Director and Super Admin = all.
- Funnel progress is monotonic and transaction-backed. Manual activity cannot move a
  lead backwards or claim quotation, order, delivery, or payment stages.
- Official score and target actuals use authoritative ERP records only. Manual notes
  never create transaction points.
- Field tracking in this web build is foreground/demo tracking. Background mobile GPS
  is a later mobile-app concern.
- "Active employees" means employees with a live or recent active tracking session;
  the UI labels demo location data clearly.

These clarifications resolve implementation ambiguity without changing the client's
requested workflow or navigation.

# 1. Executive Decision

The client review should **not** be interpreted as “build everything in the pasted list.”

The client explicitly said:

> Ignore fields/features that are already available and add only what is missing.

That is the correct implementation rule.

The current ERP already has important foundations:

- employee/user IDs,
- user creation/editing,
- flexible role/access control,
- delegated employee management,
- searchable employee selection,
- GPS / Field Team map,
- route and visit history,
- Customers,
- Quotations,
- Orders,
- Deliveries,
- Collections,
- salesperson performance reports,
- From/To report filtering,
- CSV / Print,
- AI / Smart Insights,
- document viewer.

The genuinely missing business layer is:

```text
Employee
→ Daily Marketing Activity
→ Lead
→ Visit / Contact
→ Follow-up
→ Presentation / Sample / Negotiation
→ Quotation
→ Order
→ Delivery
→ Collection
→ Target / Activity / Performance
```

The most important UX correction is:

> **Do not bury this workflow behind several nested pages.**

The client should be able to open **Sales → Marketing** and immediately see today's activity, quick actions, follow-ups, funnel, employee status, target progress, Field Team shortcut, and report shortcut.

---

# 2. Exact Client Complaints This Plan Must Resolve

## Complaint A

> “The Marketing Team should report all their daily activities from the field through their respective user IDs. This tab is currently missing.”

### Resolution

Add one obvious Sales tab:

```text
Sales → Marketing
```

The default Marketing screen itself becomes the **Daily / Live Marketing Activity hub**.

No extra click is required to reach “Live Activity.”

---

## Complaint B

> “Several ways report generating strategies missing.”

### Resolution

Do **not** build a complicated BI/report designer.

Enhance the existing Reports engine with:

- Today / Yesterday / Week / Month presets,
- Custom From/To,
- Employee,
- Territory,
- Activity Type,
- Customer / Lead,
- Verification,
- Status,
- Summary / Detail,
- Group By,
- Print / Save PDF,
- CSV,
- quick report presets.

Also add a **Generate Report** button directly inside Marketing so the user does not need to navigate away just to find the report.

---

## Complaint C

> Add more expense categories.

### Resolution

Keep the current dynamic category system and add more sensible defaults.

No new category architecture is needed.

---

## Complaint D

> Expense by person name auto-linked with employee list / office / warehouse.

### Resolution

Replace free-text employee attribution with:

```text
Expense For
├── Employee
├── Office
├── Warehouse
└── Company / General
```

Employee uses the existing searchable EmployeePicker.

---

# 3. What Is Already There — Do Not Rebuild

## Employee administration

Keep:

```text
Settings → Users & Capabilities
```

This already answers:

```text
Who is the employee?
What role?
What access?
What territory?
Is the account active?
```

Do not add another “Employee Management” main module.

---

## Flexible access control

Keep the current:

```text
Role Defaults
+
Per-User ALLOW / DENY Overrides
+
Sensitive Capabilities
```

Do not rebuild RBAC.

Only add a new normal permission area:

```text
marketing
```

so Super Admin can grant or deny Marketing access using the same architecture.

---

## Field Team

Keep the current Field Team implementation:

- map,
- employee markers,
- territory/status filters,
- live/recent/stale/offline states,
- route history,
- visit timeline,
- employee picker,
- role scope.

Do not rewrite it.

It should simply become easier to reach from the Marketing hub.

---

## Sales transactions

Keep:

```text
Customer
→ Quotation
→ Order
→ Delivery
→ Collection
```

Marketing must connect into these records, not recreate them.

---

## Existing employee report

Keep and extend current Salesperson Performance.

Do not create a second competing employee-performance system.

---

# 4. Final Navigation

Keep the main ERP sidebar unchanged:

```text
Dashboard
Imports
Inventory
Sales
Expenses & Accounts
Reports
Settings
```

Inside Sales:

```text
Sales
├── Customers
├── Marketing
├── Quotations & Orders
├── Deliveries
└── Collections
```

The existing Field Team should move logically under Marketing instead of remaining a separate peer Sales tab.

---

# 5. Marketing Must Be a One-Click Hub

When user clicks:

```text
Sales → Marketing
```

the default screen should already show the most important information.

Do **not** make the first screen another navigation menu.

Recommended layout:

```text
Sales → Marketing
────────────────────────────────────────────────────────

TODAY'S MARKETING

Active Employees     Visits       New Leads     Follow-ups
12                   47           31            68

Quotations           Orders       Sales         Collection
18                   7            Tk ...        Tk ...

[+ Report Activity] [+ New Lead] [+ Follow-up] [Check In/Out]
[Generate Report]

────────────────────────────────────────────────────────
LIVE / DAILY ACTIVITY

09:05  Rafiq    Check In
09:32  Rafiq    Customer Visit        Popular Hospital
10:10  Rafiq    Product Presentation  Dialyzer 1.7H
10:35  Rafiq    Follow-up Completed
11:02  Shamima  New Lead              ABC Dialysis Centre
12:16  Rafiq    Quotation Submitted   QTN-2026-018
14:40  Rafiq    Sample Delivered      Blood Line
16:05  Rafiq    Payment Collected     Tk 75,000

────────────────────────────────────────────────────────
NEEDS ATTENTION

5 follow-ups due today
3 overdue follow-ups
4 leads with no recent contact
2 unverified visits

────────────────────────────────────────────────────────
MARKETING FUNNEL

New 18 → Contacted 14 → Interested 10 → Presentation 8
→ Sample 5 → Quotation 6 → Negotiation 4 → Order 3

────────────────────────────────────────────────────────
FIELD TEAM

Active 8 · Recent 2 · Offline 1 · Visits Today 31

[Open Live Map]

────────────────────────────────────────────────────────
TEAM PERFORMANCE

Rafiq       Target 72%       Score 180
Shamima     Target 81%       Score 205
Sabbir      Target 64%       Score 156
```

This is the main usability improvement.

---

# 6. Do Not Make Users Navigate for Common Actions

Frequently repeated actions should open:

- modal,
- side drawer,
- popover,
- inline panel,

not another full page.

Example:

```text
+ Report Activity
```

opens:

```text
Report Marketing Activity

Activity
[Customer Contact ▼]

Customer / Lead
[Search...]

Product
[Search...]

Purpose
[...]

Outcome / Remarks
[...]

Next Follow-up
[date/time]

Location
✓ Captured

[Submit Activity]
```

After save:

- drawer closes,
- Live Activity feed refreshes,
- relevant Lead/Follow-up updates.

---

# 7. Quick Actions

Marketing page should provide:

```text
+ Report Activity
+ New Lead
+ Follow-up
Check In / Out
Generate Report
```

Do not require:

```text
Sales
→ Marketing
→ Activity
→ New Activity
→ Form
```

for normal daily work.

---

# 8. Employee-Specific UX

## Sales Executive

Marketing should become personalized:

```text
My Marketing
```

Top:

```text
MY DAY

Checked In      9:03 AM
Visits          5
New Leads       3
Follow-ups      7 / 9
Quotes          2
Orders          1
Collection      Tk ...
Target          72%
```

Quick actions:

```text
+ New Lead
+ Log Contact
+ Customer Visit
+ Presentation
+ Sample Delivered
+ Follow-up
+ Negotiation Update
```

Then show:

```text
Today's Plan
Due Follow-ups
My Activity Timeline
My Target
```

The Sales Executive should not see team-wide data.

---

# 9. Management UX

Super Admin / MD / Sales Manager should see:

```text
Today's Marketing
Live Activity
Follow-ups Needing Attention
Marketing Funnel
Field Team Snapshot
Team Performance
```

Employee search should use the existing EmployeePicker.

---

# 10. Employee Snapshot Drawer

Any employee name shown in Marketing should be clickable.

Example:

```text
Rafiq Ahmed
SE-001
```

opens:

```text
Rafiq Ahmed
Sales Executive
Dhaka North

Today
Visits           7
New Leads        3
Follow-ups       6
Quotations       2
Orders           1
Collection       Tk 75,000

Target           72%
Activity Score   180

[View Daily Activity]
[View Field Map]
[Full Performance Report]
```

This reduces “where do I go?” confusion.

---

# 11. Cross-Link Everything

From Marketing employee:

```text
Activity
Map
Performance Report
```

From Field Team employee:

```text
Today's Marketing
Performance Report
```

From Employee Performance:

```text
View Daily Activity
View Field Activity
```

From Lead:

```text
Follow-up
Visit
Create Quotation
```

From Customer:

```text
Marketing History
Quotation
Collection
```

The architecture can remain modular while the UX feels connected.

---

# 12. Marketing Activity — Manual vs Automatic

Do not make employees duplicate existing ERP transactions.

## Manual activities

```text
New Lead
Customer Contact
Customer Visit
Product Presentation
Sample Delivered
Follow-up
Negotiation Update
General Marketing Note
```

## Automatic/system-derived activities

```text
Check-in
Check-out
Quotation Submitted
Order Received
Delivery
Payment Collected
Lead Converted to Customer
```

Example:

A quotation is created.

The activity feed automatically receives:

```text
Quotation Submitted
QTN-2026-018
```

No second manual report.

---

# 13. Marketing Activity Model

Suggested:

```ts
type MarketingActivityType =
  | "LEAD_CREATED"
  | "CUSTOMER_CONTACT"
  | "CUSTOMER_VISIT"
  | "PRODUCT_PRESENTATION"
  | "SAMPLE_DELIVERED"
  | "FOLLOW_UP_COMPLETED"
  | "NEGOTIATION_UPDATE"
  | "GENERAL_NOTE";

type MarketingActivity = {
  id: string;

  userId: string;
  employeeCode: string;

  activityType: MarketingActivityType;

  occurredAt: string;
  submittedAt: string;

  leadId?: string;
  customerId?: string;

  productIds?: string[];

  purpose?: string;
  remarks?: string;
  nextFollowUpAt?: string;

  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;

  verification:
    | "SYSTEM_VERIFIED"
    | "GPS_VERIFIED"
    | "MANUAL"
    | "UNVERIFIED";

  attachments?: DocumentRecord[];

  createdByUserId: string;
};
```

---

# 14. Employee Identity Must Come From Login Session

The client wants activity submitted from each employee's own user ID.

Therefore server determines:

```text
userId
employeeCode
createdByUserId
```

from authentication.

Do not trust arbitrary employee ID from request payload.

---

# 15. Lead Management

Use a real Lead entity.

Do not turn every prospect into a financial Customer immediately.

Suggested:

```ts
type MarketingLead = {
  id: string;
  leadNumber: string;

  organizationName: string;

  organizationType:
    | "Hospital"
    | "Clinic"
    | "Dealer"
    | "Pharmacy"
    | "Other";

  contactPerson?: string;

  contactRole?:
    | "Doctor"
    | "Procurement"
    | "Owner"
    | "Management"
    | "Other";

  mobile: string;
  email?: string;

  address?: string;
  latitude?: number;
  longitude?: number;

  interestedProductIds: string[];

  leadSource: string;
  assignedUserId: string;

  stage: MarketingLeadStage;

  nextFollowUpAt?: string;
  lastContactAt?: string;

  customerId?: string;
  lostReason?: string;

  notes?: string;

  createdAt: string;
  updatedAt: string;
};
```

---

# 16. Normalize the Medical Marketing Funnel

The client wrote:

```text
Lead
→ Hospital/Clinic
→ Doctor/Procurement
→ Product Presentation
→ Sample
→ Quotation
→ Negotiation
→ PO
→ Delivery
→ Payment
```

Correct model:

## Organization Type

```text
Hospital
Clinic
Dealer
Pharmacy
```

## Contact Role

```text
Doctor
Procurement
Owner
Management
```

## Funnel Stage

```text
NEW
CONTACTED
INTERESTED
PRESENTATION
SAMPLE
QUOTATION
NEGOTIATION
ORDER
DELIVERED
PAYMENT
LOST
```

---

# 17. Funnel Should Auto-Progress

Examples:

```text
Lead created
→ NEW

Contact logged
→ CONTACTED

Presentation
→ PRESENTATION

Sample
→ SAMPLE

ERP Quotation created
→ QUOTATION

Negotiation update
→ NEGOTIATION

Quotation converted to Order
→ ORDER

Delivery posted
→ DELIVERED

Relevant Collection / payment state
→ PAYMENT
```

Do not maintain contradictory manual stage values when the system already knows the transaction state.

---

# 18. Lead → Customer

Add:

```text
[Convert to Customer]
```

Preserve:

- assigned employee,
- contact,
- organization,
- product interest,
- lead history.

Lead remains for history.

Quotation continues using the existing ERP Quotation workflow.

---

# 19. Follow-Up System

Follow-up views:

```text
Today
Overdue
Upcoming
Completed
```

Suggested:

```ts
type MarketingFollowUp = {
  id: string;

  assignedUserId: string;

  leadId?: string;
  customerId?: string;

  dueAt: string;
  purpose: string;

  status:
    | "PENDING"
    | "COMPLETED"
    | "OVERDUE"
    | "CANCELLED";

  completedAt?: string;
  outcome?: string;
  nextFollowUpAt?: string;

  createdAt: string;
};
```

---

# 20. Follow-Up Should Be Visible on the Main Marketing Screen

Do not require navigation for basic review.

Example:

```text
FOLLOW-UPS

Today      8
Overdue    3
Upcoming  14
```

Click:

```text
Overdue 3
```

opens a drawer:

```text
Kuwait Moitri Hospital
Confirm Dialyzer quotation
Due: Yesterday 3:00 PM

[Complete]
[Reschedule]
[Open Customer]
```

---

# 21. Follow-Up Rules Are Deterministic

```text
Today:
due date = today

Overdue:
dueAt < now
AND status = PENDING

No Recent Contact:
last meaningful interaction > configured threshold
```

AI can summarize or prioritize.

AI does not decide overdue status.

---

# 22. Daily Plan

Suggested:

```ts
type DailyMarketingPlan = {
  id: string;
  userId: string;
  date: string;

  plannedVisits: Array<{
    customerId?: string;
    leadId?: string;
    plannedTime?: string;
    purpose: string;
  }>;

  notes?: string;

  status:
    | "DRAFT"
    | "SUBMITTED"
    | "COMPLETED";
};
```

Show today's plan directly on the Sales Executive Marketing screen.

---

# 23. Monthly Plan

Keep lightweight:

```text
Month
Employee
Territory / Focus Area
Priority Customers / Leads
Product Focus
Planned Activities
Notes
```

No project-management module.

---

# 24. Monthly Targets

Suggested:

```ts
type EmployeeMarketingTarget = {
  id: string;
  userId: string;
  month: string;

  salesTargetBdt: string;
  newCustomerTarget: number;
  visitTarget: number;
  collectionTargetBdt: string;

  createdByUserId: string;
  createdAt: string;
};
```

---

# 25. Target vs Actual

Use system data.

Recommended:

```text
Sales Actual
= Delivered Sales

Collection Actual
= Posted Collections

Visit Actual
= Completed / verified visits

New Customer Actual
= Qualified / converted new customers
```

One decision to confirm later:

```text
Sales Target Basis
□ Delivered Sales — recommended
□ Order Received Value
```

---

# 26. Target UI

```text
Rafiq Ahmed — August

Sales
Tk 14.5L / Tk 20L
72.5%

Visits
82 / 100
82%

New Customers
38 / 50
76%

Collection
Tk 11.2L / Tk 15L
74.7%
```

---

# 27. Activity Score

Use client's scoring example as configurable defaults:

| Activity | Initial score |
|---|---:|
| New qualified customer | 5 |
| Verified customer visit | 10 |
| Qualified lead | 10 |
| Quotation submitted | 15 |
| Order received | 30 |
| Payment collected | 20 |
| Follow-up completed | 5 |

---

# 28. Prevent Score Gaming

Official scored events come from authoritative records.

Examples:

```text
Verified FieldVisit
→ Visit score

Real Quotation
→ Quote score

Real SalesOrder
→ Order score

Real Collection
→ Collection score
```

Do not allow manual “Quotation Submitted” entry to generate points.

---

# 29. Score Configuration

Add compact:

```text
Settings → Business Setup → Marketing Score Rules
```

Super Admin may change weights.

No new Settings module.

---

# 30. Field Visit Verification

Extend current FieldVisit with:

```text
Customer / Lead
GPS Check-in
Check-in Time
GPS Check-out
Check-out Time
Meeting Purpose
Products Discussed
Outcome
Next Follow-up
Remarks
Optional Photo
Optional Signature
```

---

# 31. Verification States

```text
SYSTEM_VERIFIED
GPS_VERIFIED
MANUAL
UNVERIFIED
```

Do not silently mark a field visit verified if GPS is missing.

---

# 32. GPS / Customer Distance

If customer/lead coordinates exist:

```text
Customer saved location
vs
Employee check-in
```

show:

```text
Check-in distance: 42 m
```

If far:

```text
Location mismatch warning
```

Do not automatically reject; GPS can be inaccurate.

---

# 33. Late Submission Indicator

Store:

```text
occurredAt
submittedAt
```

Example:

```text
Occurred: 10:00 AM
Submitted: 7:30 PM

Submitted 9h 30m later
```

This helps review suspicious reports without accusing employees automatically.

---

# 34. Reuse Existing Document System

Extend DocumentEntityType for:

```text
marketing-activity
field-visit
lead
```

Optional evidence:

```text
Visit Photo
Customer Signature
Sample Handover Evidence
```

Reuse current viewer/upload.

---

# 35. Field Team Must Be One Click Away

Main Marketing page:

```text
FIELD TEAM

Active 8
Recent 2
Offline 1
Visits Today 31

[Open Live Map]
```

Open existing Field Team directly.

Do not rebuild the map.

---

# 36. Dashboard Shortcut

Management Dashboard:

```text
TODAY'S MARKETING

Active Employees   12
Visits             47
New Leads          31
Follow-ups         68
Quotations         18
Orders              7
Collection         Tk X

[Open Marketing]
```

Sales Executive dashboard:

```text
MY DAY

Today's Plan
3 visits remaining

Follow-ups
2 overdue

Target
72%

[Report Activity]
```

---

# 37. Reports — Final Strategy

Keep Reports as the canonical historical reporting area.

But do not force users to navigate there every time.

Marketing page gets:

```text
[Generate Report]
```

This opens a report drawer/preset selector.

---

# 38. Generate Report — Marketing Shortcut

Click:

```text
Generate Report
```

show:

```text
Quick Reports

Today's Team Activity
My Daily Activity
Weekly Marketing Summary
Employee Performance
Lead Funnel
Overdue Follow-ups
Target vs Actual
Verified Visits
```

Selecting one opens or runs the existing Reports engine with correct filters.

This solves the usability problem without duplicating reporting logic.

---

# 39. Marketing Report Builder — Practical, Not Generic

Recommended controls:

```text
Period
[Today ▼]

Employee
[All Employees ▼]

Territory
[All ▼]

Activity
[All ▼]

Customer / Lead
[All ▼]

Verification
[All ▼]

View
[Summary] [Detail]

Group By
[Employee ▼]

[Generate]
```

---

# 40. Period Presets

```text
Today
Yesterday
This Week
Last Week
This Month
Last Month
Custom
```

Custom uses existing From/To.

---

# 41. Group By

Only report-specific grouping:

```text
Employee
Date
Territory
Customer
Activity Type
Lead Stage
```

Expense reports additionally:

```text
Expense Category
Expense Owner
```

No generic SQL/report designer.

---

# 42. Summary and Detail

Example Summary:

| Employee | Visits | Leads | Follow-ups | Quotes | Orders | Collection | Score |
|---|---:|---:|---:|---:|---:|---:|---:|

Detail:

| Date | Time | Employee | Activity | Customer | Product | Verification | Remarks |
|---|---|---|---|---|---|---|---|

---

# 43. Report Outputs

Keep:

```text
On-screen
CSV
Print / Save PDF
```

Optional later:

```text
XLSX
```

---

# 44. Marketing Reports to Add

Under existing Reports:

```text
Daily Marketing Activity
Employee Marketing Performance
Lead Funnel
Follow-up Status
Target vs Actual
Activity Score
Visit Verification
```

Extend current Salesperson Performance with marketing metrics rather than creating another conflicting employee report.

---

# 45. Extend Employee Performance

Current sales metrics remain:

```text
Quotations
Orders
Delivered Sales
Collections
Customers
Conversion
Top Products
```

Add:

```text
Check-in / Check-out
Visits
Verified Visits
New Leads
Qualified Leads
Follow-ups
Overdue Follow-ups
Presentations
Samples
Activity Score
Target Progress
```

---

# 46. Expense Review Fix

Current dynamic category capability should remain.

Add more useful seed defaults:

```text
Office Entertainment
Administration
Stationery
Printing & Photocopy
Office Transport
Travel
TA
DA
Salary
Rent
Utilities
Internet & Telephone
Mobile / Communication
Courier
Fuel
Repair & Maintenance
Cleaning / Housekeeping
Marketing
Training
Staff Welfare
Professional / Legal
Regulatory / License
Bank Charges
Miscellaneous / Other
```

---

# 47. Expense For

Add:

```text
Expense For
```

with:

```text
Employee
Office
Warehouse
Company / General
```

---

# 48. Employee Expense Attribution

If:

```text
Expense For = Employee
```

show:

```text
Employee [EmployeePicker]
```

Auto-fill:

```text
Employee ID
Designation
Department
```

Store employee ID, not just name text.

---

# 49. Office / Warehouse Expense

Office:

```text
Head Office
```

Warehouse:

use existing Warehouse config.

Do not force employee selection for office/warehouse expense.

---

# 50. Entered By vs Expense For

Store separately.

```text
Entered By
= current authenticated user

Expense For
= employee / office / warehouse / company
```

---

# 51. TA/DA

For TA/DA:

```text
Employee required
```

Use EmployeePicker.

Remove free-text employee name.

---

# 52. Expense Reports

Add:

```text
Expense by Person
Expense by Office / Warehouse
Expense by Category
Monthly Expense
TA/DA by Employee
```

---

# 53. Preserve Landed-Cost Boundary

Do not add:

```text
Sea Freight
Customs Duty
C&F
Port Charges
Shipment Transport
```

to ordinary expense when they belong to an Import.

---

# 54. Employee / Marketing / Report Responsibility

Keep this conceptual separation.

## Settings → Users & Capabilities

```text
Who is Rafiq?
What role?
What access?
What territory?
Is account active?
```

## Sales → Marketing

```text
What is Rafiq doing today?
Which lead/customer?
What visit/follow-up?
Where and when?
What happens next?
```

## Reports

```text
What did Rafiq/team do
between Date A and Date B?
```

---

# 55. Marketing Permission

Add:

```ts
"marketing"
```

Recommended actions:

```text
view
create
edit
approve
export
```

Defaults:

```text
Super Admin     all
MD              view / approve / export
Sales Manager   view / create / edit / approve / export
Sales Executive view / create / edit own scope
```

Other roles only by Super Admin override.

---

# 56. Do Not Confuse Permission and Scope

```text
marketing:view
```

means feature access.

It does not mean all employee data.

Keep:

```text
Sales Executive → self
Sales Manager → team
MD / Super Admin → all
```

---

# 57. Suggested APIs

```text
GET  /api/marketing/dashboard

GET  /api/marketing/activities
POST /api/marketing/activities

GET  /api/marketing/leads
POST /api/marketing/leads
PATCH /api/marketing/leads/:id

GET  /api/marketing/follow-ups
POST /api/marketing/follow-ups
PATCH /api/marketing/follow-ups/:id

GET  /api/marketing/plans/daily
POST /api/marketing/plans/daily

GET  /api/marketing/plans/monthly
POST /api/marketing/plans/monthly

GET  /api/marketing/targets
POST /api/marketing/targets
PATCH /api/marketing/targets/:id

GET  /api/marketing/performance
```

---

# 58. Unified Activity Feed Service

Build feed from:

```text
Manual Marketing Activities
+
FieldVisit
+
Quotation
+
SalesOrder
+
Delivery
+
Collection
=
Unified Marketing Activity Feed
```

Do not duplicate authoritative records.

---

# 59. Safe Employee Directory

Add:

```text
GET /api/employees/directory
```

for:

- EmployeePicker,
- Expense attribution,
- targets,
- reports.

Return only:

```text
id
name
employeeCode
title
department
territory
status
```

Do not expose access/security details.

---

# 60. Public Website Inquiry → Lead

Optional useful integration:

```text
Website Inquiry
→ Qualified
→ Convert to Lead
→ Assign Employee
→ Follow-up
```

Do not auto-convert every inquiry.

---

# 61. AI

Keep current:

```text
Floating MIPRO AI
Smart Insights
```

Add Marketing context.

Examples:

```text
Who has overdue follow-ups today?
Summarize Rafiq's activity today.
Which leads have no contact for 14 days?
Who is below visit target?
Which leads are stuck in negotiation?
```

---

# 62. Marketing Smart Insights

Examples:

```text
5 overdue follow-ups
3 leads untouched for 14+ days
2 employees below 50% visit target
4 visits missing GPS
6 leads stuck in negotiation
```

Rules are deterministic.

AI explains/prioritizes.

---

# 63. AI Must Not Control Official Metrics

Official:

```text
Activity Score
Target Progress
Overdue Status
GPS Verification
Transaction-based Funnel Stage
```

must be deterministic.

AI can:

```text
summarize
explain
prioritize
recommend
```

---

# 64. Implementation Order

## Phase 1 — Client-visible expense fixes

1. Expand default categories.
2. Add Expense For.
3. Add Employee / Office / Warehouse / Company.
4. Reuse EmployeePicker.
5. Make TA/DA employee structured.
6. Add expense attribution reports.

---

## Phase 2 — Marketing core

1. Add `marketing` permission.
2. Add MarketingActivity.
3. Add MarketingLead.
4. Add MarketingFollowUp.
5. Add target model.
6. Add daily/monthly plan model.
7. Add score rules.
8. Seed realistic demo data.
9. Add APIs/service layer.

---

## Phase 3 — One-click Marketing Hub

Implement:

```text
Sales → Marketing
```

default page with:

- Today's Marketing KPIs,
- quick actions,
- Live Activity,
- Follow-up attention,
- Funnel,
- Field Team shortcut,
- Team/own performance,
- Generate Report.

This is the most important UX deliverable.

---

## Phase 4 — Workflow links

Connect:

```text
Lead
→ Customer
→ Quotation
→ Order
→ Delivery
→ Collection
```

Auto-create activity events.

Auto-progress funnel from authoritative transactions.

---

## Phase 5 — Reporting

Add:

- report presets,
- employee/territory/activity filters,
- summary/detail,
- grouping,
- Marketing reports,
- Extend Employee Performance.

---

## Phase 6 — Verification

Add:

- products discussed,
- next follow-up,
- remarks,
- optional photo/signature,
- distance warning,
- late-submission indicator.

---

## Phase 7 — Dashboard and AI

Add:

```text
Today's Marketing
[Open Marketing]
```

and Marketing Smart Insights.

---

# 65. P0

### Marketing

1. Visible Marketing tab inside Sales.
2. Default page = Daily / Live Marketing hub.
3. Quick activity actions.
4. Live activity feed.
5. Leads.
6. Follow-ups.
7. Follow-up Today / Overdue.
8. Marketing funnel.
9. Targets.
10. Target vs Actual.
11. Activity Score.
12. Existing Field Team one-click shortcut.

### Reports

13. Generate Report button on Marketing.
14. Today/Week/Month/Custom presets.
15. Employee filter.
16. Territory filter.
17. Activity filter.
18. Summary / Detail.
19. Group By.
20. Add Marketing reports.

### Expenses

21. More categories.
22. Expense For.
23. Employee auto-link.
24. Office/Warehouse attribution.
25. Expense reports.

---

# 66. P1

1. Daily plan.
2. Monthly plan.
3. Plan vs Actual.
4. Products discussed.
5. Next follow-up.
6. Photo/signature.
7. GPS/customer-distance warning.
8. Late-submission indicator.
9. Public inquiry → Lead.
10. Marketing Smart Insights.
11. Employee snapshot drawer.
12. Cross-links between Marketing / Map / Reports.

---

# 67. P2 / Production

1. Supabase persistence.
2. Supabase Realtime activity feed.
3. mobile background GPS.
4. offline mobile sync.
5. push follow-up reminders.
6. real media storage.
7. notification scheduling.
8. configurable no-contact threshold.
9. LangChain/LangGraph marketing intelligence.

---

# 68. UAT — Client's Exact Missing Tab

1. Login as Sales Executive.
2. Open Sales.
3. Click **Marketing**.
4. Immediately see today's activity.
5. Click `+ Report Activity`.
6. Submit customer visit/presentation.
7. Activity appears instantly.
8. Create quotation.
9. Quotation appears automatically in activity feed.
10. No duplicate manual quotation report.

If this works, the client's “Marketing Activity / Daily Report tab is missing” complaint is directly resolved.

---

# 69. UAT — Manager

1. Login Sales Manager.
2. Sales → Marketing.
3. Without extra navigation see:
   - Active Employees,
   - Visits,
   - Leads,
   - Follow-ups,
   - Quotes,
   - Orders,
   - Collection.
4. Filter employee.
5. Open employee snapshot.
6. Click Field Map.
7. Return to Marketing.
8. Click Full Performance Report.
9. Click Generate Report.
10. Generate Today's Team Activity.

No long navigation chain.

---

# 70. UAT — Report Strategies

1. Marketing → Generate Report.
2. Choose Today's Team Activity.
3. Generate.
4. Choose Monthly Employee Performance.
5. Search employee.
6. Generate.
7. Change View → Detail.
8. Group By → Date.
9. Print / Save PDF.
10. Export CSV.

This directly addresses “Several ways report generating strategies missing.”

---

# 71. UAT — Lead / Follow-up

1. Add Lead.
2. Assign employee.
3. Schedule follow-up.
4. Follow-up appears under Today when due.
5. Becomes Overdue when missed.
6. Complete.
7. Create next follow-up.
8. Create quotation.
9. Funnel advances automatically.

---

# 72. UAT — Expense

1. Post Expense.
2. Select Expense For = Employee.
3. Search Rafiq.
4. Post.
5. Expense by Person includes Rafiq.
6. Post Warehouse expense.
7. Expense by Warehouse shows it.
8. TA/DA requires structured employee selection.

---

# 73. Guardrails

Do not:

- add Employee Management to main sidebar,
- duplicate Users & Capabilities,
- create separate CRM application,
- add many Marketing subpages for routine actions,
- force users through several navigation levels,
- re-enter quotation/order/collection manually,
- make Funnel fully manual,
- make AI calculate official metrics,
- trust employee ID from request body,
- mark missing-GPS visit verified,
- expose team data to ordinary Sales Executive,
- build full commission/payroll now,
- build generic BI report designer,
- rewrite current Field Team,
- change current import/cost/FIFO workflows.

---

# 74. Final UX Principle

The ERP should follow:

> **One obvious place, one obvious action, and one-click links to related information.**

Users should not need to remember where a feature lives.

Examples:

```text
Want to report today's marketing work?
→ Sales → Marketing

Want to see a salesperson?
→ Click their name anywhere

Want the map?
→ Open Field Map from Marketing / employee card

Want the report?
→ Generate Report from Marketing

Want full historical reporting?
→ Reports

Want to change employee access?
→ Settings → Users & Capabilities
```

---

# 75. Final Responsibility Separation

## Settings

```text
Who is the employee?
What access do they have?
```

## Marketing

```text
What is the employee doing now/today?
```

## Reports

```text
What did they do/achieve over a period?
```

---

# 76. Final Business Chain

```text
Employee/User
    ↓
Check-in / GPS
    ↓
Daily Plan
    ↓
Marketing Activity
    ↓
Lead
    ↓
Follow-up
    ↓
Visit / Presentation / Sample
    ↓
Customer
    ↓
Quotation
    ↓
Order
    ↓
Delivery
    ↓
Collection
    ↓
Target / Activity Score / Performance
```

---

# 77. Exact Next Milestone

# **One-Click Marketing Hub + Practical Reports + Expense Attribution**

Deliver:

### Marketing
- prominent Sales → Marketing tab,
- default Daily / Live Activity hub,
- quick actions,
- lead/follow-up workflow,
- funnel,
- targets,
- activity score,
- current Field Team one click away.

### Reports
- Generate Report from Marketing,
- practical presets,
- filters,
- grouping,
- Summary / Detail,
- Print / CSV,
- expanded Employee Performance.

### Expenses
- more categories,
- Expense For,
- employee auto-link,
- office/warehouse attribution,
- person/unit reports.

### UX
- employee snapshot drawer,
- cross-links between Marketing, Map and Report,
- modal/drawer entry for common actions,
- avoid deep navigation.

### RBAC
- reuse current flexible access system,
- add `marketing` permission only.

### AI
- add Marketing insight/context only,
- no AI Command Center.

---

**End of Updated Plan**
