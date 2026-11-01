import { eq,sql } from "drizzle-orm";
import { approvalPolicies,approvalRequests,employees,payrollLines,payrollLoans,payrollPayments,payrollPolicies,payrollRuns } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import { payrollLoanSchema,payrollPaymentSchema,payrollPolicySchema,payrollRunSchema } from "../../src/domains/payroll/contracts.js";
import { HttpError } from "../foundation/errors.js";
import { D } from "../trading/money.js";
import { loanOutstanding } from "./sources.js";
export async function approvalInfo(tx:Transaction,id:string){const [a]=await tx.select({r:approvalRequests,p:approvalPolicies}).from(approvalRequests).innerJoin(approvalPolicies,eq(approvalPolicies.id,approvalRequests.policyId)).where(eq(approvalRequests.id,id));return{approvalState:a?.r.state??null,policyActive:Boolean(a&&a.p.state==="Approved"&&a.p.version===a.r.policyVersion)};}
export async function readPayrollPolicy(tx:Transaction,id:string){const [p]=await tx.select({p:payrollPolicies,e:employees}).from(payrollPolicies).innerJoin(employees,eq(employees.id,payrollPolicies.employeeId)).where(eq(payrollPolicies.id,id));if(!p)throw new HttpError(404,"Payroll policy not found");return payrollPolicySchema.parse({...p.p,employeeName:p.e.name,...await approvalInfo(tx,p.p.approvalId)});}
export async function readPayrollLoan(tx:Transaction,id:string){const [p]=await tx.select({p:payrollLoans,e:employees}).from(payrollLoans).innerJoin(employees,eq(employees.id,payrollLoans.employeeId)).where(eq(payrollLoans.id,id));if(!p)throw new HttpError(404,"Employee advance/loan not found");return payrollLoanSchema.parse({...p.p,employeeName:p.e.name,outstanding:p.p.state==="Posted"?await loanOutstanding(tx,id):"0.00",...await approvalInfo(tx,p.p.approvalId)});}
export async function readPayrollRun(tx:Transaction,id:string){
  const [row]=await tx.select({r:payrollRuns,e:employees}).from(payrollRuns).innerJoin(employees,eq(employees.id,payrollRuns.createdBy)).where(eq(payrollRuns.id,id));if(!row)throw new HttpError(404,"Payroll run not found");
  const lines=await tx.select().from(payrollLines).where(eq(payrollLines.runId,id)).orderBy(payrollLines.position),payments=await tx.select().from(payrollPayments).where(eq(payrollPayments.runId,id)).orderBy(payrollPayments.createdAt);
  const paid=(await tx.execute<{lineId:string;paid:string}>(sql`select line_id "lineId",sum(amount)::text paid from erp_private.payroll_payments where run_id=${id} and state='Posted' group by line_id`)).rows;
  const paymentRows=[];for(const p of payments)paymentRows.push(payrollPaymentSchema.parse({...p,...await approvalInfo(tx,p.approvalId)}));
  return payrollRunSchema.parse({...row.r,createdByName:row.e.name,...(row.r.approvalId?await approvalInfo(tx,row.r.approvalId):{approvalState:null,policyActive:false}),lines:lines.map((l)=>{const total=paid.find((p)=>p.lineId===l.id)?.paid??"0";return{...l,paid:new D(total).toFixed(2),outstanding:new D(l.net).minus(total).toFixed(2)};}),payments:paymentRows});
}
