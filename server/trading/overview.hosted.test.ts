import test from "node:test";
import assert from "node:assert/strict";
import { SalesOverviewSchema } from "../../src/domains/sales/overviewContracts.js";
import { hostedHarness } from "../testing/hosted.js";
test("hosted Sales snapshot: canonical read parity, assigned-record privacy and restricted payment accounts", { skip: process.env.RUN_HOSTED_UPDATE13_TESTS !== "true", timeout: 180000 }, async () => {
  const h = await hostedHarness("sales-overview");
  try {
    const admin = await h.employee("Super Admin"); const sales = await h.employee("Sales Executive"); const officer = await h.employee("Import Officer");
    const started = Date.now(); const result = SalesOverviewSchema.parse(await h.expect("/sales/overview", admin.token));
    console.log(`Sales snapshot loaded in ${Date.now() - started}ms with one authenticated request.`);
    for (const [key, path] of [["customers", "/customers"], ["orders", "/orders"], ["collections", "/collections"], ["quotations", "/quotations"], ["invoices", "/invoices"], ["deliveries", "/deliveries"]] as const) {
      const original = await h.expect(path, admin.token); assert.deepEqual(result[key].map((r) => r.id).sort(), original.map((r: { id: string }) => r.id).sort());
    }
    assert.ok(result.accounts.every((row) => row.balance === "Restricted"));
    const own = SalesOverviewSchema.parse(await h.expect("/sales/overview", sales.token));
    for (const key of ["customers", "orders", "deliveries", "quotations", "invoices", "collections"] as const) assert.equal(own[key].length, 0, `New sales employee must not see other people's ${key}`);
    assert.equal((await h.call("/sales/overview", officer.token)).status, 403);
  } finally { await h.close(); }
});
