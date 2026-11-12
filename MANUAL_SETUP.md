# MIPRO UAT And Production Handover

Updated: 13 November 2026.

## Form And Inventory Update

The target branch is `dev`. This release requires additive migration `0070_flexible_masters_and_purchases.sql` before running the new API against an existing database. It preserves existing records and adds private product images, reusable dropdown options and purchase receipts.

The owner resumed and restarted `mipro-erp-dev`, resolving the shared-pooler tenant error. The development database was backed up, migration `0070` applied and the restricted runtime grants verified: **71 migrations and 93 private tables**. Existing records were preserved. UAT was not migrated or changed. To repeat development verification on `dev`:

```powershell
npm run db:migrate -- --apply
npm run backend:runtime-database -- --apply
node --env-file=artifacts/private/staging.env --env-file=artifacts/private/runtime-database.env --import tsx --input-type=module -e "process.env.RUN_HOSTED_FLEXIBILITY_TESTS='true'; await import('./server/operations/flexibility.hosted.test.ts')"
npm run smoke:flexibility
```

The migration and restricted-role scripts back up the selected database first. The hosted test is explicitly restricted to development and creates synthetic test records, not client/UAT data. Add `process.env.RUN_LC_BROWSER_TESTS='true';` before the import to exercise real desktop/mobile LC save/reload and private product images. The separate browser smoke test intercepts APIs and does not change real records. Restart the local API after migration. No new environment variables are needed. Apply and verify the same migration/role grants against the separately selected UAT environment before deploying the matching code there.

Verified against development: LC/TT/Pending payloads and mode changes, private import/product uploads, purchase stock/payable reconciliation, FIFO, protected costs, duplicate prevention and atomic rollback. The existing import-to-receipt suite and all **80 available SQL reports** also passed. Browser checks cover desktop and 390px mobile.

- Import stages: PO/Draft, PI & Products, LC/TT, Production, Shipment, Port & Documents, Costs & Allocation, Landed Cost, Receiving, Activity & Closure. Browsing a stage does not advance its business status.
- Supplier/product/customer/account pickers offer in-place creation only with the relevant permission. Expense categories, cost presets, units, product families, countries, currencies, container types, document types and cost categories are editable where appropriate. Roles, payment/account classifications, statuses, FIFO batches and allocation algorithms remain controlled choices, not arbitrary new options.
- Product/profile photos use file upload, JPG/PNG/WebP, strictly below 1,000,000 bytes. Files are private; images are decoded/validated before attachment. No pasted product-image URL is required.
- **Inventory > Add Inventory** posts a purchase receipt with cost and batch traceability. It creates FIFO stock, movements and the matching supplier payable together. Record actual supplier payments under Accounts; the receipt itself does not move cash. The new Purchase Receipts report uses these same saved records.
- Delegated inventory purchasers need Inventory posting, sensitive-cost editing and supplier-reference access (Supplier or Import view). Supplier creation/editing remains separately controlled. Ordinary warehouse users cannot post a purchase without cost-entry authority.
- LC entry keeps **Bank amount** and **Other amount** separately, in the chosen currency. The API calculates their total; neither amount creates a cash payment or adds an extra landed cost. Older LC totals remain unchanged until their actual breakdown is entered.
- Editing a draft/pre-production import now selects the actual supplier master, including in-place creation. The supplier identity and name snapshot change together with an audit entry. Supplier changes are blocked after production starts and finalized records remain protected.
- Refund, salary and advance/loan account pickers also support authorized in-place account creation. Collection account creation uses the selected payment method's required account type. Chart accounts can be created inside journal/mapping pickers only with ledger-management authority; an approved mapping still cannot be rewritten.
- Changing currency clears the unsaved exchange rate instead of carrying a different currency's rate forward. BDT uses 1. Invalid or scientific-notation numeric inputs produce validation errors rather than crashes; quantities and manual allocations retain exact decimal checks.
- Required inputs are marked red with an asterisk. Validation identifies fields and numbered line items. Technical response dumps, SQL/provider errors, private URLs and credentials are not shown in error panels/toasts; service failures provide a request reference for support. The server logs bounded diagnostic codes, not submitted passwords, tokens or raw database errors.

The final local regression suite passes **193 tests**, with 30 additional hosted suites skipped unless explicitly enabled. The expanded desktop/390px smoke covers nested creation, payment-type filtering, safe error display, import documents, currency changes and inventory purchases. Separate hosted checks use clearly labelled development-only records, retaining immutable audit/history and removing their temporary Auth identities.

## Password Recovery

An emailed recovery link verifies the email but does not bypass an already enrolled authenticator. The reset screen now requests its six-digit code before saving a new password, including for Super Admin. A new privileged account without an enrolled authenticator sets its password first and completes required MFA after sign-in. Recovery cannot open ERP records, enroll a replacement factor or remove MFA.

