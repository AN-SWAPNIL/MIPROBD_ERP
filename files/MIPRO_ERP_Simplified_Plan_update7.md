# MIPRO ERP — Full System Simplification & Employee Hub Plan

**Date:** 26 August 2026  
**Repository:** `AN-SWAPNIL/Medical_Supplier_ERP`  
**Working branch:** `dev`  
**Baseline reviewed:** `1cc8cce93e3cf75a187e81a110d814bcb630a59b`  
**Baseline feature:** `feat: implement update6 marketing operations`

---

# 1. Purpose

This plan is the next UX / information-architecture refinement after Update 6.

It does **not** replace the implemented business logic.

It reorganizes the current ERP so the client can answer the following questions without remembering where technical features are stored:

```text
What is happening in the business?
→ Dashboard

What is happening with an import?
→ Imports

What stock do we have?
→ Inventory

What is the sales / marketing team doing?
→ Sales & Marketing

What was spent / collected?
→ Expenses & Accounts

Who are our employees, where are they, what can they access,
and how are they performing?
→ Employees

What happened over a period?
→ Reports

How is the company / system configured?
→ Settings
```

The main principle is:

> **Reduce mental navigation, not business capability.**

---

# 2. Main Finding From the Current Project

The current `dev` implementation is already functionally strong.

The main problem is now **discoverability**, not missing architecture.

Important existing systems that must be preserved:

- Import register and connected import case workflow
- Product-wise landed-cost allocation
- LC / TT workflow
- Warehouse receipt and FIFO inventory
- Stock / Batch / Movement views
- Customers
- Marketing Activity
- Leads
- Follow-ups
- Daily / Monthly Plans
- Targets
- Activity Score
- Field Team / GPS
- Quotations
- Orders
- Deliveries
- Collections
- Expenses
- Cash / Bank
- Reports
- Flexible RBAC
- Per-user ALLOW / DENY overrides
- Sensitive capabilities
- Public website
- Documents
- Printing
- Smart Insights
- Floating AI

Do not rebuild these.

---

# 3. Main Design Change

Create one direct top-level management destination:

# **Employees**

This should combine the employee-related management surfaces that currently exist across:

```text
Settings
Sales → Marketing
Field Team
Reports
```

The Employees hub is **not a new employee database**.

It is a unified management surface over the same:

```text
User
Employee Directory
RBAC
Field Team
Marketing Activity
Marketing Performance
Reports
```

services and records.

---

# 4. Final Recommended Main Navigation

For a fully authorized Super Admin:

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

This is eight possible destinations for a fully authorized administrator.

However, the ERP remains role-simple because unauthorized destinations are hidden.

Most users will see significantly fewer.

---

# 5. Why Eight Top-Level Items Is Still Simple

The old rule of keeping exactly seven top-level items was useful while removing fragmented workflow tabs.

But **Employees is now a justified exception** because it is a separate management concept in the client's mental model.

The important measure is:

```text
How many relevant options does each user see?
```

not:

```text
How many possible options exist for Super Admin?
```

Example:

### Sales Executive

```text
Dashboard
Sales & Marketing
Reports
```

### Warehouse Manager

```text
Dashboard
Imports
Inventory
```

### Accounts

```text
Dashboard
Sales & Marketing
Expenses & Accounts
Reports
```

### Sales Manager

```text
Dashboard
Inventory
Sales & Marketing
Employees
Reports
```

if Employee / Team management is allowed.

### Super Admin

Sees the full system.

This is still simpler than showing a delegated employee manager a generic **Settings** entry and expecting them to discover employee administration inside it.

---

# 6. Rename Top-Level `Sales` to `Sales & Marketing`

Current internal structure already contains the Marketing hub.

The sidebar should make that obvious.

Change:

```text
Sales
```

to:

```text
Sales & Marketing
```

Do not create Marketing as another top-level module.

This gives the client immediate visibility of the marketing requirement while keeping the sales workflow connected.

---

# 7. Final System Mental Model

The client should only need to remember:

```text
Imports
= Buy / import goods

Inventory
= What is in the warehouse

Sales & Marketing
= Generate business and fulfil sales

Expenses & Accounts
= Money going out / cash-bank / dues

Employees
= People, access, location and performance

Reports
= Historical / management reporting

Settings
= System and business configuration
```

This is simpler than organizing navigation around technical implementation boundaries.

---

# 8. Dashboard — Keep, With Small Refinements

The current Dashboard is structurally good.

Keep:

- role-specific metrics
- Today's Marketing
- import attention
- expiry attention
- dues
- recent sales / collections
- expense pulse
- Smart Insights

Do not redesign Dashboard into a second ERP menu.

---

# 9. Optional Dashboard Quick Actions

Add only a small role-aware quick-action row if useful.

Examples:

### Sales Executive

```text
Report Activity
New Lead
New Quotation
Post Collection
```

### Sales Manager

```text
Open Marketing
Employees
Generate Report
```

### Accounts

```text
Post Expense
Post Collection
Customer Dues
```

### Import Officer

```text
New Import
Open Import Register
```

### Warehouse

```text
Inventory
Receive Finalized Import
```

