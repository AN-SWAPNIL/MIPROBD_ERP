import { useQuery } from "@tanstack/react-query";
import { ImagePlus, Mail, Save, ShieldCheck } from "lucide-react";
import { useState } from "react";
import Button from "../../components/ui/Button";
import { canAssignRole, canGrantCapability, canGrantPermission, hasRolePermission } from "../../lib/permissions/effectiveAccess";
import { permissionActions, permissionKeys } from "../../lib/permissions/definitions";
import { roles, type User, type UserPermissionOverride } from "../../types";
import { inputClass, labelClass, LoadingBlock, ErrorBlock, textareaClass } from "../components";
import { workforceService } from "../marketing/workforceService";
import type { EmployeeRef } from "../marketing/persistentContracts";
import { capabilityOptions, RoleAccessSummary } from "./EmployeeEditor";

type Save=(payload:unknown)=>void;
const Field=({label,children}:{label:string;children:React.ReactNode})=><label><span className={labelClass}>{label}</span>{children}</label>;

export function InviteEmployeeForm({actor,busy,onSave}:{actor:User;busy:boolean;onSave:Save}) {
  const allowedRoles=roles.filter((role)=>canAssignRole(actor,role));
  const [form,setForm]=useState({name:"",email:"",employeeCode:"",title:"",department:"",territory:"",phone:"",role:allowedRoles.includes("Sales Executive")?"Sales Executive":allowedRoles[0]??""});
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event)=>{event.preventDefault();onSave(form);}}>
    {([['name','Full Name'],['email','Login Email'],['employeeCode','Employee ID'],['title','Designation'],['department','Department'],['territory','Territory'],['phone','Phone']] as const).map(([key,label])=><Field label={label} key={key}><input className={inputClass} type={key==="email"?"email":"text"} required={["name","email","employeeCode"].includes(key)} value={form[key]} onChange={(event)=>setForm({...form,[key]:event.target.value})} /></Field>)}
    <Field label="Initial Role"><select aria-label="Assigned Role" className={inputClass} value={form.role} onChange={(event)=>setForm({...form,role:event.target.value as User["role"]})}>{roles.filter((role)=>canAssignRole(actor,role)).map((role)=><option key={role}>{role}</option>)}</select></Field>
    <p className="text-xs leading-5 text-amber-800 sm:col-span-2">Pending invitation. The employee chooses their own password through the verified email link.</p>
    <div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" icon={<Mail className="h-4 w-4" />} disabled={busy}>Invite Employee</Button></div>
  </form>;
}

export function EmployeeProfileForm({employee,actor,busy,onSave,onPhoto}:{employee:EmployeeRef;actor:User;busy:boolean;onSave:Save;onPhoto:(file:File)=>void}) {
  const [form,setForm]=useState({name:employee.name,employeeCode:employee.employeeCode,title:employee.title,department:employee.department,territory:employee.territory,phone:employee.phone,managerId:employee.managerId,reason:""});
  const managers=useQuery({queryKey:["employees","managers"],queryFn:workforceService.managers,enabled:actor.role==="Super Admin"});
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event)=>{event.preventDefault();onSave({...form,version:employee.version});}}>
    {([['name','Full Name'],['employeeCode','Employee ID'],['title','Designation'],['department','Department'],['territory','Territory'],['phone','Phone']] as const).map(([key,label])=><Field label={label} key={key}><input className={inputClass} required={["name","employeeCode"].includes(key)} value={form[key]} onChange={(event)=>setForm({...form,[key]:event.target.value})} /></Field>)}
    <Field label="Reports To">{actor.role==="Super Admin"?<select aria-label="Reports To" className={inputClass} value={form.managerId??""} onChange={(event)=>setForm({...form,managerId:event.target.value||null})}><option value="">Unassigned</option>{managers.data?.filter((m)=>m.id!==employee.id).map((manager)=><option value={manager.id} key={manager.id}>{manager.name}</option>)}</select>:<input className={inputClass} readOnly value={employee.managerName} />}</Field>
    <label className="flex min-h-10 cursor-pointer items-center justify-center gap-2 self-end rounded-md border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-900"><ImagePlus className="h-4 w-4" />Profile Photo<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event)=>{const file=event.target.files?.[0];if(file)onPhoto(file);}} /></label>
    <Field label="Change Reason"><textarea className={textareaClass} required minLength={5} value={form.reason} onChange={(event)=>setForm({...form,reason:event.target.value})} /></Field>
    {managers.isError?<p role="alert" className="text-sm text-red-700">{managers.error.message}</p>:null}
    <div className="flex items-end justify-end"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy}>Save Employee</Button></div>
  </form>;
}

