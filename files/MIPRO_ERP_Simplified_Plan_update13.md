# MIPRO ERP — Update 13: Agent-Executable Backend Completion Plan

**Version:** 28 October 2026. **Sequence:** This is the next unimplemented update **13**, after implemented Update 12; any earlier file labelled Update 13/14 was analysis/planning only, not completed work. **Repository:** `AN-SWAPNIL/Medical_Supplier_ERP`. **Verified `dev`:** `931ba5c3e2c96b1b39c46a70a2b1834646c9fcf7` (latest at analysis time).  
**Companion:** `MIPRO_ERP_Backend_Deep_Analysis_Update13.md` (**contains full verbatim original client instruction in Section 14, plus source-to-code traceability Section 13**).  
**Sources:** Client `Stock, Delivery, Due list.xlsx` (5 tabs), submitted payroll/returns/damage/rejections/stock-corrections brief, auto goods-value request, existing backend progress/setup docs.

## Document identity and source-of-truth boundaries

- **This is the 13th implementation update specification, NOT proof of implementation.** No agent should mark Update 13 complete until code, hosted safety checks and acceptance evidence are delivered.
- Source A: The client-supplied Excel workbook `Stock, Delivery, Due list.xlsx`, with the five original tabs; **do not modify or import it directly**.
- Source B: The client's original full written instructions, **reproduced verbatim in companion analysis Section 14**. It explicitly requests Payroll (including Sales Commission and automatic GL), Returns, Damage, Supplier/Customer Rejections, Stock Corrections, central approval, RBAC and audit. Keep the complete text available to the agent, not merely this roadmap.
- Source C: The client's separate exact instruction: **“The goods value should be calculated automatically when we enter the inventory data, including the product details and quantity.”** The calculation cannot establish cost without approved unit cost or source documents; never silently use sales price for inventory cost.
- Scope classification: **client-requested ≠ implemented ≠ approved business policy**. Track them separately. Particularly, Payroll is **explicitly requested**; its release timing must be agreed, not silently treated as an optional omission.
- Latest code status is the previously inspected `dev` SHA `931ba5c3e`; agent must recheck before change. SMTP configured, but inbox acceptance, MFA ownership and staging unverified. Neither this file nor client prose approves hosted changes.

## Mission

### Implementation Review Amendments: 28 October 2026

- The latest user instruction authorizes implementation; do not stop at preflight or repeatedly request general client approval. This does not authorize invented opening balances, silent credential rotation, personal MFA ownership or a live deployment. Current implementation/evidence and remaining engineering are tracked in `UPDATE13_IMPLEMENTATION.md`.
- Treat payroll, commission and genuine automatic GL as part of the requested complete Update 13 engineering scope. Earlier conditional first-release-timing language below is superseded by the latest full-completion instruction; it is not a reason to stop implementation or silently defer those modules. Explicit effective policies, rates and source evidence are still required before financial posting.
- Direct read-only parsing found that this workbook's actual populated ranges and saved totals differ from the figures quoted below and in the companion analysis. Treat those figures as historical candidate analysis, not locked assertions. Validate the unchanged source hash and actual cells dynamically; keep detailed financial/contact profiles private. Formula caches are source evidence, not recomputed truths.

- Begin with Batch 0 read-only evidence and `client_requirement_coverage.md`. A local feature branch is not provider isolation: production still follows `dev` until the owner explicitly approves a hosting/Git change. Do not commit/push/deploy as part of this preflight.
- Keep FIFO with expiry awareness as the previously confirmed dispatch policy. Introducing condition holds does not authorize switching to FEFO or reopening the agreed FIFO decision.
- Restore the approved sidebar/header/mobile drawer through a small frontend-parity task before adding more operational screens. Reuse existing layout components and persistent routes, with AI still deferred; the temporary foundation navigation is an unfinished migration, not a new approved design.
- Current Receive/Dispatch reconciliation must be measured before changing journal semantics. A future Return/Adjustment gap does not prove existing balances are wrong. Extend database journal guards, posting services, reports and dashboard together; preserve existing positive-quantity/value constraints unless a reviewed additive migration replaces them.
- More precisely, migration `0010_posting_race_guards.sql` already counts `Return` positively in the stock guard, while `server/reports/inventory.ts` omits it; both omit an actual adjustment sign/value model. A TypeScript enum or partial trigger rule is not an implemented customer-return workflow. Reconcile both interpretations and test new source types before enabling any posting route.
- Continue local drafts, schema proposals, workbook validation and synthetic tests while client policy/data is pending. Only actual hosted schema changes, financial postings and release gates require their specific approvals. Never treat recording a Client Confirmation Queue entry as posting permission.
- Preserve the supplied workbook unchanged and keep its raw financial/contact data out of Git. Batch 0 may record its hash and workbook structure; detailed row/formula profiling and reconciliation remain Batch 2, not automatically completed by a metadata check.
- Auth metadata can confirm that an email is verified and a sign-in exists; it does not prove human inbox receipt or a verified current MFA session. A provider 404 on an old administrator mapping requires owner review, not automatic deletion or promotion.

