import { z } from "zod";

const label = z.string().trim().min(1).max(180);
const artwork = z.enum(["/mipro-letterhead.jpg", "/led-letterhead.jpg"]);
const identity = z.object({
  id: z.enum(["mipro", "led-trackers"]), companyName: label, displayName: label,
  address: z.string().trim().min(1).max(500), phone: z.string().trim().max(80),
  email: z.email().max(254), website: z.string().trim().max(254),
  logoUrl: z.literal("/mipro-logo.png"), backgroundImageUrl: artwork,
  footerText: z.string().trim().max(300), authorizedSignatory: label,
  safeArea: z.object({ topMm: z.number().min(35).max(65), rightMm: z.number().min(5).max(35), bottomMm: z.number().min(20).max(45), leftMm: z.number().min(22.5).max(40) }).strict()
}).strict();

export const printConfigurationInput = z.object({
  version: z.number().int().positive(), identities: z.array(identity).min(1).max(2),
  defaultIdentityId: z.enum(["mipro", "led-trackers"]), defaultLetterheadMode: z.enum(["Digital", "Preprinted"])
}).strict().superRefine((value, ctx) => {
  if (new Set(value.identities.map((item) => item.id)).size !== value.identities.length) ctx.addIssue({ code: "custom", path: ["identities"], message: "Each print identity must be unique." });
  if (!value.identities.some((item) => item.id === value.defaultIdentityId)) ctx.addIssue({ code: "custom", path: ["defaultIdentityId"], message: "Select an included print identity." });
});

export const printableType = z.enum(["quotation", "order", "challan", "receipt", "invoice", "debit-voucher", "credit-voucher", "import-cost"]);