export function EmployeeAccessForm({id,actor,busy,onSave}:{id:string;actor:User;busy:boolean;onSave:Save}) {
  const query=useQuery({queryKey:["employees","access",id],queryFn:()=>workforceService.access(id)});
  if(query.isPending)return <LoadingBlock label="Loading current access" />;
  if(query.isError)return <ErrorBlock error={query.error} />;
  return <AccessEditor key={query.data.version} employee={query.data} actor={actor} busy={busy} onSave={onSave} />;
}
function AccessEditor({employee,actor,busy,onSave}:{employee:User&{version:number};actor:User;busy:boolean;onSave:Save}) {
  const [form,setForm]=useState({role:employee.role,status:employee.status==="Inactive"?"Inactive":"Active",capabilities:employee.capabilities??[],permissionOverrides:employee.permissionOverrides??[],reason:""});
  const setEffect=(permission:UserPermissionOverride["permission"],action:UserPermissionOverride["action"],effect:string)=>setForm({...form,permissionOverrides:[...form.permissionOverrides.filter((row)=>row.permission!==permission||row.action!==action),...(effect==="DEFAULT"?[]:[{permission,action,effect:effect as "ALLOW"|"DENY"}])]});
  return <form className="grid gap-4" onSubmit={(event)=>{event.preventDefault();onSave({...form,version:employee.version});}}>
    <p className="text-sm font-semibold text-slate-700">{employee.name} | {employee.email}</p>
    {employee.status==="Pending"?<p className="text-sm text-amber-800">Pending employees must accept their invitation before activation.</p>:null}
    <RoleAccessSummary role={form.role} />
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Assigned Role"><select aria-label="Assigned Role" className={inputClass} value={form.role} onChange={(event)=>setForm({...form,role:event.target.value as User["role"]})}>{roles.filter((role)=>canAssignRole(actor,role)).map((role)=><option key={role}>{role}</option>)}</select></Field><Field label="Account Status"><select aria-label="Account Status" className={inputClass} value={form.status} onChange={(event)=>setForm({...form,status:event.target.value})}><option>Active</option><option>Inactive</option></select></Field></div>
    <details className="border border-blue-200"><summary className="cursor-pointer p-3 text-sm font-bold text-blue-950">Employee-Specific Access</summary><div className="grid gap-3 border-t border-blue-100 p-3">{permissionKeys.map((permission)=><fieldset className="grid gap-2 border-b border-blue-100 pb-3 sm:grid-cols-2 lg:grid-cols-3" key={permission}><legend className="mb-2 text-xs font-bold uppercase text-blue-900">{permission}</legend>{permissionActions.map((action)=>{const effect=form.permissionOverrides.find((row)=>row.permission===permission&&row.action===action)?.effect??"DEFAULT";return <Field label={`${action} | role ${hasRolePermission(form.role,permission,action)?"allowed":"denied"}`} key={action}><select className={inputClass} disabled={form.role==="Super Admin"} value={form.role==="Super Admin"?"ALLOW":effect} onChange={(event)=>setEffect(permission,action,event.target.value)}><option value="DEFAULT">Role default</option>{canGrantPermission(actor,permission,action,"ALLOW")?<option value="ALLOW">Additional allow</option>:null}<option value="DENY">Explicit deny</option></select></Field>;})}</fieldset>)}</div></details>
    <fieldset className="grid gap-2 sm:grid-cols-2"><legend className="mb-2 text-xs font-bold uppercase text-blue-900">Capabilities</legend>{capabilityOptions.map(([capability,label])=><label className="flex items-center gap-2 text-sm" key={capability}><input type="checkbox" checked={form.role==="Super Admin"||form.capabilities.includes(capability)} disabled={form.role==="Super Admin"||!canGrantCapability(actor,capability)} onChange={(event)=>setForm({...form,capabilities:event.target.checked?[...form.capabilities,capability]:form.capabilities.filter((c)=>c!==capability)})} />{label}</label>)}</fieldset>
    <Field label="Change Reason"><textarea className={textareaClass} minLength={5} required value={form.reason} onChange={(event)=>setForm({...form,reason:event.target.value})} /></Field>
    <div className="flex justify-end"><Button type="submit" variant="primary" icon={<ShieldCheck className="h-4 w-4" />} disabled={busy||employee.status==="Pending"}>Save Access</Button></div>
  </form>;
}