Use a new, unique password of 12-128 characters. Reusing the current password, weak passwords, expired sessions and required authenticator verification have distinct messages. A rejected password can be retried within the same valid recovery session. Success revokes the account's ERP sessions, clears the old browser login and returns to Sign In with confirmation. Provider logs contain only the operation, error code and status, never passwords, links or tokens. If the authenticator is lost, use an authorized account-recovery procedure; requesting more links will not remove MFA.

Development-only verification (temporary identities, no email delivery):

```powershell
node --env-file=artifacts/private/staging.env --env-file=artifacts/private/runtime-database.env --import tsx --input-type=module -e "process.env.RUN_HOSTED_RECOVERY_TESTS='true'; process.env.RUN_RECOVERY_BROWSER_TESTS='true'; await import('./server/foundation/password-recovery.hosted.test.ts')"
```

## Branch Selection

The repository separates `prototype` (mock demo), `dev` (real staging) and `main` (client UAT). See [BRANCHES_AND_ENVIRONMENTS.md](BRANCHES_AND_ENVIRONMENTS.md). `npm run dev` selects an ignored private credential file from the branch, not the old root `.env`. Each Vercel project is configured for its matching Git branch only, with previews disabled. These controls do not complete the production engineering listed below.

## Current Target

- Client UAT: **https://mipro-erp.vercel.app**. Vercel project: `mipro-erp`.
- Isolated Supabase UAT: `njbecypawzsuqiteooly` (`mipro-erp-uat`, Mumbai).
- The existing development database, `mipro-erp-staging.vercel.app` and public mock demo are preserved.
- UAT is not real company production. It starts with the administrator and system defaults, not development transactions, fake customers, stock or balances. Empty operational reports are expected until legitimate records are entered.

**Verified:** deployment `dpl_HNhf4Scujh6KxpSjhBMKxxe3dU5K` is READY. Hosted API/database, eight anonymous/forged-role denials, CSRF, disabled public signup and 12 desktop/390px captures pass. All three maintenance endpoints returned 200 through actual Supabase pg_net requests. The three Cron jobs are active. No temporary users or business fixtures were added to UAT. Local build/types, lint, release checks and 164 tests pass; 27 hosted suites remain opt-in, not silently counted as passed.

## You Must Do These

