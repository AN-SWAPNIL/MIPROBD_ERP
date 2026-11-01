import { attachmentAccept } from "../../lib/files/attachments";
import { useState } from "react";
import { Save } from "lucide-react";
import Button from "../../components/ui/Button";
import { inputClass, textareaClass } from "../components";
import { businessDate } from "../../lib/date";
import { manualActivityKinds, type PersistentActivity, type PersistentFollowUp, type PersistentLead, type PersistentPlan, type PersistentTarget, type WorkforceReferences } from "./persistentContracts";
import { WorkforceField as Field, WorkforceSelect as Select } from "./WorkforceUi";

type Props={references:WorkforceReferences;actorId:string;busy:boolean;onSave:(payload:unknown)=>void};
export const titleCase=(value:string)=>value.replace(/([a-z])([A-Z])/g,"$1 $2").toLowerCase().replaceAll("_"," ").replace(/\b\w/g,(v)=>v.toUpperCase());
const localStamp=(value=new Date().toISOString())=>{const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const toStamp=(value:string)=>value?new Date(value).toISOString():undefined;
const subjectValue=(row?:{customerId:string|null;leadId:string|null})=>row?.customerId?`customer:${row.customerId}`:row?.leadId?`lead:${row.leadId}`:"";
const subjectFields=(value:string)=>value?{[value.startsWith("customer:")?"customerId":"leadId"]:value.slice(value.indexOf(":")+1)}:{};

function Products({references,values,onChange}:{references:WorkforceReferences;values:string[];onChange:(v:string[])=>void}) {
  return <fieldset className="sm:col-span-2"><legend className="mb-2 text-xs font-bold uppercase text-blue-900">Products</legend><div className="grid max-h-48 gap-2 overflow-y-auto rounded border border-blue-200 p-3 sm:grid-cols-2">{references.products.map((p)=><label className="flex min-w-0 items-start gap-2 text-sm" key={p.id}><input className="mt-1" type="checkbox" checked={values.includes(p.id)} onChange={(e)=>onChange(e.target.checked?[...values,p.id]:values.filter((id)=>id!==p.id))} /><span className="break-words">{p.code} | {p.name}</span></label>)}{!references.products.length?<p className="text-xs text-slate-500">No active products available.</p>:null}</div></fieldset>;
}
function Subject({references,owner,value,onChange,required=true}:{references:WorkforceReferences;owner:string;value:string;onChange:(v:string)=>void;required?:boolean}) {
  const options=[...references.customers.filter((r)=>r.assignedTo===owner).map((r)=>({value:`customer:${r.id}`,label:`Customer | ${r.name}`})),...references.leads.filter((r)=>r.assignedTo===owner).map((r)=>({value:`lead:${r.id}`,label:`Lead | ${r.name}`}))];
  if(value&&!options.some((r)=>r.value===value))options.push({value,label:"Previously selected contact"});
  return <Select label="Customer / Lead" value={value} onChange={onChange} options={options} required={required} />;
}
const SaveButton=({busy,label="Save"}:{busy:boolean;label?:string})=><div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" disabled={busy} icon={<Save className="h-4 w-4" />}>{label}</Button></div>;

export function ActivityForm({references,actorId,busy,onSave,row,onUpload}:{row?:PersistentActivity;onUpload:(files:File[])=>Promise<string[]>}&Props) {
  const [type,setType]=useState(row?.type??"CUSTOMER_CONTACT");const [subject,setSubject]=useState(subjectValue(row));const [at,setAt]=useState(localStamp(row?.occurredAt));
  const [products,setProducts]=useState(row?.productIds??[]);const [purpose,setPurpose]=useState(row?.purpose??"");const [remarks,setRemarks]=useState(row?.remarks??"");const [files,setFiles]=useState<File[]>([]);const [uploading,setUploading]=useState(false);const [error,setError]=useState("");
  const [status,setStatus]=useState<"Draft"|"Submitted">("Draft");
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={async(e)=>{e.preventDefault();setUploading(true);setError("");try{const ids=await onUpload(files);onSave({type,occurredAt:toStamp(at),...subjectFields(subject),productIds:products,purpose,remarks,status,attachmentIds:[...(row?.attachments.map((a)=>a.id)??[]),...ids],...(row?{version:row.version}:{})});}catch(err){setError(err instanceof Error?err.message:"Upload failed");}finally{setUploading(false);}}}>
    <Select label="Activity Category" value={type} onChange={setType} required options={manualActivityKinds.map((v)=>({value:v,label:titleCase(v)}))} />
    <Field label="Occurred At"><input className={inputClass} type="datetime-local" value={at} onChange={(e)=>setAt(e.target.value)} required /></Field>
    <Subject references={references} owner={actorId} value={subject} onChange={setSubject} required={!["GENERAL_NOTE","MARKET_SURVEY","OFFICE_COORDINATION"].includes(type)} />
    <Select label="Submission" value={status} onChange={(v)=>setStatus(v as typeof status)} required options={[{value:"Draft",label:"Save Draft"},{value:"Submitted",label:"Submit Final Activity"}]} />
    <Field label="Purpose"><textarea className={textareaClass} required minLength={3} maxLength={3000} value={purpose} onChange={(e)=>setPurpose(e.target.value)} /></Field>
    <Field label="Outcome / Details"><textarea className={textareaClass} maxLength={3000} value={remarks} onChange={(e)=>setRemarks(e.target.value)} /></Field>
    <Products references={references} values={products} onChange={setProducts} />
    <Field label="Private Evidence"><input className="block max-w-full text-sm" type="file" accept={attachmentAccept} multiple onChange={(e)=>setFiles(Array.from(e.target.files??[]).slice(0,Math.max(0,5-(row?.attachments.length??0))))} /><small className="mt-2 block text-slate-500">{row?.attachments.map((a)=>a.fileName).join(", ")}</small></Field>
    {error?<p role="alert" className="text-sm text-red-700">{error}</p>:null}<SaveButton busy={busy||uploading} label={uploading?"Uploading...":"Save Activity"} />
  </form>;
}

export function LeadForm({references,actorId,busy,onSave,row,managed}:{row?:PersistentLead;managed:boolean}&Props) {
  const [form,setForm]=useState({organization:row?.organization??"",organizationType:row?.organizationType??"Hospital",contact:row?.contact??"",phone:row?.phone??"",email:row?.email??"",address:row?.address??"",source:row?.source??"Field visit",stage:row?.manualStage??"NEW",lostReason:row?.lostReason??"",notes:row?.notes??"",assignedTo:row?.assignedTo??actorId});const [products,setProducts]=useState(row?.productIds??[]);
  const set=(key:keyof typeof form,value:string)=>setForm({...form,[key]:value});
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e)=>{e.preventDefault();onSave({...form,productIds:products,...(row?{version:row.version}:{})});}}>
    {([['organization','Organization'],['contact','Contact Name'],['phone','Phone'],['email','Email'],['address','Address'],['source','Lead Source']] as const).map(([key,label])=><Field label={label} key={key}><input className={inputClass} type={key==="email"?"email":"text"} value={form[key]} required={["organization","contact","phone","source"].includes(key)} onChange={(e)=>set(key,e.target.value)} /></Field>)}
    <Select label="Organization Type" value={form.organizationType} onChange={(v)=>set("organizationType",v)} required options={["Hospital","Clinic","Dealer","Pharmacy","Other"].map((v)=>({value:v,label:v}))} />
    <Select label="Prospect Stage" value={form.stage} onChange={(v)=>set("stage",v)} required options={["NEW","CONTACTED","INTERESTED","PRESENTATION","SAMPLE","NEGOTIATION","LOST"].map((v)=>({value:v,label:titleCase(v)}))} />
    {managed?<Select label="Assigned Employee" value={form.assignedTo} onChange={(v)=>set("assignedTo",v)} required options={references.employees.map((e)=>({value:e.id,label:`${e.name} | ${e.employeeCode}`}))} />:null}
    {form.stage==="LOST"?<Field label="Lost Reason"><textarea className={textareaClass} required minLength={5} value={form.lostReason} onChange={(e)=>set("lostReason",e.target.value)} /></Field>:null}
    <Field label="Notes"><textarea className={textareaClass} value={form.notes} onChange={(e)=>set("notes",e.target.value)} /></Field><Products references={references} values={products} onChange={setProducts} /><SaveButton busy={busy} label="Save Lead" />
  </form>;
}

