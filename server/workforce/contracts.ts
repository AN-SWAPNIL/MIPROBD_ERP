import { z } from "zod";
import { manualActivityKinds } from "../../src/domains/marketing/persistentContracts.js";
import { businessDate } from "../../src/lib/date.js";
import { decimalInput } from "../operations/contracts.js";

const text = z.string().trim().max(200);
const note = z.string().trim().max(3000);
const id = text.min(1);
const stamp = z.iso.datetime({ offset: true });
const version = z.number().int().positive();
export const reasonInput = z.object({ version, reason: note.min(5) }).strict();
export const listInput = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(10).max(100).default(25), search: text.default(""), employee: id.optional(), status: text.optional(), from: z.iso.date().optional(), to: z.iso.date().optional() }).strict().superRefine((v,ctx) => {
  if (Boolean(v.from) !== Boolean(v.to) || v.from && v.to && (v.from > v.to || v.to > businessDate() || Date.parse(v.to)-Date.parse(v.from)>3660*86400000)) ctx.addIssue({ code:"custom",message:"Select a valid reporting period, at most ten years, ending no later than today." });
});
export const employeeProfileInput = z.object({ version, reason: note.min(5), name: text.min(2).max(120), title: text.max(100), department: text.max(100), territory: text.max(100), phone: text.max(40), employeeCode: text.min(1).max(40), managerId: id.nullable() }).strict();
const subject = { leadId: id.optional(), customerId: id.optional() };
const productIds = id.array().max(50).refine((v) => new Set(v).size === v.length,"Choose each product once.");
export const activityFields = z.object({ type: z.enum(manualActivityKinds), occurredAt: stamp, ...subject, productIds: productIds.default([]), purpose: note.min(3), remarks: note.default(""), nextFollowUpAt: stamp.nullable().optional(), status: z.enum(["Draft","Submitted"]), attachmentIds: z.uuid().array().max(5).default([]) }).strict().superRefine((v,ctx) => {
  if (v.leadId && v.customerId || !["GENERAL_NOTE","MARKET_SURVEY","OFFICE_COORDINATION"].includes(v.type) && !v.leadId && !v.customerId) ctx.addIssue({ code:"custom",message:"Choose one authorized customer or lead for this activity." });
  if (Date.parse(v.occurredAt)>Date.now()+5*60000 || Date.now()-Date.parse(v.occurredAt)>366*86400000) ctx.addIssue({ code:"custom",path:["occurredAt"],message:"Activity time must be within the last year and not in the future." });
});
export const activityUpdate = activityFields.safeExtend({ version });
export const manualStages = ["NEW","CONTACTED","INTERESTED","PRESENTATION","SAMPLE","NEGOTIATION","LOST"] as const;
export const leadFields = z.object({ organization: text.min(2), organizationType: z.enum(["Hospital","Clinic","Dealer","Pharmacy","Other"]), contact: text.min(2), phone: text.min(3).max(40), email: z.union([z.email(),z.literal("")]).default(""), address: note.default(""), source: text.min(1), productIds: productIds.min(1), assignedTo: id.optional(), stage: z.enum(manualStages).default("NEW"), lostReason: note.default(""), notes: note.default(""), nextFollowUpAt: stamp.nullable().optional() }).strict().refine((v) => v.stage !== "LOST" || v.lostReason.length >= 5,"A lost lead requires a reason.");
export const leadUpdate = leadFields.safeExtend({ version });
export const convertInput = z.object({ version, paymentTerms: note.default(""), creditLimit: decimalInput(2).default("0") }).strict();
export const followUpInput = z.object({ assignedTo: id.optional(), ...subject, dueAt: stamp, purpose: note.min(3) }).strict().refine((v) => Boolean(v.leadId) !== Boolean(v.customerId),"Select one customer or lead.");
export const followUpUpdate = followUpInput.safeExtend({ version });
export const completeInput = z.object({ version, outcome: note.min(3), nextFollowUpAt: stamp.optional() }).strict().refine((v)=>!v.nextFollowUpAt || Date.parse(v.nextFollowUpAt)>Date.now(),"Next follow-up must be in the future.");
export const planInput = z.object({ version: version.optional(), kind: z.enum(["Daily","Monthly"]), period: z.iso.date(), status: z.enum(["Draft","Submitted"]), notes: note.default(""), priorities: text.min(1).array().max(30).default([]), productIds: productIds.default([]), plannedActivities: z.number().int().min(0).max(10000), visits: z.array(z.object({ ...subject, purpose: note.min(3) }).strict().refine((v) => Boolean(v.leadId) !== Boolean(v.customerId),"Select one planned subject.")).max(40).default([]) }).strict().refine((v) => v.kind !== "Monthly" || v.period.endsWith("-01"),"Monthly plans use the first day of the month.");
export const reviewInput = z.object({ version, status: z.enum(["Approved","Rejected"]), reason: note.min(5) }).strict();
export const targetInput = z.object({ version: version.optional(), employeeId: id, month: z.iso.date().refine((v)=>v.endsWith("-01")), sales: decimalInput(2), collections: decimalInput(2), customers: z.number().int().min(0).max(100000), activities: z.number().int().min(0).max(100000), visits: z.number().int().min(0).max(100000), reason: note.min(5) }).strict();
export const ruleInput = z.object({ version, points: z.number().int().min(0).max(1000), active: z.boolean(), reason: note.min(5) }).strict();
