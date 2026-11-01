import { environments, validateProfile } from "./environment-profile.mjs";

if (process.env.VERCEL) {
  const profile = Object.values(environments.profiles).find((p) => p.projectId === process.env.VERCEL_PROJECT_ID);
  if (!profile || profile.mode !== "foundation") throw new Error("This source tree can deploy only to the staging or UAT ERP project.");
  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  if (branch && branch !== profile.branch) throw new Error("Git branch does not match this deployment project.");
  validateProfile(profile, process.env, { hosted: true });
  console.log(`Deployment profile verified: ${profile.branch} -> ${profile.project}.`);
} else {
  console.log("Local build: hosted profile checks run on Vercel; no credentials required here.");
}
