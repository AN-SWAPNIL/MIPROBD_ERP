# MIPRO ERP — Update 13: Deep Backend, Actual Client Requirements & Production Readiness Analysis

> **Update numbering clarification (28 October 2026):** Update 12 is the last implemented update in the prior sequence. The previously prepared *Update 13 client workbook analysis* and *Update 14 roadmap* were planning documents, **not completed implementation updates**. This consolidated work is explicitly the **next implementation specification: Update 13**. No work should be claimed completed merely because it appears in this document.

**Date:** 28 October 2026 (Bangladesh)  
**Repository:** `AN-SWAPNIL/Medical_Supplier_ERP`, `dev` at `931ba5c3e2c96b1b39c46a70a2b1834646c9fcf7`  
**Latest commit:** `smtp and reset link working` (2026-10-28)  
**Client sources:** `Stock, Delivery, Due list.xlsx` (5 sheets), accompanying payroll/returns/damage/rejections/stock-corrections brief, automatic goods value instruction, project meeting minutes.  
**Method:** repository code and docs reviewed through the GitHub connector; workbook inspected read-only with artifact_tool. The Vercel deployment alias metadata was checked. No hosted database writes, deployment edits, migrations, or client-data imports were performed by this analysis.

## 0. Primary client request — source context and interpretation rules

The client submitted **two different kinds of source material**:

1. A five-sheet business workbook, **`Stock, Delivery, Due list.xlsx`** (`Stock List`, `Monthly Ledger`, `Party Ledger`, `All Party Account`, `Due Lists`). This is evidence of the present/manual operating data; it is **not** a reconciled opening journal.
2. A written request explicitly covering **Payroll Management (including Sales Commission and automatic GL posting), Customer Returns, Damaged Goods, Supplier/Customer Rejected Goods, Stock Corrections, centralized approval, security and audit trails**, plus: **“The goods value should be calculated automatically when we enter the inventory data, including the product details and quantity.”**

**Crucial source distinction:** Section 14 contains the **entire unedited substantive client message as supplied**, preserved for the AI agent and future scope review. It is *a client-requested feature specification*, not proof of existing company policy, valid accounting figures, legally approved payroll deductions, or final workflow ownership. The separately submitted goods-value sentence is preserved there too. Section 13 maps each client request to existing code, missing code, business-policy dependencies, and acceptance evidence. The analysis in Sections 1–12 is our technical evaluation, **not a replacement for the original request**.

**Scope rule:** Payroll/commission/full GL is **explicitly requested by the client**, even though it was not part of the earlier completed backend. It is not appropriate to silently drop it or mark it optional. The **release timing, level of implementation, payroll rules and commercial scope** require confirmation. If the client requires it for the *first* go-live, it is a first-release gate and Phase P7 must happen *before* production cutover; otherwise it remains a signed later-phase commitment with a deliberate boundary.

## 1. Executive recommendation

**Move forward now.** Do not wait for client opening-data cleanup to continue engineering. Do not start by building a generic payroll/GL/CMS/AI platform. Treat the next release as **Backend Hardening + Controlled Opening Data + Stock Integrity + Production Acceptance**, split into independent implementation batches, with a separately tracked release-timing and accounting-architecture decision for the **client-requested** payroll module.

SMTP is configured and the provider accepted the test invitation request, but inbox receipt, actual setup-link acceptance, owner MFA, and deployed staging are **not** yet verified. Complete those acceptance checks; do not repeat configuration work already done.

**Three simultaneous tracks:**

1. **Platform:** isolate live demo and create staging; complete invitation reliability, access/security, alerts, backup/restore and acceptance.
2. **Business engine:** implement opening-stock/AR/AP/cash staging, calculated batch valuation, auditable stock corrections and return/rejection workflows using test records and gated policies.
3. **Client sign-off:** obtain authoritative stock counts, purchase/landed costs, dues, supplier liabilities, bank/cash amounts, cutover date and specific return/adjustment/privacy rules.

**Stop conditions:** no real posting of unapproved opening values; no fabricated purchase cost/receivables/invoices/GL entries; no live-demo changes or production deployment without approval.

## 2. What was actually verified in latest `dev`

### 2.1 Recent change

Previous baseline `1c957f5` (25 Oct) → current `931ba5c3e` (28 Oct): a single new commit. `BACKEND_SETUP.md` and `PRODUCTION_BACKEND_PROGRESS.md` now document the Gmail SMTP audit and authenticated setup link test; added website asset manifest/website contract files are source additions, not evidence of an installed persistent editorial CMS. No new numbered database migration beyond **0023** was found.

`BACKEND_SETUP.md` confirms:
- Supabase Gmail SMTP configured on `smtp.gmail.com:465`, sender/username set, 30 emails/hour and 1-minute resend interval; password not displayed.
- Local Auth Site URL still `http://localhost:5178`; permitted localhost reset redirects; invitation-only global signup, email confirmation, 12-character minimum password and TOTP supported.
- Hosted authentication/recovery suite 6/6 passing; an administrator setup invitation was reissued and accepted by the provider.
- **Still not proven:** inbox receipt, human acceptance of newest invitation, personal MFA enrollment, staging origin and deployed tests.
- Two existing **Active Super Admin** records require ownership review; do not deactivate automatically.

### 2.2 Backend completion matrix

| Area | Implemented/tested | Remaining for acceptance |
|---|---|---|
| PostgreSQL, Drizzle, API/Auth | 53 private tables, additive migrations through 0023, role-scoped APIs, real TOTP | Least-privilege runtime role, credential rotation, hosted deploy/restore and monitoring |
| Imports and landed costing | Immutable finalized snapshot, precise allocation, partial receipts, per-batch value, rejected qty nonstock | Financial treatment/claim of rejected imported units; opening stock source |
| Stock and Sales | FIFO batch dispatch, immutable movement cost/COGS, invoices, collection allocation/reversals | Returns, quarantine/damage and approved corrections; historical opening balance migration |
| Accounts | Cash/bank journals, supplier obligations/payments/advances, expenses, limited financial-position sources | Approved opening balances, full reconciliation; no full General Ledger or verified Balance Sheet |
| Reports/UI | 61 authorized read models, CSV/print, dashboard, workforce field visits; `/backend` workspace | New source semantics, condition-level stock, final navigation and deployed seven-role acceptance |
| Email | SMTP and provider invitation send verified | Delivered and accepted real inbox invite, MFA recovery owner, durable retry/outbox |
| Public site | Static brochure, deferred AI/CMS | Dynamic CMS intentionally deferred |

