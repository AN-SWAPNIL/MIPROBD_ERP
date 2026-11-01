import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { customers, employees, marketingLeads, products } from "../../database/schema.js";
import type { Database, Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import { getMarketingEmployeeScope, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { toUser } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";

export function marketingScope(user: User, column: SQL): SQL {
  const scope = getMarketingEmployeeScope(user);
  if (scope === "ALL") return sql`true`;
  if (scope === "TEAM") return sql`${column} in (with recursive team as (select id from erp_private.employees where id=${user.id} union all select e.id from erp_private.employees e join team t on e.manager_id=t.id) select id from team)`;
  return scope === "SELF" ? sql`${column}=${user.id}` : sql`false`;
}
export const directoryScope = (user: User,column: SQL) => hasEffectivePermission(user,"users") ? sql`true` : marketingScope(user,column);
export async function assertEmployeeScope(db: Transaction|Database,user: User,id: string,directory=false) {
  const [row] = (await db.execute<{id:string}>(sql`select id from erp_private.employees where id=${id} and ${directory?directoryScope(user,sql`id`):marketingScope(user,sql`id`)}`)).rows;
  if (!row) throw new HttpError(404,"Employee not found in your permitted scope.");
}
export async function activeOwner(tx: Transaction,user: User,id: string) {
  await assertEmployeeScope(tx,user,id);
  const [row] = await tx.select().from(employees).where(eq(employees.id,id)).for("share");
  assertAllowed(row?.status === "Active" && hasEffectivePermission(toUser(row),"marketing"),"Select an active marketing employee in your team.");
  return row;
}
export async function canonicalProducts(tx: Transaction,ids: string[]) {
  if (!ids.length) return;
  const rows = await tx.select({id:products.id}).from(products).where(and(inArray(products.id,ids),eq(products.active,true))).for("share");
  if (rows.length!==ids.length) throw new HttpError(422,"Choose active canonical products.");
}
export async function canonicalSubject(tx: Transaction,user: User,input: {leadId?:string|null;customerId?:string|null},ownerId=user.id) {
  if (input.leadId && input.customerId) throw new HttpError(422,"Choose exactly one subject.");
  if (input.leadId) {
    const [row] = await tx.select().from(marketingLeads).where(eq(marketingLeads.id,input.leadId)).for("share");
    if(!row)throw new HttpError(404,"Lead not found."); await assertEmployeeScope(tx,user,row.assignedTo);
    if(row.assignedTo!==ownerId)throw new HttpError(422,"The lead must belong to the assigned employee.");
    return row.organization;
  }
  if (input.customerId) {
    const [row] = await tx.select().from(customers).where(eq(customers.id,input.customerId)).for("share");
    if(!row?.active || !row.assignedSalesUserId)throw new HttpError(404,"Assigned active customer not found.");
    await assertEmployeeScope(tx,user,row.assignedSalesUserId);
    if(row.assignedSalesUserId!==ownerId)throw new HttpError(422,"The customer must belong to the assigned employee.");
    return row.name;
  }
  return "Internal / market activity";
}
export const searchPattern = (value: string) => `%${value.replaceAll("\\","\\\\").replaceAll("%","\\%").replaceAll("_","\\_")}%`;