Do not show more than 3–4 quick actions.

This is P1, not required for the Employee Hub launch.

---

# 10. Imports — Current Structure Is Good

Keep the current top-level:

```text
Imports
```

and the existing:

```text
Import Register
→ Open Import Case
```

Current import-case workflow already correctly keeps:

```text
one Import record
=
one shipment / consignment
=
multiple product rows
```

Do not create PI, LC, TT, Shipment, Customs, Costing, GRN as separate top-level modules.

---

# 11. Import Case — Keep Accordion Workflow

The current connected Import Case is a good design.

Keep its concept:

```text
Commercial & Products
Payment / LC / TT
Shipment / Port
Costs / Landed Cost
Documents
Warehouse Receipt
```

as sections inside the same case.

This matches the real operational sequence and avoids navigation fragmentation.

---

# 12. Import UX Copy Refinement

A later copy pass should replace technical phrases where possible.

For example:

```text
Canonical Product
→ Product

Immutable Landed-Cost Snapshot
→ Finalized Landed Cost

Allocation Base
→ Cost Allocation Method
```

The underlying rules stay unchanged.

---

# 13. Inventory — Keep Exactly Three Main Views

Current structure is good:

```text
Inventory
├── Stock
├── Batches
└── Movements
```

Do not add:

```text
GRN
Expiry
FIFO
Warehouse
```

as separate tabs.

Those remain behavior / filters / actions inside the existing inventory views.

---

# 14. Inventory Workflow

Keep:

```text
Finalized Import
→ Receive
→ Batch / Lot
→ Stock
→ FIFO Sales Dispatch
→ Movement Journal
```

This is already compatible with the client requirement.

---

# 15. Inventory Cross-Links

Keep or improve:

```text
Inventory → Receive Finalized Import
→ Imports

Inventory → Product
→ Product Master

Batch source
→ Source Import
```

No duplicate warehouse workflow.

---

# 16. Sales & Marketing — Final Structure

Keep the existing connected commercial workflow:

```text
Sales & Marketing
├── Customers
├── Marketing
├── Quotations & Orders
├── Deliveries
└── Collections
```

This structure is correct.

---

# 17. Why Marketing Remains Inside Sales & Marketing

The client's required chain is:

```text
Lead
→ Contact
→ Visit
→ Follow-up
→ Presentation / Sample
→ Quotation
→ Negotiation
→ Order
→ Delivery
→ Collection
```

Separating Marketing into another top-level app would break this chain.

Keep it connected.

---

# 18. Marketing Should Remain the Default View for Sales Roles

For:

```text
Sales Manager
Sales Executive
```

opening Sales & Marketing should default to:

```text
Marketing
```

because that is their daily operational starting point.

For other roles:

```text
Accounts → Collections
Warehouse → Delivery where appropriate
```

can continue using role-appropriate defaults.

---

# 19. Marketing Hub — Keep the One-Click Design

The Marketing screen should continue to show immediately:

```text
Today's Marketing
Live / Daily Activity
Follow-up Attention
Lead Funnel
Field Team shortcut
Employee / Team Performance
```

Do not reintroduce nested:

```text
Marketing
→ Live Activity
→ ...
```

as the required first step.

---

# 20. Marketing Quick Actions — Simplify Priority

Current action bar is functionally rich but can become visually crowded.

Recommended Sales Executive priority:

```text
[Report Activity]   ← primary
[New Lead]
[Follow-up]
[Check In / Out]
[More ▾]
```

`More`:

```text
Daily Plan
Monthly Plan
Generate Report
```

Recommended manager priority:

```text
[New Lead]
[Follow-up]
[Generate Report]
[More ▾]
```

`More` may contain:

```text
Monthly Plan
Targets
```

Avoid six equally prominent buttons.

---

# 21. Daily Plan Should Be Easier Than Monthly Plan

Daily Plan is more operationally frequent.

If only one plan action is visible:

```text
Daily Plan
```

should have higher priority than:

```text
Monthly Plan
```

Monthly Plan belongs in secondary actions / Plans & Targets.

---

# 22. Live Marketing Must Actually Refresh

The client explicitly requested that updates from employee user IDs appear immediately for management.

Current Marketing architecture should add prototype auto-refresh:

```text
10–15 second polling
```

for:

```text
Marketing dashboard
Live activity
Follow-up attention
Team performance
```

Production later:

```text
Supabase Realtime
```

Do not call the screen “Live” if it only refreshes after local actions or manual page refresh.

---

# 23. Use Real Transaction Timestamps

The unified activity feed is correct.

Keep automatically deriving:

```text
Quotation Submitted
Order Received
Delivery Posted
Payment Collected
```

from real ERP transactions.

But do not generate artificial times from date-only records.

Going forward store:

```text
createdAt
submittedAt
postedAt
```

as appropriate.

Old records without exact time should display:

```text
26 Aug 2026
Time unavailable
```

instead of invented timestamps.

---

# 24. Marketing Funnel — Improve Click Behavior

Current funnel stages are useful.

Improve:

```text
Click Negotiation (4)
```

to open:

```text
Leads
Stage = Negotiation
```

