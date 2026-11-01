import test from "node:test";
import assert from "node:assert/strict";
import { calculatePayroll,compensationPeriods,payrollPeriod,splitCompensation,validatePayrollRecovery } from "./math.js";
import { compensationData,payrollEmployeeInput,payrollPolicyInput,payrollRunInput,payrollPaymentInput } from "../../src/domains/payroll/contracts.js";
import { canManagePayroll,canReadPayroll } from "../../src/domains/ledger/access.js";
import type { User } from "../../src/types/index.js";
import { ledgerReportSpec } from "../ledger/reporting.js";
import { queryInput } from "../reports/common.js";
import { PgDialect } from "drizzle-orm/pg-core";
const profile=compensationData.parse({joiningDate:"2026-09-01",employmentEndDate:null,basic:"100",houseRent:"20",medical:"5",transport:"5",otherAllowance:"0",overtimeRate:"2.50",commissionEligible:true,paymentChannel:"Bank",bankName:"DEV TEST",payeeName:"DEV TEST Employee",payeeAccount:"DEV TEST"});
const employee=payrollEmployeeInput.parse({employeeId:"employee",salaryFactor:"1",bonus:"10",overtimeHours:"3",otherDeduction:"2",deductionReason:"Approved adjustment",earningsProof:"ATT-01",finalSettlement:false,recoveries:[]});
const compensation=(id:string,date:string,basic:string)=>({id,effectiveFrom:date,data:payrollPolicyInput.parse({kind:"Compensation",employeeId:employee.employeeId,effectiveFrom:date,proofReference:`APPROVED ${id}`,data:{...profile,basic}})});
test("mid-month earnings use each effective compensation profile and explicit factors",()=>{
 const periods=compensationPeriods("2026-09",[compensation("old","2026-08-01","100"),compensation("new","2026-09-16","200")]);assert.deepEqual(periods.map(p=>[p.profileId,p.from,p.to]),[["old","2026-09-01","2026-09-15"],["new","2026-09-16","2026-09-30"]]);
 const input={...employee,compensationSegments:[{profileId:"old",salaryFactor:"0.5",overtimeHours:"1",earningsProof:"OLD ATT"},{profileId:"new",salaryFactor:"0.5",overtimeHours:"2",earningsProof:"NEW ATT"}]};
 const earnings=splitCompensation(periods,input);assert.equal(earnings.components.basic,"150.00");assert.equal(earnings.overtime,"7.50");
 const math=calculatePayroll(profile,input,{entitlement:"0",previous:"0",recoverNegative:false},[],earnings);assert.equal(math.fixedGross,"180.00");assert.equal(math.net,"195.50");
});
test("mid-month components round per source period and reject incomplete or unreconciled schedules",()=>{
 const periods=compensationPeriods("2026-09",[compensation("old","2026-08-01","0.01"),compensation("new","2026-09-16","0.01")]);
 const input={...employee,compensationSegments:[{profileId:"old",salaryFactor:"0.5",overtimeHours:"1",earningsProof:"OLD ATT"},{profileId:"new",salaryFactor:"0.5",overtimeHours:"2",earningsProof:"NEW ATT"}]};assert.equal(splitCompensation(periods,input).components.basic,"0.02");
 for(const lines of [input.compensationSegments.slice(0,1),[input.compensationSegments[0],input.compensationSegments[0]],input.compensationSegments.map(p=>({...p,salaryFactor:"0.6"})),input.compensationSegments.map(p=>({...p,overtimeHours:"0"})),input.compensationSegments.map(p=>({...p,profileId:"foreign"}))])assert.throws(()=>splitCompensation(periods,{...input,compensationSegments:lines}));
 assert.throws(()=>splitCompensation(periods,{...input,compensationSegments:input.compensationSegments.map(p=>({...p,earningsProof:""}))}));
});
test("compensation periods respect leap-month joining/end dates without inferring attendance",()=>{
 const p=compensation("new","2024-02-10","100");if(p.data.kind!=="Compensation")throw new Error("Bad test profile");p.data.data.joiningDate="2024-02-12";p.data.data.employmentEndDate="2024-02-25";
 const periods=compensationPeriods("2024-02",[p]);assert.deepEqual(periods.map(p=>[p.from,p.to]),[["2024-02-12","2024-02-25"]]);assert.throws(()=>compensationPeriods("2024-01",[p]));
 const old=compensation("old","2024-02-01","100");if(old.data.kind!=="Compensation")throw new Error("Bad test profile");old.data.data.joiningDate="2024-01-01";p.effectiveFrom="2024-02-20";p.data.effectiveFrom="2024-02-20";assert.throws(()=>compensationPeriods("2024-02",[old,p]));
});
test("payroll counts fixed allowances once, rounds OT once and separates recoveries from deductions",()=>{const m=calculatePayroll(profile,employee,{entitlement:"25",previous:"0",recoverNegative:true},[{kind:"Advance",amount:"10"},{kind:"Loan",amount:"5"}]);assert.equal(m.fixedGross,"130.00");assert.equal(m.overtime,"7.50");assert.equal(m.gross,"172.50");assert.equal(m.totalDeduction,"17.00");assert.equal(m.net,"155.50");assert.equal(m.commissionCarry,"0.00");});
test("commission pays only unrecognized cumulative entitlement and retains signed clawback carry without negative wages",()=>{let m=calculatePayroll(profile,{...employee,bonus:"0",overtimeHours:"0",otherDeduction:"0"},{entitlement:"0",previous:"200",recoverNegative:true},[]);assert.equal(m.commissionApplied,"-130.00");assert.equal(m.net,"0.00");assert.equal(m.commissionCarry,"-70.00");m=calculatePayroll(profile,employee,{entitlement:"0",previous:"25",recoverNegative:false},[]);assert.equal(m.commissionApplied,"0.00");assert.equal(m.commissionCarry,"-25.00");});
test("payroll uses explicit earned factor, rejects excessive deductions and does not infer GPS/attendance",()=>{const m=calculatePayroll(profile,{...employee,salaryFactor:"0.5",overtimeHours:"0",bonus:"0",otherDeduction:"0"},{entitlement:"0",previous:"0",recoverNegative:false},[]);assert.equal(m.fixedGross,"65.00");assert.throws(()=>calculatePayroll(profile,employee,{entitlement:"0",previous:"0",recoverNegative:true},[{kind:"Loan",amount:"500"}]));assert.equal(payrollEmployeeInput.safeParse({...employee,gpsAttendance:true}).success,false);});
test("payroll contracts reject forged totals, missing payee/evidence, repeated employees and recovery destinations",()=>{const policy={kind:"Compensation",employeeId:"employee",effectiveFrom:"2026-09-01",proofReference:"EMP-01",data:profile};assert.ok(payrollPolicyInput.safeParse(policy).success);assert.equal(payrollPolicyInput.safeParse({...policy,data:{...profile,payeeAccount:""}}).success,false);assert.equal(payrollRunInput.safeParse({period:"2026-09",reason:"Approved payroll",proofReference:"PR-01",lines:[employee,employee]}).success,false);assert.equal(payrollPaymentInput.safeParse({lineId:"line",accountId:"bank",amount:"10",reason:"Salary disbursement",proofReference:"SP-01",employeeId:"forged"}).success,false);});
test("payroll month bounds use actual leap-month end dates",()=>{assert.deepEqual(payrollPeriod("2024-02"),{from:"2024-02-01",to:"2024-02-29"});assert.throws(()=>payrollPeriod("2026-13"));assert.throws(()=>payrollPeriod("1999-12"));});
test("payroll recovery respects original principal and a nonzero agreed installment",()=>{validatePayrollRecovery("5","20","5");validatePayrollRecovery("20","20","0");assert.throws(()=>validatePayrollRecovery("5.01","20","5"));assert.throws(()=>validatePayrollRecovery("5","4.99","5"));assert.throws(()=>validatePayrollRecovery("0","20","5"));});
test("payroll privacy needs explicit confidential access; management does not follow directory access alone",()=>{const actor={id:"a",status:"Active",role:"Accounts",capabilities:[],permissionOverrides:[]} as unknown as User;assert.equal(canReadPayroll(actor),false);assert.equal(canManagePayroll({...actor,capabilities:["view_payroll"]}),false);assert.equal(canManagePayroll({...actor,capabilities:["view_payroll","manage_payroll"]}),true);assert.equal(canReadPayroll({...actor,status:"Inactive",capabilities:["view_payroll"]}),false);});
test("payroll control reconciliation is as-of and confidential, not inferred from directory access",()=>{
 const actor={id:"a",status:"Active",role:"Accounts",capabilities:[],permissionOverrides:[]} as unknown as User;
 const q=queryInput.parse({from:"2026-09-01",to:"2026-09-30"}),dialect=new PgDialect();
 const restricted=ledgerReportSpec("ledger-control-reconciliation",actor,q)!;
 assert.ok(!dialect.sqlToQuery(restricted.base).sql.includes("payroll_runs"));
 const authorized=ledgerReportSpec("ledger-control-reconciliation",{...actor,capabilities:["view_payroll"]},q)!;
 const query=dialect.sqlToQuery(authorized.base);assert.ok(query.sql.includes("payroll_runs"));assert.ok(query.sql.includes("payroll_recoveries"));assert.ok(query.params.includes(q.to));
});
test("income statement uses posted GL income/expense, never salary cash payments as a second expense",()=>{
 const actor={id:"a",status:"Active",role:"Super Admin",capabilities:[],permissionOverrides:[]} as unknown as User;
 const spec=ledgerReportSpec("ledger-income-statement",actor,queryInput.parse({from:"2026-09-01",to:"2026-09-30"}))!,dialect=new PgDialect(),base=dialect.sqlToQuery(spec.base).sql;
 assert.ok(base.includes("j.state='Posted'"));assert.ok(base.includes("a.kind in ('Income','Expense')"));assert.ok(!base.includes("payroll_payments"));assert.ok(!base.includes("payee"));assert.ok(spec.columns.find(c=>c.key==="net")?.total);
});