export function FollowUpForm({references,actorId,busy,onSave,row,managed}:{row?:PersistentFollowUp;managed:boolean}&Props) {
  const [owner,setOwner]=useState(row?.assignedTo??actorId);const [subject,setSubject]=useState(subjectValue(row));const [due,setDue]=useState(localStamp(row?.dueAt??new Date(Date.now()+86400000).toISOString()));const [purpose,setPurpose]=useState(row?.purpose??"");
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e)=>{e.preventDefault();onSave({assignedTo:owner,...subjectFields(subject),dueAt:toStamp(due),purpose,...(row?{version:row.version}:{})});}}>
    {managed?<Select label="Assigned Employee" value={owner} onChange={(v)=>{setOwner(v);setSubject("");}} required options={references.employees.map((e)=>({value:e.id,label:`${e.name} | ${e.employeeCode}`}))} />:null}
    <Subject references={references} owner={owner} value={subject} onChange={setSubject} /><Field label="Follow-up Due"><input type="datetime-local" className={inputClass} required value={due} onChange={(e)=>setDue(e.target.value)} /></Field><Field label="Purpose"><textarea className={textareaClass} required minLength={3} value={purpose} onChange={(e)=>setPurpose(e.target.value)} /></Field><SaveButton busy={busy} label="Save Follow-up" />
  </form>;
}