Finish the existing Vercel Express + Supabase PostgreSQL/Auth/Storage ERP backend without losing data, weakening security, disrupting the public demo, or inventing accounting policies. Explicitly separate **engineering readiness**, **deployed staging acceptance**, **client-approved opening migration**, and **production cutover**. Preserve implemented imports, FIFO, sales/collections, finance, employees, field visits, dashboards, reports and print.

### Known facts to reconfirm

- 53 private ERP tables, additive migrations through 0023, 61 SQL report models, 88 local tests passing in current docs. Do not blindly recreate them.
- SMTP configured: Gmail host 465. Invitation provider accepted send, but inbox receipt, reset-link acceptance and owner MFA still unverified; two Active Super Admin employee records need authorized owner review.
- Live `medical-supplier-erp.vercel.app` production deployment points to `dev`, latest observed `931ba5c3e` and state READY. **Every dev push may affect live demo**. Do not push until branch tracking and Vercel auto-deploy paths are frozen/isolated.
- Existing imported batches require `receipt_line_id` and `source_import_id`. Current inventory reports predominantly sum Receive/Dispatch. Opening/return/adjustment needs source-aware migrations and read models.
- Workbook contains different due totals and no real batch purchase/landed costs. It is not approved financial input.

## Client requirements-to-work packages (read BEFORE starting Batch 0)

The following is grounded in the client's **actual** wording. The companion analysis carries the complete exact client message; this table is an implementer-facing trace rather than paraphrased replacement.

| Client request (exact/near-exact source terminology) | Work package(s) | Mandatory acceptance boundary |
|---|---|---|
| “The goods value should be calculated automatically when we enter the inventory data, including the product details and quantity.” | Batch 2 validation and Batch 3 opening valuation; Batch 5 UI/reports | Explain `Cost Value` vs `Sales Value` vs `COGS`. Product + quantity without approved unit cost is insufficient for book inventory value. Missing cost blocks posting. |
| Workbook `Stock, Delivery, Due list.xlsx` | Batch 2 workbook profiling, Batch 3 approved openings, Batch 5 reconciliation | Source sheet/row, formula/value, lots, dates, identities, unresolved source differences retained; no direct historical import. |
| Payroll A: employee ID, designation/department, joining date, salary, allowances, banking/MFS, employment status | Payroll phase and privacy roles | Existing employee profile is not sufficient to claim confidential payroll implemented. |
| Payroll B: basic, house rent, medical, transport, commission, attendance bonus, overtime, advance, loans, deductions, net salary | Payroll phase | Verify client's gross-component formula and approved effective rates/periods, lawful deductions, rounding. |
| Payroll C: “HR / Admin → Accounts → Management Approval → Payment → Final Posting”; voucher, slip, automatic General Ledger | Payroll phase + approval shared foundations | Prevent duplicate payroll; no pay without independent approval; real balanced GL or approved accounting integration required for auto-GL claim. |
| Payroll D: Sales Commission invoice or collected value, returns/cancellation recalculation, rate approvals | Payroll/commission phase; dependent on Batch 4 returns | Partial payment, effective policy, refund/clawback and former employee rules tested. |
| “Customer Return Request → Product Inspection → Approval → Stock Update → Credit Note / Refund” | Batch 4 | Original invoice/delivery/batch, multi-condition inventory, customer credit/refund and duplicate suppression. |
| “Damage Report → Inspection → Approval → Stock Adjustment → Accounting Entry” | Batch 4 | Photo/LOT/unit cost; quarantine immediately; loss only after authorized disposition and financial policy. |
| “Goods Received → Quality Inspection → Rejection Report → Approval → Supplier Return / Replacement / Claim” | Batch 4 | Supplier-credit/claim integration; never delete PI/GRN; replacement new receipt. |
| Customer Rejection: quarantine, inspection, return/reversal or claim/repair/replacement/write-off | Batch 4 | Distinguish pre-invoice refusal, invoiced/paid returns, and condition-level movements. |
| “Physical Stock Count → Variance Report → Investigation → Approval → Stock Adjustment → Accounting Entry” | Batch 3 source model + Batch 4 workflow | Preserve counts before and after; 5,000 vs 4,975 sample is illustrative, not actual company inventory. |
| “পাঁচটি মডিউলের জন্য একটি কেন্দ্রীয় Approval System” + no self-approval | Batch 1 common identity/audit security; Batch 4 maker-checker; payroll phase | Role matrix, independent approver, threshold setting, immutable evidence, direct API enforcement. |
| Security/audit: RBAC, who prepared/verified/approved/posted, configurable limits and notifications, domain reports | Batches 1, 4, 5, payroll | Permission-scoped real saved reports, audited state transitions, no mock finance output. |

