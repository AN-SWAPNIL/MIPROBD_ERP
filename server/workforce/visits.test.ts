import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { assessPosition, attemptInput, checkinInput, visitListInput, visitReviewInput } from "./visit-input.js";
import { validateVisitImage } from "./visit-images.js";
import { defaultVisitPolicy, positionSchema } from "../../src/domains/marketing/visitContracts.js";
import { uploadSchema } from "../foundation/contracts.js";
import { reportCatalog } from "../../src/domains/reports/reportCatalog.js";
import { fieldVisitReport } from "./visit-reports.js";
import { queryInput } from "../reports/common.js";
import type { User } from "../../src/types/index.js";
import { reportPresentation } from "../../src/domains/reports/reportPresentation.js";
import type { PersistentReport } from "../../src/domains/reports/persistentContracts.js";

const now = new Date("2026-10-24T08:00:00Z");
const point = { latitude: 23.8103, longitude: 90.4125, accuracy: 10, capturedAt: now.toISOString() };
test("visit capture distinguishes age, accuracy, site match and missing evidence", () => {
  const assess = (p = point, site?: { latitude: number; longitude: number }) => assessPosition(p, defaultVisitPolicy, now, site);
  assert.deepEqual(assess(), { quality: "LOCATION_CAPTURED", match: "NO_REFERENCE", distanceMeters: null });
  assert.equal(assess(point, point).match, "APPROX_MATCH");
  assert.equal(assess({ ...point, accuracy: 200 }, point).match, "UNCERTAIN");
  assert.equal(assess({ ...point, latitude: point.latitude + 0.01 }, point).match, "OUTSIDE");
  assert.equal(assess({ ...point, accuracy: 100 }, { ...point, latitude: point.latitude + 0.001 }).match, "UNCERTAIN");
  assert.equal(assess({ ...point, capturedAt: "2026-10-24T07:59:29Z" }, point).quality, "STALE");
  assert.equal(assess({ ...point, capturedAt: "2026-10-24T08:00:06Z" }, point).quality, "STALE");
  assert.equal(assessPosition(null, defaultVisitPolicy, now).quality, "NO_LOCATION");
  const distant = assess({ ...point, latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }).distanceMeters!;
  assert.ok(Math.abs(distant - 111195.08) < 0.02, "Haversine meters use the mean Earth radius");
});
test("visit input rejects forged identities, invalid coordinates and unexplained exceptions", () => {
  for (const change of [{ latitude: 91 }, { longitude: -181 }, { accuracy: 0 }, { accuracy: Infinity }, { capturedAt: "yesterday" }]) assert.equal(positionSchema.safeParse({ ...point, ...change }).success, false);
  assert.equal(attemptInput.safeParse({ customerId: "a", leadId: "b", purpose: "visit" }).success, false);
  assert.equal(attemptInput.safeParse({ customerId: "a", purpose: "visit", employeeId: "forged" }).success, false);
  const input = { attemptId: "a", position: null, locationReason: "Permission denied", photoMethod: "NONE", photoReason: "Hospital prohibits photos" };
  assert.ok(checkinInput.safeParse(input).success);
  for (const change of [{ employeeId: "other" }, { receivedAt: now.toISOString() }, { quality: "VERIFIED" }, { review: "Accepted" }, { photoReason: "" }, { locationReason: "" }, { photoMethod: "IN_APP_CAMERA" }]) assert.equal(checkinInput.safeParse({ ...input, ...change }).success, false);
  assert.equal(visitReviewInput.safeParse({ version: 1, decision: "Accepted", reason: "" }).success, false);
  assert.ok(visitListInput.safeParse({ customer: "a", from: "2026-10-01", to: "2026-10-24" }).success);
});
test("visit uploads are attempt-bound and compact image-only", () => {
  const upload = { purpose: "field-visit-evidence", visitAttemptId: "a", fileName: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 12000 };
  assert.ok(uploadSchema.safeParse(upload).success);
  for (const change of [{ visitAttemptId: undefined }, { sizeBytes: 307201 }, { mimeType: "application/pdf" }, { importId: "other" }, { employeeId: "other" }, { visitId: "forged" }]) assert.equal(uploadSchema.safeParse({ ...upload, ...change }).success, false);
});
test("visit image validation fully decodes and hashes actual bounded pixels", async () => {
  const bytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#0891b2" } }).png().toBuffer();
  const first = await validateVisitImage(bytes, "image/png"); assert.equal(first.width, 32); assert.equal(first.height, 24); assert.equal(first.sha256.length, 64);
  assert.equal((await validateVisitImage(bytes, "image/png")).sha256, first.sha256);
  for (const [buffer, mime] of [[bytes, "image/jpeg"], [bytes.subarray(0, 40), "image/png"], [Buffer.alloc(307201), "image/png"]] as const) await assert.rejects(validateVisitImage(buffer, mime));
  const huge = await sharp({ create: { width: 2000, height: 10, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(validateVisitImage(huge, "image/png"));
});
test("field visit report reuses the existing card and strict independent filters", () => {
  const report = reportCatalog.filter((r) => r.id === "visit-verification"); assert.equal(report.length, 1); assert.equal(report[0].title, "Field Visit Report");
  const query = queryInput.parse({ from: "2026-10-01", to: "2026-10-24", lead: "x", captureQuality: "NO_LOCATION", reviewStatus: "Pending" });
  const spec = fieldVisitReport(report[0].id, { id: "test", role: "Sales Executive" } as User, query)!;
  assert.ok(spec.dimensions.lead && spec.dimensions.captureQuality && spec.dimensions.reviewStatus);
  assert.ok(spec.columns.every((c) => !["latitude", "longitude", "photoId", "url"].includes(c.key)));
});
test("field visit screen/print groups nine source fields without losing export facts", () => {
  const row = { reference: "VIS-1", timing: "2026-10-24 10:00", employee_label: "Employee | SE-1", subject: "Hospital", details: "Purpose\nOutcome", location_detail: "NO_LOCATION", evidence: "No photo: prohibited", review_detail: "Pending", status: "Completed" };
  const source = { id: "visit-verification", rows: [row], columns: [] } as unknown as PersistentReport;
  const result = reportPresentation(source); assert.equal(result.columns.length, 6); assert.deepEqual(source.rows[0], row);
  for (const value of [row.reference, row.timing, row.subject, row.details, row.evidence, row.review_detail, row.status]) assert.ok(result.columns.some((c) => result.rows[0][c.key]?.includes(value)));
});
