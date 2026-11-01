export function assertHostedDatabaseProject(connection: string, supabaseUrl: string) {
  const ref = new URL(supabaseUrl).hostname.split(".")[0], uri = new URL(connection);
  if (!/^[a-z]{20}$/.test(ref) || !["postgres:", "postgresql:"].includes(uri.protocol)) throw new Error("Invalid hosted database identity.");
  const pooler = uri.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(uri.username).endsWith(`.${ref}`);
  const direct = uri.hostname === `db.${ref}.supabase.co`;
  if (!pooler && !direct) throw new Error("Administrative database and Supabase project identities do not match.");
  return ref;
}
