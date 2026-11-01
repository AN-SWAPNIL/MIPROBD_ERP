import { z } from "zod";
import { domainRequest } from "../services";
import { apiRequest } from "../../lib/api/client";
import { attachmentMime } from "../../lib/files/attachments";
import { activityRowSchema, employeeAccessSchema, employeeRefSchema, followUpRowSchema, leadRowSchema, pageSchema, planRowSchema, referenceDataSchema, scoreRuleSchema, targetRowSchema } from "./persistentContracts";

export type WorkforceFilters = { page?:number;pageSize?:number;search?:string;employee?:string;status?:string;from?:string;to?:string };
const params=(query:WorkforceFilters)=>new URLSearchParams(Object.entries(query).filter(([,v])=>v!==undefined&&v!=="").map(([k,v])=>[k,String(v)]));
const idSchema=z.object({id:z.string()});
const send=<T>(path:string,schema:z.ZodType<T>,payload:unknown,method="POST")=>domainRequest(path,schema,{method,body:JSON.stringify(payload)});
export const workforceService = {
  async upload(file:File,purpose:"marketing-evidence"|"employee-avatar",employeeId?:string) {
    const mimeType=attachmentMime(file.name,file.type);
    if(file.size>10*1024*1024||purpose==="employee-avatar"&&(!mimeType.startsWith("image/")||file.size>2*1024*1024))throw new Error("Use a business attachment up to 10 MB, or a profile image up to 2 MB.");
    const upload=await apiRequest<{id:string;signedUrl:string}>("/api/uploads",{method:"POST",body:JSON.stringify({purpose,employeeId,fileName:file.name,mimeType,sizeBytes:file.size})});
    const stored=await fetch(upload.data.signedUrl,{method:"PUT",headers:{"Content-Type":mimeType},body:file});
    if(!stored.ok)throw new Error("File upload failed; no business submission was saved.");
    await apiRequest(`/api/uploads/${upload.data.id}/complete`,{method:"POST",body:"{}"});return upload.data.id;
  },
  document: (id:string)=>apiRequest<{url:string}>(`/api/documents/${encodeURIComponent(id)}`).then((result)=>result.data.url),
  employees: (query:WorkforceFilters={})=>domainRequest(`/api/workforce/employees?${params(query)}`,pageSchema(employeeRefSchema)),
  managers: ()=>domainRequest("/api/workforce/managers",z.array(z.object({id:z.string(),name:z.string()}))),
  access: (id:string)=>domainRequest(`/api/workforce/employees/${encodeURIComponent(id)}/access`,employeeAccessSchema),
  photo: (id:string)=>domainRequest(`/api/workforce/employees/${encodeURIComponent(id)}/photo`,z.object({url:z.string(),expiresIn:z.number()}).nullable()),
  saveProfile: (id:string,payload:unknown)=>send(`/api/workforce/employees/${encodeURIComponent(id)}`,idSchema,payload,"PATCH"),
  invite: (payload:unknown)=>send("/api/employees/invite",z.object({id:z.string(),invitationSent:z.boolean()}),payload),
  retryInvite: (id:string)=>send(`/api/employees/${encodeURIComponent(id)}/invite`,z.object({id:z.string(),invitationSent:z.boolean()}),{}),
  saveAccess: (id:string,payload:unknown)=>send(`/api/employees/${encodeURIComponent(id)}/access`,employeeAccessSchema,payload,"PATCH"),
  references: ()=>domainRequest("/api/workforce/references",referenceDataSchema),
  activities: (query:WorkforceFilters={})=>domainRequest(`/api/workforce/activities?${params(query)}`,pageSchema(activityRowSchema)),
  createActivity: (payload:unknown)=>send("/api/workforce/activities",activityRowSchema,payload),
  updateActivity: (id:string,payload:unknown)=>send(`/api/workforce/activities/${encodeURIComponent(id)}`,activityRowSchema,payload,"PATCH"),
  voidActivity: (id:string,payload:unknown)=>send(`/api/workforce/activities/${encodeURIComponent(id)}/void`,activityRowSchema,payload),
  leads: (query:WorkforceFilters={})=>domainRequest(`/api/workforce/leads?${params(query)}`,pageSchema(leadRowSchema)),
  createLead: (payload:unknown)=>send("/api/workforce/leads",leadRowSchema,payload),
  updateLead: (id:string,payload:unknown)=>send(`/api/workforce/leads/${encodeURIComponent(id)}`,leadRowSchema,payload,"PATCH"),
  convertLead: (id:string,payload:unknown)=>send(`/api/workforce/leads/${encodeURIComponent(id)}/convert`,leadRowSchema,payload),
  followUps: (query:WorkforceFilters={})=>domainRequest(`/api/workforce/follow-ups?${params(query)}`,pageSchema(followUpRowSchema)),
  createFollowUp: (payload:unknown)=>send("/api/workforce/follow-ups",idSchema,payload),
  updateFollowUp: (id:string,payload:unknown)=>send(`/api/workforce/follow-ups/${encodeURIComponent(id)}`,idSchema,payload,"PATCH"),
  followUpAction: (id:string,action:"complete"|"cancel",payload:unknown)=>send(`/api/workforce/follow-ups/${encodeURIComponent(id)}/${action}`,idSchema,payload),
  plans: (query:WorkforceFilters={})=>domainRequest(`/api/workforce/plans?${params(query)}`,pageSchema(planRowSchema)),
  savePlan: (payload:unknown)=>send("/api/workforce/plans",idSchema,payload),
  reviewPlan: (id:string,payload:unknown)=>send(`/api/workforce/plans/${encodeURIComponent(id)}/review`,idSchema,payload),
  targets: (query:WorkforceFilters={})=>domainRequest(`/api/workforce/targets?${params(query)}`,pageSchema(targetRowSchema)),
  saveTarget: (payload:unknown)=>send("/api/workforce/targets",idSchema,payload),
  rules: ()=>domainRequest("/api/workforce/score-rules",scoreRuleSchema.array()),
  saveRule: (event:string,payload:unknown)=>send(`/api/workforce/score-rules/${encodeURIComponent(event)}`,idSchema,payload,"PATCH")
};
