# MIPRO Digital Platform

## Client Presentation Guide

**Build:** Corporate MiproBD website plus protected workflow-driven ERP, updated through the supplied dialysis literature and handwritten sales/report-system refinement

**Primary requirements:** `files/MIPRO_ERP_Simplified_Plan_update10.md` and `files/MIPRO_ERP_Reports_Deep_Analysis_Update10.md`, consolidating every printable report under one HishabPati-inspired catalogue while retaining MIPRO workflows, RBAC and stationery; supported by the supplied product literature and earlier validated plans
**Purpose:** Explain what the system does, how information moves, who performs each action, and what the prototype proves.

### Hosted Backend Update 12 (25 October 2026)

The walkthrough below describes the historical `/app` prototype unless explicitly stated otherwise. For the real hosted development backend, open `/backend`; its current acceptance and remaining production gaps are in `PRODUCTION_BACKEND_PROGRESS.md`.

**Current public website:** Public pages are a static brochure/catalogue/news bundle, not ERP data screens. Visitors can browse without an account or ERP API. The Contact form prepares an unsent email/WhatsApp draft; the visitor sends it from that app. Content changes currently require a rebuild/deployment.

**AI is later:** The persistent ERP has no active AI assistant, extraction or model integration. Historical AI demonstrations elsewhere in this guide are prototype-only and are not part of the current backend presentation.

**Current account security:** Profile & Security contains authenticator setup. Production privileged accounts must verify a current code before opening ERP data. Other sessions are revoked after verification; no role switching or public employee registration is provided.

**Current dashboard:** `/backend` shows saved business totals with no more than six role-safe KPIs. Choose dates for net invoiced sales, allocated collections and period profit; stock, pipeline, expiry and pending follow-ups remain current. Open the relevant workspace from each section. Dashboard figures reconcile to Reports and the stock/customer/cash journals, not separately maintained demo totals.

**Current settings:** Settings > Operational Settings contains the single Main Warehouse contact/BIN suggestions, import cost presets and Super Admin Client Confirmation Queue. Presets appear while entering an import cost but the user still explicitly chooses its allocation basis. Existing finalized costs and receipts are never rewritten. Recording a client decision retains approval evidence without silently enabling an unfinished feature.

**Real field workflow:** Sales & Marketing > Marketing > My Field Day / Visits > Check In. Select an assigned customer/lead and purpose, take a permitted photo or explain its absence, capture location and save. The server records employee, receipt time, accuracy, policy/site version and private evidence. Complete Visit saves an outcome and optional follow-up. New prospects must first be saved as Leads.

**Management:** Employees > Team Activity > My Field Day / Visits. Authorized managers review their reporting team; MD can review company-wide without edit permission. Open a visit for the immutable timeline, photo and optional **Show Map**. A map pin means a past reported check-in, not current employee location. The map loads only on request and discloses its approximate area/viewer IP to OSM. Reviews require a reason and cannot be self-approved.

**Reports:** Reports > Employee & Marketing > Field Visit Report. Choose period/employee/customer/lead/location quality/review/status, then use the same **Print Preview** workflow and two letterhead modes. Screen/A4 groups the detailed export fields into six readable columns. No signed photo URL or exact coordinate enters CSV/PDF. Employee performance separates check-ins, accepted reviews and manual notes; check-ins award no visit points or financial postings.

**Limits:** The old foreground tracking, route trails, check-out GPS/photos, automatic plan completion and demo location-feed descriptions elsewhere in this historical guide are **not** features of the hosted foundation implementation. Production field submission remains gated until privacy/retention approval is recorded. Native-device HTTPS UAT, deployed acceptance and operational retention/restore remain pending; this increment is not a declaration that the whole ERP is production-ready.

---

## 1. The One-Minute Explanation

The product is now one digital platform with a deliberate public/private boundary:

```text
PUBLIC WEBSITE
MIPRO Healthcare Corporation / MiproBD
Home -> About -> Products -> Certificates -> News -> Contact
                              |
                              v
                       Employee Portal
                              |
                              v
PROTECTED MIPRO ERP
Imports -> Inventory -> Sales & Marketing -> Expenses & Accounts
                    Employees -> Reports -> Settings
```

The public website explains MIPRO's healthcare supply business and provides a B2B product catalogue and business inquiry. Its visual homepage rotates approved product and distribution messages, calculates published catalogue/document counts, filters product families, and lets visitors inspect the supply process. A four-view literature section presents Product Catalogue, Hemodialyzer, Blood Tubing and A.V. Fistula sheets with direct source-PDF access. Core product pages use crops from those client-supplied sheets and expose model, gauge, sterilization and packing facts with exact-model disclaimers. It never exposes ERP stock, costs, supplier terms, internal sales or mock management figures.

Super Admin controls that content inside `Settings -> Website Content`:

```text
Super Admin input
  -> hero / category / public product / document / resource
  -> publish or keep as draft
  -> /api/public/* returns published projection only
  -> public website updates without reading ERP inventory
```

The public product record is not the ERP product master. The public record contains approved images, descriptions, variants, specifications and document relationships. The ERP record contains internal code, unit, price, stock, landed cost and aliases. This separation is the control that prevents confidential operational data from leaking onto the website.

Employee accounts are created internally by Super Admin; the public Request Access flow has been removed. The first Super Admin is provisioned once through the production identity/backend deployment process. After that, the owner creates employees under `Employees -> Employee Directory` and assigns access under `Employees -> Access & Roles`; routine direct database editing and public owner registration are both avoided.

Inside the protected boundary, MIPRO ERP connects two real business flows through warehouse stock:


```text
IMPORT AND LANDED COST
PO -> Supplier -> PI -> LC or TT -> Shipment -> Costs -> Finalized landed cost
                                                             |
                                                             v
                                                    WAREHOUSE STOCK
                                                             |
                                                             v
SALES, RECEIVABLE AND COLLECTION
Customer -> Quotation -> Order -> Delivery Challan -> Invoice approval -> Collection
```

One import record represents one shipment or consignment and may contain many products. The record begins with an internal reference such as `IMP-2026-001`. When an LC is opened, its LC number becomes the main visible reference without recreating the record.

Each shipment cost has its own allocation rule. Finalized landed cost flows into warehouse batches. A delivery consumes an actual batch but does not create receivable. Invoice approval posts customer/order due; collection then reduces that due and updates the chosen cash or bank account. Daily operating expenses remain separate from product landed cost.

---

## 2. Why This Version Is Different

The latest client meetings and actual spreadsheets showed that the earlier prototype was too broad. This replacement is organized around connected work instead of dozens of generic modules.

### Current application

- Dynamic corporate public website with managed hero slides, catalogue counts, product-family filters, interactive supply stages, client-supplied dialysis literature, and no e-commerce cart.
- Super Admin Website Content workspace for public company details, map, categories, products, documents, resources and inquiry follow-up.
- Public content CRUD remains separate from ERP product CRUD and flows through typed API contracts.
- Registered MIPRO identity, product imagery, corporate About, curated resources, contact map and inquiry flow.
- Authorized manufacturer certificate scans migrated from the previous MiproBD site, with holder, product scope, visible dates, current/historical status, preview and download; none are presented as MIPRO corporate certificates.
- Employee Portal login that is production-safe by default; demo users require `VITE_DEMO_MODE=true`.
- Public signup removed; employee provisioning and access administration live in the protected Employees hub.
- Seven stable role templates plus per-user Allow/Deny exceptions, without inventing a new role for every staff variation.
- Delegated employee administration is separate from role, permission and sensitive-capability administration.
- SEO metadata, sitemap, robots rules and old MiproBD product redirects.
- Eight possible main destinations for Super Admin, grouped as Workspace, Operations, Management, and System; each role sees only relevant destinations.
- Draft imports begin with supplier, PO and product lines; PI and LC/TT are added later to the same case.
- One import workspace instead of separate PI, PO, LC, shipment, customs, costing, and GRN pages.
- One sales workspace instead of disconnected quotation, order, challan, and collection pages.
- One-click **Sales & Marketing -> Marketing** hub for daily activity, leads, follow-ups, funnel, plans, targets, field verification, team performance, and practical report shortcuts.
- One unified marketing feed that combines employee-entered work with authoritative quotation, order, delivery, collection, visit, follow-up, and lead-conversion events.
- Qualified website inquiry conversion into an assigned marketing lead, with no automatic conversion of unreviewed inquiries.
- Server-derived milestones instead of manually selectable financial/warehouse statuses.
- FIFO issue allocation can split one requested quantity across several oldest eligible batches, with expired stock excluded.
- Sensitive product cost and profit protected by explicit capability.
- Narrow operational accounts, not a premature full accounting package.
- Realistic local medical product images and client-like sample records.
- Actual MIPRO and LED TRACKERS stationery backgrounds plus calibrated digital/preprinted A4 modes.
- Employee-linked Daily, Weekly, Monthly, and Custom summaries in Employees, with full configuration, CSV and official A4 output centralized under Reports.
- Protected PDF/image viewing for import, cost, and expense evidence.
- Floating contextual MIPRO AI, reviewed document extraction, and smart operational recommendations.
- A canonical coordinate-based **Employees -> Field Team** management workspace, with a Sales & Marketing shortcut and a self-only field/check-in experience for Sales Executives.
- One Employees destination composing Employee Directory, Login Account, Access & Roles, Field Team, and a compact Activity Summary from existing user, RBAC, Marketing, sales, collection, plan, and location records.
- Marketing dashboard polling every 12 seconds, real timestamps for new quotation/order/delivery/collection events, and honest `Time unavailable` labels on legacy date-only records.
- Searchable EmployeePicker, clickable employee names, territory filtering and compact employee performance context, with printable employee reports opened in Reports.
- A role-safe Smart Insights review queue linked from Dashboard, without adding another main destination.

