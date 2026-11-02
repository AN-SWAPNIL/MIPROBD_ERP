# Branches And Environments

| Branch | Purpose | Website | Data |
| --- | --- | --- | --- |
| `prototype` | Frozen mock-only sales demonstration | https://mipro-erp-prototype.vercel.app | Temporary synthetic records; no Supabase |
| `dev` | Real-backend staging and integration | https://mipro-erp-staging.vercel.app | Development Supabase `hyttuapvvqqxcyhojbwq` |
| `main` | Client UAT release | https://mipro-erp.vercel.app | Isolated UAT Supabase `njbecypawzsuqiteooly` |

`main` means UAT here, not certified company production. Outstanding engineering and acceptance are tracked in `UPDATE13_IMPLEMENTATION.md` and `MANUAL_SETUP.md`.

## Source Separation

- Prototype starts at the last mock-only sales-lifecycle release, `43fb218`. It retains the public website, demo login and sample operational workflows without later hosted Auth, database, migration, payroll, approval or recovery implementations. It is not a mirror of current production functionality.
- Raw client workbooks, meeting files and PDFs are removed from prototype's current source tree. Approved public images/documents remain. Existing Git history is preserved, not scrubbed.
- `dev` and `main` use the same application, contracts and migrations. Test on `dev`, then merge into `main`; do not maintain separately rewritten business logic.
- Mock API/seed modules are removed from `dev`/`main`. Tests, setup scripts and migrations stay in source because maintainers need them, but are excluded from deployed Function payloads.
- The real ERP public website remains static. AI is deferred.

## Environment Files

Checking out a branch does **not** switch an ignored `.env`. Git does not own that file. Real credentials are never committed to any branch.

| Environment | Ignored local configuration | Restricted runtime file |
| --- | --- | --- |
| Staging | `artifacts/private/staging.env` | `artifacts/private/runtime-database.env` |
| UAT | `artifacts/private/uat.env` | `artifacts/private/uat-runtime.env` |
| Prototype | Non-secret defaults in `config/prototype.env` | No database credentials |

Root `.env` and `.env.local` are not read by the ERP or Vite. Their previous local contents were moved to ignored `artifacts/private/retired-root-env` as a recovery copy. Active configuration uses only the named files above or Vercel's platform variables. `.env.example` remains a placeholder reference. Migration/setup credentials remain local.

## Local Commands

On `dev` or `main`:

```powershell
npm ci
npm run check:environment
npm run dev
```

The launcher selects localhost:5178/staging for `dev`, or localhost:5180/UAT for `main`. Local UAT changes affect the hosted UAT database too. A named branch cannot silently run another environment. Feature branches explicitly use `npm run dev:staging` or `npm run dev:uat`.

The npm backup, migration, migration-verification, runtime-role, bootstrap, invitation and opening tools use the same branch selector. In particular, `npm run db:migrate` on `main` cannot silently read the old development `.env`. Database writes still require each tool's explicit `--apply`; the branch selector grants no new permission. A bare `node scripts/...` bypasses this convenience: advanced maintenance must explicitly select `ERP_ENV_FILE` and verify the project first.

On `prototype`, run `npm ci` then `npm run dev`: localhost:5173 / API:4174, no Supabase, SMTP or MFA. Never enter confidential company information into the public prototype.

## Release Flow

1. Develop from `dev` on a feature branch using staging credentials.
2. Run lint, tests, release checks and build; merge/push to `dev` for staging.
3. Apply new additive migrations explicitly to staging and verify them. Git pushes never run migrations automatically.
4. After acceptance and a UAT backup, apply matching UAT migrations, merge `dev` into `main`, then push.
5. A `prototype` push updates only the public demonstration. Never merge prototype into `dev`/`main`.

Each Vercel project is Git-linked to this repository with its own Production Branch. The stable staging project also uses Vercel's **Production** variable scope; this does not make it the company's production database. Preview deployments are disabled; a project-specific ignored-build command rejects other branches. The ERP build also rejects mismatched project IDs, Supabase references, privileged DB credentials and demo mode.

`node scripts/configure-branch-deployments.mjs` audits without changes. Add `--apply` to configure these three identity-checked existing projects, including refreshing a stale repository label after a rename. It never buys plans, migrates databases, resets data, rotates secrets or changes Auth redirects.

The ignored `.vercel/project.json` is a CLI directory link, not a branch-aware setting. The main checkout is currently linked to `mipro-erp`; the prototype worktree is linked to `mipro-erp-prototype`. Do not run a bare deployment after switching branches without checking the project. Git-push deployments use the verified per-project branches instead.

The local prototype worktree is `artifacts/worktrees/prototype`. Use `git worktree list` to inspect it; do not force-switch a branch already checked out there.

## Cleanup And Renaming

`npm run cleanup:test-artifacts` previews removal of generated screenshots and disposable browser-build copies. Add `-- -Apply` to perform cleanup. Credentials, backups, release/recovery evidence, worktrees, requirements, public assets and logs are protected. The initial cleanup removed 633 test images and eight build copies (about 360 MiB); no company records were deleted.

The GitHub repository is `AN-SWAPNIL/MIPROBD_ERP`; its immutable identity is unchanged. The replacement public demo project is `mipro-erp-prototype`, tracking only `prototype`. Staging/UAT retain their existing project IDs, branches and Supabase data. See [RENAME_PROJECT.md](RENAME_PROJECT.md) for local-folder rename and worktree repair steps.

References: [Vercel Git](https://vercel.com/docs/git), [branch controls](https://vercel.com/docs/project-configuration/git-configuration), [environment variables](https://vercel.com/docs/environment-variables).