The Vercel alias `medical-supplier-erp.vercel.app` returned **READY** on a production deployment from `dev` at the same SHA. This verifies deployment state/branch, **not** functional demo login or its environment-variable values.

## 3. Client workbook: value, limitations and reconciliation exceptions

Source is a manual working file—not a verified ledger or clean import payload.

| Sheet | What it is | Import decision |
|---|---|---|
| `Stock List` (`A1:G187`) | 19 product/lot blocks; 17 numeric opening stock values, 2 missing; dated outflows | Candidate source for physical count and mapping; **not direct opening posting** |
| `Monthly Ledger` (`A1:M60`) | Sep/Oct transactions, lines, paid/due and salesperson target; different per-month column layout | Candidate source evidence; not deduplicated invoice/challan history |
| `Party Ledger` (`A1:Y51`) | Monthly party sales/paid/due matrix | Reconciliation/control total only |
| `All Party Account` (`A1:AC47`) | Customer rollup and contacts | Customer master suggestions, candidate AR control totals |
| `Due Lists` (`A1:F22`) | Collection-chasing worksheet | Follow-up candidates, not the definitive outstanding-ledger source |

Concrete issues:
- **No approved batch purchase/landed unit costs:** cannot calculate real inventory cost from quantity alone.
- Some LOT numbers look like date stamps; dates mix serial numbers, strings, unusual formatting. One `17L` product appears in two blocks resembling the same lot and different opening quantities. Clarify warehouse/condition or duplicate status.
- `Monthly Ledger` October totals: reported sales **BDT 942,100**; paid **BDT 523,700**; due **BDT 407,100**; paid + due **BDT 930,800**, difference **BDT 11,300**. Do not insert balancing entries automatically.
- `All Party Account` overall sales **BDT 8,890,627**, paid **BDT 6,901,637**, due **BDT 1,978,990** (internally arithmetically consistent); `Due Lists` total **BDT 537,612**. They may cover different periods/definitions. Require client-signed authoritative cutover AR.
- Same customer spelling variants and unexplained differences, e.g. Sonu Pharma `21,000` vs `11,000` due. Repeated blank parent rows in monthly orders and missing unique invoice/challan/receipt identifiers make naive row-level transaction import dangerous.
- The workbook lacks approved supplier payable, supplier advance, cash/bank opening balances, a cutover timestamp and immutable supporting financial documents.

**Recommended migration scope:** client-approved *opening position* for stock, customer receivables, supplier payables/advances and cash/bank at an exact cutover, with original workbook and supporting records archived read-only. Only recreate historical transaction chains if original records are complete and cross-linked. Never independently import the same delivery from Stock List and sales ledger.

## 4. What automatic “goods value” should mean

Three separately labelled quantities:

1. **Inventory Cost Value**: accepted or opening batch on-hand quantity × authenticated approved unit acquisition/landed cost, with currency/rounding rules and preserved authoritative batch total. Cost may require FX/duty/freight allocations for imported goods and client approval for pre-existing stock. Example: 100 pcs × BDT 450 = BDT 45,000.
2. **Delivery/Sales Value**: delivered qty × immutable sales-order unit selling price less discounts. Example 60 pcs × BDT 700 = BDT 42,000. Customer AR arises on approved invoice, **not** merely upon delivery.
3. **COGS and remaining inventory**: same example, 60 units cost BDT 27,000 and remaining 40 units cost BDT 18,000, preserving exact saved batch valuation/cumulative rounding rather than multiplying a rounded displayed rate.

If a client requests *indicative gross sales value of unsold stock*, show it as a non-accounting separate metric; it is not book inventory value. Accounting policy for lower of cost and net realizable value requires finance review (IAS 2: https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/).

**UI recommendation:** separate `Cost Value` and `Sales Value` columns, the former restricted to `view_sensitive_cost`; on opening import `Cost Missing → Review Required → Approval Required`, never automatically substitute selling price or zero. Show product, SKU, unit, manufacturer, LOT/batch, mfg/expiry, condition, warehouse/BIN, source, qty, approved unit cost, authoritative extended cost, line discrepancies.

## 5. Critical technical architecture findings and decisions

### 5.1 Opening-stock source is missing

`database/schema.ts`: `stock_batches.receipt_line_id` and `source_import_id` require Import/GRN. Current `server/operations/inventory.ts` creates accepted batches linked to finalized imports. **Do not fabricate Imports or warehouse receipts** for opening physical stock.

**Design:** append explicit `OpeningStock` transaction/batch provenance through additive migration. Consider nullable import FKs with an XOR constraint to approved opening-line ID, or a common `inventory_source` reference model, after evaluating all existing foreign keys, unique indexes, RLS, SQL reports and triggers. Preserve existing rows and indexes; avoid a premature broad rewrite. Opening lot/date/cost metadata must be signed and immutable after posting. Per-source idempotency and approval batch ID required.

`stock_batches.batch_number_lower_unique` is currently globally unique. Client duplicates need human reconciliation; do not silently drop the unique constraint, but evaluate desired stable lot-versus-internal-batch identity and cross-warehouse behavior before migration.

### 5.2 Inventory report math and stock condition

`server/reports/inventory.ts` as-of inventory amounts currently sum `Receive` and `Dispatch`. Yet `stock_movements` type permits `Return` and `Adjustment`; adding new posting endpoints alone will cause wrong reports and available balances. Introduce a **single authoritative movement-sign/condition valuation model** used by reports, dashboard, stock availability, delivery/COGS and print/CSV; test stock equality at every date and after reversals.

Medical-device inventory requires separate **quantity disposition** (saleable, quarantined, damaged, rejected, expired/unsaleable as applicable) from **accounting cost treatment**. Expiry is time-derived, while quarantine/damage may apply to **part** of a batch. Do not rely on one batch-level status if only 20 of 100 units are damaged. Consider normalized batch-condition balance or status transfer ledger with per-condition quantities/cost, plus immutable condition transfers. Quarantining stock must instantly exclude it from FIFO; moving to damaged condition does **not** by itself require immediate expense/writeoff if policy says inspected/claim pending. Physically present units and saleable units must be reported separately.

