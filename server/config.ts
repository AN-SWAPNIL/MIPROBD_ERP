import { loadEnvFile } from "node:process";
import { z } from "zod";
import { resolveBackendMode } from "./runtime-mode.js";

try { loadEnvFile(process.env.ERP_ENV_FILE || undefined); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const schema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  DATABASE_URL: z.string().startsWith("postgres").optional(),
  DATABASE_RUNTIME_URL: z.string().startsWith("postgres").optional(),
  APP_URL: z.url().default("http://localhost:5173")
});

export function backendConfig() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) throw new Error(`Backend configuration missing/invalid: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  const value = parsed.data;
  const databaseUrl = value.DATABASE_RUNTIME_URL ?? value.DATABASE_URL;
  if (!databaseUrl) throw new Error("Backend configuration missing: DATABASE_RUNTIME_URL or DATABASE_URL");
  const connection = new URL(databaseUrl), ref = new URL(value.SUPABASE_URL).hostname.split(".")[0];
  if (connection.hostname.endsWith(".pooler.supabase.com") && !decodeURIComponent(connection.username).endsWith(`.${ref}`)) throw new Error("Database pooler and Supabase project identities do not match.");
  const appUrl = new URL(value.APP_URL);
  if (process.env.VERCEL && (!process.env.APP_URL || appUrl.protocol !== "https:")) throw new Error("Vercel foundation deployments require an explicit HTTPS APP_URL");
  if (appUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(appUrl.hostname)) throw new Error("APP_URL must use HTTPS outside localhost");
  return { ...value, DATABASE_URL: databaseUrl, origin: appUrl.origin, secureCookies: appUrl.protocol === "https:", requirePrivilegedMfa: process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL) || process.env.ERP_REQUIRE_MFA === "true", requireRestrictedDatabase: process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL) || process.env.ERP_REQUIRE_RESTRICTED_DB === "true" };
}

export function isFoundationMode() {
  return resolveBackendMode(process.env) === "foundation";
}
