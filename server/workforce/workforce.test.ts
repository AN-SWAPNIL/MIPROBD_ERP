import test from "node:test";
import assert from "node:assert/strict";
import { activityFields, activityUpdate, employeeProfileInput, leadFields, listInput, planInput, targetInput, completeInput } from "./contracts.js";
import { searchPattern } from "./scope.js";
import { reportPresentation } from "../../src/domains/reports/reportPresentation.js";
import type { PersistentReport } from "../../src/domains/reports/persistentContracts.js";
import { reportCatalog } from "../../src/domains/reports/reportCatalog.js";
import { canReadReport } from "../reports/router.js";
import type { User } from "../../src/types/index.js";

test("workforce lists enforce bounded pages, escaped search and paired valid dates",()=>{
  assert.equal(listInput.parse({}).pageSize,25);
  for(const input of [{page:0},{pageSize:501},{from:"2026-01-01"},{from:"2026-02-30",to:"2026-03-01"},{from:"2026-02-01",to:"2026-01-01"},{unexpected:true}])assert.equal(listInput.safeParse(input).success,false);
  assert.equal(searchPattern("a%_\\b"),"%a\\%\\_\\\\b%");
});
test("manual activity cannot claim another employee, GPS or a financial transaction",()=>{
  const valid={type:"GENERAL_NOTE",occurredAt:new Date().toISOString(),purpose:"Office follow-up",status:"Submitted"};
  assert.equal(activityFields.safeParse(valid).success,true);
  for(const extra of [{employeeId:"another"},{verification:"GPS_VERIFIED"},{amount:"100"},{type:"PAYMENT_COLLECTED"},{occurredAt:new Date(Date.now()+86400000).toISOString()}])assert.equal(activityFields.safeParse({...valid,...extra}).success,false);
  assert.equal(activityFields.safeParse({...valid,type:"CUSTOMER_VISIT"}).success,false);
  assert.equal(activityFields.safeParse({...valid,type:"CUSTOMER_VISIT",leadId:"lead",customerId:"customer"}).success,false);
  assert.equal(activityUpdate.safeParse({...valid,version:1}).success,true);
  assert.equal(activityUpdate.safeParse({...valid,version:0}).success,false);
});
test("lead qualification uses canonical products and lost reasons, never forged commercial stages",()=>{
  const lead={organization:"Hospital",organizationType:"Hospital",contact:"Procurement",phone:"012345",source:"Field",productIds:["product"]};
  assert.equal(leadFields.safeParse(lead).success,true);
  for(const extra of [{productIds:[]},{productIds:["product","product"]},{stage:"PAYMENT"},{stage:"LOST"},{customerId:"forged"}])assert.equal(leadFields.safeParse({...lead,...extra}).success,false);
});
test("plans and targets validate monthly keys, versions and exact money",()=>{
  const plan={kind:"Monthly",period:"2026-10-01",status:"Draft",plannedActivities:20};
  assert.equal(planInput.safeParse(plan).success,true);
  assert.equal(planInput.safeParse({...plan,period:"2026-10-02"}).success,false);
  assert.equal(planInput.safeParse({...plan,employeeId:"forged"}).success,false);
  const target={employeeId:"sales",month:"2026-10-01",sales:"10.01",collections:"9.99",customers:2,activities:20,visits:2,reason:"Monthly assignment"};
  assert.equal(targetInput.safeParse(target).success,true);
  for(const extra of [{sales:"1.001"},{sales:"-1"},{activities:1.5},{version:0},{month:"2026-10-02"}])assert.equal(targetInput.safeParse({...target,...extra}).success,false);
});
test("profile and follow-up contracts forbid security-field edits and stale/fabricated completion",()=>{
  const profile={version:1,reason:"Profile correction",name:"Employee Name",employeeCode:"SE-001",title:"Sales",department:"Marketing",territory:"Dhaka",phone:"",managerId:null};
  assert.equal(employeeProfileInput.safeParse(profile).success,true);
  for(const extra of [{role:"Super Admin"},{status:"Active"},{email:"forged@example.com"},{authUserId:"forged"}])assert.equal(employeeProfileInput.safeParse({...profile,...extra}).success,false);
  assert.equal(completeInput.safeParse({version:1,outcome:"Contact completed",nextFollowUpAt:"2000-01-01T00:00:00Z"}).success,false);
});

test("employee report presentation retains every detailed fact without thirteen narrow print columns",()=>{
  const row={date:"2026-10-24",employee_label:"Employee | SE-001",territory:"Dhaka",activity:"CUSTOMER VISIT",subject:"Hospital",purpose:"Supply discussion",remarks:"Requested quotation",occurred:"2026-10-24 10:00",submitted:"2026-10-24 11:00",reference:"ACT-001",verification:"MANUAL",status:"Voided",reason:"Corrected contact"};
  const source:PersistentReport={id:"employee-activity",title:"Employee Activity",generatedAt:"2026-10-24T12:00:00Z",from:row.date,to:row.date,grouping:"Daily",basis:"Saved records",columns:Object.keys(row).map((key)=>({key,label:key,format:"text"})),rows:[row],totals:{},rowCount:1,page:1,pageSize:25,options:{},optionsTruncated:false,filters:{},notes:[]};
  const view=reportPresentation(source);assert.equal(view.columns.length,6);assert.equal(source.columns.length,13);assert.deepEqual(source.rows[0],row);
  for(const value of Object.values(row).filter((v)=>v!=="MANUAL"))assert.ok(view.columns.some((c)=>view.rows[0][c.key].includes(value)),`Retain ${value}`);
  assert.ok(view.rows[0].activity_status.includes("Self-reported"));assert.equal(reportPresentation({...source,id:"sales-summary"}).columns.length,13);
});
test("roster follows directory/team authority without granting marketing performance or overriding denies",()=>{
  const user:User={id:"accounts",name:"Accounts",email:"test@example.invalid",role:"Accounts",title:"Accounts",department:"Accounts",phone:"",avatarUrl:"",status:"Active",capabilities:[],permissionOverrides:[{permission:"users",action:"view",effect:"ALLOW"}]};
  const roster=reportCatalog.find((r)=>r.id==="employee-list")!;const performance=reportCatalog.find((r)=>r.id==="employee-performance")!;
  assert.equal(canReadReport(user,roster),true);assert.equal(canReadReport(user,performance),false);
  assert.equal(canReadReport({...user,permissionOverrides:[{permission:"users",action:"view",effect:"DENY"}],capabilities:["manage_user_access"]},roster),false);
});