showing exactly those records.

Do not make every funnel stage open an unfiltered lead list.

---

# 25. Marketing Funnel — Responsive Simplification

Desktop can display the full medical-business funnel.

On smaller screens:

- horizontal swipe is acceptable
- or use a compact two-row layout

Do not force an extremely wide table-like experience on mobile.

---

# 26. Reduce Duplicate Team Performance Presentation

Do not show two large representations of the same employee metrics back-to-back.

Prefer one detailed performance table.

Replace any redundant card grid with:

```text
Needs Attention

2 below target
3 overdue follow-ups
1 no activity today
2 unverified visits
```

This provides new information rather than repeating the table.

---

# 27. Marketing User-Facing Copy Should Be Business Language

Replace technical UI text.

Examples:

```text
“Manual reports and authoritative ERP events in one role-scoped feed”
→ “Employee updates and sales activity for today”

“Deterministic due status”
→ “Follow-ups that need action”

“Official score events”
→ “Sales, collection, visits and target progress”

“Canonical customers or leads”
→ “Customers or leads”
```

Keep technical rules in documentation, tooltips or audit behavior.

Do not expose implementation vocabulary to ordinary employees.

---

# 28. Expenses & Accounts — Current Structure Is Mostly Good

Keep the single module:

```text
Expenses & Accounts
```

Current views:

```text
Daily Expenses
Cash & Bank
Transactions
Collections & Dues
```

are acceptable.

---

# 29. Improve Accounts Labels

Recommended client-facing labels:

```text
Daily Expenses
Cash & Bank
Account Ledger
Customer Dues & Collections
```

instead of:

```text
Transactions
Collections & Dues
```

This makes the purpose clearer.

---

# 30. Expense Attribution — Keep Current Update

Preserve:

```text
Expense For
├── Employee
├── Office
├── Warehouse
└── Company / General
```

Employee must use structured EmployeePicker.

TA / DA employee must not be free text.

---

# 31. Expense Flow

Keep:

```text
Expense
→ Expense For
→ Paid From
→ Cash / Bank transaction
```

and:

```text
Collection
→ Customer
→ Payment Account
→ Cash / Bank transaction
```

Do not create a second payment ledger.

---

# 32. Landed Cost Boundary

Continue keeping:

```text
Sea Freight
Customs
C&F
Port
Shipment Transport
```

inside Import landed cost when shipment-related.

Do not mix them with ordinary operating expenses.

---

# 33. New Top-Level Employees Hub

Create:

```text
/app/employees
```

UI label:

# **Employees**

This becomes the management home for:

```text
Employee identity / login
Access / roles
Field Team
Employee activity
Employee performance
```

---

# 34. Employees Hub — Recommended Internal Views

Use four simple tabs:

```text
Employees
├── Employee Directory
├── Access & Roles
├── Field Team
└── Activity & Performance
```

Do not label a tab simply:

```text
Accounts
```

because the ERP already has financial Accounts.

Employee login/account information belongs inside Employee Directory.

---

# 35. Employee Directory

Purpose:

```text
Who works here?
What is their employee/login account?
What is their status?
```

Show:

```text
Name
Employee ID
Designation
Department
Territory
Phone
Email / Login
Role
Status
```

Search:

```text
Name
Employee ID
Department
Territory
```

Filters:

```text
Department
Role
Status
Territory
```

---

# 36. Employee Directory — Primary Actions

Authorized user:

```text
+ New Employee
```

Employee row:

```text
Open
Activity
Field Map
Report
```

If access administrator:

```text
Access
```

Do not display every action as a large button in every row.

Use row click + compact action menu where appropriate.

---

# 37. Employee Detail / Editor

Reuse the current User editor.

Sections:

```text
Profile
Employment
Login Account
Status
```

Possible fields:

```text
Name
Employee Code
Designation
Department
Territory
Phone
Email
Profile Image
Account Status
```

Do not create a second Employee model.

---

# 38. Employee Account Terminology

Use:

```text
Login Account
```

instead of:

```text
User Account
```

where client-facing wording benefits.

Example:

```text
Login Email
Account Status
Reset / Invite
```

This avoids confusion with financial Accounts.

---

# 39. Access & Roles

Move the security-oriented part of current:

```text
Settings → Users & Capabilities
```

into:

```text
Employees → Access & Roles
```

Show:

```text
Employee
Role
Role Default Access
Additional ALLOW
Explicit DENY
Sensitive Capabilities
```

Reuse the current RBAC implementation.

No new permission system.

---

# 40. Access & Roles Visibility

Only show this tab when authorized.

Recommended:

```text
Super Admin
OR
manage_user_access
```

A normal delegated employee manager should not automatically see or change security settings.

---

# 41. Employee Lifecycle vs Access Administration

Maintain the distinction:

### Employee Lifecycle

```text
users:view
users:create
users:edit
manage_users
```

allows:

- create employee
- edit employee profile
- activate / deactivate
- maintain territory / department

### Access Administration

```text
manage_user_access
```

allows:

- role
- permission override
- sensitive capability

This is already the correct architecture.

---

# 42. Field Team — Canonical Management Location

