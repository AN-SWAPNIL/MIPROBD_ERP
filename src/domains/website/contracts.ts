import { z } from "zod";
import { PublicCertificateSchema, PublicHeroSlideSchema, PublicProductCategoryRecordSchema, PublicProductSchema, PublicResourceSchema, PublicSiteSettingsSchema } from "../../features/public/public.schemas.js";

export const websiteKind = z.enum(["company", "hero", "category", "product", "certificate", "resource"]);
export type WebsiteKind = z.infer<typeof websiteKind>;
export const websiteSchemas = {
  company: PublicSiteSettingsSchema.strict(), hero: PublicHeroSlideSchema.strict(), category: PublicProductCategoryRecordSchema.strict(),
  product: PublicProductSchema.extend({ specifications: z.array(z.object({ label: z.string(), value: z.string() }).strict()) }).strict(),
  certificate: PublicCertificateSchema.extend({ file: PublicCertificateSchema.shape.file.strict() }).strict(),
  resource: PublicResourceSchema.extend({ sources: z.array(z.object({ label: z.string(), url: z.string() }).strict()).optional() }).strict()
};
export const editorialReason = z.string().trim().min(5).max(1000);
export const editorialInput = z.object({ version: z.number().int().positive().optional(), intent: z.enum(["save-draft", "publish"]), reason: editorialReason, data: z.unknown() }).strict();
export const editorialAction = z.object({ version: z.number().int().positive(), action: z.enum(["unpublish", "archive", "restore"]), reason: editorialReason }).strict();
export const websiteRecord = z.object({
  id: z.string(), key: z.string(), kind: websiteKind, data: z.record(z.string(), z.unknown()), version: z.number().int().positive(),
  publishedVersion: z.number().int().positive().nullable(), archived: z.boolean(), updatedAt: z.iso.datetime(),
  state: z.enum(["Draft", "Published", "Published with draft", "Archived"])
});
export const websiteRevision = z.object({ version: z.number().int().positive(), action: z.string(), reason: z.string(), actor: z.string(), createdAt: z.iso.datetime() });
export const websitePage = z.object({ rows: z.array(websiteRecord), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive() });
export const websiteReferences = z.object({
  categories: z.array(PublicProductCategoryRecordSchema), products: z.array(PublicProductSchema), certificates: z.array(PublicCertificateSchema),
  employees: z.array(z.object({ id: z.string(), name: z.string(), employeeCode: z.string(), title: z.string(), territory: z.string() })),
  erpProducts: z.array(z.object({ id: z.string(), code: z.string(), name: z.string(), imageUrl: z.string() })), truncated: z.boolean()
});
export const inquiryStatus = z.enum(["Received", "Contacted", "Qualified", "Closed", "Spam"]);
export const inquiryInput = z.object({
  name: z.string().trim().min(2).max(100), organization: z.string().trim().max(140).default(""),
  phone: z.string().trim().min(7).max(30).regex(/^[+\d ()-]+$/), email: z.union([z.email().max(160), z.literal("")]).optional().default(""),
  subject: z.string().trim().max(140).default(""), productInterest: z.string().trim().max(140).default(""),
  message: z.string().trim().min(10).max(2000), consent: z.literal(true), website: z.literal("").default("")
}).strict();
export const inquiryRecord = z.object({
  inquiryId: z.string(), receivedAt: z.iso.datetime(), status: inquiryStatus, name: z.string(), organization: z.string(), phone: z.string(), email: z.string(),
  subject: z.string(), productInterest: z.string(), message: z.string(), internalNotes: z.string(), leadId: z.string().nullable(), leadNumber: z.string().nullable(),
  version: z.number().int().positive(), archived: z.boolean()
});
export const inquiryPage = z.object({ rows: z.array(inquiryRecord), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive() });
export const inquiryReview = z.object({ version: z.number().int().positive(), status: inquiryStatus, internalNotes: z.string().trim().max(3000), reason: editorialReason }).strict();
export const inquiryConversion = z.object({ version: z.number().int().positive(), assignedUserId: z.string().min(1).max(200), productIds: z.array(z.string().min(1).max(200)).min(1).max(50), nextFollowUpAt: z.iso.datetime().optional(), reason: editorialReason }).strict().refine((v) => new Set(v.productIds).size === v.productIds.length, "Product selections must be unique.");
export const mediaInput = z.object({ fileName: z.string().trim().min(1).max(150), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]), sizeBytes: z.number().int().positive().max(2_000_000) }).strict();
export const mediaApproval = z.object({ approvePublic: z.literal(true), reason: editorialReason }).strict();
export const publicInquiryReceipt = z.object({ inquiryId: z.string().startsWith("INQ-"), receivedAt: z.iso.datetime(), status: z.literal("Received") });
export type WebsiteRecord = z.infer<typeof websiteRecord>;
export type WebsiteReferences = z.infer<typeof websiteReferences>;
export type WebsiteInquiry = z.infer<typeof inquiryRecord>;
