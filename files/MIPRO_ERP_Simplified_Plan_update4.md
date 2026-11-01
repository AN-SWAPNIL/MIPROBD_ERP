# MIPRO Digital Platform — Corporate Website + ERP Access Update Plan

**Date:** 25 August 2026  
**Repository:** `AN-SWAPNIL/Medical_Supplier_ERP`  
**Working branch:** `dev`  
**Dev HEAD reviewed:** `2374e29c0a33c73ed30a8d33bb6b8183cc921725`  
**Scope:** Public MIPRO corporate website + employee ERP access boundary. Existing ERP workflows should remain intact unless explicitly mentioned.

---

# 1. Executive Decision

The project should now be treated as **one MIPRO digital platform with two clearly separated surfaces**:

```text
PUBLIC WEBSITE
MIPRO Healthcare Corporation / MiproBD
        │
        │ Employee Portal
        ▼
LOGIN
MIPRO ERP
        │
        ▼
INTERNAL APPLICATION
Imports · Inventory · Sales · Field Team · Accounts · Reports · Settings · AI
```

The public landing page should **not advertise the ERP**.

The public landing page should introduce:

- MIPRO Healthcare Corporation,
- its healthcare products,
- product categories,
- company profile,
- certificates / quality documents,
- contact information,
- relevant news/resources.

The ERP identity should begin at the **Employee Portal / Login page**.

---

# 2. Current State Assessment

The latest `dev` branch is now strong on ERP functionality.

Already implemented and should be preserved:

- simplified seven-area ERP navigation,
- connected import workflow,
- landed-cost allocation,
- batch/LOT/MFG/expiry inventory,
- FIFO,
- sales and collection workflow,
- employee performance reporting,
- searchable employee picker,
- Field Team live/last-location map,
- route and visit history,
- role-scoped location visibility,
- Smart Insights,
- floating contextual AI,
- document viewer and extraction,
- supplied company print backgrounds,
- user/role/capability administration.

The public `/` page is now the part that needs the biggest redesign.

---

# 3. Problem With the Current Landing Page

The current landing page still presents the system as:

```text
MIPRO Medical Supplier ERP
```

and highlights internal operational information such as:

- delivered sales,
- stock valuation,
- batch-tracked units,
- ERP roles.

That is acceptable for an internal software demo but is not suitable for the public MiproBD company website.

The public website should not disclose internal ERP figures or explain internal software modules.

---

# 4. Public Branding Rule

Use this distinction consistently.

| Surface | Branding |
|---|---|
| Public website | **MIPRO Healthcare Corporation / MiproBD** |
| Hero tagline | **Precision in Healthcare** |
| Public browser title | `MIPRO Healthcare Corporation | MiproBD` |
| Public CTA | `Employee Portal` |
| Login page | **MIPRO ERP — Employee Portal** |
| Internal `/app/*` | **MIPRO ERP** |

Do not use `MIPRO Medical Supplier ERP` as the homepage hero.

---

# 5. Recommended Routing

Public routes:

```text
/
├── /about
├── /products
├── /products/:slug
├── /certificates
├── /news
├── /contact
└── /login
```

Employee/security routes:

```text
/login
/forgot-password
/reset-password
```

Protected ERP:

```text
/app/*
```

Remove production public signup:

```text
/signup
```

or make it unreachable in production.

---

# 6. Request Access — Remove It

Recommendation:

> Remove public `Request Access`.

Reason:

ERP accounts are company employee accounts.

The system already has:

```text
Settings → Users & Capabilities
```

so employee onboarding should be controlled internally.

Recommended production workflow:

```text
Super Admin
    ↓
Create employee user
    ↓
Assign role / capabilities / territory
    ↓
Send or assign credentials
    ↓
Employee opens Employee Portal
    ↓
Login
```

This avoids:

- spam access requests,
- random outsiders requesting roles,
- unnecessary admin review,
- confusion between public visitors and employees.

---

# 7. Public Contact Form Is Different

