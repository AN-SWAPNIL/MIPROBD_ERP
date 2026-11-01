# Client Review And Production Readiness

Reviewed: 1 November 2026. This review takes precedence over older milestone counts and next-step notes in the setup guides. No database records, accounts, files, provider settings or deployments were changed by this review.

## Remediation Since The Initial Review

The statement above describes the initial read-only audit, not the subsequent authorized implementation. A separate Supabase **mipro-erp-uat** (`njbecypawzsuqiteooly`) and Vercel **mipro-erp** project now exist. The requested hostname is **https://mipro-erp.vercel.app**. Development records and the older websites are preserved; no development transactions or private evidence were copied into UAT. See [MANUAL_SETUP.md](MANUAL_SETUP.md) for current owner password/MFA, new-project SMTP, commercial hosting and company-data steps. The environment remains UAT, not full contracted-scope or production acceptance.

Subsequent work also isolates mock initialization, pages the foundation Sales workspace, scopes backups/credentials by environment, rejects cross-project administrative connections, records sanitized maintenance/reconciliation outcomes, and adds a private UAT restore rehearsal. Active Super Admin can self-approve; delegated independence remains enforced. Deployment, scheduler and browser evidence are kept in ignored `artifacts/private/uat-*` files. Only a successful verified result proves a particular check; script presence is not completion evidence.

UAT hosted checks now pass: real API/database connectivity, eight anonymous/forged-role denials, CSRF, disabled signup, public/login/product-detail screenshots at desktop/390px, and actual Vault-authenticated Supabase HTTP requests to all three maintenance endpoints. The three Cron jobs are active. One administrator and no operational/test business history remain in UAT. Human owner access, SMTP/company configuration and the full remaining engineering/production acceptance are still pending.

## Verdict

| Use | Ready? | Meaning |
| --- | --- | --- |
| Guided feature/design review | Yes, with disclosed limits | Demonstrate supported workflows and explain the outstanding items. The current staging site is not the latest local release. |
| Clean, independent client acceptance testing (UAT) | Not yet | Release the matching frontend/API into an isolated, deliberately populated UAT environment with working review policies. |
| Actual company operations | No | Remaining engineering, company configuration, recovery and business acceptance are launch gates, not optional presentation polish. |

