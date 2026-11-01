# Update 13: Batch 0 Safety And Source Audit

Date: 28 October 2026, Bangladesh. Baseline: `931ba5c3e2c96b1b39c46a70a2b1834646c9fcf7`.

## Outcome

Read-only preflight executed. **Batch 0 release acceptance is not complete**, and Update 13 is not implemented end to end. The environment findings below require owner decisions before hosted changes or a release. Client requirements remain in scope in `client_requirement_coverage.md`, including payroll, commission and automatic GL posting.

Work is on local-only branch `work/update13-preflight`. No commit, push, deployment, provider configuration change, email send, administrator change, migration, stock/money posting or client-data import was performed in this batch. The previous localhost-only instruction is retained.

## Live Demo And Git

| Check | Observed Evidence |
| --- | --- |
| Remote `dev` | `931ba5c3e2c96b1b39c46a70a2b1834646c9fcf7`, independently checked with `git ls-remote`. |
| Vercel project | `medical-supplier-erp`, Vite, Node `24.x`. |
| Production branch | GitHub `AN-SWAPNIL/Medical_Supplier_ERP`, **dev**, automatic deployment creation enabled. |
| Live production deployment | `dpl_6j2aVvCUeLzNiqy8Jd7KD4h9s3s9`, READY, source `dev` at the baseline SHA. |
| Live alias | `medical-supplier-erp.vercel.app`. The same deployment also has a git-dev alias. |
| Environment metadata | Only five project variables listed: `ERP_BACKEND_MODE`, `VITE_BACKEND_MODE`, `DEMO_DEPLOYMENT`, `DEMO_MODE`, `VITE_DEMO_MODE`. All target Production. Values were **not decrypted**, downloaded or printed. |
| Public GET checks | Home 200; health 200 with mock service identity; demo-user endpoint 200 with 11 identities counted, not logged; unauthenticated profile 401. No login or business write was attempted. |
| Local GET health | `http://localhost:5178/api/health`: 200, `mode=foundation`, `database=connected`. |
| Local default modes | Ignored local environment still defaults to mock. `scripts/backend-dev.mjs` explicitly starts the separate foundation helper. The local helper does not imply live foundation cutover. |

**Gate:** A `dev` push can replace the live demo. A new local branch prevents accidental local work on dev, but it does not freeze Vercel or authorize pushing that branch; Git previews may also run automatically. No staging project/origin has been approved.

Recommended owner-approved isolation: preserve the tested demo SHA on a dedicated stable demo branch, explicitly change the existing project's production tracking to that branch, and use a separate staging project with a stable HTTPS origin when authorized. Check preview triggers, environment targets and Supabase redirect strategy before any push/deployment. This is a proposal, not a setting already applied.

## Database And Inventory

Both configured database connections were inspected in `REPEATABLE READ READ ONLY` transactions. Their read-only state was checked using `SHOW transaction_read_only`; sessions were rolled back. No DDL/DML privilege was exercised.

| Check | Observed Evidence / Meaning |
| --- | --- |
| Schema | 53 private tables; RLS enabled on all 53. |
| Data API access | Neither `anon` nor `authenticated` has USAGE on `erp_private`. |
| Runtime role | Not a superuser, but has BYPASSRLS, can create roles/private-schema objects, owns all 53 private tables and can access the migration schema. **Not least privilege.** |
| Migration separation | Runtime and migration connections currently use the same SQL role. Separate URLs/ports alone do not establish privilege separation. |
| Migrations | 24 applied entries, matching repository migrations 0000 through 0023 by timestamp and SHA-256, allowing LF/CRLF normalization. Zero unrecognized source hashes. |
| Migration serial ID | The largest internal migration-row ID is 26. This is a database sequence identifier, not evidence that migration 0026 exists. |
| Current stock | 90 batches and 153 movements. Zero quantity/value mismatches using the current Receive-minus-Dispatch report interpretation. |
| Unsupported source rows | Zero existing movement rows outside Receive/Dispatch. This is why current stock can reconcile despite prospective source-type gaps. |
| Opening provenance | Both `stock_batches.receipt_line_id` and `source_import_id` are NOT NULL. No valid direct opening-stock source exists yet. |
| Batch identity | Global case-insensitive batch-number uniqueness is installed. Do not silently remove it to absorb ambiguous source LOTs. |
| Private Storage inventory | 30 metadata rows for `erp-documents`; no private object bytes or signed read URLs were downloaded. Metadata counts do not prove file backup/recoverability. |