Removing ERP signup does **not** mean removing public inquiry forms.

Public visitors should be able to:

```text
Contact Us
Request Product Information
Contact Sales
Send Business Inquiry
```

These are commercial inquiries, not ERP-access requests.

Later, an inquiry can optionally become:

```text
CRM Lead
```

inside Sales.

Do not automatically create an ERP account from a contact inquiry.

---

# 8. Login Page — Production Design

Current login should be simplified for production.

Recommended:

```text
MIPRO Healthcare Corporation
Precision in Healthcare

MIPRO ERP
Employee Portal

Email
Password

[ Sign In ]

Forgot password?
```

Remove in production:

- Request Access link,
- demo user selector,
- prefilled Super Admin email,
- prefilled password,
- public ERP statistics,
- public stock/sales numbers.

---

# 9. Demo Mode vs Production Mode

The current role selector and demo credentials are useful during development.

Keep them behind an explicit environment flag.

Example:

```text
VITE_DEMO_MODE=true
```

Behavior:

### Demo build

May show:

- demo role accounts,
- test credentials,
- prototype notices.

### Production

Must show:

- only standard login form,
- no test users,
- no exposed credentials.

---

# 10. Login Page Visual Direction

The login page may still use:

- MIPRO logo,
- product/warehouse imagery,
- company colors,
- “Precision in Healthcare”.

But it should not look like a software sales landing page.

Recommended left-side message:

```text
MIPRO HEALTHCARE CORPORATION

Precision in Healthcare

Employee Operations Portal

Secure access to MIPRO's internal
operations and management system.
```

Do not publicly show:

```text
17,500 units
BDT 3.97M sales
7 roles
stock valuation
profit
```

---

# 11. Public Homepage Structure

Recommended homepage order:

## A. Header

```text
MIPRO Logo

Home
About
Products
Certificates
News
Contact

[Employee Portal]
```

`Employee Portal` should be visually distinct but secondary to the corporate navigation.

## B. Hero

The hero should introduce MIPRO, not ERP.

Suggested direction:

```text
MIPRO HEALTHCARE CORPORATION

Precision in Healthcare

Reliable medical consumables and healthcare
supply solutions for hospitals, clinics and
healthcare providers in Bangladesh.

[Explore Products] [Contact Us]
```

Do not make unsupported claims such as:

- market leader,
- largest importer,
- own factory,
- international manufacturer,
- ISO-certified company,

unless verified for MIPRO itself.

---

# 12. Homepage Product Categories

Feature confirmed/relevant categories.

Possible presentation:

```text
Hemodialysis
Infusion & Transfusion
Puncture Products
Catheter Products
Other Medical Consumables
```

Prioritize MIPRO's known products such as:

- Dialyzer,
- Blood Tubing / Blood Line Set,
- AV Fistula Needle,
- Foley Catheter,
- IV Set,
- Burette Set,
- ET Tube,
- other confirmed medical consumables.

Use strong product imagery.

---

# 13. About MIPRO Section

Short homepage introduction:

```text
About MIPRO

MIPRO Healthcare Corporation supplies medical
devices and consumables to healthcare institutions
in Bangladesh, supporting overseas procurement,
import operations, warehousing and distribution.
```

Do not copy manufacturer claims from partner/manufacturer websites.

Add:

```text
[Learn More]
```

→ `/about`

---

# 14. About Page

Suggested sections:

```text
Company Overview
Business Focus
Healthcare Markets Served
Procurement & Distribution
Quality Commitment
Corporate Values
Contact / Office
```

Use language appropriate for an:

- importer,
- distributor,
- medical supplier.

Do not portray MIPRO as a manufacturer unless explicitly verified.

---

# 15. Product Catalogue

Use a B2B catalogue model.

Recommended `/products`:

```text
Search Products

Categories

Hemodialysis
Puncture
Catheter
Infusion
Other

Product Cards
```

Product card:

```text
Image
Product Name
Category
Brand / Manufacturer
Short Description

[View Details]
[Contact Sales]
```

