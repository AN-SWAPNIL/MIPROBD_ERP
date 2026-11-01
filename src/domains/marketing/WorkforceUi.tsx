import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Button from "../../components/ui/Button";
import { inputClass, labelClass } from "../components";

export function WorkforceField({ label, children }: { label:string; children:ReactNode }) {
  return <label className="min-w-0"><span className={labelClass}>{label}</span>{children}</label>;
}
export function WorkforceSelect({ label,value,onChange,options,required=false }: {label:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];required?:boolean}) {
  return <WorkforceField label={label}><select aria-label={label} className={inputClass} value={value} onChange={(e)=>onChange(e.target.value)} required={required}><option value="">Select</option>{options.map((o)=><option key={o.value} value={o.value}>{o.label}</option>)}</select></WorkforceField>;
}
export function WorkforcePager({page,total,pageSize,onChange}:{page:number;total:number;pageSize:number;onChange:(p:number)=>void}) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-blue-100 px-4 py-3 text-xs text-slate-500"><span>{total} records | Page {page} of {Math.max(1,Math.ceil(total/pageSize))}</span><div className="flex gap-2"><Button aria-label="Previous page" disabled={page<=1} icon={<ChevronLeft className="h-4 w-4" />} onClick={()=>onChange(page-1)} /><Button aria-label="Next page" disabled={page*pageSize>=total} icon={<ChevronRight className="h-4 w-4" />} onClick={()=>onChange(page+1)} /></div></div>;
}
