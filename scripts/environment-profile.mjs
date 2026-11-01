import { readFileSync } from "node:fs";

export const environments = JSON.parse(readFileSync(new URL("../config/environments.json", import.meta.url), "utf8"));

export function profileForBranch(branch) {
  return Object.entries(environments.profiles).find(([, profile]) => profile.branch === branch);
}

export function validateProfile(profile, env, { hosted = false } = {}) {
  if (profile.mode !== "foundation") throw new Error("The mock prototype runs only from its separate branch.");
  if (env.ERP_BACKEND_MODE !== "foundation" || env.VITE_BACKEND_MODE !== "foundation" || env.DEMO_MODE !== "false" || env.VITE_DEMO_MODE !== "false") throw new Error("Real ERP environments require foundation mode and disabled demo identities.");
  for (const key of ["SUPABASE_URL", "VITE_SUPABASE_URL"]) {
    if (env[key] !== `https://${profile.supabaseRef}.supabase.co`) throw new Error(`${key} belongs to another environment.`);
  }
  const db = new URL(env.DATABASE_RUNTIME_URL ?? "");
  const user = decodeURIComponent(db.username);
  if (!["postgres:", "postgresql:"].includes(db.protocol) || !db.hostname.endsWith(".pooler.supabase.com") || user !== `mipro_runtime.${profile.supabaseRef}` || !db.password || db.port !== "6543") throw new Error("A matching restricted transaction-pooler connection is required.");
  for (const key of ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY"]) if (!env[key]?.trim()) throw new Error(`${key} is missing.`);
  if (env.SUPABASE_PUBLISHABLE_KEY !== env.VITE_SUPABASE_PUBLISHABLE_KEY) throw new Error("Browser and API publishable keys do not match.");
  if (hosted) {
    if (env.APP_URL !== profile.origin || env.VERCEL_PROJECT_ID !== profile.projectId || env.VERCEL_ENV !== "production") throw new Error("Hosted project, URL or deployment target does not match the environment.");
    if (env.DATABASE_MIGRATION_URL || env.DATABASE_URL || env.SUPER_ADMIN_EMAIL || env.SUPER_ADMIN_NAME) throw new Error("Setup/migration credentials do not belong in the hosted runtime.");
    for (const key of ["ERP_REQUIRE_MFA", "ERP_REQUIRE_RESTRICTED_DB", "ERP_REQUIRE_LEDGER_CONFIGURATION"]) if (env[key] !== "true") throw new Error(`${key} must be enabled on the hosted ERP.`);
  }
  if (env.VITE_API_BASE_URL) throw new Error("These environments use same-origin /api, not a cross-environment API URL.");
}
