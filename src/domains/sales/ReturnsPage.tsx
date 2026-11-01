import { useDeferredValue,useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate,useSearchParams } from "react-router-dom";
import { ArrowLeft,Eye,Plus,Search } from "lucide-react";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { apiRequest } from "../../lib/api/client";
import { useAuthStore } from "../../lib/auth/session";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { ErrorBlock,LoadingBlock,Panel,TableFrame,inputClass } from "../components";
import { WorkforcePager } from "../marketing/WorkforceUi";
import { returnPageSchema } from "./returnContracts";

export default function ReturnsPage(){
  const [search,setSearch]=useState(""),term=useDeferredValue(search),[page,setPage]=useState(1),[params]=useSearchParams(),navigate=useNavigate(),user=useAuthStore((s)=>s.session?.user),orderId=params.get("order")??"";
  const query=useQuery({queryKey:["sales","returns",term,page,orderId],queryFn:async({signal})=>returnPageSchema.parse((await apiRequest(`/api/returns?${new URLSearchParams({search:term,page:String(page),...(orderId?{orderId}:{})})}`,{signal})).data)});
  const prepare=hasEffectivePermission(user,"inventory","post")||hasEffectivePermission(user,"sales","create");
  return <><PageHeader title="Customer Returns & Credits" eyebrow="Inspected goods and customer settlement" actions={<><Button icon={<ArrowLeft className="h-4 w-4"/>} onClick={()=>navigate(hasEffectivePermission(user,"sales")?"/backend/sales":"/backend/inventory")}>Workspace</Button>{prepare?<Button variant="primary" icon={<Plus className="h-4 w-4"/>} onClick={()=>navigate(`/backend/returns/new${orderId?`?order=${encodeURIComponent(orderId)}`:""}`)}>New Return</Button>:null}</>}/>
    <div className="relative min-w-0"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input aria-label="Search returns" className={inputClass+" pl-9"} value={search} maxLength={120} placeholder="Return, customer, challan or invoice" onChange={(e)=>{setSearch(e.target.value);setPage(1);}}/></div>
    <Panel title="Return Register">{query.isPending?<LoadingBlock/>:query.isError?<ErrorBlock error={query.error}/>:<><TableFrame><table className="w-full min-w-[860px] text-left text-sm"><thead className="bg-blue-950 text-xs text-white"><tr>{["Return","Customer / Order","Original Documents","Kind","Received / Posted","Status","Actions"].map((h)=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{query.data.rows.map((r)=><tr key={r.id}><td className="p-3 font-semibold">{r.number}<small className="block font-normal">{r.createdByName}</small></td><td className="p-3">{r.customerName}<small className="block">{r.orderNumber}</small></td><td className="p-3">{r.challanNumber}<small className="block">{r.invoiceNumber??"No invoice credit"}</small></td><td className="p-3">{r.kind}</td><td className="p-3">{r.receivedDate}<small className="block">{r.postedDate??"Not posted"}</small></td><td className="p-3"><StatusBadge status={r.state}/></td><td className="p-3"><Button title="Open return inspection" aria-label={`Open ${r.number}`} icon={<Eye className="h-4 w-4"/>} onClick={()=>navigate(`/backend/returns/${r.id}`)}/></td></tr>)}</tbody></table></TableFrame>{!query.data.total?<p className="p-8 text-center text-sm text-slate-500">No matching returns.</p>:null}<WorkforcePager page={page} pageSize={25} total={query.data.total} onChange={setPage}/></>}</Panel>
  </>;
}