### Required Architecture Corrections

- `server/operations/inventory.ts` calculates accepted receipt value from the finalized source total. Preserve cumulative exact valuation, not multiplication by a rounded displayed unit cost.
- `database/migrations/0010_posting_race_guards.sql` counts Receive and Return positively and Dispatch negatively. Inventory reports currently count only Receive and Dispatch. Adjustment has no supported quantity/value sign model. Extend source-aware posting, guards, availability, dashboard and reports together before enabling new types.
- A Return enum and partial trigger rule are not a customer-return inspection/credit/refund workflow. There is no authorized return posting API today.
- Batch quantity/value has no partial-batch condition ledger. Quarantine/hold must affect dispatch eligibility immediately, independently of later financial loss approval.
- Existing Opening Due and account-creation opening journals are reusable primitives, not an approved bulk cutover process. Do not fabricate an import, GRN, invoice or balancing transaction to import the workbook.
- Existing financial-position sources are not a double-entry GL. Payroll must remain an explicit client requirement with a signed timing/architecture decision; field check-ins must not be used as payroll attendance.

## Auth And Owner Acceptance

- SMTP remains enabled at Gmail port 465; email limit is 30/hour and resend interval one minute. No SMTP secret was read or changed.
- Site URL is localhost:5178, with the exact localhost:5178 and localhost:5173 reset-password redirects. Public signup is disabled; email confirmation, a 12-character password minimum and TOTP enrollment/verification are enabled.
- The configured administrator's linked email is now confirmed and has a prior sign-in. This supersedes the earlier unverified-account snapshot. It does not independently prove human inbox receipt or complete browser invitation acceptance.
- The configured administrator has **zero verified TOTP factors**. Its owner must complete enrollment privately before privileged staging access. No QR, setup key, password or factor ID was read or logged.
- A second Active Super Admin employee record still exists, but lookup of its linked Auth user returns HTTP 404. Owner review is required. Do not recreate, promote, relink, deactivate or delete either account automatically.
- No invitation/recovery message was sent and no owned inbox, setup link or personal account was opened in this batch. Auth write tests were not rerun as part of the read-only audit.

## Backup And Restore Boundary

The latest local database snapshot was captured on 28 October at 16:58 Bangladesh time. Its SHA-256 sidecar matches, its format is `mipro-erp-backup-v1`, and it contains records for 53 private tables.

This verifies local snapshot integrity only. It does **not** prove:

- Offsite/encrypted availability or approved retention/RPO/RTO.
- A successful isolated database restore, schema/trigger/grant restoration or Supabase Auth recovery.
- Backup and restoration of the actual private Storage object bytes.
- Legal holds, approved photo disposal, scheduled retention, alert delivery or an authorized restore destination.

Current backup tooling serializes private-table records to JSON; it is not a complete database/Storage disaster-recovery solution. No destructive restore drill was attempted against development or any other project.

## Client Source Boundary

The supplied workbook remains unchanged and was not imported. Its financial/contact data is now explicitly excluded from Git, while the original file remains in `files/` locally.

- Bytes: 141,076.
- SHA-256: `83baeb6f45eb798267578fe7b0c3cf6e753fc8cf1351591c54059184ded0dea0`.
- The five expected sheets are present. Formula counts, from read-only OpenXML metadata: Stock List 62, Monthly Ledger 33, Party Ledger 0, All Party Account 129, Due Lists 5. All these formula cells have cached-value elements; that is not proof of current recalculation/correctness.
- Styled/serialized worksheet extents exceed some business-data ranges quoted by the analysis. Batch 2 must distinguish nonempty business records from formatting-only cells rather than blindly importing the maximum worksheet row.
- The analysis-reported due totals, stock blocks, missing costs and October difference have **not** been independently recalculated in Batch 0. Detailed source-cell/formula provenance and financial exception profiling remain Batch 2.
- Never substitute selling price or numeric zero for missing approved inventory cost, or choose between conflicting due schedules without client approval.