**Important source nuance:** The client included a formula `Net Salary = Gross Salary + Commission + Bonus + Overtime − Advance Adjustment − Loan Installment − Other Deductions`. The agent must **clarify what Gross Salary already includes** (e.g., basic/house/medical/transport) to prevent counting allowances twice. The source's payroll request does *not* prove an authorized attendance source, a deduction policy, a tax treatment or an established chart of accounts.

**Scope gate:** If the client confirms payroll/commission/auto-GL as **first-release mandatory**, add and fully accept the payroll/ledger phase **before Batch 6 production cutover**; if not, obtain a signed later-phase scope. Never mark the client's full request satisfied while omitting it.

## Safety and change-control rules (mandatory)

1. Start each work batch with repo SHA, git status, working tree diff, current auth/deploy mode and database migration state. Re-read `PRODUCTION_BACKEND_PROGRESS.md` and `BACKEND_SETUP.md`.
2. Work on isolated feature branches that **cannot** update the live demo. Explicit account-holder approval is required for project creation, Vercel settings/production branch/aliases, hosted migrations and secret rotation. Avoid hidden provider changes.
3. Never reset/truncate/reseed production or current dev data, delete Auth users, overwrite existing Storage objects, delete signed business journals, or generate fictitious opening balances.
4. Before *each hosted schema mutation*, verify recent valid DB backup, actual Storage object backup if relevant, migration diff and rollback strategy. Schema rollbacks must be reviewed; prefer forward-fix and tested restore.
5. Hosted tests that post permanent `DEV TEST` records may run only against authorized isolated development data with owner approval; never run opt-in hosted suites against production.
6. Separate runtime DB permissions from migration permissions. Never write secrets/setup tokens/MFA seeds to chat, commits, screenshots, verbose logs or downloaded reports.
7. Keep client-dependent finance/stock policies in clearly disabled states until written approval; an `Operational Settings` decision-record is evidence, not an automatic posting authorization.
8. No Docker, extra backend service, generic CMS, live AI or sweeping UI redesign for this phase unless demonstrably essential and approved. Do not claim financial-position source views constitute a full General Ledger.
9. Do not silently merge ambiguous customers, product LOTs, duplicate due records or old prototype data. Preserve original workbook and source row references.
10. End each batch with implemented files, migrations, security impact, exact tests, evidence, limitations, next gated actions and no-change confirmation for the live demo.

## Batch 0 — Immediate safe audit and demo/staging isolation

**Actions**
- Inspect live Vercel branch tracking, environment-variable *names/targets* without decrypting secrets, aliases, build/runtime checks and linked Git; verify current mock-only live project, `dev` deployment hazard and API/website mode isolation. Recommend a freeze/split: stable demo production branch + dedicated staging branch/project and controlled dev feature branches. Do not change settings without owner approval.
- Choose stable HTTPS staging hostname and Supabase Auth redirect strategy. Foundation runtime requires `ERP_BACKEND_MODE=foundation`, `VITE_BACKEND_MODE=foundation`, `DEMO_MODE=false`, `VITE_DEMO_MODE=false`, `DEMO_DEPLOYMENT=false`, secure `APP_URL`, and same-origin API setup. Never reuse demo public data/auth as staging production identities.
- Review two Active Super Admin employee records with owner; no automatic disable/promote.
- Verify **actual** inbox receipt, latest invitation link, password acceptance and owner-controlled TOTP enrollment through owner-driven steps; run authorized smoke after staging URL is established.
- Verify offsite recoverability for DB plus real Supabase Storage bytes. Plan restore drill in isolated destination. Record RPO/RTO and owner of alerts.
- Make a credential-rotation plan for any previously exposed development keys, with immediate dependent-service update and rollback of config, not shared secrets.

