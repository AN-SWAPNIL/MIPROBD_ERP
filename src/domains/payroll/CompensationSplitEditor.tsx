import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Decimal } from "decimal.js";
import { CalendarRange,RotateCcw } from "lucide-react";
import type { z } from "zod";
import Button from "../../components/ui/Button";
import { ErrorBlock,LoadingBlock,inputClass,labelClass } from "../components";
import { payrollEmployeeInput } from "./contracts";
import { payrollApi } from "./client";
import { formatMoney } from "../../utils/precise";
type EmployeeInput=z.infer<typeof payrollEmployeeInput>;
export default function CompensationSplitEditor({line,period,onChange}:{line:EmployeeInput;period:string;onChange:(input:Partial<EmployeeInput>)=>void}){
 const[enabled,setEnabled]=useState(Boolean(line.compensationSegments));
 const query=useQuery({queryKey:["payroll","compensation-periods",line.employeeId,period],enabled,queryFn:({signal})=>payrollApi.compensationPeriods(line.employeeId,period,signal)});
 const periods=query.data?.periods??[],segments=line.compensationSegments;
 const replace=(rows:NonNullable<EmployeeInput["compensationSegments"]>)=>{
  const total=(key:"salaryFactor"|"overtimeHours")=>{try{return rows.reduce((sum,row)=>sum.plus(row[key]||"0"),new Decimal(0)).toFixed(4);}catch{return"";}};
  onChange({compensationSegments:rows,salaryFactor:total("salaryFactor"),overtimeHours:total("overtimeHours")});
 };
 const select=()=>replace(periods.map(p=>({profileId:p.profileId,salaryFactor:"0",overtimeHours:"0",earningsProof:""})));
 return <div className="grid gap-3 border-t border-blue-100 pt-3">
  <div className="flex flex-wrap items-center justify-between gap-2"><span className={labelClass}>Effective Compensation Periods</span><div className="flex flex-wrap gap-2"><Button type="button" icon={<CalendarRange className="h-4 w-4"/>} onClick={()=>setEnabled(true)} disabled={enabled}>Load Approved Periods</Button>{segments?<Button type="button" icon={<RotateCcw className="h-4 w-4"/>} onClick={()=>onChange({compensationSegments:undefined})}>Single Profile</Button>:null}</div></div>
  {enabled&&query.isPending?<LoadingBlock/>:null}{query.isError?<ErrorBlock error={query.error}/>:null}
  {query.data?<><div className="grid gap-2">{periods.map(p=>{const selected=segments?.find(s=>s.profileId===p.profileId);const update=(key:"salaryFactor"|"overtimeHours"|"earningsProof",value:string)=>replace((segments??[]).map(s=>s.profileId===p.profileId?{...s,[key]:value}:s));return <div key={p.profileId} className="grid min-w-0 gap-3 border-b border-blue-100 py-3 sm:grid-cols-2"><div className="min-w-0 text-sm"><strong>{p.from} to {p.to}</strong><small className="block break-words text-slate-500">{p.proofReference}</small><span className="mt-1 block">Monthly fixed {formatMoney(new Decimal(p.data.basic).plus(p.data.houseRent).plus(p.data.medical).plus(p.data.transport).plus(p.data.otherAllowance).toFixed(2))} | OT/hour {formatMoney(p.data.overtimeRate)}</span></div><div className="grid min-w-0 gap-2 sm:grid-cols-2"><label><span className={labelClass}>Earned Factor</span><input aria-label={`Salary factor ${line.employeeId} ${p.from}`} inputMode="decimal" className={inputClass} disabled={!selected} required={Boolean(selected)} value={selected?.salaryFactor??""} onChange={e=>update("salaryFactor",e.target.value)}/></label><label><span className={labelClass}>Overtime Hours</span><input aria-label={`Overtime hours ${line.employeeId} ${p.from}`} inputMode="decimal" className={inputClass} disabled={!selected} required={Boolean(selected)} value={selected?.overtimeHours??""} onChange={e=>update("overtimeHours",e.target.value)}/></label><label className="sm:col-span-2"><span className={labelClass}>Period Earnings Evidence</span><input aria-label={`Period evidence ${line.employeeId} ${p.from}`} className={inputClass} disabled={!selected} required={Boolean(selected)} minLength={3} maxLength={200} value={selected?.earningsProof??""} onChange={e=>update("earningsProof",e.target.value)}/></label></div></div>;})}</div>
   {!segments||segments.length!==periods.length||periods.some(p=>!segments.find(s=>s.profileId===p.profileId))?<Button type="button" className="w-fit" onClick={select}>Use These Periods</Button>:null}
   {segments?<p className="text-xs text-slate-600">Approved earned factor total: {line.salaryFactor} / 1 | Overtime: {line.overtimeHours} hours</p>:null}
  </>:null}
 </div>;
}
