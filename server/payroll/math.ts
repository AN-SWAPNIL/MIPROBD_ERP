import { D } from "../trading/money.js";
import { payrollEmployeeInput,compensationData,compensationPeriodSchema,type PayrollMath,type PayrollPolicyData } from "../../src/domains/payroll/contracts.js";
import type { z } from "zod";
export function validatePayrollRecovery(amount:string,outstanding:string,installment:string){
 if(new D(amount).lte(0)||new D(amount).gt(outstanding))throw new Error("Recovery exceeds outstanding advance/loan.");
 if(new D(installment).gt(0)&&new D(amount).gt(installment))throw new Error("Recovery exceeds the employee's agreed installment. Review financing terms separately.");
}
export function calculatePayroll(profile:z.infer<typeof compensationData>,input:z.infer<typeof payrollEmployeeInput>,commission:{entitlement:string;previous:string;recoverNegative:boolean},recoveries:{kind:"Advance"|"Loan";amount:string}[],earned?:{components:PayrollMath["components"];overtime:string}):PayrollMath{
  const components={basic:"0",houseRent:"0",medical:"0",transport:"0",otherAllowance:"0"};
  for(const key of Object.keys(components) as (keyof typeof components)[])components[key]=earned?.components[key]??new D(profile[key]).times(input.salaryFactor).toFixed(2);
  const fixedGross=Object.values(components).reduce((a,v)=>a.plus(v),new D(0)),overtime=earned?new D(earned.overtime):new D(profile.overtimeRate).times(input.overtimeHours).toDecimalPlaces(2),bonus=new D(input.bonus);
  const recovery=(kind:string)=>recoveries.filter((r)=>r.kind===kind).reduce((a,r)=>a.plus(r.amount),new D(0));
  const advanceRecovery=recovery("Advance"),loanRecovery=recovery("Loan"),totalDeduction=advanceRecovery.plus(loanRecovery).plus(input.otherDeduction),delta=new D(commission.entitlement).minus(commission.previous);
  const beforeCommission=fixedGross.plus(overtime).plus(bonus).minus(totalDeduction);
  const applied=delta.gte(0)?delta:commission.recoverNegative?D.max(delta,D.min(0,beforeCommission.negated())):new D(0);
  const gross=fixedGross.plus(overtime).plus(bonus).plus(applied),net=gross.minus(totalDeduction);
  if(net.lt(0)||gross.lt(0)||gross.gte("1e22")||net.gte("1e22"))throw new Error("Deductions exceed available earnings, or payroll amount exceeds supported precision");
  return{components,fixedGross:fixedGross.toFixed(2),overtime:overtime.toFixed(2),bonus:bonus.toFixed(2),commissionEntitlement:new D(commission.entitlement).toFixed(2),commissionPreviouslyApplied:new D(commission.previous).toFixed(2),commissionDelta:delta.toFixed(2),commissionApplied:applied.toFixed(2),commissionCarry:delta.minus(applied).toFixed(2),gross:gross.toFixed(2),advanceRecovery:advanceRecovery.toFixed(2),loanRecovery:loanRecovery.toFixed(2),otherDeduction:new D(input.otherDeduction).toFixed(2),totalDeduction:totalDeduction.toFixed(2),net:net.toFixed(2)};
}
export function payrollPeriod(period:string){const m=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);if(!m||Number(m[1])<2000||Number(m[1])>2099)throw new Error("Use a supported payroll month");const end=new Date(Date.UTC(Number(m[1]),Number(m[2]),0)).toISOString().slice(0,10);return{from:`${period}-01`,to:end};}

export function splitCompensation(periods:z.infer<typeof compensationPeriodSchema>[],input:z.infer<typeof payrollEmployeeInput>){
 payrollEmployeeInput.parse(input);
 const selected=input.compensationSegments;
 if(!selected||!periods.length||selected.length!==periods.length||new Set(selected.map(s=>s.profileId)).size!==selected.length)throw new Error("Include every effective compensation period exactly once.");
 let factor=new D(0),hours=new D(0);const components:PayrollMath["components"]={basic:"0.00",houseRent:"0.00",medical:"0.00",transport:"0.00",otherAllowance:"0.00"};let overtime=new D(0);
 const parts=periods.map(period=>{const segment=selected.find(s=>s.profileId===period.profileId);if(!segment)throw new Error("Compensation period selection changed. Reload approved periods.");factor=factor.plus(segment.salaryFactor);hours=hours.plus(segment.overtimeHours);
  const partComponents={...components};for(const key of Object.keys(components)as(keyof typeof components)[]){partComponents[key]=new D(period.data[key]).times(segment.salaryFactor).toFixed(2);components[key]=new D(components[key]).plus(partComponents[key]).toFixed(2);}
  const ot=new D(period.data.overtimeRate).times(segment.overtimeHours).toFixed(2);overtime=overtime.plus(ot);return{...period,...segment,components:partComponents,overtime:ot};});
 if(factor.gt(1)||!factor.eq(input.salaryFactor)||!hours.eq(input.overtimeHours))throw new Error("Segment salary factors and overtime must reconcile with the employee totals; total factor cannot exceed one.");
 return{parts,components,overtime:overtime.toFixed(2)};
}
export function compensationPeriods(period:string,policies:{id:string;effectiveFrom:string;data:PayrollPolicyData}[]){
 const {from,to}=payrollPeriod(period),rows=policies.filter(p=>p.data.kind==="Compensation"&&p.effectiveFrom<=to).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)||a.id.localeCompare(b.id));
 const latest=rows.at(-1);if(!latest||latest.data.kind!=="Compensation")throw new Error("An approved compensation profile is required.");
 const employment=latest.data.data,periods:z.infer<typeof compensationPeriodSchema>[]=[];
 for(const[rowIndex,row]of rows.entries()){if(row.data.kind!=="Compensation")continue;
  const start=[from,row.effectiveFrom,employment.joiningDate].sort().at(-1)!,next=rows[rowIndex+1]?.effectiveFrom,end=[to,employment.employmentEndDate??to,...(next?[new Date(Date.parse(`${next}T00:00:00Z`)-86400000).toISOString().slice(0,10)]:[])].sort()[0];
  if(start>end)continue;if(row.data.data.joiningDate!==employment.joiningDate)throw new Error("Employment dates conflict across approved compensation sources. Review them before preparing a split.");
  periods.push({profileId:row.id,from:start,to:end,proofReference:row.data.proofReference,data:row.data.data});
 }
 if(!periods.length||periods.length>31)throw new Error("No supported effective employment periods cover this month.");return periods;
}