### Intentionally deferred

- Native mobile application and reliable background tracking after browser closure
- Production Supabase realtime location feed and durable location history
- HR and payroll
- Fleet management
- Full general ledger, trial balance, and balance sheet
- Automatic customs, VAT, AIT, or HS-code duty formulas

There is no separate GPS sidebar module or AI Command Center. Field Team management stays under Employees, Marketing links to it, Smart Insights is a secondary Dashboard route, and the floating assistant remains contextual. The web currently consumes a clearly labelled demo location feed through the same typed contracts intended for the future mobile client.

---

## 3. Main Navigation

| Area | Business purpose |
|---|---|
| Dashboard | Role-safe KPIs and items requiring action |
| Imports | One case from commercial setup through cost and receiving |
| Inventory | Stock, batches, expiry awareness, and movement history |
| Sales & Marketing | Marketing work, customers, quotations/orders, deliveries, and collections |
| Expenses & Accounts | Operating expenses, cash/bank, dues, and transaction ledger |
| Employees | Employee profiles and login accounts, access and roles, field team, activity and performance |
| Reports | Grouped operational reports and narrow audit history |
| Settings | Website Content, product/supplier master data, business setup, migration, print identity, and open client decisions |

Workflow stages appear inside these areas as sections or segmented views. They are not extra navigation modules.

---

## 4. Role Access

The login page selects a seeded user identity for the demonstration. It does not temporarily impersonate a role, and there is no role switch after login. In production, authorized administrators create employee accounts in Employees.

The seven roles remain understandable default templates:

| Role | Default main navigation | Contextual access |
|---|---|---|
| Super Admin / Owner | All eight areas | Full owner-authorized actions and access administration |
| Managing Director | Dashboard, Imports, Inventory, Sales & Marketing, Expenses & Accounts, Employees, Reports | Review, all-sales Marketing visibility, Field Team, Activity Summary, target approval, and export |
| Import Officer | Dashboard, Imports, Settings | Commercial/import work plus permitted Product and Supplier setup |
| Warehouse Manager | Dashboard, Imports, Inventory | Finalized import receiving reference and warehouse work |
| Accounts | Dashboard, Sales & Marketing, Expenses & Accounts, Reports | Customer dues, collections, expenses, cash/bank |
| Sales Manager | Dashboard, Inventory, Sales & Marketing, Employees, Reports | Team Marketing, Field Team, employee activity/performance, targets, commercial records, available stock, and export |
| Sales Executive | Dashboard, Sales & Marketing, Reports | Own leads, visits, plans, customers, sales records, activity, and performance only; no team Employees hub |

The final access calculation is:

```text
Role default
  -> explicit per-user DENY or ALLOW
  -> sensitive capability check
  -> record/data scope
  -> sidebar, route, action, API, document, report and AI result
```

An explicit Deny wins. The current demo makes the behavior visible: Tanvir remains an Import Officer but receives Reports View/Export; Farhana remains a Sales Manager but receives delegated employee lifecycle access and has Reports Export denied. Farhana sees Employees directly but no Access & Roles tab; generic Settings is not exposed solely because she can maintain employees. Tanvir sees only his permitted Product/Supplier setup. No hybrid role is required.

Directly typing an unauthorized URL still shows **Access denied**, and a direct API attempt returns `403`. Menu hiding is only the first visible layer.

### Sensitive capabilities

- `view_sensitive_cost`
- `edit_sensitive_cost`
- `finalize_landed_cost`
- `reopen_landed_cost`
- `view_profit`
- `approve_stock_override`
- `approve_special_price`
- `manage_users`
- `manage_user_access`

`manage_users` permits employee lifecycle work only when the matching `users:view/create/edit` action is also allowed. `manage_user_access` controls role, password, permission and capability changes and is Super Admin-only in the current seed. The Super Admin is also the temporary sole landed-cost finalizer/reopener until the client confirms another authority.

---

## 5. Demo Login

Demo identities are intentionally hidden in production mode. For the presentation deployment, set `VITE_DEMO_MODE=true`. All active demo users then use:

```text
Password: password123
```

| Role | Email |
|---|---|
| Super Admin | `superadmin@mipro.local` |
| Managing Director | `md@mipro.local` |
| Accounts | `accounts@mipro.local` |
| Import Officer | `import@mipro.local` |
| Warehouse Manager | `warehouse@mipro.local` |
| Sales Manager | `salesmanager@mipro.local` |
| Sales Executive | `sales1@mipro.local` |

Use Super Admin for the complete presentation. Sign out and use one other role near the end to prove access control.

---

## 6. Responsibility And Approval Matrix