---

# 16. Product Detail Page

Recommended structure:

```text
Product Name

Image Gallery

Category
Brand
Manufacturer

Clinical / Intended Application

Key Features

Available Sizes / Variants

Specifications

Related Certificates

[Contact Sales]
[Request Product Information]
```

Do not expose ERP fields such as:

- landed cost,
- FOB,
- supplier cost,
- internal stock valuation,
- internal aliases,
- confidential sale/profit data.

---

# 17. Avoid Public E-Commerce Unless Client Explicitly Wants It

The current old MiproBD website includes shop/cart behavior.

Recommendation:

> Do not copy this automatically.

MIPRO's actual operational sales process is:

```text
Customer
→ Quotation
→ Order
→ Delivery
→ Collection
```

So public product pages should prefer:

```text
Contact Sales
Request Product Information
```

instead of:

```text
Add to Cart
Checkout
```

unless the client explicitly requests e-commerce.

---

# 18. Public Product Model Must Be Separate From ERP Product Model

Do not expose the internal ERP `Product` object directly.

Create a public projection.

Example:

```ts
type PublicProduct = {
  slug: string;
  name: string;
  category: string;

  shortDescription: string;
  description?: string;

  brand?: string;
  manufacturer?: string;

  images: string[];

  specifications?: Array<{
    label: string;
    value: string;
  }>;

  certificateIds?: string[];

  featured: boolean;
  published: boolean;
};
```

Public data must exclude:

```text
standardSalePrice
landedCost
supplier price
FOB
HS code
internal stock
profit
internal notes
product aliases
```

unless the client intentionally wants a particular field public.

---

# 19. Public Product Administration — Later

Initially:

```text
static typed data
```

is acceptable.

Later:

```text
public_products
public_product_images
public_product_certificates
```

may be managed through Supabase.

Do not force the operational ERP product table to become the website CMS.

---

# 20. Certificates / Quality Page

Add:

```text
/certificates
```

Show:

- certificate/document name,
- manufacturer/brand,
- related product,
- certificate type,
- preview/download where permitted.

Important:

> Distinguish clearly between a manufacturer's certificate and a MIPRO corporate certificate.

Do not label a partner/manufacturer ISO/CE certificate as though MIPRO itself holds that certification unless verified.

---

# 21. News / Resources

Use:

```text
/news
```

or:

```text
/resources
```

Content should be curated.

Suitable:

- healthcare/product education,
- MIPRO announcements,
- new product availability,
- medical device information,
- exhibition/event participation,
- company news.

Do not automatically import unrelated articles from the old website.

Avoid unrelated:

- politics,
- general technology news,
- unrelated international events.

---

# 22. Contact Page

Add:

```text
/contact
```

Recommended structure:

```text
Office Address

Phone

Email

Working Hours

Map

WhatsApp / Social Links

Business Inquiry Form
```

Form fields:

```text
Name
Organization
Phone
Email
Subject
Product Interest
Message

[Send Inquiry]
```

Optional anti-spam:

```text
Cloudflare Turnstile
```

or equivalent later.

---

# 23. Contact Information — Client Confirmation Required

The supplied 2026 business documents and existing website contain conflicting contact information.

Current newer business documents indicate approximately:

```text
Flat-B2, House-26
Road-06
Sector-09
Uttara
Dhaka-1230

Phone:
+88 / +880 018 05 050780

Website:
www.miprobd.com

Email shown:
ledtrackers@gmail.com
```

The current public website also contains another phone and `contact@miprobd.com`.

Therefore add this to the implementation checklist:

```text
[CLIENT CONFIRMATION REQUIRED]

Primary public phone:
□ 01805-050780
□ other/current website number

Primary public email:
□ contact@miprobd.com
□ ledtrackers@gmail.com
□ both
```

For prototype use the newer 2026 stationery as the provisional reference.

Do not silently publish conflicting information.

---

# 24. LED TRACKERS Relationship

