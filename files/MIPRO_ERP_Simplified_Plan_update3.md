# MIPRO Medical Supplier ERP — Field Sales, Location Tracking & AI Update Plan

**Date:** 24 August 2026  
**Repository:** `AN-SWAPNIL/Medical_Supplier_ERP`  
**Working branch:** `dev`  
**Dev HEAD reviewed:** `d43846bfa0504d0e236e7bf342f74e56ec59779e`  
**Scope:** Web ERP only. The future sales mobile app is not being built now, but the web ERP must be fully ready to consume and display its data later.

---

## 1. Objective

The current `dev` branch already contains the major update2 work:

- salesperson performance reports,
- employee/date filtering,
- protected document viewer,
- uploaded import/cost/expense evidence,
- AI document extraction review,
- floating contextual MIPRO AI,
- AI smart recommendations,
- role-safe AI responses,
- existing role/capability administration,
- current simplified seven-area navigation.

The next update should **not redesign those features again**.

The real remaining goals are:

1. Build the **web-side Field Team / Location Tracking experience** now.
2. Design the location data model so the future mobile app and current/future web input use the same backend.
3. Make employee selection scalable for large teams.
4. Improve the AI layer only where actual requirement gaps remain.
5. Add a lightweight **Smart Insights** overview without recreating the old AI Command Center.
6. Keep the system simple and workflow-oriented.

---

## 2. Source-of-Truth Priority

Use requirements in this order:

1. Latest `conversation_transcript.md`
2. Latest `meeting_minutes.md`
3. `Importing Flow.jpeg`
4. Real client operating/supporting documents
5. Current `dev` implementation
6. Latest simplified/update plans
7. HishabPati research as UX guidance
8. Old pre-simplification implementation only as feature/reference history

Important principle:

> The recent simplification corrected the workflow. It should not remove fundamental capabilities such as field tracking, management reporting, document intelligence, and user monitoring when the client actually requested them.

---

## 3. Keep the Current Main Navigation

Keep:

1. Dashboard
2. Imports
3. Inventory
4. Sales
5. Expenses & Accounts
6. Reports
7. Settings

Do **not** add a new main sidebar item for GPS, Tracking, AI, AI Command Center, Employee Management, Mobile App, or Visits.

Instead, integrate field monitoring under **Sales** and AI intelligence contextually.

---

## 4. Current AI Architecture — Keep It

The current AI architecture is already on the right path:

- floating global assistant,
- page/entity context,
- role-aware access,
- sensitive-cost refusal,
- source links,
- smart recommendations,
- document extraction with review before apply,
- deterministic FIFO and costing logic staying authoritative.

Do not replace it.

The next AI work should be **incremental**.

---

## 5. Sales: Add a “Field Team” Subview

Inside the existing Sales workspace, add:

```text
Sales
├── Customers
├── Quotations
├── Orders
├── Deliveries
├── Collections
└── Field Team
```

This is **not** another main sidebar tab.

Suggested visibility:

- Super Admin
- Managing Director
- Sales Manager

Optional limited later view:

- Sales Executive → “My Activity”

---

## 6. Field Team Web Experience

The web ERP should be capable of displaying all field-sales information even before the mobile app is developed.

For now, use realistic mock/demo location records through a typed service/API.

Later, the mobile app will write real coordinates into the same backend.

The Field Team workspace should contain two main modes:

```text
Field Team
├── Live Map
└── Route / Visit History
```

Do not add more tabs unless needed later.

---

## 7. Live Team Map

### Purpose

The manager should be able to answer:

- Who is active?
- Where was each salesperson last seen?
- Who is currently visiting a customer?
- When did their location last update?
- Which territory are they working in?
- Is the location current, stale, or offline?

### Marker data

Each salesperson marker should expose:

```text
Employee Name
Employee ID
Territory
Current / Last Location
Last Updated
Tracking Status
GPS Accuracy
Current / Last Customer Visit
Check-in Time
```

Marker click example:

```text
Rafiq Ahmed
SE-001 · Dhaka North

Status: Live
Last update: 34 sec ago
Accuracy: 18 m

Current Visit:
Popular Hospital Uttara

Check-in: 11:42 AM

[View Today Activity]
[Open Employee Report]
```

---

## 8. Location Status Rules

Use explicit states:

```text
LIVE
RECENT
STALE
OFFLINE
NOT_TRACKING
```

Recommended display logic:

```text
LIVE
location updated within ~1 minute

RECENT
updated within ~10 minutes

STALE
tracking session active but location old

OFFLINE
no recent location / device disconnected

NOT_TRACKING
no active work/tracking session
```

Never label old coordinates as “live”.

Always show:

```text
Last updated: ...
```

---

## 9. Map Technology

Do not restore the old pre-simplification map implementation.

That version was effectively:

- an OpenStreetMap iframe,
- a single real marker,
- decorative CSS route dots,
- estimated route distance.

Build a proper map component.

Recommended options:

```text
Leaflet + react-leaflet
```

or:

```text
MapLibre GL
```

Prefer the simpler option unless advanced vector-map behavior becomes necessary.

Requirements:

- real coordinate-based markers,
- marker clustering,
- zoom/pan,
- fit bounds,
- employee click selection,
- route polyline,
- customer marker support,
- no fake CSS markers.

---

## 10. Live Map Filters

At the top of the Field Team view:

```text
Search Employee
Territory
Tracking Status
Date [for history mode]
```

Example:

```text
Search: [ Name / Employee ID / Territory ... ]

Territory: [ All Territories ▼ ]

Status:
[ All ] [ Live ] [ Recent ] [ Offline ]
```

---

## 11. Map Clustering

If multiple employees are geographically close, cluster markers.

Example:

```text
[ 7 ]
```

Clicking the cluster zooms into those employees.

This prevents a dense Dhaka map from becoming unreadable.

---

## 12. Employee Side List

Alongside the map on desktop, provide a searchable list.

Example:

```text
Field Staff
--------------------------------
Rafiq Ahmed
SE-001 · Dhaka North
● Live · 34 sec ago

Mahmud Hasan
SE-014 · Uttara
● Recent · 4 min ago

Sabbir Hossain
SE-021 · Mirpur
○ Offline · 2 hr ago
```

Click employee:

- centers map marker,
- opens employee summary,
- highlights selected route/visit.

On mobile/tablet web, use a drawer instead of a permanent side panel.

---

## 13. Route / Visit History

Management should be able to select:

```text
Employee
Date
```

and see:

- start of day,
- location sequence,
- customer visits,
- check-in,
- check-out,
- timestamps,
- route path,
- visit outcome.

Example:

```text
Employee: Rafiq Ahmed
Date: 24 Aug 2026

09:04  Work Tracking Started
09:40  Popular Hospital Uttara — Check In
10:24  Popular Hospital Uttara — Check Out
11:18  Clinic ABC — Check In
12:02  Clinic ABC — Check Out
```

Draw the route polyline from stored coordinate points.

Do not calculate route distance from arbitrary fixed multipliers.

---

## 14. Two Different Location Concepts

Do not mix these.

### Visit Verification

Capture:

```text
customer
check-in time
check-in latitude
check-in longitude
GPS accuracy
check-out time
check-out latitude
check-out longitude
visit outcome
remarks
```

### Live / Work Tracking

Capture:

```text
tracking session
periodic coordinates
timestamps
accuracy
optional speed/heading
```

A visit may happen inside a tracking session.

---

## 15. Current Web Can Also Produce Location

The future mobile app is not the only possible data producer.

The web version can support:

```text
navigator.geolocation.getCurrentPosition()
```

for:

- check-in,
- check-out,
- visit capture.

It can also use:

```text
navigator.geolocation.watchPosition()
```

for foreground live tracking.

Therefore both clients can use the same backend:

```text
Web ERP / Web Sales
          │
          │
Mobile Sales App
          │
          ▼
   Shared Location API
          ▼
      Supabase
          ▼
   Manager Live Map
```

