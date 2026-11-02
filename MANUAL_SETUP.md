# MIPRO UAT And Production Handover

Updated: 1 November 2026.

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

Employees > Invitation Delivery offers **Cancel invitation** for pending employees, followed by **Delete invitation** for cancelled/inactive onboarding. Both use confirmation only, with no reason field. Cancellation revokes ERP sessions and blocks old invitation links from activating the account. Deletion removes the invitation from the delivery list, not the employee or audit trail. Accepted employees use Employees > Access > Inactive instead. An already delivered/in-flight email cannot be recalled.

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