| Task | Where / what to do |
| --- | --- |
| Set your UAT password and authenticator | Open the **newest** `administrator-invitation-*.txt` in the ignored local folder `artifacts/private/uat-owner`. Open its expiring link privately, choose your own password, then finish Account Verification/MFA. This is a separate identity from development. Never paste the link, password, QR or codes into chat. |
| Configure SMTP for the new project | In **Supabase > mipro-erp-uat > Authentication > Email / SMTP**, enter your Gmail sender, username and existing App Password, host `smtp.gmail.com`, port `465`. Development SMTP was not copied and cannot be assumed to work in UAT. Do not send the App Password here. For company production, use an appropriate transactional provider/company sender with its DNS verification. |
| Check actual email delivery | After SMTP setup, use Forgot Password for your own administrator email. Confirm inbox delivery and that the link returns to `https://mipro-erp.vercel.app/reset-password`. Then invite a real employee whose address you are authorized to use. Provider acceptance alone is not inbox acceptance. |
| Approve hosting/billing and ownership | The Vercel team currently uses **Hobby**. [Vercel restricts Hobby to personal, non-commercial use](https://vercel.com/docs/plans/hobby); upgrade/transfer to the appropriate company Pro plan before commercial client use. Choose the company's Supabase production plan, ownership, backup retention and recovery requirements. No paid upgrade was made automatically. |
| Supply company configuration and verified data | Actual product variants, suppliers/customers, cash/bank masters, chart/mappings, cutover date, approval limits, compensation/commission evidence and source-backed opening costs/balances. Super Admin may configure and self-approve. Do not enter development test figures as company openings. The supplied workbook still has unresolved source/cost issues. |
| Accept field privacy and physical-device behavior | Before enabling field check-ins, agree access/retention/handling of missing location and validate site pins. Photos are optional. Test HTTPS location/camera on actual phones and A4 output on the client's printer. The OpenStreetMap map needs no Google API key. |

You do **not** need Docker, another Express host, another public signup page, or another approval administrator. AI remains deliberately deferred.

## Invitations And Email Delivery

Employees > Invitation Delivery offers **Cancel invitation** for pending employees, followed by **Delete invitation** for cancelled/inactive onboarding. Both use confirmation only, with no reason field. Cancellation revokes ERP sessions and blocks old invitation links from activating the account. Deletion removes both the invitation and employee from their lists, including directory search, selectors and the employee-list report. Hidden onboarding cannot be edited/reactivated through its old account URL. Underlying audit/linked records are retained rather than broken by a physical row deletion. Accepted employees use Employees > Access > Inactive instead. An already delivered/in-flight email cannot be recalled.

To invite deleted, never-accepted onboarding again, use **Invite Employee** with the same email and Employee ID. The existing ERP record/audit trail is retained, its old setup identity is retired, and a fresh invitation is queued. Old access overrides/capabilities do not carry into the new assignment. Provider failures leave the deleted account closed and retryable. Pending duplicates still use Retry invitation; active or previously accepted employee accounts are not reset through this path.

UAT SMTP was verified on 2 November using Gmail sender `contact.miprobd@gmail.com`; the provider accepted the existing invitation test. Acceptance does not guarantee inbox placement. Use the full Gmail address as the SMTP username and its App Password, never a regular Google password. If a message lands in Spam, mark the expected invitation **Not spam**. Its exact classification needs Gmail's **Show original** headers; do not share setup links, tokens or passwords. For a company-domain transactional sender, configure the provider's SPF/DKIM and DMARC records and verify mail alignment. Do not add records for a domain you do not own or assume a template change guarantees inbox delivery. See [Google's sender guidance](https://support.google.com/mail/answer/81126) and [Supabase SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp).

## Private Files Already Prepared

| File | Purpose |
| --- | --- |
| `artifacts/private/uat.env` | UAT setup/migration credentials and public browser configuration. Local only; never upload this whole file. |
| `artifacts/private/uat-runtime.env` | Restricted runtime database URI. Its server-only value, not the migration URI, is configured in Vercel. |
| `artifacts/private/uat-owner/` | Expiring owner setup links. No personal password/MFA was set by the agent. |
| `artifacts/private/uat-vercel.json` | Verified project/hostname/database relationship. No database passwords. |
| `artifacts/private/uat-release.json` | Exact source-file hashes and release snapshot location. The working tree is not yet a committed release. |
| `artifacts/private/uat-deployment.json` | Deployment ID and source hash. Check its verified readiness and the hosted smoke result. |
| `artifacts/backups/<project-ref>/` | Project-separated database and object captures. Development evidence is never copied into UAT. |

Never put database passwords, migration URIs, Supabase secret keys or `CRON_SECRET` in `VITE_*` variables. Do not paste them into chat. Rotate the previously exposed **development** credentials before any production reuse; the new UAT credentials are independently generated.

## Already Automated

- Environment-isolated runtime/bootstrap paths and database-project checks prevent accidental development/UAT mixing.
- Additive migrations and restricted database grants preserve existing records; private Storage and disabled public signup are configured.
- The release snapshot rejects private workbooks, credentials and backups, hashes every source file, and deploys only the explicitly verified UAT project.
- Authenticated worker, queue-health and source-reconciliation endpoints save sanitized, append-only results. Settings > Launch Checks distinguishes recent observed success from merely configured credentials.
- Scheduler setup uses hosted Supabase Cron/pg_net and Vault, not a local process or Vercel Hobby's daily-only Cron. Verify the actual successful setup record in `artifacts/private/uat-scheduler.json`; an endpoint or script alone is not proof a schedule is running.
- Backup checks verify hashes and linked objects. The UAT rehearsal restores typed rows to a rolled-back scratch schema and restores synthetic private file bytes. It does **not** certify full-project recovery, Auth/role/trigger restoration, offsite recovery, or restoration of real company history.

## Remaining Engineering Is Not Your Manual Setup

The full contracted scope is **not yet production-certified**. [UPDATE13_IMPLEMENTATION.md](UPDATE13_IMPLEMENTATION.md#remaining-engineering-still-in-scope) tracks source-linked corrections of posted openings/counts/returns/refunds/payroll, customer repair/replacement handling, additional-cost supplier replacements, remaining true-worker race tests, non-sales pagination, linked-file retention/legal holds, malware scanning/quarantine, alert delivery and a full isolated project/offsite restore.

These are code/operational deliverables, not things that become complete by configuring SMTP or having Super Admin self-approve. Existing unsupported corrections remain blocked; do not use manual journals to disguise them as implemented workflows. Use UAT for review, not real company posting, until these and company acceptance are completed.

## Updating This UAT Site

From the project root, after reviewing/testing changes:

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run check:release
node scripts/prepare-uat-release.mjs
node scripts/deploy-uat.mjs --apply
```

Normal promotion is `dev` (staging) -> `main` (UAT), using separate Git-linked Vercel projects. Only `prototype` updates the old public demo. Explicit UAT snapshot commands remain a manual fallback. The root `.vercel` link remains the earlier staging target: never run a bare `vercel deploy`, which does not choose a project from the Git branch.
