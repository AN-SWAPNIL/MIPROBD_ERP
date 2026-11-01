import "../server/config.js";
import { eq, inArray } from "drizzle-orm";
import { employees, sessions } from "../database/schema.js";
import { createContext } from "../server/foundation/context.js";

async function main() {
  const ctx = createContext();
  const apply = process.argv.includes("--apply");
  const suite=process.argv.find((arg)=>arg.startsWith("--suite="))?.slice(8);
  if(suite&&!['visit','dashboard','security','postings','outbox','paging','opening','openingpost','open-browser','restricted','sales-overview','update13-browser','sales-read-browser','sales-read','sales-flow','ledger','glrace','stock-holds','ledger-layout','stock-controls','returns','payroll','supplier-claims'].includes(suite))throw new Error("Use an explicitly supported test suite selector.");
  try {
    const { data, error } = await ctx.admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Error("Cannot inspect test identities");
    // Reserved exclusively for hosted test suites; never match employee/company addresses.
    const pattern=suite ? new RegExp(`^backend-${suite}-\\d+-[a-f0-9-]{36}@example\\.invalid$`) : /^backend-(admin|sales|super-admin|import-officer|warehouse-manager|sales-executive|accounts|managing-director|sales-manager)-[a-f0-9-]{36}@example\.invalid$/;
    const temporary = data.users.filter((user) => pattern.test(user.email ?? ""));
    console.log("Temporary hosted integration identities found:", temporary.length);
    if (!apply || !temporary.length) return;
    try {
      const rows = await ctx.db.select().from(employees).where(inArray(employees.authUserId, temporary.map((user) => user.id)));
      for (const row of rows) await ctx.db.transaction(async (tx) => {
        await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.employeeId, row.id));
        await tx.update(employees).set({ status: "Inactive", authUserId: null }).where(eq(employees.id, row.id));
      });
      console.log("Matching test employees deactivated; audit preserved.");
    } catch { throw new Error("Database revocation must succeed before Auth deletion; retry test cleanup when connected."); }
    for (const user of temporary) {
      const { error } = await ctx.admin.auth.admin.deleteUser(user.id);
      if (error) throw new Error("Temporary test identity deletion failed");
    }
    console.log("Temporary Auth identities removed. Existing employees/business records unchanged.");
  } finally { await ctx.client.end(); }
}
main().catch(() => { console.error("Test cleanup could not finish; credentials and identities withheld."); process.exitCode = 1; });