## Plan Review Changes

The supplied Update 13 plan was refined, not replaced:

1. Corrected its companion-analysis filename to the actual supplied file.
2. Retained FIFO with expiry awareness as already confirmed.
3. Added explicit restoration of the approved sidebar/header/mobile drawer before more operational screens. The temporary foundation shell remains an unfinished migration; it was not changed by this audit.
4. Distinguished current reconciled stock from the latent Return/Adjustment mismatch.
5. Allowed local draft/validation/synthetic work while client data/policy is pending, without allowing real financial postings.
6. Kept payroll/commission/automatic GL fully visible in scope. First-release versus signed later-phase timing is unresolved.

## Batch Evidence And Next Gates

| Item | State |
| --- | --- |
| Read-only environment/schema/source audit | Executed; repeatable utility and redacted local evidence available. |
| Client requirement coverage | Created for all source-map IDs plus opening, UI and operational gates. |
| Local regression | 88 pass, 12 hosted suites explicitly skipped; no hosted mutation suites run. |
| Release checks | Pass: routing, headers, mode isolation, credential/artifact hygiene, migration order and lock agreement. |
| Build/API typing/lint | Pass: `npm run build` includes frontend and NodeNext API typing; `npm run lint` passes. |
| Live-demo before/after metadata/hash | Same production deployment ID/SHA/branch and READY state; homepage remains HTTP 200 with the identical SHA-256. Workbook SHA-256 also remains identical. |
| Provider isolation | Not applied; explicit owner approval is required. |
| Owner MFA / legacy administrator disposition | Pending owner action/approval. |
| Hosted migrations / opening-data posting | Not authorized and not attempted. |
| Database plus object-byte restore | Not demonstrated; needs an approved isolated destination. |
| Whole Update 13 / staging / cutover / full client scope | Not complete. |

Re-run the read-only schema audit intentionally with:

```powershell
npx tsx scripts/update13-readonly-audit.ts --hosted-read-only
```

It prints aggregate/boolean evidence and saves redacted JSON under ignored `artifacts/update13/`. It must never be repurposed to mutate records. Vercel metadata and HTTP snapshots were separate GET-only inspections; no secret environment values were decrypted.

Final GET-only comparison at 19:26 Bangladesh time: live deployment remains `dpl_6j2aVvCUeLzNiqy8Jd7KD4h9s3s9` at `931ba5c`, homepage hash remains `5016855fd50177148dc0415f2f81143c5a2c844e3fc0fe4cec11c2a51aec7b98`, and the workbook hash is unchanged. This proves the observed deployment/homepage did not change during this batch; it does not claim every live business record was independently snapshotted or audited.

### Affected Files And Rollback

New: `client_requirement_coverage.md`, this report and `scripts/update13-readonly-audit.ts`. Updated: the supplied Update 13 plan's review amendments, `.gitignore` for the private workbook, and progress/setup pointers. There is **no migration**, new business API, application layout change or hosted rollback to perform. Reverting local audit/document changes would not change any hosted business state. Retain the untouched original workbook and private evidence.

### Next Small Batches

1. Owner approves a demo isolation strategy before any push/provider change. Keep all other work local until then.
2. Restore existing frontend layout parity without changing persistent services or enabling AI/mock data. Prepare/test outbox, least-privilege and bounded-query changes locally; hosted application requires separate reviewed authorization.
3. Implement the read-only workbook profiler and draft validation/preview using exact cell provenance and synthetic tests. No real source posting.
4. Review source-aware opening/condition/return architecture and migrations with independent approval rules. Actual cost/dues/claim/GL postings remain client-gated.

Owner decisions still needed: whether/how to isolate demo tracking, who owns the unresolved administrator record, approved staging/restore targets and credential-rotation timing. Client decisions: authoritative opening schedules/cutover and approved costs; disposition/credit/refund/write-off approvers; payroll/commission/GL first-release timing and policies. Silence does not approve these decisions.
