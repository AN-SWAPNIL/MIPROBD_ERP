# MIPRO ERP — Field Visit Check-in Implementation Plan (Update 12)

**Date:** 24 October 2026  
**Target branch:** `dev` (inspected at `72a51ade18fa0c0094eee67e190067487e82fafb`)  
**Goal:** Authentic employee-initiated, event-based field check-ins using mobile browser location + optional compact camera photo; persisted to the existing foundation backend, without a native mobile app or continuous GPS monitoring.

## 1. Scope and non-goals

### Implementation amendments approved on 24 October 2026

- P0 includes manager review and simple visit completion/outcome. Optional second GPS/photo capture at checkout remains P1. One active visit is allowed only with an available completion/void path.
- Capture/upload the photo first, then request fresh location immediately before final submission. Client timestamps and camera-source labels remain untrusted claims; server receipt time is authoritative. Missing/stale/poor location is an explained review exception, not fabricated GPS.
- Store lifecycle, capture quality, site match and review as separate fields. Snapshot the policy and approved site reference used; later changes never rewrite original evidence.
- Use authenticated SELF creation, existing marketing TEAM/ALL read scopes, marketing approval for independent review (including MD without edit permission). Employee-directory access alone grants no visit evidence access.
- Keep visit scoring explicitly off, irrespective of the existing score rule. Link optional manual activity IDs to avoid duplicate visit totals. Reuse the pending visit-verification report ID and extend its strict filter contracts.
- P0 includes expiring, single-use upload attempts, bounded abandoned-upload cleanup, decoded image/dimension/hash validation and private reads. Storage token expiry and application attempt expiry are different controls.
- Unplanned contacts must first become canonical leads. Stable plan-contact IDs and automatic plan reconciliation remain P1; no unstable JSON array-index links.
- Production submission remains gated until an administrator records privacy/retention approval. Default photos are optional with an explicit no-photo reason; no patient photography or continuous tracking.

### Build
- One-tap **Check In at Customer/Lead** from Sales & Marketing / My Field Day.
- Fresh geolocation with accuracy and clear fallback when permission is denied.
- In-app mobile camera capture, client-side compression, private Storage evidence.
- Server timestamp, immutable visit/event history, optional check-out and outcome.
- Manager view: recent check-ins, visit details, location/evidence review.
- Canonical Reports **Field Visit Report** (and employee performance integration), honoring SELF/TEAM/ALL scopes.
- Same existing MIPRO UI tokens, Buttons, Panel, Modals, EmployeePicker, date and status styling.

### Do not build
- Background GPS; continuous WebSocket tracking; staff movement trails between visits.
- A native mobile app, Android location service, PWA offline GPS queue for P0.
- Automatic facial recognition, mandatory selfies, patient photography, face biometrics.
- A new Employee database, a second upload subsystem, a second reporting engine.
- Automatic “fraud verified” declarations, automated punishment, or GPS-only scores.
- Any Import/Inventory/Sales financial or Accounts posting changes.

## 2. Proposed workflow

```text
Login → Sales & Marketing → My Field Day
    → Select Customer/Lead / planned contact
    → Check In
       → Camera: Take Photo / Retake / Use Photo (or "Photo prohibited")
       → Finish private photo upload, then capture current location (fresh)
       → Reason + purpose if needed
       → Review + Submit
    → Server saves visit and submitted-at timestamp
    → Optional Complete Visit with outcome + follow-up
    → Employees: Last Check-ins + Visit History + Needs Review
    → Reports: Field Visit Report / Employee Activity
```

**P0** allows a single check-in event with optional outcome; optional **P1 check-out** must not delay rollout. Employee clicks manually at the site. No “Start Tracking” prerequisite.

## 3. Backend changes, in recommended order

### A. Create database migration 0019+ using the existing Drizzle flow

Do not hardcode migration number without checking current journal at implementation time.

Add `field_visits` (owner, customer/lead, status, purpose, server timestamps, outcome, plan reference if stable, version), and `field_visit_events` append-only (check-in, photo, checkout, review/correction, captured coordinate, accuracy, capture/source timestamps, evidence link, review metadata). FK to existing `employees`, `customers`, `marketing_leads`, `documents`.