export function PlanForm({references,actorId,busy,onSave,row}:{row?:PersistentPlan}&Props) {
  const [kind,setKind]=useState(row?.kind??"Daily");const [period,setPeriod]=useState(row?.period??businessDate());const [notes,setNotes]=useState(row?.data.notes??"");const [priorities,setPriorities]=useState(row?.data.priorities.join("\n")??"");const [products,setProducts]=useState(row?.data.productIds??[]);const [count,setCount]=useState(row?.data.plannedActivities??0);const [status,setStatus]=useState("Draft");
  const [visits,setVisits]=useState((row?.data.visits??[]).map((v)=>({subject:subjectValue({customerId:v.customerId??null,leadId:v.leadId??null}),purpose:v.purpose})));
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e)=>{e.preventDefault();onSave({kind,period:kind==="Monthly"?period.slice(0,7)+"-01":period,status,notes,priorities:priorities.split("\n").map((v)=>v.trim()).filter(Boolean),productIds:products,plannedActivities:count,visits:visits.map((v)=>({...subjectFields(v.subject),purpose:v.purpose})),...(row?{version:row.version}:{})});}}>
    <Select label="Plan Period" required value={kind} onChange={(v)=>setKind(v as typeof kind)} options={["Daily","Monthly"].map((v)=>({value:v,label:v}))} />
    <Field label={kind==="Monthly"?"Month":"Date"}><input className={inputClass} type={kind==="Monthly"?"month":"date"} required value={kind==="Monthly"?period.slice(0,7):period} onChange={(e)=>setPeriod(kind==="Monthly"?e.target.value+"-01":e.target.value)} disabled={Boolean(row)} /></Field>
    <Field label="Planned Activities"><input className={inputClass} type="number" min={0} max={10000} required value={count} onChange={(e)=>setCount(Number(e.target.value))} /></Field><Select label="Submission" value={status} onChange={setStatus} required options={[{value:"Draft",label:"Save Draft"},{value:"Submitted",label:"Submit for Review"}]} />
    <Field label="Priorities (One per Line)"><textarea className={textareaClass} value={priorities} onChange={(e)=>setPriorities(e.target.value)} /></Field><Field label="Notes"><textarea className={textareaClass} value={notes} onChange={(e)=>setNotes(e.target.value)} /></Field>
    <Products references={references} values={products} onChange={setProducts} />
    <fieldset className="grid gap-3 sm:col-span-2"><legend className="mb-2 text-xs font-bold uppercase text-blue-900">Planned Contacts</legend>{visits.map((v,index)=><div className="grid gap-3 border-b border-blue-100 pb-3 sm:grid-cols-[1fr_1fr_auto]" key={index}><Subject references={references} owner={actorId} value={v.subject} onChange={(subject)=>setVisits(visits.map((r,i)=>i===index?{...r,subject}:r))} /><Field label="Purpose"><input className={inputClass} required minLength={3} value={v.purpose} onChange={(e)=>setVisits(visits.map((r,i)=>i===index?{...r,purpose:e.target.value}:r))} /></Field><Button onClick={()=>setVisits(visits.filter((_,i)=>i!==index))}>Remove</Button></div>)}<Button disabled={visits.length>=40} onClick={()=>setVisits([...visits,{subject:"",purpose:""}])}>Add Planned Contact</Button></fieldset><SaveButton busy={busy} label="Save Plan" />
  </form>;
}

