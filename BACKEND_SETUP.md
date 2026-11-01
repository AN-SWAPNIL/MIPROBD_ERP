# MIPRO ERP Production Backend Setup

Updated: 1 November 2026.

## Branch-Based Environments

See [BRANCHES_AND_ENVIRONMENTS.md](BRANCHES_AND_ENVIRONMENTS.md): `prototype` is mock-only, `dev` uses the development/staging Supabase, and `main` uses isolated client UAT. `npm run dev` selects the matching ignored private file; Git never switches or commits secret `.env` files. The real backend branches contain no mock API/seed modules. Git-linked project isolation replaces the older manual-only deployment arrangement described in historical sections below. Git pushes never apply database migrations automatically.

## New Isolated Client UAT

The newly authorized client-review target is **https://mipro-erp.vercel.app**, Vercel project `mipro-erp`, connected only to Supabase `mipro-erp-uat` (`njbecypawzsuqiteooly`). Development/staging/demo data were not reset or copied. Read [MANUAL_SETUP.md](MANUAL_SETUP.md) for owner password/MFA, **new-project SMTP**, commercial hosting, real company configuration and exact deployment commands. This UAT deployment is not a full production-completion certificate; the engineering register still applies. New setup/runtime credentials are separate ignored files under `artifacts/private/uat*`.

The earlier milestone instructions below remain historical and development-scoped. Normal promotion is feature branch -> `dev` -> `main`; explicit UAT snapshot/deploy scripts remain a fallback. Never use a bare Vercel deploy: its local project link is not selected by the Git branch. Backups are separated by project reference. Missing historical development evidence remains documented, not fabricated or silently deleted.

## Super Admin Authority

An **Active Super Admin** is the unrestricted company owner for permissions/capabilities and policy administration. Employee-specific denials cannot restrict this role. Do not give this role to someone who should have limited access.

- **Settings > Approval Policies:** Super Admin can draft and activate their own policies, select themselves as verifier/approver, or delegate to named employees.
- **Accounts > General Ledger > Posting Mapping** and **Settings > Opening Data:** Super Admin can approve their own valid configuration/review.
- **Header > Approvals:** Super Admin can approve their own or another preparer's submitted request, even when not named in its policy. One Approve action records both Verified and Approved events atomically. This includes payroll sources where the owner is a beneficiary.
- Own employee plans/visit reviews are allowed for Super Admin. Original activity authorship, captured coordinates and uploaded evidence cannot be impersonated or rewritten.
- Delegated users retain assigned module/capability checks, named policy membership, preparer/beneficiary exclusions and any separate-verifier rule. Admin titles alone do not grant Super Admin authority.

Authentication/MFA, amount ceilings, source evidence, exact balances, available stock, current versions, immutable posted records, closed periods and duplicate-posting protections still apply. Super Admin changes a policy explicitly rather than silently overriding its financial limit. Owner decisions are audited; authority is rechecked before posting. No separate administrator/reviewer account is required for the owner to operate the system.

Development migrations **0067-0068** implement the matching database guards; they were applied after backup. Existing records remain intact; no company policy/chart was invented or activated. Older milestone references to mandatory independence apply to delegated users and are superseded by this section for Super Admin.

Regression: `RUN_HOSTED_OWNER_AUTHORITY_TESTS=true` enables `server/controls/owner-authority.hosted.test.ts` against the existing development project only. Add `RUN_OWNER_AUTHORITY_BROWSER_TESTS=true` for real desktop/390px sign-in, own-policy action, self-approval/history and journal posting checks. The API suite also posts an owner-prepared stock count and activates owner-beneficiary compensation/commission policies. Policies, chart and transactions roll back; temporary Auth users are removed. Do not enable hosted regression flags against production.

## Read This Before Client Review Or Production

The current verdict and manual checklist are in [CLIENT_REVIEW_READINESS.md](CLIENT_REVIEW_READINESS.md). **Guided feature review is possible; clean independent client UAT and full production are not yet ready.** The staging URL shares the development Supabase database and is behind the latest local frontend/API. It is not a clean client environment.

The fresh read-only audit finds 99 products, 62 suppliers, 82 customers and 130 stock batches, all test-labelled; 688 of 689 employee rows use reserved test identifiers. Preserve this history. Use a separate, deliberately populated UAT database, not a destructive reset or an empty database that cannot demonstrate reports. Keep mock fixtures/test helpers in source control, but deploy foundation mode with demo identities disabled.

Production gates include remaining Update 13 engineering, actual company chart/approval policies/openings, confirmed credential rotation, isolated database-plus-file restore/offsite recovery, operational jobs/alerts, device/privacy/printing acceptance and business UAT. The configured owner now has one verified authenticator; the separate legacy administrator mapping still needs review. SMTP is configured, but final-URL inbox/link acceptance remains a human check. No extra Express host, Docker or Google Maps key is required for the current architecture.

Read-only review command:

```powershell
node --env-file=artifacts/private/runtime-database.env --import tsx scripts/client-review-audit.mjs
```

The milestone sections below retain historical verification counts and next steps. They are not cumulative proof of current production completion; use the dated review above and `UPDATE13_IMPLEMENTATION.md` for current gaps.

## Staging Is Deployed

Open **https://mipro-erp-staging.vercel.app/login**. The hosted API, development Supabase and private Storage are configured; no new backend host or Docker is needed. The original public demo is unchanged. The local Vercel link now targets only `mipro-erp-staging`; its Production environment is the isolated staging URL. Read `DEPLOYMENT.md` for sign-in/MFA, future deployments, logs and remaining real-production gates. Do not push `dev` or deploy the old demo project to update staging.

Authentication, imports/receiving, sales/money, operating finance, employees/marketing/field visits, transaction printing, supported operational reports, the dashboard and operational settings are installed in the hosted development project. The public website is deliberately static in foundation mode; AI is deferred. The full ERP business-data migration is not complete. This guide refines `files/MIPRO_ERP_Production_Backend_Architecture_Analysis_and_Roadmap.md`.

## Current Production Gap Check

### Business Attachment Formats

Business attachments now accept **PDF, JPEG/PNG/WebP, XLSX, DOCX, PPTX, CSV and TXT** in import documents, expenses, employee supporting documents, manual marketing evidence and quality/replacement inspections. Images/PDFs keep their protected in-page previews. Other formats open a download-only document panel; marketing evidence can use a short-lived protected download link. No private file is sent to Google/Microsoft preview services, and no public permanent URL is saved.

Profile photos, customer/product images and check-in camera evidence remain image-only. Opening Data remains a separate **XLSX-only** validated import/review flow; attaching a spreadsheet never changes inventory, dues or accounts automatically. Legacy DOC/XLS/PPT must be saved as DOCX/XLSX/PPTX. Macro-enabled, encrypted, embedded-object and external-data Office packages, arbitrary ZIP/executable/HTML files are not accepted. TXT/CSV must use UTF-8; their original evidence bytes are retained rather than evaluating formulas.

The private `erp-documents` bucket's allowlist is extended and migration **0066** is applied after backup: **67 matching migration hashes**. Its visibility and 10 MiB ceiling are unchanged; quality attachments retain 5 MiB, the existing receipt/import picker retains 5 MB, avatars 2 MiB and visit photos 300 KiB. The source-workbook and public-media bucket policies are untouched. No manual credential or bucket setup is needed for the configured development project. To inspect/reapply this additive bucket change: `node --env-file=artifacts/private/runtime-database.env --import tsx scripts/document-storage.ts` (dry-run), with `--apply` only for its explicitly scoped development target.

Validation checks filename/type consistency, bounded Open XML ZIP structure/manifests/relationships, text encoding and saved SHA-256; this is **not antivirus scanning or a guarantee that a downloaded document is harmless**. A production malware-scanning/quarantine service remains separate work. Browser downloads reuse existing record/role checks and verify saved hashes. New code remains local until the matching frontend/API staging deployment is approved.

### Replacement Receipt Evidence

Local implementation: **Supplier Claims > a posted Replacement claim > Inspect Replacement > Save Receipt Draft**. Open the receipt's eye action to review quantities, new LOT/batch, dates, BIN, findings and proof. Its separate **Inspection Attachments** accepts optional photos/PDFs using the same private upload controls as other quality records. The receipt preparer then chooses **Submit Receipt for Approval**; Approvals opens that exact receipt. Independent verification/approval and **Post** are still required before accepted stock and its saved cost enter inventory/GL. A pending upload must be completed or cancelled first; submitted evidence cannot be replaced or withdrawn.

Migrations **0063-0065** are applied after backup, with **66 matching migration hashes** and 89 private/RLS tables. No bucket, environment variable, email or service setup is needed. The prior submit-on-create server remains database-compatible during rollout; existing receipts are not rewritten. The new frontend/API code has **not been redeployed** to staging. Extra freight/duty/receiving-cost capitalization and formal receipt correction remain separate work; the zero-additional-cost attestation is still required.

Verified: 147 local tests pass; the full opt-in supplier-claim/API/database flow and 1440px/390px real-login walkthroughs pass, including optional private files, report/print parity and both print modes. Build/types, lint, release checks and migration hashes pass. Original stock/financial evidence is preserved. The current read-only Auth audit also finds one verified administrator authenticator; a separate legacy administrator mapping remains unresolved and must not be silently disabled or reassigned.

Shared Stock Control and Customer Return hosted regressions also pass. Migration 0065 retains the database's legacy Submitted default; the new service explicitly saves Draft. The prior approval-first insert-without-status and posting pattern is verified against the hosted database in a rollback-only compatibility test. Redeploy the matching frontend/API together before using the new draft workflow through the shared staging database; an older browser/server cannot display the new draft DTO. Do not create company transactions to test a mixed-version rollout.

### Dated Compensation Allocation

Development migration **0062** adds source-checked split compensation; no new service, bucket or environment variable is required. In **Accounts > Payroll > Prepare Payroll Review**, add an employee, then **Load Approved Periods > Use These Periods** within that employee's earnings section. Enter the approved factor, overtime hours and earnings reference for every effective period. Employee totals reconcile automatically. Save the review, inspect **Approved Compensation Periods**, and use the existing independent Submit > Verify > Approve > Accrue > Payment flow. Payslips include both the period dates and source references.

Single-profile payroll remains supported. A mid-month change requires an explicit split; the backend never silently substitutes the new rate for the whole month. Approved company proration/attendance rules still have to supply the earned factors. Activating a policy does not edit prior accrued payroll. Formal retroactive correction remains unfinished and must not be simulated with a second regular payroll for the same month.