`server/operations/inventory.ts` FIFO currently excludes expired/future batches; expand eligibility for hold/quarantine/rejected and other approved restrictions. Clarify FIFO vs FEFO business requirement before changing dispatch order; preserve authorized override+reason/audit.

### 5.3 Opening receivable, supplier and bank/cash structure partially exists

- `customer_entries.type` includes `Opening Due`, and collections can allocate to this type, but an approved bulk onboarding/duplicate-safe opening receivable workflow is pending. Prefer invoice/item references and customer ownership; retain explicit unknown historical invoice provenance rather than inventing invoice rows.
- `supplier_settlements` supports Obligation/Payment. Opening AP/advance needs explicit **source identity** and reviewed policy, not synthetic purchase import. Preserve supplier statement and reversal logic.
- `cash_accounts` creation can create an `Opening Balance` journal, but that does not substitute a reviewed bulk cutover process for already-created accounts. Need explicit validated opening position, authorization, date and reconciliation against statements; no direct balance edits or manual correction to force a tie.
- `financial_position_entries` is limited source evidence, not a complete chart-of-accounts + double-entry General Ledger. Do not label existing financial position views as certified Balance Sheet or implement payroll auto-GL by routing through unrelated expense records.

### 5.4 Returns, damage, rejected stock and physical counts

**Customer Return:** refer to original invoice + delivery line + batch, remaining returnable qty, inspection state, disposition; server-authorized review/approval; post stock condition and approved **credit note** with exact original price/discount allocation and cost reversal/recognition policy; refund or credit allocation only once, prevent over-refund. Delivered-but-not-invoiced rejection is a different path; no phantom invoice credit.

**Damage:** report → hold impacted quantities immediately or reserve from FIFO → inspect → approve → condition transfer/write-off as decided; record source cost, qty, photo/private documents, reason, independent sign-off; do not silently debit an invented GL account.

**Supplier Rejection:** distinguish rejected-at-receipt (not in available inventory) versus later discovered defects. `receiptValue` currently allocates finalized import cost across the original imported quantity and accepted units; rejected units have no accepted stock. The remaining cost may require supplier credit/claim/loss treatment and reconciliation. Do not force rejected units to zero-cost stock or auto-create payable reductions. Returns/replacements must have traceable origin and distinct incoming receiving record.

**Stock Correction:** physically count product+warehouse+batch+condition; as-of snapshot version/time; variance, approval, exact cost impact, append-only adjustment with audit/reversal; concurrency checks to prevent approval posting against a different physical stock position. Separate correction for missing units and discovered unrecognized units; cost source required for additions.

**Approval model:** implement a small shared state/permission abstraction (Draft → Submitted → Inspected → Verified → Approved → Posted / Rejected / Voided), with creator≠final approver where applicable; version tokens, reason, evidence, threshold decisions. Reuse RBAC and audit; do not build an overgeneric visual workflow builder before real use.

## 6. Payroll and commission scope decision

Client's separate brief explicitly asks for employee profile, salary, attendance, commission, advance, loan deduction, payroll approvals, payslip, vouchers and auto General Ledger. Treat this as a **serious client request but unconfirmed first-release scope**; do not dismiss it. It requires policy and privacy decisions and changes the accounting boundary.

**Two defensible options:**
- **Core release:** continue employee master and existing expense payments; payroll not advertised as implemented; obtain explicit client confirmation that payroll is a later phase.
- **Payroll-inclusive contracted release:** after inventory and core accounting stabilization, design pay periods, effective-dated pay components, attendance-source policy, leave/late/overtime, commission basis (approved invoice vs cash collected and reversals), employee advances/loans, deduction caps/tax rules with local qualified adviser, approver separation, accruals/liabilities, payslip privacy, audited postings. Build or integrate an actual balanced GL architecture first if auto-GL is mandatory. Never reclassify all payroll as ordinary `expenses` without liability management.

A field-visit GPS check-in is **not** verified payroll attendance; it must not automatically dock salary or award attendance bonuses without policy and independent acceptance.

## 7. Recommended phased work packages

### P0 — Deployment isolation + Auth acceptance + recoverability

- Confirm original demo's Vercel production branch: current production SHA is deployed from **dev**, meaning unrestricted dev pushes can change the demo; freeze this path before coding.
- Preserve live mock-only website, correct demo flags and demo-only data. Introduce separate staging Vercel project/branch using development Supabase **test only**, production/staging Auth redirect URL isolation, `foundation` mode and demo disabled. Project/account creation or branch setting changes require owner's approval.
- Perform recoverable database **and actual Supabase Storage object** backup + restore verification. Database-only backups do not include Storage object bytes.
- Rotate previously exposed dev credentials after dependency inventory/controlled change; remove local plaintext comments, verify required tests, avoid logging secrets; inspect two Active Super Admin entries without auto-disabling either.
- Open newest invitation privately, confirm inbox delivery and link, set personal password, enroll TOTP, confirm authorization to ERP endpoints and recovery procedure. Provider accepted send ≠ delivered email.

### P1 — Release hardening independent of business policies

- DB-backed invitation outbox with retry state, bounded exponential backoff, manual safe resend, rate limit, failed-delivery monitoring, no leaked tokens. Plan for at-least-once sending/idempotent intent (not unrealistic exactly-once email guarantees).
- Least-privilege runtime PostgreSQL role, separate migration owner, audited grants/row-level boundary; prove normal workflows succeed and unauthorized SQL/DDL fail.
- Bounded/paginated `/inventory/batches`, `/inventory/stock` and other remaining operational APIs, avoid loading unbounded rows; consistent CSV/print caps and authorized filters.
- Structured errors, alerts, operational health/backup evidence; provider-neutral scheduled jobs for retention and cleanup with dry run, policy gates, idempotency and legal-hold exception.

### P2 — Workbook profiler & validated opening preview (engineering without real openings)

- Read-only 5-sheet import + source SHA-256, source sheet/row/column references and parser version; retain raw evidence.
- Dates/sheets segmentation, duplicate normalization suggestions with human choice; strict product/party/batch mapping, unit/currency validation; detect exact amount discrepancies.
- Generate reviewable exception queue, reconciliation totals, difference reports and standardized editable *approved* opening templates; no remote posting.
- Build `Draft → Validate → Preview → Approve → Post → Reconcile` server-side lifecycle with permissions, reviewer separation, immutable approved snapshot/version and posting idempotency. Synthetic test data and private audit evidence.

