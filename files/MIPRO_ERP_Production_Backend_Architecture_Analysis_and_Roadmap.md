# MIPRO ERP — Production Backend Architecture Analysis & Migration Roadmap

**Date:** 21 October 2026  
**Repository:** https://github.com/AN-SWAPNIL/Medical_Supplier_ERP  
**Source branch inspected:** `dev`  
**Head inspected:** `43fb218c4341f7f3045a5df0fcb647fbdda57a0d` (`feat: add linked sales order lifecycle workspace`)  
**Existing project plan reviewed:** [`BACKEND_SETUP.md`](https://github.com/AN-SWAPNIL/Medical_Supplier_ERP/blob/dev/BACKEND_SETUP.md)

**Implementation checkpoint, 25 October 2026:** This document records the pre-migration baseline. See `../PRODUCTION_BACKEND_PROGRESS.md` and `../BACKEND_SETUP.md` for verified progress and remaining launch gates. Authentication/MFA, import/receiving, FIFO deliveries, invoices, allocated collections, cash/customer journals, expenses/TA-DA, supplier settlements, restricted financial-position sources, stationery, employees/marketing/field visits, dashboard and operational settings now persist. The 61 supported SQL report read models share CSV/report-print filtering. The public site deliberately uses static published brochure content; dynamic editorial/inquiry management and AI are deferred. The complete ERP is not production-ready. Runtime uses Drizzle + `pg` rather than the earlier Postgres.js candidate.

## 1. Executive decision

**Keep the current TypeScript/Express business API and React/Vite frontend. Replace the in-memory backend with managed PostgreSQL, verified authentication and private object storage.** Initially retain the existing single Vercel frontend/API deployment (on a commercial-appropriate plan), and use **Supabase PostgreSQL + Supabase Auth + Supabase Storage** with **Drizzle ORM** for incremental database migration. A separate always-on backend host is optional, not a prerequisite.

No full rewrite or second repository is needed. The architecture should remain one modular monolith before splitting deployable services.

### Target

```text
Browser (React/Vite on Vercel)
    |
    | same-origin /api/*
    v
Express/TypeScript business API (Vercel Functions)
    |-- verify identity/session; load active employee and overrides
    |-- enforce RBAC, record scope, cost/profit capability
    |-- execute domain rules/transactions (Drizzle)
    |       \--> managed PostgreSQL (Supabase)
    |-- private document authorizations
    |       \--> Supabase Storage
    \-- Supabase Auth (login, invitations, reset, MFA)
```

## 2. What already exists

- React + Vite + TypeScript frontend, React Router, TanStack Query, Zustand, Zod contracts, Decimal.js.
- Express API in `server/index.ts` (~4,376 lines at inspected head), Vercel wrapper `api/index.ts`, Vercel rewrites in `vercel.json`.
- Existing backend endpoints and rules for imports, immutable landed-cost snapshots, warehouse receipts, FIFO stock-out, quotations, orders, deliveries, approved invoices, collections, cash/bank, supplier settlements, financial-position entries, employees, marketing, audit and reports.
- `server/data.ts` contains seeded arrays. `server/index.ts` clones them into module-level mutable arrays and maps.
- `BACKEND_SETUP.md` already recommends PostgreSQL, Drizzle/Prisma, real auth, storage, database transactions, monorepo and optional separate API hosting.
- The current dev branch already includes Update 11 linked Sales Order workspace. Migrate that data contract too.

## 3. Critical implementation gaps

| Area | Verified current behavior | Production requirement |
|---|---|---|
| Database persistence | Module-level arrays copied from fixtures | Real tables and durable transactions |
| Authentication | Predictable `mock-token-${user.id}` issued on login | Verifiable signed/session tokens with expiration and recovery |
| User identity | Backend `userFor()` trusts `x-user-id` request header | Resolve identity from verified token; never trust client-supplied user/role headers |
| Password storage | `passwordByEmail` seeded map with demo password | Auth provider password hashing/invites/recovery/MFA |
| Password recovery | Reset endpoint accepts email + new password | Verified, one-time, expiring reset flow |
| File storage | Base64 file content stored in `documentContents` map | Private bucket with metadata in DB and audited access |
| Concurrent writes | Arrays mutated across steps | ACID transactions, locks, uniqueness, idempotency |
| Numbering | Some references derived from array length | DB-backed sequence or unique allocator |
| Auditing | Audit array in RAM | Durable append-only events |
| Operations | Health route confirms app responds | Dependency-aware DB health, logs, alerts, backup/restore drills |

**Production launch blocker:** Do not populate the existing deployed mock API with real customer, payroll, supplier cost, financial, or employee data until authentication and persistence are fixed.

### API/body limit interaction

Current uploaded documents are base64 JSON with an Express 8 MB request limit and a 5 MB file check. Vercel Functions currently have a 4.5 MB request-body limit. Base64 overhead means some files can fail *before Express*. Replace with short-lived, authorized, direct-to-object-storage uploads and persist only protected file metadata.

## 4. Existing plan: keep/change

**Keep:** same monorepo, managed Postgres, typed ORM/migrations, real auth, external object storage, server-side domain rules, transaction boundaries, local/staging/prod environments, monitoring, backups.

**Refine:** `BACKEND_SETUP.md` proposes `apps/web`, `apps/api`, `packages/contracts`, `packages/domain`, `database`. This is a good long-term structure but restructuring all folders before persistence is unnecessary. First extract focused repositories/services and introduce `database/`. Move into packages later without changing URLs.

**Important refinement:** Existing RBAC templates/overrides/capabilities stay in business DB; Supabase Auth only verifies identity. A trustworthy auth token does not itself authorize a landed-cost edit, stock override, customer lookup, or report export. On each request the API must resolve the active employee account and current RBAC/scope from persisted data.

**Confidential data:** Keep protected ERP tables behind the authenticated Express API. Do not expose unrestricted `service_role` access, privileged database credentials, or sensitive cost tables to browser-side Supabase clients. If browser-side direct DB access is introduced in the future, define and test RLS policies independently.

## 5. Suggested production services and practical cost

| Layer | Recommended | Why |
|---|---|---|
| Frontend & HTTP API | Existing Vercel project, Pro for commercial usage | Smallest change to current deployment |
| Database | Supabase PostgreSQL Pro | Managed PostgreSQL, connection pooler, daily backups |
| Authentication | Supabase Auth | Password reset/invitation/email verification/MFA options |
| Private files | Supabase Storage private buckets | Signed upload/read flows and storage policies |
| ORM | Drizzle ORM + drizzle-kit | Typed schema, SQL-oriented migrations |
| Monitoring | Vercel logs + optionally Sentry | Capture API failures and production regressions |
| Email | Verified transactional provider/SMTP | Invites, password recovery, important alerts |

As of October 2026, published baseline prices are approximately **Vercel Pro $20/month** and **Supabase Pro from $25/month**, before consumption, extra compute/projects, email, monitoring or optional backup add-ons. Treat **~$45+/month** as an illustrative starting platform baseline, not a quote. Development can use test tiers, but free tiers are not a suitable backup/durability commitment for live accounts.

A separate backend on Render/Railway is warranted later if long-running processing, WebSockets, queue workers, independent API deployments, or heavier report generation requires it. A 24/7 server alone does *not* replace a database.

### Region

Choose a Supabase region based on latency and legal residency, likely **Singapore** or **Mumbai** after testing from Bangladesh. Configure Vercel Functions close to the selected database; the CDN for static React assets remains globally distributed. Do not assume the default US function region is optimal.

## 6. Database domain model and migration order

Use PostgreSQL foreign keys, unique constraints, indices and appropriate decimal numeric columns. Persist decimal strings as `numeric` rather than JavaScript floats. Typical money `numeric(18,2)`; quantities `numeric(18,4)` or a scale validated against business requirements; exact precision should be chosen by a field audit.

### Wave A — identity/master records

- `employees/users` with `auth_user_id`, active status, role template, team/manager, territory.
- `permission_overrides`, `capability_grants`, management/audit records.
- `products`, `product_aliases`, `suppliers`, warehouses/locations.
- `customers`, customer opening balances, company accounts, expense categories, business decisions.
- website content tables, publications and inquiry records (public/ERP access boundary).

### Wave B — import and inventory backbone

- `import_cases`, `import_items`, `import_cost_lines`, allocations, documents.
- immutable `landed_cost_snapshots` and optional `snapshot_lines` (JSONB is fine for immutable supplementary metadata; key identities and sums should remain queryable).
- `warehouse_receipts`, `warehouse_receipt_lines`.
- `stock_batches`, append-only `stock_movements`.
- opening-stock entries and auditable migration metadata.

### Wave C — sales and customer receivables

- `quotations`, `quotation_lines`, `sales_orders`, `sales_order_lines`.
- `deliveries`, `delivery_lines` with batch identity and source order.
- `sales_invoices`, `sales_invoice_lines`, `invoice_deliveries` join table.
- `collections`, collection-to-invoice/order allocation; customer receivable posting history.
- Update 11 Sales Order workspace queries derived from these records; do not create a second SalesCase source.

### Wave D — money and management

- `cash_bank_accounts`, `account_transactions`, `expenses`, expense attachments.
- `supplier_settlements`, `financial_position_entries` and opening balances (Update 10).
- marketing leads/activities/follow-ups, plans, targets, location/visit histories as business-approved.
- audit events, public inquiries, document metadata and settings.

### Critical index/constraint examples

- Unique business references: `SO`, `QT`, `DC`, `INV`, `MR`, `IMP`, vouchers and receiving references as applicable.
- Foreign keys for `delivery.order_id`, `invoice.order_id`, `invoice_deliveries.delivery_id`, `collection.invoice_id`, `stock_movement.batch_id`, import receipt/import relationship.
- Indices on `(customer_id,date)`, `(order_id,status)`, `(product_id,received_date)`, `(batch_id,date)`, `(employee_id,date)`, `(supplier_id,date)`.
- Deletion restrictions for finalized/import-received/invoiced/paid objects.
- **No invoice duplicate for one active delivered challan**; enforce at the database/transaction level rather than only checking arrays.

## 7. Transaction and concurrency guarantees

Each posting is one DB transaction. Use row locks or conflict-safe conditional updates, plus a suitable isolation level and retry strategy for serialization conflicts.

| Operation | All-or-nothing changes |
|---|---|
| Landed cost finalization | Validate, write immutable snapshot/allocations, mark finalized, audit |
| Warehouse receipt | Receipt, stock batch creation/increment, movement, import receipt totals, audit |
| Delivery posting | Lock eligible batches, enforce FIFO/override, stock decrement, movements, challan/order status, audit |
| Invoice approval | Lock invoice, one-time approval, receivable event/balance, order status/amount, audit |
| Invoice cancellation | Validate no posted linked collections, create reversal, mark cancelled, audit |
| Collection | Validate approved invoice/customer, enforce due limit, receipt, A/R credit, account inflow, linked order payment, audit |
| Expense/voucher | Validate account, post expense/voucher and account movement, audit |
| Supplier settlement | Supplier payable/payment event, account outflow where applicable, audit |

Also implement **idempotency keys** on posting endpoints. Retried network requests must not create a second delivery, invoice approval, money receipt or expense. Do not generate document numbers with `existingArray.length + 1` in production.

## 8. Authentication implementation

Recommended initial path: **Supabase Auth with existing Express API as the authorization gateway**.

1. Disable open/public employee registration in the business workflow.
2. Provision exactly one initial Super Admin through a controlled server-side bootstrap command. Do not seed the demo admin/password into production.
3. Super Admin invites employees. Persist employee profile, auth UUID, role, overrides and capabilities in the database.
4. Login uses Supabase Auth; browser sends a short-lived access token with its API requests.
5. Express verifies the token's signature, issuer, audience, expiry and user identity using supported Supabase server methods; it then loads current employee status/access from PostgreSQL.
6. Ignore `x-user-id` and `x-role` for trusted identity; neither should authorize a request.
7. Enforce role default → explicit DENY/ALLOW → capability → SELF/TEAM/ALL scope in the backend.
8. Use a provider-verified password reset/invite flow and add MFA for privileged roles.
9. Logout/revocation and role-disable behavior must be tested; short token lifetime plus server-side status checks limit stale authorization.
10. Store auth secrets exclusively server-side. Avoid copying service-role keys into `VITE_*` environment variables.

Security note: If using privileged DB credentials server-side, the API must *always* enforce RBAC and record scope. RLS is useful defense-in-depth but not automatically applied to arbitrary privileged SQL connections.

## 9. Private file storage

- Private `erp-documents` bucket: import PI/LC/BL, customs/cost proofs, employee evidence, receipts and expense attachments.
- Public `website-media` bucket: explicitly published website images/certificates/resources only.
- Store file metadata in a DB `documents` table: owner/entity, storage key, MIME, size, uploader, sensitivity, createdAt, checksum where useful.
- Upload: authenticated API authorizes purpose and generates short-lived signed upload instructions; client sends bytes straight to storage; API validates/commits metadata. Prevent arbitrary path/key grants.
- Read: API verifies user+entity+capability+record scope, then streams content or generates a short-lived signed read URL.
- Keep audit of sensitive document access and publication changes.
- Configure file-size/type limits and malware scanning as risk requires.
- Database backup does not automatically back up file objects; define separate file retention/export/versioning practices.

## 10. First practical developer steps

**Infrastructure setup (no code refactor yet)**

1. Create separate Supabase **development** and **production** projects (a staging project is preferred before launch).
2. Choose matching nearby DB/API regions and record monthly budget.
3. Configure Supabase Auth redirect URLs, email sender, invitation policy and MFA policy.
4. Create private/public storage buckets with appropriate policies.
5. Configure Vercel Production and Preview environments; *never* point preview/demo builds at production financial tables.
6. Decide cutover date and obtain client-authorized real opening records.

**Code setup**

```bash
npm install drizzle-orm postgres @supabase/supabase-js
npm install --save-dev drizzle-kit
```

Illustrative **server-only** environment variables (use the provider's actual URLs, never commit secrets):

```dotenv
DATABASE_URL=<supabase-transaction-pooler-URL>
DATABASE_MIGRATION_URL=<direct-or-session-connection-for-migrations>
SUPABASE_URL=<project-url>
SUPABASE_ANON_KEY=<public-key-only-if-browser-auth-uses-it>
SUPABASE_SERVICE_ROLE_KEY=<SERVER-ONLY>
```

**Do not place `DATABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` behind a `VITE_` prefix.** The current same-origin Vercel deployment should continue using relative `/api/*` URLs, so leave `VITE_API_BASE_URL` unset/blank.

Suggested incremental folders (do not reorganize all frontend files first):

```text
database/
  schema/
  migrations/
  client.ts
  seed-demo.ts       # DEV ONLY
  bootstrap-admin.ts # controlled, one-time
server/
  auth/              # verified auth, current user lookup, policy
  repositories/      # queries
  services/          # transactional business commands
  routes/            # progressively extracted from index.ts
  index.ts           # Express composition remains
src/domains/          # KEEP existing frontend service boundary and DTOs
```

## 11. Phased implementation order

### P0 — Stop security/data loss before live data
- Replace mock authentication, token generation, user-header trust and unverified password reset.
- Stand up PostgreSQL and migrations, user/access tables and audit.
- Separate demo seed path from production empty/authorized data.
- Establish protected environments, backup policy, health checks and logs.

### P1 — Core trading backbone
- Move products/suppliers/customers master data.
- Move ImportCase/products/costs/snapshots and warehouse receipts.
- Move stock batches/movements and atomic FIFO dispatch.
- Move quotes/orders/deliveries/invoices/collections.
- Run all financial/stock write operations transactionally; add idempotency and unique numbering.

### P2 — Complete business modules
- Move operating expenses/cash-bank/account ledger/supplier settlements/financial position.
- Move employee roles/marketing activity/field team and audit.
- Migrate reports to SQL over the same authoritative records; compare to existing mock fixtures for parity.
- Migrate website-admin data/public inquiries.
- Migrate all documents to private object storage and public media to controlled public storage.

### P3 — Production cutover
- Import approved real master data and verified opening quantities/balances; do not blindly copy fake fixtures.
- Reconcile stock, customer opening due, cash/bank, supplier balance, and Balance Sheet foundations with client sign-off.
- Run tests under concurrent users and deliberate request retries.
- Verify restore of DB backup and retrieval of stored documents.
- Deploy staging then production; confirm rollback and break-glass admin procedure.
- Turn off demo endpoints and demo login in production.

### Workforce Implementation Checkpoint (24 October 2026)

Employee/team hierarchy, safe scoped directory/profile/access controls, authenticated manual marketing activities/private evidence, canonical leads/customer conversion, follow-ups, daily/monthly plans, independent plan reviews, targets and score rules now persist. Migrations 0017-0018 were applied only after a destination backup; existing business history was not reset. Submitted/approved history is protected by database triggers and audit.

The persistent report catalogue now has 61 supported SQL read models, including scoped employee activity, performance, lead funnel, follow-up, target and field-visit reports. Update 12 adds event-based check-in, private camera evidence, approved customer site versions, independent review, completion/follow-up and immutable history in migrations 0019-0022. It uses the existing identity/team/upload/report architecture, not a second backend. Actual commercial records generate scored events; manual notes and check-ins never fabricate money or GPS proof, and visit points remain disabled.

The executive dashboard and versioned warehouse/cost-preset/client-decision settings are now connected in migration 0023. The dashboard shares existing report/journal facts, omits unauthorized source fields and distinguishes period financial values from current operational queues. Seven-role desktop/390px checks and actual partial receiving verify the frontend/API boundary.

Field-device HTTPS UAT, approved privacy/retention operations, opening reconciliation, stock corrections and production cutover remain unfinished. Public-site persistence and AI are optional later phases under the latest scope. See `PRODUCTION_BACKEND_PROGRESS.md` for current verified acceptance, not the historical baseline above.

## 12. Verification / definition of done

- [ ] Restart API or redeploy Vercel: posted records remain unchanged.
- [ ] Two users simultaneously posting the last units of one batch cannot oversell.
- [ ] Retrying approve invoice / post collection does not duplicate the transaction.
- [ ] Unauthenticated, forged user/role header, expired token and inactive employee all fail.
- [ ] A Sales Executive cannot read another's customer/order via a direct URL or API request.
- [ ] Sensitive cost, profit, financial position and private files enforce capabilities.
- [ ] Delivery reduces inventory only; Approved Invoice posts financial debit; Collection credits receivable and cash/bank.
- [ ] Import landed cost snapshots and receipt-derived valuation remain immutable as specified.
- [ ] Update 10 Reports screen/CSV/A4 all use the same DB-backed filtered data.
- [ ] Update 11 Sales Order lifecycle shows correct linked docs after a second user posts Collection.
- [ ] Backups include demonstrated DB restoration; file-object recovery is separately covered.
- [ ] Business reference codes cannot collide under concurrency.
- [ ] Staging and production have separate DBs, storage buckets and auth projects.

## 13. When a separate always-on Express backend is better

Keep the same code and database but deploy API to a persistent service (Render/Railway) if any of these materialize:

- private persistent WebSockets for live field GPS;
- long-running imports, PDF generation or document processing;
- queue workers and scheduled workflows that cannot finish promptly in a function;
- company requires independent API release/scaling or private network architecture;
- measurements show Vercel Function limits/latency are unsuitable.

If split, configure Vercel web with `VITE_API_BASE_URL=https://api.example.com`, strict origin CORS, secure sessions and deployment-aware credentials. **Do not keep any authoritative balances in the process memory of that always-on server.**

## 14. Primary references

**Project**
- https://github.com/AN-SWAPNIL/Medical_Supplier_ERP/blob/dev/BACKEND_SETUP.md
- https://github.com/AN-SWAPNIL/Medical_Supplier_ERP/blob/dev/README.md
- https://github.com/AN-SWAPNIL/Medical_Supplier_ERP/blob/dev/server/index.ts
- https://github.com/AN-SWAPNIL/Medical_Supplier_ERP/blob/dev/server/data.ts
- https://github.com/AN-SWAPNIL/Medical_Supplier_ERP/blob/dev/api/index.ts
- https://github.com/AN-SWAPNIL/Medical_Supplier_ERP/blob/dev/vercel.json

**Official platforms**
- https://vercel.com/docs/functions
- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/plans/pro-plan
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/database/drizzle
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/docs/guides/storage/buckets/fundamentals
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/pricing
- https://orm.drizzle.team/docs/transactions