Verified with the full opt-in payroll/API/database suite and 1440px/390px real-login walkthroughs, including actual payment, own payslip, reports and both print modes. Current totals: 144 local tests pass, 63 matching migrations, 89 private/RLS tables. No new environment/provider configuration is needed for this increment; the existing manual recovery/staging/company-policy gates still apply.

### Inspection Evidence

Stock Counts & Write-offs, Customer Return Inspection, Supplier Claims and replacement receipt inspections include **Inspection Attachments** on the saved source workspace. Photos remain optional. Save a draft, attach private JPEG/PNG/WebP or PDF evidence (5 MiB maximum), then submit for approval. Complete or cancel a pending upload first. Only a recorded preparer with the source action permission can attach/withdraw files; sensitive commercial files also require cost-view authority.

Files go directly to the existing private `erp-documents` bucket, not through an ERP JSON payload. Completion validates bytes/type and records SHA-256. Submission freezes an immutable evidence manifest linked to the actual approval. Reviewers open the source from Approvals to inspect its attachments. Revisions inherit prior evidence; withdrawing a file excludes it from the current review but retains its bytes, reason and earlier approval history. Protected previews verify the saved hash before display. No extra Storage bucket or environment variable is needed.

The first inspection milestone used migrations **0060-0061**; **0063-0065** extend it to replacement receipts without changing the private-role boundary. Customer repair/replacement tracking and extra-cost replacement capitalization remain separate work, not hidden under the supplier-claim feature.

```bash
npm run test:quality-backend
```

Hosted inspection regression is included in the opt-in Stock Control, Returns and Supplier Claims suites. Each uses reserved synthetic uploads and cleans only its own object paths after rolling back its business/configuration transaction. Never enable these tests against production.

The authoritative checklist is [PRODUCTION_BACKEND_PROGRESS.md](PRODUCTION_BACKEND_PROGRESS.md). The 21 October architecture analysis is a historical baseline, not a claim that all business endpoints now use PostgreSQL.

The current specification is `files/MIPRO_ERP_Simplified_Plan_update13.md`. Read `UPDATE13_IMPLEMENTATION.md`, the historical `UPDATE13_BATCH0_AUDIT.md` and `client_requirement_coverage.md`. Vercel production tracks `dev`; a push can deploy. Implementation is on local `work/update13-preflight`; no push, deployment, Auth-setting change or credential rotation was performed. Authorized additive development migrations through 0059, a restricted runtime login and a private source bucket are applied. Shared approvals, balanced operational GL, partial holds, counts/write-offs, condition release and customer return/refusal/credit/refund sources are implemented. Regular confidential payroll/commission/advances/loans/payments/payslips are implemented. Supplier receipt-rejection/held-stock claims, non-cash credit and zero-additional-cost replacements are connected. Formal posted-source corrections, mid-month payroll splits and production cutover remain unfinished, not silently deferred. Current verification is recorded below and in the implementation register.

The preflight rechecked migration hashes, stock/journal equality, administrator metadata and backup integrity. The configured administrator has confirmation/sign-in evidence but no verified TOTP; a second Active administrator mapping returns provider 404. Do not auto-repair/disable either record or infer human inbox/MFA acceptance. The persistent workspace now reuses the original sidebar/header/mobile layout.

The Sales screen and Update 11 order workspace now use persistent customers, quotations, orders, actual FIFO deliveries, invoices, receipts and their customer/cash-bank journals. Canonical product identities, decimal-string pricing, optimistic versions, idempotent posting and record ownership are enforced by the API. Conversion posts neither stock nor receivables; delivery posts stock/COGS, approval posts due, and collection allocates that due and posts cash/bank atomically. Reversals preserve originals and append compensating entries. Customer totals come from immutable journals, never request totals. This is a connected development increment, not a complete production release.

Security fixes include per-identity/per-permission React Query caches, independent cost-display guards, same-browser logout/sign-in sequencing, replacement invitation links and database-enforced case-insensitive LC uniqueness. Unconfirmed Pending users receive a replacement invitation; confirmed Pending users receive a password-setup recovery link. The employee remains Pending until verified acceptance. Actual SMTP delivery still needs acceptance testing.

There are now 86 private ERP tables, protected by RLS/private-schema grants. Backup-first development migrations through 0059 preserve existing history. Migrations 0024/0025 add invitations/opening review; 0026/0027 add opening posting and signed stock; 0028-0031 add approvals/ledger; 0032 adds partial holds/releases; 0033/0034 add approved stock controls; 0035/0036 add inspected returns, settlements and accepted-only invoice lineage; 0037/0038 enforce source dates and forward-fix the trigger's header/line branch. Migrations 0039-0048 add confidential payroll, exact source/approval/cash/GL guards and beneficiary protection. Migration 0049 connects return credit to approved opening receivables. Migrations 0051-0059 add supplier rejection/credit/replacement and source-integrity guards; final migration checks are recorded in the implementation register. Comprehensive ledger/stock/return tests roll synthetic records/configuration back; the separate ledger concurrency test retains labelled offsetting journals and archived test accounts, not company mappings. Reserved test Auth identities are removed afterward. The original client workbook remains unposted.

Production now fails closed if `ERP_BACKEND_MODE` is absent, browser/API modes disagree, or foundation mode enables demo identities. An intentionally public **mock-only** deployment must explicitly use `ERP_BACKEND_MODE=mock`, `VITE_BACKEND_MODE=mock`, `DEMO_DEPLOYMENT=true`, `DEMO_MODE=true` and `VITE_DEMO_MODE=true`, and contain no real company data. A real deployment uses both backend modes `foundation`, both demo flags `false`, and `DEMO_DEPLOYMENT=false`. No deployed environment settings were changed automatically; review these before any deployment of this increment.

Run `npm run test:sales-backend` for local pricing/scope tests. Set `RUN_HOSTED_TRADING_TESTS=true` in that process to include hosted customer/quote/order and full transaction/concurrency integration. `RUN_BACKEND_BROWSER_TESTS=true` also enables real-login Sales walkthroughs and desktop/390px screenshots; use an unused local `APP_URL` port, such as `http://localhost:5187`. These tests do not send invitation emails or modify platform settings. Posted test history is retained, so run only against the development project.

## Import And Receiving Increment

- Persisted product/supplier administration, one-record imports, commercial details, canonical product items, shipment milestones and dynamic cost rows. Masters are deactivated rather than deleting their historical references.
- Server-authoritative FOB/CBM/FX calculations, all five allocation methods, immutable/versioned landed-cost snapshots, and audited Super Admin finalization/reopening. Reopening is prohibited after any warehouse receipt.
- Transactional partial receipts create linked receipt lines, stock batches and movements together. Parent-record locks prevent excessive concurrent receipts; required idempotency keys prevent replayed creation/finalization/receiving from posting twice. The browser retains the same key after an ambiguous network failure.
- Precise batch valuation reconciles to finalized item totals without multiplying a two-decimal display rate. Rejected units create no inventory; a production loss/claim treatment remains pending.
- Private import-document uploads use direct Storage upload and protected completion/read. Financial document types cannot be made public by clearing a checkbox. Attach supporting cost invoices in the import Documents section; cost-row-specific attachment linking remains pending.
- Role-filtered screens at `/backend/imports`, `/backend/inventory`, `/backend/sales`, `/backend/accounts`, `/backend/employees`, `/backend/reports` and `/backend/settings`; profile/security remains at `/backend/profile`. Settings includes cash/bank administration, Company Stationery and Operational Settings. FIFO preview and actual dispatch both exclude expired and future receipts. Supported operational reports, field check-ins, dashboard and transaction printing are connected; approved Balance Sheet/opening reconciliation remains outstanding.

These additive migrations were applied only after a destination backup. No Supabase Auth settings, Vercel settings or deployment environment values were changed during this increment. No source fixtures or existing records were migrated/deleted. Preserving the old prototype's runtime-only records still requires locating/exporting that source before cutover.

`npm run test:imports-backend` is unit-only by default. Opt into hosted development checks with `RUN_HOSTED_IMPORT_TESTS=true`. These create clearly labelled `DEV TEST` business records and temporary reserved Auth accounts; the accounts are removed and employee/audit records retained as Inactive. Posted business history is retained, not deleted. `RUN_BACKEND_BROWSER_TESTS=true` also enables desktop/390px screenshots. Use an unused `APP_URL` localhost port for this isolated test. The tests do not edit hosted redirect settings.

The regression and acceptance counts are recorded in `PRODUCTION_BACKEND_PROGRESS.md`. Hosted tests additionally verify actual stock/money posting, multi-instance races, precise partial valuation, receipt allocation, operating expense/supplier journals and forbidden financial edits. Sales, Accounts, import/master/inventory and field-visit browser checks run at desktop and 390px. Finance acceptance includes private receipt upload/preview, MD read-only controls, Sales Executive route denial and unchanged finalized landed cost. Screenshots are under ignored `artifacts/backend/`. The latest read-only readiness check has zero failures and two warnings: a plaintext password comment in ignored `.env`, and no approved company GL mapping. Development tests do not install their chart as the company's real mapping.

Next: supplier returns/claims/replacements, photo-linked damage/claim evidence, formal posted-source corrections, mid-month payroll splits, approved financial statements/opening reconciliation and controlled old-data migration, plus field-device/privacy/retention and operational security/release acceptance. Customer return/refusal/credit/refund is implemented as described below. Do not switch the live ERP to foundation mode until required workflows and deployment acceptance checks are complete. The static public brochure does not depend on ERP endpoints. Transaction and supported report print actions use saved stationery with source-specific backend authorization.

## Update 13 Local Commands

### Payroll Setup And Navigation

Open Employees, Accounts or Profile > **Payroll & Commission** at `/backend/payroll`. Every authenticated employee has Profile > **My Payslips**, restricted to their own accrued lines. The sidebar is unchanged.

1. Super Admin configures real Ledger accounts/mappings, including Payroll Expense/Payable, Employee Advances/Loans and Payroll Deductions; another authorized person approves the mapping.
2. Settings > Approval Policies: configure Payroll Policy and Payroll with actual effective dates, monetary limits, named verifiers and final approvers. Super Admin may activate their own policy and approve their own source, including owner payroll. Delegated beneficiaries/preparers remain excluded; split delegated management payroll when necessary.
3. Use exact existing employee identities. Enter joining/end dates, approved wage components, verified payee channel/details and source evidence. Independently approve and activate compensation and, where eligible, commission basis/rate/recovery policies. No company rate or statutory formula is seeded.
4. Prepare a completed salary month, evidenced earned factor/bonus/OT/deductions and recoveries against original posted financing. Review the immutable calculated run, submit, independently verify/approve, then Accounts accrues it. A separate approved payment records actual cash/bank movement, not an external transfer.
5. Reports contains payroll registers and confidential control reconciliation. Own payslips and authorized report previews use the existing two letterhead modes. No salary/payee fields appear in the public website or ordinary employee directory.