### P3 — Opening stock/value + AR/AP/cash data model and postings

- Add source-aware opening inventory batches and precise cost validation, approved by warehouse + Accounts. Enable on-hand/cost/condition/FIFO/as-of value and per-lot source trace.
- Add approved opening customer invoice-level AR sources (where evidenced) with initial `Opening Due`, supplier opening AP/advance sources, and cash/bank opening journals. Make them reconcile without creating fake sale/import transactions.
- Stage against **separate dev test fixtures**. Preserve all existing data, explicit legal corrections/reversal and cutover source fingerprint. Test partial/duplicate/conflicting posting, rounding and atomicity.
- Require client-approved opening values before applying to real business records.

### P4 — Stock integrity flows / return credits

- Quarantine/condition quantities with movement-source and valuation rules, dated as-of reporting.
- Physical-count variance/approval/adjustment. Damage reporting/disposition and write-off/claim handling.
- Supplier rejection/credit/replacement against original import and receiving, no ghost stock.
- Customer rejection/return inspection linked to original delivery and invoice, accurate credit note/refund/customer due/COGS and stock disposition; prevent double compensation.
- Approval matrix and thresholds configurable only within signed policy; privilege and audit tests.

### P5 — Functional consolidation + staging UAT

- Preserve existing working `/backend` paths while consolidating final ERP navigation; all supported old links redirect to real persistent services; unsupported routes fail explicitly (no demo/mock data).
- Seven-role/browser/direct API scopes, mobile 390px and real Android/iOS HTTPS field visit, private documents, expiring media links, email/MFA, reporting/CSV/print totals, concurrent receipts/deliveries/returns, backup/restore+rollback.
- Keep static public brochure independent. Dynamic CMS, AI and generic new infrastructure not core blockers.

### P6 — Controlled production cutover

- Client approves exact cutover moment; both Warehouse and Accounts independently sign stock cost/quantity, AR, AP, advances, cash/bank and outstanding exceptions.
- Export prototype source if original runtime edits still exist; otherwise explicitly acknowledge unrecoverable data. Preserve signed raw artifacts and hashes.
- Isolated company-owned production Supabase/hosting credentials and billing; no cross-project secrets. Rehearse staging import and complete variance report first.
- Authorized owner approves rollout; backup, deploy, batch import, per-domain balance proofs, reconciliation, smoke/UAT, rollback plan. Halt when unresolved differences exceed approved policy; never insert silent balancing records.
- Deliver operator documentation, owner recovery, backup retention, monitoring contacts, operational training and change management.

### P7 — Client-requested Payroll, Commission and GL (conditional timing gate)

Design/payroll policy sign-off and, if required, proper GL first. Payroll and commissions may be a subsequent release or a separately approved first-release extension; do not leave client assuming it is already done.

## 8. Acceptance invariants to require from the agent

1. `OpeningStock` source has approval, independent reviewer, source hash, batch lot/expiry/cost, ledger reference and one-time exactly-once *posting* even on network retries.
2. `Σ physical stock` by batch/condition and `Σ recorded stock movements` reconcile at cutoff/current/as-of dates; no negative saleable, oversell or double count.
3. Per-batch saved opening+receiving values minus dispatched/approved written-off/returned costs equals saved remaining condition/value and report total, with exact decimal handling and rounding balance.
4. `Cost Value` never visible to a role without `view_sensitive_cost`, including API, downloadable CSV, printable documents and errors.
5. Approved invoice creates receivable once, credit note reverses correct due once, refund and collection cannot together exceed available credit/due; return quantities never exceed original deliverable balances.
6. Source AR/AP/bank opening totals equal approved client schedules, not just grand total and not naive duplicate source rows.
7. Every posted transaction can be traced to source evidence, actor, policy/version, date and audit; no unapproved destructive changes to posted history.
8. No runtime access to schema migrations or privileged secret-bearing resources; same-origin / MFA / role scopes survive requests to direct URLs.
9. Hosted staging restart/redeploy does not erase data. Authorized database **and Storage object** restore drills pass, measured against expected backup and known sample records.
10. Live demo `medical-supplier-erp.vercel.app` remains unchanged unless the owner explicitly approves its own deployment/change.

## 9. Responsibilities and approvals

| Task | AI agent | You / account holder | Client |
|---|---|---|---|
| Code, migrations, automated tests, workbook exception profiler | Lead | Review diffs / authorize safe hosted tests | — |
| Live demo isolation, staging, hosted credentials | Propose / execute approved change | Explicit approve project/branch/env changes | Own production accounts at launch |
| SMTP | Already configured; perform delivery acceptance diagnostics | Open own invitation privately, MFA | Employee delivery test inboxes |
| Source opening figures and valuation policy | Templates, draft parsing & difference checks | Collect and document | Verify count/cost/source, authorize each schedule |
| Return/damage/rejection accounting | Workflow and policy options | Coordinate decision | Written operational/accounting approval |
| Payroll inclusion | Assess full dependencies/cost/risk | Clarify scope and contract | Decide mandatory first release vs phased delivery |
| Production go-live | Rehearse + report + deploy on approval | Owner release authorization | Business UAT and signoff |

## 10. The exact next task to give the AI agent

**Do not issue one blanket “complete the full backend” command.** Start with P0 + P1 architectural audit and *safe* work on a non-production-linked feature branch, then P2 read-only workbook profiler and opening-data architecture proposal. Require a separate change log and acceptance report for each batch. See companion `MIPRO_ERP_Simplified_Plan_update13.md` for the complete actionable implementation brief.

## 11. Client questions: minimum business decision packet