export function TargetForm({references,actorId,busy,onSave,row}:{row?:PersistentTarget}&Props) {
  const [form,setForm]=useState({employeeId:row?.employeeId??actorId,month:(row?.month??businessDate()).slice(0,7),sales:row?.sales??"0",collections:row?.collections??"0",customers:row?.customers??0,activities:row?.activities??0,visits:row?.visits??0,reason:""});
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e)=>{e.preventDefault();onSave({...form,month:form.month+"-01",...(row?{version:row.version}:{})});}}><Select label="Employee" value={form.employeeId} required onChange={(employeeId)=>setForm({...form,employeeId})} options={references.employees.map((e)=>({value:e.id,label:`${e.name} | ${e.employeeCode}`}))} /><Field label="Month"><input className={inputClass} type="month" required disabled={Boolean(row)} value={form.month} onChange={(e)=>setForm({...form,month:e.target.value})} /></Field>
    {([['sales','Sales Target (BDT)'],['collections','Collection Target (BDT)'],['customers','New Customers'],['activities','Submitted Activities'],['visits','Verified Visits (Actuals Pending)']] as const).map(([key,label])=><Field label={label} key={key}><input className={inputClass} type="number" required min={0} step={["sales","collections"].includes(key)?"0.01":"1"} value={form[key]} onChange={(e)=>setForm({...form,[key]:["sales","collections"].includes(key)?e.target.value:Number(e.target.value)})} /></Field>)}<Field label="Change Reason"><textarea className={textareaClass} required minLength={5} value={form.reason} onChange={(e)=>setForm({...form,reason:e.target.value})} /></Field><SaveButton busy={busy} label="Save Target" /></form>;
}

export function ReasonForm({busy,onSave,label="Reason",nextDate=false,children}:{busy:boolean;onSave:(reason:string,next?:string)=>void;label?:string;nextDate?:boolean;children?:React.ReactNode}) {
  const [reason,setReason]=useState("");const [next,setNext]=useState("");
  return <form className="grid gap-4" onSubmit={(e)=>{e.preventDefault();onSave(reason,toStamp(next));}}>{children}<Field label={label}><textarea className={textareaClass} required minLength={5} maxLength={3000} value={reason} onChange={(e)=>setReason(e.target.value)} /></Field>{nextDate?<Field label="Next Follow-up (Optional)"><input className={inputClass} type="datetime-local" value={next} onChange={(e)=>setNext(e.target.value)} /></Field>:null}<SaveButton busy={busy} label="Confirm" /></form>;
}