Explicit delegation requires `view_payroll`; preparation additionally requires `manage_payroll`, and final approval requires `approve_payroll` plus the named policy role. Accrual/disbursement also requires Accounts posting permission. Active Super Admin has full domain authority and can self-approve; delegated maker/beneficiary independence remains enforced. Production privileged MFA enforcement still applies.

Mid-month compensation splits, posted payroll corrections/reversals and automated statutory tax/attendance are not implemented. Real compensation, lawful deductions, opening company ledger reconciliation and employee acceptance remain required. The rollback-only payroll/browser suite does not install real policies or retain synthetic salary records.

Migration 0050 enforces a nonzero agreed employee installment as well as the remaining principal. Zero installment sets no automatic recovery schedule; an evidenced payroll deduction still needs independent approval. A posted financing agreement cannot be silently changed. `npm run test:payroll-backend` runs local checks; `RUN_HOSTED_PAYROLL_TESTS=true` opts into the rollback-only restricted-role integration suite. Add `RUN_PAYROLL_BROWSER_TESTS=true` for desktop/390px walkthroughs, or `PAYROLL_BROWSER_VIEWPORT=mobile` for the focused mobile pass. These are development tests, not permission to test against production.

`npm run dev:backend` starts the persistent workspace at `http://localhost:5178`. It automatically reads `artifacts/private/runtime-database.env` when present. That ignored file contains the generated **server-only** `DATABASE_RUNTIME_URL`; never copy it into a `VITE_*` variable or Git. The migration connection stays separate. Production foundation mode enforces restricted runtime privileges; the mock-only live demo is unaffected. Vite's early private-file boundary denies source/workbook, secret and artifact/backup paths even with asset-transform queries. `node --import tsx scripts/dev-file-access-check.ts` checks a running localhost:5178 using its own harmless sentinel, not real file contents. The helper uses its own dependency cache alongside the older demo server.

```sh
npm run db:migrate -- --apply
npm run db:verify
npm run backend:runtime-database -- --apply
npm run backend:opening-storage -- --apply
npm run backend:opening-profile -- "files/Stock, Delivery, Due list.xlsx"
npm run backend:invitations -- --apply
npm run backend:storage-backup
npm run test:update13
```

Run migrations only against the intended authorized development destination; the command backs up first and never resets/reseeds. Next reconcile runtime grants for the new tables and verify denied operations without resetting an existing role password, then create/verify the private source bucket. A deployed web runtime needs only the restricted URI: do not include migration/admin database credentials in its environment. Profiling is read-only; detailed output stays in ignored `artifacts/opening/`. The invitation command processes at most five due jobs and can send real queued mail; do not run it as a casual connectivity test. No cron has been deployed. Queue state is available at Employees > Invitation Delivery.

`backend:storage-backup` is a no-copy dry run by default. The owner has now explicitly authorized private local file capture; `npm run backend:storage-backup -- --download` captured 49 objects (25 unique content files, 133,486 total bytes), with local SHA-256 verification. Files/manifests remain in ignored `artifacts/backups/storage-*`; no remote objects were changed. `npm run backend:verify-backups` independently checks database/manifest checksums, bounded local bytes and linked file references. The current audit finds 21 missing historical test-named references (9 avatars, 12 import documents), zero mismatched file hashes and one unreferenced object. It reports incomplete reference coverage rather than recreating evidence. A database JSON plus local byte capture is not hosted restore, offsite recovery, encryption-policy acceptance or an RPO/RTO certificate.

Settings > Opening Data now supports `Draft -> Validated -> Previewed -> Approved -> Posted -> Reconciled`. An authorized preparer supplies exact master mappings, source-cell/proof references, approved stock cost/condition and original invoice dates. Another authorized Super Admin must approve; neither the creator nor last editor may approve. A Super Admin then explicitly confirms posting. Posting/retry is atomic and source-idempotent; it does not fabricate imports, sales invoices, revenue or cash payments for historical supplier advances. Cash openings cannot be added to accounts with existing journals. Original FIFO dates do not permit dispatch before the opening count date. The reconciliation table compares original source postings, so later legitimate dispatches and collections do not invalidate it.

Current permission boundary: opening access requires Settings view plus sensitive-cost authority; edit/create/approve actions require the corresponding live Settings permission. Super Admin alone approves/posts. No public signup or role-switch bypass is added. The Super Admin may prepare, approve and post a valid opening review without a second administrator.

Normal invoice approval and new supplier obligations also check approved opening references, so a historical reference cannot be entered again as fresh debt after migration. Genuine later payments against that supplier remain allowed. Original client data must still be mapped and independently reconciled before real posting.

Supplier returns/claims/replacements, photo-linked damage evidence, formal posted-source corrections, payroll/commission, remaining ledger/cutover acceptance and release controls are tracked in `UPDATE13_IMPLEMENTATION.md`. Customer returns/credits/refunds, partial holds/releases/disposal and selected-batch counts are implemented. No manual environment or platform change is required to try this localhost increment. Real cutover evidence, owner inbox/password/MFA, administrator mapping review and future staging authorization remain separate responsibilities. The real workbook must not be posted merely to test the interface.

## Approval And Ledger Setup

1. An authorized Super Admin grants only the necessary employee capabilities. Ledger readers need Accounts view, sensitive-cost access and `manage_ledger` or `approve_ledger` (Super Admin still needs Accounts/cost access). Ledger preparation/posting additionally needs Accounts post and management authority. New payroll/accounting/stock-control capabilities cannot be delegated by non-Super-Admins; production requires privileged MFA.
2. In **Settings > Approval Policies**, draft named verifiers, final approvers, an effective date, amount ceiling and evidence reference for Ledger, Stock, Returns, Rejections, Payroll Policy or Payroll. Super Admin can activate their own policy. Delegated source preparers, including earlier revisions, are excluded from deciding their request; delegated payroll beneficiaries are also excluded. Optional separate-verifier enforcement separates delegated final approvers from verifiers. Supplier claim and replacement receipt sources use Rejections; policy setup alone does not supply company authority or cost evidence.
3. Open **Accounts > General Ledger > Chart of Accounts**. Enter the company's reviewed chart; do not use made-up opening amounts. **Posting Mapping** links each operational control to a separate appropriate chart account, and each cash/bank master to a separate Asset account. Sales Returns is a contra-income account. Super Admin can approve their own mapping. Existing cutover/control mappings cannot be silently replaced; later versions can add cash references. Reclassification needs reviewed engineering and accounting correction.
4. Enter independently evidenced opening/adjustment journals. **Save Draft > Submit for Approval > header Approvals: Verify > Approve > journal: Post Approved Journal**. All lines, even drafts, are append-only; editing produces a linked revision. Policy and source version checks protect against stale or withdrawn approval. Closing a completed period follows the same independent review, then **Close Approved Period** in the inbox.
5. After approved cutover, supported receiving, delivery, invoice, collection, expense and supplier postings create their balanced GL journal in the same transaction. Missing/inactive mappings fail the business posting; no account is guessed. Earlier sources are excluded from automatic posting and require approved opening reconciliation. Historical operational records are not automatically imported into GL.
6. All ledger report settings, CSV and both official letterhead modes remain in **Reports**: Trial Balance, Account Statement and Control Reconciliation. A balanced trial balance is not evidence of verified company openings or a completed Balance Sheet.

Production requires an approved mapping. Local development may defer supported sources before the first mapping; `ERP_REQUIRE_LEDGER_CONFIGURATION=true` enables strict local rehearsal. This flag needs no new provider/service, and is shown only in `.env.example`; your private `.env` was not changed.

`npm run test:ledger-backend` runs local tests and skips hosted mutations by default. Opt-in `RUN_HOSTED_LEDGER_TESTS=true` runs rollback-only HTTP/database integration; `RUN_LEDGER_BROWSER_TESTS=true` additionally exercises desktop/390px UI on an unused localhost:5197. The separate `RUN_HOSTED_LEDGER_CONCURRENCY_TESTS=true` suite uses two real API/database workers with labelled offsetting test journals, never a company mapping. Use only the authorized development project, and do not run it concurrently with the rollback-only suite. No test invitation emails are sent.

## Partial Stock Holds And Inspection Release

1. **Inventory > Batches**: search the product/lot, then select its shield action. Warehouse staff with Inventory post permission enter the affected quantity, Quarantine/Damaged condition, reason and evidence reference. The hold takes effect immediately; approval is not required to protect stock from dispatch. It cannot exceed unreserved physical units.
2. **Inventory > Stock Holds**: open the hold and submit a partial/full inspection release with its outcome and evidence reference. An effective independently approved **Stock** policy is required. Named verification and final approval happen in the header **Approvals** inbox; the source button opens the hold directly. A delegated preparer cannot decide their own release; Super Admin can self-approve.
3. A warehouse user with Inventory post permission chooses **Post Release** after approval. Posting is versioned/idempotent and rechecks the outstanding quantity and current authority. Expiry still blocks dispatch. Rejected/retired requests remain in history; submit a new reviewed request rather than edit evidence.
4. Holds/releases reserve units only. Physical quantity, saved book value and GL stay unchanged. Stock lists, FIFO/profit previews, deliveries and as-of stock reports agree; Reports > Inventory > **Stock Holds & Releases** uses the same official Print Preview and two letterhead modes. Written-off quantities are separate from saleable releases, with linked source history. A batch's original whole-stock opening condition remains unchanged; its effective condition may change only through the separate approved workflow below.

`npm run test:stock-holds-backend` is local-only unless `RUN_HOSTED_HOLD_TESTS=true`; `RUN_HOLD_BROWSER_TESTS=true` adds the built desktop/390px real-login walkthrough on localhost:5196. Use only the authorized development destination and the restricted runtime credential. Stock/approval fixtures roll back; no real policy is activated, email sent or company stock changed. No additional platform or private environment setting is needed for localhost.

## Counts, Write-offs And Whole-condition Release

