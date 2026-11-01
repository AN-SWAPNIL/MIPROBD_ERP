import type {
  PublicCertificate,
  PublicHeroSlide,
  PublicProduct,
  PublicProductCategoryRecord,
  PublicResource,
  PublicSiteSettings
} from "./public.types.js";

export const publicSiteSettings: PublicSiteSettings = {
  company: "MIPRO Healthcare Corporation",
  tagline: "Precision in Healthcare",
  description: "Medical devices and consumables supplied through structured procurement, import, warehousing and institutional distribution in Bangladesh.",
  addressLines: ["Flat B2, House 26, Road 06, Sector 09", "Uttara, Dhaka 1230, Bangladesh"],
  phone: "+880 1805 050780",
  phoneHref: "+8801805050780",
  email: "ledtrackers@gmail.com",
  website: "www.miprobd.com",
  officeHours: "Saturday to Thursday, 9:00 AM to 6:00 PM",
  mapCenter: [23.8748, 90.4007],
  whatsappHref: "8801805050780"
};

export const publicHeroSlides: PublicHeroSlide[] = [
  {
    id: "hero-healthcare-supply",
    eyebrow: "Precision in Healthcare",
    title: "Dependable medical supply for institutional care",
    body: "MIPRO connects verified product requirements, overseas procurement and organized distribution for healthcare providers in Bangladesh.",
    image: "/medical-products.png",
    imageAlt: "MIPRO medical consumables and hemodialysis product collection",
    primaryLabel: "Explore products",
    primaryHref: "/products",
    secondaryLabel: "Contact our team",
    secondaryHref: "/contact",
    published: true,
    sortOrder: 1
  },
  {
    id: "hero-hemodialysis",
    eyebrow: "Hemodialysis Supply",
    title: "HD-series dialysis products with model-specific review",
    body: "Review the HD-17H focus, dialyzer model data, blood tubing and vascular-access products before an institutional quotation.",
    image: "/products/dialyzer-brochure.jpg",
    imageAlt: "Hollow fiber hemodialyzers supplied through MIPRO",
    primaryLabel: "View hemodialysis",
    primaryHref: "/products?category=Hemodialysis",
    secondaryLabel: "Request information",
    secondaryHref: "/contact",
    published: true,
    sortOrder: 2
  },
  {
    id: "hero-distribution",
    eyebrow: "Procurement to Distribution",
    title: "One connected supply path from source to customer",
    body: "Commercial review, import coordination, batch-aware warehouse handling and institutional delivery stay aligned around the requested product.",
    image: "/mipro-warehouse.png",
    imageAlt: "Medical supply cartons in the MIPRO warehouse",
    primaryLabel: "How MIPRO works",
    primaryHref: "/about",
    secondaryLabel: "Business inquiry",
    secondaryHref: "/contact",
    published: true,
    sortOrder: 3
  }
];

export const publicProductCategories: PublicProductCategoryRecord[] = [
  {
    id: "cat-hemodialysis",
    name: "Hemodialysis",
    description: "Dialyzers, blood tubing sets and vascular-access consumables for dialysis care.",
    image: "/products/dialyzer-brochure.jpg",
    published: true,
    sortOrder: 1
  },
  {
    id: "cat-puncture-access",
    name: "Puncture & Access",
    description: "Single-use access products including fistula, IV and flashback needle formats.",
    image: "/products/av-fistula-needle.jpg",
    published: true,
    sortOrder: 2
  },
  {
    id: "cat-catheter-airway",
    name: "Catheter & Airway",
    description: "Catheter and airway products supplied for professional healthcare settings.",
    image: "/products/tracheostomy-tube.png",
    published: true,
    sortOrder: 3
  },
  {
    id: "cat-protective-products",
    name: "Protective Products",
    description: "Single-use protective clothing and respiratory protection products.",
    image: "/products/protective-clothing.jpg",
    published: true,
    sortOrder: 4
  }
];

