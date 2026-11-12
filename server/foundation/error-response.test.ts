import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { errorResponse } from "./error-response.js";
import { HttpError } from "./errors.js";
import { inputIssues, responseIssues } from "../../src/lib/api/validation.js";
import { safeApiMessage, safeErrorMessage } from "../../src/lib/api/safeErrors.js";

test("input errors retain field/row identity without reflecting rejected values, unknown keys or regex internals", () => {
  const parsed = z.object({ lines: z.array(z.object({ quantity: z.string().regex(/^\d+$/), email: z.email() }).strict()) }).strict().safeParse({ lines: [{ quantity: "private-value", email: "private-email", "password-secret-key": "private-secret" }] });
  assert.equal(parsed.success, false); if (parsed.success) return;
  const result = errorResponse(parsed.error);
  assert.equal(result.status, 422); assert.ok(result.body.errors?.some((issue) => issue.field === "lines.0.quantity"));
  const json = JSON.stringify(result.body);
  for (const secret of ["private-value", "private-email", "password-secret-key", "private-secret", "pattern"]) assert.ok(!json.includes(secret), secret);
  assert.ok(inputIssues(parsed.error.issues).some((issue) => issue.message === "Enter a valid email address."));
});

test("SQL/provider/internal errors are private, while safe conflicts and support references remain usable", () => {
  const requestId = "51aa01ee-fd2c-4fae-a443-d61d83ca0c50";
  for (const error of [new Error("Failed query: select private_secret from erp_private.sessions"), new HttpError(502, "Provider failed at https://private.invalid?token=private-secret")]) {
    const result = errorResponse(error, requestId);
    assert.ok(result.status >= 500); assert.match(result.body.message, /temporarily unavailable/); assert.ok(result.body.message.includes(requestId));
    assert.ok(!JSON.stringify(result.body).includes("private-secret")); assert.ok(!JSON.stringify(result.body).includes("erp_private"));
  }
  const unique = errorResponse({ cause: { code: "23505", constraint: "product_code_lower_unique", detail: "Private conflicting row" } });
  assert.equal(unique.status, 409); assert.equal(unique.body.errors?.[0].field, "code"); assert.ok(!JSON.stringify(unique.body).includes("Private"));
  assert.equal(errorResponse(new HttpError(403, "You cannot edit this record.")).body.message, "You cannot edit this record.");
  assert.equal(errorResponse({ cause: { code: "23505", constraint: "__proto__" } }).status, 409);
});

test("shared UI errors hide contract dumps, credentials and network internals, but keep helpful validation", () => {
  for (const text of ["API contract validation failed /api/private", "[DecimalError] Invalid argument: secret", "postgresql://user:private-secret@db", 'Could not parse [{"code":"invalid_type","input":"private-secret"}]', "Request failed sb_secret_private-key", "ENOENT: cannot read /home/private-secret"]) {
    const shown = safeErrorMessage(new Error(text)); assert.ok(!shown.includes("private-secret")); assert.ok(!shown.includes(text));
  }
  assert.match(safeErrorMessage(new TypeError("Failed to fetch")), /connection/);
  assert.equal(safeErrorMessage(new Error("Expiry must be after manufacturing.")), "Expiry must be after manufacturing.");
  assert.ok(!safeApiMessage(500, "private-internal-error").includes("private-internal-error"));
  assert.equal(responseIssues(Array.from({ length: 100 }, () => ({ field: "lines.0.quantity", message: "Enter a positive quantity." }))).length, 25);
  assert.equal(responseIssues([{ field: "https://private.invalid", message: "Bad field" }]).length, 0);
});