| Record or action | Who enters it | Who may edit it | Delete/cancel rule | Who approves/posts | Result |
|---|---|---|---|---|---|
| Public site settings / hero / category | Super Admin | Super Admin | Hero keeps at least one published slide; category deletion is blocked while products use it | Super Admin chooses Draft or Published | Header, homepage, contact, map and catalogue discovery update through public APIs |
| Public product | Super Admin | Super Admin | Independent public record may be unpublished or deleted without touching ERP stock | Super Admin chooses Draft, Published and Featured | Approved image/copy/specifications appear publicly; no price, cost, stock or supplier data is exposed |
| Public certificate / resource | Super Admin | Super Admin | Delete removes only the public projection and cleans public relationships | Super Admin verifies ownership/scope and publication state | Approved document or guidance appears on Certificates/Resources |
| Website business inquiry | Public visitor submits validated form | Super Admin records status and internal follow-up note | Unconverted prototype inquiry may be removed; a converted inquiry is retained | Super Admin qualifies, then explicitly assigns and converts | Qualified inquiry becomes one Marketing lead; never creates an ERP login |
| ERP product | Super Admin or Import Officer | Same permitted roles | Super Admin deletes only when unreferenced; otherwise deactivate | No separate approval | Approved internal item used by import, stock, and sales |
| Product alias | Super Admin | Super Admin | Remove mapping without deleting the product | Super Admin | Legacy spreadsheet spelling maps to one product |
| Supplier | Super Admin or Import Officer | Same permitted roles | Super Admin deletes only when unreferenced | No separate approval | Reused by import cases |
| Import commercial data | Import Officer or Super Admin | Same roles before finalization | Draft/unposted case only | No separate approval | One connected import case |
| Import product line | Import Officer or Super Admin | Same roles before finalization | Before cost finalization | No separate approval | Quantity, FOB, CBM, and HS reference |
| Import document/file | Import users | Import users | Protected after transaction use | Human reviews any extracted fields | PI, LC, BL, customs, and other evidence opens through an authorized viewer |
| Import cost line/file | User with `edit_sensitive_cost` | Same capability before finalization | Before finalization | Owner reviews through preview | Named cost, allocation rule, and protected supporting evidence |
| Finalized landed cost | System calculates | Locked after finalization | Never physically deleted | `finalize_landed_cost` | Historical per-product/per-unit cost; immutable snapshot retained in audit data |
| Reopen landed cost | Not applicable | Authorized owner with reason, before first receipt only | Old snapshot remains in history | `reopen_landed_cost` | Audited correction cycle; post-receipt reopen is blocked |
| Warehouse receipt | Warehouse Manager or Super Admin | Posted as a receipt transaction | No silent delete | Receiving user posts | Batch/lot stock and stock-in movement |
| Customer | Sales Manager, Sales Executive, Super Admin | Own-record scope for Sales Executive | Only when no protected transactions | No approval in current scope | One customer profile and running ledger |
| Marketing lead | Sales Executive creates own; Sales Manager/Super Admin assign within scope | Assigned employee or authorized manager | Mark Lost with a reason; keep history | No separate approval | Follow-up, visit, conversion, and quotation retain one lead reference |
| Daily activity | Signed-in Sales Executive only | Own scoped record | No transaction event may be manually imitated | Session identity and API validation | Live feed updates; meaningful activity may advance the lead monotonically |
| Follow-up / plan | Sales Executive for self; manager within team scope | Same permitted scope | Complete, reschedule, or cancel instead of deleting history | Monthly plan may be approved by management | Today/overdue queues and plan-versus-actual remain connected |
| Marketing target / score rule | Manager sets team targets; Super Admin configures score weights | Same authority | Historical ERP events remain authoritative | `marketing:approve`; score configuration is Super Admin-only | Delivered sales, posted collection, verified visits, customers, and system events determine actuals |
| Quotation | Sales Manager, Sales Executive, Super Admin | Draft/active quote owner | Draft/rejected only | Accepted quote converts to order | Carries lines forward |
| Sales order | Created from accepted quotation | No duplicate line entry | Cancel rules belong to production backend | Conversion action | Delivery-ready commercial commitment |
| Delivery challan | Warehouse Manager, Sales Manager, Super Admin | Posted transaction | No silent delete | Dispatch user posts | FIFO may create several batch lines; stock-out and customer due post together |
| FIFO override | Authorized dispatch user | Reason is required | Audit event is permanent | `approve_stock_override` | Newer lot may be used exceptionally |
| Collection | Accounts, Sales Manager, Sales Executive, Super Admin | Production will use reversal/correction | No silent delete | Posting user | Reduces due and increases chosen account |
| Expense | Accounts or Super Admin | Correct through reversal | Reverse with reason | Accounts/Super Admin posts | Reduces selected cash/bank account |
| Expense category | Super Admin | Super Admin | Protect referenced categories | Super Admin | Dynamic daily expense classification |
| Opening stock batch | Super Admin | Posted migration transaction | No silent delete | Super Admin posts | Legacy lot joins FIFO/expiry stock |
| Customer opening balance | Super Admin | Posted migration transaction | One opening per customer | Super Admin posts | First running-ledger due at cutover |
| Employee/user profile | Super Admin or delegated lower-role employee manager | Only lower-ranked employees; never self, peers, higher roles or Super Admin | Deactivate rather than erase history; final active Super Admin is protected | `manage_users` plus matching `users:*` action | Employment/status update with audit history |
| Role/permission/capability/password | Super Admin or explicit access manager | Protected by hierarchy and grant-authority checks | No hard-delete; every access change is audited | `manage_user_access`; only Super Admin can delegate that authority | Effective route, action, document and sensitive-field access |
| Employee activity/performance | Sales Executive enters manual work; field/sales/collection flows add system events | Employee owns submitted work; managers review permitted team | Business history is retained; corrections follow source workflow | No manual actual approval | Employees view combines visits, leads, follow-ups, quotes, orders, delivery, collection, score and target progress |
| AI extraction | Import user requests it | User selects fields to apply through normal forms | Extraction itself changes nothing | Human review is mandatory | Suggested values pass through existing validation and audit |
| AI recommendation/chat | System reads role-scoped records | User may dismiss locally or open its source | No operational record is deleted | AI cannot approve/post/finalize | Explanation and next-step guidance only |
| Current field location | Signed-in salesperson foreground web client now; mobile client later | The same salesperson supplies newer points | Coordinates stay as history; no ordinary delete | Tracking session and API scope validate the write | Role-scoped live/last marker with timestamp and accuracy |
| Customer visit verification | Assigned Sales Executive | Check-out adds products, outcome, next follow-up, remarks, and evidence | Historical visit event remains | Assigned employee performs fresh GPS check-in/out | Visit, daily plan, follow-up, activity feed, map, and report update together |
| Smart Insight | Rule-backed API creates it | User can filter or dismiss locally | Dismissal posts no transaction | Normal source workflow remains authoritative | One role-safe review queue across permitted areas |
| Client decision | Super Admin records confirmation | Super Admin | Audit-worthy status change | Client confirms externally | Prevents assumptions being hard-coded |

---

## 7. How Data Connects

### 7.1 Master data starts the chain

```text
Settings
  Products -----------+
  Suppliers ----------+--> Import Case
  Cost Presets -------+
  Warehouse ----------+--> Warehouse Receipt
  Customers ----------+--> Quotation
  Cash/Bank Accounts -+--> Collection and Expense
  Print Configuration +--> Printed documents
```

Users select existing records instead of repeatedly typing names. Product variants such as Dialyzer 1.7H and 1.7L remain distinct approved products.

### 7.2 Import creates stock

```text
ImportCase
  + ImportItems
  + Documents
  + ImportCostLines
       |
       v
Cost Preview -> Exact allocations -> Finalized LandedCostSnapshot
                                             |
                                             v
                                   WarehouseReceipt
                                             |
                                             v
                                  StockBatch + StockIn Movement
```

The receiving user enters received/rejected quantity, lot, batch, manufacturing date, expiry, warehouse, and location. Product identity, import reference, and landed cost are inherited from the finalized snapshot.

The browser may show calculated FOB/CBM immediately, but the API recomputes quantity x FOB/unit x captured exchange rate and cartons x CBM/carton with Decimal arithmetic. Totals sent by the browser are never treated as authoritative.

### 7.3 Sales consumes stock

```text
Customer -> Quotation -> Accepted -> SalesOrder
                                      |
                                      v
                            Delivery + FIFO batch plan
                                      |
                         +------------+-------------+
                         v                          v
                StockOut Movement             Customer Due
                                                    |
                                                    v
                                               Collection
                                             /      |       \
                                          Cash    bKash    Bank/Cheque
                                                    |
                                                    v
                                           Account Transaction
```

Line items carry forward from quotation to order. The API builds the actual FIFO batch plan and can split one product line across several batches. An authorized user can deliberately prefer a newer lot only with an override reason.

### 7.4 Expenses stay isolated

```text
Daily Expense or TA/DA -> Selected Cash/Bank Account -> Account Transaction

No connection to ImportCostLine or LandedCostSnapshot
```

Rent, salaries, utilities, office transport, entertainment, and TA/DA never change product landed cost.

---

## 8. Import Workspace Walkthrough

### Start before PI or LC

Click **New Import** to create the case with supplier, PO number/date, at least one approved product line, optional target shipment date, and notes. The system generates `IMP-YYYY-NNN`. PI and payment mode are intentionally optional at this point.

When the supplier PI is added, the API derives **PI Received**. When an LC number or TT reference is recorded, that value becomes the main visible reference for the same record. No record is copied or recreated.

Open **Imports**, then select **LC-77612**. The page represents one multi-product consignment.

### Milestone header

The status path includes:

```text
Draft -> PI Received -> LC/TT Opened -> In Production -> Shipped
-> At Port -> Costing -> Cost Finalized -> Partially Received
-> Received -> Closed
```

Cancelled is also supported.

Users do not choose final states from a generic status field. **Mark In Production**, **Mark Shipped**, **Mark At Port**, **Cancel Case**, and **Close Case** are controlled actions. Cost finalization and warehouse receipt set their own statuses. Closed/cancelled cases are read-only; only an unposted cancelled/draft case may be deleted.

### Six sections

1. **Commercial & Products**
   Supplier, PO, optional PI, products, quantities, FOB, cartons, and CBM. Authoritative FOB/CBM totals are recomputed by the API.

2. **LC / TT & Shipment**
   Payment mode, LC/TT reference and amount/date, bank, rate snapshot, commercial invoice, production follow-up, BL, container, vessel, ETD, and ETA.

3. **Documents**
   Actual PDF/image content plus metadata for PI, LC/Swift, commercial invoice, packing list, COA, CE, ISO, BL, customs assessment, duty proof, freight, insurance, bank advice, and C&F evidence. View opens the shared protected viewer; Extract Fields opens a review panel and never overwrites data automatically.

4. **Costs & Allocation**
   Any number of named costs with currency, historical exchange rate, vendor/payment metadata, attachment, product scope, and an explicit allocation method.

5. **Landed-Cost Result**
   Exact shipment reconciliation, final product total, landed cost per unit, and expandable explanations.

6. **Warehouse Receipt & Activity**
   Receiving unlocks only after cost finalization. Partial and final receipts remain connected to the same import case.

### Five allocation methods

| Method | Typical use | Formula basis |
|---|---|---|
| CBM | Sea freight, volume-related local transport | Product CBM / eligible total CBM |
| FOB value | Shared bank or institutional costs | Product FOB value / eligible FOB total |
| Quantity | Shared handling/labour where chosen | Product quantity / eligible total quantity |
| Product-specific | Final customs duty assessed for one or selected products | Only selected products receive the cost |
| Manual split | Exceptional documented business split | User-entered BDT amounts must exactly equal the cost |

Foreign currency is converted using the stored exchange-rate snapshot. Final allocations round to two decimal places. Any residual poisha is assigned by the largest fractional remainder, with stable item-ID tie-breaking. The sum always reconciles to the original cost row.

### What the system does not calculate

The user enters the final assessed customs duty per product from official customs evidence. The ERP does not guess HS-code duty, VAT, AIT, or customs formulas.