Add canonical **customer location reference** (prefer versioned record/table) with manager-confirmed source, latitude/longitude and audit. A salesperson's first visit point **must not** become authoritative customer coordinates automatically. Keep optional for P0.

DB constraints:
- latitude [-90,+90], longitude [-180,+180], accuracy >0 and within plausible bound;
- exactly one customer/lead when not an explicitly permitted new-prospect check-in;
- owner + idempotency uniqueness;
- no arbitrary editing/deleting completed events;
- one active visit per employee (if implementing check-in/check-out sessions);
- no duplicate reuse of a photo/document ID;
- indexes employee/date, customer/date, status/review/date.

### B. Add validated API routes under `server/workforce/`

- `POST /api/workforce/visits/check-ins`
- `GET /api/workforce/visits` (date, employee, customer, review status, pagination)
- `GET /api/workforce/visits/:id`
- `POST /api/workforce/visits/:id/complete` (P0 outcome, without second GPS/photo capture)
- `POST /api/workforce/visits/:id/reviews` (manager only, no self-review)
- optionally `PATCH /api/workforce/customers/:id/location` (permitted manager verification)

Use foundation identity/session middleware and `marketingScope` / `assertEmployeeScope`; never accept arbitrary employee IDs as proof of identity. No prototype `/api/field-team` mock fallback in foundation mode. Strict Zod schema and server-owned timestamps.

### C. Photo upload — extend existing secured system

Extend `server/foundation/contracts.ts` upload-purpose enum and `server/foundation/documents.ts` policy to support `field-visit-evidence`. Follow current direct signed Supabase Storage upload, complete-and-verify, private retrieval by authorized SELF/TEAM manager.

**Preferred sequence:** obtain short-lived check-in attempt ID → capture/upload bounded image → complete upload → submit Check In referencing that attempt and document ID, consuming them exactly once in one DB transaction. Ensure pending-upload expiration/cleanup; ensure only uploader can use evidence and that images cannot be attached to unrelated visits.

Keep images out of PostgreSQL. DB stores path/document ID, metadata and optional SHA-256; evidence bytes remain in private Storage.

### D. Event status and integrity

Proposed evidence results:
- `LOCATION_CAPTURED` — fresh browser coordinates, site reference not yet approved.
- `LOCATION_MATCHED` — recent point within configured tolerance of manager-approved reference; **not spoof-proof**.
- `NEEDS_REVIEW` — missing/inaccurate/stale/mismatched location, no permitted photo, offline delay, etc.
- `MANAGER_REVIEWED` — review acknowledged/accepted with name/time/reason.
- `REJECTED` / `VOIDED` — keep audit and reason.

Avoid conflating **technical evidence quality** with **manager review decision**. Model as separate axes if possible (`captureQuality`, `reviewStatus`) rather than a single irreversible enum.

### E. Location matching logic

On capture:

```ts
navigator.geolocation.getCurrentPosition(success, error, {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0
});
```

Server checks `position.timestamp` versus request received time (e.g., >30s stale), records accuracy, and optionally calculates Haversine distance to a manager-confirmed customer reference. Proposed initial review guidance: site radius around 150 m; if estimated accuracy >100 m, flag uncertain regardless of proximity. These are **configurable pilot thresholds**, not guaranteed accuracy rules. A large location uncertainty should trigger review, **not** a false accusation.

Server time is primary; client coordinates, capture time, MIME, camera source and device details are claims, not cryptographic attestation. Single-use attempt nonce reduces simple replays but cannot prevent browser/GPS spoofing.

## 4. Frontend changes

### P0 mobile UX

