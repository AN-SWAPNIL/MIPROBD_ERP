# MIPRO ERP Demo Instructions

## Fast Start

```powershell
npm install
$env:VITE_DEMO_MODE="true"
npm run dev
```

Open the frontend URL printed by Vite. Sign in as:

```text
superadmin@mipro.local
password123
```

## Recommended 20-Minute Demo

1. **Corporate Home:** introduce MIPRO Healthcare Corporation, switch the Product Range / HD-17H / Features / Technical Data literature views, open one supplied PDF, then explain product categories, documentation discipline and the Employee Portal boundary.
2. **Products:** search/filter the B2B catalogue, open a product, and show that public records contain no price, stock, landed cost or supplier terms.
3. **Certificates & Contact:** preview/download the migrated manufacturer scans, explain current versus historical status, show the free map, and submit a business inquiry.
4. **Employee Portal:** explain production-safe login and choose a demo role only because `VITE_DEMO_MODE=true`.
5. **Dashboard:** show six KPIs and actionable lists.
6. **Imports:** open New Import to show PO-first draft requirements, then open `LC-77612`.
7. **Commercial & Products:** show one LC with three variants.
8. **Documents:** open the PI PDF, show the protected viewer, then open Extract Fields and emphasize review before apply.
9. **Costs & Allocation:** show different rules, Add Cost, and the protected freight attachment.
10. **Landed-Cost Result:** click Preview and expand an explanation.
11. **Warehouse Receipt:** explain finalization lock and inherited cost.
12. **Inventory:** show product images, Opening/Import batches, smart FIFO/expiry alert, Movements and split FIFO.
13. **Sales:** show running customer ledger, owner profit preview, quote/order, delivery, collection and follow-up recommendations.
14. **Daily Field Activity:** as Sales Executive, open Marketing -> Report Activity; show the locked signed-in identity, expanded activity categories, customer/lead, purpose and outcome.
15. **Employees:** search `SE-014`, clear the search, and click the employee name to open Activity & Reports without leaving Employees.
16. **Employee Reports:** switch Daily/Weekly/Monthly/Custom and the five report-content strategies; show employee identity, KPIs, activity log, targets, plans, follow-ups and CSV, then click Print Preview to open the shared A4 preview where stationery mode and Print / Save PDF are available.
17. **Field Team:** under Employees, show the Demo location feed label, live/recent/stale/offline states, territory/status filters, marker detail and Route History.
18. **Expenses & Accounts:** show expense isolation, account ledger and the utility-receipt image viewer.
19. **Reports:** explain that global Reports is for cross-team/grouped operational analysis; the understandable named employee report already stays in Employees.
20. **Smart Insights and MIPRO AI:** open one role-safe insight, then ask about the open import or selected employee and demonstrate permission-safe refusals.
21. **Settings:** show capabilities, Role Access Summary, aliases, opening-data migration, print calibration and confirmation answers.

End as Sales Executive to show own-record Sales and Reports, direct-URL denial, and no cost/profit leakage.

## Acceptance Checklist

### Public website and employee boundary

- [ ] Public navigation contains Home, About, Products, Certificates, News & Resources, Contact and Employee Portal.
- [ ] Homepage contains no ERP mock sales, stock valuation or role statistics.
- [ ] Product Range, HD-17H Focus, Features and Technical Data tabs switch the supplied MIPRO literature; each source PDF opens from the homepage.
- [ ] Product catalogue uses a separate public type and exposes no protected ERP fields.
- [ ] Product search, category filter, detail and Contact Sales links work.
- [ ] Certificates identify manufacturer versus MIPRO ownership, show visible validity dates, and provide working preview/download actions for the authorized scans.
- [ ] Contact map renders and the business inquiry returns an `INQ-*` reference.
- [ ] `/signup` redirects to `/login`; there is no public Request Access workflow.
- [ ] Production login is blank and hides demo users unless `VITE_DEMO_MODE=true`.
- [ ] Sitemap excludes `/login` and `/app/*`; robots disallows protected/auth routes.
- [ ] Legacy `/product/*` URLs redirect to matching `/products/*` routes.

### Field Team, scalable reports and Smart Insights

- [ ] Field Team remains inside Employees with a Marketing shortcut; it is not duplicated as a main navigation destination.
- [ ] Demo location feed is clearly labelled and never presented as production tracking.
- [ ] Leaflet map renders real coordinate markers, clustering support, pan/zoom, customer points and route polyline.
- [ ] Every marker/detail shows employee ID, territory, status, last update and accuracy.
- [ ] LIVE/RECENT/STALE/OFFLINE/NOT TRACKING are derived from timestamp and session state.
- [ ] Territory, status and employee search filters work.
- [ ] Route history uses stored coordinate points and does not invent distance.
- [ ] Sales Executive sees only self; Accounts/Import/Warehouse receive API denial.
- [ ] EmployeePicker searches name, employee ID, designation and territory; Enter selects the first filtered employee rather than All Employees.
- [ ] All Employees supports territory, search, sort and pagination.
- [ ] Employee name and report icon open Activity & Reports locally; report generation does not redirect to global Reports.
- [ ] Smart Insights is linked from Dashboard, not the main sidebar.
- [ ] Insight filters and source links respect role scope; dismissal posts no transaction.

### Import

- [ ] Draft can start from supplier + PO + products before PI/LC.
- [ ] One import case contains multiple products.
- [ ] Draft reference changes to LC/TT as the visible reference.
- [ ] Status is action-derived; cancel/close are controlled and terminal records are read-only.
- [ ] FOB/CBM basis values are recomputed by the API.
- [ ] Product lines can be added, edited and removed before finalization.
- [ ] Cost rows can be added, edited and removed with explicit allocation.
- [ ] CBM, FOB value, quantity, product-specific and manual allocation are available.
- [ ] Preview totals reconcile exactly.
- [ ] Each allocation has an explanation.
- [ ] Finalized snapshot is immutable.
- [ ] Reopen requires capability and reason.
- [ ] Reopen is blocked after any warehouse receipt.
- [ ] Receipt is locked before finalization.
- [ ] Partial receipt and final receipt create stock.

