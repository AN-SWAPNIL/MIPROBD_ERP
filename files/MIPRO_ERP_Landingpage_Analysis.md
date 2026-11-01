I checked the latest **`dev` branch** again. It is now at `2374e29...`, and the system is in a much stronger state. The Field Team work in particular is no longer a mock-looking map: it now uses Leaflet/React-Leaflet, coordinate-based employee markers, marker clustering, route polylines, customer markers, role-scoped data, route/visit history, and server-derived `LIVE / RECENT / STALE / OFFLINE / NOT_TRACKING` states.    The reusable employee picker is also a good solution for larger teams because it searches by name, employee ID, and territory rather than relying on a huge native dropdown.

The Smart Insights direction is also right now. It is a secondary review screen, not another sidebar-heavy “AI Command Center,” and it remains role-scoped while the floating AI stays available contextually.

## The landing page is now the weakest part of the project

I strongly recommend changing it.

The current public `/` page still presents the product as:

> “MIPRO Medical Supplier ERP”

and publicly displays internal-looking figures such as delivered sales, stock valuation, batch-tracked units, and number of ERP roles.

That is appropriate for a software demo, but **not appropriate if this is going to become MIPRO's actual website**.

The public website should introduce **MIPRO Healthcare Corporation / MiproBD**, not the ERP.

The separation should be:

```text
miprobd.com
│
├── Public corporate website
│   ├── Home
│   ├── About
│   ├── Products
│   ├── Certificates
│   ├── News / Resources
│   └── Contact
│
├── /login
│      MIPRO ERP
│      Employee Portal
│
└── /app/*
       Internal ERP after authentication
```

That is, in my view, the correct architecture.

---

# Yes, I would bring the MiproBD corporate website into this project

There is good reason to do it.

The existing MiproBD site already establishes the public information architecture around **Home, Products, Certificates, Blog and Contact**, and it presents hemodialysis products such as dialyzers, blood tubing sets and AV fistula needles. ([MiProbD][1])

But the current public website has several quality problems. Its homepage contains placeholder copy such as “Lorem ipsum,” generic shop/support content and e-commerce/cart elements. ([MiProbD][1]) The blog also mixes useful healthcare/product material with unrelated posts about Starlink and international politics, which weakens the corporate-medical identity. ([MiProbD][2])

So I would **preserve verified MiproBD information and useful existing URLs/content, but redesign the website rather than visually copying the old WordPress site**.

This is also where your two reference websites are useful.

NIPRO JMI uses a classic professional healthcare-company structure: company introduction, corporate information, products, quality/manufacturing information, news and contact information. ([NIPRO JMI Pharma][3]) Jiangxi Hongda puts much more visual emphasis on product categories, certifications, company profile and business strengths. ([JXHD][4])

For MIPRO, I would combine those approaches, but **not copy their manufacturing claims**. Your own requirement documents describe MIPRO's business as a medical device importer, overseas procurer, customs-clearance operator, warehouse distributor and dealer/hospital supplier.  So the public site should not make MIPRO look like a Chinese manufacturer simply because Hongda's website does.

In fact, the existing MiproBD website has text extremely similar to Hongda's “nine categories” manufacturer description. ([MiProbD][1]) ([JXHD][4]) I would **not migrate that sentence blindly**. The new website should clearly distinguish MIPRO as the Bangladesh business from manufacturers whose products it distributes.

## Recommended public homepage

I would design the homepage in roughly this order:

1. **Corporate header** — MIPRO logo, Home, About, Products, Certificates, News/Resources, Contact, and a visually separate **Employee Portal** button. No “Request Access.”
2. **Hero** — use the actual brand identity: **MIPRO Healthcare Corporation — Precision in Healthcare**. The message should focus on medical consumables, hemodialysis products and dependable healthcare supply—not ERP software.
3. **Featured product categories** — Hemodialysis, infusion/transfusion, puncture products, catheter products and other categories actually confirmed by MIPRO. The strongest current focus should feature Dialyzer, Blood Line and AV Fistula products.
4. **About MIPRO** — concise Bangladesh importer/distributor positioning, with a link to a dedicated About page.
5. **Featured products** — high-quality cards with product imagery, specifications and `View Details` / `Contact Sales`, not an online shopping cart unless the client explicitly wants e-commerce.
6. **Quality & Certificates** — certificates and product/manufacturer compliance documents, carefully labelled so a manufacturer's certificate is not falsely represented as MIPRO's own corporate certification.
7. **Why MIPRO / Supply capability** — only client-confirmed strengths; no invented factory, employee-count or production-volume statistics.
8. **Healthcare resources/news** — only relevant medical/company content. Do not automatically migrate unrelated old blog articles.
9. **Contact section** — office address, phone, email, map, WhatsApp/social links and a genuine business inquiry form.
10. **Corporate footer** — company identity, product links, contact information, certificates, privacy/terms and Employee Portal.

This would feel closer to NIPRO JMI in corporate professionalism while using Hongda's strong product-category presentation.

---

# One important distinction: “Request Access” vs “Contact Us”

