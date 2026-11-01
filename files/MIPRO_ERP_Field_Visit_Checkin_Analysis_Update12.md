# MIPRO ERP — Field Visit Check-in & Camera Evidence Analysis (Update 12)

**Date:** 24 October 2026  
**Repository:** `AN-SWAPNIL/Medical_Supplier_ERP`  
**Inspected branch:** `dev`  
**Inspected commit:** `72a51ade18fa0c0094eee67e190067487e82fafb` — `feat: persist ERP operations, finance, workforce and reports`  
**Scope:** Event-based browser check-in at customers/leads, optional check-out, photo evidence, review and reports; no mobile app or continuous GPS tracking.

## 1. Executive assessment

**Recommended:** implement **Field Visit Check-in** instead of attempting continuous/live employee location tracking in a browser. A salesperson actively opens the ERP on their phone at a customer site, selects the customer/lead, requests a fresh location, takes a contextual site photo using the device camera where permitted, and submits a record. The server adds a trusted receipt timestamp and stores restricted metadata and photo evidence. A manager can review exceptions and visit details. This provides a valuable audit trail but is **not proof of presence**: client devices can spoof GPS, photos can be staged, and check-in cannot establish what happened before or afterward.

Use precise claims: **Location captured**, **Near recorded customer location (approx.)**, **Needs review**, **Manager reviewed**, or **Manually reported**. Never label all submissions as “verified GPS visits,” “real-time tracking,” or “fraud-proof.”

## 2. Existing project audit: do not duplicate completed work

| Area | Verified current `dev` implementation | Implication |
|---|---|---|
| Production migration | `PRODUCTION_BACKEND_PROGRESS.md`: hosted PostgreSQL, Drizzle, Supabase Auth, secure sessions, private uploads, imports, sales, accounts, workforce and reporting largely migrated; **GPS/field-visit verification remains pending** | Extend foundation backend; don't bring mock arrays into production |
| Runtime isolation | `ERP_BACKEND_MODE=foundation` versus `mock`; `/backend` is migration workspace and `/app` remains prototype until cutover | Implement in foundation mode first; do not silently enable mock fallback |
| Old GPS prototype | `src/components/field-team/FieldTeamPage.tsx` already uses browser `navigator.geolocation.getCurrentPosition`; mock “Start Tracking,” “Refresh GPS,” check-in/out, 15-second map feed and route history | Reuse user-facing concepts selectively, **not** prototype API/storage as authoritative data |
| Workforce | `server/workforce/`, `database/schema.ts`: persisted employees, marketing activities, leads, plans, follow-ups, targets, role/team scope and reporting | Link visits to canonical employee/customer/lead; no second employee or marketing database |
| Private evidence | `server/foundation/documents.ts`, `workforceService.upload`: signed direct upload to private Supabase Storage, server validation, document references and scope-controlled reads | Extend existing document purpose/parent model for visit photos; **never put image binary into Postgres** |
| Existing activity contract | Manual activity is explicitly `verification: MANUAL`; `activityFacts()` excludes fabricated GPS verification; scoring already lists `VERIFIED_CUSTOMER_VISIT` but treats its source as pending | Do not turn ordinary manual notes into checked-in visits. Add a separate visit source and carefully reviewed scoring logic |
| Customers | `erp_private.customers` currently stores address/territory/owner but no saved latitude/longitude | Need **controlled customer location reference** for an optional proximity check |
| Planned visits | `marketing_plans.data.visits` contains planned contact entries in JSONB | Do not mutate the plan JSON into a visit database. Use stable visit IDs and optional explicit plan association |
| Current management map | Old “Live Map” and “Route / Visit History” are prototype-only and show realistic mock data | For foundation UI use **Latest Check-ins** and **Visit History**, never imply 24/7 live location |
| Reports | Foundation backend already has 60 operational SQL reports | Extend Employee/Marketing and audit reports; keep formal printing in Reports |