export const publicProducts: PublicProduct[] = [
  {
    slug: "hollow-fiber-hemodialyzer-high-low-flux",
    legacySlug: "hollow-fiber-hemodialyzerhigh-flux",
    name: "Hollow Fiber Hemodialyzer",
    category: "Hemodialysis",
    shortDescription: "HD-series hollow-fiber hemodialyzers offered in high-flux and low-flux configurations, including the supplied HD-17H literature.",
    description:
      "A hollow-fiber dialyzer for blood purification during hemodialysis. Product selection and treatment parameters must be determined by qualified clinical professionals using the approved manufacturer documentation.",
    brand: "Distributed by MIPRO",
    manufacturer: "Jiangxi Hongda Medical Equipment Group",
    intendedApplication: "Hemodialysis treatment in hospitals and dialysis centers.",
    images: ["/products/dialyzer-brochure.jpg", "/resources/mipro-hd17h-campaign.jpg", "/resources/mipro-hd17h-features.jpg", "/resources/mipro-hd17h-technical.jpg"],
    imageAlt: "Hollow fiber hemodialyzer with color-coded end caps",
    features: ["High-flux and low-flux HD-series options", "PES hollow-fiber membrane information in the supplied literature", "Model-specific performance table and single-use presentation"],
    variants: ["HD-17H high-flux reference with 1.7 m² effective membrane area", "HD high-flux table covering 1.0 m² to 2.2 m² models", "Low-flux configuration and exact model selection subject to quotation"],
    specifications: [
      { label: "Product family", value: "Hollow fiber hemodialyzer" },
      { label: "Supplied model focus", value: "HD-17H high flux" },
      { label: "HD-17H membrane area", value: "1.7 m² (supplied product sheet)" },
      { label: "Manufacturer", value: "Jiangxi Hongda Medical Equipment Group Ltd." },
      { label: "Use", value: "Single use" },
      { label: "Selection basis", value: "Current IFU, approved documents and clinical requirement" }
    ],
    certificateIds: ["jiangxi-hongda-ec"],
    featured: true,
    published: true
  },
  {
    slug: "blood-tubing-set-for-hemodialysis",
    legacySlug: "blood-tubing-set-for-hemodialysis",
    name: "Blood Tubing Set for Hemodialysis",
    category: "Hemodialysis",
    shortDescription: "Color-coded blood circuit tubing and connectors for compatible dialysis systems.",
    description:
      "A disposable blood tubing circuit intended to support extracorporeal blood flow between the patient and a compatible hemodialysis system. Final compatibility must be checked against the machine and product documentation.",
    brand: "Distributed by MIPRO",
    manufacturer: "Jiangxi Hongda Medical Equipment Group",
    intendedApplication: "Extracorporeal blood circulation during hemodialysis.",
    images: ["/products/blood-tubing-brochure.jpg", "/resources/mipro-blood-tubing-literature.jpg"],
    imageAlt: "Blood tubing assemblies cropped from MIPRO supplied product literature",
    features: ["Medical-grade smooth tubing construction", "Multiple structures and sizes shown", "Pump-tube fatigue resistance described in the supplied literature", "Color-coded arterial and venous circuits"],
    variants: ["20-A and 20-B", "22-A and 22-B", "30-A and 30-B"],
    specifications: [
      { label: "Product family", value: "Hemodialysis blood circuit" },
      { label: "Models", value: "20-A / 20-B / 22-A / 22-B / 30-A / 30-B" },
      { label: "Pump tube / venous chamber", value: "Model-specific; confirm supplied configuration" },
      { label: "Use", value: "Single use" },
      { label: "Sterilization", value: "EO or Gamma (model-specific)" },
      { label: "Packing", value: "30 pieces/carton; 60 × 44.5 × 28.5 cm shown" },
      { label: "Configuration", value: "Confirm exact model against dialysis machine" }
    ],
    certificateIds: ["jiangxi-hongda-ec"],
    featured: true,
    published: true
  },
  {
    slug: "disposable-a-v-fistula-needle",
    legacySlug: "disposable-a-v-fistula-needle",
    name: "Disposable A.V. Fistula Needle",
    category: "Hemodialysis",
    shortDescription: "Color-coded fistula needle sets for vascular access during hemodialysis.",
    description:
      "A single-use fistula needle assembly used for vascular access in hemodialysis. Gauge, length and configuration should be selected by trained clinical personnel according to the approved product instructions.",
    brand: "Distributed by MIPRO",
    manufacturer: "Jiangxi Hongda Medical Equipment Group",
    intendedApplication: "Vascular access for hemodialysis procedures.",
    images: ["/products/av-fistula-brochure.jpg", "/resources/mipro-av-fistula-features.jpg", "/resources/mipro-av-fistula-technical.jpg"],
    imageAlt: "A.V. fistula needle assemblies cropped from MIPRO supplied product literature",
    features: ["Triple-bevel, silicone-coated needle", "Anti-slip color-coded wing and protective cap", "Flexible tubing assembly", "Rotating and fixed-wing options", "EO sterilized single-use presentation"],
    variants: ["14G / 2.1 mm · purple", "15G / 1.8 mm · yellow", "16G / 1.6 mm · green", "17G / 1.4 mm · orange"],
    specifications: [
      { label: "Product family", value: "A.V. fistula needle" },
      { label: "Use", value: "Single use" },
      { label: "Configuration", value: "Rotating or fixed wing" },
      { label: "Sterilization", value: "EO" },
      { label: "Packing", value: "50 pieces × 10 boxes/carton shown" },
      { label: "Carton", value: "60 × 44.5 × 28.5 cm shown" },
      { label: "Variant selection", value: "Confirm gauge and length before order" }
    ],
    certificateIds: ["jiangxi-hongda-ec"],
    featured: true,
    published: true
  },
  {
    slug: "iv-catheter-pen-type",
    legacySlug: "iv-catheter-pen-type",
    name: "IV Catheter, Pen Type",
    category: "Puncture & Access",
    shortDescription: "Color-coded pen-type peripheral IV catheter in multiple clinical sizes.",
    description:
      "A peripheral intravenous catheter in pen-type presentation. Product size and intended use must be confirmed by the responsible clinical team before procurement.",
    brand: "Distributed by MIPRO",
    intendedApplication: "Peripheral intravenous access in professional healthcare settings.",
    images: ["/products/iv-catheter.jpg"],
    imageAlt: "Four color-coded pen-type IV catheter units on a blue background",
    features: ["Pen-type presentation", "Color-coded size identification", "Single-use sterile supply"],
    variants: ["Multiple color-coded sizes", "Packaging configuration on request"],
    specifications: [
      { label: "Product family", value: "Peripheral IV catheter" },
      { label: "Format", value: "Pen type" },
      { label: "Use", value: "Single use" }
    ],
    certificateIds: ["jiangxi-hongda-ec"],
    featured: true,
    published: true
  },
  {
    slug: "flashback-needle",
    legacySlug: "flash-back-needle",
    name: "Flashback Needle",
    category: "Puncture & Access",
    shortDescription: "Single-use needle format with a transparent flashback observation chamber.",
    description:
      "A disposable puncture needle product with flashback observation. Exact dimensions, packaging and approved use are available with the relevant technical documentation.",
    brand: "Distributed by MIPRO",
    intendedApplication: "Professional puncture and access procedures as specified by the manufacturer.",
    images: ["/products/flashback-needle.jpg"],
    imageAlt: "Flashback needle units with protective caps and transparent chamber",
    features: ["Transparent flashback chamber", "Protective cap", "Single-use presentation"],
    variants: ["Size options available on request"],
    specifications: [
      { label: "Product family", value: "Flashback needle" },
      { label: "Use", value: "Single use" },
      { label: "Sizing", value: "Confirm before order" }
    ],
    certificateIds: [],
    featured: false,
    published: true
  },
  {
    slug: "single-use-tracheostomy-intubation",
    legacySlug: "single-use-tracheostomy-intubation",
    name: "Single-use Tracheostomy Tube",
    category: "Catheter & Airway",
    shortDescription: "Cuffed tracheostomy tube assembly supplied for professional airway management.",
    description:
      "A single-use tracheostomy tube assembly. Selection, insertion and use require trained healthcare professionals and the approved instructions supplied with the product.",
    brand: "Distributed by MIPRO",
    intendedApplication: "Airway management in an appropriate clinical setting.",
    images: ["/products/tracheostomy-tube.png"],
    imageAlt: "Single-use cuffed tracheostomy tube assembly on a blue background",
    features: ["Cuffed tube assembly", "Inflation line and pilot balloon", "Single-use supply"],
    variants: ["Multiple tube sizes available on request"],
    specifications: [
      { label: "Product family", value: "Tracheostomy tube" },
      { label: "Use", value: "Single use" },
      { label: "Configuration", value: "Cuffed assembly shown" }
    ],
    certificateIds: [],
    featured: false,
    published: true
  },
  {
    slug: "disposable-medical-protective-clothing",
    legacySlug: "disposable-medical-protective-clothing",
    name: "Disposable Medical Protective Clothing",
    category: "Protective Products",
    shortDescription: "Individually packaged single-use protective garment for approved healthcare applications.",
    description:
      "A disposable protective garment supplied in individual packaging. Protection level, intended environment and use limitations must be verified from the approved manufacturer documentation.",
    brand: "Distributed by MIPRO",
    intendedApplication: "Healthcare protection where the documented product specification is suitable.",
    images: ["/products/protective-clothing.jpg"],
    imageAlt: "Front and back packaging for disposable medical protective clothing",
    features: ["Individually packaged", "Single-use garment", "Size and specification options"],
    variants: ["Sizes subject to availability", "Packaging details on request"],
    specifications: [
      { label: "Product family", value: "Protective clothing" },
      { label: "Use", value: "Single use" },
      { label: "Selection", value: "Confirm protection specification" }
    ],
    certificateIds: [],
    featured: false,
    published: true
  },
  {
    slug: "disposable-medical-protective-mask-n95",
    legacySlug: "disposable-medical-protective-mask-n95",
    name: "Disposable Protective Mask",
    category: "Protective Products",
    shortDescription: "Cup-style disposable protective mask with head straps and exhalation valve configuration shown.",
    description:
      "A disposable protective mask product. Model certification, filtration classification, fit requirements and approved use must be confirmed from the exact product documentation before procurement.",
    brand: "Distributed by MIPRO",
    intendedApplication: "Respiratory protection where the confirmed model specification is appropriate.",
    images: ["/products/n95-mask.jpg"],
    imageAlt: "Cup-style disposable protective mask with yellow straps",
    features: ["Cup-style format", "Head-strap design", "Disposable presentation"],
    variants: ["Model and packaging details available on request"],
    specifications: [
      { label: "Product family", value: "Disposable protective mask" },
      { label: "Use", value: "Single use" },
      { label: "Classification", value: "Confirm exact supplied model" }
    ],
    certificateIds: [],
    featured: false,
    published: true
  }
];

