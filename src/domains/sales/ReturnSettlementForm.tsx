import { useDeferredValue,useState } from "react";
import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Send } from "lucide-react";
import Button from "../../components/ui/Button";
import { apiRequest } from "../../lib/api/client";
import { ErrorBlock,LoadingBlock,inputClass,labelClass,textareaClass } from "../components";
import { WorkforcePager } from "../marketing/WorkforceUi";
import MasterSelect from "../masters/MasterSelect";
import { formatMoney } from "../../utils/precise";
import { returnSchema,returnSettlementInput,returnTargetPageSchema,type ReturnDto } from "./returnContracts";

export default function ReturnSettlementForm({source,kind,onClose}:{source:ReturnDto;kind:"Refund"|"Apply Credit";onClose:()=>void}){
  const [amountBdt,setAmount]=useState(""),[accountId,setAccount]=useState(""),[invoiceId,setInvoice]=useState(""),[reason,setReason]=useState(""),[proofReference,setProof]=useState(""),[key]=useState(()=>crypto.randomUUID()),[page,setPage]=useState(1),[search,setSearch]=useState(""),term=useDeferredValue(search),client=useQueryClient();
  const accounts=useQuery({queryKey:["sales","refund-accounts"],enabled:kind==="Refund",queryFn:async()=>z.array(z.object({id:z.string(),name:z.string(),type:z.string()})).parse((await apiRequest("/api/payment-accounts")).data)});
  const targets=useQuery({queryKey:["sales","return-targets",source.id,term,page],enabled:kind==="Apply Credit",queryFn:async({signal})=>returnTargetPageSchema.parse((await apiRequest(`/api/returns/${source.id}/credit-targets?${new URLSearchParams({search:term,page:String(page)})}`,{signal})).data)});
  const save=useMutation({mutationFn:async()=>returnSchema.parse((await apiRequest(`/api/returns/${source.id}/settlements`,{method:"POST",headers:{"Idempotency-Key":key},body:JSON.stringify(returnSettlementInput.parse({kind,amountBdt,...(kind==="Refund"?{accountId}:targets.data?.rows.find(t=>t.id===invoiceId)?.kind==="Opening Due"?{receivableEntryId:invoiceId}:{invoiceId}),reason,proofReference}))})).data),onSuccess:async()=>{await client.invalidateQueries();onClose();}});
  return <form className="grid min-w-0 gap-4" onSubmit={(e)=>{e.preventDefault();save.mutate();}}><p className="text-sm font-semibold text-blue-950">{kind==="Refund"?"Refundable net customer credit":"Unapplied return credit"}: {formatMoney(kind==="Refund"?source.refundableBdt??"0":source.availableCreditBdt??"0")}</p>
    <label><span className={labelClass}>Amount (BDT)</span><input required inputMode="decimal" className={inputClass} value={amountBdt} onChange={(e)=>setAmount(e.target.value)}/></label>
    {kind==="Refund"?accounts.isPending?<LoadingBlock/>:accounts.isError?<ErrorBlock error={accounts.error}/>:<label><span className={labelClass}>Refund account</span><MasterSelect kind="accounts" label="Refund account" required value={accountId} onChange={setAccount} options={accounts.data.map(a=>({id:a.id,label:`${a.name} | ${a.type}`}))} /></label>:<div className="grid gap-2"><label><span className={labelClass}>Find invoice / opening due</span><input className={inputClass} maxLength={120} value={search} onChange={(e)=>{setSearch(e.target.value);setPage(1);setInvoice("");}}/></label>{targets.isPending?<LoadingBlock/>:targets.isError?<ErrorBlock error={targets.error}/>:<><label><span className={labelClass}>Outstanding receivable</span><select aria-label="Outstanding invoice" required className={inputClass} value={invoiceId} onChange={(e)=>setInvoice(e.target.value)}><option value="">Select receivable</option>{targets.data.rows.map((i)=><option key={i.id} value={i.id}>{i.invoiceNumber} | {i.kind} | Due {formatMoney(i.due)}</option>)}</select></label><WorkforcePager page={page} pageSize={25} total={targets.data.total} onChange={(p)=>{setInvoice("");setPage(p);}}/></>}</div>}
    <label><span className={labelClass}>Settlement reason</span><textarea required minLength={5} maxLength={1000} className={textareaClass} value={reason} onChange={(e)=>setReason(e.target.value)}/></label><label><span className={labelClass}>Evidence / payment reference</span><input required minLength={3} maxLength={200} className={inputClass} value={proofReference} onChange={(e)=>setProof(e.target.value)}/></label>
    {save.isError?<ErrorBlock error={save.error}/>:null}<div className="flex justify-end gap-2"><Button disabled={save.isPending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={save.isPending} icon={<Send className="h-4 w-4"/>}>Submit for Approval</Button></div>
  </form>;
}