---

## 16. Important Web Limitation

Do not promise reliable background live tracking from browser web.

Browsers may stop or throttle location when:

- the tab is backgrounded,
- screen locks,
- browser closes,
- OS suspends the process.

Therefore:

### Web

Good for:

- check-in/out,
- visit verification,
- foreground tracking.

### Future Mobile App

Required for:

- reliable background GPS tracking,
- long-running field tracking,
- offline/background sync.

The backend/data model should support both from the beginning.

---

## 17. Location Data Model

Design now even if mock API is used.

### Current Employee Location

```ts
type EmployeeCurrentLocation = {
  userId: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  heading?: number;
  speedMps?: number;

  recordedAt: string;
  receivedAt: string;

  source: "WEB" | "MOBILE";
  trackingSessionId?: string;

  status: "LIVE" | "RECENT" | "STALE" | "OFFLINE" | "NOT_TRACKING";
};
```

Future table:

```text
employee_location_current
```

One current row per employee.

Use this table for fast live-map rendering.

---

## 18. Location History

```ts
type EmployeeLocationPoint = {
  id: string;
  userId: string;
  trackingSessionId: string;

  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  heading?: number;
  speedMps?: number;

  recordedAt: string;
  source: "WEB" | "MOBILE";
};
```

Future table:

```text
employee_location_history
```

Use for:

- route history,
- travel timeline,
- historical playback.

Do not query thousands of historical points for the current live-map screen.

---

## 19. Tracking Sessions

```ts
type TrackingSession = {
  id: string;
  userId: string;

  startedAt: string;
  endedAt?: string;

  source: "WEB" | "MOBILE";

  status: "ACTIVE" | "ENDED" | "INTERRUPTED";
};
```

Future table:

```text
tracking_sessions
```

This allows:

```text
Start Work
↓
Location Updates
↓
Stop Work
```

---

## 20. Customer / Visit Location

Customer should eventually support:

```text
latitude
longitude
```

Visit:

```ts
type SalesVisit = {
  id: string;

  salesUserId: string;
  customerId: string;

  plannedDate?: string;

  checkInAt?: string;
  checkInLat?: number;
  checkInLng?: number;
  checkInAccuracyMeters?: number;

  checkOutAt?: string;
  checkOutLat?: number;
  checkOutLng?: number;

  status:
    | "PLANNED"
    | "CHECKED_IN"
    | "COMPLETED"
    | "MISSED"
    | "CANCELLED";

  outcome?: string;
  remarks?: string;
};
```

This becomes the base for:

- visit logging,
- location verification,
- daily plans,
- feedback,
- leads/follow-up reporting.

---

## 21. Realtime Architecture

Future production path:

```text
Mobile/Web sends location
        ↓
Supabase database
        ↓
employee_location_current updated
        ↓
Supabase Realtime
        ↓
Manager browser subscription
        ↓
Marker moves on map
```

Use realtime only for current-location updates.

Do not realtime-stream the entire history table to every manager.

---

## 22. GPS Update Frequency

Do not attempt ride-sharing-app frequency.

Recommended production behavior:

```text
15–30 seconds while actively moving
```

or use movement thresholds such as:

```text
send only when moved > 25–50 meters
```

plus a periodic heartbeat.

The exact production frequency should remain configurable.

---

## 23. Privacy / Access

Location is sensitive employee data.

Recommended access:

### Super Admin
Full field-team map.

### Managing Director
Full operational map.

### Sales Manager
Sales-team map.

### Sales Executive
Own location/activity only.

### Accounts
No live map by default.

### Import / Warehouse
No field-sales location by default.

Do not expose tracking information merely because a role can access Reports.

---

## 24. Location Audit

Track important actions:

```text
Tracking Started
Tracking Ended
Visit Check-In
Visit Check-Out
Manual Location Entry [if ever allowed]
Location Permission Denied
```

Do not audit every single periodic coordinate into the normal audit log.

