# MIPRO ERP Prototype

This branch preserves the last mock-only sales-lifecycle release (`43fb218`) for demonstrations. It contains the public website, demo login, import costing, inventory, sales, employee activity and reports. Later production backend features are intentionally absent.

**Website:** https://medical-supplier-erp.vercel.app

## Run

```powershell
npm ci
npm run dev
```

Frontend: localhost:5173. Mock API: localhost:4174. Non-secret defaults are in `config/prototype.env`; no Supabase connection is needed. Demo accounts appear on login. Demo password: `password123`.

```powershell
npm run lint
npm test
npm run build
```

All transactions, edits and uploaded metadata are temporary. Restarts reset them; separate serverless instances do not share memory. No real authentication, database, payment, email or AI service is implied. Never enter real company records or private credentials.

## Branch Boundaries

| Branch | Purpose |
| --- | --- |
| `prototype` | This isolated mock demonstration |
| `dev` | Real-backend staging |
| `main` | Isolated client UAT |

This source deploys only to `medical-supplier-erp`, from `prototype`. Real backend credentials cause its build to fail. Raw client workbooks/requirements and production database tooling are not in this branch's current tree. Approved public images/documents remain; older Git history is retained.

Never merge prototype into `dev` or `main`. Develop real backend changes on `dev`, then promote to `main` after backups and explicit migration checks.
