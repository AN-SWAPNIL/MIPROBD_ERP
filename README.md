# MIPRO Digital Platform

A corporate MiproBD website and protected workflow-driven ERP, backed by a temporary Express mock API. `files/MIPRO_ERP_Simplified_Plan_update7.md` and `files/MIPRO_ERP_Employee_Management_Analysis.md` are the latest information-architecture and Employee Hub source of truth. Update6 remains the Marketing operations foundation, update5 defines access control, update4 defines public/private separation, and update3 remains the validated import/inventory/sales foundation.

## Current Scope

The platform separates two surfaces:

```text
Public MIPRO website -> Employee Portal -> Protected MIPRO ERP
```

The public website provides a rotating visual homepage, live catalogue/document counts, interactive product-family and supply-process sections, About, Products, Product Detail, Certificates, News & Resources, Contact, an OpenStreetMap office view, and a validated business inquiry. Authorized manufacturer-document scans are stored locally under `public/certificates`, with visible validity context and preview/download actions. They are not described as MIPRO corporate certificates. The public website never reads protected inventory, cost, supplier, stock or sales data.

Super Admin manages this public surface at `Settings -> Website Content`. The workspace supports company/contact/map settings, hero slides, public categories, public products, certificates, resources and inquiry follow-up. Published content loads through explicit `/api/public/*` endpoints; page components do not import fixtures. Changes persist only for the running mock API process in this phase and will later map to database rows plus managed image storage.

Public products and ERP products are intentionally separate:

```text
Settings -> Website Content -> Public Products
  image, public description, variants, specifications, approved documents

Settings -> Products & Aliases -> ERP Product
  internal code, unit, sale price, stock, landed cost and aliases
```

The first Super Admin is provisioned once through the production identity/backend deployment process, not through a public registration page and not through routine manual database editing. That owner then creates employee/login records under `Employees -> Employee Directory` and controls access under `Employees -> Access & Roles`.

The internal application connects:

```text
Import case -> landed-cost snapshot -> warehouse batch stock
-> quotation -> order -> delivery -> collection
```

Import cases begin at PO stage before PI/LC, statuses are action-derived, and authoritative item/cost math runs on the API. Legacy stock/customer balances can be migrated through Settings.

Operating expenses and cash/bank transactions are tracked separately. A fully authorized owner has eight grouped destinations:

`Dashboard`, `Imports`, `Inventory`, `Sales & Marketing`, `Expenses & Accounts`, `Employees`, `Reports`, `Settings`.

Unauthorized destinations and Employee subtabs are hidden by effective access. Employees composes Directory, Login Account, Access & Roles, the shared Field Team map, and Activity & Reports. Named Daily/Weekly/Monthly/Custom employee reports stay in that Employee tab. Every formal report and business document has one **Print Preview** action that opens the shared calibrated A4 screen; identity plus **With Background** and **Without Background** choices live only in that preview. Sales staff submit their own daily field activity in Sales & Marketing under the signed-in user ID. Protected PDF/image viewing, Smart Insights, reviewed import-document extraction, and floating role-safe MIPRO AI remain contextual. Native mobile/background tracking, HR/payroll, fleet and full accounting remain deferred.

## Stack

- React, Vite and TypeScript
- Tailwind CSS
- React Router
- TanStack Query for server state
- Zustand for authenticated session/UI state
- React Hook Form and Zod
- Decimal.js for financial allocation
- Recharts for report visualization
- Express mock API
- Playwright browser smoke tests

## Run Locally

```bash
npm install
npm run dev
```

Production-safe login is the default. To show prototype role accounts locally, explicitly enable demo mode before starting both processes:

```powershell
$env:VITE_DEMO_MODE="true"
npm run dev
```

The normal local URLs are:

- Frontend: `http://localhost:5173`
- API: `http://localhost:4174`
- Health check: `http://localhost:5173/api/health`