The location history itself stores those points.

---

## 25. Demo / Mock Implementation Now

Because the mobile app does not exist yet, current web demo can include mock field-location data.

Clearly label it:

```text
Demo location feed
```

Mock data should still behave realistically:

- multiple employees,
- multiple territories,
- last-updated timestamps,
- active/inactive state,
- route points,
- visits.

Do not present mock movement as real tracking.

---

## 26. API Contract Now

Add a replaceable service boundary.

Suggested endpoints:

```text
GET /api/field-team/current
GET /api/field-team/employees
GET /api/field-team/:userId/history?date=
GET /api/field-team/:userId/visits?from=&to=

POST /api/field-team/tracking/start
POST /api/field-team/tracking/location
POST /api/field-team/tracking/stop

POST /api/field-team/visits/:visitId/check-in
POST /api/field-team/visits/:visitId/check-out
```

For the current frontend demo, only GET endpoints need to be fully functional unless web location capture is also demonstrated.

Keep POST interfaces typed and ready.

---

## 27. Employee Selection — Current Dropdown Must Scale Better

The new salesperson-performance implementation is functionally correct.

The current normal `<select>` is fine for a few people but will become difficult with many employees.

Replace it with a shared:

```text
EmployeePicker
```

---

## 28. EmployeePicker

Suggested capabilities:

- search by name,
- search by employee ID,
- search by territory,
- keyboard navigation,
- All Employees option,
- selected employee summary.

Example:

```text
Employee

┌──────────────────────────────────┐
│ 🔍 Search name / ID / territory  │
├──────────────────────────────────┤
│ All Sales Employees              │
│                                  │
│ Rafiq Ahmed                      │
│ SE-001 · Dhaka North             │
│                                  │
│ Mahmud Hasan                     │
│ SE-014 · Uttara                  │
└──────────────────────────────────┘
```

Use the same picker in:

- salesperson reports,
- Field Team,
- route history,
- future visit reports,
- future target assignment.

---

## 29. Territory Filter

For management-facing employee views add:

```text
Territory [All]
```

Then employee search can be reduced to employees in that territory.

---

## 30. Large Employee Lists

When real backend exists:

```text
GET /api/users/salespeople?search=&territory=&page=
```

Use debounced server-side search.

For current mock data, client-side filtering is fine.

---

## 31. All-Employee Performance Table

The All Employees report should support:

- employee search,
- territory filter,
- sortable columns,
- pagination.

Useful sort fields:

```text
Delivered Sales
Collections
Quotation Conversion
Orders
Outstanding Due
```

Do not add advanced table virtualization until needed.

---

## 32. Employee Report + Field Team Integration

From Employee Performance:

```text
[View Field Activity]
```

From Field Team employee card:

```text
[Open Employee Report]
```

This connects:

```text
Performance
↔
Field Activity
```

without new navigation.

---

## 33. AI Requirement Alignment

The current implementation already follows the important client principle:

```text
AI assists
AI extracts
AI validates
AI alerts
AI recommends

Human/system rules approve and post
```

Keep that architecture.

The logical AI requirement categories are:

- Document Agent
- Costing Agent
- Inventory Agent
- Sales Agent
- Collection Agent
- Finance Agent
- Insight Agent

These are capabilities, not necessarily separate UI pages.

---

## 34. Current AI Coverage

| AI requirement | Current state | Next action |
|---|---|---|
| Document extraction | Good prototype | Keep / later real parser |
| Costing intelligence | Partial | Add exception checks |
| Inventory alerts | Good | Keep |
| Sales follow-up | Basic | Improve gradually |
| Collection risk | Basic | Add aging/risk factors |
| Finance exception/reconciliation | Deferred | Keep deferred until accounting scope confirmed |
| Management insight | Basic | Add Smart Insights overview |
| GPS/visit intelligence | Not yet | Add after Field Team data exists |

---

## 35. Costing AI — Small Enhancement

Do not let AI calculate landed cost.

The deterministic landed-cost engine remains authoritative.

