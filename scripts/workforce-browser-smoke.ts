import { openWorkspace, signOutWorkspace } from "./workspace-browser.js";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium, expect as baseExpect } from "@playwright/test";

const expect=baseExpect.configure({timeout:30000});

export async function workforceBrowserSmoke(apiBase:string,adminEmail:string,salesEmail:string,password:string,employeeId:string,customerId:string,_productId:string,today:string) {
  process.env.VITE_BACKEND_MODE="foundation";process.env.VITE_DEMO_MODE="false";
  const web=await createServer({cacheDir:"node_modules/.vite-workforce-test",server:{port:5196,host:"localhost",strictPort:true,proxy:{"/api":{target:new URL(apiBase).origin,changeOrigin:true}}}});
  const browser=await chromium.launch({channel:"msedge",headless:true});
  try {
    await web.listen();await mkdir("artifacts/backend",{recursive:true});
    for(const width of [1440,390]) {
      const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
      const errors:string[]=[];page.on("pageerror",(e)=>errors.push(e.message));
      page.on("response",(r)=>{const path=new URL(r.url()).pathname;if(path.startsWith("/api/")&&r.status()>=400)errors.push(`${r.status()} ${path}`);});
      const capture=async(label:string)=>{await expect(page.getByText("Loading saved records",{exact:true})).toHaveCount(0);assert.deepEqual(errors,[],`${label}: API and browser errors`);assert.ok(await page.locator("body").evaluate((b)=>b.scrollWidth<=b.clientWidth+2),`${label}: no overflow at ${width}`);await page.screenshot({path:`artifacts/backend/workforce-${label}-${width}.png`,fullPage:true});};
      const login=async(email:string)=>{await page.goto("http://localhost:5196/login",{waitUntil:"networkidle"});await page.getByLabel("Email",{exact:true}).fill(email);await page.getByLabel("Password",{exact:true}).fill(password);const response=page.waitForResponse((r)=>new URL(r.url()).pathname==="/api/auth/login"&&r.request().method()==="POST");await page.getByRole("button",{name:"Sign In",exact:true}).click();assert.equal((await response).status(),200);await page.waitForURL("**/backend");};
      await login(adminEmail);await openWorkspace(page, "Employees");await page.getByTestId("persistent-employees").waitFor();
      await page.getByRole("combobox",{name:"Employee status",exact:true}).selectOption("Active");await page.getByLabel("Search employees",{exact:true}).fill("Renamed");await expect(page.locator("main")).toContainText("Renamed");await capture("directory");
      const edit=page.getByRole("button",{name:/^Edit .*Renamed$/}).filter({visible:true}).first();await edit.click();await page.getByRole("dialog",{name:"Edit Employee",exact:true}).waitFor();await expect(page.getByRole("combobox",{name:"Reports To",exact:true})).toBeVisible();await capture("profile");await page.getByRole("button",{name:"Close",exact:true}).click();
      await page.getByRole("button",{name:/^Access for .*Renamed$/}).filter({visible:true}).first().click();await page.getByRole("dialog",{name:"Employee Access",exact:true}).waitFor();await expect(page.getByRole("combobox",{name:"Assigned Role",exact:true})).toBeVisible();await capture("access");await page.getByRole("button",{name:"Close",exact:true}).click();
      await page.goto(`http://localhost:5196/backend/employees?view=activity&employee=${employeeId}`,{waitUntil:"domcontentloaded"});await page.getByTestId("persistent-marketing").waitFor();await expect(page.getByRole("combobox",{name:"Employee",exact:true})).toHaveValue(employeeId);await capture("team");
      for(const tab of ["Leads","Follow-ups","Daily / Monthly Plans","Monthly Targets","Performance","Score Rules"]){await page.getByRole("tab",{name:tab,exact:true}).click();await expect(page.getByRole("tab",{name:tab,exact:true})).toHaveAttribute("aria-selected","true");await page.waitForLoadState("networkidle");await capture(tab.toLowerCase().replaceAll(/[^a-z]+/g,"-"));}
      await signOutWorkspace(page);await login(salesEmail);
      await expect(page.getByRole("link",{name:"Employees",exact:true})).toHaveCount(0);
      await openWorkspace(page, "Sales & Marketing");await page.getByTestId("persistent-marketing").waitFor();
      await page.getByRole("button",{name:"New Activity",exact:true}).click();await page.getByRole("dialog",{name:"Activity",exact:true}).waitFor();
      await page.getByLabel("Activity Category",{exact:true}).selectOption("GENERAL_NOTE");await page.getByLabel("Purpose",{exact:true}).fill(`DEV TEST browser activity ${width}`);await page.getByLabel("Outcome / Details",{exact:true}).fill("Office coordination recorded through own login");await page.getByLabel("Submission",{exact:true}).selectOption("Submitted");await capture("activity-form");
      await page.getByRole("button",{name:"Save Activity",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);await expect(page.getByTestId("persistent-marketing")).toContainText(`DEV TEST browser activity ${width}`);
      await page.getByRole("tab",{name:"Follow-ups",exact:true}).click();await page.getByRole("button",{name:"New Follow-up",exact:true}).click();await page.getByLabel("Customer / Lead",{exact:true}).selectOption(`customer:${customerId}`);await page.getByLabel("Purpose",{exact:true}).fill(`DEV TEST browser next contact ${width}`);await page.getByRole("button",{name:"Save Follow-up",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);await capture("own-followups");
      await page.getByRole("tab",{name:"Monthly Targets",exact:true}).click();await expect(page.getByRole("button",{name:"New Target",exact:true})).toHaveCount(0);await expect(page.getByRole("tab",{name:"Score Rules",exact:true})).toHaveCount(0);
      await page.goto(`http://localhost:5196/backend/reports/employee-activity?from=${today}&to=${today}&employee=${employeeId}`,{waitUntil:"domcontentloaded"});await page.getByRole("button",{name:"Print Preview",exact:true}).click();const print=page.getByRole("button",{name:"Print / Save PDF",exact:true});await expect(print).toBeEnabled();
      for(const mode of ["With Background","Without Background"]){await page.getByRole("tab",{name:mode,exact:true}).click();await expect(print).toBeEnabled();await expect(page.locator(".print-sheet").first().locator("[data-persistent-report-table] thead th")).toHaveCount(6);await capture(mode==="With Background"?"report-digital":"report-preprinted");await page.emulateMedia({media:"print"});const sheets=page.locator(".print-sheet");const bounds=await sheets.first().evaluate((e)=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,scroll:e.scrollHeight}));assert.ok(Math.abs(bounds.width-793.7)<2&&bounds.scroll<=bounds.height+2);if(width===1440)await page.pdf({path:`artifacts/backend/workforce-${mode==="With Background"?"digital":"preprinted"}.pdf`,preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});await page.emulateMedia({media:"screen"});}
      await page.goto("http://localhost:5196/backend/employees",{waitUntil:"domcontentloaded"});await expect(page.getByTestId("persistent-employees")).toHaveCount(0);assert.deepEqual(errors,[]);await context.close();console.log(`Workforce UI: profiles/access, team views, own submissions, follow-ups, route denial and report print passed at ${width}px.`);
    }
  }catch(error){for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:"artifacts/backend/workforce-failed.png",fullPage:true}).catch(()=>undefined);throw error;}
  finally{await browser.close();if(web.httpServer&&"closeAllConnections" in web.httpServer)web.httpServer.closeAllConnections();await web.close();}
}
