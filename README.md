# MIPRO ERP

React/Vite/TypeScript frontend and Express serverless API, with hosted Supabase Auth, PostgreSQL and private Storage. Financial calculations use decimal strings and auditable source-linked postings. The public company website is static and independent of confidential ERP records.

## Environments

| Branch | Site | Backend |
| --- | --- | --- |
| `prototype` | https://medical-supplier-erp.vercel.app | Mock-only; no database |
| `dev` | https://mipro-erp-staging.vercel.app | Development Supabase |
| `main` | https://mipro-erp.vercel.app | Isolated client UAT Supabase |

Details: [BRANCHES_AND_ENVIRONMENTS.md](BRANCHES_AND_ENVIRONMENTS.md).

## Local Development

```powershell
npm ci
npm run check:environment
npm run dev
```

On `dev`, the launcher reads staging credentials and starts localhost:5178. On `main`, it reads UAT credentials and starts localhost:5180. Local UAT writes affect the hosted UAT database. Feature branches explicitly choose `npm run dev:staging` or `npm run dev:uat`.

Private configuration lives in ignored `artifacts/private` files, not Git. `.env.example` documents the variables. The files are already prepared on this machine; a fresh clone needs matching credentials supplied securely. Prototype has its own branch-specific instructions and demo accounts; this source tree never starts the mock API.

Root `.env` and `.env.local` are not loaded. `npm run cleanup:test-artifacts` audits disposable test images/build copies; add `-- -Apply` to remove them without deleting credentials/backups. Repository/folder renaming instructions: [RENAME_PROJECT.md](RENAME_PROJECT.md).

## Checks

```powershell
npm run lint
npm test
npm run check:release
npm run build
```

Hosted integration suites are explicitly opt-in. Skipped tests do not count as completed hosted verification. Apply additive migrations explicitly after a verified backup, not automatically on every Git push.

## Handover

- [MANUAL_SETUP.md](MANUAL_SETUP.md): administrator, SMTP and company acceptance.
- [BACKEND_SETUP.md](BACKEND_SETUP.md): platform setup and maintenance.
- [UPDATE13_IMPLEMENTATION.md](UPDATE13_IMPLEMENTATION.md): capabilities and remaining engineering.
- [CALCULATIONS.md](CALCULATIONS.md): calculation rules.
- [PRESENTATION.md](PRESENTATION.md): business walkthrough.

Client UAT is deployed, but the full scope is **not yet production-certified**. AI is deferred. Never commit credentials, private workbooks, setup links or backups, or put secrets in browser-prefixed variables.