Add exception analysis:

```text
Allocation reconciliation
Missing supporting document
High freight per CBM
Large cost variance vs previous shipment
Unusual landed-cost increase
Exchange-rate issue
Unallocated/manual cost warning
```

Only show historical comparison when reliable comparable history exists.

---

## 36. Collection Risk

Improve recommendations using:

```text
current outstanding due
age of due
last collection date
last delivery date
payment terms
partial-payment pattern
customer credit limit
```

Example:

```text
High Follow-Up Priority

Customer: ...
Outstanding: Tk ...
Last collection: 18 days ago

Reason:
Large due remains after recent delivery.

[Open Customer]
```

This should remain rule-backed initially.

---

## 37. GPS / Visit AI Later

When field-team data exists, AI may answer:

```text
How many visits did Rafiq complete today?
Who has not started field work?
Which planned visits were missed?
Which customers need follow-up after today's visits?
Summarize Dhaka North activity.
```

AI summarizes.

The tracking engine itself remains non-AI.

---

## 38. Smart Insights Overview

Add a lightweight secondary page:

```text
/app/insights
```

Name:

```text
Smart Insights
```

Entry point:

```text
Dashboard
Smart Operational Alerts
[View All Insights]
```

Also optionally from the floating assistant:

```text
[View All Insights]
```

Do **not** add it to the main sidebar.

Do **not** recreate the old AI Command Center.

---

## 39. Smart Insights Page

Purpose:

Provide one review queue when the number of alerts grows beyond what Dashboard can show.

Filters:

```text
All
Imports
Inventory
Sales
Collections
Finance
Field Team
```

Optional:

```text
Severity
Status
```

Each card:

```text
Severity
Category
Title
Summary
Reason
Recommended Action
Source Record
Detected Time

[View Source]
[Dismiss]
```

Do not add complex “agent status” widgets.

---

## 40. Smart Insights Role Scope

### Super Admin / MD
Cross-business insights.

### Import Officer
Import insights.

### Warehouse Manager
Inventory/FIFO/expiry insights.

### Sales Manager
Sales/collection/field-team insights.

### Sales Executive
Own customer/follow-up/field activity insights only.

### Accounts
Financial/collection/expense insights where allowed.

The same authorization logic used by floating AI must be used by Smart Insights.

---

## 41. Floating AI + Smart Insights Relationship

Use the two surfaces differently.

### Floating AI
Best for:

- questions,
- current-page explanation,
- quick contextual help.

### Smart Insights
Best for:

- passive alerts,
- review queue,
- management overview,
- cross-workflow exceptions.

Do not duplicate entire content.

---

## 42. Dashboard Changes

Keep the current dashboard.

Enhance Smart Operational Alerts with:

```text
View All Insights →
```

For Sales Manager/MD/Super Admin, optionally add a compact card:

```text
Field Team
Active Now: 8
Offline: 2
Visits Today: 31

[Open Live Map]
```

Keep it compact.

---

## 43. Reports Changes

The new Salesperson Performance report is good.

Make only these improvements:

1. Replace native employee dropdown with `EmployeePicker`.
2. Add territory filter for management roles.
3. Search/sort/paginate All Employees table.
4. Add `View Field Activity`.
5. Later incorporate mobile/web visit metrics into the same report.

Do not create a second Employee Reports module.

---

## 44. Future Employee Performance Expansion

After Field Team/mobile data exists, add:

```text
Working Days
Check-In Time
Check-Out Time
Planned Visits
Completed Visits
Missed Visits
New Leads
Follow-Ups
Accepted Quotations
Orders
Delivered Sales
Collections
Target
Achievement %
```

The report should evolve instead of being replaced.

---

## 45. Salesperson Web Entry Later

The client expects salespeople to eventually be able to use both web and mobile.

Therefore the core sales workflows must not be mobile-only.

The web should eventually support salesperson entry for:

- daily plan,
- monthly plan,
- visit outcome,
- lead,
- follow-up,
- quotation,
- order,
- collection.

