import test from "node:test";
import assert from "node:assert/strict";
import { hostedHarness } from "../testing/hosted.js";
import { PersistentReportSchema, ReportCatalogueEntrySchema } from "../../src/domains/reports/persistentContracts.js";
import { businessDate } from "../../src/lib/date.js";

test("hosted reports: every available query, filtered outputs and access boundaries", { skip: process.env.RUN_HOSTED_REPORT_TESTS !== "true", timeout: 420000 }, async () => {
  const h = await hostedHarness("report");
  try {
    const admin = await h.employee("Super Admin", ["view_sensitive_cost", "view_profit", "view_financial_position"]);
    const query = `from=2020-01-01&to=${businessDate()}`;
    const catalogue = ReportCatalogueEntrySchema.array().parse(await h.expect("/reports/catalogue", admin.token));
    for (const report of catalogue) {
      if (!report.available) { await h.expect(`/reports/${report.id}?${query}`, admin.token, undefined, 503); continue; }
      const data = PersistentReportSchema.parse(await h.expect(`/reports/${report.id}?${query}`, admin.token));
      assert.equal(data.id, report.id); assert.ok(data.rows.length <= 50);
      for (const [key, options] of Object.entries(data.options)) if (options.length) {
        PersistentReportSchema.parse(await h.expect(`/reports/${report.id}?${query}&${key}=${encodeURIComponent(options[0].value)}`, admin.token));
      }
      if (report.supportsGrouping) PersistentReportSchema.parse(await h.expect(`/reports/${report.id}?${query}&grouping=Monthly`, admin.token));
    }
    await h.expect(`/reports/customer-list?${query}&from=invalid`, admin.token, undefined, 422);
    await h.expect(`/reports/customer-list?${query}&unknown=1`, admin.token, undefined, 422);
    await h.expect("/reports/catalogue", "", undefined, 401);
    console.log(`Persistent report catalogue: ${catalogue.filter((r) => r.available).length} SQL reports verified.`);
  } finally { await h.close(); }
});
