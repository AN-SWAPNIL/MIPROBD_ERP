import test from "node:test";
import assert from "node:assert/strict";
import { eq, inArray, sql } from "drizzle-orm";
import sharp from "sharp";
import { customerLocations, customers, documents, employees, fieldVisitAttempts, fieldVisitEvents, fieldVisits, products } from "../../database/schema.js";
import { businessDate } from "../../src/lib/date.js";
import { visitDetailSchema, visitPolicySchema } from "../../src/domains/marketing/visitContracts.js";
import { PersistentReportSchema } from "../../src/domains/reports/persistentContracts.js";
import { hostedHarness } from "../testing/hosted.js";

test("hosted check-ins: private attempts/photos, independent team reviews, immutable events and connected reports", { skip: process.env.RUN_HOSTED_VISIT_TESTS !== "true", timeout: 600000 }, async () => {
  if (process.env.RUN_VISIT_BROWSER_TESTS === "true") process.env.APP_URL = "http://localhost:5197";
  const h = await hostedHarness("visit"); const { expect, ctx, key } = h;
  let productId: string | undefined; let customerId: string | undefined;
  try {
    const admin = await h.employee("Super Admin"); const md = await h.employee("Managing Director"); const manager = await h.employee("Sales Manager"); const outsiderManager = await h.employee("Sales Manager"); const sales = await h.employee("Sales Executive"); const outsider = await h.employee("Sales Executive"); const directory = await h.employee("Accounts");
    for (const [actor, parent] of [[sales, manager], [outsider, outsiderManager]]) {
      const [r] = await ctx.db.select().from(employees).where(eq(employees.id, actor.id));
      await expect(`/workforce/employees/${actor.id}`, admin.token, { version: r.version, name: r.name, title: r.title, department: r.department, territory: r.territory, phone: r.phone, employeeCode: r.employeeCode.slice(0, 40), managerId: parent.id, reason: "DEV TEST field reporting team" }, 200, { method: "PATCH" });
    }
    for (const actor of [sales, outsider, manager, outsiderManager]) actor.token = (await expect("/auth/login", "", { email: actor.email, password: h.password })).token;
    await ctx.db.update(employees).set({ permissionOverrides: [{ permission: "users", action: "view", effect: "ALLOW" }, { permission: "marketing", action: "view", effect: "ALLOW" }] }).where(eq(employees.id, directory.id));
    const product = await expect("/products", admin.token, { code: `TEST-VISIT-${h.suffix}`, name: "DEV TEST Field Dialyzer", family: "Dialyzer", variant: "Test", unit: "pcs" }, 201); productId = product.id;
    const lead = await expect("/workforce/leads", sales.token, { organization: `DEV TEST Visit Hospital ${h.suffix}`, organizationType: "Hospital", contact: "Test Procurement", phone: "0123456789", source: "DEV TEST field check-in", productIds: [product.id], stage: "NEW" }, 201, key("lead"));
    const converted = await expect(`/workforce/leads/${lead.id}/convert`, sales.token, { version: lead.version, paymentTerms: "TEST credit", creditLimit: "0" }, 201, key("convert")); customerId = converted.customerId;
    const note = await expect("/workforce/activities", sales.token, { type: "CUSTOMER_VISIT", occurredAt: new Date().toISOString(), customerId, purpose: "DEV TEST linked visit note", remarks: "Procurement meeting", status: "Submitted", productIds: [product.id] }, 201, key("note"));
    const report = async (id: string, token = sales.token, extra = "") => PersistentReportSchema.parse(await expect(`/reports/${id}?from=${businessDate()}&to=${businessDate()}&employee=${encodeURIComponent(sales.id)}${extra}`, token));
    const before = await report("employee-performance"); const scoreBefore = before.rows[0].score;
    const policy = visitPolicySchema.parse(await expect("/workforce/visit-policy", sales.token)); assert.equal(policy.scoringEnabled, false);
    const expiredId=`test-expired-attempt-${h.suffix}`;
    await ctx.db.insert(fieldVisitAttempts).values({id:expiredId,employeeId:sales.id,customerId,subject:"DEV TEST expired capture",purpose:"DEV TEST attempt expiry",policy:{version:policy.version,data:policy.data},expiresAt:new Date(Date.now()-60000)});
    await expect("/workforce/visits/check-ins",sales.token,{attemptId:expiredId,position:null,locationReason:"DEV TEST denied location",photoMethod:"NONE",photoReason:"DEV TEST photography prohibited"},409,key("expired-attempt"));
    const env = process.env.NODE_ENV;
    try { process.env.NODE_ENV = "production"; if (!policy.data.privacyApproved) await expect("/workforce/visits/attempts", sales.token, { customerId, purpose: "DEV TEST privacy gate" }, 423, key("privacy-gate")); } finally { process.env.NODE_ENV = env; }
    await expect(`/workforce/customers/${customerId}/location`, md.token, { version: 0, latitude: 23.8103, longitude: 90.4125, source: "DEV TEST confirmed site reference", reason: "DEV TEST manager confirmation" }, 200, { method: "PATCH" });
    await expect(`/workforce/customers/${customerId}/location`, outsiderManager.token, undefined, 404);
    await expect("/workforce/visits/attempts", outsider.token, { customerId, purpose: "DEV TEST forbidden other contact" }, 404, key("wrong-contact"));
    await expect("/workforce/visits/attempts", sales.token, { customerId, purpose: "DEV TEST forged employee", employeeId: outsider.id }, 422, key("forged"));
    const attempt = await expect("/workforce/visits/attempts", sales.token, { customerId, purpose: "DEV TEST procurement check-in" }, 201, key("attempt"));
    const bytes = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#0891b2" } }).png().toBuffer();
    const uploadBody = { purpose: "field-visit-evidence", visitAttemptId: attempt.id, fileName: "DEV-TEST-visit.png", mimeType: "image/png", sizeBytes: bytes.length };
    await expect("/uploads", outsider.token, uploadBody, 404);
    const photo = await expect("/uploads", sales.token, uploadBody, 201);
    const stored = await ctx.admin.storage.from(photo.bucket).uploadToSignedUrl(photo.path, photo.token, bytes, { contentType: "image/png" }); assert.equal(stored.error, null);
    await expect(`/uploads/${photo.id}/complete`, sales.token, {});
    await expect(`/documents/${photo.id}`, manager.token, undefined, 403, {});
    const fresh = () => ({ latitude: 23.8103, longitude: 90.4125, accuracy: 12, capturedAt: new Date().toISOString() });
    const body = { attemptId: attempt.id, position: fresh(), photoId: photo.id, photoMethod: "FILE_SELECTED", activityId: note.id };
    const visit = await expect("/workforce/visits/check-ins", sales.token, body, 201, key("checkin"));
    assert.equal((await expect("/workforce/visits/check-ins", sales.token, body, 201, { ...key("checkin"), instance: 1 })).id, visit.id);
    await expect("/workforce/visits/check-ins", sales.token, { ...body, position: fresh() }, 409, key("replay"));
    const detail = visitDetailSchema.parse(await expect(`/workforce/visits/${visit.id}`, sales.token)); assert.equal(detail.visit.employeeId, sales.id); assert.equal(detail.visit.quality, "LOCATION_CAPTURED"); assert.equal(detail.visit.match, "APPROX_MATCH"); assert.equal(detail.visit.review, "Pending"); assert.equal(detail.site?.version, 1); assert.equal(detail.events.length, 2);
    assert.deepEqual(detail.events.map((e)=>e.type),["CHECK_IN","PHOTO_ATTACHED"],"Capture precedes its photo event in the timeline");
    assert.equal((await expect("/workforce/visits/active", sales.token)).id, visit.id);
    assert.equal((await expect(`/workforce/visits?customer=${customerId}&search=procurement`, manager.token)).rows.some((r: { id: string }) => r.id === visit.id), true);
    for (const actor of [outsider, outsiderManager, directory]) {
      assert.equal((await expect("/workforce/visits", actor.token)).rows.some((r: { id: string }) => r.id === visit.id), false);
      await expect(`/workforce/visits/${visit.id}`, actor.token, undefined, 404);
      await expect(`/documents/${photo.id}`, actor.token, undefined, 404);
    }
    assert.equal((await expect(`/documents/${photo.id}`, manager.token)).expiresIn, 60);
    await expect(`/workforce/visits/${visit.id}/reviews`, sales.token, { version: 1, decision: "Accepted", reason: "DEV TEST self review forbidden" }, 403, key("self-review"));
    await ctx.db.update(employees).set({permissionOverrides:[{permission:"marketing",action:"approve",effect:"ALLOW"}]}).where(eq(employees.id,sales.id));
    await expect(`/workforce/visits/${visit.id}/reviews`,sales.token,{version:1,decision:"Accepted",reason:"DEV TEST even authorized author cannot self-review"},403,key("self-review-with-approval"));
    await ctx.db.update(employees).set({permissionOverrides:[]}).where(eq(employees.id,sales.id));
    // MD has approval without marketing edit; this must not depend on edit permission.
    await expect(`/workforce/visits/${visit.id}/reviews`, md.token, { version: 1, decision: "Accepted", reason: "DEV TEST independently reviewed evidence" }, 200, key("review"));
    await expect(`/workforce/visits/${visit.id}/complete`, sales.token, { version: 1, outcome: "DEV TEST stale completion" }, 409, key("stale"));
    const nextFollowUpAt = new Date(Date.now() + 86400000).toISOString();
    await expect(`/workforce/visits/${visit.id}/complete`, sales.token, { version: 2, outcome: "DEV TEST procurement discussion completed", nextFollowUpAt }, 200, key("complete"));
    assert.equal(await expect("/workforce/visits/active", sales.token), null);
    assert.ok((await expect("/workforce/follow-ups", sales.token)).rows.some((r: { purpose: string }) => r.purpose === "DEV TEST procurement discussion completed"));
    await expect(`/workforce/customers/${customerId}/location`, md.token, { version: 1, latitude: 24.1, longitude: 90.6, source: "DEV TEST separate revised reference", reason: "DEV TEST future visit reference only" }, 200, { method: "PATCH" });
    assert.equal((await expect(`/workforce/visits/${visit.id}`, sales.token)).site.version, 1);
    const secondAttempt = await expect("/workforce/visits/attempts", sales.token, { leadId: lead.id, purpose: "DEV TEST exception visit" }, 201, key("second-attempt"));
    const exception = { attemptId: secondAttempt.id, position: null, locationReason: "DEV TEST permission denied", photoMethod: "NONE", photoReason: "DEV TEST hospital prohibits photography" };
    await expect("/workforce/visits/check-ins", sales.token, { ...exception, photoId: photo.id, photoMethod: "FILE_SELECTED" }, 422, key("reuse-photo"));
    const concurrent = await Promise.all([h.call("/workforce/visits/check-ins", sales.token, exception, { ...key("concurrent-a") }), h.call("/workforce/visits/check-ins", sales.token, exception, { ...key("concurrent-b"), instance: 1 })]);
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
    const secondId = concurrent.find((r) => r.status === 201)!.data.id;
    assert.equal((await expect(`/workforce/visits/${secondId}`, sales.token)).visit.quality, "NO_LOCATION");
    const thirdAttempt = await expect("/workforce/visits/attempts", sales.token, { customerId, purpose: "DEV TEST active duplicate denied" }, 201, key("third-attempt"));
    await expect("/workforce/visits/check-ins", sales.token, { ...exception, attemptId: thirdAttempt.id }, 409, key("active-duplicate"));
    await expect(`/workforce/visits/${secondId}/void`, manager.token, { version: 1, reason: "DEV TEST exception void retained" }, 200, key("void"));
    await expect(`/workforce/visits/${secondId}/complete`, sales.token, { version: 2, outcome: "DEV TEST terminal correction denied" }, 423, key("void-complete"));
    const after = await report("employee-performance"); assert.equal(after.rows[0].score, scoreBefore); assert.equal(after.rows[0].check_ins, "1"); assert.equal(after.rows[0].accepted_visits, "1"); assert.equal(after.rows[0].unique_visit_records, "1", "linked manual note is not counted as another visit"); assert.equal(after.rows[0].sales, before.rows[0].sales); assert.equal(after.rows[0].collections, before.rows[0].collections);
    const visits = await report("visit-verification"); assert.equal(visits.rowCount, 2); assert.equal(visits.columns.length, 9); assert.ok(!JSON.stringify(visits).includes("signedUrl"));
    assert.equal((await report("visit-verification", manager.token, "&captureQuality=NO_LOCATION")).rowCount, 1);
    assert.equal((await report("visit-verification", md.token, "&reviewStatus=Accepted")).rowCount, 1);
    assert.equal((await report("visit-verification", outsider.token)).rowCount, 0);
    const print = await expect(`/reports/visit-verification/print?from=${businessDate()}&to=${businessDate()}&employee=${sales.id}`, sales.token); assert.deepEqual(print.rows, visits.rows);
    const response = await fetch(`${h.bases[0]}/reports/visit-verification/export?from=${businessDate()}&to=${businessDate()}&employee=${sales.id}`, { headers: { Authorization: `Bearer ${sales.token}` } }); assert.equal(response.status, 200); const csv = await response.text(); assert.ok(csv.includes(detail.visit.reference)); assert.ok(!csv.includes("23.8103") && !csv.includes("token="));
    const timeline = await report("employee-activity"); assert.equal(timeline.rows.find((r) => r.reference === detail.visit.reference)?.verification, "EVIDENCE_ASSISTED");
    await assert.rejects(ctx.db.update(fieldVisits).set({ purpose: "Tampered", version: 4 }).where(eq(fieldVisits.id, visit.id)));
    await assert.rejects(ctx.db.update(fieldVisits).set({ review: "Rejected", version: 4 }).where(eq(fieldVisits.id, visit.id)), "matching append-only event is mandatory");
    await assert.rejects(ctx.db.delete(fieldVisitEvents).where(eq(fieldVisitEvents.visitId, visit.id)));
    await assert.rejects(ctx.db.update(customerLocations).set({ latitude: "0" }).where(eq(customerLocations.customerId, customerId!)));
    await assert.rejects(ctx.db.update(documents).set({ imageInfo: { width: 64, height: 48, sha256: "tampered" } }).where(eq(documents.id, photo.id)));
    const counts = (await ctx.db.execute<{ count: number }>(sql`select count(*)::int count from erp_private.customer_entries where customer_id=${customerId}`)).rows[0]; assert.equal(counts.count, 0);
    const rls = (await ctx.db.execute<{ count: number }>(sql`select count(*)::int count from pg_tables where schemaname='erp_private' and tablename in ('field_visits','field_visit_attempts','field_visit_events','field_visit_policies','customer_locations') and rowsecurity`)).rows[0]; assert.equal(rls.count, 5);
    if (process.env.RUN_VISIT_BROWSER_TESTS === "true") { const { visitBrowserSmoke } = await import("../../scripts/visit-browser-smoke.js"); await visitBrowserSmoke(h.bases[0], md.email, sales.email, h.password, customerId!, sales.id); }
    console.log("Hosted field visits: team/privacy boundaries, uploads, replay/concurrency, completion/review, immutable evidence, reports and financial isolation passed.");
  } catch(error) {
    console.error("Field-visit acceptance failed:",error instanceof Error?error.message:"Unknown test failure");throw error;
  } finally {
    try {
      if (customerId) await ctx.db.update(customers).set({ active: false }).where(eq(customers.id, customerId));
      if (productId) await ctx.db.update(products).set({ active: false }).where(eq(products.id, productId));
      await ctx.db.update(employees).set({ managerId: null }).where(inArray(employees.id, h.identities.map((r) => r.id)));
    } finally { await h.close(); }
  }
});
