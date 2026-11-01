import { z } from "zod";
import { apiRequest } from "../../lib/api/client";
import { compensationScheduleSchema,payrollLoanSchema,payrollPolicySchema,payrollRegisterSchema,payrollRunSchema } from "./contracts";
export const payrollEmployeeSchema=z.object({id:z.string(),name:z.string(),employeeCode:z.string(),title:z.string(),status:z.string()});
export type PayrollEmployee=z.infer<typeof payrollEmployeeSchema>;
const page=<T extends z.ZodType>(schema:T)=>z.object({rows:z.array(schema),total:z.number().int(),page:z.number().int(),pageSize:z.number().int()});
export const payrollApi={
 compensationPeriods:async(employeeId:string,period:string,signal?:AbortSignal)=>compensationScheduleSchema.parse((await apiRequest(`/api/payroll/compensation-periods?${new URLSearchParams({employeeId,period})}`,{signal})).data),
 employees:async(search:string,p=1,id?:string,signal?:AbortSignal)=>page(payrollEmployeeSchema).parse((await apiRequest(`/api/payroll/employees?${new URLSearchParams({search,page:String(p),...(id?{employeeId:id}:{})})}`,{signal})).data),
 accounts:async()=>z.array(z.object({id:z.string(),name:z.string(),type:z.string()})).parse((await apiRequest("/api/payroll/payment-accounts")).data),
 policies:async(p=1,employeeId?:string,sourceId?:string)=>page(payrollPolicySchema).parse((await apiRequest(`/api/payroll/policies?${new URLSearchParams({page:String(p),...(employeeId?{employeeId}:{}),...(sourceId?{sourceId}:{})})}`)).data),
 loans:async(p=1,employeeId?:string,sourceId?:string)=>page(payrollLoanSchema).parse((await apiRequest(`/api/payroll/loans?${new URLSearchParams({page:String(p),...(employeeId?{employeeId}:{}),...(sourceId?{sourceId}:{})})}`)).data),
 runs:async(search:string,p=1)=>payrollRegisterSchema.parse((await apiRequest(`/api/payroll/runs?${new URLSearchParams({search,page:String(p)})}`)).data),
 run:async(id:string)=>payrollRunSchema.parse((await apiRequest(`/api/payroll/runs/${id}`)).data),
 post:async(path:string,body:unknown,key?:string)=>(await apiRequest(`/api/payroll${path}`,{method:"POST",...(key?{headers:{"Idempotency-Key":key}}:{}),body:JSON.stringify(body)})).data
};