I agree with removing **Request Access**.

Right now the landing page exposes a `Request Access` button, the login page links to `/signup`, `/signup` is publicly routed, and the signup form even lets an unauthenticated visitor request an ERP role such as Sales Executive or another role.

That makes little sense for an internal corporate ERP.

You already have **Settings → Users & Capabilities**, so company accounts should be provisioned by the Super Admin. Public visitors should not be submitting ERP account applications.

I would therefore make production onboarding:

```text
Super Admin
   ↓
Creates / invites employee
   ↓
Role & capabilities assigned
   ↓
Employee receives credentials/invite
   ↓
Employee Portal → Sign In
```

`Forgot Password` should remain.

A public **Contact Sales / Send Inquiry / Request Product Information** form is completely different and is useful. It creates a commercial inquiry, not an ERP user.

If later you want a public inquiry to become a CRM lead, the authorized sales team can convert it into a lead internally.

---

# There is another production security issue on the login page

The current login page still:

* pre-fills `superadmin@mipro.local`,
* pre-fills the demo password,
* displays the demo-role selector,
* links to Request Access.

That is useful for the prototype, but it must not exist on the production MiproBD website.

I would keep it only behind something like:

```text
VITE_DEMO_MODE=true
```

For production:

```text
MIPRO ERP
Employee Portal

Email
Password

[Sign In]

Forgot password?
```

Nothing more is necessary.

---

# The current login artwork also reveals too much

`AuthShell` currently publicly displays things like:

* 17,500 units in stock,
* BDT 3.97M delivered sales,
* “7 Roles,”
* language describing the software as being “Built for Bangladeshi medical suppliers.”

I would remove that.

The login page should be **MIPRO-specific**, not a sales page for the ERP software.

Something more appropriate would be:

```text
MIPRO Healthcare Corporation
Precision in Healthcare

Employee Operations Portal

Secure access to MIPRO's internal
operations and management system.
```

You could use a tasteful warehouse/product photograph on the left, but no internal sales, stock, profit or role statistics before authentication.

The ERP features belong **after login**.

---

# Public brand wording

Yes: on the landing/public pages, write **MIPRO / MiproBD**, not “MIPRO ERP.”

I would distinguish the surfaces like this:

| Surface            | Branding                       |          |
| ------------------ | ------------------------------ | -------- |
| Browser/page title | `MIPRO Healthcare Corporation  | MiproBD` |
| Public header      | MIPRO logo                     |          |
| Hero               | `MIPRO Healthcare Corporation` |          |
| Tagline            | `Precision in Healthcare`      |          |
| Public URL         | `miprobd.com`                  |          |
| Header CTA         | `Employee Portal`              |          |
| Login page         | `MIPRO ERP — Employee Portal`  |          |
| Internal header    | `MIPRO ERP`                    |          |
| `/app/*`           | Operational ERP                |          |

The 2026 MIPRO stationery itself uses **MIPRO HEALTHCARE CORPORATION** and the tagline **PRECISION IN HEALTHCARE**, so those are particularly strong branding anchors. 

---

# Contact information needs one client confirmation before publishing

I found an important inconsistency.

The newer 2026 MIPRO letterhead shows:

**Flat-B2, House-26, Road-06, Sector-09, Uttara, Dhaka-1230**, phone **+88 018 05 050780**, email **[ledtrackers@gmail.com](mailto:ledtrackers@gmail.com)**, and `www.miprobd.com`. 

The supplied Order Receiving Sheet similarly gives House-26, Road-06, Sector-9, Uttara, Dhaka-1230 and phone **+880 018 0505 0780**. 

But the existing public website currently lists **+8801832466944** on its Contact page, while its top bar uses `contact@miprobd.com` and the Contact page lists `ledtrackers@gmail.com`. ([MiProbD][5]) ([MiProbD][1])

So I would **not silently choose one**. Before the final public deployment, confirm:

```text
Primary phone?
01805-050780
or
01832-466944

Primary public email?
contact@miprobd.com
or
ledtrackers@gmail.com
```

Because the supplied 2026 business documents are newer, I would provisionally use those values in the prototype, but mark the conflicting phone/email as **Needs Client Confirmation**.

---

# Product pages should also change philosophy

The existing MiproBD site functions partly like an online shop, including prices and “Add to cart.” ([MiProbD][1]) A current Blood Line product page, for example, shows pricing and identifies Jiangxi Hongda as the manufacturer. ([MiProbD][6])

For MIPRO's business model, I would lean toward a professional **B2B product catalogue**, not e-commerce:

```text
Blood Tubing Set for Hemodialysis

Product image
Brand / manufacturer
Clinical application
Key specifications
Available variants
Relevant certificates

[Contact Sales]
[Request Product Information]
```

Not:

```text
Quantity
Add to Cart
Checkout
```

That also aligns better with the quotation-driven Sales workflow you have been building internally.

---

# Public product data must be separated from ERP product data

This is architecturally important.

Do **not** expose the ERP's full `Product` records directly to the public landing site. Internal records may later contain:

* standard sale price,
* HS code,
* internal aliases,
* inventory information,
* costing relationships,
* supplier-related data.

Instead use a deliberate public projection such as:

```ts
PublicProduct {
  slug
  name
  category
  shortDescription
  description
  images
  brand
  manufacturer
  specifications
  certificates
  featured
}
```

No cost, stock valuation, internal notes, landed-cost references or supplier pricing.

Initially this can be static data. Later it can become a controlled `/api/public/products` endpoint or public Supabase view.

---

# Public page routes I recommend

| Route              | Purpose                              |
| ------------------ | ------------------------------------ |
| `/`                | Corporate homepage                   |
| `/about`           | MIPRO profile and business           |
| `/products`        | Product catalogue/categories         |
| `/products/:slug`  | Individual product                   |
| `/certificates`    | Certificates / quality documentation |
| `/news`            | Curated medical/company news         |
| `/contact`         | Contact, map, business inquiry       |
| `/login`           | Employee Portal                      |
| `/forgot-password` | Employee account recovery            |
| `/app/*`           | Protected ERP                        |

`/signup` should disappear from the production public routes.

If you want to preserve the old site's search ranking, old WordPress URLs such as existing product/blog URLs should receive appropriate **301 redirects** instead of simply becoming 404s.

---

# Do not migrate all of the old site blindly

Use the current site as a **content source**, not as a design/source-code template.

The existing MiproBD website gives us useful verified material:

* product names/categories,
* existing product imagery,
* certificates,
* existing blog/resource material,
* social/WhatsApp links,
* contact identity. ([MiProbD][1])

But remove or rewrite:

* lorem ipsum,
* generic WooCommerce support/footer content,
* cart/shop behavior unless confirmed,
* irrelevant blog articles,
* copied manufacturer wording,
* obsolete contact information,
* broken/placeholder pages.

---

# How the ERP itself looks now

The recent update was successful.

The Field Team page now has the architecture we wanted: role-scoped location feeds, a 15-second demo refresh, searchable territory/status filtering, live map, route history, visit timeline, employee-to-report linking and explicit “Demo location feed” disclosure.

The backend also now derives tracking status from timestamps and active sessions instead of trusting a display flag: ≤1 minute becomes Live, ≤10 minutes Recent, then Stale, while inactive locations transition to Offline/Not Tracking.  It enforces employee scope server-side and already has typed endpoints for tracking start/location/stop and visit check-in/out.

The employee-report ↔ field-activity connection has also been implemented properly through query parameters and the searchable EmployeePicker.

So I would **not do another major ERP redesign now**.

The remaining production-side improvements are mainly infrastructure: Supabase persistence, Supabase Realtime instead of 15-second polling, a production map-tile provider rather than relying indefinitely on the public OSM tile server, real mobile/web geolocation capture, server-side timestamp sanity checks, persistent Smart Insight review state, and real AI later behind the interfaces you already built.

---

# Recommended next milestone

I would now shift focus from another ERP feature pass to:

| Priority  | Work                                                                 |
| --------- | -------------------------------------------------------------------- |
| **P0**    | Replace the ERP-demo landing page with the MiproBD corporate website |
| **P0**    | Remove public Request Access/signup                                  |
| **P0**    | Remove public demo credentials/role selector for production          |
| **P0**    | Remove public internal sales/stock/valuation numbers                 |
| **P0**    | Add Home, About, Products, Certificates, Contact                     |
| **P0**    | Employee Portal → `/login`                                           |
| **P1**    | Product detail pages and curated News/Resources                      |
| **P1**    | Business inquiry/contact form                                        |
| **P1**    | SEO metadata, sitemap, Open Graph and old-URL redirects              |
| **P1**    | Confirm public phone/email and LED TRACKERS presentation             |
| **Later** | Supabase/auth/storage/realtime/mobile integration                    |

So the final mental model should be:

```text
PUBLIC
────────────────────────
MIPRO Healthcare Corporation
MiproBD
Medical products
Company
Certificates
Contact
News
        │
        │ Employee Portal
        ▼
LOGIN
────────────────────────
MIPRO ERP
Internal employees only
        │
        ▼
ERP
────────────────────────
Imports
Inventory
Sales
Field Team
Accounts
Reports
Settings
AI
```

That separation would make the project feel like **one professional MIPRO digital platform**, rather than an ERP prototype that happens to have a public landing page.

[1]: https://www.miprobd.com/ "Home - MiproBD"
[2]: https://www.miprobd.com/blog/ "Blog - MiproBD"
[3]: https://www.niprojmipharma.com/ "NIPRO JMI Pharma Ltd. [A Japan Bangladesh Company]"
[4]: https://en.www.jxhd.cn/Home.html "Jiangxi Hongda |  Medical protection | Syringes"
[5]: https://www.miprobd.com/contact/ "Contact - MiproBD"
[6]: https://www.miprobd.com/product/blood-tubing-set-for-hemodialysis/?utm_source=chatgpt.com "Blood Tubing Set for Hemodialysis(Blood Line) - MiproBD"
