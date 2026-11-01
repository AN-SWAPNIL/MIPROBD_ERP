type Environment = Record<string, string | undefined>;

export function resolveBackendMode(env: Environment) {
  const production = env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
  if (production && !env.ERP_BACKEND_MODE) throw new Error("Production requires explicit ERP_BACKEND_MODE");
  const mode = env.ERP_BACKEND_MODE ?? "mock";
  if (mode !== "mock" && mode !== "foundation") throw new Error("Invalid ERP_BACKEND_MODE");
  if (env.VITE_BACKEND_MODE && env.VITE_BACKEND_MODE !== mode) throw new Error("Browser and API backend modes must match");
  if (mode === "foundation" && (env.DEMO_MODE === "true" || env.VITE_DEMO_MODE === "true")) throw new Error("Foundation mode cannot enable demo identities");
  if (production && mode === "mock" && !(env.DEMO_DEPLOYMENT === "true" && env.DEMO_MODE === "true" && env.VITE_DEMO_MODE === "true")) {
    throw new Error("Production mock mode requires explicit DEMO_DEPLOYMENT and both demo flags; never use real records");
  }
  return mode;
}