**Key source files:**
- [`PRODUCTION_BACKEND_PROGRESS.md`](https://github.com/AN-SWAPNIL/Medical_Supplier_ERP/blob/dev/PRODUCTION_BACKEND_PROGRESS.md)
- [`BACKEND_SETUP.md`](https://github.com/AN-SWAPNIL/Medical_Supplier_ERP/blob/dev/BACKEND_SETUP.md)
- [`src/components/field-team/FieldTeamPage.tsx`](https://github.com/AN-SWAPNIL/Medical_Supplier_ERP/blob/dev/src/components/field-team/FieldTeamPage.tsx)
- [`server/workforce/activities.ts`](https://github.com/AN-SWAPNIL/Medical_Supplier_ERP/blob/dev/server/workforce/activities.ts)
- [`server/workforce/reporting.ts`](https://github.com/AN-SWAPNIL/Medical_Supplier_ERP/blob/dev/server/workforce/reporting.ts)
- [`server/foundation/documents.ts`](https://github.com/AN-SWAPNIL/Medical_Supplier_ERP/blob/dev/server/foundation/documents.ts)
- [`database/schema.ts`](https://github.com/AN-SWAPNIL/Medical_Supplier_ERP/blob/dev/database/schema.ts)

## 3. Realistic browser capabilities

A normal mobile web page, loaded via HTTPS, **can** request a one-time geographic position using `navigator.geolocation.getCurrentPosition`, including coordinates, horizontal accuracy and the position timestamp. The employee must permit location access. Browser positions may originate from GPS, cellular or Wi-Fi and can be inaccurate indoors; enabling high accuracy requests better data but does not guarantee GPS hardware readings.

A web page, loaded via HTTPS, **can** open the device camera with `navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false})`, display a live viewfinder, and capture a still frame using Canvas `toBlob`. This works without a native mobile app. Fallback `<input type="file" accept="image/*" capture="environment">` may open the camera, but browser support varies and may allow gallery selection; mark such evidence **File Selected / Capture Source Unconfirmed**, not camera-authenticated.

A browser cannot reliably provide background tracking once it is closed, suspended, denied location permission or restricted by battery-saving behavior. Do **not** infer an employee's actual current location from the last visit point.

Sources:
- https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- https://developer.mozilla.org/en-US/docs/Web/API/HTML/Reference/Attributes/capture
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob

## 4. Recommended minimal business workflow

```text
Salesperson logs in (real Supabase session)
    ↓
Sales & Marketing → My Field Day → Check In
    ↓
Select assigned Customer / Lead (or authorized unplanned prospect)
    ↓
Show location + camera permission and privacy explanation
    ↓
Tap "Capture Location" (fresh, one-time reading)
    ↓
Take location-context photo where allowed (e.g., exterior sign or entrance)
    ↓
Review location accuracy, approximate map pin, photo, customer, notes
    ↓
Tap "Submit Check-in" (server timestamp + audit)
    ↓
Optional "Complete Visit": outcome, products, next follow-up, optional checkout position/photo
    ↓
Employee Activity → latest visit summary
    ↓
Manager: Field Team → Last Check-ins / Visit History / Needs Review
    ↓
Reports → Field Visit Report / Employee Activity & Performance
```

**One check-in is enough for P0.** Check-out can be optional. Do not require “Start Tracking” to check in. No permanent browser location watch or background task.

### P0 minimal fields the employee sees
- Customer or lead; planned/unplanned selector
- Visit purpose (prefilled from plan if linked)
- Current location capture with accuracy; retry if inaccurate
- In-app camera capture (encouraged), optional with reason if prohibited
- Short notes
- Check-in / Submit

After check-in: status, trusted saved time, photo thumbnail (if any), linked customer, and optional “Complete Visit.”

### Legitimate exceptions
- GPS blocked, inaccurate, or unavailable → **Manual check-in (Needs Review)**, with employee reason; never fabricate latitude/longitude.
- Site prohibits photography (hospital wards/clinical areas, privacy concerns) → no photo, explicit **Photography not permitted** reason and optional later manager confirmation.
- Poor data service/offline → allow a draft in device memory only if needed; **no authoritative check-in until the server receives the submission**. If later synced, store server receipt time separately from claimed local capture time and mark delayed/manual, not automatically on-time verified.
- Customer without an authoritative coordinate → capture the visit location but mark **Customer location unconfirmed**. A manager may approve an official customer location after review; do not silently rewrite the customer master from a salesperson's point.

## 5. Fraud and verification: evidence, not certainty

| Threat | Mitigation | Remaining limitation |
|---|---|---|
| Claims a historical visit occurred | Server-set `receivedAt`, require fresh position capture before submission | A spoofed device clock/location or delayed traffic is possible |
| Shares a colleague's coordinates or uses mock GPS | Authenticated employee identity, freshness/accuracy metadata, pattern review, optional manager approval | **Browser GPS is not cryptographically attested**; device spoofing remains possible |
| Uploads an old photo | Primary in-app `getUserMedia` camera path; restrict/gallery fallback marking; capture photo immediately before submission; server-bound single-use check-in attempt ID | Virtual cameras, replay software and photographing a screen remain possible |
| Submits from an unrelated site | Optional approximate geofence against **manager-approved** customer coordinate; record distance and reported accuracy | Indoor GPS may be bad; the customer coordinate itself can be wrong |
| Submits one check-in and leaves | Optional check-out, reported outcome and follow-up; manager reviews anomalies | Cannot prove meeting duration or customer interaction |
| Edits/deletes evidence | Append-only visit events, restricted correction/void reason, private storage, hash and audit | Privileged administrators still require operational controls and backup integrity |
| Claims 20 visits simultaneously | One active check-in at a time if using visit sessions; duplicate/retry keys, chronology/anomaly checks | Suspicious does not automatically mean fraud |

**Verification vocabulary:**
1. `LOCATION_CAPTURED` — browser supplied a recent position, **not confirmed** against site.
2. `LOCATION_MATCHED` — within configurable distance/accuracy criteria of a **trusted** customer coordinate, but spoofing is still possible.
3. `NEEDS_REVIEW` — no coordinate, insufficient accuracy, mismatch, missing photo/permission, or delayed submission.
4. `MANAGER_REVIEWED` — named manager accepted/reviewed evidence; **not a guarantee of physical presence**.
5. `REJECTED` / `VOIDED` — reviewed/invalidated with a reason and preserved audit trail.

Use neutral terms such as “Evidence level” / “Review status,” not “Fraud detected.” Never auto-punish staff on GPS accuracy alone.

## 6. Location quality and customer matching

- Suggested capture request: `enableHighAccuracy: true`, `maximumAge: 0`, `timeout: 15000` (with visible Retry on timeout).
- Record `coords.latitude`, `longitude`, `accuracy` in meters, `position.timestamp`, and server `receivedAt`.
- Treat positions older than **30 seconds** at submission as stale and recapture; this is a proposed product rule, not browser security attestation.
- For a pilot, use an advisory distance radius around a **manager-confirmed** customer pin; e.g., 150 m radius and caution when accuracy >100 m. These are **initial configuration suggestions**, not universally correct cutoffs.
- Explain distance with uncertainty: reported accuracy is a radius estimate, not exact proof. A point 220 m away with 150 m uncertainty needs review rather than automatic rejection.
- Prefer simple great-circle/Haversine calculation server-side; no need for paid Google Maps or geocoding API to capture coordinates.
- The customer's trusted coordinates should have provenance: source, changedBy, changedAt, confirmation state and audit. Employee visit points must not auto-overwrite them.

## 7. Camera and storage approach

**Capture:** use a visible in-page camera viewfinder (`getUserMedia`) with explicit **Take Photo**, **Retake**, **Use Photo** actions. Default to environment/back camera; fall back to an accessible camera/file-picker path if necessary, marking evidence method accordingly. Stop media tracks after capture/cancel/navigation. Avoid background video and audio recording.

**Compress client-side:** draw still image to Canvas, scale longest side to **~960 px** (or 720 px for very slow devices), encode as WebP quality ~0.65–0.75; JPEG fallback. Target about **80–200 KB** per image and a hard limit e.g. **300 KB** for ordinary visit evidence, subject to field testing (a complex photo may not meet target). Preserve enough detail to read a site sign. A tiny photo that cannot identify the location defeats its purpose.

**Storage:** private Supabase Storage `erp-documents`, purpose `field-visit-evidence`; store only a document ID, SHA-256/hash, capture method and image metadata in PostgreSQL. Reuse the foundation's signed direct upload + completion + private short-lived read flow. Protect ownership/scope and validate actual bytes/MIME/dimensions server-side. Do not store Base64 or images in a PostgreSQL column; do not make evidence public or embed permanent signed URLs in printed reports.

**Sensitive scenes:** avoid identifiable patients, medical records, restricted clinical rooms, or faces without appropriate permission. Prefer exterior signage or a non-sensitive entrance when lawful and permitted. Offer a no-photo exception; **do not demand prohibited hospital photography**.

## 8. Data design aligned with current schema

The persistent foundation currently has `erp_private.marketing_activities`, employees, customers, leads, plans, targets and private `documents`; it has **no durable field-visit verification source**. Do not overload manual activity rows with arbitrary coordinate metadata or build a second employee table.

Add a small `erp_private.field_visits` entity (names conceptual; final migration must follow existing conventions):

- `id`, `employee_id` (auth-derived), exactly one of `customer_id` or `lead_id` (or explicitly marked unplanned prospect)
- optional `plan_id` / stable planned-contact reference (avoid unstable JSON array index)
- `purpose`, `status` (`CheckedIn`, `Completed`, `Voided`), `outcome`, `follow_up_at`
- `check_in_received_at` (server), optional `check_out_received_at` (server), `created_at`
- `version` and optional idempotency key, unique per employee/attempt

Add an **append-only `field_visit_events`** table for `CHECK_IN`, `CHECK_OUT`, `PHOTO_ATTACHED`, `MANUAL_EXCEPTION`, `REVIEW_ACCEPTED`, `REVIEW_REJECTED`, `VOIDED`, with:
- `id`, `visit_id`, `employee_id`, `event_type`, `recorded_at` (server), `client_observed_at` (untrusted, optional)
- `latitude`, `longitude`, `accuracy_meters` (nullable), `location_captured_at`, source/method
- `customer_distance_meters` nullable, customer-coordinate version used for matching
- `photo_document_id` nullable, `capture_method`, `image_sha256` where applicable
- `evidence_status`, `reviewed_by`, `reviewed_at`, `review_reason` as appropriate.

Add customer reference location fields (or separate versioned `customer_locations`) with `latitude`, `longitude`, `verified_by`, `verified_at`, `source`, and a confirmation flag. Do **not** claim future customer locations were in the schema already.

If a visit is both manually reported and field checked-in, **link** them through a stable reference rather than counting both as separate visits. The foundation's `marketing_activities` are manual notes; field visits are verified-evidence attempts. Preserve both source labels.

## 9. API proposal (foundation-mode only)

- `POST /api/workforce/visits/check-ins` — authenticated visit initiation/check-in with customer/lead, location data, optional evidence upload token/id, short notes, idempotency key. Identity from validated server session. Server time authoritative.
- `POST /api/workforce/visits/:id/check-out` — optional outcome, follow-up, fresh location/photo, idempotent finalize.
- `GET /api/workforce/visits?from=&to=&employee=&status=` — scoped visit list + paging.
- `GET /api/workforce/visits/:id` — scoped detail; signed private-photo URL only through existing document authorization.
- `POST /api/workforce/visits/:id/reviews` — managers review with reason; immutable review event; disallow self-review.
- `PATCH /api/workforce/customers/:id/location` or an existing master-location endpoint — permission-gated, audited site-pin verification.

For evidence, extend `POST /api/uploads` + `/complete` to accept `field-visit-evidence` with visit/attempt linkage and expiry, or create a short-lived pending-upload/visit-claim workflow. **Do not allow an arbitrary uploaded photo to be attached to another person's visit**. If the photo uploads before check-in, create a short-lived server attempt and consume it exactly once in the visit transaction. Clean up abandoned pending objects.

Keep the same real Auth, Drizzle, Postgres, private Storage, Zod validation, access scopes, session-aware cache and audit conventions already implemented.

## 10. UX integration and module impact

| Module | Change | Not changing |
|---|---|---|
| **Sales & Marketing** | Add **My Field Day → Check In** / My Visits; customer/lead and purpose prefilled from plan where possible | Quote → Order → Delivery → Invoice → Collection business rules |
| **Employees → Field Team** | Change production concept to **Last Check-ins**, **Visit History**, **Needs Review**; map pin is recorded event, not live person. Show last checked-in time, accuracy, evidence and review | Access & Roles, Directory, identity and manager scope |
| **Employees → Activity Summary** | Read recent visits from verified visit events; show a clear evidence label and link to visit detail | Existing manual activity/reports |
| **Reports** | Add **Field Visit Report** with date, employee, customer/lead, check-in, quality/review status, evidence count, outcome; print/export from canonical Reports only | Update 10 grouped report catalogue and shared print shell |
| **Marketing Targets/Score** | Keep `VERIFIED_CUSTOMER_VISIT` points unavailable until criteria are approved; count evidence-assisted visits separately meanwhile | Commercial money/points must remain derived from real ERP records |
| **Customers** | Optional manager-approved location pin/address helper; last visit summary | Financial ledger and customer master ownership |
| **Imports, Inventory, Accounts** | **No changes** | Landed cost, FIFO, receivables, accounting |
| **Settings** | Minimal policy: site distance/accuracy guidance, optional photo rule, retention/review roles | No new top-level GPS Settings module |

No new top-level navigation destination. On the foundation `/backend` screens, link to existing management/workforce areas. The old `/app` live-tracking mock screen stays demo-only until cutover, with explicit “Mock” labeling.

## 11. Privacy and legal review

Location records are personal data, and clinical-site photos may incidentally capture people or health-related information. Bangladesh has a **Personal Data Protection Act, 2026** that explicitly includes location data and employee-related profiling concepts. Obtain legal review of employee notices/appropriate lawful basis, role access, usage restrictions, retention/deletion handling and any overseas processing through Supabase/Vercel before deployment; do not assume browser permission alone satisfies the organization's legal obligations.

Suggested product defaults **pending client/legal signoff**: capture only on employee-initiated work check-in/out; no off-duty tracking, no always-on location watches, strict SELF/TEAM/authorized-manager access, no public photo URLs, limited employee-visible history, retention policy (for example, pilot: shorter photo retention than visit metadata) with legal hold/backup reconciliation. Avoid automated disciplinary decisions or face recognition.

Official law: https://bdlaws.minlaw.gov.bd/act-details-1692.html?lang=en

## 12. Release assessment

**High-value, manageable feature**, because the database, authenticated employee directory, marketing activities, private uploads, management roles and reports already exist. The new build is mainly one durable evidence-linked visit workflow, a mobile-first camera/location UI, and management/report integration.

**Do not call it fully verified attendance or real-time GPS tracking.** Position + photo + server time is better than an unchecked text note, especially when paired with appropriate review and warnings. It remains circumstantial, falsifiable evidence.

**Deploy only after foundation staging tests and privacy review.** Do not switch the public mock ERP to production foundation mode just to demonstrate this feature.
