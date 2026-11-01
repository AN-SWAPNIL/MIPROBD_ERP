import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Search, ArrowRight } from "lucide-react";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { apiRequest } from "../../lib/api/client";
import { useAuthStore } from "../../lib/auth/session";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { formatQuantity } from "../../utils/precise";
import { ErrorBlock, LoadingBlock, Panel, TableFrame, inputClass } from "../components";
import { WorkforcePager } from "../marketing/WorkforceUi";
import { claimPageSchema } from "./contracts";
export default function ClaimsPage(){const navigate=useNavigate(),[params]=useSearchParams(),importId=params.get("import")??"",[search,setSearch]=useState(""),term=useDeferredValue(search),[page,setPage]=useState(1),user=useAuthStore(s=>s.session?.user);
 const data=useQuery({queryKey:["claims","register",term,page,importId],queryFn:async({signal})=>claimPageSchema.parse((await apiRequest(`/api/supplier-claims?${new URLSearchParams({search:term,page:String(page),...(importId?{importId}:{})})}`,{signal})).data)});
 const create=hasEffectivePermission(user,"import","create")||hasEffectivePermission(user,"inventory","post")||hasEffectivePermission(user,"accounts","post");
 return <><PageHeader title="Supplier Claims & Replacements" eyebrow="Import quality resolution" actions={<><Button icon={<ArrowLeft className="h-4 w-4"/>} onClick={()=>navigate(importId?`/backend/imports/${importId}`:hasEffectivePermission(user,"inventory")?"/backend/inventory":"/backend/accounts")}>Workspace</Button>{create?<Button variant="primary" icon={<Plus className="h-4 w-4"/>} onClick={()=>navigate(`/backend/supplier-claims/new${importId?`?import=${encodeURIComponent(importId)}`:""}`)}>New Inspection</Button>:null}</>}/>
 <Panel title="Claim Register"><div className="p-4"><div className="relative min-w-0"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input aria-label="Search supplier claims" className={inputClass+" pl-9"} maxLength={120} placeholder="Claim, import, supplier or product" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></div></div>{data.isPending?<LoadingBlock/>:data.isError?<ErrorBlock error={data.error}/>:<><TableFrame><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-blue-50 text-blue-950"><tr>{["Claim / Import","Supplier / Product","Source","Quantity","Resolution","Status","Open"].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{data.data.rows.map(r=><tr key={r.id} className="border-t border-blue-100"><td className="p-3 font-semibold">{r.number}<small className="block font-normal">{r.reference}</small></td><td className="p-3">{r.supplierName}<small className="block">{r.productName}</small></td><td className="p-3">{r.sourceKind}</td><td className="p-3">{formatQuantity(r.quantity)}</td><td className="p-3">{r.resolution}</td><td className="p-3"><StatusBadge status={r.state}/></td><td className="p-3"><Button title="Open supplier claim" aria-label={`Open ${r.number}`} icon={<ArrowRight className="h-4 w-4"/>} onClick={()=>navigate(`/backend/supplier-claims/${r.id}`)}/></td></tr>)}</tbody></table></TableFrame>{!data.data.total?<p className="p-6 text-center text-sm text-slate-500">No supplier claims match this search.</p>:null}<WorkforcePager page={page} pageSize={25} total={data.data.total} onChange={setPage}/></>}</Panel></>;
}
