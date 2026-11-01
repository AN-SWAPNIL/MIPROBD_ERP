export type PublicProductCategory = string;

export type PublicSiteSettings = {
  company: string;
  tagline: string;
  description: string;
  addressLines: string[];
  phone: string;
  phoneHref: string;
  email: string;
  website: string;
  officeHours: string;
  mapCenter: [number, number];
  whatsappHref: string;
};

export type PublicHeroSlide = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  image: string;
  imageAlt: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  published: boolean;
  sortOrder: number;
};

export type PublicProductSpecification = {
  label: string;
  value: string;
};

export type PublicProduct = {
  slug: string;
  legacySlug: string;
  name: string;
  category: PublicProductCategory;
  shortDescription: string;
  description: string;
  brand: string;
  manufacturer?: string;
  intendedApplication: string;
  images: string[];
  imageAlt: string;
  features: string[];
  variants: string[];
  specifications: PublicProductSpecification[];
  certificateIds: string[];
  featured: boolean;
  published: boolean;
  sortOrder?: number;
};

export type PublicProductCategoryRecord = {
  id: string;
  name: PublicProductCategory;
  description: string;
  image: string;
  published: boolean;
  sortOrder: number;
};

export type PublicCertificate = {
  id: string;
  title: string;
  type: string;
  documentOwner: string;
  manufacturer: string;
  scope: string;
  summary: string;
  relatedProducts: string[];
  relatedProductSlugs: string[];
  status: "Current" | "Expired" | "Historical reference";
  issuedOn?: string;
  validUntil?: string;
  statusNote: string;
  file: {
    url: string;
    mediaType: "image/jpeg" | "image/png" | "image/webp";
    alt: string;
    downloadName: string;
    sourceUrl: string;
  };
  published?: boolean;
  sortOrder?: number;
};

export type PublicResource = {
  slug: string;
  kind: "Clinical resource" | "Product guide" | "Company update" | "Industry news";
  title: string;
  summary: string;
  body: string[];
  image: string;
  imageAlt?: string;
  publishedOn?: string;
  author?: string;
  readingMinutes?: number;
  takeaways?: string[];
  sources?: Array<{ label: string; url: string }>;
  featured?: boolean;
  published?: boolean;
  sortOrder?: number;
};

export type PublicInquiryInput = {
  name: string;
  organization?: string;
  phone: string;
  email?: string;
  subject?: string;
  productInterest?: string;
  message: string;
};

export type PublicInquiryReceipt = {
  inquiryId: string;
  receivedAt: string;
  status: "Received";
};

export type PublicInquiryStatus = "Received" | "Contacted" | "Qualified" | "Closed" | "Spam";

export type PublicInquiryRecord = PublicInquiryInput & {
  inquiryId: string;
  receivedAt: string;
  status: PublicInquiryStatus;
  internalNotes?: string;
  leadId?: string;
  leadNumber?: string;
};

export type PublicContentAdminSnapshot = {
  settings: PublicSiteSettings;
  heroSlides: PublicHeroSlide[];
  categories: PublicProductCategoryRecord[];
  products: PublicProduct[];
  certificates: PublicCertificate[];
  resources: PublicResource[];
  inquiries: PublicInquiryRecord[];
};