Create `src/domains/marketing/FieldVisitCheckin.tsx` (or place alongside current `PersistentMarketingHub` components):
- visible action **Check In** in My Field Day/Today's Plan (no new main navigation);
- prefilled customer/lead and purpose;
- show browser permission errors and Retry;
- live camera preview via `getUserMedia`, explicit still capture; no audio;
- canvas resize longest side ~960 px, WebP quality ~0.7, JPEG fallback, cap ~300 KB after adaptive compression;
- show a small preview and allow Retake;
- location value + approximate accuracy, photo state and optional reason clearly shown before submit;
- disable submit while upload/posting is pending;
- show confirmation with **saved server time** and visit reference.

When `getUserMedia` fails: offer `<input type=file accept="image/*" capture="environment">` fallback with weaker evidence source, or No Photo + reason. Mobile browser compatibility must be tested on actual Android Chrome and iPhone Safari.

Stop camera tracks on close, cancel, captured frame or page leave. Revoke preview object URLs when unused.

### P0 management UX

In foundation Employees → Field Team, replace misleading prototype labels:
- **Last Check-ins** (map with event timestamp and accuracy)
- **Visit History** (day/customer/employee, ordered event list)
- **Needs Review** (filter/list, not necessarily a tab)

Do not show **Live Map**, **Online/Offline employee**, **Current position** or simulated travel polyline when only discrete check-ins exist. A map pin always means “Reported check-in at 2:10 PM,” not “Employee is here now.”

### P0 report integration

Add a canonical Reports card under Employee & Marketing Reports: **Field Visit Report**. Relevant filters: period (Daily/Weekly/Monthly/Custom), employee/team, customer/lead, capture/review status. Columns: Date, Employee, Customer/Lead, Check-in time (Asia/Dhaka), Accuracy, Distance to approved site (if known), Evidence, Review, Outcome. Reuse shared Report Detail and A4 Print Preview.

**Do not embed signed photo URLs in CSV/PDF**; report may say photo count or “Evidence on file,” accessible only through a separately authorized detail view.

### Integration and deferred follow-through

- P0: Complete Visit with outcome and optional follow-up. P1: separate checkout GPS/photo and discussed products.
- Pre-fill from approved daily plans with stable visit association.
- Approved manager-reviewed location event can feed `VERIFIED_CUSTOMER_VISIT` scoring if the client approves exact rules; by default keep points **off** and report count separately.
- Customer detail: last visit and approved site pin.
- Employee Activity Summary: linked visit details and evidence status.

## 5. Privacy, governance and hospital use

Before production pilot:
- Publish a short employee notice covering purpose, when capture occurs, data fields, retention, managers with access, and employee correction/dispute route.
- Capture only after explicit employee action in working context, never continuously or off duty.
- Explain camera/location permission requests in the UI; make photo exception possible if hospital photography is prohibited.
- Prohibit patient images, clinical records and unauthorized third-party faces in evidence; prefer site signage when permitted.
- Restrict access by SELF/TEAM/authorized management, private storage, expiring read URLs, audit.
- Agree a documented photo/metadata retention and deletion policy before rollout; e.g. photos retained shorter than aggregate visit logs if permitted by company/legal policy. Backups/exports need consistent treatment.
- Do not build face recognition or use this as sole disciplinary evidence.
- Obtain counsel review for Bangladesh **Personal Data Protection Act, 2026** as location records are personal data and workplace monitoring can amount to profiling.

## 6. Tests and acceptance (must pass on foundation backend)

### Employee
- [x] Verified real-login Sales Executive can check in only as self.
- [x] Employee may select an owned/assigned customer/lead, not another employee's client if access policy forbids it.
- [x] Browser requests location only on an explicit capture/save action inside Check In.
- [ ] Captured latitude/longitude/accuracy and server timestamp survive reload/redeployment.
- [x] In-app photo capture, compression, direct upload and private retrieval work in the isolated Edge walkthrough.
- [x] Missing/poor/stale location, absent site references and no-photo reasons retain truthful independent capture/review states (unit + hosted tests).
- [x] Concurrent/double submission and lost-response retries do not create duplicate visit/photo references.

### Manager
- [x] Assigned manager can see TEAM visits and open authorized evidence.
- [x] Other-team manager or employee cannot access via URL/ID substitution; directory access alone does not grant evidence access.
- [x] Manager review includes reason, actor, time; author cannot approve own visit, even with approval permission.
- [x] Photo or visit corrections never silently replace original evidence.

