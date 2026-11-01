import { and,desc,eq,lte,sql } from "drizzle-orm";
import { employees,payrollPolicies,payrollLoans } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import { payrollPolicyInput,type PayrollLineSnapshot,payrollEmployeeInput } from "../../src/domains/payroll/contracts.js";
import type { z } from "zod";
import { HttpError } from "../foundation/errors.js";
import { D } from "../trading/money.js";
import { calculatePayroll,compensationPeriods,payrollPeriod,splitCompensation,validatePayrollRecovery } from "./math.js";
export async function lockPayrollEmployee(tx:Transaction,id:string){const [e]=await tx.select().from(employees).where(eq(employees.id,id)).for("update");if(!e)throw new HttpError(404,"Employee not found");return e;}
export async function loanOutstanding(tx:Transaction,id:string){const [row]=(await tx.execute<{balance:string}>(sql`select (l.amount-coalesce((select sum(r.amount) from erp_private.payroll_recoveries r where r.loan_id=l.id),0))::text balance from erp_private.payroll_loans l where l.id=${id}`)).rows;if(!row)throw new HttpError(404,"Employee advance/loan not found");return new D(row.balance).toFixed(2);}
export async function payrollSnapshot(tx:Transaction,period:string,input:z.infer<typeof payrollEmployeeInput>):Promise<PayrollLineSnapshot>{
  const {from,to}=payrollPeriod(period),e=await lockPayrollEmployee(tx,input.employeeId);
  if(e.status!=="Active"&&!input.finalSettlement)throw new HttpError(422,"Inactive staff require an explicit final settlement and earnings evidence.");
  const policies=await tx.select().from(payrollPolicies).where(and(eq(payrollPolicies.employeeId,e.id),eq(payrollPolicies.state,"Active"),lte(payrollPolicies.effectiveFrom,to))).orderBy(desc(payrollPolicies.effectiveFrom),desc(payrollPolicies.id)).limit(2001);
  if(policies.length>2000)throw new HttpError(413,"Payroll policy history exceeds the supported review limit.");
  const profileRow=policies.find((p)=>p.kind==="Compensation"),profile=profileRow?payrollPolicyInput.parse(profileRow.data):undefined;
  if(!profileRow||!profile||profile.kind!=="Compensation")throw new HttpError(422,"An independently approved compensation profile is required.");
  if(profile.data.joiningDate>to)throw new HttpError(422,"The salary month precedes the approved joining date.");
  if(profile.data.employmentEndDate&&profile.data.employmentEndDate<from&&!input.finalSettlement)throw new HttpError(422,"Employment ended before this month. Select a documented final settlement.");
  if(profile.effectiveFrom>from&&!input.compensationSegments)throw new HttpError(422,"Load the effective compensation periods and explicitly allocate salary factors/overtime for a mid-month change.");
  let split;try{if(input.compensationSegments)split=splitCompensation(compensationPeriods(period,policies.map(p=>({...p,data:payrollPolicyInput.parse(p.data)}))),input);}catch(error){throw new HttpError(422,(error as Error).message);}
  const commissionPolicies=policies.filter((p)=>p.kind==="Commission").reverse();
  if(!profile.data.commissionEligible&&commissionPolicies.length)throw new HttpError(422,"Preserve historical commission eligibility. Use an approved zero-rate commission policy to stop future accrual.");
  if(profile.data.commissionEligible&&!commissionPolicies.length)throw new HttpError(422,"Commission-eligible staff need an independently approved commission policy.");
  const parts:PayrollLineSnapshot["commissionParts"]=[];let entitlement=new D(0),recoverNegative=false;
  if(profile.data.commissionEligible)for(const [index,row]of commissionPolicies.entries()){
    const policy=payrollPolicyInput.parse(row.data);if(policy.kind!=="Commission")throw new Error("Unexpected commission policy");
    const next=commissionPolicies[index+1]?.effectiveFrom,through=next?new Date(Date.parse(`${next}T00:00:00Z`)-86400000).toISOString().slice(0,10):to;
    const [{basis}]=(await tx.execute<{basis:string}>(sql`select erp_private.payroll_basis(${e.id},${policy.data.basis},${policy.effectiveFrom}::date,${through}::date)::text basis`)).rows;
    const earned=new D(basis).times(policy.data.ratePercent).div(100).toDecimalPlaces(2);entitlement=entitlement.plus(earned);recoverNegative=policy.data.recoverNegative;
    parts.push({policyId:row.id,effectiveFrom:policy.effectiveFrom,through,basis:policy.data.basis,ratePercent:policy.data.ratePercent,basisBdt:new D(basis).toFixed(2),earnedBdt:earned.toFixed(2)});
  }
  const [{previous}]=(await tx.execute<{previous:string}>(sql`select coalesce(sum(l.commission),0)::text previous from erp_private.payroll_lines l join erp_private.payroll_runs r on r.id=l.run_id where l.employee_id=${e.id} and r.state='Accrued'`)).rows;
  const recoveries:{kind:"Advance"|"Loan";amount:string}[]=[],loanFacts=[];
  for(const r of [...input.recoveries].sort((a,b)=>a.loanId.localeCompare(b.loanId))){const [loan]=await tx.select().from(payrollLoans).where(eq(payrollLoans.id,r.loanId)).for("update");if(!loan||loan.employeeId!==e.id||loan.state!=="Posted")throw new HttpError(422,"Recovery must reference this employee's posted advance/loan.");const outstanding=await loanOutstanding(tx,loan.id);try{validatePayrollRecovery(r.amount,outstanding,loan.installment);}catch(error){throw new HttpError(409,(error as Error).message);}recoveries.push({kind:loan.kind,amount:r.amount});loanFacts.push({id:loan.id,outstanding,version:loan.version,createdBy:loan.createdBy});}
  let math;try{math=calculatePayroll(profile.data,input,{entitlement:entitlement.toFixed(2),previous,recoverNegative},recoveries,split);}catch(error){throw new HttpError(422,(error as Error).message);}
  const preparerIds=[...new Set([profileRow.createdBy,...(split?.parts??[]).map(part=>policies.find(p=>p.id===part.profileId)!.createdBy),...commissionPolicies.map((p)=>p.createdBy),...loanFacts.map((l)=>l.createdBy)])].sort();
  const data={input,employeeName:e.name,employeeCode:e.employeeCode,designation:e.title||e.role,department:e.department,employmentStatus:e.status,profileId:profileRow.id,profile,...(split?{compensationParts:split.parts}:{}),commissionParts:parts,recoverNegative,math,preparerIds};
  const [{fingerprint}]=(await tx.execute<{fingerprint:string}>(sql`select erp_private.payroll_fingerprint(${e.id},${period}) fingerprint`)).rows;
  return{...data,fingerprint};
}