The existing Field Team map should have one canonical management home:

```text
Employees → Field Team
```

Reuse the existing FieldTeamPage.

Do not duplicate map logic.

---

# 43. Sales & Marketing Still Gets Field Team Shortcut

Keep a shortcut:

```text
Sales & Marketing → Marketing
→ Open Field Team
```

It should navigate to:

```text
/app/employees?view=field-team
```

for authorized management users.

For a Sales Executive, their own field/check-in experience may remain directly inside Marketing.

---

# 44. Field Team Management View

Keep:

```text
Live Map
Active / Recent / Offline / Not Tracking
Employee
Territory
Visit status
Route history
Visit history
GPS verification
```

Add no extra employee-management duplication here.

---

# 45. Activity & Performance

Create:

```text
Employees → Activity & Performance
```

This becomes the quickest management view for:

```text
What did this employee do?
How are they performing?
```

---

# 46. Activity & Performance Header

Recommended:

```text
Employee
[EmployeePicker]

Period
[Today ▼]

[Field Map]
[Full Report]
```

Period:

```text
Today
Yesterday
This Week
Last Week
This Month
Last Month
Custom
```

---

# 47. Employee Performance Summary

Show:

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
Quotations
Orders
Delivered Sales
Collections
Activity Score
Target Progress
```

Use the same marketing / sales report data.

Do not create a new calculation engine.

---

# 48. Employee Activity Timeline

Below the summary:

```text
Time
Activity
Customer / Lead
Product
Location / Verification
Status
Next Follow-up
Remarks
```

Mix:

```text
manual marketing activity
+
FieldVisit
+
Quotation
+
Order
+
Delivery
+
Collection
```

using the existing unified Marketing feed.

---

# 49. Employee Target Section

Show:

```text
Sales Target
Visit Target
New Customer Target
Collection Target
```

with:

```text
Actual / Target
%
```

Do not allow manual Actual values.

---

# 50. Employee Follow-Up Section

Show:

```text
Today
Overdue
Upcoming
```

for the selected employee.

Do not force the manager back to Marketing just to see employee follow-ups.

---

# 51. Employee Performance Report Link

`Full Report` should open:

```text
Reports
→ Marketing / Employee Performance
```

with:

```text
employee
period
```

already populated.

No duplicate report builder inside Employees.

---

# 52. Employee Field Map Link

`Field Map` opens:

```text
Employees → Field Team
```

with the selected employee focused.

No duplicate map.

---

# 53. Employee Hub Visibility

Do not show Employees to every user.

Recommended helper:

```text
canAccessEmployeeHub(user)
```

returns true when the user can access at least one management subview.

Examples:

```text
users:view
OR
manage_user_access
OR
marketing management scope = TEAM / ALL
```

Sales Executive with SELF-only Marketing scope should not get a separate Employees management tab by default.

Their own activity remains under Sales & Marketing.

---

# 54. Employee Hub Subview Permissions

### Employee Directory

```text
users:view
```

Editing:

```text
users:create
users:edit
```

### Access & Roles

```text
manage_user_access
```

### Field Team

```text
marketing:view
+
TEAM / ALL scope
```

### Activity & Performance

```text
marketing:view
+
TEAM / ALL scope
```

and Report export / print remains controlled by existing permissions.

---

# 55. Do Not Add Another Employee Permission Architecture

Keep internal permission key:

```text
users
```

There is no need to rename it to:

```text
employees
```

in code.

The UI can say:

```text
Employees
```

while the existing security system remains stable.

---

# 56. Move Users Out of Settings

After Employees hub exists, remove:

```text
Users & Capabilities
```

from normal Settings navigation.

Settings should become about:

```text
system / master / company configuration
```

not employee operations.

---

# 57. Final Settings Structure

Recommended:

```text
Settings
├── Decisions
├── Products & Aliases
├── Suppliers
├── Business Setup
├── Data Migration
└── Website Content
```

Optional wording:

```text
Confirmation Queue
→ Decisions / Confirmations
```

if the client finds “queue” too technical.

---

# 58. Settings Permission Entry

Current Settings can appear to a user merely because they have `users` access.

After Employees is created:

remove:

```text
users
```

from:

```text
settingsEntryPermissions
```

Settings should appear only for actual settings/master-data permissions.

This is a major simplicity improvement.

---

# 59. Legacy Route Compatibility

Keep old links working.

Redirect:

```text
/app/users/*
→ /app/employees
```

```text
/app/roles/*
→ /app/employees?view=access
```

```text
/app/settings?view=users
→ /app/employees
```

Do not break bookmarks or old references.

---

# 60. Reports — Keep as Canonical Historical Reporting

Current Reports architecture is good.

Keep:

```text
Overview
Marketing
Import & Cost
Inventory
Sales & Collection
Expense & Cash-Bank
Audit
```

depending on access.

---

# 61. Reports vs Employees

Use:

```text
Employees → Activity & Performance
```

for:

```text
quick employee management monitoring
```

Use:

```text
Reports
```

for:

```text
deep / exportable / cross-period analysis
```

Do not duplicate report logic.

---

# 62. Marketing Report Builder — Keep Current Capability

Current report dimensions are sufficient:

```text
Period
Employee
Territory
Activity
Customer / Lead
Verification
Status
Group By
Summary / Detail
CSV
Print / Save PDF
```

This adequately addresses:

> Several ways report generating strategies missing.

Do not build a generic BI designer.

---

# 63. Simplify Marketing Report Filter Presentation

Default visible:

```text
Period
Employee
```

Then:

```text
More Filters
```

expands:

```text
Territory
Activity
Customer / Lead
Verification
Status
Group By
```

This preserves power without overwhelming casual users.

---

# 64. Searchable Customer / Lead Selector

Replace long ordinary select lists with a searchable selector once data grows.

Reuse the design principle of EmployeePicker.

This is P1.

---

# 65. Cross-Linking Is a Core UX Rule

Related information should always be one click away.

Examples:

### Employee Directory

```text
Employee
→ Activity
→ Field Map
→ Full Report
→ Access
```

### Marketing

```text
Employee Name
→ Employee Activity & Performance
```

### Field Team

```text
Employee
→ Activity & Performance
```

### Reports

```text
Employee Performance
→ Employee Hub
→ Field Team
```

### Lead

```text
Follow-up
Visit
Create Quotation
```

### Customer

```text
Marketing History
Quotation
Collection
Ledger
```

---

# 66. One Implementation, Multiple Entry Points

Cross-linking does not mean duplicated code.

Use:

```text
ONE Employee data source
ONE Marketing service
ONE Field Team component
ONE Report service
ONE RBAC resolver
```

but allow multiple sensible entry paths.

Example:

```text
Marketing → Field Team shortcut
```

and:

```text
Employees → Field Team
```

both render the same underlying component.

---

# 67. Sidebar Grouping

Use multiple `navSections`:

```text
Workspace
  Dashboard

Operations
  Imports
  Inventory
  Sales & Marketing
  Expenses & Accounts

Management
  Employees
  Reports

System
  Settings
```

Only render a section if at least one child is visible.

When sidebar is collapsed:

- section labels remain hidden
- icons remain unchanged

---

# 68. Sidebar Ordering

Recommended:

```text
Dashboard

Imports
Inventory
Sales & Marketing
Expenses & Accounts

Employees
Reports

Settings
```

This follows:

```text
Operations
→ People / Management
→ Reporting
→ Configuration
```

---

# 69. Role Examples

## Sales Executive

```text
Dashboard
Sales & Marketing
Reports
```

Own Marketing activity only.

No Employees hub by default.

---

# 70. Sales Manager

Typical:

```text
Dashboard
Inventory
Sales & Marketing
Employees
Reports
```

Employees may expose:

```text
Field Team
Activity & Performance
```

Employee Directory appears only if `users:view`.

Access & Roles appears only if `manage_user_access`.

---

# 71. Managing Director

Possible:

```text
Dashboard
Imports
Inventory
Sales & Marketing
Expenses & Accounts
Employees
Reports
```

Employee hub:

```text
Field Team
Activity & Performance
```

Directory if explicitly permitted.

Access & Roles normally hidden.

---

# 72. Accounts

Typical:

```text
Dashboard
Sales & Marketing
Expenses & Accounts
Reports
```

No Employees unless explicitly delegated.

---

# 73. Import Officer

Typical:

```text
Dashboard
Imports
Reports
Settings
```

if Reports is explicitly granted and Product/Supplier master access requires Settings.

No employee-management clutter.

---

# 74. Warehouse Manager

Typical:

```text
Dashboard
Imports
Inventory
```

No Sales / Employee management unless explicitly granted.

---

# 75. Super Admin

Full:

```text
Dashboard
Imports
Inventory
Sales & Marketing
Expenses & Accounts
Employees
Reports
Settings
```

Employees:

```text
Employee Directory
Access & Roles
Field Team
Activity & Performance
```

---

# 76. Employee Hub Should Not Become HR / Payroll

Do not expand Employees into:

```text
Payroll
Leave
Recruitment
Appraisal
Salary processing
Attendance payroll
```

unless the client explicitly requests HRMS later.

Current requirement is:

```text
employee identity
access
field monitoring
marketing activity
performance
```

Keep that scope.

---

# 77. Employee Hub Should Not Duplicate Marketing Entry

Sales employees should still report work from:

```text
Sales & Marketing
```

not:

```text
Employees
```

Employees is management-facing.

This separation is important:

```text
Sales & Marketing
= Do the work

Employees
= Manage / monitor the people

Reports
= Analyze the work
```

---

# 78. Employee Hub Should Not Duplicate Reports

Activity & Performance is a concise management view.

For complex filters / export:

```text
Full Report
→ Reports
```

Do not embed the entire Marketing Report Builder again.

---

# 79. Employee Hub Should Not Duplicate Settings

Access & Roles should reuse the existing access editor.

Business Setup remains in Settings.

Do not put:

```text
Products
Suppliers
Expense Categories
Warehouses
Website
```

inside Employees.

---

# 80. Public Website — No Change

The public / internal separation remains correct.

Keep:

```text
/              Public MIPRO Website
/login         Employee Portal
/app/*         ERP
```

Employees hub is internal only.

No public employee directory.

---

# 81. AI — Keep Existing Architecture

Keep:

```text
Floating AI
Smart Insights
```

No AI Command Center.

---

# 82. Employee AI Context

When inside Employees:

AI may answer:

```text
Summarize Rafiq's activity today.
Who has overdue follow-ups?
Who is below target this month?
Which field employees are not tracking?
Which employees had no activity today?
```

Scope must follow the same Employee / Marketing permissions.

---

# 83. AI Must Not Change Access Automatically

AI may explain:

```text
what access an employee currently has
```

but changing:

```text
role
permissions
capabilities
```

requires normal authorized UI and explicit human action.

---

# 84. Technical UI Copy Cleanup — System-Wide

Run a client-language copy pass.

Avoid ordinary UI wording such as:

```text
canonical
normalized
deterministic
authoritative
role-scoped
immutable snapshot
projection
```

unless needed.

Prefer:

```text
approved
customer ledger
calculated from due date
system transaction
based on your access
finalized
```

---

# 85. Keep Technical Precision in Help / Audit

Do not remove technical safeguards.

Only simplify user-facing copy.

Example:

UI:

```text
Finalized Landed Cost
```

Audit / docs:

```text
Immutable landed-cost snapshot v2
```

This gives both usability and technical correctness.

---

# 86. Component Refactoring

Current MarketingHub is large.

After the UX stabilizes, split into:

```text
MarketingHub
MarketingKpis
LiveActivityPanel
FollowUpAttention
MarketingFunnel
TeamPerformance
MarketingActionModals
EmployeeSnapshot
```

This is maintainability work.

Do not change the user flow while refactoring.

---

# 87. Employee Components

Recommended:

```text
src/domains/employees/
  EmployeesPage.tsx
  EmployeeDirectory.tsx
  EmployeeEditor.tsx
  EmployeeAccessWorkspace.tsx
  EmployeeActivityPerformance.tsx
```

Reuse:

```text
src/components/field-team/FieldTeamPage.tsx
src/components/employees/EmployeePicker.tsx
```

---

# 88. Employees Route

Add:

```text
/app/employees
```

Query modes:

```text
/app/employees?view=directory
/app/employees?view=access
/app/employees?view=field-team
/app/employees?view=activity&employee=sales1
```

Do not create dozens of routes.

---

# 89. Employee Hub Route Guard

Add a helper such as:

```text
canAccessEmployeeHub(user)
```

and corresponding route guard.

The hub is visible if at least one subview is permitted.

Do not guard the whole page only with `users:view`, because an authorized manager may need Field Team / Activity without employee-edit access.

---

# 90. Employee Directory API

Current full user API can continue for authorized employee administration.

Keep or use safe:

```text
/api/employees/directory
```

for selectors and read-only employee projections.

Do not expose permission details through generic directory APIs.

---

# 91. Employee Directory Security

Safe fields:

```text
id
name
employeeCode
title
department
territory
phone
status
avatar
```

Login / access details require stronger authorization.

---

# 92. Access Data Security

Only authorized access manager gets:

```text
role
permissionOverrides
capabilities
```

Do not send all security configuration merely because someone can see Field Team.

---

# 93. Marketing Role Hardcoding Cleanup

Current Marketing UI still has some exact-role checks.

Gradually replace:

```text
role === "Sales Executive"
```

when it controls business authorization with:

```text
effective permission
+
employee scope
```

Keep role labels only for presentation/default behavior.

---

# 94. Marketing Scope

Continue:

```text
Sales Executive → SELF
Sales Manager → TEAM
Managing Director → ALL
Super Admin → ALL
```

If later the client needs custom team scope, extend separately.

Do not add a complex scope editor now.

---

# 95. Field Team Scope

Use the same Marketing employee scope.

Do not invent a separate Field Team employee list.

---

# 96. Activity & Performance Scope

Use the same employee scope.

A manager should only select employees they are permitted to monitor.

URL manipulation must not bypass server scope.

---

# 97. Report Scope

Reports should continue enforcing scope server-side.

EmployeePicker is only UX.

Backend remains authoritative.

---

# 98. Expense Employee Picker

Use the same safe employee directory.

Do not pull full security users merely to select the person an expense belongs to.

---

# 99. Current Client Review — What Is Already Resolved

After Update 6, the following client requests are already implemented or substantially implemented:

```text
Individual employee login IDs
Daily marketing activity submission
Lead management
Follow-ups
Marketing funnel
Daily plan
Monthly plan
Target vs Actual
Activity Score
GPS / field visit verification
Products discussed
Next follow-up
Employee-wise performance
Marketing report builder
Multiple report filters
Period presets
Expense attribution
Employee auto-link
Office / warehouse expense attribution
More expense categories
```

Do not rebuild these in Update 7.

---

# 100. Remaining Client-Facing Issues

Focus on:

```text
1. Employee-related features are spread across multiple locations.
2. Settings is not the intuitive place for delegated employee management.
3. Field Team and Employee Performance should be directly discoverable from Employees.
4. Marketing Live Activity needs real auto-refresh behavior.
5. Transaction activity should use real timestamps.
6. Marketing screen can be visually simplified.
7. Reports filters can be progressively disclosed.
8. Some UI copy is too technical.
```

These are the real remaining design tasks.

---

# 101. Compatibility With Existing Data

No migration should be required for the Employee Hub itself.

Reuse:

```text
User
EmployeeDirectoryEntry
FieldVisit
CurrentEmployeeLocation
MarketingActivity
MarketingLead
MarketingFollowUp
DailyMarketingPlan
MonthlyMarketingPlan
EmployeeMarketingTarget
MarketingPerformance
SalespersonPerformance
```

---

# 102. Compatibility With Existing RBAC

No RBAC rewrite.

Reuse:

```text
PermissionKey
PermissionAction
UserPermissionOverride
Capability
hasEffectivePermission
canManageEmployees
manage_users
manage_user_access
```

Employees hub only composes these correctly.

---

# 103. Compatibility With Future Supabase

The new information architecture remains compatible with:

```text
Supabase Auth
Postgres
RLS
Realtime
Storage
```

because UI composition does not change domain ownership.

---

# 104. Compatibility With Future Mobile App

Mobile app continues using:

```text
employee login
marketing activity
field visits
leads
follow-ups
plans
quotation/order/collection
```

Web Employees hub remains management-focused.

No new mobile data model is created.

---

# 105. P0 — Navigation / Employees

1. Add top-level Employees destination.
2. Rename Sales → Sales & Marketing.
3. Add sidebar Management section.
4. Add Employees route guard.
5. Build Employee Directory from existing user management.
6. Move employee profile/login management out of Settings.
7. Move Access & Roles UI out of Settings.
8. Embed existing Field Team in Employees.
9. Add Activity & Performance management view.
10. Add cross-links between Employee / Marketing / Map / Reports.
11. Remove `users` as a reason to show generic Settings.
12. Redirect legacy user/settings-user routes.

---

# 106. P0 — Marketing Correctness

13. Add 10–15 second prototype refresh to Marketing live data.
14. Add real transaction timestamps for new quotation/order/delivery/collection records.
15. Stop displaying invented times where exact time is unavailable.
16. Funnel stage click should filter lead list.
17. Remove role hardcoding where effective permission / scope should control access.

---

# 107. P1 — UX Polish

18. Simplify Marketing top action bar.
19. Prioritize Daily Plan over Monthly Plan.
20. Remove duplicate Team Performance visualization.
21. Add Needs Attention summary.
22. Collapse advanced Marketing report filters behind More Filters.
23. Make Customer / Lead report selector searchable.
24. Run system-wide client-language copy cleanup.
25. Add optional Dashboard quick actions.
26. Refactor large MarketingHub component without changing behavior.

---

# 108. P2 — Production Infrastructure

27. Supabase persistent database.
28. Supabase Auth.
29. Supabase RLS.
30. Supabase Storage.
31. Supabase Realtime Marketing activity.
32. Supabase Realtime Field Team.
33. mobile background GPS.
34. offline mobile sync.
35. push / follow-up reminders.
36. production media evidence.
37. LangChain / LangGraph behind existing AI boundaries.

---

# 109. UAT — Navigation

Ask a client user:

```text
Where would you go to add an employee?
Expected: Employees

Where would you check employee access?
Expected: Employees

Where would you see the field team?
Expected: Employees

Where would you check Rafiq's performance?
Expected: Employees

Where would Rafiq report his field activity?
Expected: Sales & Marketing

Where would you generate a monthly company report?
Expected: Reports

Where would you configure products / company settings?
Expected: Settings
```

If these answers are intuitive without explanation, the navigation succeeds.

---

# 110. UAT — Delegated Employee Manager

1. Super Admin grants user employee management access.
2. Login as delegated manager.
3. Employees appears directly.
4. Settings does not appear solely because of employee access.
5. Employee Directory is visible.
6. Create / edit employee according to permission.
7. Access & Roles remains hidden without `manage_user_access`.
8. Field Team / Activity only appear if marketing management scope allows.

---

# 111. UAT — Sales Manager

1. Login as Sales Manager.
2. Sales & Marketing opens to Marketing.
3. Live activity visible.
4. Employees visible when team-management scope is allowed.
5. Employees → Field Team opens team map.
6. Employee click opens Activity & Performance.
7. Full Report opens Reports with employee/date preselected.

---

# 112. UAT — Sales Executive

1. Login Sales Executive.
2. No team-wide Employees hub by default.
3. Sales & Marketing opens to My Marketing Day.
4. Report Activity is obvious.
5. Check In / Out is obvious.
6. Own plan / follow-up / target visible.
7. Own Reports remain available according to permission.
8. Cannot access another employee through URL manipulation.

---

# 113. UAT — Super Admin

1. Employees → Employee Directory.
2. Create employee.
3. Employees → Access & Roles.
4. Grant role and per-user overrides.
5. Employees → Field Team.
6. See team map.
7. Employees → Activity & Performance.
8. Select employee / period.
9. Open full report.
10. Settings remains focused on system/master configuration.

---

# 114. UAT — Live Marketing

1. Manager opens Marketing.
2. Employee reports activity from another browser/device.
3. Within 10–15 seconds manager feed updates in prototype.
4. Later Realtime should reduce this further.
5. No page refresh required.

---

# 115. UAT — Real Time Values

1. Create quotation at known time.
2. Activity feed shows actual recorded time.
3. Create order.
4. Activity feed shows actual order timestamp.
5. Old date-only record displays date with “Time unavailable.”
6. No fabricated noon / 1 PM timestamps.

---

# 116. Do Not Do

Do not:

- rebuild RBAC,
- create a second Employee database,
- duplicate Field Team,
- duplicate Marketing calculations,
- duplicate Report logic,
- add a separate Marketing top-level module,
- add HR payroll scope,
- add many new employee submodules,
- move Sales employee entry into Employees,
- create separate CRM,
- create generic BI report designer,
- change Import landed-cost logic,
- change FIFO warehouse rule,
- merge operating expenses into landed cost,
- expose sensitive costs to marketing/employee views,
- expose employee security data through generic employee directory APIs.

---

# 117. Final Application Structure

```text
MIPRO ERP
│
├── Dashboard
│
├── OPERATIONS
│   ├── Imports
│   │   └── One Import Case
│   │       ├── Commercial / Products
│   │       ├── LC / TT
│   │       ├── Shipment
│   │       ├── Costs
│   │       ├── Documents
│   │       └── Warehouse Receipt
│   │
│   ├── Inventory
│   │   ├── Stock
│   │   ├── Batches
│   │   └── Movements
│   │
│   ├── Sales & Marketing
│   │   ├── Customers
│   │   ├── Marketing
│   │   ├── Quotations & Orders
│   │   ├── Deliveries
│   │   └── Collections
│   │
│   └── Expenses & Accounts
│       ├── Daily Expenses
│       ├── Cash & Bank
│       ├── Account Ledger
│       └── Customer Dues & Collections
│
├── MANAGEMENT
│   ├── Employees
│   │   ├── Employee Directory
│   │   ├── Access & Roles
│   │   ├── Field Team
│   │   └── Activity & Performance
│   │
│   └── Reports
│       ├── Overview
│       ├── Marketing
│       ├── Import & Cost
│       ├── Inventory
│       ├── Sales & Collection
│       ├── Expense & Cash-Bank
│       └── Audit
│
└── SYSTEM
    └── Settings
        ├── Decisions
        ├── Products & Aliases
        ├── Suppliers
        ├── Business Setup
        ├── Data Migration
        └── Website Content
```

---

# 118. Core Business Flow After Simplification

```text
IMPORT FLOW

Supplier
→ PI / PO
→ LC / TT
→ Shipment
→ Port / Customs
→ Landed Cost
→ Warehouse Receipt
→ Inventory
```

```text
SALES / MARKETING FLOW

Employee
→ Marketing Activity
→ Lead
→ Follow-up / Visit
→ Customer
→ Quotation
→ Order
→ Delivery
→ Collection
```

```text
EMPLOYEE MANAGEMENT FLOW

Employee Directory
→ Login Account
→ Access / Role
→ Field Team
→ Activity / Performance
→ Historical Report
```

```text
FINANCE FLOW

Expense
→ Expense For
→ Cash / Bank

Collection
→ Customer
→ Cash / Bank
```

---

# 119. Final Design Principles

The completed ERP should follow these principles:

### 1. One business concept has one home

```text
Imports → Imports
Stock → Inventory
Sales work → Sales & Marketing
Money → Expenses & Accounts
People → Employees
Analysis → Reports
Configuration → Settings
```

### 2. Related information is one click away

Cross-link instead of duplicate.

### 3. Role permissions simplify the interface

Users only see relevant destinations.

### 4. Daily work is faster than configuration

Frequent actions stay visible.
Rare configuration stays secondary.

### 5. Human language over technical architecture

The client should not need to understand the code model.

### 6. Existing business rules remain authoritative

Navigation simplification must never weaken:

- permissions,
- costing,
- FIFO,
- audit,
- sensitive-cost protection,
- scope,
- verification.

---

# 120. Exact Next Milestone

# **Update 7 — Employee Hub & Full-System UX Simplification**

The goal is not to add another large feature set.

The goal is to make the already-capable ERP feel like one understandable product.

Deliver:

```text
✓ Employees top-level management hub
✓ Employee Directory
✓ Login account management
✓ Access & Roles
✓ Field Team
✓ Employee Activity & Performance
✓ Sales renamed to Sales & Marketing
✓ Users removed from generic Settings
✓ Role-aware sidebar grouping
✓ Cross-links between Employees / Marketing / Map / Reports
✓ Real live Marketing polling for prototype
✓ Real transaction timestamps
✓ Funnel filtering
✓ Reduced Marketing visual density
✓ Simplified Report filter presentation
✓ Client-language copy cleanup
```

After this milestone, further large frontend restructuring should stop.

The next meaningful step should be:

```text
Client UAT
→ production backend / Supabase
→ mobile app
```

rather than another navigation redesign.

---

**End of Plan**
