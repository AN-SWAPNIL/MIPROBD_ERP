import { and, desc, eq, sql } from "drizzle-orm";
import { quotations } from "../database/schema.js";
import { hostedHarness } from "../server/testing/hosted.js";
import { printBackendBrowserSmoke } from "./print-backend-browser-smoke.js";

async function main() {
  if (process.env.RUN_BACKEND_BROWSER_TESTS !== "true") throw new Error("Opt into development browser checks with RUN_BACKEND_BROWSER_TESTS=true.");
  const h = await hostedHarness("printlayout");
  try {
    const admin = await h.employee("Super Admin");
    const [quote] = await h.ctx.db.select({ id: quotations.id }).from(quotations).where(and(sql`${quotations.snapshot}->>'customerName' like 'DEV TEST Print Hospital %'`, eq(quotations.total, "3.69"))).orderBy(desc(quotations.createdAt)).limit(1);
    if (!quote) throw new Error("Run hosted print acceptance first; this check only reuses its labelled TEST quotations.");
    await printBackendBrowserSmoke(h.bases[0], admin.email, h.password, [["quotation", quote.id, "3.69"]], { readOnly: true });
  } finally { await h.close(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Print layout verification failed"); process.exitCode = 1; });