1. Confirm goods value = cost value, sales value, or both. Show separate values regardless.
2. Confirm physical cutover date/hour, warehouse(s), product/lot/manufacture/expiry, physical count by condition and **approved cost at batch level** including any FX/freight/duty basis.
3. Confirm authoritative customer AR per invoice at cutover and explain the `1,978,990` versus `537,612` due-list difference plus the `11,300` October mismatch.
4. Provide supplier payables/advances and cash/bank/mobile-money opening schedule with supporting statements.
5. Clarify `17L` lot duplicate, missing opening quantities, date-like LOT numbers and source customer-name aliases.
6. Choose historical transaction migration or approved snapshot+archived originals (recommended), and list documents available.
7. Confirm return/rejection/damage/stock adjustment roles, approvals, quarantine disposition, supplier claims, refund vs credit and valuation policy.
8. Confirm employee check-in privacy/retention, device restrictions and evidence preservation.
9. Confirm Payroll inclusion and commission base, and whether audited **General Ledger** is required for the first release.

## 12. References

- Current code: https://github.com/AN-SWAPNIL/Medical_Supplier_ERP/tree/dev
- Relevant repo docs: `PRODUCTION_BACKEND_PROGRESS.md`, `BACKEND_SETUP.md`, `database/schema.ts`, `server/operations/inventory.ts`, `server/reports/inventory.ts`, `server/trading/*`, `server/finance/*`.
- Client file: `Stock, Delivery, Due list.xlsx` supplied in conversation; raw originals not modified.
- IAS 2: https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/
- Supabase SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- Supabase backups **exclude Storage objects**: https://supabase.com/docs/guides/platform/backups
- Vercel Git production/preview branch behavior: https://vercel.com/docs/git

**Verification limit:** This is a code/document/source-file and deployment-metadata audit, not a successful production API walkthrough or signed client financial audit. Agent must recheck the branch SHA, deployed configuration and hosted data before changing anything.

## 13. Exact client-request traceability and decisions (scope control)

All IDs below refer to the **client's actual supplied wording** in Section 14; implementation details below are engineering recommendations, not silently approved business policies.

| ID | Client-stated function | Code/reuse vs genuine gap | Necessary business confirmation | Verification/acceptance |
|---|---|---|---|---|
| CV-01 | **Goods value automatically** from product details + quantity; five-sheet Stock/Delivery/Due workbook | Reuse per-batch landed cost, saved COGS and sale-line totals; add approved **opening-stock unit cost/extended value**, explicit source and preview | Whether client means purchase/landed stock cost, expected selling value, delivery invoice value or all; supporting cost documents, cutover date | Correct exact-decimal totals; cost unavailable ≠ zero; cost visible only to authorized roles; end-to-end stock/report tie-out |
| PY-01 | Employee profile: ID/name/designation/department/join date/pay components/bank or MFS/payment method/status | Employee directory exists; confidential compensation and payment preferences are a **new protected domain** | Salary data owner, payee verification, data retention, privacy | Confidential data hidden from non-HR/non-payroll roles; versioned and audited |
| PY-02 | Monthly basic, house/medical/transport, commission, bonus, OT, advance, loan installment, other deductions, net formula | **No end-to-end payroll ledger** exists. Need dated pay components, attendance source, loan/advance balances, periods, calculation/rounding | Gross definition, overtime/leave/attendance, deduction legality and Bangladesh tax/labour handling, negative/zero net rules | Deterministic preview; no double-pay; posted months immutable with approved corrections |
| PY-03 | HR → Accounts → Management → Payment → Final Posting; slips, payment vouchers, **automatic General Ledger** | Existing expense/cash sources do not amount to a balanced double-entry GL; design new payroll obligations and real GL or approved interface | Approval responsibility, GL scope, bank pay run method, tax/withholding | Balance postings; liability vs paid separation; payroll-bank reconciliation; permission tests |
| PY-04 | Sales commission on invoice or collected amount; reverse/correct for return/cancel; controlled rates | Existing invoice/collection/return sources can feed a new engine; no approved commission engine | Earned at invoice vs cleared collection; rate effective dates, ownership, partial receipts, clawbacks | No duplicated commission; deterministic cancellation/refund reversal and payroll inclusion |
| RT-01 | Customer returns tied to original invoice, product/SKU, batch/expiry, reason, condition, inspection and approver | Invoice/delivery/FIFO base exists; return workflow, inspection and credit/refund journals missing | Return window, damaged/expired acceptance, authorization, already-paid receipts | Partial return bounded by prior delivery minus prior returns; no duplicate credit/refund |
| RT-02 | Saleable vs quarantine/damaged/expired/rejected stock | Existing batch quantity only; needs **partial-batch condition buckets**, usable/held totals and availability gates | Reinspection and disposition authority; medical device handling | Unavailable stock never dispatches; quantity and value conservation |
| DM-01 | Damage report, photos, unit cost/loss, inspection, maker/verifier/approver, later adjustment and loss | Photo/storage primitives can be reused; no approved damage/hold/write-off engine | When held stock becomes financially written off, insurance/supplier claim handling | Hold instantly blocks sale; no premature expense; later approved financial posting reconciles |
| RJ-01 | Supplier rejection on receipt, link to PI/GRN, claim/credit/replacement and supplier ledger | Receipt supports rejected qty as non-stock, but rejects have no complete claim/financial source | Rejection cost allocation and supplier recoverability; credit-note authority | Accepted/rejected receipt value consistent; replacement new receiving; original PI untouched |
| RJ-02 | Customer rejection: quarantine, inspection, return/sales reversal, repair or claim/write-off | Requires RT-01/RT-02 and approved accounting pathways | Delivery acceptance vs invoiced vs paid states; customer credit policy | No duplicate stock intake or refund; track original source |
| SC-01 | Physical stock count → variance → investigation → approval → adjustment & accounting, LOT/expiry/warehouse | Need count snapshots, locks, audited signed movement, exact cost impact | Count freeze/date, tolerance, surplus cost origin, approval limits | Prior/new stock and values reconcile, concurrent delivery and count cannot race |
| AP-01 | A centralized approval pattern across payroll/returns/damage/rejection/correction; no self-approval | Existing RBAC/audit is reusable; small audited maker–checker workflow required | Role matrix, replacement approvers, financial thresholds | Maker cannot final approve own transaction; stale approval rejected |
| AU-01 | RBAC, immutable timestamps, approval logs, notifications, reports for all listed domains | Shared RBAC/audit/report facilities present; extend for new sources | Alert channels/ownership, retention and report visibility | Unauthorized direct API and CSV/print denied; audit proves every status transition |

### 13.1 Key classification: request versus system inference