Local covered-van transport defaults to CBM because the latest meeting confirmed it behaves like sea freight by volume. Common bank/C&F/insurance defaults remain pending; their allocation method stays explicit on each row.

---

## 9. Inventory Walkthrough

Inventory has only three internal views:

- **Stock:** available quantity by approved product, with image, sale price, FIFO lot, and nearest expiry.
- **Batches:** lot, batch, import reference, receipt date, manufacturing/expiry, warehouse location, and available quantity.
- **Movements:** stock-in and stock-out transaction history.

Legacy stock is entered once through **Settings -> Data Migration -> Opening Batch** with product, quantity, lot/batch, MFG/expiry, historical receipt date, old LC/source, warehouse/location, and optional landed cost. It then participates in the same FIFO sequence as newly received imports.

### FIFO with expiry awareness

FIFO means the oldest eligible matching receipt is recommended first. Expiry is always shown. Selecting a newer batch while an older eligible batch still has stock produces a warning.

The allocator can fulfill one requested quantity from several batches. For example, a 60-piece delivery can post 30 from the oldest lot and 30 from the next lot. Expired batches are never included, even if their receipt date is older.

An authorized override requires:

1. `approve_stock_override` capability.
2. A written reason.
3. A permanent audit event.

The server prevents negative stock, receipt quantities beyond the import quantity, and an expiry date earlier than manufacturing date.

Expiry categories (`Expired`, `1 Month Alert`, `3 Month Alert`, `6 Month Alert`, `Normal`) are calculated from the current Bangladesh business date by the API.

---

## 10. Sales & Marketing Walkthrough

Sales & Marketing has five internal views:

1. **Customers**
2. **Marketing**
3. **Quotations & Orders**
4. **Deliveries**
5. **Collections**

### Follow One Order Through Its Lifecycle

From **Quotations & Orders**, choose **Open Flow** on an order. The same workspace is available from delivery, invoice and collection registers, and linked sales activity references.

- The five milestones show Quotation, Order, Delivery, Invoice and Collection from existing records.
- Five totals distinguish Order Value, Delivered Value, Approved Invoice, Collected and Outstanding. The customer panel separately labels due across all of that customer's orders.
- Product fulfilment shows ordered, delivered, approved-invoiced, remaining-to-deliver and delivered-not-invoiced quantities. Draft invoice quantities remain visibly pending approval.
- **New Delivery** reuses FIFO validation and posts actual batch stock-out. **Create Invoice** accepts posted, uninvoiced challans from this order. Invoice approval posts receivables; a draft does not.
- **Record Collection** keeps the customer and order selected. Supplying only an invoice to the API also resolves its order, updating customer due, order received/due and the selected account once.
- Linked quotations, challans, invoices and receipts use the existing official print previews. **Customer Ledger** opens the operating ledger; **Open Report** opens the canonical report with this order selected, preserving the filter in export and print.
- Sales Executives may open only their own orders. Warehouse users receive no new Sales access; if Sales view is explicitly delegated, the workspace hides financial values. The Settings confirmation queue records the unresolved Delivery Challan Approval question. Posting remains the final stock-out action until confirmed otherwise.

For a ready walkthrough, open **SO-2026-041**: it links QT-2026-047, DC-2026-041, INV-2026-0002 and MR-2026-057, showing BDT 85,200 approved, BDT 60,000 collected and BDT 25,200 outstanding. **SO-2026-042** shows a delivered order awaiting invoice with no posted order receivable.

API: `GET /api/orders/:orderId/workspace` assembles this view; it does not create a second order or ledger.

### One-click Marketing hub

**Sales & Marketing -> Marketing** opens the daily operating screen itself, not another menu. Management sees team-safe KPIs, activity, follow-up attention, funnel, Field Team status, and target performance. A Sales Executive sees only **My Marketing Day**, own plan, own follow-ups, own leads, own visits, and own performance. The prototype refreshes the Marketing dashboard every 12 seconds, including when management leaves the browser tab in the background.

The action bar prioritizes Report Activity, New Lead, Follow-up, Check In/Out, and Generate Report. Less frequent Daily Plan, Monthly Plan, and Target actions stay in the compact More menu. **Report Activity** visibly locks the reporter to the signed-in employee ID; a field employee cannot submit work under another person's name. The category list is grouped into customer/field engagement, product activity, commercial follow-up, and market/internal work. Manager employee links open the employee's compact Activity Summary, then **Open Full Report** continues to Reports.

The Lead Pipeline has contextual **Follow-up**, **Report Visit**, **Convert**, and **Quotation** actions. Each carries the selected lead into the next form. Clicking a funnel stage opens exactly that stage instead of an unfiltered lead list. Daily-plan rows select a permitted customer or lead; a user cannot self-certify a row as completed. A matching verified field check-out marks it complete. The follow-up queue supports both a documented completion outcome and a validated reschedule time. Manual daily updates and transaction-generated events are shown together, but quotations, orders, deliveries, collections, check-ins, and check-outs retain their authoritative source so an employee cannot imitate those results with a note.

```text
Signed-in employee
  -> Lead / customer contact / presentation / sample / negotiation
  -> next follow-up and optional evidence
  -> one access-controlled Activity feed

Saved ERP events
  -> Field visit check-in/check-out
  -> Quotation
  -> Order
  -> Delivery
  -> Collection
  -> the same feed automatically, without duplicate manual reporting
```

The funnel advances only from recorded activity or authoritative transactions:

```text
NEW -> CONTACTED -> INTERESTED -> PRESENTATION -> SAMPLE
    -> QUOTATION -> NEGOTIATION -> ORDER -> DELIVERED -> PAYMENT
```

It never moves backwards. Only **Lost** is manually selected, and it requires a reason. Converting a lead creates a Customer while preserving assignment, product interest, activity history, and the lead reference used by the quotation.

Marketing scope is independent of permission: Sales Executive = self; Sales Manager = active sales team; Managing Director and Super Admin = all active sales employees. An Accounts user does not gain Marketing data merely because Accounts can post collections.

### Customer ledger

The customer's historical spreadsheet tab becomes one customer row plus connected transactions. Opening legacy balances can be posted at a cutover date. The detail ledger separates delivered value from approved invoiced sales, then shows collections, current due, credit terms, transaction references, remarks, reversals and running balance.

Product aliases from the legacy `Item Mapping` sheet map spelling variants to one approved product, preventing duplicate inventory identities.

Every customer row provides role-safe shortcuts to Marketing History, a preselected Quotation, and a preselected Collection. Direct report URLs repeat the same subject-scope check on the API, so changing a query string cannot expose another salesperson's customer history.

### Owner-only price check

In the quotation editor, an authorized owner can preview expected FIFO COGS, effective sale price, gross profit per unit, total gross profit, and margin. A below-cost proposal is visibly marked as a loss. Sales Executives never receive the cost/profit fields.

### Quotation to collection

```text
Create quotation
-> Accept and convert
-> Order created with the same line items
-> Select actual batch for delivery
-> Delivery challan posts stock-out
-> Create invoice from one or more challans for the same order
-> Authorized invoice approval posts customer and order due
-> Post cash/bKash/bank/cheque collection
-> Customer and order due decrease
-> Cash/bank transaction is created
```

Outstanding credit is supported by leaving part of an approved invoice unpaid. A draft invoice changes no balance. Cancellation requires authority and a reason, reverses receivable, and is blocked when a posted collection is linked to the invoice.

`Credit` is not a collection method. A posted collection must use Cash, bKash/mobile banking, Bank Transfer, or Cheque, must reference an active destination account, and must include a payment reference for non-cash modes. Customer due, order due, account balance, receipt, and account transaction update together.

### Print outputs

One record can produce:

- Quotation on the supplied MIPRO or LED TRACKERS digital letterhead
- Quotation calibrated for the same physical preprinted paper
- Order Receiving Sheet matching the supplied office-use structure
- Delivery challan
- Approved sales invoice
- Money receipt
- Debit voucher and credit voucher
- Sales sheet, invoice register, salesman ledger and Monthly A/C Summary
- Import cost statement

All print sheets use A4 millimetre dimensions and per-identity safe-area settings. Digital mode prints the supplied background image; preprinted mode omits artwork while retaining identical content coordinates.

---

## 11. Expenses And Accounts Walkthrough

This is an operational money view, not a full general ledger.

Internal views include:

- Daily expenses
- Cash and bank accounts
- Account transaction ledger
- Customer dues and collections

Expense entry supports 24 useful default categories plus dynamic additions. **Expense For** is structured as Employee, Office, Warehouse, or Company / General. Employee and TA/DA attribution uses the safe searchable employee directory, storing employee ID, code, designation, and department. **Entered By** always comes from the signed-in Accounts/Super Admin session and cannot be impersonated in the form.

