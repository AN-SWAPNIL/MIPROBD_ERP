# MIPRO ERP Backend Setup

Updated: 2 November 2026. This replaces the old root `.env` setup instructions; earlier milestone versions remain in Git history.

## Architecture

- React/Vite frontend and Express API deploy together on Vercel. No separate Express host or Docker is required for the current hosted setup.
- Hosted Supabase provides Auth, PostgreSQL and Storage. The API uses a restricted database role; setup/migration credentials stay local.
- The public company website is static. AI is deferred.
- Current UAT is review-ready infrastructure, not certification of the entire production scope. See [UPDATE13_IMPLEMENTATION.md](UPDATE13_IMPLEMENTATION.md) and [MANUAL_SETUP.md](MANUAL_SETUP.md) for remaining work and company acceptance.

## Environment Selection

| Branch | Site | Supabase | Local URL |
| --- | --- | --- | --- |
| `prototype` | https://mipro-erp-prototype.vercel.app | None; temporary mock data | localhost:5173 |
| `dev` | https://mipro-erp-staging.vercel.app | `hyttuapvvqqxcyhojbwq` | localhost:5178 |
| `main` | https://mipro-erp.vercel.app | `njbecypawzsuqiteooly` | localhost:5180 |

`npm run dev` selects the branch's configuration. Feature branches explicitly select `npm run dev:staging` or `npm run dev:uat`. Existing named branches reject a mismatched environment.

The active configuration files are **ignored local files**, not branch-committed secrets:

| Purpose | File |
| --- | --- |
| Staging setup | `artifacts/private/staging.env` |
| Staging restricted runtime | `artifacts/private/runtime-database.env` |
| UAT setup | `artifacts/private/uat.env` |
| UAT restricted runtime | `artifacts/private/uat-runtime.env` |
| Prototype defaults | Non-secret `config/prototype.env` on `prototype` |

Root `.env` and `.env.local` are not loaded by the API, Vite or setup tools. Previous root files were preserved under ignored `artifacts/private/retired-root-env` and removed from the repository root. Do not restore them as active configuration. `.env.example` remains a reference template.

## Credentials

The private files on this machine are already populated. For a fresh clone, obtain the correct configuration securely and place it at the paths above. Never upload a whole private setup file to Vercel or commit it to Git.

- `SUPABASE_URL` and its publishable key identify the correct project. Browser/server public configuration must match.
- `SUPABASE_SECRET_KEY` is server-only.
- `DATABASE_URL` and `DATABASE_MIGRATION_URL` are local administrative setup/migration connections. Copy actual pooler hosts from Supabase **Connect** and URL-encode reserved password characters.
- `DATABASE_RUNTIME_URL` is the restricted `mipro_runtime` transaction-pooler connection. This is the deployed database credential, not the broad administrative URI.
- `UAT_DATABASE_PASSWORD` is a local provisioning/recovery value, never an ERP user's login password or a Vercel runtime variable.
- `CRON_SECRET` authenticates scheduled jobs. Its UAT value must match the scheduled worker's private Vault configuration; never independently blank or rotate one side.
- `ERP_REQUIRE_MFA`, `ERP_REQUIRE_RESTRICTED_DB` and `ERP_REQUIRE_LEDGER_CONFIGURATION` are enabled on hosted real ERP environments. UAT also enables strict local rehearsal.
- `DEMO_DEPLOYMENT`, `DEMO_MODE` and `VITE_DEMO_MODE` are false for real ERP and true only for prototype.

Never put secrets, database passwords or administrative URLs in `VITE_*`. Do not share passwords, authenticator QR codes, setup links or signed private document URLs in chat. Rotate previously exposed development credentials before production reuse.

## Run And Check

Use Node.js 24 and the repository lockfile:

```powershell
npm ci
npm run check:environment
npm run dev
```

`dev:api`, `dev:web` and `server` also select the branch-specific environment. Stop existing servers before reusing their ports. Local UAT writes affect the same database as the hosted UAT website.

Read-only infrastructure/configuration checks:

```powershell
npm run db:verify
npm run check:backend
node scripts/configure-branch-deployments.mjs
```

Ordinary builds and local unit tests require no real credentials:

```powershell
npm run lint
npm test
npm run check:release
npm run build
```

Hosted integration tests are explicitly opt-in. Inspect the selected suite's flags and target before running it; skipped hosted tests are not acceptance evidence. No test should use real company rates, balances or personal MFA as a fixture.

## Database Maintenance

```powershell
npm run db:backup
npm run backend:storage-backup
npm run backend:verify-backups
npm run db:generate
npm run db:migrate
```

These commands select the current branch's private configuration. `db:generate` produces local migration files; review them before use. `db:migrate` without `--apply` does not apply changes. Apply approved additive migrations with `npm run db:migrate -- --apply`; its backup and project checks must pass first. Never edit applied migrations, truncate existing records or treat a new deployment as a database reset.

Existing projects are already provisioned. Initial runtime-role/bootstrap/provisioning tools are privileged operations, not steps to repeat on every checkout. Super Admin login accounts are created through the bootstrap/invitation flow, never by putting a default password in an environment file.

## Deployment

Each Vercel project is linked to its own production branch: `prototype`, `dev` or `main`. Preview deployments are disabled; project/branch/database checks prevent cross-environment builds. Each stable project uses its own Vercel **Production** variable scope, including staging.

Develop/test on `dev`; apply matching staging migrations explicitly. After acceptance, back up UAT, apply matching additive UAT migrations, then merge `dev` into `main` and push. Git pushes do not run migrations automatically. Do not merge prototype into the real backend branches.

The explicit UAT snapshot/deploy scripts remain a fallback. Never run a bare `vercel deploy`: the root CLI project link is not chosen from the Git branch. No paid plan upgrades or ownership transfers are performed automatically.

Supabase Cron/pg_net/Vault run the configured UAT invitation, queue-health and reconciliation jobs. Keep their credentials private. Recent successful job receipts, SMTP inbox acceptance and external alert delivery are distinct checks; an enabled flag alone is not proof a job ran.

## Manual Acceptance

Super Admin can manage company setup and self-approve valid policies/configuration. Named staff can prepare and act within delegated permissions; assigning a broad owner role is not a substitute for limited access.

You still personally set your password/authenticator, configure SMTP in the **new UAT project**, verify actual mail/link delivery, supply source-backed company settings/openings, approve commercial hosting/ownership, accept field privacy/retention, and test actual phones/printers. OpenStreetMap needs no Google key for the current map; photos remain optional. Full guidance: [MANUAL_SETUP.md](MANUAL_SETUP.md).

## Housekeeping

`npm run cleanup:test-artifacts` previews disposable screenshots and browser-build folders; add `-- -Apply` to remove them. Credentials, backups, release/recovery evidence, original requirements, worktrees, public assets and logs are protected. Cleanup never deletes company database records.

See [BRANCHES_AND_ENVIRONMENTS.md](BRANCHES_AND_ENVIRONMENTS.md) for branch operations and [RENAME_PROJECT.md](RENAME_PROJECT.md) for safely renaming GitHub/local folders. Keep the existing database references and Vercel domains during a repository rename.
