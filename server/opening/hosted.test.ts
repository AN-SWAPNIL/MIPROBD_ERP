import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { eq, sql } from "drizzle-orm";
import { openingDrafts, openingSources } from "../../database/schema.js";
import type { OpeningDraft, OpeningSource } from "../../src/domains/opening/contracts.js";
import { hostedHarness } from "../testing/hosted.js";

test("hosted opening review: private upload, source hash, fresh validation, separate approval and unchanged business balances", { skip: process.env.RUN_HOSTED_UPDATE13_TESTS !== "true", timeout: 240000 }, async () => {
  const h = await hostedHarness("opening");
  try {
    const admin = await h.employee("Super Admin", ["view_sensitive_cost"]); const approver = await h.employee("Super Admin", ["view_sensitive_cost"]); const sales = await h.employee("Sales Executive");
    await h.expect("/opening/drafts/not-a-valid-id", admin.token, undefined, 422);
    const position = async () => {
      // Other isolated suites may post concurrently; review must create no journals for any of its actors.
      const actors = sql.join(h.identities.map((actor) => sql`${actor.id}`), sql`, `);
      return (await h.ctx.db.execute(sql`select
        (select count(*)::int from erp_private.stock_movements where created_by in (${actors})) stock_journals,
        (select count(*)::int from erp_private.account_transactions where created_by_user_id in (${actors})) cash_journals,
        (select count(*)::int from erp_private.customer_entries where created_by in (${actors})) customer_journals`)).rows[0];
    };
    const before = await position(); const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Opening Stock"); sheet.getCell("A1").value = "DEV TEST opening count"; sheet.getCell("B1").value = 3;
    const bytes = Buffer.from(await book.xlsx.writeBuffer());
    const reservation = await h.expect("/opening/sources/upload", admin.token, { fileName: `DEV TEST ${h.suffix}.xlsx`, sizeBytes: bytes.length }, 201);
    const uploaded = await fetch(reservation.signedUrl, { method: "PUT", headers: { "Content-Type": reservation.mimeType }, body: bytes }); assert.equal(uploaded.ok, true);
    const source = await h.expect(`/opening/sources/${reservation.id}/complete`, admin.token, {}) as OpeningSource; assert.match(source.sha256!, /^[a-f0-9]{64}$/); assert.equal(source.profile?.sheets[0].cells.length, 0);
    assert.equal((await h.call(`/opening/sources/${source.id}`, sales.token)).status, 403);
    const cells = await h.expect(`/opening/sources/${source.id}/cells?sheet=Opening%20Stock`, admin.token); assert.equal(cells.rows.length, 2);
    const masters = await h.expect("/opening/masters?kind=Stock", admin.token); assert.ok(masters.rows.length);
    let draft = await h.expect("/opening/drafts", admin.token, { name: `DEV TEST ${h.suffix}`, sourceId: source.id, data: { asOfDate: "2026-10-01", proofReference: "DEV TEST proof", lines: [{ id: "line-1", kind: "Stock", entityId: masters.rows[0].id, sourceSheet: "Opening Stock", sourceCell: "B1", sourceReference: "DEV TEST approved cost", quantity: "3", unitCostBdt: "33.3333333333", condition: "Saleable", lot: h.suffix, batch: h.suffix, manufacturingDate: "2026-01-01", expiryDate: "2028-01-01", location: "DEV TEST" }], exceptionResolutions: [] } }, 201) as OpeningDraft;
    await h.expect(`/opening/drafts/${draft.id}/approve`, approver.token, { version: draft.version }, 409);
    draft = await h.expect(`/opening/drafts/${draft.id}/validate`, admin.token, { version: draft.version }); assert.equal(draft.state, "Validated"); assert.equal(draft.preview!.totals.stockCostBdt, "100.00");
    draft = await h.expect(`/opening/drafts/${draft.id}/preview`, admin.token, { version: draft.version }); assert.equal(draft.state, "Previewed");
    await h.expect(`/opening/drafts/${draft.id}`, approver.token, { name: draft.name, data: draft.data, version: draft.version - 1 }, 409, { method: "PATCH" });
    // An edit invalidates the preview; Super Admin may approve after a fresh review.
    draft = await h.expect(`/opening/drafts/${draft.id}`, approver.token, { name: draft.name, data: draft.data, version: draft.version }, 200, { method: "PATCH" });
    draft = await h.expect(`/opening/drafts/${draft.id}/validate`, approver.token, { version: draft.version }); draft = await h.expect(`/opening/drafts/${draft.id}/preview`, approver.token, { version: draft.version });
    draft = await h.expect(`/opening/drafts/${draft.id}/approve`, approver.token, { version: draft.version }); assert.equal(draft.state, "Approved");
    await h.expect(`/opening/drafts/${draft.id}`, admin.token, { version: draft.version, name: "Tampered", data: draft.data }, 423, { method: "PATCH" });
    await assert.rejects(h.ctx.db.update(openingDrafts).set({ name: "Tampered" }).where(eq(openingDrafts.id, draft.id)));
    await assert.rejects(h.ctx.db.update(openingSources).set({ fileName: "Tampered.xlsx" }).where(eq(openingSources.id, source.id)));
    assert.deepEqual(await position(), before, "Review must not create imports, stock movements, cash or customer postings");
  } finally { await h.close(); }
});