Do not build all of these in this location update unless required for current demo.

First establish:

- Field Team viewer,
- location schema,
- employee picker,
- visit/location data contracts.

---

## 46. Recommended Shared Components

```text
src/components/field-team/
  FieldTeamPage.tsx
  LiveTeamMap.tsx
  EmployeeMapMarker.tsx
  FieldEmployeeList.tsx
  RouteHistoryMap.tsx
  VisitTimeline.tsx
  TrackingStatusBadge.tsx

src/components/employees/
  EmployeePicker.tsx

src/components/ai/
  SmartInsightsPage.tsx
  AIRecommendationCard.tsx
```

Do not over-abstract.

---

## 47. Suggested Services

```text
fieldTeamService.current()
fieldTeamService.employees(...)
fieldTeamService.history(userId, date)
fieldTeamService.visits(userId, from, to)
```

Future:

```text
fieldTeamService.startTracking()
fieldTeamService.sendLocation()
fieldTeamService.stopTracking()

fieldTeamService.checkInVisit()
fieldTeamService.checkOutVisit()
```

---

## 48. Suggested Routes

Do not add to primary sidebar.

Inside Sales:

```text
/app/sales?view=field-team
```

or:

```text
/app/sales/field-team
```

Use whichever matches the current Sales routing structure.

Secondary:

```text
/app/insights
```

linked only from Dashboard/AI.

---

## 49. Map Data Privacy Tests

Must test:

- Sales Executive cannot query another rep's live location.
- Sales Manager can query allowed team.
- Unauthorized roles get 403.
- stale location is not labelled Live.
- no hidden financial data is included in map payload.
- source route/customer details follow sales scope.
- history endpoint enforces the same scope.

---

## 50. Employee Picker Tests

- search by name,
- search by ID,
- search by territory,
- All Employees works for allowed managers,
- Sales Executive only sees self,
- selection survives report refetch,
- no huge native-select rendering.

---

## 51. AI Tests

Keep existing tests and add:

- Smart Insights respects role access.
- Field Team AI never exposes another rep to Sales Executive.
- MD/Sales Manager field summary uses allowed employees.
- cost exception analysis does not expose cost to unauthorized roles.
- floating chat links correctly to Field Team/employee report.
- Smart Insights does not directly execute operational transactions.

---

## 52. Field Team UAT

### Scenario A — Manager Live Map

1. Login as Sales Manager.
2. Sales → Field Team.
3. See all allowed salespeople.
4. Filter by territory.
5. Filter Live only.
6. Click employee.
7. See last update and current/last visit.
8. Open employee report.

### Scenario B — Route History

1. Select employee.
2. Select date.
3. Open Route History.
4. Map shows stored coordinates.
5. Timeline shows visits/check-ins.
6. No fake route distance.

### Scenario C — Sales Executive

1. Login as Sales Executive.
2. If My Activity is enabled, only self is visible.
3. Direct URL for another employee returns 403.

### Scenario D — Realtime Simulation

1. Mock employee coordinate changes.
2. Current location endpoint updates.
3. Live marker moves.
4. Last-updated time changes.
5. Stale state is applied after timeout.

---

## 53. Smart Insights UAT

1. Dashboard shows top alerts.
2. Click View All Insights.
3. Open Smart Insights.
4. Filter Inventory.
5. See FIFO/expiry issues.
6. Filter Sales.
7. See follow-up/collection issues.
8. Open source.
9. Dismiss one alert.
10. No transaction is posted by dismissal.

---

## 54. Priority Backlog

### P0 — Next Update

#### Field Team
1. Create Field Team Sales subview.
2. Add real coordinate-based map component.
3. Add mock current-location data/API.
4. Add employee side list.
5. Add employee/territory/status filtering.
6. Add marker detail panel.
7. Add route-history view.
8. Add visit timeline mock/API contract.
9. Add role-based field-team access.