- **Explicit client requests:** all entries in the matrix, payroll including auto GL, multi-stage approval, inventory valuation, five-sheet workbook support.
- **Evidence, not client-approved data:** quantities and dues in workbook; source content can be inconsistent or dated, and supporting documents/cutover are missing.
- **Engineering interpretation requiring sign-off:** whether `goods value` means *cost* or *sales* value; condition bucket accounting; loss/claim settlement; refund timing; payroll commission base, deductions, approval thresholds and GL account mapping.
- **Additional technical safeguards proposed by engineering:** additive migrations, immutable/signed journals, separate runtime DB role, deterministic idempotency, restore drill, staging isolation and no-mock-fallback tests. These are not quotations of client policy.

### 13.2 Minimum client confirmations **without stopping coding**

1. Which inventory value(s) should the user see: acquisition/landed **cost**, expected selling value, actual invoiced/delivered value, or all separately? What approves opening unit cost?
2. Which workbook report and which **as-of date** is the legally/business-authoritative due schedule? Are these raw historical sheets or opening balances?
3. What happens at receipt, inspection and disposition for rejected, damaged, held and returned goods? Who may approve release, credit, refund and write-off?
4. Who prepares/verifies/approves each transaction? Is independent approver mandatory for every amount or subject to thresholds?
5. Is complete Payroll + Sales Commission + **automatic GL posting** required for the *initial go-live*? Confirm commission base, effective rates, salary components, attendance source, deductions and fiscal treatment. Never interpret silence as permission to omit payroll.

## 14. Verbatim original client instructions (authoritative source reference)

**Source provenance:** Client-provided message preserved from the user-supplied pasted text. The original repeated `1.` section numbering, Bengali/English mixture, sample values, formula and roles are intentionally left unchanged. Typographic/editing defects are not silently corrected. This is a **request**, not a sign-off on accounting treatment or an assurance the workbook is correct. Raw-source SHA-256 (UTF-8 LF-normalized): `ea5ea2eee58e1c31ce993307acbb11f7a33e2520dbb449defe69ad2e4d7141b0`.