Posting creates a debit against the selected cash/bank account. Collections create credits. Posted expenses are reversed with a reason instead of silently deleted. **Supplier & Position** records supplier obligations separately from payments and allows capability-restricted opening capital, fixed asset, depreciation, statutory payable, other receivable/payable and opening retained-earnings entries. These audited sources drive Supplier Statement and Balance Sheet; the system shows any reconciliation difference instead of forcing a false balance. Rent, salary, utilities, office transport, and TA/DA remain isolated from import landed cost.

---

## 12. Employees Walkthrough

Employees is the management home for people, login accounts, access, location, activity, and performance. It does not create a second employee database and it is not an HR/payroll module.

The four permission-aware internal views are:

1. **Employee Directory**
2. **Access & Roles**
3. **Field Team**
4. **Activity Summary**

The tabs themselves follow authority. Super Admin sees all four. Sales Manager sees Directory when delegated plus Field Team and Activity Summary from team scope, but does not see Access & Roles. Managing Director sees team monitoring views. Sales Executive continues daily work in Sales & Marketing and has no team-wide Employees destination.

### Employee Directory and login account

```text
Employee Directory
  -> profile image, name, phone
  -> employee ID, designation, department, territory
  -> login email, assigned role, account status
  -> compact permitted actions: Open, Field Map, Report, Access
```

Search covers name, employee ID, designation, department, territory, login, phone, and assigned role. Filters cover department, role, status, and territory. Search results update immediately, show a visible result count, and can be cleared in one action. An authorized manager clicks the employee's name to open that person's Activity Summary; **Open Full Report** continues into Reports with the employee preselected. **New Employee** creates the employee profile and login account in one record. The profile editor supports an image URL or a temporary image upload for the running demo.

### Lifecycle authority versus access authority

Employee lifecycle and security administration are intentionally separate:

```text
users:view/create/edit + manage_users
  -> create employee
  -> edit profile/employment/territory
  -> activate, mark pending, or deactivate

manage_user_access
  -> assign role
  -> add employee-specific ALLOW
  -> add explicit DENY
  -> grant controlled sensitive capabilities
  -> reset login password
```

A lifecycle manager cannot change role or permissions. A normal team manager cannot automatically see security details. Super Admin cannot deactivate the final active owner. The access editor shows role defaults, additional allowance, explicit denial, and sensitive capabilities without exposing them through the safe employee directory API.

### Field Team and Activity Summary

**Employees -> Field Team** reuses the same map, route, location, visit, and GPS services previously reached through Marketing. It is the single management home; the Marketing shortcut routes here instead of duplicating the map.

Activity Summary answers two questions quickly: what did this employee do today, and how are they performing? It shows six role-safe KPIs and five recent activities, with direct actions for Field Map and Open Full Report. The configurable report under Reports then offers **Daily**, **Weekly**, **Monthly**, or **Custom** periods and five content strategies:

1. **Complete Performance** - activity, targets, plans, sales, and follow-ups.
2. **Activity Details** - all linked work recorded for the selected period.
3. **Field Visits & Meetings** - visits, meetings, demonstrations, training, check-ins, and check-outs.
4. **Sales & Collection** - negotiations, tender/quotation follow-up, orders, deliveries, and collection work.
5. **Follow-ups & Pipeline** - contacts, follow-ups, service work, and open lead context.

The full Reports version combines:

- check-in/check-out, visits, and verified visits;
- new and qualified leads, follow-ups, presentations, and samples;
- quotations, orders, delivered sales, and collections;
- activity score and sales/visit/customer/collection target progress;
- one user-ID-linked activity log from manual Marketing, FieldVisit, Quotation, Order, Delivery, and Collection records;
- Today, Overdue, and Upcoming follow-up attention;
- daily plans that fall within the selected period and monthly plans that overlap it;
- an activity-category composition, management interpretation, late/verified submission summary, report reference, and prepared-by identity.

The on-screen Employee summary follows the same operational panel style as the rest of the ERP and contains no report-format or stationery controls. In Reports, **Print Preview** carries the employee, period and report-content filters to the dedicated preview used by quotations. The user selects With Background or Without Background there, then chooses **Print / Save PDF**. The output names the employee and includes profile image/initials, employee code, designation, department, territory, status, report period, report type, prepared-by user, KPIs, target-versus-actual rows, detailed activity, plans, follow-ups, pipeline, and signature lines. CSV follows report-export permission.

New transactions store exact `createdAt`, `submittedAt`, or `postedAt` values. A legacy record that has only a date displays **Time unavailable** instead of an invented hour. **Field Map** focuses the employee in the canonical map. Employees keeps a concise recent-activity and KPI summary; **Open Full Report** carries the employee into the canonical Reports detail page.

---

## 13. Reports And Audit

Reports is one vertically scrollable catalogue with no first-level reporting tabs. It groups every output into seven business sections: **Sales Reports**, **Customer & Collection Reports**, **Supplier & Import Reports**, **Inventory & Product Reports**, **Expense & Accounts Reports**, **Employee & Marketing Reports**, and **Audit & Control Reports**.

Selecting a report navigates to `/app/reports/:reportId`. The shared detail shell provides **Back to Reports**, Today/Yesterday/This Week/Last Week/This Month/Last Month/This Year/Last Year/Custom periods, only relevant entity filters, Generate/Refresh, Print Preview and CSV. Mobile uses the same flow without a horizontal report selector.

The From/To dates are sent to the API before period totals and tables are built. Applying filters controls the on-screen table, CSV and A4 preview with the same values. Sales Summary can group daily source rows by day, week, month or year. Old query-style report links are redirected to the canonical detail URL.

The catalogue includes the prior operational reports plus Sales Summary, Customer List, Supplier List and Statement, Product List, Employee List, Balance Sheet, Access Change Audit and FIFO Override Audit. Gross Profit requires `view_profit`; import/supplier values require `view_sensitive_cost`; Balance Sheet requires `view_financial_position`. Formal P&L and Cash Flow remain absent until a complete accounting ledger exists.

Inventory, Sales, Accounts and Employees provide contextual **Open Report** or ledger actions that lead to this same canonical catalogue. Report data is never copied into a separate reporting store.

Marketing reports are ordinary cards inside **Employee & Marketing Reports**. Each opens its dedicated report URL and retains employee, territory, activity, customer/lead, verification, status and grouping filters where relevant.

**Employees -> Activity Summary** answers the quick operational question without duplicating report controls. **Reports -> Employee Activity** is the sole configurable and printable Daily/Weekly/Monthly/Custom personnel report, with employee preselection supported by deep link.

### Sales Team Comparison

Under **Employee & Marketing Reports -> Sales Team Comparison**, management compares quotes, conversions, orders, delivered sales, collections, customers, dues and conversion rate. A Sales Executive receives only their own role-safe result.

Attribution follows business ownership rather than whoever typed the action:

```text
Customer.assignedSalesUserId
  -> Quotation.ownerId
  -> Order.ownerId
  -> Delivery.salesOwnerId
  -> Collection.ownerId
```

`createdByUserId`, `dispatchedByUserId`, and `postedByUserId` retain operator history. Therefore a manager may create an order or Accounts may post a collection without stealing the executive's performance credit. Sales Executives receive only their own report; no FOB, landed cost, COGS, or profit field is returned.

The narrow audit captures high-risk actions such as:

- landed-cost finalization or reopening
- allocation changes
- warehouse receiving
- FIFO override
- stock dispatch
- collection posting
- expense reversal
- capability changes
- document attachment and AI extraction review activity

---

## 14. Documents And Contextual AI

### Protected document flow

```text
User selects PDF/image
  -> typed fileService/importService/accountsService request
  -> API validates role, entity access, MIME type, size, and sensitivity
  -> metadata + temporary content stay linked to that business record
  -> GET /api/documents/:id/content re-checks authorization
  -> shared viewer renders PDF or image and offers open/download
```

Import documents, freight/cost evidence, and expense receipts use this flow. Sensitive customs or import-cost files require `view_sensitive_cost`, even when a user guesses the direct URL. Generated quotation/order/challan/receipt/import-cost documents still use the calibrated `PrintPage` because they come from ERP records rather than uploaded binaries.

### Contextual MIPRO AI

Historical prototype only. AI is deferred and inactive in the current hosted foundation workspace; do not present the following examples as production features.

The assistant is fixed at the bottom-right on desktop and becomes a near-full-screen panel on mobile. It receives only route/entity context, optional selected employee, and the selected report period, then the API builds an answer from records already permitted for the signed-in role.

- Imports: stage, missing documents, and authorized allocation explanation.
- Inventory: FIFO lot and expiry attention matching the deterministic engine.
- Sales: own/team-visible dues, open quotations, and follow-up suggestions.
- Marketing: role-scoped overdue follow-ups, untouched leads, negotiation attention, target progress, and employee activity summaries.
- Employees: selected-employee activity, overdue team follow-ups, below-target staff, tracking attention, and read-only access explanations for authorized access managers.
- Reports: current-period sales/collection and employee summaries.
- Dashboard: role-safe management priorities.
- Field Team: current/last status, visit context, stale feeds, and own/team scope.
- Smart Insights: explanation and source navigation for the current review queue.

