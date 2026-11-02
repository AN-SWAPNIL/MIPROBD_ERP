if (Object.keys(process.env).some(key => /^(?:DATABASE_|SUPABASE_|VITE_SUPABASE_|SMTP_|SUPER_ADMIN_)/.test(key) && process.env[key])) throw new Error("The prototype must never receive real backend or personal credentials.");
if (process.env.VERCEL) {
  if (process.env.VERCEL_PROJECT_ID !== "prj_OYEvPfI0esGE964165Clbn7csjFQ" || process.env.VERCEL_ENV !== "production") throw new Error("Prototype source can deploy only to its isolated public demo project.");
  if (process.env.VERCEL_GIT_COMMIT_REF && process.env.VERCEL_GIT_COMMIT_REF !== "prototype") throw new Error("Only the prototype branch may deploy this project.");
  for (const key of ["DEMO_MODE", "VITE_DEMO_MODE", "DEMO_DEPLOYMENT"]) if (process.env[key] !== "true") throw new Error("Explicit demo deployment flags are required.");
}
console.log("Prototype isolation verified; no real backend credentials.");
