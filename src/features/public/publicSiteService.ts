import { z } from "zod";
import type { ApiResponse, Session } from "../../types";
import { foundationMode } from "../../lib/runtime";
import { staticPublicContent } from "./staticContent";
import {
  PublicCertificateSchema,
  PublicContentAdminSnapshotSchema,
  PublicHeroSlideSchema,
  PublicInquiryRecordSchema,
  PublicProductCategoryRecordSchema,
  PublicProductSchema,
  PublicResourceSchema,
  PublicSiteSettingsSchema
} from "./public.schemas";
import type {
  PublicCertificate,
  PublicHeroSlide,
  PublicInquiryInput,
  PublicInquiryReceipt,
  PublicInquiryStatus,
  PublicProduct,
  PublicProductCategory,
  PublicProductCategoryRecord,
  PublicResource,
  PublicSiteSettings
} from "./public.types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const SESSION_KEY = "mipro-erp-session";
const IdResponseSchema = z.object({ id: z.string() });
const PublicInquiryReceiptSchema = z.object({ inquiryId: z.string().startsWith("INQ-"), receivedAt: z.string().datetime(), status: z.literal("Received") });

function requestHeaders(authenticated = false) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (!authenticated) return headers;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return headers;
  try {
    const session = JSON.parse(raw) as Session;
    headers.set("Authorization", `Bearer ${session.token}`);
    headers.set("x-user-id", session.user.id);
    headers.set("x-role", session.user.role);
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
  }
  return headers;
}

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit, authenticated = false): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: requestHeaders(authenticated) });
  const body = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
  if (!response.ok || !body?.success) throw new Error(body?.message || `Request failed (${response.status})`);
  const parsed = schema.safeParse(body.data);
  if (!parsed.success) throw new Error(`API contract validation failed for ${path}: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

const get = <T>(path: string, schema: z.ZodType<T>, authenticated = false) => request(path, schema, undefined, authenticated);
const post = <T>(path: string, payload: unknown, schema: z.ZodType<T>, authenticated = false) => request(path, schema, { method: "POST", body: JSON.stringify(payload) }, authenticated);
const patch = <T>(path: string, payload: unknown, schema: z.ZodType<T>, authenticated = false) => request(path, schema, { method: "PATCH", body: JSON.stringify(payload) }, authenticated);
const remove = (path: string) => request(path, IdResponseSchema, { method: "DELETE" }, true);

export const publicSiteService = {
  settings: () => foundationMode ? staticPublicContent.settings() : get<PublicSiteSettings>("/api/public/site", PublicSiteSettingsSchema),
  heroSlides: () => foundationMode ? staticPublicContent.heroSlides() : get<PublicHeroSlide[]>("/api/public/hero-slides", z.array(PublicHeroSlideSchema)),
  categories: () => foundationMode ? staticPublicContent.categories() : get<PublicProductCategoryRecord[]>("/api/public/categories", z.array(PublicProductCategoryRecordSchema)),
  products(filters?: { category?: PublicProductCategory; search?: string; featured?: boolean }) {
    if (foundationMode) return staticPublicContent.products(filters);
    const params = new URLSearchParams();
    if (filters?.category) params.set("category", filters.category);
    if (filters?.search) params.set("search", filters.search);
    if (filters?.featured !== undefined) params.set("featured", String(filters.featured));
    const query = params.toString();
    return get<PublicProduct[]>(`/api/public/products${query ? `?${query}` : ""}`, z.array(PublicProductSchema));
  },
  product: (slug: string) => foundationMode ? staticPublicContent.product(slug) : get<PublicProduct | null>(`/api/public/products/${encodeURIComponent(slug)}`, PublicProductSchema.nullable()),
  legacyProduct: (legacySlug: string) => foundationMode ? staticPublicContent.legacyProduct(legacySlug) : get<PublicProduct | null>(`/api/public/legacy-products/${encodeURIComponent(legacySlug)}`, PublicProductSchema.nullable()),
  certificates: () => foundationMode ? staticPublicContent.certificates() : get<PublicCertificate[]>("/api/public/certificates", z.array(PublicCertificateSchema)),
  resources: () => foundationMode ? staticPublicContent.resources() : get<PublicResource[]>("/api/public/resources", z.array(PublicResourceSchema)),
  resource: (slug: string) => foundationMode ? staticPublicContent.resource(slug) : get<PublicResource | null>(`/api/public/resources/${encodeURIComponent(slug)}`, PublicResourceSchema.nullable()),
  submitInquiry: (payload: PublicInquiryInput): Promise<PublicInquiryReceipt> => foundationMode ? Promise.reject(new Error("Use the published email or WhatsApp contact. Website inquiry storage is not enabled.")) : post<PublicInquiryReceipt>("/api/public/contact", payload, PublicInquiryReceiptSchema)
};

export const websiteContentService = {
  snapshot: () => get("/api/settings/website", PublicContentAdminSnapshotSchema, true),
  updateSettings: (payload: PublicSiteSettings) => patch("/api/settings/website/site", payload, PublicSiteSettingsSchema, true),
  createHero: (payload: PublicHeroSlide) => post("/api/settings/website/hero-slides", payload, PublicHeroSlideSchema, true),
  updateHero: (id: string, payload: PublicHeroSlide) => patch(`/api/settings/website/hero-slides/${encodeURIComponent(id)}`, payload, PublicHeroSlideSchema, true),
  removeHero: (id: string) => remove(`/api/settings/website/hero-slides/${encodeURIComponent(id)}`),
  createCategory: (payload: PublicProductCategoryRecord) => post("/api/settings/website/categories", payload, PublicProductCategoryRecordSchema, true),
  updateCategory: (id: string, payload: PublicProductCategoryRecord) => patch(`/api/settings/website/categories/${encodeURIComponent(id)}`, payload, PublicProductCategoryRecordSchema, true),
  removeCategory: (id: string) => remove(`/api/settings/website/categories/${encodeURIComponent(id)}`),
  createProduct: (payload: PublicProduct) => post("/api/settings/website/products", payload, PublicProductSchema, true),
  updateProduct: (slug: string, payload: PublicProduct) => patch(`/api/settings/website/products/${encodeURIComponent(slug)}`, payload, PublicProductSchema, true),
  removeProduct: (slug: string) => remove(`/api/settings/website/products/${encodeURIComponent(slug)}`),
  createCertificate: (payload: PublicCertificate) => post("/api/settings/website/certificates", payload, PublicCertificateSchema, true),
  updateCertificate: (id: string, payload: PublicCertificate) => patch(`/api/settings/website/certificates/${encodeURIComponent(id)}`, payload, PublicCertificateSchema, true),
  removeCertificate: (id: string) => remove(`/api/settings/website/certificates/${encodeURIComponent(id)}`),
  createResource: (payload: PublicResource) => post("/api/settings/website/resources", payload, PublicResourceSchema, true),
  updateResource: (slug: string, payload: PublicResource) => patch(`/api/settings/website/resources/${encodeURIComponent(slug)}`, payload, PublicResourceSchema, true),
  removeResource: (slug: string) => remove(`/api/settings/website/resources/${encodeURIComponent(slug)}`),
  updateInquiry: (id: string, payload: { status: PublicInquiryStatus; internalNotes?: string }) => patch(`/api/settings/website/inquiries/${encodeURIComponent(id)}`, payload, PublicInquiryRecordSchema, true),
  convertInquiryToLead: (id: string, payload: { assignedUserId: string; productIds: string[]; nextFollowUpAt?: string }) => post(`/api/settings/website/inquiries/${encodeURIComponent(id)}/convert-to-lead`, payload, PublicInquiryRecordSchema, true),
  removeInquiry: (id: string) => remove(`/api/settings/website/inquiries/${encodeURIComponent(id)}`)
};