The assistant cannot call finalization, dispatch, collection, or update endpoints. Document extraction returns proposed fields with confidence and warnings; all checkboxes begin unselected, and the user explicitly applies verified fields through the same validation used by manual editing. In this release answers are deterministic mock intelligence behind replaceable typed endpoints, not a production model claim.

Employee answers use the same effective-access resolver as the Employees tabs. A team manager may summarize only permitted sales employees; a directory-only manager cannot read team performance; only an access manager may request role/override/capability explanations. Even then, the assistant is read-only and directs the user to **Employees -> Access & Roles** for an authorized human change.

### Field Team management flow

```text
Future Web/Mobile Sales Client
  -> start tracking session
  -> submit timestamped coordinate + accuracy + source
  -> optional customer visit check-in/check-out
  -> shared field-team API
  -> current-location feed + historical points + visits
  -> Employees > Field Team map and Activity Summary
  -> Reports for historical/exportable analysis
```

The current release supplies realistic mock records through that boundary and labels them **Demo location feed**. Leaflet renders actual latitude/longitude markers, clustering, pan/zoom, customer points and stored-coordinate route polylines. It never calls an old coordinate "live" and never estimates distance from the number of stops.

For Sales Executive UAT, **Check In / Out** opens My Field Day in the same Marketing workspace. The employee can start/stop foreground tracking, refresh a browser GPS position, check into an assigned visit, and complete it with products, outcome, next follow-up, remarks, and optional photo/signature/PDF evidence. A fresh GPS coordinate is required at both visit actions. Check-out completes the matching daily-plan item, creates the next follow-up when supplied, and appears automatically in Marketing and Reports.

Access is enforced by the API: Super Admin and Managing Director see the full operational feed, Sales Manager sees the sales team, Sales Executive sees only their own activity, and Accounts/Import/Warehouse receive `403`. Visit verification and periodic tracking are distinct records, so customer check-in evidence is not confused with work-session movement.

---

## 15. Settings And Client Confirmation Queue

Settings is one permission-filtered workspace, not one all-or-nothing owner page. It appears when the signed-in user can view at least one permitted subview, and it fetches data only for the active permitted tab.

| Settings subview | Required access |
|---|---|
| Client Confirmation Queue | `settings:view` |
| Products & Aliases | `products:view` |
| Suppliers | `suppliers:view` |
| Business Setup | `settings:view` |
| Data Migration | `settings:view` |
| Website Content | Super Admin in the current release |

Super Admin sees all setup data: ERP products/images/aliases, suppliers, public website content, website inquiries, cash/bank accounts, main warehouse, expense categories, import cost presets, print configuration, opening-data migration and client decisions. Employee and access administration stays in Employees.

The Access & Roles editor in Employees includes the normal `marketing` permission with View/Create/Edit/Approve/Export actions. Scope remains server-enforced after permission is granted. Business Setup contains the seven configurable Marketing Score Rules; changing a weight affects score calculation but does not turn manual notes into transaction points.

Use these direct presentation paths:

```text
/app/settings?view=website  -> public content, publication and inquiry queue
/app/settings?view=products -> ERP products and legacy aliases
/app/employees?view=directory -> employee profiles and login accounts
/app/employees?view=access    -> roles, exceptions and sensitive capabilities
```

The Employees workspace deliberately separates two jobs:

- **Employee manager:** profile, employment, territory and account status for lower-ranked staff only.
- **Access manager:** assigned role, read-only Role Access Summary, per-action Default/Allow/Deny exceptions, sensitive capabilities and password changes.

A delegated manager cannot edit self, peers, higher-ranked users or any Super Admin; cannot assign a role or capability they do not have authority to grant; and cannot disable the final active Super Admin. Access changes record actor, target, before/after values and time without recording plaintext passwords.

The queue makes unresolved requirements visible:

- Default allocation for common costs
- Accounting depth
- Number of warehouses
- Selling-price approval
- Sales VAT/tax
- Cost-finalization authority

Each decision stores the question, current behavior, status, actual resolution value/notes, source, confirmer, and confirmation time. Local transport CBM and FIFO-with-expiry-awareness are already marked confirmed. The prototype does not silently convert the remaining questions into permanent business rules.

---

## 16. What An API Call Means

For a non-technical audience, describe the API as the system's controlled messenger.

Example:

```text
User clicks "Preview landed cost"
        |
        v
The page sends the import ID to the API
        |
        v
The API validates permission and calculation inputs
        |
        v
The costing engine allocates every cost
        |
        v
The API returns a structured result
        |
        v
The page displays totals and explanations
```

The frontend never reads a hidden mock spreadsheet directly. Every screen calls a typed domain service. Zod validates the returned structure before a component uses it. A future real database/backend can replace Express without rewriting the pages.

### Why show this to the client

You are not showing code for its own sake. You are proving:

- the screens are connected, not static pictures;
- permission rules are checked at the data boundary;
- one action updates downstream records;
- the frontend is ready for a real backend;
- calculations have one deterministic source of truth.

---

## 17. API Map

### Session and dashboard

| Method and path | Purpose |
|---|---|
| `POST /api/auth/login` | Start a role-based session |
| `GET /api/auth/demo-users` | Populate demo identities |
| `GET /api/me` | Read the current user |
| `GET /api/dashboard` | Return role-safe KPIs and action lists |

### Imports

| Method and path | Purpose |
|---|---|
| `GET/POST /api/imports` | List or create import cases |
| `GET/PATCH/DELETE /api/imports/:id` | Read, edit, or remove an eligible draft |
| `POST /api/imports/:id/transition` | Advance an allowed operational milestone, cancel, or close |
| `POST/PATCH/DELETE /api/imports/:id/items/*` | Maintain products within the same case |
| `POST/PATCH/DELETE /api/imports/:id/costs/*` | Maintain sensitive named cost rows |
| `POST /api/imports/:id/documents` | Validate and attach an actual PDF/image to the import case |
| `GET /api/documents/:id/content` | Re-authorize and stream/redirect protected file content |
| `POST /api/imports/:id/cost-preview` | Calculate and explain allocations |
| `POST /api/imports/:id/finalize` | Create immutable snapshot |
| `POST /api/imports/:id/reopen` | Reopen with capability and reason |
| `POST /api/imports/:id/receive` | Create receipt, batch, and stock-in movement |
| `GET /api/imports/:id/receipts` | Read partial/final receiving history |

### Inventory

| Method and path | Purpose |
|---|---|
| `GET /api/inventory/stock` | Product-level availability |
| `GET /api/inventory/batches` | Lot/batch/expiry stock |
| `GET /api/inventory/movements` | Stock transaction history |
| `POST /api/inventory/dispatch-preview` | Return an oldest-first, multi-batch, non-expired allocation plan |

### Sales

| Method and path | Purpose |
|---|---|
| `GET/POST/PATCH/DELETE /api/customers/*` | Customer master with owner-scoped writes |
| `GET /api/customers/:id/ledger` | Delivered value, approved invoices, collections and running due |
| `GET/POST/PATCH/DELETE /api/quotations/*` | Quotation workflow |
| `POST /api/sales/profit-preview` | Owner-only expected FIFO COGS and gross profit |
| `POST /api/quotations/:id/convert` | Carry quote lines into an order |
| `GET/PATCH /api/orders/*` | List orders and maintain supplied receiving-sheet fields |
| `GET/POST /api/deliveries` | Post actual batch delivery and stock-out |
| `GET/POST /api/invoices` | Create a draft invoice from eligible delivery challans |
| `POST /api/invoices/:id/approve` | Post the approved invoice into customer and order receivable |
| `POST /api/invoices/:id/cancel` | Reasoned, audited receivable reversal when no collection blocks it |
| `GET/POST /api/collections` | Link an approved invoice when available, post receipt, and reduce due |
| `POST /api/account-transactions` | Post controlled Advance, Company Loan or authorized manual debit/credit voucher |

### Employees

| Method and path | Purpose |
|---|---|
| `GET /api/employees/directory?scope=marketing` | Safe employee identity projection for selectors, expenses, Field Team, and team scope |
| `GET /api/settings/users` | Authorized employee lifecycle list; security details are returned only to an access manager |
| `POST/PATCH /api/settings/users/*` | Create or update the same employee/login record with hierarchy and escalation protection |
| `GET /api/marketing/employees/:id/snapshot?from=&to=` | Period-aware activity, plans, funnel, follow-up, and performance data for one permitted employee report |
| `GET /api/field-team/*` | Canonical location, route, visit, and tracking services reused inside Employees |

### Marketing

