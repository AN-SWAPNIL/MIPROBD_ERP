import "../server/config.js";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { employees } from "../database/schema.js";
import { createContext, audit } from "../server/foundation/context.js";
import { backupDatabase } from "./database.js";
import { attachmentMimes } from "../src/lib/files/attachments.js";
import { privateArtifactPath } from "./private-paths.js";

const args = new Set(process.argv.slice(2));
const privateFolder = privateArtifactPath(process.env.ERP_BOOTSTRAP_DIR, "artifacts/private", true);
async function main() {
  if (!args.has("--apply")) throw new Error("Explicit --apply is required");
  const email = z.email().parse(process.env.SUPER_ADMIN_EMAIL).toLowerCase();
  const name = z.string().trim().min(2).parse(process.env.SUPER_ADMIN_NAME);
  await backupDatabase();
  const ctx = createContext();
  try {
    await ctx.db.transaction(async (tx) => {
      const { sql } = await import("drizzle-orm");
      await tx.execute(sql`select pg_advisory_xact_lock(77612002)`);
      const [current] = await tx.select().from(employees).where(eq(employees.email, email));
      const [admin] = await tx.select().from(employees).where(and(eq(employees.role, "Super Admin"), eq(employees.status, "Active")));
      if (current && (current.role !== "Super Admin" || current.status !== "Active")) throw new Error("Existing employee must not be promoted/reactivated by bootstrap");
      if (admin && admin.email !== email) throw new Error("An administrator already exists; use its employee management workflow");
      if (!current) {
        // No default password or automatic email confirmation. Identity ownership is proven by the invite link.
        const { data, error } = await ctx.admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo: `${ctx.config.origin}/reset-password`, data: { name } } });
        if (error || !data.user || !data.properties?.action_link) throw new Error("Administrator identity provisioning failed");
        const id = `emp-${randomUUID()}`;
        await tx.insert(employees).values({ id, authUserId: data.user.id, name, email, role: "Super Admin", status: "Active", employeeCode: "ADMIN-001", title: "Super Admin", department: "Administration", capabilities: ["view_sensitive_cost", "edit_sensitive_cost", "finalize_landed_cost", "reopen_landed_cost", "view_profit", "view_financial_position", "approve_stock_override", "manage_users", "manage_user_access", "approve_special_price"] });
        await audit(tx, id, "Initial administrator provisioned", "Employee", id);
        const folder = privateFolder;
        await mkdir(folder, { recursive: true });
        // This is an expiring credential: never print it, commit it, or send it to analytics/logs.
        await writeFile(new URL("administrator-invitation.txt", folder), `${data.properties.action_link}\n`, { flag: "wx", mode: 0o600 });
        console.log(`Administrator invitation saved privately under ${process.env.ERP_BOOTSTRAP_DIR ?? "artifacts/private"}; no email sent. Never share or commit this setup link.`);
      } else {
        console.log("Administrator already provisioned; credentials and role unchanged.");
        if (args.has("--issue-link")) {
          if (!current.authUserId) throw new Error("Administrator identity mapping needs review");
          const { data: owner, error: ownerError } = await ctx.admin.auth.admin.getUserById(current.authUserId);
          if (ownerError || !owner.user) throw new Error("Administrator identity not found");
          const { data: link, error: linkError } = await ctx.admin.auth.admin.generateLink({ type: owner.user.email_confirmed_at ? "recovery" : "invite", email, options: { redirectTo: `${ctx.config.origin}/reset-password` } });
          if (linkError || !link.properties?.action_link || link.user.id !== current.authUserId) throw new Error("Administrator link could not be issued");
          const folder = privateFolder;
          await mkdir(folder, { recursive: true });
          const fileName = `administrator-invitation-${Date.now()}.txt`;
          await writeFile(new URL(fileName, folder), `${link.properties.action_link}\n`, { flag: "wx", mode: 0o600 });
          await audit(tx, current.id, "Administrator setup link issued", "Employee", current.id);
          console.log(`New expiring setup link saved privately under ${process.env.ERP_BOOTSTRAP_DIR ?? "artifacts/private"}; no email sent.`);
        }
      }
    });
    for (const [id, isPublic] of [["erp-documents", false], ["website-media", true]] as const) {
      const { data: existing, error: lookupError } = await ctx.admin.storage.getBucket(id);
      if (existing) {
        if (existing.public !== isPublic) throw new Error("Existing bucket visibility differs; manual review required");
        console.log("Existing bucket preserved:", id);
      } else {
        if (lookupError && !["404", "400"].includes(String(lookupError.status))) throw new Error("Storage bucket lookup failed");
        const { error } = await ctx.admin.storage.createBucket(id, { public: isPublic, fileSizeLimit: 10 * 1024 * 1024, allowedMimeTypes: id==="erp-documents"?[...attachmentMimes]:["image/jpeg", "image/png", "image/webp", "application/pdf"] });
        if (error) throw new Error("Storage bucket creation failed");
        console.log("Created restricted bucket:", id);
      }
    }
    console.log("Foundation bootstrap complete. Existing business records were not imported or overwritten.");
  } finally { await ctx.client.end(); }
}
main().catch(() => { console.error("Bootstrap did not finish. Existing records retained; inspect configuration and private artifacts before retrying. No credentials printed."); process.exitCode = 1; });