**Acceptance**: stable live-demo deployment mapping documented and protected; project/branch/target isolation approved; explicit owner step for invitation/MFA; backup/restore evidence. **Gate**: no hosted changes without approval.

## Batch 1 — Technical hardening independent of client data

**Actions**
- Durable invitation outbox/retry with persisted status, attempt counters, next-attempt time, provider status, sanitized errors, cooldown, dead-letter/manual review, rate limiting. Manual Pending retry exists; reuse. Never persist raw recovery tokens or MFA secrets. Email is at-least-once delivery; duplicate sends must not create multiple employees or inconsistent state.
- Least-privilege runtime database role scoped to required tables/operations; separate migration role/secret and grant verification. Prove RLS/role checks still work for all seven roles and DDL/private access is unavailable to runtime.
- Query review: `/inventory/batches` and `/inventory/stock` load all rows currently; introduce server filters, bounded paging and explicit summary endpoints. Audit all other unbounded SQL/API queries, CSV/print limits and entity-specific permissions.
- Monitoring: per-environment health/error aggregation, alert channels, email failure counts, job failures, API errors, DB pool/connection, backup/restore evidence. Avoid logging PII/security secrets.
- Retention: explicit policy-verified jobs for abandoned uploads, orphan evidence and approved field photo disposal; dry-run, legal hold, deleted-object audit, Storage/DB consistency. Do not delete linked field-visit history or original accounting evidence.

**Acceptance**: deterministic local and hosted isolated tests for retries, RLS, pagination, 429/5xx, failure alerting, idempotent cleanup and no regression in previously working modules.

## Batch 2 — Read-only client workbook mapping and opening-data staging

**Actions**
- Ingest the original 5-sheet workbook **read only**. Save SHA-256, parser version and row/cell provenance; preserve formula vs displayed/calculated values. Handle sheet-specific header layouts and Excel-date serials.
- `Stock List`: 19 block candidates, two missing opening quantities, suspected duplicate `17L`, cost absent, batch/lot date ambiguity.
- `Monthly Ledger`: September and October different column positions; October totals sales 942,100; paid 523,700; due 407,100; 11,300 gap. Group multi-line orders without assuming blank cells mean independent orders.
- `All Party Account`: candidate due 1,978,990; `Due Lists`: 537,612; never choose automatically. Suggest alias mapping (e.g., `Galib Pharma/Pharmacy`) with explicit operator decisions, no fuzzy auto-merge.
- Create standardized opening templates (stock-by-condition/lot/expiry/cost, invoice-level AR, supplier AP/advance, cash/bank and proof references) and machine-readable exception report.
- Implement draft import staging data model and API: `DRAFT → VALIDATED → PREVIEWED → APPROVED → POSTED → RECONCILED`, with immutable source artifact hash, versioned validation, approver separation and source-scoped idempotency. Preview must show affected sources, quantity/value/due reconciliation and source exceptions. Do not post live data.

**Acceptance**: workbook profile matches source rows and known discrepancies; unknown costs and conflicting due totals are blockers; no DB postings or original file modifications; all sample data is synthetic and labelled.

## Batch 3 — Opening inventory and financial positions, controlled posting

**Architecture proposal** (refine after inspecting Drizzle schema and triggers)
- Add explicit `opening_batches`, `opening_lines` or equivalent approved source, referencing product/batch/warehouse/location/condition, source document, physical count date, expiry, approved high-precision cost and authoritative 2-decimal saved total; **do not** fabricate import/GRN records.
- Preserve existing import/receipt batches via safe nullable-source plus mutually-exclusive constraints, or a source table normalization. Fix global batch-number uniqueness behavior only after inspecting client duplicates and all references.
- Introduce source-aware signed movement model that records both physical-quantity/condition impact and cost impact, for receiving, opening, dispatch, return, quarantine, damage, write-off and adjustment; every report/stock balance/FIFO/as-of query must use exactly consistent semantics. Expiry may be derived dynamically; stock condition is independent and supports partial-batch holds.
- Extend opening `customer_entries` (`Opening Due` exists) through approved AR identity/line records; persist original invoice reference where known. Ensure later collection can allocate exactly once; don't create synthetic approved sales invoices.
- Introduce approved source IDs for supplier opening obligation/advance and account opening cash/bank journals, reusing posting services where safe. Existing cash-account creation can post initial opening; avoid duplicate starting amounts for existing accounts.
- Prefer transaction-controlled atomic posting of each approved schedule, unique source+cutover+line keys, optimistic lock/read consistency and immutable audit. Failed partial/ambiguous submissions must be repairable without delete/reset.
- Never treat partial financial-position accounts as balanced GL; Balance Sheet remains unavailable pending actual financial-source completion/approval.