export const publicCertificates: PublicCertificate[] = [
  {
    id: "jiangxi-hongda-ukca-gloves",
    title: "UKCA Type Examination Certificate UKCA 753355",
    type: "UKCA type examination",
    documentOwner: "Jiangxi Hongda Medical Equipment Group Ltd.",
    manufacturer: "Jiangxi Hongda Medical Equipment Group Ltd.",
    scope: "Nitrile Green gloves for personal protection",
    summary:
      "BSI-issued manufacturer certificate for the named glove model. The archived scan is page 1 of 4; request the complete controlled set before regulatory reliance.",
    relatedProducts: ["Nitrile Green protective gloves"],
    relatedProductSlugs: [],
    status: "Current",
    issuedOn: "10 November 2021",
    validUntil: "10 November 2026",
    statusNote: "Current on the visible document date; confirm status with BSI before procurement.",
    file: {
      url: "/certificates/jiangxi-hongda-ukca-nitrile-gloves-certificate.jpg",
      mediaType: "image/jpeg",
      alt: "BSI UKCA Type Examination Certificate UKCA 753355 issued to Jiangxi Hongda Medical Equipment Group",
      downloadName: "jiangxi-hongda-ukca-753355-page-1.jpg",
      sourceUrl: "https://www.miprobd.com/certificates/"
    }
  },
  {
    id: "jiangxi-hongda-ec",
    title: "EC Certificate G1 044803 0031 Rev. 03",
    type: "EC quality assurance certificate",
    documentOwner: "Jiangxi Hongda Medical Equipment Group Ltd.",
    manufacturer: "Jiangxi Hongda Medical Equipment Group Ltd.",
    scope: "Listed single-use medical-device categories under MDD 93/42/EEC",
    summary:
      "TUV SUD manufacturer certificate covering listed product categories, including blood tubing, A.V. fistula needles, IV cannulae and hollow-fiber hemodialyzers. It is retained only as an historical record because its printed validity ended in 2024.",
    relatedProducts: ["Hollow-fiber hemodialyzer", "Blood tubing set", "A.V. fistula needle set", "IV cannula"],
    relatedProductSlugs: publicProducts.filter((product) => product.certificateIds.includes("jiangxi-hongda-ec")).map((product) => product.slug),
    status: "Expired",
    issuedOn: "16 March 2021",
    validUntil: "26 March 2024",
    statusNote: "Expired on the visible document date; not evidence of current conformity.",
    file: {
      url: "/certificates/jiangxi-hongda-ec-certificate-g1-044803-0031.jpg",
      mediaType: "image/jpeg",
      alt: "TUV SUD EC Certificate G1 044803 0031 Rev. 03 issued to Jiangxi Hongda Medical Equipment Group",
      downloadName: "jiangxi-hongda-ec-g1-044803-0031-rev-03.jpg",
      sourceUrl: "https://www.miprobd.com/certificates/"
    }
  },
  {
    id: "jiangxi-hongda-russia-registration",
    title: "Russian Medical Device Registration Certificate",
    type: "Market registration record",
    documentOwner: "Jiangxi Hongda Medical Equipment Group Ltd.",
    manufacturer: "Jiangxi Hongda Medical Equipment Group Ltd.",
    scope: "Disposable sterile syringes with needles, as stated in the Russian-language scan",
    summary:
      "Historical Russian-language registration scan dated 2007. No current validity should be inferred without confirmation from the issuing authority and the manufacturer.",
    relatedProducts: ["Disposable sterile syringes with needles"],
    relatedProductSlugs: [],
    status: "Historical reference",
    issuedOn: "25 October 2007",
    statusNote: "Current validity is not verified from the archived scan.",
    file: {
      url: "/certificates/jiangxi-hongda-russia-registration-certificate.jpg",
      mediaType: "image/jpeg",
      alt: "Russian medical device registration certificate issued for Jiangxi Hongda disposable sterile syringes",
      downloadName: "jiangxi-hongda-russia-registration-certificate.jpg",
      sourceUrl: "https://www.miprobd.com/certificates/"
    }
  },
  {
    id: "jiangxi-hongda-who-pqs-syringe",
    title: "WHO PQS Product Record E008/123",
    type: "Product prequalification record",
    documentOwner: "Jiangxi Hongda Medical Equipment Group Ltd.",
    manufacturer: "Jiangxi Hongda Medical Equipment Group Ltd.",
    scope: "0.5 ml auto-disable syringe for fixed-dose immunization",
    summary:
      "Archived PQS product sheet showing pre-qualified status from 12 October 2018 and a printed validity end of May 2023.",
    relatedProducts: ["0.5 ml auto-disable syringe"],
    relatedProductSlugs: [],
    status: "Expired",
    issuedOn: "12 October 2018",
    validUntil: "May 2023",
    statusNote: "Expired on the visible document date; verify any replacement record before use.",
    file: {
      url: "/certificates/jiangxi-hongda-who-pqs-auto-disable-syringe.jpg",
      mediaType: "image/jpeg",
      alt: "WHO PQS product record E008/123 for Jiangxi Hongda 0.5 milliliter auto-disable syringe",
      downloadName: "jiangxi-hongda-who-pqs-e008-123.jpg",
      sourceUrl: "https://www.miprobd.com/certificates/"
    }
  }
];

