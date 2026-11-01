import { useDeferredValue,useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search,UserRound,X } from "lucide-react";
import Button from "../../components/ui/Button";
import { ErrorBlock,LoadingBlock,inputClass,labelClass } from "../components";
import { WorkforcePager } from "../marketing/WorkforceUi";
import { payrollApi,type PayrollEmployee } from "./client";
export default function PayrollEmployeeSelect({onSelect}:{onSelect:(e:PayrollEmployee|null)=>void}){
 const[selected,setSelected]=useState<PayrollEmployee|null>(null),[search,setSearch]=useState(""),term=useDeferredValue(search),[page,setPage]=useState(1);
 const query=useQuery({queryKey:["payroll","employee-picker",term,page],enabled:!selected,queryFn:({signal})=>payrollApi.employees(term,page,undefined,signal)});
 const select=(e:PayrollEmployee|null)=>{setSelected(e);onSelect(e);};
 if(selected)return <div className="flex min-w-0 items-center gap-3 rounded-md border border-blue-200 bg-blue-50 p-3"><UserRound className="h-5 w-5 shrink-0 text-blue-800"/><div className="min-w-0 flex-1 text-sm"><strong className="block break-words">{selected.name}</strong><small>{selected.employeeCode} | {selected.title} | {selected.status}</small></div><Button aria-label="Change employee" title="Change employee" icon={<X className="h-4 w-4"/>} onClick={()=>select(null)}/></div>;
 return <div className="grid min-w-0 gap-2"><label><span className={labelClass}>Find Employee</span><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-blue-400"/><input className={inputClass+" pl-9"} aria-label="Find payroll employee" value={search} onChange={(e)=>{setSearch(e.target.value);setPage(1);}} maxLength={120} autoComplete="off"/></div></label>{query.isPending?<LoadingBlock/>:query.isError?<ErrorBlock error={query.error}/>:<><label><span className={labelClass}>Employee / ID / Designation</span><select aria-label="Payroll employee" value="" className={inputClass} onChange={(e)=>select(query.data.rows.find(r=>r.id===e.target.value)??null)}><option value="">Select employee</option>{query.data.rows.map(e=><option key={e.id} value={e.id}>{e.name} | {e.employeeCode} | {e.title||e.status}</option>)}</select></label><WorkforcePager page={page} pageSize={25} total={query.data.total} onChange={setPage}/></>}</div>;
}