### Data/report integrity
- [x] Manual activity alone does not become GPS-verified.
- [x] Approved invoice/sales money/collection never changes because of a visit check-in.
- [x] Visit reports use saved SQL records; CSV and A4 come from the same scoped query. Screen/A4 groups nine source fields into six columns without dropping information.
- [x] “Verified visit” target/score remains disabled; manager acceptance awards no visit points.
- [x] No synthetic route line or current/live location is displayed from sparse points. OSM tiles load only after Show Map, with disclosure and attribution.
- [x] `ERP_BACKEND_MODE=foundation` cannot fall back to mock visit records.

### Device and security
- [ ] Android Chrome and iOS Safari field tests under HTTPS, indoor/outdoor, permission denied, camera busy, slow network, low storage, back/reload/navigation.
- [ ] Photo cannot be downloaded with an expired/unauthorized Storage read link.
- [x] Upload purpose/identity/visit relationship, size/MIME/dimensions and nonce expiry enforced server-side, with deferred relationship/event and JSON-shape database guards.
- [ ] Database restore and private Storage backup/retention procedure tested.

## 7. Implementation order

**P0 — deliver a usable visit check-in**
1. Confirm client policy for photo requirement and manager review; set conservative defaults.
2. Add Drizzle migration for visit/events + optional approved customer location reference.
3. Add typed Zod/API routes with real identity, scopes, server time and idempotency.
4. Extend existing secure private upload purpose to visit photos.
5. Build mobile-friendly location/camera Check In component and truthful fallbacks.
6. Add management Last Check-ins / Visit History and evidence detail.
7. Add canonical Field Visit Report and direct report links.
8. Add hosted tests and mobile browser smoke checks; keep mock/foundation isolated.

**P1 — quality and follow-through**
9. Add separate checkout GPS/photo and stable plan association; simple outcome/follow-up is P0.
10. Extend the P0 approved customer pin and advisory proximity workflow after field UAT.
11. Visit-score integration only after client approval; independent manager review is P0.
12. Automate the approved linked-evidence retention/backup policy and operational alerts. Bounded abandoned-upload cleanup is P0.

**P2 — only if product use justifies**
13. Offline draft queue with clear delayed status, never backdated authoritative check-in.
14. Customer acknowledgement (non-biometric, opt-in) or on-site QR validation if permitted, still not fraud-proof.
15. Native mobile app / higher-trust device attestation if the client later needs stronger verification or background tracking.

## 8. Definition of done

### Implementation checkpoint

P0 is implemented in the foundation workspace, backed by hosted development PostgreSQL/Storage with backup-first migrations 0019-0022. Open Sales & Marketing > Marketing > My Field Day / Visits, or Employees > Team Activity > My Field Day / Visits. The existing report ID `visit-verification` now provides Field Visit Report. Setup, calculation rules and verified/pending launch work are recorded in `BACKEND_SETUP.md`, `CALCULATIONS.md` and `PRODUCTION_BACKEND_PROGRESS.md`.

Production activation, actual Android/iPhone HTTPS field tests, deployed persistence/redeploy acceptance, expiry/restore drills and approved linked-evidence retention remain open. Stable plan links and second GPS/photo checkout are P1, not silently represented as completed. The historical old prototype is not the persisted foundation workflow.

A salesperson can check in at a client using a **mobile browser**, with fresh coordinate, server time, optional compressed camera evidence and a simple outcome; a scoped manager can review the event; Reports can summarize it. No continuous location monitoring is implied. Evidence remains private and auditable, and the entire feature runs on the actual foundation PostgreSQL/Supabase backend, **not** mock fixtures.

---

**Sources:** project `dev` files named in the companion analysis; browser Geolocation/getUserMedia/canvas documentation from MDN; Supabase private Storage and signed upload documentation; official Bangladesh Personal Data Protection Act, 2026 at https://bdlaws.minlaw.gov.bd/act-details-1692.html?lang=en.