**Acceptance**: tests for batch values, lot mapping, exact cents, missing cost denial, conflicting source hash, replay, multi-worker race, negative/partial quantities, inventory condition disposition, AR/AP/cash ties to approved schedules, and source-aware as-of reports. Client-source posting remains disabled until approval.

## Batch 4 — Returns, rejection, damage and stock variance

**Shared controls**: small approval state machine; `created_by != final_approver` when policy demands; authenticated inspection evidence; version and reason; signed posted snapshot; no deletion of original financial/stock records.

**4A. Stock counts and adjustments:** count snapshot by product + batch + warehouse + condition; variance; validation of unit cost for discovered surplus; lock version at approval; post append-only adjustment and cost impact; reports reconcile by date.

**4B. Quarantine/damage:** hold partial quantity **before** final loss decision and immediately block dispatch; inspect; disposition to available/repair/claim/damaged/expired/write-off per policy. Physically on-hand vs saleable vs valued stock separately reported. No automatic expense where policy is undecided.

**4C. Supplier rejection:** rejected at receipt remains unavailable; reconcile uncapitalized rejected proportion; claim/credit/replacement tracking against source import/supplier and approved policy. Later defective accepted units go through quarantine. Replacement has new receiving source, not overwrite.

**4D. Customer return:** inspect by original delivery-line/batch/lot, linked invoice/discount/COGS and returned-so-far; support saleable/unsaleable condition, authorized credit note, receivable credit application/refund (including already-paid and partly-paid cases), original delivery or invoice status distinctions; ensure no double return/credit/refund.

**Acceptance**: unit, ledger, concurrency and real-browser tests; identities and role scopes; forward/reverse and as-of reconciliation; cost privacy in payloads/reports; no unchanged original journals deleted.

## Batch 5 — UI/reports + deployed UAT

- Integrate into existing persistent workspace: Opening Data, Physical Counts, Returns, Damage/Rejections, approval inbox, stock condition and valuation reports; link existing `/app` deep links while preserving IDs/filters; unsupported mock routes fail explicitly.
- Adapt reports: current-stock by condition, as-of stock valuation, movements, inventory variances, rejected/claims, approved returns and credit notes, dues, customer/supplier statements, cash account summaries. Exact screen/CSV/print source-query parity.
- Staging redeploy/startup restart persistence; desktop + real Android/iOS field check-in with private photo/GPS privacy consent; seven roles direct API and UI restrictions; PDF/CSV security and totals; resend/MFA; destructive/rollback drills isolated from company data.

**Acceptance**: owners sign an UAT matrix covering 7 roles x representative workflows, role-based cost/PII restrictions, mobile check-ins, email and failover. No unexplained journal mismatch.

## Batch 6 — Client cutover and launch

**Preconditions**
- Signed cutover time; approved physical count, opening cost, customer invoice-level due, supplier AP/advances, bank/cash openings; unresolved workbook differences documented/resolved; customer says which historical documents are authoritative.
- Approved lot/expiry/condition policy, return/rejected/damage/write-off policy, stock approvers, field visit privacy/retention and historical backdating treatment.
- Company-owned production hosting/Auth/backup/billing, rotated credentials, verified access recovery, staging rollback/restore drill, live-demo preserved.

**Runbook**
1. Freeze and independently export historical source plus signed spreadsheet hash.
2. Snapshot/backup database and Storage bytes; record target environment.
3. Confirm zero unexpected differences in staging preview; get business sign-off.
4. Execute authorized production migrations, deploy, perform controlled **once-only** opening postings, run reconciliation queries and immutable audit checks.
5. Conduct smoke tests, financial signoff and support handover; if mismatch, stop and follow approved correction/rollback, never reset or insert fake balancing transactions.

## Client-requested Payroll, Commission and General Ledger — explicit scope and release gate