#### Employee Selection
10. Create reusable EmployeePicker.
11. Replace Salesperson Performance native select.
12. Add territory filter.
13. Add All Employee search/sort/pagination.

#### AI
14. Add Dashboard → View All Insights.
15. Add Smart Insights page.
16. Reuse current AI recommendation endpoint.
17. Add Field Team category support.
18. Keep floating assistant unchanged except new contextual prompts/links.

### P1
19. Web check-in/check-out with browser geolocation.
20. Foreground web tracking prototype.
21. Costing exception intelligence.
22. Richer collection risk rules.
23. Employee report → field activity link.
24. Field employee card → performance report link.
25. Persist Smart Insight read/dismiss state later.

### P2 — Real Backend / Mobile
26. Supabase `employee_location_current`.
27. Supabase `employee_location_history`.
28. Supabase `tracking_sessions`.
29. Supabase `sales_visits`.
30. Realtime subscriptions.
31. Mobile background GPS.
32. Offline location/event queue.
33. Daily/monthly plans.
34. Leads/follow-ups.
35. Actual route history.
36. AI field-sales summaries.
37. LangChain/LangGraph integration.

---

## 55. Things Not To Do

Do not:

- restore the old MobileSalesControlPage,
- use CSS dots over an iframe as tracking,
- calculate route distance from number of stops,
- call stale data “live”,
- add GPS as a main sidebar module,
- add AI Command Center,
- duplicate employee reports,
- create separate web/mobile business models,
- make AI responsible for GPS tracking,
- make AI responsible for FIFO/cost calculations,
- expose live employee location to every ERP role,
- use one huge native select for hundreds of employees,
- claim web background tracking will work after browser closure.

---

## 56. Definition of “Web Fully Implemented”

Before mobile development begins, the web ERP should already contain the complete management side:

```text
Sales Manager / MD
        ↓
Field Team
        ↓
Live/Last Location Map
        ↓
Employee Detail
        ↓
Visit / Route History
        ↓
Employee Performance
```

and expose API contracts for:

```text
Check In
Check Out
Location Update
Visit Check In
Visit Check Out
```

The future mobile app then becomes another client that writes to these same services.

---

## 57. Final Architecture

```text
                         ┌─────────────────────┐
                         │ Floating MIPRO AI   │
                         └──────────┬──────────┘
                                    │
                           Smart Insights
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
       Imports                  Inventory                  Sales
          │                         │                         │
 Documents/Costing          FIFO/Expiry Alerts             │
                                                            │
                                                ┌───────────┴───────────┐
                                                │                       │
                                          Sales Workflow           Field Team
                                                                      │
                                                        ┌─────────────┴─────────────┐
                                                        │                           │
                                                    Live Map                 Route / Visits
                                                        │                           │
                                                        └─────────────┬─────────────┘
                                                                      │
                                                               Employee Report
                                                                      │
                                                                   Reports
```

Future location source:

```text
Web Sales Interface ──────┐
                          │
Mobile Sales App ─────────┼──→ Shared API / Supabase
                          │          │
                          │          ├── Current Location
                          │          ├── Location History
                          │          ├── Visits
                          │          └── Tracking Sessions
                          │
                          └────────────→ ERP Live Map
```

---

## 58. Exact Next Milestone

Name the next implementation milestone:

# **Field Team Web + Scalable Employee Selection + Smart Insights**

Deliver:

### Field Team
- live/last-location map,
- employee list,
- territory/status filters,
- employee detail,
- route history,
- visit timeline,
- role-safe mock APIs.

### Reports
- reusable searchable EmployeePicker,
- territory filter,
- scalable All Employees comparison.

### AI
- Smart Insights page,
- View All Insights link,
- Field Team insight category,
- contextual Field Team questions,
- no AI Command Center.

### Architecture
- location types,
- replaceable `fieldTeamService`,
- future Supabase-compatible schemas,
- web/mobile shared contracts.

This update should **not change the corrected import, costing, warehouse, sales, document, print, role/capability, or current AI workflow** unless required for integration.

---

**End of Plan**