### Inventory

- [ ] Opening/legacy batches can be posted through Settings.
- [ ] Stock shows images, canonical code and available quantity.
- [ ] Batches show lot, expiry, receipt date and location.
- [ ] Movements show stock in/out references.
- [ ] Oldest eligible batch is recommended.
- [ ] One quantity can split across several FIFO batches.
- [ ] Expired batches are excluded from dispatch.
- [ ] Newer-batch selection creates a warning.
- [ ] Authorized override requires a reason.

### Sales

- [ ] Customer CRUD works for permitted roles.
- [ ] Customer detail shows opening balance and running ledger.
- [ ] Legacy product aliases map to canonical products.
- [ ] Owner-only price preview shows FIFO COGS and profit/loss.
- [ ] Quotation lines carry into order.
- [ ] Actual MIPRO/LED digital and calibrated preprinted quotation views render.
- [ ] Every formal report has one Print Preview action; the dedicated preview offers With Background and Without Background using the same selected identity and calibrated safe area.
- [ ] Order Receiving Sheet uses the supplied structure.
- [ ] Delivery selects an actual batch and reduces stock.
- [ ] Delivery creates customer due.
- [ ] Collection supports cash, mobile banking, bank transfer and cheque.
- [ ] Credit is not a collection; valid active account and non-cash reference are required.
- [ ] Collection reduces due and updates an account.

### Expenses, reports and security

- [ ] General expense and TA/DA can be posted.
- [ ] Reversal requires a reason.
- [ ] Expense does not change landed cost.
- [ ] Reports reflect operational records.
- [ ] Report From/To changes data and CSV contains actual rows.
- [ ] Sales Team Comparison compares all permitted employees; clicking a name opens the canonical Employee Activity & Reports view.
- [ ] Marketing Analysis groups and filters cross-team field evidence without duplicating the named employee report.
- [ ] Sales Executive can open only their own role-safe sales detail and activity report.
- [ ] TA/DA Approved Sheet and owner realized-profit report render.
- [ ] Employee, Marketing, operational, audit and TA/DA printouts contain the active period/filter data rather than the surrounding application screen.
- [ ] Settings are Super Admin-only.
- [ ] Roles show only their permitted navigation.
- [ ] Unauthorized direct URLs show Access denied.
- [ ] Sensitive cost is absent for unauthorized roles.

### Employee daily activity and printable reports

- [ ] Report Daily Field Activity displays the signed-in employee name/code and does not allow reporter impersonation.
- [ ] Categories include hospital/customer visit, doctor/clinical meeting, procurement meeting, dealer visit, presentation, demonstration, sample, training, negotiation, tender/quotation follow-up, collection visit, service follow-up, market survey and office coordination.
- [ ] Authoritative quotation, order, delivery, collection and GPS events appear automatically and cannot be manually imitated.
- [ ] Directory search works for name, ID, title/role, phone, department, territory and login; Clear restores all permitted employees.
- [ ] Daily, Weekly, Monthly and Custom controls produce the correct date range, including historical periods.
- [ ] Complete Performance, Activity Details, Field Visits & Meetings, Sales & Collection, and Follow-ups & Pipeline produce understandable filtered outputs.
- [ ] Printed employee report includes name, image/initials, code, designation, department, territory, status, period, preparer, KPIs, detailed activity, target/plan/follow-up sections, report reference and signatures.
- [ ] Mobile report uses readable cards and has no horizontal page overflow.

### Documents and contextual AI

- [ ] Import PDF and expense image open in the shared viewer.
- [ ] Freight/customs attachments return 403 without sensitive-cost permission.
- [ ] Missing file metadata produces a clear preview error.
- [ ] Extract Fields opens a review panel with nothing selected by default.
- [ ] MIPRO AI shows the current role and workspace context on desktop and mobile.
- [ ] Inventory recommendations agree with deterministic FIFO/expiry data.
- [ ] Sales follow-up recommendations link to the relevant workspace.
- [ ] Sales Executive AI refuses landed-cost/profit requests and does not reveal values.

## Reset Demo Data

The API stores data in memory. Restart `npm run dev` to restore the normalized seed locally. A Vercel redeployment or serverless cold start may also reset it.

## Health Checks

Local:

```text
http://localhost:5173/api/health
```

Deployed:

```text
https://YOUR-PROJECT.vercel.app/api/health
```

Expected service name:

```text
mipro-simplified-erp-api
```

## Automated Verification

```powershell
npm run lint
npm test
npm run typecheck:api
npm run test:flows
npm run build
npm run smoke
npm run smoke:employee
```

`test:flows` starts its own isolated API. Run `smoke` and `smoke:employee` while the development server is active, then restart the demo API to restore seed data before presenting.

## Honest Demo Language

Say:

> This is a complete functional frontend and workflow prototype. Every screen uses typed API services, so the persistent backend can replace the mock without changing the user flow.

Also say:

> Demo changes are temporary because the current API is in-memory. Database, durable file storage and real authentication are the next production phase.

The floating AI and extraction are active **rule-backed mock capabilities** behind typed endpoints. Do not present them as a production language model, autonomous approver, or durable document-intelligence service.

Do not claim that the demo feed is production GPS, that browser tracking continues after closure, or that Supabase/mobile persistence exists. Native mobile tracking, HR/payroll, fleet, invoice, full accounting, automatic customs calculation and persistent storage remain later work.
