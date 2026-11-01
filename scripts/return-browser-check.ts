import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { build,preview } from "vite";
import { chromium } from "@playwright/test";
import type { hostedHarness } from "../server/testing/hosted.js";
import { signOutWorkspace } from "./workspace-browser.js";

export async function prepareReturnBrowserBundle(){
  process.env.VITE_BACKEND_MODE="foundation";process.env.VITE_DEMO_MODE="false";const nodeEnv=process.env.NODE_ENV;
  try{await build({logLevel:"warn",build:{outDir:"artifacts/backend/return-build",emptyOutDir:true}});}
  finally{if(nodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=nodeEnv;}
}
type Person={email:string;token:string};
type Delivery={id:string;lines:{batchNumber:string}[]};
export async function checkReturnBrowser(h:Awaited<ReturnType<typeof hostedHarness>>,people:Person[],delivery:Delivery,bankId:string,viewport:string,createTarget:()=>Promise<{id:string;invoiceNumber:string}>){
  const origin="http://localhost:5194",width=viewport==="mobile"?390:1440;
  const web=await preview({logLevel:"warn",build:{outDir:"artifacts/backend/return-build"},preview:{host:"localhost",port:5194,strictPort:true,proxy:{"/api":{target:new URL(h.bases[0]).origin,changeOrigin:true}}}}),browser=await chromium.launch({channel:"msedge",headless:true});
  const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(45000);const faults:string[]=[];let loginToken="";
  page.on("pageerror",(e)=>faults.push(e.name));page.on("response",(r)=>{if(r.url().includes("/api/")&&r.status()>=400)faults.push(`${r.status()} ${new URL(r.url()).pathname}`);});
  const posted=async(path:string,action:()=>Promise<unknown>)=>{const pending=page.waitForResponse((r)=>new URL(r.url()).pathname===`/api${path}`&&r.request().method()==="POST");await action();const response=await pending,body=await response.json();assert.ok(response.ok(),`${path}: ${body.message}`);return body.data;};
  const login=async(index:number)=>{await page.goto(`${origin}/login`);await page.getByLabel("Email",{exact:true}).fill(people[index].email);await page.getByLabel("Password",{exact:true}).fill(h.password);const session=await posted("/auth/login",()=>page.getByRole("button",{name:"Sign In",exact:true}).click());loginToken=session.token;await page.waitForURL("**/backend");};
  const logout=async()=>{await signOutWorkspace(page);await page.waitForURL("**/login");for(let i=0;i<20;i++){if((await h.call("/me",loginToken)).status===401){loginToken="";return;}await new Promise((r)=>setTimeout(r,150));}assert.fail("Return browser logout must revoke its API session");};
  const capture=async(label:string)=>{await page.waitForLoadState("networkidle");for(const selector of ["html","body"])assert.ok(await page.locator(selector).evaluate((e)=>e.scrollWidth<=e.clientWidth+2),`${label}: ${selector} fits ${width}px`);await page.screenshot({path:`artifacts/backend/returns/${label}-${viewport}.png`,fullPage:true});};
  const approve=async(sourceId:string,reference:string,approvalId:string)=>{
    for(const[index,action]of[[1,"verify"],[2,"approve"]] as const){await login(index);await page.goto(`${origin}/backend/approvals?domain=Returns`);const row=page.getByRole("row").filter({hasText:reference});await row.getByRole("button",{name:`Open ${reference}`,exact:true}).click();await page.waitForURL(`**/returns/${sourceId}`);await page.getByRole("heading",{name:"Inspected Original Batches",exact:true}).waitFor();await capture(`${action}-${reference.startsWith("RET")?"return":"settlement"}`);await page.goto(`${origin}/backend/approvals?domain=Returns`);await page.getByRole("row").filter({hasText:reference}).getByRole("button",{name:action==="verify"?"Verify":"Approve",exact:true}).click();await page.getByLabel("Decision reason / evidence",{exact:true}).fill(`DEV TEST ${viewport} independent ${action}`);await posted(`/controls/approvals/${approvalId}/${action}`,()=>page.getByRole("button",{name:"Confirm",exact:true}).click());await logout();}
  };
  try{
    await mkdir("artifacts/backend/returns",{recursive:true});
    await login(3);await page.goto(`${origin}/backend/returns`);await page.getByRole("heading",{name:"Customer Returns & Credits",exact:true}).waitFor();await capture("register");
    await page.goto(`${origin}/backend/returns/new?delivery=${delivery.id}`);await page.getByLabel(`Return quantity ${delivery.lines[0].batchNumber}`,{exact:true}).fill("0.5");await page.getByLabel("Return / refusal reason",{exact:true}).fill(`DEV TEST ${viewport} returned medical goods`);await page.getByLabel("Inspection findings",{exact:true}).fill("DEV TEST inspected original LOT and sealed packaging");await page.getByLabel("Evidence reference",{exact:true}).fill(`DEV TEST ${viewport} QA`);await capture("inspection-editor");
    const source=await posted("/returns",()=>page.getByRole("button",{name:"Save Inspection",exact:true}).click());await page.waitForURL(`**/returns/${source.id}`);const submitted=await posted(`/returns/${source.id}/submit`,()=>page.getByRole("button",{name:"Submit for Approval",exact:true}).click());await logout();
    await approve(source.id,source.number,submitted.approvalId);
    await login(3);await page.goto(`${origin}/backend/returns/${source.id}`);await page.getByRole("button",{name:"Post Approved Return",exact:true}).click();await posted(`/returns/${source.id}/post`,()=>page.getByRole("alertdialog").getByRole("button",{name:"Post Approved Return",exact:true}).click());await page.getByText("Posted",{exact:true}).first().waitFor();assert.equal(await page.getByRole("heading",{name:"Credit Applications & Refunds",exact:true}).count(),0);await capture("warehouse-posted");await logout();
    await login(4);await page.goto(`${origin}/backend/returns/${source.id}`);await page.getByRole("button",{name:"Request Refund",exact:true}).waitFor();
    const settle=async(kind:"Refund"|"Apply Credit",amount:string,target?:string)=>{
      const label=kind==="Refund"?"Request Refund":"Apply Credit",proof=`DEV TEST ${viewport} ${kind}`;await page.getByRole("button",{name:label,exact:true}).click();const modal=page.getByRole("dialog");await modal.getByLabel("Amount (BDT)",{exact:true}).fill(amount);
      if(kind==="Refund")await modal.getByLabel("Refund account",{exact:true}).selectOption(bankId);else await modal.getByLabel("Outstanding invoice",{exact:true}).selectOption(target!);
      await modal.getByLabel("Settlement reason",{exact:true}).fill(`DEV TEST ${viewport} approved ${kind}`);await modal.getByLabel("Evidence / payment reference",{exact:true}).fill(proof);await capture(kind==="Refund"?"refund-request":"credit-application");
      const r=await posted(`/returns/${source.id}/settlements`,()=>modal.getByRole("button",{name:"Submit for Approval",exact:true}).click());const s=r.settlements.find((s:{proofReference:string})=>s.proofReference===proof);assert.ok(s);await logout();await approve(source.id,s.number,s.approvalId);await login(4);await page.goto(`${origin}/backend/returns/${source.id}`);await page.getByRole("row").filter({hasText:s.number}).getByRole("button",{name:"Post Settlement",exact:true}).click();await posted(`/return-settlements/${s.id}/post`,()=>page.getByRole("alertdialog").getByRole("button",{name:"Post Approved Settlement",exact:true}).click());await page.getByRole("row").filter({hasText:s.number}).getByText("Posted",{exact:true}).waitFor();await capture(kind==="Refund"?"refunded":"credit-applied");
    };
    await settle("Refund","4");const target=await createTarget();await settle("Apply Credit","1",target.id);
    await page.getByRole("button",{name:"Open Report",exact:true}).click();await page.getByRole("button",{name:"Print Preview",exact:true}).waitFor();await capture("credit-report");await page.getByRole("button",{name:"Print Preview",exact:true}).click();await page.locator(".letterhead-sheet:visible").first().waitFor();
    for(const mode of ["With Background","Without Background"] as const){await page.getByRole("tab",{name:mode,exact:true}).click();await page.screenshot({path:`artifacts/backend/returns/print-${mode==="With Background"?"digital":"preprinted"}-${viewport}.png`,fullPage:true});}
    assert.deepEqual(faults,[]);await logout();console.log(`Return browser ${viewport}: inspection, independent approvals, quarantine posting, actual refund, credit application and official print passed.`);
  }catch(error){await page.screenshot({path:`artifacts/backend/returns/failure-${viewport}.png`,fullPage:true}).catch(()=>{});console.error("Return browser state",{viewport,path:new URL(page.url()).pathname,faults});throw error;}
  finally{loginToken="";await browser.close();if("closeAllConnections"in web.httpServer)web.httpServer.closeAllConnections();await new Promise<void>((r)=>web.httpServer.close(()=>r()));}
}
