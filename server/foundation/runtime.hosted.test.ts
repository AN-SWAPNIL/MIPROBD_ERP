import test from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { hostedHarness } from "../testing/hosted.js";
import { databasePrivileges, isRestrictedRuntime } from "./database-security.js";
test("hosted restricted database: seven API roles remain scoped and browser identities cannot read private ERP", { skip: process.env.RUN_HOSTED_UPDATE13_TESTS !== "true" || !process.env.DATABASE_RUNTIME_URL, timeout: 240000 }, async () => {
  const h = await hostedHarness("restricted");
  try {
    assert.equal(isRestrictedRuntime(await databasePrivileges(h.ctx)), true);
    for (const [role, inventory] of [["Super Admin", 200], ["Managing Director", 200], ["Import Officer", 403], ["Warehouse Manager", 200], ["Accounts", 403], ["Sales Manager", 200], ["Sales Executive", 403]] as const) {
      console.log(`Restricted runtime: verifying ${role}.`);
      const actor = await h.employee(role); await h.expect("/inventory/stock/page", actor.token, undefined, inventory);
      assert.equal((await h.call("/settings/invitations", actor.token)).status, role === "Super Admin" ? 200 : 403);
    }
    const [row] = (await h.ctx.db.execute<{ privateExposure: boolean; owned: boolean; ddl: boolean }>(sql`select
      has_schema_privilege('anon','erp_private','USAGE') or has_schema_privilege('authenticated','erp_private','USAGE') "privateExposure",
      exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='erp_private' and c.relowner=(select oid from pg_roles where rolname=current_user)) owned,
      has_schema_privilege(current_user,'erp_private','CREATE') ddl`)).rows;
    assert.deepEqual(row, { privateExposure: false, owned: false, ddl: false });
  } finally { await h.close(); }
});
