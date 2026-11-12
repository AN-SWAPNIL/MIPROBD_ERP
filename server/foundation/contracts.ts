import { z } from "zod";
import { CapabilitySchema, PermissionOverrideSchema, RoleSchema } from "../../src/domains/schemas.js";
import { attachmentMimes, attachmentMetadataMatches } from "../../src/lib/files/attachments.js";

export const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(1024) }).strict();
export const recoverySchema = z.object({ email: z.email().max(254) }).strict();
export const exchangeSchema = z.object({ accessToken: z.string().min(20).max(8192), refreshToken: z.string().min(10).max(8192) }).strict();
export const resetSchema = z.object({ password: z.string().min(12).max(128) }).strict();
export const changePasswordSchema = resetSchema.extend({ currentPassword: z.string().min(1).max(1024) });
export const profileSchema = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().max(40) }).strict();
export const inviteSchema = z.object({
  email: z.email().max(254).transform((v) => v.toLowerCase()), name: z.string().trim().min(2).max(120),
  role: RoleSchema, employeeCode: z.string().trim().min(1).max(40),
  title: z.string().trim().max(100).default(""), department: z.string().trim().max(100).default(""), territory: z.string().trim().max(100).default(""), phone: z.string().trim().max(40).default("")
}).strict();
export const accessSchema = z.object({
  role: RoleSchema, status: z.enum(["Active", "Inactive"]),
  capabilities: z.array(CapabilitySchema).max(20), permissionOverrides: z.array(PermissionOverrideSchema).max(100),
  version: z.number().int().positive(), reason: z.string().trim().min(5).max(500)
}).strict();
export const uploadSchema = z.object({
  employeeId: z.string().min(1).max(100).optional(), purpose: z.enum(["employee-avatar", "employee-evidence", "import-document", "expense-receipt", "marketing-evidence", "field-visit-evidence", "product-image"]),
  visitAttemptId: z.string().min(1).max(200).optional(),
  importId: z.string().min(1).max(100).optional(), documentType: z.string().trim().min(1).max(100).optional(), sensitive: z.boolean().optional(),
  fileName: z.string().trim().min(1).max(180).refine((v) => !v.includes("/") && !v.includes("\\") && [...v].every((char) => char.charCodeAt(0) >= 32), "Invalid file name"),
  mimeType: z.enum(attachmentMimes),
  sizeBytes: z.number().int().min(1).max(10 * 1024 * 1024)
}).strict().refine(v=>attachmentMetadataMatches(v.fileName,v.mimeType),"File name and authorized type must match")
  .refine((v) => !["employee-avatar", "product-image"].includes(v.purpose) || (v.mimeType.startsWith("image/") && v.sizeBytes < 1_000_000), { message: "Image must be smaller than 1 MB.", path: ["sizeBytes"] })
  .refine(v=>v.purpose==="field-visit-evidence"?Boolean(v.visitAttemptId&&v.mimeType.startsWith("image/")&&v.sizeBytes<=307200&&!v.employeeId&&!v.importId&&!v.documentType):!v.visitAttemptId,"Visit evidence requires its own attempt and bounded image.")
  .refine((v) => ["expense-receipt", "marketing-evidence", "field-visit-evidence", "product-image"].includes(v.purpose) ? !v.importId && !v.employeeId && !v.documentType : v.purpose === "import-document" ? Boolean(v.importId && v.documentType && !v.employeeId) : Boolean(v.employeeId && !v.importId && !v.documentType), "Select exactly one valid document parent");