Vite may choose the next frontend port when 5173 is occupied; use the URL printed in the terminal.

## Demo Login

Demo accounts are displayed only when `VITE_DEMO_MODE=true`. All active demo users use `password123`.

| Role | Email |
|---|---|
| Super Admin | `superadmin@mipro.local` |
| Managing Director | `md@mipro.local` |
| Accounts | `accounts@mipro.local` |
| Import Officer | `import@mipro.local` |
| Warehouse Manager | `warehouse@mipro.local` |
| Sales Manager | `salesmanager@mipro.local` |
| Sales Executive | `sales1@mipro.local` |

The demo tiles select a real seeded user identity at login; they are not an in-app role switch. A signed-in user's role cannot be changed from the header or main application.

## Effective Access

The seven roles are default templates rather than a growing collection of special roles. Every protected navigation item, route, action, API, document, report and AI context resolves access in this order:

```text
Role default -> explicit per-user ALLOW/DENY -> sensitive capability -> record/data scope
```

An explicit `DENY` wins over `ALLOW`, and an inactive user has no effective access. Employee lifecycle (`manage_users` plus `users:*`) remains separate from the more sensitive `manage_user_access` authority. Employee access alone does not expose generic Settings.

The seed demonstrates this model: the Import Officer receives Reports view/export without a new role; the Sales Manager receives delegated lower-role employee administration but has Reports export explicitly denied. Direct API requests enforce the same result as the sidebar and route guards.

## Important Routes

```text
/
/about
/products
/products/:slug
/certificates
/news
/contact
/login
/app/dashboard
/app/imports
/app/imports/new
/app/imports/:importId
/app/inventory
/app/sales
/app/accounts
/app/employees
/app/employees?view=directory
/app/employees?view=access
/app/employees?view=field-team
/app/employees?view=activity&employee=sales1
/app/reports
/app/settings
/app/settings?view=website
/app/profile
/app/print/:documentType/:id
```

Relevant older module URLs redirect into the new workspaces.

## Architecture

```text
src/domains/
  imports/       one case workspace and deterministic costing
  inventory/     stock, batch and movement views
  sales/         customer, quote/order, delivery and collection
  marketing/     daily activity, leads, follow-ups, plans, targets and polling hub
  accounts/      expenses, accounts, transactions and dues
  employees/     directory, login account, access, field team and activity/performance composition
  reports/       grouped operational reports
  settings/      master/setup records and Website Content
  print/         business document previews
  erp.types.ts   shared DTO contracts
  schemas.ts     Zod API response schemas
  services.ts    typed domain service boundary

src/features/public/
  PublicLayout   corporate header/footer boundary
  public.types   published website-only contracts
  public.schemas validated public and website-admin contracts
  publicSiteService  replaceable public content/inquiry boundary
  Home/About/Products/Certificates/News/Contact pages

server/
  index.ts       explicit Express domain endpoints and rules
  data.ts        normalized client-like in-memory fixtures
```

Shared `src/components/documents/` and `src/components/ai/` components provide protected file viewing and contextual assistance without adding navigation modules.

Components do not import fixtures. Every screen reads and writes through a domain service and TanStack Query. Responses are validated with Zod before reaching page components.

## Landed-Cost Rules

One `ImportCase` represents one shipment/consignment with one or more `ImportItem` rows. A generated `IMP-YYYY-NNN` reference exists before LC opening. LC or TT becomes the primary visible reference later without recreating the record.

Cost rows support:

- CBM
- FOB value
- Quantity
- Product-specific
- Manual split

Decimal-string values and Decimal.js avoid authoritative floating-point money calculations. Final BDT allocation rounds to two decimals and uses deterministic largest-fractional-remainder distribution. Finalization stores an immutable snapshot.

Customs duty is entered as the final assessed amount per product. The application does not calculate duty, VAT, AIT or HS-code formulas.

## Inventory And Sales Rules