| Method and path | Purpose |
|---|---|
| `GET /api/marketing/dashboard` | One-click self/team/all Marketing hub projection |
| `GET/POST /api/marketing/activities` | Unified feed query and signed-in employee manual activity |
| `GET/POST/PATCH /api/marketing/leads/*` | Role-scoped lead, assignment, Lost reason, and Lead-to-Customer conversion |
| `GET/POST/PATCH /api/marketing/follow-ups/*` | Today/overdue/upcoming/completed follow-up workflow |
| `GET/POST /api/marketing/plans/daily` | Own/team daily visit plan |
| `GET/POST /api/marketing/plans/monthly` | Lightweight monthly focus and planned-activity record |
| `GET/POST/PATCH /api/marketing/targets/*` | Management target assignment and update |
| `GET /api/marketing/performance` | Official transaction-backed actuals, progress, and score |
| `GET /api/marketing/employees/:id/snapshot` | Cross-linked employee period, funnel, follow-up, target, and activity context |
| `GET/PATCH /api/marketing/score-rules/*` | Read weights; Super Admin-only score configuration |
| `GET /api/reports/marketing?...` | Practical filtered/grouped Summary or Detail report |
| `GET /api/reports/marketing/export-authorization` | Require `marketing:export` before CSV |

### Field Team

| Method and path | Purpose |
|---|---|
| `GET /api/field-team/current` | Return role-scoped current/last locations, derived statuses, visits, and feed summary |
| `GET /api/field-team/employees?search=&territory=&status=` | Search the permitted field team without one huge native selector |
| `GET /api/field-team/:userId/history?date=` | Return stored coordinate sequence, session, and visit timeline with own/team enforcement |
| `GET /api/field-team/:userId/visits?from=&to=` | Return authorized customer visit records |
| `POST /api/field-team/tracking/start` | Start the signed-in salesperson's foreground tracking session |
| `POST /api/field-team/tracking/location` | Accept validated coordinate, accuracy, timestamp, and web/mobile source |
| `POST /api/field-team/tracking/stop` | End the signed-in salesperson's session |
| `POST /api/field-team/visits/:id/check-in` | Verify the assigned salesperson's visit location |
| `POST /api/field-team/visits/:id/check-out` | Require fresh GPS and complete with products, outcome, follow-up, remarks, and evidence |

### Accounts, reports, and settings

| Method and path | Purpose |
|---|---|
| `GET/POST /api/expenses` | Read/post operating expense |
| `POST /api/expenses/:id/reverse` | Reverse with reason |
| `GET /api/accounts` | Cash/bank positions |
| `GET /api/account-transactions` | Account ledger |
| `GET /api/reports?from=...&to=...` | Date-filtered role-safe totals and detailed report tables |
| `GET /api/reports/salespeople?from=...&to=...&employeeId=...` | All-person comparison or one authorized employee report |
| `GET /api/reports/marketing?from=...&to=...` | Scoped activity, funnel, follow-up, target, score, and verification reports |
| `GET /api/reports/export-authorization` | Enforce `reports:export` before generating the current filtered CSV |
| `GET/POST /api/supplier-settlements` | Posted supplier obligations and payments used by supplier reports and Accounts Payable |
| `GET/POST /api/financial-position` | Capability-restricted opening/adjustment sources used by Balance Sheet |
| `POST /api/ai/chat` | Return a current-context, role-safe answer and source links |
| `GET /api/ai/insights` | Return compact page/report summaries |
| `GET /api/ai/recommendations` | Return role-safe import, inventory, sales, collection, finance, or field-team actions; powers Smart Insights |
| `POST /api/ai/document-extract` | Propose import fields for explicit human review |
| `GET/POST/PATCH/DELETE /api/products/*` | Product master |
| `GET/POST/PATCH/DELETE /api/suppliers/*` | Supplier master |
| `/api/settings/opening-stock` | Post a historical stock batch and receive movement |
| `/api/settings/customer-opening-balances` | Post a reconciled legacy customer due |
| `/api/settings/product-aliases` | Map legacy names to approved products |
| `POST /api/settings/website/inquiries/:id/convert-to-lead` | Convert only a Qualified inquiry and assign an active Sales Executive |
| `/api/settings/*` | Decisions, accounts, warehouse, presets, website content, and print calibration |
| `GET /api/audit` | Narrow high-risk audit trail |

---

## 18. Temporary Data Behavior

This release is a complete functional frontend backed by an in-memory Express API.

During a running demo, create/edit/delete/finalize/receive/deliver/collect/reverse actions work and connected screens update. The data is temporary:

- a local API restart resets the seed;
- a Vercel function cold start or redeployment may reset it;
- different serverless instances may not share the same memory;
- uploaded file content and metadata live only in that API process;
- seeded PDFs/images are presentation assets but still open through authorization.

This is correct for frontend workflow approval. Production requires persistent authentication, database, storage, authorization, audit retention, backups, and transactions, with Supabase/Postgres being the planned replacement.

---

## 19. Acceptance Scenarios

### A. Multi-product import costing

- Create a draft from PO before PI/LC, then add PI and LC to the same case.
- One LC contains Dialyzer, Blood Line Sets, and AV Fistula.
- Products have different quantities, FOB values, CBM, and assessed duty.
- Costs use all five allocation methods.
- Every cost and final shipment total reconcile exactly.
- Finalization creates an immutable snapshot.
- Reopen works before receipt but is blocked after the first receipt.
- Partial and final receipt create stock at inherited cost.

### B. FIFO stock selection

- Opening/legacy stock and newer import stock share one sequence.
- A 60-piece dispatch is automatically split 30 + 30 across two oldest eligible batches.
- An older expired batch remains visible but is excluded.
- Selecting the newer lot shows a warning.
- Authorized override requires a reason and audit entry.

### C. Quotation to collection

- Owner can preview expected FIFO landed cost and profit/loss before quoting.
- Create a quotation.
- Convert it without re-entering lines.
- Post delivery from an actual batch.
- Stock decreases.
- Customer due increases.
- Collection reduces due and updates the chosen account.
- Customer running ledger and actual filtered reports show the connected result.

### D. Expense isolation

- Post Employee, Office, Warehouse, and Company expenses with separate signed-in Entered By identity.
- TA/DA requires a directory employee ID and auto-fills employee details.
- Daily expenditure, expense-by-person/unit/category, monthly expense, and TA/DA sheets update.
- Finalized import and product landed costs do not change.

### E. Employee performance

- Super Admin opens Employees, searches the directory, and edits one employee's profile/login account with image.
- Search by `SE-014`, phone, designation, or role returns the matching employee; Clear restores the directory.
- Clicking the employee name opens that employee's Activity Summary; full printable output opens under Reports.
- Sales Manager sees Employee Directory, Field Team, and Activity Summary but not Access & Roles.
- Super Admin opens Access & Roles and sees role defaults, additional ALLOW, explicit DENY, and sensitive capabilities.
- Sales Manager selects an executive, switches Daily/Weekly/Monthly/Custom frequency, and selects Complete, Activity, Field Work, Sales & Collection, or Follow-ups content without leaving Employees.
- The report names the employee, period, preparer and reference; shows activity, targets, plans, follow-ups and transactional results; and prints with review/approval signatures.
- Legacy date-only activity displays Time unavailable; newly posted transactions display actual timestamps.
- Sales Executive cannot request another employee or receive cost/profit fields.

### F. Protected documents

- PI and freight PDFs open in the shared viewer; the expense receipt opens as an image.
- Missing content produces a clear error instead of a blank screen.
- Import Officer cannot open sensitive customs/freight content by direct URL.
- Extract Fields changes nothing until the user reviews and selects fields.

### G. Contextual AI

- Import questions use the current `LC-77612` context and link back to the record.
- FIFO/expiry recommendation agrees with deterministic inventory data.
- Sales follow-up is scoped to the signed-in role.
- Sales Manager asks `Summarize Rafiq's activity today` from Employees and receives only team-scoped activity plus an Employees source link.
- Super Admin asks for an access explanation and is directed to Access & Roles; the assistant cannot grant or revoke anything.
- Sales Executive landed-cost/profit question returns a restriction without a secret value.

### H. Field Team and employee reporting

- Sales Manager opens Employees -> Field Team and sees the permitted team on real latitude/longitude markers, filtered by employee, territory, and status.
- Marker detail always shows last-updated time and GPS accuracy; stale data is never labelled live.
- Route History draws the stored coordinate sequence and lists visit check-in/out events without inventing route distance.
- Sales Executive current/history endpoints contain only self; Accounts/Import/Warehouse receive `403`.
- EmployeePicker searches name, employee ID, designation, and territory; typing and pressing Enter selects the first real match rather than `All Employees`.
- Activity Summary links to the focused Field Map; named employee report generation and printing is centralized under Reports.

### I. Smart Insights

- Dashboard links to the secondary `/app/insights` review queue without adding another sidebar destination.
- Category/severity filters use the same role-safe recommendation API as the floating assistant.
- Dismiss removes only the local alert card and never posts or mutates an operational transaction.
- Field Team AI cannot reveal another salesperson to a Sales Executive.