The supplied stationery uses both:

```text
MIPRO Healthcare Corporation
LED TRACKERS
```

Before redesigning the website, confirm how LED TRACKERS should appear publicly.

Possible models:

### Option A

LED TRACKERS is a sister/associated business.

```text
MIPRO Healthcare Corporation
Associated Brand: LED TRACKERS
```

### Option B

LED TRACKERS is a separate sales identity.

Then keep separate public identity pages/branding if needed.

### Option C

Do not feature LED TRACKERS publicly except where existing documents require it.

Do not guess the legal/business relationship.

---

# 25. Design References

Use the provided reference websites for **layout principles**, not content copying.

## NIPRO JMI inspiration

Use ideas such as:

- corporate healthcare tone,
- clear company navigation,
- product/category presentation,
- quality/certification emphasis,
- clean white/blue medical branding,
- structured footer.

## Jiangxi Hongda inspiration

Use ideas such as:

- stronger product imagery,
- large product category blocks,
- certification presentation,
- product-focused homepage rhythm,
- visual industry credibility.

Do not copy:

- manufacturer statistics,
- factory claims,
- production capacity,
- certificates,
- company history,
- manufacturer-specific wording.

---

# 26. Recommended Visual Direction

Use the existing MIPRO visual identity:

```text
Deep blue
Cyan / turquoise
White
Subtle slate neutrals
```

Design characteristics:

- professional healthcare,
- modern,
- clean,
- strong whitespace,
- large product photography,
- restrained animation,
- high contrast,
- mobile responsive.

Avoid:

- overly futuristic ERP visuals,
- excessive gradients,
- generic SaaS dashboard aesthetics,
- stock-tech imagery unrelated to medical supply.

---

# 27. Header Behavior

Desktop:

```text
MIPRO Logo
Home
About
Products
Certificates
News
Contact
                       Employee Portal
```

Mobile:

```text
MIPRO Logo        Menu
```

Menu contains:

```text
Home
About
Products
Certificates
News
Contact
Employee Portal
```

Sticky header is acceptable.

---

# 28. Employee Portal CTA

Use wording:

```text
Employee Portal
```

instead of:

```text
Sign In
ERP Login
Request Access
```

Click:

```text
/login
```

Inside the login page, then explicitly say:

```text
MIPRO ERP
Employee Portal
```

---

# 29. Footer

Recommended:

```text
MIPRO Healthcare Corporation
Precision in Healthcare

Products
- Hemodialysis
- Blood Tubing
- AV Fistula
- Other

Company
- About
- Certificates
- News
- Contact

Contact
- Address
- Phone
- Email

Employee Portal

© MIPRO Healthcare Corporation
```

Optional:

```text
Privacy Policy
Terms
```

---

# 30. Homepage Statistics

Do not use internal ERP statistics.

If the client later wants public stats, only use verified company-level facts such as:

```text
Years in operation
Product categories
Institutions served
Distribution reach
```

and only after confirmation.

Do not derive public marketing statistics from ERP mock data.

---

# 31. Public Homepage Hero Image

Replace the current generic ERP/warehouse emphasis with a stronger healthcare/business visual.

Recommended choices:

1. MIPRO product photography.
2. Hemodialysis product setup.
3. High-quality medical consumable arrangement.
4. MIPRO warehouse/distribution image if genuinely company-owned.
5. A combination of product and healthcare imagery.

Avoid using unrelated stock images as though they are MIPRO facilities.

---

# 32. SEO

Add proper metadata.

Homepage:

```text
Title:
MIPRO Healthcare Corporation | Medical Device & Consumable Supplier in Bangladesh

Description:
MIPRO Healthcare Corporation supplies medical devices and consumables including hemodialysis and related healthcare products in Bangladesh.
```

Adjust final wording based on client-confirmed business positioning.

Add:

```text
canonical URL
Open Graph
social preview image
structured organization data
favicon
```

---

# 33. Sitemap

Create:

```text
/sitemap.xml
```