There is substantial working backend functionality: real authentication/access controls, imports and cost allocation, receiving/FIFO, sales and collections, expenses, reports/printing, employee activity/check-ins, opening-data review/posting, stock controls, returns, supplier claims, approvals and payroll. This does **not** mean every Update 13 requirement is complete. See [the remaining implementation work](UPDATE13_IMPLEMENTATION.md#remaining-engineering-still-in-scope).

## Findings, In Priority Order

### 1. Current data is development history, not a client dataset

The read-only hosted audit found:

| Record | Total | Explicitly test-labelled |
| --- | ---: | ---: |
| Employees | 689 | 688 reserved test rows |
| Products | 99 | 99 |
| Suppliers | 62 | 62 |
| Customers | 82 | 82 |
| Stock batches | 130 | 130 |

There are also 55 import cases, 91 quotations, 91 orders, 86 deliveries, 66 invoices, 61 collections, 34 expenses and 228 stock movements. Two reserved test-labelled employee rows remain Active; that alone does not prove they have usable Auth accounts. Review them rather than silently deleting or treating them as client users.

Thirteen posted/reconciled opening schedules exist in this development history. They are not approval of the original client workbook: that workbook remains unchanged and unposted. Unlabelled records are not automatically genuine company data.

**Recommendation:** preserve this development database. Create a separate UAT Supabase project and later a separate production project. A second Vercel URL by itself does not isolate data. Do not truncate records, erase journals/audit, or hide selected test rows to make financially linked reports look clean.

### 2. Staging is behind the working copy and shares this database

- Stable staging: <https://mipro-erp-staging.vercel.app>, foundation mode, database connected. Anonymous account/demo-identity requests return 401.
- Its current release was deployed on 31 October, before the latest replacement-receipt and Office attachment updates. Deploy their frontend/API together; do not mix versions for business entry.
- The staging project is not Git-linked. Its release was uploaded from a dirty workspace; its base commit SHA is not a reproducible release manifest.
- The older <https://medical-supplier-erp.vercel.app> is intentionally a mock demo. Its Git production branch is `dev`; pushing that branch can deploy the old demo, not staging.

Review and commit the intended changes, tag the release, verify the deployment target and explicitly publish the coordinated staging update. A Vercel environment named Production inside the staging project is still only staging.

### 3. Financial/approval configuration intentionally blocks posting

There are **zero Approved ledger configurations and zero Approved shared approval policies**. Strict production posting correctly fails closed rather than inventing accounts, authorities or company values (`server/ledger/service.ts`). This means the current site is not ready for a client to independently finish all financial scenarios.

In isolated UAT, create clearly marked test configurations. Super Admin can configure and approve their own work; separate named preparer/verifier/approver identities are needed only to test delegated restrictions. In production, use the client's approved chart, mappings, cash/bank accounts, opening date, balances and approval authorities. Never activate a regression-test chart as company accounting. Payroll also needs approved compensation/commission evidence and rules; employee GPS must not become an assumed attendance/payroll formula. See the current authority rules in [BACKEND_SETUP.md](BACKEND_SETUP.md#super-admin-authority).

### 4. Update 13 still contains real engineering gaps

- Formal source-linked corrections/reversals for posted opening schedules, stock controls, returns/refunds and payroll; a general manual journal is not a substitute.
- Customer repair/replacement/claim tracking and capitalization of additional supplier replacement costs. Current replacement receiving requires zero-additional-cost attestation.
- Separate-worker race acceptance for the remaining stock/return/supplier/payroll flows; serial rollback tests are not proof of concurrent safety.
- Foundation Sales now uses paged references and whole-scope totals rather than the old 500-record overview. Remaining module query-bound review is still required.
- Linked-file retention/legal holds and external alert delivery remain. Maintenance endpoints now save actual outcomes, and UAT has a Vault-backed Supabase Cron setup script; require its successful scheduler record and observed runs before calling it unattended processing. The older development-backed staging environment has not been silently reconfigured. SMTP alone does not schedule queued jobs.
- Production malware scanning/quarantine for business uploads. Current MIME/package/hash checks are useful, but not antivirus.
- Remediation/risk review of **8 moderate production dependency advisories** (ExcelJS dependency chain); zero high/critical were reported. Do not blindly apply the suggested major downgrade.

These are implementation tasks, not things the client can fix by checking a dashboard setting. AI and a dynamic public CMS are deliberately deferred and are not launch requirements by themselves.

### 5. Recovery is backed up locally, not proven recoverable

Database/backup integrity checks pass, and the authorized private file capture contains 49 objects across buckets (25 unique content files). However, **21 historical test-named document references have no corresponding Storage object metadata**. Retain and explicitly reconcile these exceptions; never fabricate replacement evidence.

An isolated database **and actual file-byte restore**, offsite copy, access/encryption policy, and agreed recovery point/time objectives remain unverified. Supabase database backups do not contain Storage object bytes, so a database-only backup is insufficient. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups).

### 6. Security/ownership acceptance remains

The configured owner has one verified authenticator factor; do not redo their setup unnecessarily. A different legacy administrator mapping still needs owner review. Verify all intended privileged users and break-glass ownership independently.

Credentials previously pasted into chat still require confirmed rotation before production reuse. The plaintext password comment was removed with a value-preserving check; this did not rotate credentials. New UAT credentials are independently generated and kept private. Do not place migration credentials or Supabase secret keys in browser variables or commit them.

## Keep Mock Files, But Separate Their Purpose