export const publicResources: PublicResource[] = [
  {
    slug: "bangladesh-dialysis-access-expansion",
    kind: "Industry news",
    title: "Bangladesh plans wider dialysis access beyond major cities",
    summary: "A July 2026 policy update signals wider public dialysis capacity at medical college, district and upazila hospitals.",
    body: [
      "Bangladesh's health ministry has announced plans to expand kidney dialysis services beyond the country's largest cities. Public reporting describes larger dialysis centers at medical college hospitals and new 10-bed units at district and upazila-level facilities.",
      "The direction matters because regular dialysis remains difficult to access for many patients outside major urban centers. Wider service coverage will require more than equipment alone: facilities also need trained teams, dependable utilities, validated consumables and a consistent replenishment process.",
      "For hospital procurement teams, early planning should connect expected treatment capacity with the exact dialyzer, blood tubing and vascular-access configurations approved for each machine and clinical protocol. Generic product names are not enough for safe ordering.",
      "MIPRO's role is commercial and operational. We help institutions review model-specific requirements, supporting documents and supply terms before quotation. Clinical selection and treatment decisions remain with qualified healthcare professionals.",
      "This article summarizes linked public reporting and does not represent a government notice, clinical guideline or guarantee of project timing. Readers should consult the original sources for the latest implementation details."
    ],
    image: "/resources/mipro-product-catalogue.jpg",
    imageAlt: "MIPRO renal product catalogue with dialyzer, blood tubing and vascular access products",
    publishedOn: "2026-07-13",
    author: "MIPRO Editorial Desk",
    readingMinutes: 4,
    takeaways: [
      "Planned dialysis expansion is intended to improve access outside major cities.",
      "Capacity planning must include compatible consumables, documentation and replenishment.",
      "Exact implementation details should be checked against current government information."
    ],
    sources: [
      { label: "The Business Standard: Govt plans kidney dialysis services at district, upazila hospitals", url: "https://www.tbsnews.net/bangladesh/health/govt-plans-kidney-dialysis-services-district-upazila-hospitals-1487531" },
      { label: "Bangladesh Sangbad Sangstha: dialysis units planned at upazila hospitals", url: "https://www.bssnews.net/js-session/404143" }
    ],
    featured: true,
    published: true,
    sortOrder: 1
  },
  {
    slug: "renal-procurement-readiness",
    kind: "Clinical resource",
    title: "Five readiness checks for a dependable dialysis consumable supply",
    summary: "A practical planning note for institutions aligning treatment capacity, compatible products and replenishment controls.",
    body: [
      "Dialysis consumables form a connected treatment set. Procurement planning should begin with the approved dialysis-machine configuration, prescribed therapy and institution-specific protocol, then identify the exact compatible product variants.",
      "Demand should be estimated from planned sessions, expected patient load, contingency stock and supplier lead time. A stock figure without batch, expiry and usage context cannot show whether the right product will be available when needed.",
      "Before commercial approval, review the current product specification, instructions for use, manufacturer identity, sterilization information, packaging unit and relevant regulatory or quality documents for the exact model.",
      "Receiving controls matter as much as ordering. Institutions should verify model, quantity, LOT or batch, manufacturing date, expiry date and package condition, then keep those references connected to warehouse movement.",
      "Finally, define a replenishment trigger and escalation contact. A documented review path helps procurement, stores and clinical teams resolve a mismatch before it becomes a service interruption."
    ],
    image: "/mipro-warehouse.png",
    imageAlt: "Organized medical supply warehouse representing batch-aware product handling",
    publishedOn: "2026-07-18",
    author: "MIPRO Product & Supply Team",
    readingMinutes: 5,
    takeaways: [
      "Start with the approved machine and clinical configuration.",
      "Plan demand with lead time, contingency stock, batch and expiry visibility.",
      "Check exact product documents before quotation and again at receipt."
    ],
    sources: [
      { label: "MIPRO supplied HD-series product literature", url: "/resources/mipro-hd17h-technical.pdf" },
      { label: "MIPRO public product catalogue", url: "/products" }
    ],
    featured: true,
    published: true,
    sortOrder: 2
  },
  {
    slug: "high-flux-and-low-flux-dialyzers",
    kind: "Product guide",
    title: "HD-17H and HD-series dialyzers: procurement questions to ask",
    summary: "A concise checklist for matching an HD-series dialyzer model with clinical and machine requirements.",
    body: [
      "Flux category is only one part of product selection. Buyers should confirm the prescribed model, membrane characteristics, surface area, sterilization method and dialysis-machine compatibility.",
      "The supplied HD-series literature identifies multiple high-flux models and highlights the HD-17H with a listed effective membrane area of 1.7 square meters. Values shown in a product table depend on stated test conditions and must not be treated as a clinical prescription.",
      "Ask for the current model-specific specification, instructions for use, packaging information and manufacturer documentation. The model named in the quotation, supporting records and delivered label should agree.",
      "MIPRO can provide model-specific documentation during quotation review so the requesting institution can verify the exact item before order confirmation. Clinical suitability remains the responsibility of the qualified care team."
    ],
    image: "/resources/mipro-hd17h-features.jpg",
    imageAlt: "HD-17H product feature sheet with membrane and performance information",
    publishedOn: "2026-06-24",
    author: "MIPRO Product Desk",
    readingMinutes: 4,
    takeaways: ["Confirm the exact prescribed model, not only the flux category.", "Match quotation, documentation and delivered product labels.", "Use current approved documentation for clinical review."],
    sources: [
      { label: "HD-17H features sheet supplied to MIPRO", url: "/resources/mipro-hd17h-features.pdf" },
      { label: "HD-series technical table supplied to MIPRO", url: "/resources/mipro-hd17h-technical.pdf" }
    ],
    featured: true,
    published: true,
    sortOrder: 3
  },
  {
    slug: "blood-tubing-set-review",
    kind: "Clinical resource",
    title: "Reviewing a hemodialysis blood tubing set",
    summary: "Key compatibility and documentation checks before an institutional purchase.",
    body: [
      "Blood tubing configurations differ across dialysis systems. Confirm the machine model, arterial and venous line configuration, chamber arrangement, connectors and packaging specification.",
      "Review the pump segment, pressure-monitoring lines, chambers, clamps, connectors and included accessories against the approved machine setup. Similar-looking sets can differ in clinically important details.",
      "The final purchase description should identify the approved configuration rather than relying on a generic product name alone. Product label, LOT, expiry and package condition should be checked at receipt.",
      "This checklist supports procurement preparation only. Setup and use must follow the current instructions for use and the institution's clinical procedures."
    ],
    image: "/products/blood-tubing-set.png",
    imageAlt: "Blood tubing set for hemodialysis with chambers, connectors and color-coded lines",
    publishedOn: "2026-06-15",
    author: "MIPRO Product Desk",
    readingMinutes: 4,
    takeaways: ["State the dialysis-machine configuration.", "Confirm chambers, connectors and accessories.", "Verify LOT, expiry and package condition at receipt."],
    sources: [{ label: "MIPRO Blood Tubing Set product information", url: "/products/blood-tubing-set-for-hemodialysis" }],
    published: true,
    sortOrder: 4
  },
  {
    slug: "av-fistula-needle-selection",
    kind: "Product guide",
    title: "A.V. fistula needle ordering checklist",
    summary: "A practical pre-quotation checklist for gauge, length, tubing and packaging requirements.",
    body: [
      "Institutional requests should state the required gauge, needle length, tubing configuration, back-eye requirement where relevant, and expected unit packaging.",
      "Confirm whether the request is for arterial, venous or paired sets and record the required color coding and safety features. The exact quotation description should carry these details forward.",
      "At receiving, check the product label, sterile barrier, LOT, manufacturing date and expiry. Storage and issue should follow the approved documentation and the institution's controls.",
      "Clinical selection, cannulation and use remain the responsibility of appropriately trained healthcare professionals."
    ],
    image: "/products/av-fistula-brochure.jpg",
    imageAlt: "Color-coded disposable A.V. fistula needle sets for hemodialysis",
    publishedOn: "2026-06-05",
    author: "MIPRO Product Desk",
    readingMinutes: 3,
    takeaways: ["Specify gauge, length and line configuration.", "Identify arterial, venous or paired requirements.", "Check sterile packaging, LOT and expiry at receipt."],
    sources: [{ label: "MIPRO A.V. Fistula Needle product information", url: "/products/disposable-a-v-fistula-needle" }],
    published: true,
    sortOrder: 5
  },
  {
    slug: "institutional-document-checklist",
    kind: "Company update",
    title: "A clearer documentation path for institutional inquiries",
    summary: "How MIPRO connects product inquiry, technical review and commercial quotation without an online cart.",
    body: [
      "A website inquiry records the institution, product interest and requested documentation. The sales team then confirms model, manufacturer documentation and commercial requirements before preparing a quotation.",
      "When the inquiry is qualified, the selected product and customer context carry into MIPRO's internal sales workflow. Quotation, order and delivery records can then retain the agreed item description without repeated entry.",
      "This review-first approach is better suited to institutional medical procurement than a public checkout flow. It gives both parties a clear point to resolve model, documentation and commercial questions.",
      "Public inquiries do not create ERP user accounts and do not expose stock, supplier pricing or landed-cost information. MIPRO employees access operational records through the separate Employee Portal."
    ],
    image: "/medical-products.png",
    imageAlt: "MIPRO medical products arranged for institutional review",
    publishedOn: "2026-05-28",
    author: "MIPRO Healthcare Corporation",
    readingMinutes: 3,
    takeaways: ["Inquiry comes before quotation.", "Exact product and documentation details are confirmed before order.", "The public website and internal ERP remain separate."],
    sources: [{ label: "Contact MIPRO for an institutional inquiry", url: "/contact" }],
    published: true,
    sortOrder: 6
  }
];