- Receiving is available only after landed-cost finalization.
- Receipt cost is inherited server-side from the snapshot.
- Ordinary landed-cost reopen is blocked after the first receipt.
- Lot, batch, manufacturing date, expiry and location are required.
- FIFO can split one dispatch across several oldest non-expired eligible batches while expiry remains visible.
- A newer-lot override requires capability, reason and audit.
- Opening stock joins the same FIFO sequence; product aliases normalize legacy names.
- Quotation lines carry into the order without re-entry.
- Authorized owners can preview expected FIFO COGS/profit; realized report profit uses dispatched batch cost.
- Delivery uses the API-proposed oldest eligible batch plan, can split one line across several batches, posts stock-out, and creates customer due.
- Collection requires a real active account, reduces customer/order due and credits that account.
- Operating expenses never affect landed cost.
- Reports apply API-side date filters and export actual detail rows.
- Sales Team Comparison preserves the business owner through quotation, order, delivery and collection; management opens a named employee in the canonical Employee Activity & Reports view, while Sales Executives can request only their own role-safe detail.
- Marketing Analysis is a cross-team operational view for period, territory, funnel, verification, follow-up and target analysis. Named Daily/Weekly/Monthly/Custom employee reports are owned only by Employees.
- Uploaded import/cost/expense files open through an authorized API endpoint; sensitive cost documents require the same cost capability as the record.
- MIPRO AI receives route/entity/selected-employee/report-period context and only role-scoped records. It can summarize permitted employee activity or explain access read-only, but cannot grant access, finalize, post or override business records.
- Business documents, employee reports, Marketing Analysis, operational tables, audit and TA/DA share one dedicated calibrated MIPRO/LED A4 preview. Source pages have one Print Preview action; With Background is for PDF/plain paper, and Without Background omits artwork for preprinted stationery.

## Commands

```bash
npm run lint
npm run typecheck:api
npm test
npm run test:flows
npm run build
npm run smoke
```

`npm run test:flows` starts an isolated mock API automatically. Set `API_TEST_BASE_URL` only when intentionally testing an already-running API.

`npm run smoke` needs the frontend and API running. Override the frontend origin with:

```powershell
$env:SMOKE_BASE_URL = "http://localhost:5174"
npm run smoke
```

Screenshots are written to `artifacts/`.

## Vercel Deployment

This repository is configured as one Vercel project:

- Vite builds the frontend into `dist`.
- `api/index.ts` exposes Express as a Vercel function.
- `vercel.json` rewrites same-origin `/api/*` requests to that function.
- SPA routes rewrite to `index.html`.

Recommended project settings:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
Node.js: current supported LTS
```

For this same-project deployment, do **not** set `VITE_API_BASE_URL`. The browser should call relative `/api/*` paths on the deployed domain. Only set that variable when the backend is deployed on a separate origin.

Leave the demo flags unset for a production-style employee login. On a controlled Vercel prototype that should display the seven role examples, set both `VITE_DEMO_MODE=true` and `DEMO_MODE=true`, then redeploy because the `VITE_*` value is embedded during the frontend build.

After pushing to the connected GitHub branch, Vercel deploys automatically. Verify:

```text
https://YOUR-PROJECT.vercel.app/api/health
https://YOUR-PROJECT.vercel.app/login
```

The health endpoint should return `mipro-simplified-erp-api`.

## Prototype Persistence

The mock API is functional but in-memory:

- edits work while the process remains alive;
- API restart/redeployment resets fixtures;
- Vercel instances may not share memory;
- uploaded file content and metadata remain only in the current API process;
- seeded PDFs/images are demo assets served through an authorization check.

The backend phase should replace this with persistent authentication, Postgres/Supabase, storage, row-level security, durable audit and transactional business operations.

## Presentation Material

- `PRESENTATION.md`: complete business/data/API explanation
- `DEMO_INSTRUCTIONS.md`: practical UAT and live-demo checklist
