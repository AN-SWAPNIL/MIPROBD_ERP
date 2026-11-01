import { z } from "zod";
import { positionSchema, visitPolicyDataSchema, type FieldVisit, type VisitPolicyData, type VisitPosition } from "../../src/domains/marketing/visitContracts.js";
import { listInput } from "./contracts.js";
const id=z.string().trim().min(1).max(200);const note=z.string().trim().max(3000);const version=z.number().int().positive();
export const visitListInput=listInput.safeExtend({customer:id.optional(),lead:id.optional()});
export const attemptInput=z.object({customerId:id.optional(),leadId:id.optional(),purpose:note.min(3)}).strict().refine(v=>Boolean(v.customerId)!==Boolean(v.leadId),"Choose exactly one assigned customer or lead.");
export const checkinInput=z.object({attemptId:id,position:positionSchema.nullable(),locationReason:note.default(""),photoId:z.uuid().optional(),photoMethod:z.enum(["IN_APP_CAMERA","FILE_SELECTED","NONE"]),photoReason:note.default(""),activityId:id.optional()}).strict().superRefine((v,c)=>{
  if(!v.position&&v.locationReason.length<5)c.addIssue({code:"custom",message:"Explain why location is unavailable."});
  if(Boolean(v.photoId)!==(v.photoMethod!=="NONE"))c.addIssue({code:"custom",message:"Photo and capture method must agree."});
  if(!v.photoId&&v.photoReason.length<5)c.addIssue({code:"custom",message:"Explain the no-photo exception."});
});
export const visitCompleteInput=z.object({version,outcome:note.min(3),nextFollowUpAt:z.iso.datetime({offset:true}).optional()}).strict().refine(v=>!v.nextFollowUpAt||Date.parse(v.nextFollowUpAt)>Date.now(),"Schedule a future follow-up.");
export const visitReviewInput=z.object({version,decision:z.enum(["Accepted","Rejected"]),reason:note.min(5)}).strict();
export const visitVoidInput=z.object({version,reason:note.min(5)}).strict();
export const visitPolicyInput=z.object({version,data:visitPolicyDataSchema,reason:note.min(5)}).strict();
export const siteInput=z.object({version:z.number().int().nonnegative(),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),source:note.min(5),reason:note.min(5)}).strict();
export function assessPosition(position:VisitPosition|null,policy:VisitPolicyData,receivedAt:Date,site?:{latitude:number;longitude:number}):Pick<FieldVisit,"quality"|"match"|"distanceMeters"> {
  if(!position)return {quality:"NO_LOCATION" as const,match:"NO_LOCATION" as const,distanceMeters:null};
  const age=receivedAt.getTime()-Date.parse(position.capturedAt);
  const quality=age>policy.maxAgeSeconds*1000||age< -5000?"STALE":position.accuracy>policy.accuracyMeters?"POOR_ACCURACY":"LOCATION_CAPTURED";
  let distanceMeters:number|null=null;
  if(site){const rad=(v:number)=>v*Math.PI/180;const a=Math.sin(rad(site.latitude-position.latitude)/2)**2+Math.cos(rad(position.latitude))*Math.cos(rad(site.latitude))*Math.sin(rad(site.longitude-position.longitude)/2)**2;distanceMeters=Math.round(6371008.8*2*Math.atan2(Math.sqrt(Math.min(1,a)),Math.sqrt(Math.max(0,1-a)))*100)/100;}
  const match=!site?"NO_REFERENCE":quality!=="LOCATION_CAPTURED"?"UNCERTAIN":distanceMeters!+position.accuracy<=policy.radiusMeters?"APPROX_MATCH":distanceMeters!-position.accuracy>policy.radiusMeters?"OUTSIDE":"UNCERTAIN";
  return {quality,match,distanceMeters};
}