1. **Inventory > Counts & Write-offs > New Count**: select the actual batches, enter observed quantities/date, investigation, inspection findings and evidence reference. The source is explicitly a selected-batch count, not automatically a complete warehouse count. Saving a draft posts no stock, cost or GL. Missing surplus cost/condition blocks submission.
2. A user with Inventory post plus sensitive-cost view/edit authority can make a **Reviewed Revision** with evidenced surplus cost/condition. Earlier content stays immutable and linked; all preparers across revisions are excluded from source verification/final approval. No selling price is substituted for missing cost.
3. **Submit for Approval > header Approvals: Verify > Approve > source: Post Approved Control**. An effective Stock policy is required. Super Admin can self-approve; delegated decisions need named independent people. Final stock-correction approval needs sensitive-cost authority and stock approval capability (or authorized Super Admin); revocation is rechecked before posting. Any subsequent stock/hold/condition change blocks a stale snapshot. Reject an active pending request before preparing a replacement.
4. **New Write-off** selects stock held by its whole-batch condition. For partial holds, open **Stock Holds > hold > Prepare Write-off**. Supply actual disposed quantity and inspection/evidence. Approved posting removes the exact held quantity and saved stock cost together; it does not release damaged items for sale. A hold's **Write-off History** opens its linked source documents.
5. **Condition Release** handles a whole-batch quarantine/damage condition after inspection, without changing quantity, expiry or original opening/receipt evidence. A dated immutable condition event changes dispatch eligibility; an expired batch remains ineligible. This is separate from a partial hold release and creates no loss/GL entry.
6. Surplus creates a correction-origin batch with explicit cost and condition. Loss/write-off posts **Stock Loss / Inventory**; surplus posts **Inventory / Stock Gain**, using the approved GL mapping in the same transaction. Missing/inactive mappings roll everything back. Nothing adjusts original landed-cost snapshots, customer dues or cash.
7. **Open Report** selects the matching report with the source document filter. Reports holds Stock Control Register, Stock Counts & Variance, Stock Write-offs and Stock Condition Releases. All exports/official print modes share SQL; draft proposals are not posted financial impact. A4 groups identity, count/value, evidence and named decisions for readability.

`npm run test:stock-controls-backend` runs local checks and skips hosted work by default. Opt-in `RUN_HOSTED_STOCK_CONTROL_TESTS=true` uses the authorized development database/restricted login in a rollback-only transaction; `RUN_STOCK_CONTROL_BROWSER_TESTS=true` adds built 1440px/390px walkthroughs on unused localhost:5193. Do not run rollback-only hosted suites concurrently. Tests do not retain company-wide policies/mappings or stock. Formal correction/reversal of already posted sources, photo-linked damage/claim files and payroll remain separately tracked, not implemented by the draft revision button.

No new platform, Docker, hosting or private environment setting is needed for this localhost increment. Before company use, configure actual named authority, evidence/cost policy and the reviewed chart; test settings are rolled back, never installed as company defaults.

## Customer Returns, Refusal And Credit

1. Open **Inventory > Customer Returns**, **Sales > Returns & Credits**, or an order's contextual **Returns & Credits** button. The register and original-delivery picker are paginated. Warehouse staff with Inventory post or staff with Sales create prepare inspections; Sales Executives are restricted to their own source orders. No new main-sidebar destination is added.
2. Select the actual original challan/lines; enter returned quantity, inspected condition, BIN, received date, findings and evidence reference. The API selects the original approved invoice for an **Invoiced Return**. **Uninvoiced Refusal** requires no active invoice. Resolve a draft invoice first. Saving an inspection changes no stock, cash or dues.
3. Configure a genuinely approved **Returns** policy with independent named verifiers/final approvers. Submit, verify and approve in the existing header inbox. Delegated preparers across revisions are excluded; Super Admin may self-approve. Financial/cost authority is rechecked. Warehouse posting then atomically creates a separate returned-stock batch/movement and the applicable invoice credit/GL. Original LOT/expiry and saved delivery cost are retained; quarantine/damage and expiry still block dispatch.
4. A refusal issues zero financial credit. A later invoice bills only accepted quantity, carries immutable refusal-line IDs, and retains exact remaining saved sale, discount and cost. It cannot be backdated before the refusal source. Fully refused goods show invoice/collection **Not Required**, are excluded from missing-invoice exceptions and cannot generate an empty invoice. Returns do not automatically reopen a replacement shipment; supplier claims/replacements are now linked to their original import/hold sources, while customer repair/replacement tracking and formal posted-source corrections remain separate work.
5. Credit first reduces unpaid original invoice due. **Unapplied Credit** remains visible on the return. Accounts staff with Accounts post and Sales view can **Apply Credit** to a different outstanding invoice of the same customer or **Request Refund** from an active cash/bank/mobile account. Each request receives separate independent approval; **Post Settlement** rechecks credit/due/account balances and posts once. Refunds record an actual journal outflow, not an external bank-transfer API call. A cashless application creates no revenue or cash movement.
6. Source **Open Report** leads to **Reports**, retaining the source filter. Inspected Stock Returns, Customer Return Credits and Return Credit Applications & Refunds share authorized SQL with CSV and both letterhead preview modes. Warehouse roles do not gain Reports automatically. Sales, customer dues, employee financial performance, dashboard and cash/GL use dated return credits and actual refunds; original receipt documents remain preserved.
7. Notes/proof references are supported. Supplier rejection/credit/zero-additional-cost replacement, regular payroll/commission and **Apply Credit** to an approved original opening receivable are now connected and tested. Original opening journals remain unchanged; later collections skip settled debt. Photo-linked damage/customer claim files, customer repair/replacement, extra-cost supplier replacement and formal posted return/refund/payroll corrections remain engineering work, not implied by these buttons.
8. The register can be empty until someone records an actual inspection. Automated tests roll their stock, credit, refunds and synthetic policies/mappings back; they do not populate company data or activate authority. Configure actual reviewed policies/chart and use real original records before business posting, not invented sample balances.

`npm run test:returns-backend` runs local calculation/input tests and skips hosted work by default. Opt-in `RUN_HOSTED_RETURN_TESTS=true` uses restricted-role HTTP/Auth inside a rollback-only transaction; `RUN_RETURN_BROWSER_TESTS=true` adds built desktop/390px walkthroughs on unused localhost:5194. Do not run rollback-only hosted suites concurrently. Test mappings/policies/stock/money roll back; no company chart is installed and no test invitation email is sent. See the implementation register for final evidence and outstanding acceptance.

## Static Public Website And Deferred AI

- Foundation `/`, About, Products/details, Certificates, News/articles and Contact use bundled, schema-validated published brochure content. They need neither an employee session nor a working ERP API. This is a Vite static SPA, not a new server-rendered CMS.
- Update `src/features/public/public.content.ts` and approved assets under `public/`, then rebuild/deploy to change published content. Private stock, costs, customer records, employee evidence and Auth configuration never become public catalogue data.
- Contact prepares an email/WhatsApp draft. The visitor must send it through the external app; the site explicitly does not claim it was submitted, stored or converted to a lead. A server inbox/editorial workflow is deferred, not a current release blocker.
- AI chat, provider integration, extraction and automatic recommendations are deferred in foundation mode. There is no active floating assistant, no AI credential requirement and no ERP record transmission to a model. Historical mock AI remains separate from the real backend.
- Old supported `/app/*` links redirect to their matching `/backend/*` workspace while preserving record IDs, report query filters and print destinations.

## Authenticator And Release Security

### Hosted Auth And SMTP Audit: 28 October

- Account holder configured Gmail SMTP. Read-only Supabase CLI inspection confirms SMTP enabled at `smtp.gmail.com:465`, configured sender/username/name, 30 emails per hour and a one-minute resend interval. App Password values were not displayed or changed. These settings do not prove actual inbox delivery.
- Hosted Site URL is `http://localhost:5178`. Exact recovery redirects for localhost ports 5178 and 5173 are already allowed. Public signup is disabled, email/password and email confirmation are enabled, minimum password length is 12, and TOTP enrollment/verification are enabled. No correction or rate-limit increase was needed.
- Invitation/recovery template subjects were inspected through CLI metadata. This CLI audit did not expose the HTML template bodies; do not claim that branding, confirmation-link markup, email rendering or delivery are fully verified. Complete those checks with an authorized inbox test/provider template inspection.
- The running local helper reports `mode=foundation` and `database=connected` at `http://localhost:5178`. The real hosted foundation suite passes all six tests, including recovery exchange/password reset, revoked access and private-file authorization. It uses reserved temporary identities and generated recovery links, not SMTP inbox delivery.
- A fresh administrator setup/recovery link was issued through the backup-first bootstrap and saved only under ignored `artifacts/private/`. Existing administrator credentials/role and buckets were preserved. The account holder must open their own link, choose their password and enroll their own authenticator; the agent does not perform these ownership steps.
- Before sending an actual invitation/recovery email, confirm a controlled recipient. A new employee invitation needs a distinct authorized address; an existing administrator can receive a recovery email. Do not invent a Gmail alias or send test mail to an unapproved address.
- Account holder subsequently authorized the address matching `SUPER_ADMIN_EMAIL` and confirmed localhost:5178 only. Its existing Super Admin identity was unverified, so one setup invitation was reissued using the existing invitation service. The provider accepted the send; identity/role/password were preserved and the request was audited. Inbox receipt, template rendering, link acceptance and personal MFA enrollment still require the account holder's confirmation. Use the newest invitation, not an older generated link.
- Two Active Super Admin employee records currently exist. Neither was created, promoted or disabled by this acceptance test. Review authorized administrator ownership before staging; changing a bootstrap email variable is not an account-transfer procedure.
- A staging origin/project has not been selected or configured. Keep the current localhost setup until the account holder confirms the stable staging URL. Do not push the localhost-oriented repository Auth configuration over staging or alter the live demo implicitly.

SMTP configuration, Auth endpoint integration, provider send acceptance, actual inbox/link acceptance and deployed staging acceptance are separate checks. The first three are now verified; the final two remain pending. No hosted Auth settings, email templates, rate limits or deployment values were changed during this audit.

- Profile & Security contains real Supabase TOTP enrollment, challenge, verification and explained removal. Setup requires the current password; the private QR/key appears only to its owner during setup. Never share it or place it in logs.
- In production/Vercel, Super Admin, Managing Director, Accounts and anyone with `manage_user_access` must verify an authenticator before business API access. Local development is optional unless `ERP_REQUIRE_MFA=true`; anyone who enrolls a verified factor must still verify it locally.
- An authenticated but unverified privileged session receives HTTP 428, including direct API requests. Only own security/bootstrap and restricted recovery flows remain accessible. Verification replaces the current ERP token and revokes other ERP sessions. Password changes preserve the second-factor requirement and revoke existing ERP sessions.
- Verify a replacement factor before removing the last mandatory one. Lost authenticators require a separately authorized provider recovery procedure; there is intentionally no password-only bypass or invented recovery code.
- Same-origin Vercel security headers include CSP, frame blocking, MIME protection, camera/location permission restrictions and no-store rules for ERP/API paths. Private PDF blob previews are permitted. Only Vercel's managed proxy boundary is trusted for client IPs; a different reverse proxy or split API needs reviewed CORS, cookie and CSP settings.
- `npm run check:release` validates routing, headers, mode isolation, tracked credential/artifact hygiene, migration order and dependency lock agreement without hosted credentials. GitHub Actions runs lint, local tests, release checks and a foundation build. It never migrates/deploys or receives hosted secrets automatically.

