import { sql } from "drizzle-orm";
import type { Request, Response } from "express";
import type { Transaction } from "../../database/client.js";
import type { PermissionAction } from "../../src/types/index.js";
import { postingKeys } from "../../database/schema.js";
import { identity, type Context } from "../foundation/context.js";
import { lockActor, postingIdentity, previousPosting } from "../operations/common.js";
import { HttpError } from "../foundation/errors.js";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";

export const pathId = (req: Request) => String(req.params.id);
export function checkVersion(actual: number, expected: number|undefined) { if(actual!==expected)throw new HttpError(409,"This record changed. Reload before saving."); }
export async function workforceWrite<T>(ctx: Context,res: Response,action: PermissionAction,run: (tx:Transaction,user:ReturnType<typeof identity>["user"])=>Promise<T>) {
  return ctx.db.transaction(async(tx)=>{
    await tx.execute(sql`select pg_advisory_xact_lock_shared(hashtextextended('employee-hierarchy',0))`);
    const user=await lockActor(tx,identity(res),"marketing",action);
    if (!user || !hasEffectivePermission(user,"marketing")) throw new HttpError(403,"An active marketing employee with view access is required.");
    return run(tx,user);
  });
}
export async function postOnce(ctx: Context,req: Request,res: Response,action: PermissionAction,input:unknown,run:(tx:Transaction,user:ReturnType<typeof identity>["user"])=>Promise<string>) {
  const key=postingIdentity(req,`${identity(res).user.id}:${req.path}`,input);
  return workforceWrite(ctx,res,action,async(tx,user)=>{
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key.id},0))`);
    const previous=await previousPosting(tx,key); if(previous)return previous;
    const id=await run(tx,user); await tx.insert(postingKeys).values({...key,resourceId:id}); return id;
  });
}
export function pageQuery(query: {page:number;pageSize:number}) { return {limit:query.pageSize,offset:(query.page-1)*query.pageSize}; }