Include:

```text
/
/about
/products
/product pages
/certificates
/news
/contact
```

Do not include:

```text
/login
/app/*
```

in the public sitemap.

---

# 34. Robots

Recommended:

```text
Allow public pages

Disallow:
/app/
/login
/reset-password
```

ERP pages should also require authentication regardless of robots.txt.

---

# 35. Old MiproBD URL Migration

Do not destroy existing SEO/history.

Before replacing the current website:

1. Crawl existing URLs.
2. Create old → new mapping.
3. Preserve matching product slugs where practical.
4. Add 301 redirects.
5. Redirect old blog content only when retained.
6. Return intentional 410/404 only for truly removed low-value content.

Example:

```text
old:
/product/blood-tubing-set-for-hemodialysis/

new:
/products/blood-tubing-set-for-hemodialysis
```

Use a 301 redirect.

---

# 36. Existing Website Content Migration Rules

Use the current site as a content source, but review every item.

### Keep / improve

- valid product names,
- useful product descriptions,
- confirmed manufacturer info,
- relevant product imagery,
- useful medical articles,
- valid certificate documents,
- social links,
- confirmed contact information.

### Remove / rewrite

- Lorem Ipsum,
- generic store template content,
- irrelevant blog posts,
- duplicated sections,
- unsupported manufacturer claims,
- obsolete contacts,
- cart/e-commerce copy if not used.

---

# 37. Public Inquiry Backend

For prototype:

```text
POST /api/public/contact
```

Fields:

```ts
type PublicInquiry = {
  name: string;
  organization?: string;
  email?: string;
  phone: string;
  subject?: string;
  productInterest?: string;
  message: string;
};
```

Do not expose internal API authentication.

Later:

```text
Supabase
public_inquiries
```

or email notification.

---

# 38. Inquiry Security

Public form needs:

- validation,
- rate limiting,
- anti-spam,
- no arbitrary HTML,
- input length limits.

Later use:

- Cloudflare Turnstile,
- CAPTCHA alternative,
- server-side rate limit.

---

# 39. Optional Future CRM Integration

Later:

```text
Public Inquiry
      ↓
Sales Manager Reviews
      ↓
Convert to Lead
      ↓
Assign Sales Executive
      ↓
Follow-up
```

Do not automatically assign every website spam/contact message as a real lead.

---

# 40. ERP Login Security

Production:

- no signup,
- no public role selection,
- no demo credentials,
- no prefilled password,
- no public Super Admin email,
- password reset remains,
- real authentication later through Supabase Auth.

Future:

```text
email/password
optional MFA
invite-based account creation
```

---

# 41. Suggested Public Component Structure

```text
src/features/public/
  PublicLayout.tsx
  PublicHeader.tsx
  PublicFooter.tsx

  HomePage.tsx
  AboutPage.tsx

  ProductsPage.tsx
  ProductDetailPage.tsx

  CertificatesPage.tsx
  NewsPage.tsx
  ContactPage.tsx

src/features/public/components/
  HeroSection.tsx
  ProductCategoryGrid.tsx
  FeaturedProducts.tsx
  AboutPreview.tsx
  CertificatePreview.tsx
  ContactCTA.tsx
  BusinessInquiryForm.tsx
```

Do not mix these components with ERP domain components unnecessarily.

---

# 42. Branding Components

Keep:

```text
MiproLogo
```

Consider adding:

```text
MiproWordmark
CorporateTagline
```

Use the registered/current logo.

Do not use old/not-registered logos for the public site.

---

# 43. Public Data Layer

Create a small separate public service.

Example:

```text
publicSiteService.products()
publicSiteService.product(slug)
publicSiteService.certificates()
publicSiteService.news()
publicSiteService.submitInquiry()
```

For current prototype, this can use static/mock data.

Later switch to Supabase/CMS without changing the page components.

---

# 44. Do Not Expose ERP API Data Publicly

Never reuse protected endpoints like:

```text
/api/settings/products
/api/inventory/*
/api/reports/*
```

for the corporate website.

Create explicit public endpoints or static content.

This prevents accidental exposure of:

- pricing,
- stock,
- cost,
- supplier info,
- internal IDs,
- operational metadata.

---

# 45. Public Product Images

Use:

- client-supplied imagery,
- existing legitimate MiproBD product imagery,
- manufacturer-approved product imagery.

Avoid:

- copyrighted images copied without permission,
- low-resolution images,
- unrelated generic stock images,
- images that imply MIPRO manufactured the product when it did not.

---

# 46. Certificates Viewer

The PDF viewer already exists internally.

You may reuse the safe **visual component** for public certificate viewing, but not the internal protected document API.

Public certificates should have explicitly public files/URLs.

Example:

```text
Certificate
[Preview PDF]
[Download]
```

Only for documents approved for public publication.

---

# 47. Public Site + Internal ERP Separation

Recommended layout structure:

```text
PublicLayout
  ↓
public pages

AuthShell
  ↓
login/recovery

AppLayout
  ↓
protected ERP
```

Do not make `AppLayout` responsible for the corporate website.

---

# 48. App Routing Target

Example:

```tsx
<Routes>
  {/* Public */}
  <Route element={<PublicLayout />}>
    <Route path="/" element={<HomePage />} />
    <Route path="/about" element={<AboutPage />} />
    <Route path="/products" element={<ProductsPage />} />
    <Route path="/products/:slug" element={<ProductDetailPage />} />
    <Route path="/certificates" element={<CertificatesPage />} />
    <Route path="/news" element={<NewsPage />} />
    <Route path="/contact" element={<ContactPage />} />
  </Route>

  {/* Employee access */}
  <Route path="/login" element={<LoginPage />} />
  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
  <Route path="/reset-password" element={<ResetPasswordPage />} />

  {/* ERP */}
  <Route element={<ProtectedRoute />}>
    <Route path="/app" element={<AppLayout />}>
      ...
    </Route>
  </Route>
</Routes>
```

Remove public `/signup` for production.

---

# 49. Keep Existing ERP Main Navigation

Do not change:

```text
Dashboard
Imports
Inventory
Sales
Expenses & Accounts
Reports
Settings
```

The public website is outside `AppLayout`.

It does not count as new ERP navigation complexity.

---

# 50. Field Team — Current Status

The current Field Team implementation is now good enough for the frontend phase.

It already has:

- real Leaflet coordinate map,
- clustering,
- employee filters,
- role-scoped visibility,
- live/recent/stale/offline state,
- route history,
- visit timeline,
- employee → report linking,
- demo feed disclosure.

Do not redesign it again now.

---

# 51. Field Team Production Improvements — Later

When real backend/mobile starts:

```text
Supabase current location
Supabase location history
Supabase visits
Supabase tracking sessions
Supabase Realtime
mobile GPS
web foreground geolocation
```

Also consider production map tile/provider limits rather than relying permanently on public OpenStreetMap tiles.

---

# 52. AI — Current Status

Current AI direction is correct.

Keep:

- Floating MIPRO AI,
- contextual page/entity data,
- role-safe answers,
- Smart Insights,
- document extraction review,
- FIFO/expiry recommendations,
- sales/collection alerts.

Do not create a main AI sidebar page.

---

# 53. Smart Insights — Keep Secondary

Current route:

```text
/app/insights
```

is appropriate.

Entry via:

```text
Dashboard → View All Insights
```

is better than another navigation module.

Keep this architecture.

---

# 54. ERP Improvements Remaining After Public Website

Do not expand scope before client review.

Main later technical tasks:

- Supabase/Postgres migration,
- Supabase Auth,
- Supabase Storage,
- Supabase Realtime,
- mobile sales app,
- real GPS,
- real document AI,
- LangChain/LangGraph,
- persistent AI insight status,
- production notification delivery.

These are later phases.

---

# 55. Implementation Priority