```text
Check below 👇 
@all
1. Payroll Management — কীভাবে কাজ করবে?

Payroll এমনভাবে তৈরি করতে হবে, যাতে কর্মচারীদের বেতন, উপস্থিতি, কমিশন, অগ্রিম, কর্তন ও বেতন পরিশোধের হিসাব স্বয়ংক্রিয়ভাবে পরিচালিত হয়।

A. Employee Profile

প্রতিটি কর্মচারীর জন্য:

* Employee ID ও নাম
* Designation ও Department
* Joining Date
* Basic Salary ও অন্যান্য Allowances
* Mobile Banking/Bank Account Details
* Salary Payment Method
* Employment Status: Active/Inactive

B. Monthly Salary Calculation

সফটওয়্যার স্বয়ংক্রিয়ভাবে হিসাব করবে:

Salary Component	বিবরণ
Basic Salary	মূল বেতন
House Rent	বাড়িভাড়া ভাতা
Medical Allowance	চিকিৎসা ভাতা
Transport Allowance	যাতায়াত ভাতা
Sales Commission	বিক্রয় কমিশন
Attendance Bonus	উপস্থিতি বোনাস
Overtime	অতিরিক্ত কাজের পারিশ্রমিক
Salary Advance	বেতন অগ্রিম সমন্বয়
Loan Installment	কর্মচারীর ঋণের কিস্তি
Other Deductions	অন্যান্য অনুমোদিত কর্তন
Net Salary	সর্বশেষ প্রদেয় বেতন

Formula:

Net Salary = Gross Salary + Commission + Bonus + Overtime − Advance Adjustment − Loan Installment − Other Deductions

কর্তনের ক্ষেত্রে প্রযোজ্য শ্রম আইন ও প্রতিষ্ঠানের অনুমোদিত নীতিমালা অনুসরণ করতে হবে।

C. Payroll Approval Workflow

প্রস্তাবিত Workflow:

HR / Admin → Accounts → Management Approval → Payment → Final Posting

1. HR কর্মচারীর উপস্থিতি ও বেতন প্রস্তুত করবে।
2. Accounts বেতন, কমিশন ও কর্তনের হিসাব যাচাই করবে।
3. অনুমোদিত কর্তৃপক্ষ Payroll অনুমোদন করবে।
4. Accounts ব্যাংক বা অনুমোদিত পেমেন্ট পদ্ধতিতে বেতন পরিশোধ করবে।
5. Payment Voucher ও Salary Slip তৈরি হবে।
6. General Ledger-এ স্বয়ংক্রিয়ভাবে হিসাব পোস্ট হবে।

গুরুত্বপূর্ণ নিয়ম:

* অনুমোদন ছাড়া বেতন পরিশোধ করা যাবে না।
* একই কর্মচারীর একই মাসের বেতন দ্বিতীয়বার তৈরি হলে Duplicate Payroll Alert দেখাবে।
* বেতন অনুমোদনের পর পরিবর্তন করতে হলে পুনরায় অনুমোদন নিতে হবে।
* কে কখন বেতন তৈরি, পরিবর্তন, অনুমোদন ও পরিশোধ করেছে, তার Audit Log থাকবে।
* কর্মচারীর অগ্রিম বা ঋণের কিস্তি বেতন থেকে কাটলে সংশ্লিষ্ট Ledger-এও হিসাব আপডেট হবে।

D. Sales Commission Management

আপনার মেডিকেল ডিভাইস ব্যবসার জন্য Sales Commission মডিউলটি গুরুত্বপূর্ণ।

* কমিশন Invoice অনুযায়ী হিসাব হবে।
* প্রয়োজন হলে শুধু আদায়কৃত টাকার ওপর কমিশন গণনা হবে।
* বাতিল Invoice বা Return-এর ক্ষেত্রে কমিশন পুনর্গণনা হবে।
* কমিশনের হার কর্মচারী, পণ্য বা অনুমোদিত Sales Policy অনুযায়ী নির্ধারণ করা যাবে।
* অনুমোদন ছাড়া কমিশনের হার পরিবর্তন করা যাবে না।

⸻

1. Returns Management — কাস্টমার পণ্য ফেরত দিলে

পণ্য ফেরত এলেই যেন সরাসরি বিক্রয় ও স্টকে পরিবর্তন না ঘটে। প্রথমে Return Request, তারপর যাচাই ও অনুমোদন, এরপর Stock ও Accounts আপডেট হবে।

Workflow

Customer Return Request → Product Inspection → Approval → Stock Update → Credit Note / Refund

প্রতিটি Return-এর জন্য সংরক্ষণ করতে হবে:

* Original Sales Invoice Number
* Customer Name
* Product Name ও SKU
* Batch/Lot Number
* Expiry Date
* Return Quantity
* Return Reason
* Product Condition
* Inspection Report
* Approved By

পণ্য ফেরত এলে স্টকের নিয়ম

পণ্যের অবস্থা	স্টকের ব্যবস্থা
অক্ষত, বিক্রয়যোগ্য এবং সংরক্ষণযোগ্য	Inspection পাস করলে Available Stock-এ ফেরত
পরীক্ষা প্রয়োজন	Quarantine Stock-এ রাখা
ক্ষতিগ্রস্ত	Damaged Stock-এ স্থানান্তর
মেয়াদোত্তীর্ণ	Expired Stock-এ স্থানান্তর
ত্রুটিপূর্ণ বা প্রত্যাখ্যাত	Rejected Stock-এ স্থানান্তর

Accounting Treatment:

কাস্টমার ফেরত দিলে অনুমোদিত Return-এর বিপরীতে Credit Note তৈরি হবে। টাকা ফেরত দিলে Refund Voucher তৈরি হবে। কাস্টমারের পাওনা সমন্বয় করা হলে তার Customer Ledger আপডেট হবে।

একই Return-এর জন্য যেন একাধিক Credit Note বা Refund তৈরি না হয়, সেই নিয়ন্ত্রণও রাখতে হবে।

⸻

1. Damaged Goods Management — নষ্ট পণ্যের হিসাব

গুদামে পণ্য নষ্ট হলে সরাসরি স্টক কমিয়ে দেওয়া যাবে না। প্রথমে Damage Report তৈরি করতে হবে।

Workflow

Damage Report → Inspection → Approval → Stock Adjustment → Accounting Entry

Damage Report-এ থাকবে:

* Product Name
* Batch/Lot Number
* Expiry Date
* Damaged Quantity
* Damage Reason
* Purchase Cost
* Total Loss
* Warehouse Location
* Supporting Photo
* Reported By
* Approved By

উদাহরণ

ধরা যাক:

* Dialyzer 1.7H: ২০ পিস নষ্ট
* ক্রয়মূল্য: ৫০০ টাকা/পিস
* মোট ক্ষতি: ১০,০০০ টাকা

সফটওয়্যার নষ্ট পণ্যকে Available Stock থেকে সরিয়ে Damaged Stock-এ নেবে। কর্তৃপক্ষ অনুমোদন দিলে এবং পণ্য আর বিক্রয়যোগ্য না হলে সংশ্লিষ্ট Inventory Value কমবে এবং অনুমোদিত নীতিমালা অনুযায়ী Damage/Loss Expense হিসাবভুক্ত হবে।

বিশেষ নিয়ম:

* Warehouse Staff Damage Report তৈরি করতে পারবে।
* Warehouse Manager পণ্য পরীক্ষা করবে।
* Accounts ক্ষতির মূল্য যাচাই করবে।
* অনুমোদিত Management Representative চূড়ান্ত অনুমোদন দেবেন।
* অনুমোদনের আগে পণ্যটি Available Stock-এ থাকবে না; প্রয়োজনে Quarantine বা Damaged Stock-এ রাখা হবে।
* Damage Report মুছে ফেলা যাবে না; ভুল হলে সংশোধনী রেকর্ড রাখতে হবে।

⸻

1. Rejected Goods Management — ত্রুটিপূর্ণ বা বাতিল পণ্য

Rejected Goods দুই ধরনের হতে পারে:

A. Supplier Rejection: সাপ্লায়ার থেকে আসা পণ্য মানসম্মত নয়।

B. Customer Rejection: কাস্টমার পণ্য গ্রহণ করেনি অথবা পরীক্ষায় ত্রুটি পাওয়া গেছে।

A. Supplier Rejection Workflow

Goods Received → Quality Inspection → Rejection Report → Approval → Supplier Return / Replacement / Claim

উদাহরণ: চীন থেকে ১,০০০ পিস Blood Tubing Set আমদানি করা হলো। পরীক্ষা করে ৫০ পিস ত্রুটিপূর্ণ পাওয়া গেল।

সফটওয়্যারে:

1. ৫০ পিস Rejected/Quarantine Stock-এ যাবে।
2. Purchase Invoice ও Goods Received Note-এর সঙ্গে Rejection Report যুক্ত হবে।
3. সাপ্লায়ারকে Return, Replacement বা Credit Note-এর অনুরোধ করা যাবে।
4. Replacement এলে নতুন Receiving Record তৈরি হবে।
5. Supplier Ledger-এ Credit বা Replacement-এর হিসাব সমন্বয় হবে।

গুরুত্বপূর্ণ: সাপ্লায়ারকে পণ্য ফেরত দেওয়ার আগে সংশ্লিষ্ট Purchase Invoice ও Supplier Ledger-এর হিসাব ইচ্ছামতো মুছে ফেলা যাবে না। অনুমোদিত Credit Note বা Return Transaction-এর মাধ্যমে হিসাব সমন্বয় করতে হবে।

B. Customer Rejection Workflow

কাস্টমার পণ্য প্রত্যাখ্যান করলে:

* পণ্যটি Quarantine Stock-এ রাখতে হবে।
* Quality Inspection করতে হবে।
* ত্রুটি প্রমাণিত হলে অনুমোদিত Return বা Sales Reversal করতে হবে।
* পণ্য বিক্রয়যোগ্য হলে Inspection পাসের পর Available Stock-এ ফেরত নেওয়া যাবে।
* ত্রুটিপূর্ণ হলে Supplier Claim, Repair, Replacement বা Write-off-এর ব্যবস্থা নিতে হবে।

⸻

1. Stock Corrections — বাস্তব স্টক ও সফটওয়্যারের স্টকে পার্থক্য

এটি আপনার ব্যবসার জন্য অত্যন্ত গুরুত্বপূর্ণ। কারণ মেডিকেল ডিভাইসের স্টকে সামান্য গরমিলও আর্থিক ক্ষতি ও Batch/Lot Tracking-এ সমস্যা তৈরি করতে পারে।

উদাহরণ

সফটওয়্যারে দেখা যাচ্ছে:

Dialyzer 1.7H = ৫,০০০ পিস

কিন্তু গুদামে গণনা করে পাওয়া গেল:

Dialyzer 1.7H = ৪,৯৭৫ পিস

পার্থক্য = ২৫ পিস।

সফটওয়্যার যেন সরাসরি ৫,০০০ থেকে ৪,৯৭৫ না করে দেয়। প্রথমে Stock Variance Report তৈরি করতে হবে।

Stock Correction Workflow

Physical Stock Count → Variance Report → Investigation → Approval → Stock Adjustment → Accounting Entry

প্রতিটি Stock Correction-এ থাকতে হবে:

* Product Name ও SKU
* Batch/Lot Number
* Expiry Date
* Warehouse
* System Quantity
* Physical Quantity
* Variance Quantity
* Unit Cost
* Total Variance Value
* Adjustment Reason
* Supporting Documents
* Prepared By
* Verified By
* Approved By

অনুমোদনের নিয়ম

দায়িত্ব	কাজ
Warehouse Staff	বাস্তব স্টক গণনা
Warehouse Manager	স্টক পুনরায় যাচাই
Accounts	আর্থিক প্রভাব যাচাই
Management	নির্ধারিত সীমা অনুযায়ী অনুমোদন
System Admin	অনুমোদিত পরিবর্তনের প্রযুক্তিগত বাস্তবায়ন; নিজে অনুমোদনকারী নয়

সফটওয়্যারে যে Controls থাকা উচিত

1. অনুমোদন ছাড়া Stock Adjustment পোস্ট হবে না।
2. Adjustment-এর আগে ও পরে স্টকের পরিমাণ দেখা যাবে।
3. স্টকের মূল্য পরিবর্তিত হলে তার হিসাব স্বয়ংক্রিয়ভাবে তৈরি হবে।
4. প্রতিটি Adjustment-এর Audit Trail থাকবে।
5. একই Batch/Lot-এর স্টক আলাদাভাবে দেখা যাবে।
6. Expired বা Rejected Stock যেন স্বাভাবিক Available Stock হিসেবে বিক্রি না হয়।
7. Posted Transaction সরাসরি Delete করা যাবে না।
8. ভুল সংশোধনের জন্য Reversal বা Adjustment Transaction ব্যবহার করতে হবে।

⸻

1. পাঁচটি মডিউলের জন্য একটি কেন্দ্রীয় Approval System

আপনার সফটওয়্যারে Payroll, Returns, Damaged Goods, Rejected Goods এবং Stock Corrections-এর জন্য একই ধরনের অনুমোদন কাঠামো রাখা যেতে পারে।

Module	Prepared By	Verified By	Final Approval
Payroll	HR/Admin	Accounts	Management
Customer Return	Sales/Warehouse	Quality/Accounts	Management
Damaged Goods	Warehouse	Quality/Accounts	Management
Supplier Rejection	Purchase/Warehouse	Quality/Accounts	Management
Stock Correction	Warehouse	Accounts/Inventory Manager	Management

অনুমোদনের দায়িত্ব প্রতিষ্ঠানভেদে পরিবর্তন করা যাবে। তবে একই ব্যক্তি যেন নিজের তৈরি লেনদেন নিজেই অনুমোদন করে চূড়ান্তভাবে পোস্ট করতে না পারে, সেই ব্যবস্থা রাখা উচিত।

1. সফটওয়্যার ডেভেলপারকে দেওয়ার জন্য চূড়ান্ত নির্দেশনা

নিচের বার্তাটি সরাসরি আপনার সফটওয়্যার ডেভেলপারকে পাঠাতে পারেন।

Subject: ERP Software Functional Requirements — Payroll, Returns & Inventory Controls

Please ensure the ERP software includes the following functions with proper approval workflows, accounting integration, and complete audit trails.

1. Payroll Management

* Employee profiles, attendance, salary components, allowances, commission, advances, loans, deductions, and net salary calculation.
* Monthly payroll preparation, verification, management approval, payment vouchers, salary slips, and automatic General Ledger posting.
* Duplicate payroll prevention and controlled amendments after approval.
* Sales commission calculation based on approved company policy and applicable invoice/collection status.

1. Customer Returns

* Return requests linked to original sales invoices.
* Product-wise, Batch/Lot-wise, and Expiry-wise return tracking.
* Inspection and approval before final stock and accounting adjustments.
* Separate stock statuses for saleable, quarantine, damaged, expired, and rejected goods.
* Automatic credit notes, customer ledger adjustments, and refund records where applicable.

1. Damaged Goods

* Damage reports with quantity, batch, expiry, unit cost, total loss, reason, and supporting evidence.
* Inspection, verification, management approval, stock transfer, and appropriate accounting entries.
* Damaged stock must not be available for normal sales.

1. Rejected Goods

* Separate workflows for supplier-rejected and customer-rejected products.
* Supplier return, replacement, credit note, and claim tracking.
* Link all transactions to the original purchase/sales documents and relevant supplier/customer ledgers.

1. Stock Corrections

* Physical stock count and variance reports showing system quantity, physical quantity, variance, unit cost, and financial impact.
* Mandatory reason, verification, and authorized approval before posting adjustments.
* Batch/Lot/Expiry-wise stock tracking and automatic accounting entries where required.
* No direct deletion or unauthorized modification of posted transactions.

1. Security and Audit Trail

* Role-based access control and segregation of duties.
* Complete records of who created, verified, approved, modified, and posted each transaction, including date and time.
* Configurable approval limits and notifications for exceptional transactions.
* Reports for payroll liabilities, customer returns, damaged/rejected stock, inventory variances, and related financial adjustments.
```

**Additional original client statements submitted alongside the brief:**

```text
all this spreadsheet @Stock, Delivery, Due list
Also this instruction: The goods value should be calculated automatically when we enter the inventory data, including the product details and quantity.
```

**Associated evidence:** `Stock, Delivery, Due list.xlsx` (five tabs). The workbook remains unchanged; see Section 3 for concrete source exceptions and missing opening costs. Keep raw client instructions and workbook snapshots available to the coding agent when implementing Update 13.
