import { z } from "zod";

const nonEmpty = z.string().trim().min(1);

export const PublicSiteSettingsSchema = z.object({
  company: nonEmpty,
  tagline: nonEmpty,
  description: nonEmpty,
  addressLines: z.array(nonEmpty).min(1),
  phone: nonEmpty,
  phoneHref: nonEmpty,
  email: z.string().trim().email(),
  website: nonEmpty,
  officeHours: nonEmpty,
  mapCenter: z.tuple([z.number(), z.number()]),
  whatsappHref: nonEmpty
});

export const PublicHeroSlideSchema = z.object({
  id: nonEmpty,
  eyebrow: nonEmpty,
  title: nonEmpty,
  body: nonEmpty,
  image: nonEmpty,
  imageAlt: nonEmpty,
  primaryLabel: nonEmpty,
  primaryHref: nonEmpty,
  secondaryLabel: z.string().optional(),
  secondaryHref: z.string().optional(),
  published: z.boolean(),
  sortOrder: z.number().int().nonnegative()
});

export const PublicProductCategoryRecordSchema = z.object({
  id: nonEmpty,
  name: nonEmpty,
  description: nonEmpty,
  image: nonEmpty,
  published: z.boolean(),
  sortOrder: z.number().int().nonnegative()
});

export const PublicProductSpecificationSchema = z.object({ label: nonEmpty, value: nonEmpty });

export const PublicProductSchema = z.object({
  slug: nonEmpty,
  legacySlug: z.string(),
  name: nonEmpty,
  category: nonEmpty,
  shortDescription: nonEmpty,
  description: nonEmpty,
  brand: nonEmpty,
  manufacturer: z.string().optional(),
  intendedApplication: nonEmpty,
  images: z.array(nonEmpty).min(1),
  imageAlt: nonEmpty,
  features: z.array(nonEmpty),
  variants: z.array(nonEmpty),
  specifications: z.array(PublicProductSpecificationSchema),
  certificateIds: z.array(z.string()),
  featured: z.boolean(),
  published: z.boolean(),
  sortOrder: z.number().int().nonnegative().optional()
});

export const PublicCertificateSchema = z.object({
  id: nonEmpty,
  title: nonEmpty,
  type: nonEmpty,
  documentOwner: nonEmpty,
  manufacturer: nonEmpty,
  scope: nonEmpty,
  summary: nonEmpty,
  relatedProducts: z.array(z.string()),
  relatedProductSlugs: z.array(z.string()),
  status: z.enum(["Current", "Expired", "Historical reference"]),
  issuedOn: z.string().optional(),
  validUntil: z.string().optional(),
  statusNote: nonEmpty,
  file: z.object({
    url: nonEmpty,
    mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    alt: nonEmpty,
    downloadName: nonEmpty,
    sourceUrl: z.string()
  }),
  published: z.boolean().optional(),
  sortOrder: z.number().int().nonnegative().optional()
});

export const PublicResourceSchema = z.object({
  slug: nonEmpty,
  kind: z.enum(["Clinical resource", "Product guide", "Company update", "Industry news"]),
  title: nonEmpty,
  summary: nonEmpty,
  body: z.array(nonEmpty).min(1),
  image: nonEmpty,
  imageAlt: z.string().optional(),
  publishedOn: z.string().optional(),
  author: z.string().optional(),
  readingMinutes: z.number().int().positive().optional(),
  takeaways: z.array(nonEmpty).optional(),
  sources: z.array(z.object({ label: nonEmpty, url: nonEmpty })).optional(),
  featured: z.boolean().optional(),
  published: z.boolean().optional(),
  sortOrder: z.number().int().nonnegative().optional()
});

export const PublicInquiryRecordSchema = z.object({
  inquiryId: nonEmpty,
  receivedAt: z.string().datetime(),
  status: z.enum(["Received", "Contacted", "Qualified", "Closed", "Spam"]),
  name: nonEmpty,
  organization: z.string().optional(),
  phone: nonEmpty,
  email: z.string().optional(),
  subject: z.string().optional(),
  productInterest: z.string().optional(),
  message: nonEmpty,
  internalNotes: z.string().optional(),
  leadId: z.string().optional(),
  leadNumber: z.string().optional()
});

export const PublicContentAdminSnapshotSchema = z.object({
  settings: PublicSiteSettingsSchema,
  heroSlides: z.array(PublicHeroSlideSchema),
  categories: z.array(PublicProductCategoryRecordSchema),
  products: z.array(PublicProductSchema),
  certificates: z.array(PublicCertificateSchema),
  resources: z.array(PublicResourceSchema),
  inquiries: z.array(PublicInquiryRecordSchema)
});