## P0 — Corporate Website

1. Create `PublicLayout`.
2. Replace current `/` ERP landing page.
3. Add corporate header/footer.
4. Add Home.
5. Add About.
6. Add Products.
7. Add Product Detail.
8. Add Certificates.
9. Add Contact.
10. Add Employee Portal CTA.

## P0 — Employee Access Cleanup

11. Remove Request Access from homepage.
12. Remove Request Access from Login.
13. Remove `/signup` in production.
14. Keep user creation inside ERP Settings.
15. Hide demo users/credentials in production.
16. Remove internal metrics from AuthShell.

## P1 — Public Content

17. Curate actual MiproBD product content.
18. Curate certificates.
19. Add News/Resources.
20. Add inquiry form.
21. Confirm public contact details.
22. Confirm LED TRACKERS relationship.

## P1 — SEO / Migration

23. Add page metadata.
24. Add Open Graph.
25. Add sitemap.
26. Add robots rules.
27. Map old URLs.
28. Add redirects.

## P2 — Backend

29. Public product/content data in Supabase/CMS.
30. Public inquiries storage.
31. Real employee auth.
32. Existing ERP backend migration.

---

# 56. What Not To Do

Do not:

- keep “MIPRO Medical Supplier ERP” as public hero,
- publish mock ERP metrics,
- publish stock valuation publicly,
- publish internal sales publicly,
- expose demo credentials in production,
- allow strangers to request ERP roles,
- expose ERP product records directly,
- copy NIPRO/Hongda claims,
- copy manufacturer certificates as MIPRO certificates,
- automatically copy all old WordPress content,
- automatically keep e-commerce/cart,
- invent public company statistics,
- change working ERP architecture unnecessarily.

---

# 57. Client Confirmation Checklist

Before final public launch confirm:

```text
□ Official public phone
□ Official public email
□ Official public office address
□ LED TRACKERS relationship
□ Product categories to publish
□ Manufacturer names allowed publicly
□ Product images approved
□ Certificates approved for public viewing
□ Whether public product prices should appear
□ Whether e-commerce/cart is required
□ Which old blog posts should be retained
□ Social/WhatsApp links
□ Privacy/contact form handling
```

---

# 58. Recommended Final User Experience

Public visitor:

```text
miprobd.com
     ↓
Professional MIPRO corporate website
     ↓
Products / Company / Certificates / Contact
```

Employee:

```text
miprobd.com
     ↓
Employee Portal
     ↓
MIPRO ERP Login
     ↓
Role-based Dashboard
```

Sales manager:

```text
ERP
↓
Sales
↓
Field Team
↓
Live Map / Route History
↓
Employee Report
```

Management:

```text
ERP
↓
Dashboard
↓
Smart Insights
↓
Operational source record
```

---

# 59. Final Product Positioning

The public platform should communicate:

> **MIPRO Healthcare Corporation is a healthcare product supplier and distribution business focused on dependable medical devices and consumables in Bangladesh.**

The internal platform should communicate:

> **MIPRO ERP is the secure employee operations platform used to manage imports, landed cost, inventory, sales, field activity, collections, expenses, reporting and internal intelligence.**

These two messages should never be mixed on the same public landing page.

---

# 60. Exact Next Milestone

## **MIPRO Corporate Website + Employee Portal Separation**

Deliver:

### Public Website
- redesigned MIPRO homepage,
- About,
- Products,
- Product Detail,
- Certificates,
- Contact,
- public navigation/footer,
- Employee Portal CTA.

### Authentication
- production login cleanup,
- no public Request Access,
- no production demo credentials,
- no production `/signup`.

### Content
- verified MiproBD copy,
- confirmed products,
- correct contact details,
- approved certificate presentation.

### SEO
- metadata,
- sitemap,
- redirects from old site.

### Preserve
- all current ERP workflows,
- Field Team,
- Smart Insights,
- floating AI,
- reports,
- document viewer,
- current seven-area internal navigation.

---

**End of Plan**
