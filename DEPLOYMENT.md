# Staging Deployment

## Current Client UAT

The new isolated client-review target is **https://mipro-erp.vercel.app** (Vercel `mipro-erp`, Supabase `njbecypawzsuqiteooly`). [MANUAL_SETUP.md](MANUAL_SETUP.md) is the current handover, manual checklist and deployment guide. No development business data were copied into UAT. This is not the earlier staging URL and is not certification of every remaining production requirement. Hosted validation results and exact source hashes are kept in ignored `artifacts/private/uat-*` metadata.

The sections below describe the earlier development-backed staging deployment. Its existing URL and database remain unchanged.

Current client-review/production verdict and launch checklist: [CLIENT_REVIEW_READINESS.md](CLIENT_REVIEW_READINESS.md) (1 November). This URL shares the development database; a separate Vercel project alone does not isolate client data. Do not reset existing records to make a clean demo.

URL: https://mipro-erp-staging.vercel.app

Verified deployment: `dpl_FKxukuyZ8HP2SAJEDEYSK1VmeKsS` (Node 24, API region `bom1`). HTTPS health/database, real temporary-user login, role denial, logout/revocation and 1440px/390px landing/login/dashboard checks pass. Verification identities are cleaned up; existing stock/financial records are preserved. Local checks: 146 passing tests, strict TypeScript, lint and release checks. Private screenshots stay in ignored `artifacts/backend/staging/`.

This is the dedicated `mipro-erp-staging` Vercel project. Its Vercel **Production** environment provides the stable staging URL; it is not the live company release. The existing demo at https://medical-supplier-erp.vercel.app is unchanged. GitHub is not linked to the new project yet; this release was deployed from the current workspace without a Git push.

Local follow-up (1 November): replacement-receipt drafts, private optional inspection evidence and explicit submission are implemented after that release. Database migrations 0063-0065 are applied and keep the deployed submit-on-create path compatible. The new code is not on the staging website until the next approved deployment; do not confuse local verification with a redeployment.

A further local attachment update adds XLSX/DOCX/PPTX/CSV/TXT as private business documents. Migration 0066 and the development private-bucket allowlist are applied; no bucket was made public and no public/source-workbook bucket policy changed. The existing deployed frontend/API still need their next coordinated update to offer these types and download-only views. No Office preview service receives private signed URLs.

## Sign In

Open `/login` and use your existing administrator email/password. Privileged accounts must complete **Account Verification**: enter your current password, scan the authenticator QR code and enter its six-digit code. This personal setup cannot be completed for you. There are no default passwords or public administrator registrations.

Forgot-password/invitation redirects now support the staging `/reset-password` URL. Localhost reset URLs remain allowed. SMTP, templates and the other 14 unmanaged Auth settings were preserved.

## What Is Connected

- Vite frontend and Express API in one Vercel project; same-origin `/api` calls.
- Hosted development Supabase Auth, PostgreSQL and private Storage. Restricted database credentials are server-only; migration credentials are not deployed.
- Public website stays static. AI remains deferred. No new backend host or Docker is required.
- Database-backed edits persist. This shares the existing development database, not a disposable mock or a separate restored database. Do not enter real company transactions or reset existing records.
- MFA, role checks, private uploads, approval checks and required ledger mappings remain enforced. Posting may correctly be blocked until actual company chart/mappings and approval policies are configured. No synthetic policy or company balances were activated to bypass this.

## Deploy The Next Staging Update

The local `.vercel/project.json` now links **only to staging**. Confirm it still says `mipro-erp-staging` before deploying.

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run check:release
npm.cmd run build
node scripts/staging-source-check.mjs
vercel.cmd deploy --prod --yes --project mipro-erp-staging --scope answapnil2003-5154s-projects
```

Do not run that command against `medical-supplier-erp`. Do not push `dev` merely to deploy staging: the old project's Git integration may deploy that branch to the public demo.

Secrets are already configured for this staging project. If they change locally, review the fixed project target in `scripts/staging-configure.mjs`, then run `node scripts/staging-configure.mjs --apply`. It sends only its explicit allowlist through stdin, not command-line secret values. It never uploads a migration URI. `.vercelignore` and the source-manifest check exclude `.env`, private workbooks and backup/test artifacts.

## Diagnose Problems

Open Vercel > `mipro-erp-staging` > Deployments > latest deployment > Runtime Logs. `/api/health` must report `foundation` and `database: connected`. `/api/me` must return 401 without sign-in. If a deployment-specific URL shows Vercel Authentication, use the stable staging URL or `vercel.cmd curl /api/health --deployment DEPLOYMENT_URL`; do not disable protection.

The root TypeScript configuration explicitly sets ES2022, NodeNext and strict mode because Vercel separately compiles the API after the normal Vite build. This fixes the API compiler's old default-target/optional-DTO errors without disabling type checks.

The shared Vercel request adapter also removes the internal rewrite `path` from both the URL and Vercel's supplied query object. Without this, strict domain validators reject otherwise valid requests with 422. Regression tests cover the actual Express request shape, not just string rewriting.

## Before Real Company Production

Staging availability is not full Update 13 completion. `UPDATE13_IMPLEMENTATION.md` tracks remaining source corrections, repair/replacement and operational/recovery work. Owner MFA, administrator mapping review, actual company policies/openings, isolated restore/offsite recovery, field-device/privacy checks and business UAT remain launch gates. The existing historical missing test-file references remain documented, not fabricated.

The deployment install reported 18 moderate advisories including development tools; a production-only audit reports 8 moderate ExcelJS/archive/glob-chain advisories and no high/critical advisories. Do not run a forced downgrade automatically. Workbook input is bounded/validated, but dependency remediation remains part of the production security review.
