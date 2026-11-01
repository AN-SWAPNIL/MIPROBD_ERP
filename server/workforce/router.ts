import { Router } from "express";
import { sql } from "drizzle-orm";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { referenceDataSchema } from "../../src/domains/marketing/persistentContracts.js";
import { identity, type Context } from "../foundation/context.js";
import { assertAllowed } from "../foundation/errors.js";
import { createActivityRouter } from "./activities.js";
import { createLeadRouter } from "./leads.js";
import { createPlanningRouter } from "./planning.js";
import { createWorkforceEmployeeRouter, employeeColumns } from "./employees.js";
import { marketingScope } from "./scope.js";
import { createVisitRouter } from "./visits.js";

export function createWorkforceRouter(ctx:Context) {
  const router=Router();
  router.use(createVisitRouter(ctx));
  router.use(createWorkforceEmployeeRouter(ctx)); router.use(createActivityRouter(ctx)); router.use(createLeadRouter(ctx)); router.use(createPlanningRouter(ctx));
  router.get("/workforce/references",async(_req,res)=>{
    const user=identity(res).user; assertAllowed(hasEffectivePermission(user,"marketing"));
    const data=await ctx.db.transaction(async(tx)=>{
      const employees=(await tx.execute(sql`select ${employeeColumns} from erp_private.employees e left join erp_private.employees m on m.id=e.manager_id where e.status='Active' and ${marketingScope(user,sql`e.id`)} order by e.name,e.id limit 501`)).rows;
      const customers=hasEffectivePermission(user,"customers")?(await tx.execute(sql`select c.id,c.name,c.assigned_sales_user_id as "assignedTo" from erp_private.customers c where c.active and ${marketingScope(user,sql`c.assigned_sales_user_id`)} order by c.name,c.id limit 501`)).rows:[];
      const leads=(await tx.execute(sql`select l.id,l.organization name,l.assigned_to as "assignedTo" from erp_private.marketing_leads l where l.stage<>'LOST' and ${marketingScope(user,sql`l.assigned_to`)} order by l.organization,l.id limit 501`)).rows;
      const products=(await tx.execute(sql`select id,code,name from erp_private.products where active order by code,id limit 501`)).rows;
      return referenceDataSchema.parse({employees:employees.slice(0,500),customers:customers.slice(0,500),leads:leads.slice(0,500),products:products.slice(0,500),truncated:[employees,customers,leads,products].some((rows)=>rows.length>500)});
    },{isolationLevel:"repeatable read",accessMode:"read only"});
    res.json({success:true,data,message:"Bounded authorized reference choices loaded"});
  });
  return router;
}
