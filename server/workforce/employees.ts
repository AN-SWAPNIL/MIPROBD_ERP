import { Router } from "express";
import { and, eq, ne, sql } from "drizzle-orm";
import { documents, employees, sessions } from "../../database/schema.js";
import { canManageEmployees, canManageTargetUser, canManageUserAccess, getMarketingEmployeeScope, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { audit, identity, toUser, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { lockActor } from "../operations/common.js";
import { employeeProfileInput, listInput } from "./contracts.js";
import { assertEmployeeScope, directoryScope, searchPattern } from "./scope.js";
import { checkVersion, pageQuery } from "./common.js";

export const employeeColumns = sql`e.id,e.name,e.employee_code as "employeeCode",e.title,e.department,e.territory,e.phone,e.role,e.status,e.manager_id as "managerId",coalesce(m.name,'Unassigned') as "managerName",e.version,
  (select d.id::text from erp_private.documents d where d.employee_id=e.id and d.purpose='employee-avatar' and d.status='Attached' order by d.attached_at desc,d.id desc limit 1) as "avatarId"`;
export function createWorkforceEmployeeRouter(ctx:Context) {
  const router=Router();
  router.get("/workforce/employees",async(req,res)=>{
    const user=identity(res).user; assertAllowed(hasEffectivePermission(user,"users") || ["TEAM","ALL"].includes(getMarketingEmployeeScope(user)));
    const q=listInput.parse(req.query); const page=pageQuery(q);
    const condition=sql`${directoryScope(user,sql`e.id`)} and (${q.search}='' or concat_ws(' ',e.name,e.employee_code,e.title,e.department,e.territory) ilike ${searchPattern(q.search)}) ${q.status?sql`and e.status=${q.status}`:sql``} ${q.employee?sql`and e.id=${q.employee}`:sql``}`;
    const data=await ctx.db.transaction(async(tx)=>{
      const rows=(await tx.execute(sql`select ${employeeColumns} from erp_private.employees e left join erp_private.employees m on m.id=e.manager_id where ${condition} order by e.name,e.id limit ${page.limit} offset ${page.offset}`)).rows;
      const [count]=(await tx.execute<{count:number}>(sql`select count(*)::int count from erp_private.employees e where ${condition}`)).rows;
      return {rows,total:count.count,page:q.page,pageSize:q.pageSize};
    },{isolationLevel:"repeatable read",accessMode:"read only"});
    res.json({success:true,data,message:"Scoped employee directory loaded without login/access fields"});
  });
  router.patch("/workforce/employees/:id",async(req,res)=>{
    const input=employeeProfileInput.parse(req.body); const actor=identity(res); const id=String(req.params.id);
    await ctx.db.transaction(async(tx)=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('employee-hierarchy',0))`);
      const user=await lockActor(tx,actor,"users","edit"); assertAllowed(canManageEmployees(user,"edit")&&hasEffectivePermission(user,"users"));
      const [row]=await tx.select().from(employees).where(eq(employees.id,id)).for("update");
      if(!row)throw new HttpError(404,"Employee not found."); assertAllowed(canManageTargetUser(user,toUser(row))); checkVersion(row.version,input.version);
      const managerChanged=row.managerId!==input.managerId;
      if(managerChanged)assertAllowed(user.role==="Super Admin","Only Super Admin can change reporting assignments.");
      if(managerChanged && input.managerId) {
        const [manager]=await tx.select().from(employees).where(eq(employees.id,input.managerId)).for("share");
        if(!manager || manager.status!=="Active" || !["Super Admin","Managing Director","Sales Manager"].includes(manager.role))throw new HttpError(422,"Choose an active authorized manager.");
        const [cycle]=(await tx.execute<{invalid:boolean}>(sql`with recursive ancestors as (select id,manager_id from erp_private.employees where id=${input.managerId} union all select e.id,e.manager_id from erp_private.employees e join ancestors a on e.id=a.manager_id) select exists(select 1 from ancestors where id=${id}) invalid`)).rows;
        if(cycle.invalid)throw new HttpError(422,"Reporting assignments cannot form a cycle.");
      }
      const {version:_,reason,...profile}=input; void _;
      await tx.update(employees).set({...profile,version:row.version+1,updatedAt:new Date()}).where(eq(employees.id,id));
      if(managerChanged)await tx.update(sessions).set({revokedAt:new Date()}).where(sql`${sessions.employeeId} in (select id from erp_private.employees where role='Sales Manager' or id=${id}) and ${sessions.employeeId}<>${user.id}`);
      await audit(tx,user.id,"Employee profile/reporting assignment updated","Employee",id,{reason,before:{name:row.name,title:row.title,department:row.department,territory:row.territory,phone:row.phone,employeeCode:row.employeeCode,managerId:row.managerId},after:profile});
    });
    res.json({success:true,data:{id},message:"Employee profile saved; reporting-scope sessions revoked when changed"});
  });
  router.get("/workforce/employees/:id/access",async(req,res)=>{
    const user=identity(res).user; assertAllowed(canManageUserAccess(user)&&hasEffectivePermission(user,"users"));
    const [row]=await ctx.db.select().from(employees).where(eq(employees.id,String(req.params.id)));
    if(!row)throw new HttpError(404,"Employee not found."); assertAllowed(user.id===row.id || canManageTargetUser(user,toUser(row)));
    res.json({success:true,data:{...toUser(row),version:row.version},message:"Current employee access loaded"});
  });
  router.get("/workforce/employees/:id/photo",async(req,res)=>{
    const user=identity(res).user; const id=String(req.params.id); await assertEmployeeScope(ctx.db,user,id,true);
    const [row]=await ctx.db.select().from(documents).where(and(eq(documents.employeeId,id),eq(documents.purpose,"employee-avatar"),eq(documents.status,"Attached"))).orderBy(sql`${documents.attachedAt} desc`,sql`${documents.id} desc`).limit(1);
    if(!row)return res.json({success:true,data:null,message:"No employee photo"});
    const {data,error}=await ctx.admin.storage.from(row.bucket).createSignedUrl(row.objectPath,60); if(error)throw new HttpError(502,"Photo is temporarily unavailable.");
    res.json({success:true,data:{url:data.signedUrl,expiresIn:60},message:"Temporary profile photo read authorized"});
  });
  router.get("/workforce/managers",async(_req,res)=>{
    const user=identity(res).user; assertAllowed(user.role==="Super Admin"&&hasEffectivePermission(user,"users"));
    const rows=await ctx.db.select({id:employees.id,name:employees.name}).from(employees).where(and(eq(employees.status,"Active"),ne(employees.id,""),sql`${employees.role} in ('Super Admin','Managing Director','Sales Manager')`)).orderBy(employees.name,employees.id).limit(501);
    if(rows.length>500)throw new HttpError(413,"Manager selector needs pagination before more assignments.");
    res.json({success:true,data:rows,message:"Authorized managers loaded"});
  });
  return router;
}
