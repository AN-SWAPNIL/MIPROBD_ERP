import "../server/config.js";
import assert from "node:assert/strict";
import { randomBytes,randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { chromium } from "@playwright/test";
import { employees,sessions } from "../database/schema.js";
import { createContext } from "../server/foundation/context.js";

const origin="https://mipro-erp-staging.vercel.app";
if(!process.argv.includes("--apply"))throw new Error("Use --apply only for the authorized staging verification.");
const ctx=createContext();
if(new URL(ctx.config.SUPABASE_URL).hostname!=="hyttuapvvqqxcyhojbwq.supabase.co")throw new Error("Staging database target mismatch.");
const suffix=randomUUID(),id=`test-staging-${suffix}`,email=`backend-staging-${suffix}@example.invalid`,password=`T!${randomBytes(24).toString("hex")}`;
let authId:string|undefined,token="";
async function call(path:string,body?:unknown,expected=200){
 const response=await fetch(origin+path,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",Origin:origin,...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
 const result=await response.json();assert.equal(response.status,expected,`${path}: ${result.message??"unexpected status"}`);return result.data;
}
try{
 assert.equal((await call("/api/health")).database,"connected");await call("/api/me",undefined,401);
 const created=await ctx.admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);authId=created.data.user!.id;
 await ctx.db.insert(employees).values({id,authUserId:authId,email,name:"DEV TEST Staging Sales",role:"Sales Executive",status:"Active",employeeCode:`TEST-STAGING-${suffix}`,title:"Sales Executive"});
 const session=await call("/api/auth/login",{email,password});token=session.token;assert.equal(session.user.id,id);assert.equal(session.user.role,"Sales Executive");
 assert.equal((await call("/api/me")).user.id,id);await call("/api/dashboard");await call("/api/supplier-claims",undefined,403);await call("/api/payroll/runs",undefined,403);
 await call("/api/auth/logout",{});await call("/api/me",undefined,401);token="";
 const browser=await chromium.launch({channel:"msedge",headless:true});
 try{
  await mkdir("artifacts/backend/staging",{recursive:true});
  for(const[name,width]of[["desktop",1440],["mobile",390]]as const){
   const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(45000);const faults:string[]=[];page.on("pageerror",e=>faults.push(e.name));
   await page.goto(origin);await page.getByRole("heading",{level:1}).first().waitFor();await page.screenshot({path:`artifacts/backend/staging/landing-${name}.png`,fullPage:true});
   await page.goto(`${origin}/login`);await page.getByLabel("Email",{exact:true}).fill(email);await page.getByLabel("Password",{exact:true}).fill(password);await page.screenshot({path:`artifacts/backend/staging/login-${name}.png`,fullPage:true});
   await page.getByRole("button",{name:"Sign In",exact:true}).click();await page.waitForURL("**/backend");await page.getByRole("heading",{name:"Dashboard",exact:true}).waitFor();
   await page.waitForLoadState("networkidle");for(const selector of["html","body"])assert.ok(await page.locator(selector).evaluate(e=>e.scrollWidth<=e.clientWidth+2),`${name} fits viewport`);
   await page.screenshot({path:`artifacts/backend/staging/dashboard-${name}.png`,fullPage:true});assert.deepEqual(faults,[]);await page.close();
  }
 }finally{await browser.close();}
 console.log("PASS: staging HTTPS API/database, real temporary-user login, role denial, logout/revocation and desktop/mobile landing/login/dashboard.");
}finally{
 try{await ctx.db.update(sessions).set({revokedAt:new Date()}).where(eq(sessions.employeeId,id));await ctx.db.update(employees).set({status:"Inactive",authUserId:null}).where(eq(employees.id,id));if(authId){const removed=await ctx.admin.auth.admin.deleteUser(authId);assert.equal(removed.error,null,"Temporary staging identity cleanup");}}
 finally{await ctx.client.end();}
}