The client **explicitly requests** payroll/commission and automatic GL posting. This is a genuine client requirement, not an assistant-suggested optional feature. Separate its *implementation phase* from stock cutover for engineering manageability, but require an **explicit client decision about first-release timing**. If it must ship in the first release, implement and accept the payroll/ledger phase before Batch 6; otherwise record signed deferral as a contractual scope decision. Never omit without documenting the decision. Obtain wage components/effective dates, attendance sources and labour/tax handling, leave/overtime policy, advance/loan deduction, commission calculation from invoiced vs *collected* (and return/reversal impacts), payroll period, staff/department confidentiality, approvals, payslips and audit. If automatic GL is required, first specify and implement a genuine balanced double-entry ledger or approved integration, not a misleading extension of the existing limited financial-position source. A field visit check-in must not be assumed to be payroll attendance.

## Ownership / manual boundary

**Agent-led:** code, local tests, additive migrations after approval, workbook parsing, draft templates, backups/restore testing, Vercel staging after approval, browser/RBAC reports.  
**Owner-led:** approve hosting/branch/secret changes, open own SMTP invite, choose password and MFA, authorize sensitive tests, sign off release, coordinate client.  
**Client-led:** physical quantities/costs, real outstanding schedules, cutover, claims/refund/adjustment decisions, payroll scope, GPS/photo privacy policy and business UAT.

## Commands and test evidence (use only with authorized environment)

```bash
npm run lint
npm test
npm run build
npm run check:release
npm run check:backend
npm run test:imports-backend
npm run test:sales-backend
npm run test:finance-backend
npm run test:reports-backend
npm run test:security-backend
npm run test:visits-backend
```

**Important:** hosted tests are opt-in via `RUN_HOSTED_*` and may persist `DEV TEST` business records, so explicitly scope to an isolated development project before use. Check `BACKEND_SETUP.md` for exact flags and port configuration. Additional tests for opening/import/adjustment/returns are required once new code is introduced. Avoid claiming 88/88 after changes without actually rerunning them.

## Requirement coverage and change-request discipline

Before coding, produce a `client_requirement_coverage.md` table covering all rows in the above source map, with status `{existing, partial, missing, blocked-by-client, passed-test}`, code location, exact acceptance test and linked client approval. Do not convert a client request into "phase-later" simply because it is large. If a change is essential to satisfy a stated requirement but causes substantial accounting redesign (e.g., automatic GL), prepare options, migration risk and release impact for the owner and client. Keep payroll payments, employee bank details and attendance private; field check-ins are not a payroll timesheet.

For workbook-derived data, record SHA-256, sheet, row/column, extracted value, cell type/formula if available and mapping-review status. Any listed monthly/party due figures are **candidate**, not signed cutover balances; never invent balancing journals. Automated opening-value calculation is **only** authorized where an approved cost basis exists. For source conflicts, fail closed and request client review.

## Execution format / handoff instruction to coding agent

> You are the MIPRO ERP backend engineer. Re-read the latest GitHub dev HEAD, `PRODUCTION_BACKEND_PROGRESS.md`, `BACKEND_SETUP.md`, the uploaded client workbook, and the companion deep analysis before starting. Work in **small reviewed batches**, never one uncontrolled mega-implementation. First deliver a read-only P0 environment/deployment safety and source schema audit. The current production Vercel alias is built from `dev`; ensure branch isolation **before committing/pushing**. SMTP is already configured: focus on actual invitation acceptance/MFA, not reconfiguring it. Next implement technical hardening and the workbook staging/validation UI, preserving source evidence. Then design proper opening inventory provenance and accurate stock/condition movements; reuse original receipt value/COGS/AR/cash posting invariants. Policy-dependent financial postings must remain disabled until client approval. Track the client-requested payroll/commission/auto-GL module explicitly; confirm whether it is first-release mandatory, and if so implement and accept it **before production cutover**. A real balanced GL or approved integration is necessary for auto-GL claims. For every batch, list proposed changes, affected files, migrations and rollback; run and report exact tests, show redacted logs and reconciliation evidence, and explicitly prove the live demo is unchanged. Never expose secrets or wipe hosted records. Stop at any account-owner or client-approval gate and request only the specific approval needed.

**Definition of Done:** Engineering done ≠ Staging accepted ≠ Client reconciled ≠ Production cutover ≠ Complete contracted client scope. If payroll/full GL is required for the first release, its acceptance is an additional mandatory launch gate. Report each gate separately and list remaining blockers; never report “complete backend” before all contracted first-release gates pass.