**Keep fixtures and test helpers in Git** for regression tests and a separate disposable demo. They are not production business data, and deleting their files does not remove existing PostgreSQL records.

Foundation mode has real authentication and a fail-closed API boundary; it does not serve demo identities. An explicit foundation frontend build scanned across 145 JavaScript chunks contained none of the 11 checked mock identity email tokens and produced no source maps. This is a narrow check, not a complete secret/security audit.

`server/index.ts` now dynamically initializes only the selected backend; foundation requests do not construct mock state. Source control still retains fixtures/tests, and deployment tracing may package inactive branches. That is distinct from exposing demo identity endpoints or initializing fixtures in foundation mode.

Keep legitimate static public product/company content and brochure assets. Those are not disposable test fixtures. In foundation mode the public website is intentionally static: ERP product edits do not automatically publish to the website. The inquiry form prepares Email/WhatsApp handoff; it does not claim to store or send a CRM inquiry.

### What a clean client review should contain

Clean does **not** mean empty. A blank database gives empty reports and cannot demonstrate the connected ERP.

Use approved company branding/reference products plus a small, explicitly labelled UAT transaction set, isolated from development and production. Include named review users with the seven role boundaries; demonstrate owner self-approval and delegated independent approvals separately. Provide enough history to test date/customer/supplier/product/employee filters and both print modes.

Acceptance scenarios:

1. Multi-product import, all five cost allocation methods, approval/finalization and partial receiving; exact cost/stock reconciliation.
2. FIFO, visible expiry, held/rejected stock exclusion and reasoned authorized override.
3. Quotation to order, delivery, invoice, partial collection and customer dues; matching cash/bank and financial reports.
4. Expenses/TA/DA without changing landed cost, plus supplier due/payment reconciliation.
5. Employee daily/weekly/monthly activity, own-user check-in, optional photo, denied location permission and scoped reports.
6. Supported stock/return/supplier/payroll approvals and privacy, with unsupported correction/replacement cases explicitly recorded as not accepted.
7. Role/access changes, direct-URL denial, CSV and A4 digital/preprinted letterhead printing.

Production should start with only verified masters, legitimate employee accounts and approved opening schedules. Preserve/archive the existing source/history separately; do not bulk copy development transactions into production.

## Map And Field Devices

No Google Maps key or additional map service is required for the current OpenStreetMap raster map. The visit map loads on demand and shows a **saved reported check-in**, not live tracking or tamper-proof proof of attendance. Employee photos remain optional and private.

Before field use:

- The hosted policy currently has **privacy approval false** (version 1, configured photo retention 30 days). Production check-in creation therefore correctly returns 423 until approval is recorded; seeing the map component does not mean the employee pilot is enabled. Do not toggle this on without the company's actual privacy/retention decision.
- Record company privacy/retention approval in the visit policy, confirm customer site pins, thresholds, access and missing-location handling. A configured retention period does not itself implement file-deletion/legal-hold jobs.
- Test actual Android/iPhone HTTPS location/camera permissions, denied permissions, accuracy, slow connection and optional-photo paths. Browser geolocation requires a secure context and user permission. [Geolocation documentation](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API).
- Keep visible map attribution and normal browser tile caching/referrer behavior. OSM's public tile service is best-effort with no SLA; no bulk/offline prefetch is permitted. A contracted provider is an optional reliability decision, not a required Google subscription. [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).
- Engineering: unify the public office map with the recorded-visit provider configuration. `PublicOfficeMap.tsx:8` still uses the old subdomain tile URL; the recorded map uses the canonical URL. `.env.example` documents the optional recorded-map settings, not a global provider switch.

## Owner / Client Actions