```powershell
npm run test:security-backend
# Optional real development-project test using reserved disposable Auth identities:
$env:RUN_HOSTED_SECURITY_TESTS="true"
npm run test:security-backend
# Production-bundle browser checks at 1440px and 390px, reserved port 5200:
$env:VITE_BACKEND_MODE="foundation"
$env:VITE_DEMO_MODE="false"
npm run build
$env:RUN_SECURITY_BROWSER_TESTS="true"
npm run test:security-backend
```

No provider configuration, personal account enrollment, hosted environment change or additional service is required for these development checks. Follow the [Supabase MFA guide](https://supabase.com/docs/guides/auth/auth-mfa) for authenticator concepts and account recovery planning. Production still needs verified SMTP, recovery ownership, least-privilege runtime credentials, approved retention and deployed/restore acceptance.

## Dashboard And Operational Settings

- `/backend` opens the SQL-backed Dashboard. Its six-or-fewer KPIs and bounded work queues require Dashboard access plus each source permission/capability. Warehouse payloads omit financial sales fields; Sales Executives retain own/assigned scope. Financial periods are limited to 93 days, ending no later than today.
- Settings > Operational Settings (`/backend/settings/operations`) contains Warehouse, Cost Presets and the Super Admin Client Confirmation Queue. Edits require current versions/reasons and retain audits. Recording a client agreement never automatically enables financial/approval features.
- Main Warehouse is the canonical single-warehouse identity. Contact/BIN suggestions are editable, historical receipts are unchanged, and receiving inherits the fixed name. BIN suggestions do not forbid historical/custom rack names. Receiving retains four-decimal quantities.
- Active cost presets appear when adding an import cost. They suggest name/category/basis, not money, exchange rate or an automatic allocation choice. Existing cost rows and finalized snapshots are unaffected by preset edits/deactivation.
- Dashboard money reuses report facts/journals with decimal strings and a repeatable-read snapshot. Stock/pipeline/follow-up queues are current, not reconstructed at a historical financial end date. See `CALCULATIONS.md`.

```powershell
npm run test:dashboard-backend
$env:RUN_HOSTED_DASHBOARD_TESTS="true"
npm run test:dashboard-backend
# Optional isolated Edge desktop/390px checks, reserved port 5198:
$env:RUN_DASHBOARD_BROWSER_TESTS="true"
npm run test:dashboard-backend
```

No new platform/env setup is required for this increment. Migration 0023 is already applied to hosted development after backup. Tests keep labelled history, restore warehouse values, deactivate test presets and remove reserved Auth identities. Local HTTP tests use independent loopback peers to exercise unchanged login limits without affecting ordinary developer sign-ins. No remote provider settings or deployment values were changed.

## Operating Finance Increment

- `/backend/accounts` uses persistent expense categories, TA/DA/employee snapshots, supplier obligations/payments, cash/bank journals and restricted financial-position sources.
- Expense and supplier-payment posting each writes the business record, account outflow, audit event and retry key in one transaction. They never add import-cost rows or change finalized landed cost.
- Expense receipts upload directly to private Storage before posting. The API verifies file bytes and links the completed, unused upload by document ID in the posting transaction. It accepts no arbitrary URL or inline file payload. Only authorized Accounts readers can open linked evidence; the employee receiving TA/DA does not automatically gain financial-file access.
- Posted records cannot be edited/deleted. Explained reversals preserve originals and append exact compensating cash entries where applicable. Manual vouchers cannot bypass collection/expense/supplier source workflows.
- Supplier payments may precede obligations: a negative net supplier balance is displayed separately as an advance. Creating an obligation or a financial-position source does not move cash. Position sources require `view_financial_position` plus Accounts permission; this is not full double-entry accounting.
- Cash posting currently enforces chronological account dates and no negative balance. Opening balances, historical/backdated posting and Balance Sheet reconciliation still require implementation/acceptance before launch.

Run `npm run test:finance-backend` for local contracts. Set `RUN_HOSTED_FINANCE_TESTS=true` for hosted development integration. Add `RUN_BACKEND_BROWSER_TESTS=true` and an unused `APP_URL`, for example `http://localhost:5191`, for real-login desktop/390px walkthroughs. The test retains clearly labelled financial history and attached receipt objects, deactivates its masters and removes its temporary Auth identities.

## Company Stationery And Transaction Printing

- Open Settings > Company Stationery (`/backend/settings/print`). Settings readers can review it; only Settings editors can save. Updates require the current version and append an audit record containing the before/after configuration.
- Migrations 0014-0015 add private persisted stationery and install the existing client-supplied MIPRO/LED artwork configuration as reference data only. They do not import mock transactions. These are print identities for the same current company, not separate-company accounting.
- Sales quotation/order/challan/invoice/receipt, Accounts debit/credit vouchers and finalized import-cost previews load one authorized saved record from `/api/print/records/:type/:id`. Print permission alone never grants source-module or another salesperson's record access. Warehouse challans omit pricing; warehouse financial documents are denied.
- Both modes remain on the dedicated preview page. BDT totals preserve two decimals and quantities preserve four. Order totals sum the saved rounded lines, not binary floating-point products. Reversed receipts remain visibly reversed.
- Linked invoice/order/challan references use business document numbers, not internal database IDs. A reversed voucher identifies its compensating voucher without modifying the original entry.
- Long documents flow through measured A4 content areas, with repeated product-table headings, page numbers and the same artwork on continuation pages. White fills are transparent; dark headings use translucent grey. Application navigation and notifications never print.
- A4 safe areas are bounded to protect the supplied artwork. Only the two approved local backgrounds and company logo are accepted; arbitrary remote/tracking URLs are rejected. Changing company text does not regenerate the words embedded in the supplied letterhead artwork.
- Browser printing still requires A4, no margins, 100% scale and browser headers/footers off. A physical printer or Microsoft PDF driver can impose a non-printable border that the website cannot override.

Run `npm run test:print-backend` for local configuration tests. Set `RUN_HOSTED_PRINT_TESTS=true` for hosted development authorization/persistence checks; add `RUN_BACKEND_BROWSER_TESTS=true` and an unused local `APP_URL` such as `http://localhost:5193` for real-login previews. The test saves the same existing stationery values, increments their version, retains TEST business history and removes its temporary Auth identities. No provider settings or Vercel variables are changed.

With `RUN_BACKEND_BROWSER_TESTS=true`, `npm run check:print-layout` can repeat the layout/PDF checks using a labelled quotation from a previous print test. It posts no new business transactions; it creates/removes temporary Auth identities and saves unchanged stationery values for settings verification.

## Persistent Operational Reports

- Open Reports at `/backend/reports`. The familiar category catalogue links to one settings/results page per report. Sales, Inventory, order workspaces and Accounts link into the same report area; printing stays on a separate preview page.
- 61 implemented SQL read models cover sales/orders/deliveries, customers/collections, imports/suppliers/cost, stock/expiry/movements, expenses/TA-DA/cash-bank, scoped employee activity/performance/targets, field visits, the roster and narrow audits. The catalogue is filtered by Reports access plus the source module/capability. Sales Executives see only authorized own/assigned records; warehouse overrides never expose financial sales fields.
- `GET /api/reports/catalogue` describes authorized availability. `GET /api/reports/:id` accepts `from`, `to`, optional stable-ID filters, grouping where supported, page and pageSize. Results include typed columns, decimal-string cells, all-filtered-row totals, bounded filter choices and an explicit accounting/date basis.
- `/api/reports/:id/print` requires Print access and returns all matching rows up to 1,000. `/api/reports/:id/export` requires Reports export, returns CSV up to 10,000 rows and records an audit event. Larger requests fail with a narrowing message; they never silently export only the first page. Screens paginate at 50 rows (API maximum 100); periods are limited to ten years ending no later than today.
- Screen, CSV and print use the same server query/filter rules. Repeatable-read transactions keep each generation consistent, but a later regeneration can reflect newly posted business events. CSV quotes fields and guards formula-like text, following [OWASP CSV Injection guidance](https://community.owasp.org/attacks/CSV_Injection); spreadsheet applications and downstream reimports still need appropriate handling.
- Reports reconstruct historical balances from dated journals. Cancellations/reversals do not erase the original reporting period. Master names/status remain current; import registers explicitly identify their current-commercial basis. See `CALCULATIONS.md` for formulas.
- Balance Sheet is unavailable until opening balances and position reconciliation are approved. Employee activity, lead funnel, follow-up, performance, targets and field check-ins use persisted sources. Recorded location is evidence-assisted, not proof of attendance. They never fall back to prototype fixtures or synthetic balancing values.

Run `npm run test:reports-backend` for local contracts. Set `RUN_HOSTED_REPORT_TESTS=true` for hosted development catalogue/filter/reconciliation tests. Add `RUN_BACKEND_BROWSER_TESTS=true` to exercise real-login desktop/390px rep;pppport settings, CSV and both letterhead modes on the reserved test port 5195. Tests retain labelled business history, deactivate their masters and remove only temporary reserved Auth identities. The historical fixture dates only its own newly created, unposted TEST order; it does not relax the normal API conversion-date policy. No additional environment variables, Docker, provider settings or deployment are needed for this increment.

## Employees And Marketing Increment

- `/backend/employees` uses the existing authenticated employee table, not a parallel HR database. Directory search/status/pagination, profile photos, invitations and access editing use real APIs. Pending invitations cannot be activated without verified acceptance. Access and reporting-assignment changes revoke affected sessions.
- Super Admin assigns Reports To. Sales Managers see their explicit recursive reporting team; Sales Executives submit and read their own work. Read-only MD/company views, private drafts and document access are independently checked server-side. A capability alone cannot bypass module view permissions.
- Sales & Marketing contains daily activities, canonical product-linked leads, follow-ups, daily/monthly plans and monthly targets. Activity identity comes from the login. Submitted content is immutable; explained voids retain the original. Evidence bytes upload directly to private Storage and only document IDs enter the business request.
- A lead converts once into an assigned customer, which enters the existing quotation/order workflow. Follow-up completion can schedule its successor atomically. Submitted plans require authorized approval (Super Admin may self-review); approved plans cannot be rewritten. Target/rule revisions retain optimistic versions and before/after audits.
- Reports contains activity timelines, funnel, follow-ups, performance and target comparisons, using the same scoped records. Only actual ERP commercial events score; manual notes never create quotations, orders, payments or GPS verification. All printing remains in the dedicated Reports preview with both letterhead modes. See `CALCULATIONS.md` for attribution and date rules.
- Field check-ins now persist separately from manual notes; no verified-visit points are awarded. Full HR/payroll is outside this increment.

Run `npm run test:workforce-backend` for local contracts; set `RUN_HOSTED_WORKFORCE_TESTS=true` for development persistence/ownership/evidence/approval checks. Add `RUN_BACKEND_BROWSER_TESTS=true` for isolated real-login desktop/390px checks on port 5196. These retain labelled DEV TEST business history, deactivate their test employees/masters and remove only reserved temporary Auth identities. No Docker, new provider settings, environment changes or deployment are required to develop this increment.

## Field Visit Check-in (Update 12)

- Sales & Marketing > Marketing > **My Field Day / Visits**: own assigned customer/lead, purpose, optional compressed camera/file photo, fresh browser location, explicit exceptions, save and complete with an optional follow-up. Employees > Team Activity contains the same scoped history/review UI, not a second store.
- Attempts expire after ten minutes. Upload bytes go directly to private Storage before requesting fresh location. Server receipt time, logged-in employee, policy snapshot, original site version and independent review remain authoritative. Failed-response retries retain the exact capture and idempotency key.
- Only the author creates/completes their visit. Existing Marketing TEAM/ALL scopes control history/photos; Marketing approval permits independent review, including MD without edit access. Authors cannot self-review. Original evidence and timeline events cannot be edited/deleted; void requires a reason.
- An authorized reviewer can confirm a customer site from an independent source in the visit detail. New site versions never alter old comparisons. **Show Map** loads OSM tiles only on demand, disclosing the approximate area/viewer IP to that provider; no employee names/photos are sent. There is no live tracking, travel path, attendance conclusion or automatic visit scoring.
- Reports > Employee & Marketing > **Field Visit Report** reuses `visit-verification`. Period, employee/team, customer, lead, location quality, review and lifecycle filters use one scoped SQL read model for screen/CSV/print. Six readable screen/A4 columns preserve nine detailed CSV fields; private photo URLs and exact coordinates are excluded.
- Super Admin opens **Visit policy** (gear in Field Day) to record approved thresholds/privacy reference. Production submission stays blocked while `privacyApproved=false`. Approval must cover employee notice, hospital restrictions, correction rights, retention/backup procedures and actual device tests; no provider setting was changed automatically. Retention days are snapshotted policy, not an installed scheduler.

Development checks (no Docker or extra host):

```powershell
npm run check:visits
npm run test:visits-backend
$env:RUN_HOSTED_VISIT_TESTS="true"
npm run test:visits-backend
# Optional isolated Edge desktop/390px walkthrough, port 5197:
$env:RUN_VISIT_BROWSER_TESTS="true"
npm run test:visits-backend
```

Tests retain labelled DEV TEST records/evidence and deactivate temporary employees; only their reserved Auth identities are removed. Actual Android Chrome/iPhone Safari under HTTPS, deployed acceptance and file/database restore remain required before production. Optional second GPS/photo checkout and stable daily-plan contact links remain P1.

`npm run backend:visit-cleanup` previews at most 50 abandoned, unlinked visit uploads per run; `npm run backend:visit-cleanup -- --apply` removes only those expired beyond the Storage-token safety window, retains metadata and audits the change. It never removes linked evidence or other document purposes. Review/schedule it in an approved worker; linked-photo retention, legal holds and backup expiry still need an agreed operational policy. Supabase signed upload tokens last two hours independently of the app's shorter attempt window ([official reference](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl)).

### Database Driver

Runtime and migrations now use Drizzle's `node-postgres` adapter (`pg`), with one connection per warm instance, bounded connection/query timeouts, and certificate-verified TLS. Supabase's public root CA is bundled in `database/supabase-ca.ts`; it is not a secret and needs no dashboard/environment update. It must be reviewed/replaced before expiry or provider rotation.

This replaces `postgres.js`, whose pipelined concurrent screen requests reproduced a hang against the shared transaction pooler. Supabase documents that limitation in its [Postgres.js guide](https://supabase.com/docs/guides/database/postgres-js). No connection URL or hosted setting was changed to work around it. SQL transactions, row locks and idempotency remain authoritative across separate API instances.

## Current Implementation Status

Implemented and applied to the development project:

- Versioned Drizzle migrations for the private employee/access, session, audit, upload-metadata and rate-limit tables. Destination backups are captured before migration/bootstrap. Re-running migrations was verified without resetting records.
- Real Supabase password authentication; verified email/invite recovery; HttpOnly, SameSite refresh cookies; token hashes and revocation in PostgreSQL; current-password verification for password changes. Recovery-only sessions cannot access ordinary ERP endpoints.
- Persisted employee roles/capabilities/overrides, optimistic access versions, delegated-authority checks, self-edit protection, session revocation after access changes, and append-only audit enforcement.
- Pending employee invitation reservations and retry endpoints. SMTP delivery remains a separate acceptance item; no employee/demo passwords are seeded.
- Private employee document/profile-photo, import-document and expense-receipt authorization, direct Storage upload, signature/type/size verification, protected completion and short-lived read URLs. Remaining business-document parent types will follow their domain migrations.
- The configured development Super Admin identity and employee mapping were provisioned without a default password or automatic email confirmation. Its expiring setup link is held only under ignored `artifacts/private/`; no invitation email was sent by bootstrap.
- Private `erp-documents` and public `website-media` buckets were created with MIME/size restrictions. No unrestricted browser write policy was added. Business tables deny `anon`/`authenticated` access and have RLS enabled.
- Hosted Auth now disables public signup, keeps email login enabled, requires 12-character new passwords, and permits exact localhost recovery URLs on ports 5178 and 5173. Existing unrelated hosted configuration was preserved; its pre-change copy is under ignored `artifacts/hosted-config/`.

Existing prototype records and source fixtures were not overwritten, imported, reset or deployed. The new ERP namespace was empty before the first migration. Runtime-only prototype records still require an identified source/export before business-data cutover.

### Run The Isolated Foundation

```powershell
npm run dev:backend
```

This starts the persistent API on 4178 and the web workspace at `http://localhost:5178/login`. It sets foundation/demo-isolation flags for that process only, without rewriting `.env`. Use `/backend` for status, Settings for masters, Imports to create/cost/receive, Inventory for stock, Sales for quote-to-collection and Expenses & Accounts for operating finance. Existing `/app/*` routes redirect to this staging workspace in foundation mode. Unmigrated workflows remain unavailable rather than silently using mock arrays with real identities.

The helper's `/api/health` endpoint returns `mode=foundation` and `database=connected` when available. Background-server logs, where used, are under ignored `artifacts/backend/dev-server*.log`. Administrator setup links are expiring credentials under ignored `artifacts/private/`; do not commit/share them. Request a fresh link with the explicit bootstrap command if one expires. Restart an older local helper to load new API code.

`npm run dev` remains the existing prototype. Do not switch the public demo or production to foundation mode yet. For an eventual deployment both `ERP_BACKEND_MODE` and `VITE_BACKEND_MODE` must agree, demo flags must be false, and `APP_URL`/Auth redirect URLs must use that deployment's actual HTTPS origin.

### Database And Administrator Commands

```powershell
npm run db:generate
npm run db:backup
npm run db:migrate -- --apply
npm run backend:bootstrap -- --apply
npm run test:backend
```

The default backend test command is local/unit-only and skips hosted mutations. To run the development hosted integration test, set `RUN_HOSTED_BACKEND_TESTS=true` in the test process only. It creates temporary `backend-*-UUID@example.invalid` identities/files, removes them afterward and retains Inactive employee/audit rows. `npm run backend:cleanup-tests -- --apply` removes only reserved temporary test identities after an interrupted run.

The minimal hosted-development Auth settings are versioned in `supabase/config.toml`. Review with `npx supabase config diff --project-ref YOUR_DEVELOPMENT_PROJECT_REF`, then explicitly push the reviewed changes if necessary. Do not push this localhost configuration to production. Keep `[auth.email].enable_signup=true` to retain email-provider login and `[auth].enable_signup=false` to disable public signup; the tested CLI maps these to different provider/global settings. This configuration does not require Docker.

To issue a fresh administrator link, run bootstrap with `--apply --issue-link` and `APP_URL=http://localhost:5178` supplied in that process. The new link is written to a timestamped private artifact, not printed or emailed. Open it only while the isolated foundation server is running. It expires; issuing a link does not change roles or a pre-existing administrator password.

### First Milestone Versus Remaining Work

The original 32 unit tests and mock API integration scenarios remain regression checks. The expanded hosted foundation suite passed all five tests, including verified recovery/password reset, login/refresh, restart persistence, access revocation, private signed upload/read and audit tamper rejection. Real-backend desktop/390px browser login/profile-save/reload/logout checks also passed, with screenshots under `artifacts/backend/`. That final hosted run used a process-only public-DNS resolver because the system resolver was intermittently failing; no runtime workaround or OS change was installed. Authenticator enforcement has its own real-provider suite; actual invitation email delivery still needs acceptance.

During later testing the Windows DNS resolver intermittently timed out resolving the Supabase pooler, while a direct public-DNS query resolved it. No database URL was pinned to an IP, OS DNS was not changed, and no runtime DNS workaround was installed. Treat these connection failures separately from application assertions; do not retry financial writes blindly. Provider calls now have bounded request timeouts.

Remaining waves: approved openings/historical finance, stock returns/adjustments, controlled legacy-data preservation, field-device/privacy/retention acceptance, robust invitation delivery, least-privilege credentials/operational monitoring, deployment/backup restore and client acceptance. This is a staged backend implementation, not a production-ready replacement for the entire ERP. Dynamic website management and AI are deferred by scope.

## What To Set Up Now

Only a development environment is needed to start. Do not connect this migration to live company data.

| Item                 | Your setup / information needed now                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase             | Existing `mipro-erp-dev` is accessible in Mumbai (`ap-south-1`). Use it for development only. |
| Database connections | Copy the transaction-pooler URL and a direct or session-pooler URL from Connect. Include the database password in the local connection strings.       |
| Supabase API keys    | Obtain the publishable key (`sb_publishable_...`) and a server-only secret key (`sb_secret_...`).                                                 |
| First Super Admin    | Provide name and a real email address. A personal email is fine during development.                                                                   |
| Data status          | Confirmed: preserve existing records. Export and reconcile before migration; do not reset or overwrite. |
| URLs                 | Confirm the local URL (normally `http://localhost:5173`) and a stable development deployment URL when available.                                    |

Put credentials in the Git-ignored local `.env`, not in chat or committed files. No account password, JWT signing secret, or Supabase management access token is required for ordinary application/database integration.

Vercel project/team access is needed when deploying staging, not before local coding. Existing authenticated CLI access can be used. Custom SMTP, production projects, company domain and production opening balances can follow before their respective acceptance tests and launch.

Do not manually create ERP tables or seed employee passwords. Repository migrations, bootstrap and seed commands will do that.

## Local Tools And Commands

Hosted Supabase is the selected workflow. Docker is not required and will not be used for this setup.

Checked on 23 October 2026: Node.js `v24.12.0`, npm, Git, Vercel CLI and the project-local Supabase CLI are available. Vercel CLI authentication and Supabase access to the configured development project were verified. No deployment or remote schema change was performed.

### Recommended: Hosted Supabase With Local Application

No local Supabase server, Docker engine or Supabase CLI is required for this approach. The application runs locally and connects to the development Supabase project over the internet.

From the repository root in PowerShell:

```powershell
npm ci
npm run dev
```

The current scripts start Vite on `http://localhost:5173` and Express on port `4174`; Vite proxies `/api` to Express. Leave `VITE_API_BASE_URL` blank. These scripts currently start the existing prototype, not an implemented production backend. With demo mode disabled, demo sign-in can be unavailable until real authentication is wired in.

Runtime packages (`@supabase/supabase-js`, `drizzle-orm`, `pg`) and migration tooling (`drizzle-kit`) are installed. Use the implemented schema/migration/bootstrap commands listed above rather than manually creating ERP tables.

Dependency ranges no longer use unrestricted `latest` tags. Updates stay within their selected major versions; TypeScript stays on 6.0 and Node types match the Node 24 runtime. A scoped override pins `@esbuild-kit/core-utils`'s esbuild dependency to `0.25.12` to address the advisory inherited through Drizzle Kit. Verify this override when upgrading migration tooling.

Run the reusable hosted-service check from the repository root:

```powershell
npm run check:backend
```

It reads the ignored `.env`, checks CLI project access, Auth settings/signing keys, administrator-key access, Storage bucket configuration and TLS database connectivity through both configured URLs. SQL runs in read-only transactions. It does not create users, send emails, create buckets, apply migrations or change settings. Results never print credentials or employee identities. A successful check is infrastructure readiness, not proof that the ERP's real authentication/backend is implemented.

If PowerShell blocks `npm.ps1` or `npx.ps1`, use `npm.cmd` / `npx.cmd` instead; changing execution policy is unnecessary. This agent may also require filesystem approval to access CLI credential stores; that is not a missing dependency.

### Vercel CLI: Already Installed

Run these interactively only when staging setup is needed:

```powershell
vercel --version
vercel login
vercel whoami
vercel link
```

Skip login if already authenticated. In `vercel link`, select the intended existing project/team, not a new project accidentally. Confirm whether it is the public demo or a separate backend staging project before deploying. Keep the generated `.vercel/` directory Git-ignored; do not commit downloaded environment files.

No deployment is required to begin local backend development. Vercel environment variables must be configured separately for the intended Development/Preview/Production environment; changing local `.env` does not update Vercel. Never give a demo deployment production credentials.

For optional Vercel-specific local testing, `vercel pull --environment=development` retrieves project settings and environment values for `vercel dev`. Ordinary `npm run dev` does not require either command. Do not run `vercel env pull .env` over the populated local file: it can overwrite local credentials. Also check for an old `.env.local`, which Vite prioritizes over `.env`.

### Supabase CLI: Installed For Hosted Project Management

The project-local CLI is installed and logged in. For a fresh workstation only, installation/login would be:

```powershell
npm install --save-dev --save-exact supabase
npx supabase --version
npx supabase login
```

CLI login is a separate account authorization, not the application secret key; complete its browser/token prompt locally without sharing tokens in chat. These commands manage hosted resources without Docker. Drizzle migrations will remain the single owner of ERP table changes; do not also apply parallel Supabase SQL migrations for the same tables.

Do not run `supabase start`, `db reset` or local-stack commands for this workflow. `supabase init` / `link` are not prerequisites for the selected direct database + Drizzle approach. If a later hosted CLI operation needs a linked project, link only the confirmed development project at that point.

### Verified Hosted Readiness And Outstanding Items

The read-only check passed for the configured `mipro-erp-dev` project in Mumbai (`ap-south-1`): project status healthy, publishable-key Auth access, published JWKS, secret-key administrator access, Storage API, transaction pooler on `6543`, and migration/session pooler on `5432`.

Initial warnings and their current status:

- Public signup was initially enabled; now disabled. Email/password login remains enabled.
- `erp-documents` (private) and `website-media` (public) were created with restricted types/sizes by foundation bootstrap.
- `.env` contains a plaintext password comment. Remove it. Credential rotation remains pending; the account holder explicitly authorized development work with the current development credentials. Rotation is still required before production use.
- Account holder confirmed existing records must be preserved. No current fixture was copied into Supabase.
- Login/reset/MFA, private upload authorization, private schema/RLS and core business migrations are implemented and tested. SMTP acceptance, approved openings/stock corrections, operational hardening and production deployment remain outstanding; see the progress checklist.

No Docker, additional backend host or further account installation is needed to start foundation work. CLI access does not remove account-holder responsibilities for billing, recovery links, SMTP/DNS and client data approval.

### Package And Baseline Verification

After dependency updates on 23 October 2026:

- `npm test`: the original 32 unit tests and four new foundation unit tests pass; hosted mutation testing is skipped unless explicitly enabled.
- `npm run test:flows`: existing mock API integration scenarios pass across imports, costing, FIFO, sales, accounts, reports, access control, marketing and public content.
- `npm run lint`: passes.
- `npm run build`: frontend production build and NodeNext API type checking pass.
- Historical milestone audit: zero reported vulnerabilities at that time. The 1 November production-only audit now reports **8 moderate, zero high/critical advisories**, through the ExcelJS dependency chain. Remediation/risk review remains open; do not run an automatic forced downgrade. Neither result is a production security certificate.
- `npm ls --depth=0` and Drizzle Kit version checks pass.
- All five browser suites pass on isolated mock servers: general smoke, linked sales lifecycle, employee-report/search/printing, public website, and website content management. Desktop/mobile screenshots are in ignored `artifacts/`. The website-content suite now accepts the same test-server environment overrides as the other suites.

These tests establish the prototype baseline. The current foundation status above separately records the additive hosted migrations, administrator/bucket provisioning and real-backend tests; it does not claim that the remaining business workflows are persistent.

### Credential And Launch Checks

- Rotate the database password and Supabase secret key exposed in chat; update local values without reposting them. Remove any plaintext password comment.
- Both development database URIs have passed connectivity checks. After rotation or when provisioning production, obtain the correct URIs from Dashboard > Connect. Encode reserved password characters inside the URI (for example, `#` becomes `%23`); quotes alone do not encode them. Use plain `#` comments, never Markdown `*#` lines or Markdown links in `.env`.
- Use the confirmed development project without treating existing records as disposable. Preserve records under the migration procedure below; retest connectivity after credential rotation.
- Auth email/password, invitation-only signup and exact local recovery URLs are configured. Add exact staging/production URLs separately before those deployments.
- Use a real receiving address for the first administrator. Custom SMTP is required before complete employee invitation/reset tests; company production ownership, DNS and launch data can follow later.
- Keep demo flags false for the real-backend environment. This is a security setting, not an authentication implementation; use a separate controlled mock environment if the demo must remain usable during migration.

## Confirmed Data Preservation Requirement

The account holder requires existing records to be preserved. Before migration, identify the authoritative running deployment/local instance, any exported files, and any existing Supabase records. Repository fixtures do not contain changes made only in a running in-memory API, and browser preferences/session storage are not a complete business-data backup. In-memory changes may already be unavailable after a restart or serverless instance replacement; do not promise recovery without a captured source.

1. Identify the source instances and arrange a quiet export window before a redeploy or restart where possible.
2. Capture authorized exports of accessible business records, relationships, document contents and settings to protected, Git-ignored storage. Back up any existing destination records before changing them. Do not migrate mock passwords or reusable demo tokens.
3. Reconcile counts, IDs, linked documents, stock quantities, receivables/payables and cash/bank balances; record any unavailable source data explicitly.
4. Implement an idempotent migration into the development database, preserving source IDs or an explicit mapping and retaining original exports. Do not use destructive reset/truncate commands or blindly overwrite destination rows.
5. Verify totals and relationships, obtain acceptance and retain a rollback copy before switching the application to persisted data. Link employees to real Auth identities through controlled provisioning.

The account holder explicitly authorized development work with the current development credentials while rotation is pending. Do not reuse them for production. Source location and export availability for runtime prototype records still need confirmation before business-data cutover.

## Selected Architecture

Keep one repository and the existing React/Vite + TypeScript/Express stack.

```text
Browser: React/Vite on Vercel
  -> same-origin /api/auth/* -> Supabase Auth and revocable ERP sessions
  -> same-origin /api/* for ERP operations
       -> Express verifies user identity and persisted access rules
       -> Drizzle + Supabase PostgreSQL for business transactions
       -> Supabase Storage for authorized upload/read instructions

Browser file bytes -> Supabase Storage directly
```

Vercel already hosts the HTTP backend through `api/index.ts`. No separate backend host or second repository is needed initially. Supabase supplies persistent database, authentication and storage services.

Keep existing frontend DTOs, React Query services, routes and print flows. The current domain modules are `server/foundation/`, `server/operations/`, `server/trading/`, `server/finance/` and `server/printing/`, with shared schema/migrations under `database/`. Continue that feature-based structure; a wholesale move into `apps/*` and packages is optional later.

Use Drizzle ORM + node-postgres (`pg`), Zod, Decimal.js and PostgreSQL `numeric` columns. Choose precision per field; do not round authoritative unit cost to two decimals merely because BDT document totals use two decimals.

## Development Environment Variables

These variables configure the implemented opt-in foundation. The legacy mock business workflows do not become persistent merely by setting them.

```dotenv
# Server only: development project
DATABASE_URL=<transaction-pooler connection string>
DATABASE_MIGRATION_URL=<direct or session-pooler connection string>
SUPABASE_URL=<development project URL>
SUPABASE_PUBLISHABLE_KEY=<sb_publishable_...>
SUPABASE_SECRET_KEY=<sb_secret_...>

# Public browser authentication configuration
VITE_SUPABASE_URL=<same development project URL>
VITE_SUPABASE_PUBLISHABLE_KEY=<same publishable key>

# Same-origin web/API deployment
VITE_API_BASE_URL=

# Real-backend environments must not expose demo login
VITE_DEMO_MODE=false
DEMO_MODE=false
```

Use `.env` for local setup: the current Express entry loads that file, whereas the earlier `.env.local` recommendation did not match its loader. Keep `.env.example` free of real credentials. Never put database passwords or secret keys in `VITE_*` variables.

Use the transaction pooler for runtime requests with `node-postgres`, unnamed parameterized queries and a small application connection pool. Do not enable pipelining or named prepared statements. Use the separate migration connection for controlled migration commands; do not run schema migrations on every function request. Choose the session pooler for migrations when direct IPv6 connectivity is unavailable.

## Supabase Dashboard Setup

1. Create the development project and record its region. Preserve database credentials locally.
2. In Authentication, enable email/password and disable open sign-up for employees.
3. Set the development Site URL and allow only the local/development callback and reset URLs implemented by the app. Configure production URLs in its separate project later.
4. Create `erp-documents` as private and `website-media` as public. The implementation can alternatively create these with an idempotent setup command.
5. Configure bucket MIME/size restrictions and access policies. Do not add an unrestricted browser write policy.
6. Keep business tables in a private schema where practical; restrict grants and apply RLS wherever tables are exposed through Supabase's Data API. The browser uses the Express API for protected ERP data.

A privileged SQL connection or Supabase secret key can bypass RLS. Every business API operation must independently enforce identity, active employee status, role overrides, capabilities and record scope.

## Authentication And Registration Scope

The implemented backend includes login, logout, session refresh, invitation acceptance/account activation, password recovery/reset, profile updates, persisted role/access management and real TOTP MFA enrollment/challenge/enforcement. See Authenticator And Release Security above for mandatory production roles and recovery limitations.

Registration for this internal ERP is controlled:

- A one-time server-side bootstrap provisions the first Super Admin and links the Auth UUID to the employee record.
- Super Admin or an authorized employee manager invites permitted employees.
- Employees accept the invitation and set their own passwords.
- Public visitors cannot register themselves as employees or choose an administrator role.
- Supabase verifies identity; the business database remains authoritative for roles, capabilities and SELF/TEAM/ALL access.
- Express verifies access tokens and ignores client-supplied `x-user-id`/`x-role` as trusted identity.
- Role changes, inactive accounts, expired tokens and unauthorized direct URLs must be tested.

Do not copy demo accounts or passwords into production.

## Personal Email And SMTP

A personal email may be used for the developer's Supabase/Vercel account and the first development ERP administrator. Move production ownership and recovery contacts to company-controlled accounts before handover.

The recipient/login email and the email sender are different things. Using Gmail to log in does not configure Gmail as the application's sending service.

Supabase's default mail service is restricted to project-team recipients and limited testing. It is not sufficient for testing invitations to arbitrary employees or for production.

Before full invitation/reset acceptance tests:

1. Set up a transactional SMTP provider such as Resend or the company's existing provider.
2. Verify a sender domain through its DNS records.
3. Configure SMTP host, port, username, password, sender address and sender name in Supabase Authentication.
4. Test invitation and password-reset delivery, redirect handling, expiration and link reuse.

SMTP credentials configured in Supabase do not also need to be supplied to Express unless separate application notification emails use that provider. Company domain/DNS and SMTP can wait while database and authentication foundations are built.

## File Upload And Download Flow

File bytes must not pass through the Express/Vercel JSON API as base64.

1. The browser asks the authenticated API for an upload authorization, stating document purpose, parent record, filename, MIME type and size.
2. The API checks access, assigns an object path and records an upload intent. It returns a short-lived signed upload URL/token.
3. The browser uploads the bytes directly to Supabase Storage.
4. The browser submits the upload identifier/object path and metadata to the API.
5. The API verifies that the object belongs to that authorized upload, exists, and satisfies the restrictions before attaching it to the business record.
6. When opened, the API checks permission again and generates a short-lived signed read URL for private files.

Persist bucket, object path, original filename, MIME type, size, parent record, uploader and timestamps. A checksum may be added for integrity. Do not treat an arbitrary client-supplied URL as proof of a valid upload.

Do not store expiring signed URLs as permanent document addresses. Public website assets may have stable public URLs; confidential ERP files stay private. Profile photos and employee evidence are private by default.

Choose standard versus resumable uploads by file size and reliability needs. Supabase recommends resumable uploads above 6 MB. Add cleanup for abandoned upload intents and unlinked objects. Keep database and file-object recovery plans separate.

## Full Backend Scope And Implementation Order

The target is the full existing ERP backend, delivered in stages rather than only a login/database demo.

| Stage                   | Deliverables                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Foundations          | Database/migrations, real authentication, administrator bootstrap, employee access, durable audit, separate demo mode and dependency health checks                                                |
| 2. Import and inventory | Product/supplier/customer masters, import costs and immutable snapshots, receiving, batches, stock movements and atomic FIFO                                                                      |
| 3. Sales and money      | Quotations, orders and Update 11 lifecycle, deliveries, invoices/approval/reversal, collections and allocations, customer ledger, accounts, expenses, supplier settlements and financial position |
| 4. Remaining modules    | Employee/marketing/field records, settings, website administration/inquiries, documents, SQL-backed reports, CSV and existing print integration                                                   |
| 5. Launch               | Verified opening records, concurrency/retry tests, backup restoration, staging acceptance, production deployment and rollback procedure                                                           |

Fix the previously identified costing issues during Stage 2: foreign-currency manual split reconciliation, authoritative unit-cost precision and stale calculation documentation.

Use database foreign keys and uniqueness constraints, database-backed document numbering, and idempotency keys for posting commands. Lock or conditionally update stock/balance records within transactions to prevent concurrent overselling, duplicate approvals and double payments.

Delivery changes stock only; approved invoices post receivables; posted collections credit receivables and increase the destination account. Finalization, receiving, delivery, invoice approval/reversal, collection, expense and supplier payment each require an all-or-nothing transaction with audit history.

## Vercel, Environments And Hosting

Keep the Vite preset, `npm run build`, output `dist`, and same-origin `/api/*`. Leave `VITE_API_BASE_URL` blank.

For staging deployment, provide the Vercel project/team identifier, authenticated deployment access, stable staging URL and the intended production branch. Do not assume `dev` is production. Keep the public demo on isolated mock data if it must remain available during migration.

Set Preview/Development credentials to the development Supabase project. Before launch create an independent production Supabase project, configure its Auth URLs/storage, and apply reviewed migrations and approved data. Never allow an arbitrary preview branch to receive production database or storage secrets.

Set the API function region near the database. Use a commercial-appropriate Vercel plan for company deployment; Hobby is limited to non-commercial personal use. Select paid production database service and establish backup/restore procedures before live financial use. Extra environments, compute, email and usage may add charges.

A separate persistent Express service is needed only if measurements or requirements warrant independent scaling, long-running processing, private networking, persistent WebSockets or dedicated workers. The same API can move later; authoritative state must always remain in PostgreSQL/object storage.

## Acceptance Before Production

### Supplier Claims Setup

No new service, secret, Docker installation or provider setting is needed locally. Use **Settings > Approval Policies** to independently approve named **Rejections** verifiers/final approvers and their ceiling. A final approver must retain sensitive-cost authority. **Accounts > General Ledger** configures the company chart and independently approved mappings; replacements additionally require the Asset role **Supplier Claims**. Do not activate test mappings or invent company rates/thresholds.

Open **Imports > an import > Supplier Claims**, **Inventory > Supplier Claims**, or **Accounts > Supplier Claims**. Receipt rejection sources become available after every original item unit has been inspected. Defective accepted goods first need a partial hold on their original import batch. Prepare inspection/negotiated resolution, obtain independent approval, then post. Credit changes supplier due, not cash. Replacement receiving is separately approved and creates a new traceable LOT/batch. Only explicitly confirmed zero-additional-cost replacements are currently supported; extra-cost capitalization and formal posted-source correction remain engineering work, not a manual database workaround.

Focused checks: `npm run test:supplier-claims-backend` runs local cases and skips the opt-in hosted suite. With the ignored restricted-runtime environment loaded, `RUN_HOSTED_CLAIM_TESTS=true` runs the rollback-only development integration test; adding `RUN_CLAIM_BROWSER_TESTS=true` exercises desktop/390px UI and official prints. Never run synthetic policy/configuration tests against a company cutover environment.

### Release Checks

- Redeploy/restart preserves all posted records.
- Concurrent stock dispatch cannot oversell; retried posting cannot duplicate money or stock movements.
- Forged headers, expired tokens, inactive employees and cross-owner requests are rejected.
- Private documents and sensitive cost/profit enforce capabilities and scope.
- Import totals, unit costs, FIFO, receipts, invoice approval/reversal and collection ledgers reconcile.
- Reports screen/CSV/print and order lifecycle query the same authoritative records.
- Invitations, recovery, logout and privileged account protection work with the configured provider.
- Restore a database backup and recover stored files in a tested procedure.
- Reconcile client-approved opening stock, receivables, supplier balances and cash/bank before cutover.
- Production demo endpoints are disabled.

The developer can implement and test the code and configure services through available authorized access. Account creation, billing, email-link acceptance, DNS changes without access, and client approval of opening balances still require the account holder or client.

## Official Setup References

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase CLI installation](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase local development and Docker](https://supabase.com/docs/guides/local-development)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase with Drizzle](https://supabase.com/docs/guides/database/drizzle)
- [Supabase Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase storage access](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Supabase upload guidance](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
- [Vercel function limits](https://vercel.com/docs/functions/limitations)
- [Vercel CLI login](https://vercel.com/docs/cli/login)
- [Vercel CLI project setup](https://vercel.com/docs/projects/deploy-from-cli)
- [Vercel environment download behavior](https://vercel.com/docs/cli/pull)
- [Vercel Hobby policy](https://vercel.com/docs/plans/hobby)