### J. One-click Marketing workflow

- Sales Executive opens Sales & Marketing -> Marketing and immediately sees only My Day, plan, follow-ups, activity, leads, visits, target, and score.
- New lead, contact, next follow-up, conversion to customer, and quotation carry one reference chain without re-entry.
- Quotation/order/delivery/collection events appear automatically and advance the funnel; the employee cannot manually claim them.
- GPS check-out stores products, outcome, evidence, and follow-up, then completes the matching daily-plan item.
- Sales Manager sees team scope, needs-attention summary, employee Activity Summary, Field Team, targets, practical reports, and CSV; Accounts receives `403` for Marketing.
- The manager page polls every 12 seconds. Funnel clicks filter the chosen stage, and old date-only transactions never receive invented times.
- A Qualified website inquiry converts once into an assigned lead and cannot then be deleted from history.

These scenarios are covered by automated unit, API-flow, role, and browser smoke tests.

---

## 20. Recommended Live Presentation Order

1. Landing page: switch the supplied Product Range / HD-17H / Features / Technical Data literature, then explain the two operational flows and shared warehouse bridge.
2. Login: choose Super Admin and explain fixed role identity.
3. Dashboard: show no more than six KPIs and action lists.
4. Imports: briefly open New Import to prove PO-first draft creation, then open LC-77612.
5. Import sections: show progressive PI/LC entry, then open the PI PDF and Extract Fields review.
6. Cost preview: open the freight evidence, expand an allocation explanation, and explain exact reconciliation.
7. Inventory: show product images, smart FIFO/expiry alert, opening/import batches, and multi-batch FIFO.
8. Sales & Marketing -> Marketing: show one-click KPIs, 12-second refresh, follow-ups, stage-filtered funnel, needs-attention summary, and transaction-derived events.
9. Employees -> Directory: show search/filter, profile image, employment/login fields, and compact actions.
10. Employees -> Access & Roles: show role defaults, employee-specific Allow/Deny, sensitive capabilities, and hierarchy protection.
11. In a Sales Executive session, open Sales & Marketing -> Report Activity: show the signed-in employee identity lock, expanded category groups, subject, purpose, outcome, and user-ID-linked submission. Then return to the management session.
12. Employees -> Activity Summary: show the named employee KPIs and recent work, then choose Open Full Report.
13. Reports -> Employee Activity: switch Daily/Weekly/Monthly/Custom and report content, show the understandable result, then open Print Preview/PDF.
14. Smart Insights: open from Dashboard, filter Inventory/Field Team, open a source, and dismiss one card.
15. Deliveries: explain the automatic batch split and stock-out.
16. Collections: explain due and account update.
17. Expenses & Accounts: prove operating costs stay separate and open the utility receipt image.
18. MIPRO AI: ask about the current employee/import context, then show role-safe source links.
19. Settings: show aliases, opening data, business setup, website content, print identities, and decisions; explain why users are no longer hidden here.
20. Sign in as Import Officer: show Reports added by a personal Allow while confidential cost remains protected.
21. Sign in as Sales Manager: show Employees without Access & Roles, create/edit a lower-role employee, and show the missing Report Export action.
22. Sign in as Sales Executive: prove own Sales & Marketing/Reports, direct Employees denial, and AI cost/location refusal.

---

## 21. Honest Production Position

### Complete in this release

- Simplified route and navigation architecture
- Canonical role-default, per-user Allow/Deny, sensitive-capability and data-scope enforcement across frontend and server
- Delegated employee administration with hierarchy, final-owner and privilege-escalation protection
- Direct Employees hub with Directory, Login Account, Access & Roles, canonical Field Team, and Activity Summary
- Connected import, costing, receipt, stock, Marketing, lead, follow-up, sales, collection, expense, report, and settings flows
- PO-first drafts, server-derived milestones, terminal case controls, and authoritative Decimal item bases
- Deterministic Decimal.js allocation engine
- Multi-batch non-expired FIFO, opening stock, customer opening balances, aliases, and running ledger
- Owner-only expected/realized profit views
- Typed DTO/domain services and Zod response validation
- Supplied MIPRO/LED letterhead assets, Order Receiving Sheet, and calibrated A4 print previews
- Responsive desktop/mobile frontend
- Protected PDF/image viewer, temporary upload content, and seeded document evidence
- Salesperson comparison/detail/print with owner-correct attribution
- Contextual role-safe MIPRO AI, smart alerts, source links, and reviewed extraction
- Leaflet/OSM field-team map with marker clustering, derived status, role-scoped history, foreground tracking, and functional GPS visit check-in/check-out
- One-click Marketing hub, self/team/all scope, unified activity feed, lead conversion, plans, targets, configurable scores, and practical reports
- Twelve-second Marketing polling, real transaction timestamps, honest legacy time labels, funnel-stage filtering, and progressively disclosed report filters
- Qualified public-inquiry-to-lead conversion with assignment and audit history
- Structured Employee/Office/Warehouse/Company expense attribution and expanded expense reports
- Searchable EmployeePicker, territory/search/sort/pagination, and performance-to-field navigation
- Dashboard-linked Smart Insights review queue with category/severity filters and non-transactional dismissal
- Vercel-compatible same-origin mock API
- Automated acceptance coverage

### Required for production backend phase

- Persistent database and file storage
- Real authentication and password/email delivery
- Server/database transactions and row-level security
- Durable audit history
- Durable private file storage, signed URLs, and server-generated PDF snapshots
- Production AI model/orchestration, retrieval, monitoring, and evaluation
- Excel migration/import tooling
- Backups, monitoring, and operational deployment controls

The frontend is ready for client workflow approval and backend integration. It must not be represented as a live production database.

---

## 22. Likely Client Questions

**Why are there fewer tabs now?**

Because PO, PI, LC, shipment, costs, and receiving are stages of one import job. Fewer destinations reduce duplicate entry and training effort.

**Can one LC contain multiple products?**

Yes. LC-77612 demonstrates different products, quantities, FOB values, CBM, and duty under one import case.

**Can work begin before the supplier sends PI or the bank opens LC?**

Yes. Create one PO-first draft under an internal IMP reference, then add PI and LC/TT later. The same case continues throughout.

**Can we add a new type of import cost?**

Yes. Use `+ Add Cost`, name it, enter currency/rate/payment details, and explicitly choose its allocation rule.

**Does the system calculate customs duty?**

No. It stores the final officially assessed amount per product and allocates it per unit. It does not invent customs formulas.

**Can sales staff see landed cost?**

Not by default. Sensitive values require explicit capabilities.

**Does FIFO ignore expiry?**

No. FIFO controls recommendation order; expiry remains visible and alertable at every batch decision.

**Can a newer batch be used?**

Yes, only for a capable user with a written reason. The override is audited.

**What happens when one batch cannot fulfill the quantity?**

The server automatically consumes the oldest eligible batch and continues into the next. Expired stock is excluded from the plan.

**Can finalized cost be changed after warehouse receipt?**

No ordinary reopen is allowed after the first receipt because stock already inherited that valuation. A future formal valuation-adjustment workflow would be required.

**Do business documents and reports use the supplied stationery?**

Yes. Quotation, order, challan, invoice, receipt, debit/credit voucher, import cost, employee activity, marketing, operational, audit, sales and TA/DA outputs open the dedicated calibrated A4 preview. Reports use the requested **1.5 mm left and 0.2 mm right page-edge spacing** plus a separate **27 mm internal left safe zone** so content does not enter the vertical MIPRO artwork. In preview, **With Background** includes the stationery image; **Without Background** keeps identical content coordinates for preprinted paper. Use A4, Margins None, Scale 100%, Background graphics On, Headers/footers Off. A physical printer's non-printable hardware margin cannot be removed by browser code.

**Where is invoice generation?**

It is contextual inside Sales rather than a new main navigation tab. The confirmed flow is quotation -> order -> delivery challan -> draft invoice -> authorized approval -> collection. Delivery changes stock; approval changes receivable. Reports include the challan register, invoice register, sales sheet, sales by salesperson/customer/product/month, salesman ledger and delivery-versus-invoice references.

**Where are AI, GPS, HR, and fleet?**

In the current persistent backend, AI is deferred. Sales & Marketing > My Field Day contains employee-initiated customer/lead check-ins, optional private photos with explained absence, reported location and visit completion. Authorized managers review saved events under Employees > Team Activity; the map loads only when requested. There is no continuous employee tracking, inferred attendance or automatic visit score. Native mobile, second GPS/photo checkout, HR/payroll and fleet remain later phases. Older mock map/AI examples in this guide are historical only.

**Will demo changes remain forever?**

Historical mock edits last only for that running mock process. Foundation business records persist in hosted PostgreSQL/private Storage and survive API restarts; they never fall back to mock arrays. Approved source-data migration and full production acceptance are still pending.