| Action | Needed when |
| --- | --- |
| Approve a separate UAT database/project, access owners and any service cost | Before clean self-service review. Nothing new was provisioned during this review. |
| Confirm exposed credential rotation and resolve legacy/test account ownership | Before production; do not send new secrets in chat. |
| Supply approved product/customer/supplier lists, actual stock/cost/dues/balances, chart and named authorities | Before real opening approval and posting. Do not post the original workbook without reconciliation. |
| Confirm company-controlled hosting/Supabase ownership, billing, domain/DNS and backup responsibility | Before company launch. Personal development ownership is not a handover plan. |
| Confirm SMTP sender/domain authentication, then receive/click an invitation and recovery email from the final HTTPS target | SMTP already exists; this is final delivery/link acceptance, not a request to repeat its setup. |
| Approve field privacy/retention and test actual phones and the physical A4 printer | Before employee rollout; printer non-printable borders cannot be eliminated by CSS alone. |
| Sign off the UAT results, actual openings, financial reconciliation and recovery objectives | Before cutover. |

Company email delivery should use the provider's authenticated sender/domain controls. [Supabase SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp). Confirm a commercially appropriate Vercel plan: Hobby is restricted to personal, non-commercial use; this review did not verify or change your billing plan. [Vercel Hobby documentation](https://vercel.com/docs/plans/hobby).

## Environment And Release Order

There is no need to buy a separate Express server or install Docker for this architecture. Vercel hosts the frontend/API; hosted Supabase provides Auth/Postgres/private Storage. Separate environments need separate database/Auth/Storage credentials, not necessarily separate application repositories.

For UAT/production, explicitly configure both `ERP_BACKEND_MODE=foundation` and `VITE_BACKEND_MODE=foundation`, both demo flags `false`, `DEMO_DEPLOYMENT=false`, correct HTTPS `APP_URL`, restricted runtime DB credentials, public browser Supabase URL/key and server-only secret key. Do not deploy the migration URI. Enforce MFA/restricted database/approved GL requirements. The root prototype environment is not the production template merely because `npm run build` succeeds.

1. Preserve development records/backups and agree on the isolated UAT target.
2. Provision its schema/restricted role/private buckets/Auth redirects and curated UAT data/configuration. Do not connect regression tests to it.
3. Review the full working tree, commit/tag a reproducible release and deploy matching frontend/API to the verified project. Do not accidentally deploy the old public demo by pushing `dev`.
4. Run real HTTPS role-based UAT with named reviewers, file downloads, report/print parity and mail/device checks. Log unsupported workflows rather than claiming completion.
5. Complete the outstanding engineering and dependency/operational work, rehearse isolated recovery, then configure verified production masters/openings and obtain sign-off.

## Checks Performed For This Review

- Fresh read-only hosted audits: 67 matching migration hashes, 89 RLS/private ERP tables, restricted runtime with no table ownership, zero detected stock quantity/value reconciliation mismatch across 130 batches/228 movements. Original client workbook unchanged/unposted.
- Readiness: zero failures, two warnings (private password comment; absent approved GL mapping). This is not a production certificate.
- Local/staging health and anonymous-denial checks; Vercel target/release/mode metadata, Auth configuration dry-run, production dependency audit, and explicit foundation frontend build/token scan.
- Fresh `npm test`: **152 passing local tests, 25 hosted suites skipped**, zero failures; full lint, release checks and whitespace checks pass. Earlier feature verification includes separately opted-in hosted and desktop/mobile attachment/business-flow checks. This review did not rerun those mutating hosted suites or claim a full new seven-role UAT.
- The additional read-only audit initially encountered provider failures; a later retry completed and confirmed the counts and unapproved visit policy above. No provider credentials/errors were printed, and no production setting was changed to bypass the failure.

Repeat the aggregate data audit without mutations:

```powershell
node --env-file=artifacts/private/runtime-database.env --import tsx scripts/client-review-audit.mjs
```

The script prints counts/policy states only, uses read-only transactions, and does not print identities, amounts, secrets or signed URLs. Test labels are audit evidence, never a deletion rule. A failing provider check intentionally withholds raw connection errors.
