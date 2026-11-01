import type { Context } from "./context.js";
import { HttpError } from "./errors.js";
export type DatabasePrivileges = { unsafeRole: boolean; ownsPrivateTables: boolean; canCreateSchema: boolean; canReadAuth: boolean; canReadStorage: boolean; missingRls: boolean };
export async function databasePrivileges(ctx: Pick<Context, "client">): Promise<DatabasePrivileges> {
  const { rows } = await ctx.client.query<DatabasePrivileges>(`select
    (rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls) as "unsafeRole",
    exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='erp_private' and c.relowner=(select oid from pg_roles where rolname=current_user)) as "ownsPrivateTables",
    (has_schema_privilege(current_user,'erp_private','CREATE') or has_schema_privilege(current_user,'public','CREATE')) as "canCreateSchema",
    coalesce((select has_table_privilege(current_user,c.oid,'SELECT') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and c.relname='users'),false) as "canReadAuth",
    coalesce((select has_table_privilege(current_user,c.oid,'SELECT') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname='objects'),false) as "canReadStorage",
    exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='erp_private' and c.relkind='r' and not c.relrowsecurity) as "missingRls"
    from pg_roles where rolname=current_user`);
  return rows[0];
}
export const isRestrictedRuntime = (value: DatabasePrivileges) => Boolean(value) && (["unsafeRole", "ownsPrivateTables", "canCreateSchema", "canReadAuth", "canReadStorage", "missingRls"] as const).every((key) => value[key] === false);
const verified = new WeakMap<object, { pending: Promise<void>; expires: number }>();
export async function requireRestrictedRuntime(ctx: Context) {
  if (!ctx.config.requireRestrictedDatabase) return;
  let cached = verified.get(ctx.client);
  if (!cached || cached.expires < Date.now()) {
    const pending = databasePrivileges(ctx).then((privileges) => { if (!isRestrictedRuntime(privileges)) throw new HttpError(503, "Runtime database privileges are unsafe. Configure the separate restricted runtime connection."); });
    cached = { pending, expires: Date.now() + 60000 }; verified.set(ctx.client, cached); pending.catch(() => verified.delete(ctx.client));
  }
  await cached.pending;
}
