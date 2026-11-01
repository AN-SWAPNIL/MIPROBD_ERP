import { publicCertificates, publicHeroSlides, publicProductCategories, publicProducts, publicResources, publicSiteSettings } from "./public.content.js";
import { PublicCertificateSchema, PublicHeroSlideSchema, PublicProductCategoryRecordSchema, PublicProductSchema, PublicResourceSchema, PublicSiteSettingsSchema } from "./public.schemas.js";

// Public brochure content is intentionally independent of ERP sessions, stock and pricing.
const products = () => publicProducts.filter((p) => p.published);
export const staticPublicContent = {
  settings: async () => PublicSiteSettingsSchema.parse(structuredClone(publicSiteSettings)),
  heroSlides: async () => publicHeroSlides.filter((p) => p.published).sort((a, b) => a.sortOrder - b.sortOrder).map((p) => PublicHeroSlideSchema.parse(structuredClone(p))),
  categories: async () => publicProductCategories.filter((p) => p.published).sort((a, b) => a.sortOrder - b.sortOrder).map((p) => PublicProductCategoryRecordSchema.parse(structuredClone(p))),
  products: async (filters?: { category?: string; search?: string; featured?: boolean }) => products().filter((p) => (!filters?.category || p.category === filters.category) && (filters?.featured === undefined || p.featured === filters.featured) && (!filters?.search || `${p.name} ${p.brand} ${p.category} ${p.description}`.toLowerCase().includes(filters.search.toLowerCase()))).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((p) => PublicProductSchema.parse(structuredClone(p))),
  product: async (slug: string) => PublicProductSchema.nullable().parse(structuredClone(products().find((p) => p.slug === slug) ?? null)),
  legacyProduct: async (slug: string) => PublicProductSchema.nullable().parse(structuredClone(products().find((p) => p.legacySlug === slug) ?? null)),
  certificates: async () => publicCertificates.filter((p) => p.published !== false).map((p) => PublicCertificateSchema.parse(structuredClone(p))),
  resources: async () => publicResources.filter((p) => p.published !== false).map((p) => PublicResourceSchema.parse(structuredClone(p))),
  resource: async (slug: string) => PublicResourceSchema.nullable().parse(structuredClone(publicResources.find((p) => p.slug === slug && p.published !== false) ?? null))
};
