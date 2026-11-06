// Single source of truth for SEO: used by the browser (src/components/SEO.tsx),
// the build (vite.config.ts writes static HTML per page) and the server
// function (api/share-page.ts renders /sitemap.xml and detail-page HTML).
// Dependency-free on purpose so all three can import it.

export const SITE_URL = "https://www.javanilife.com";
export const SITE_NAME = "Javani Spiritual Hub";
export const SITE_LOCALE = "en_IN";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.jpg`;
export const LOGO_URL = `${SITE_URL}/logo-512.png`;
export const JSON_LD_ID = "json-ld-seo";

export interface StaticSeoPage {
  path: string;
  title: string;
  description: string;
  /** Visible heading of the page (same words as the page's hero). */
  h1: string;
  /** Short real copy from the page, written into the static HTML for crawlers. */
  intro: string;
  /** Breadcrumb label; omitted for home. */
  crumb?: string;
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
}

export const STATIC_PAGES: StaticSeoPage[] = [
  {
    path: "/",
    title: "Dance & Music Academy in Secunderabad | Javani Spiritual Hub",
    description: "Learn Bharatanatyam, Kuchipudi and Carnatic music at Javani Spiritual Hub, Yapral, Secunderabad. Graded certification courses and monthly classes for all ages.",
    h1: "Where Tradition Lives. Where Gurus Grow. Where Culture Blossoms",
    intro: "Rooted in ancient tradition. Elevated for the modern soul. Join Javani Spiritual Hub and embark on a journey of grace, discipline, and self-discovery.",
    changefreq: "weekly",
    priority: 1,
  },
  {
    path: "/about",
    title: "Our Story, Founder & Faculty | Javani Spiritual Hub",
    description: "Meet the founder and faculty of Javani Spiritual Hub in Secunderabad, and the story behind our academy for Bharatanatyam, Kuchipudi and Carnatic music.",
    h1: "The Soul Behind Javani",
    intro: "Our story, our founder, our faculty and our journey of preserving and teaching India's classical performing arts.",
    crumb: "About Us",
    changefreq: "monthly",
    priority: 0.7,
  },
  {
    path: "/courses",
    title: "Classical Dance & Music Courses | Javani Spiritual Hub",
    description: "Bharatanatyam, Kuchipudi and Carnatic music courses: grades, diploma, pre-grade, masterclasses and workshops, plus yoga and konnakol. Secunderabad and online.",
    h1: "Our Sacred Courses",
    intro: "Classical arts for every soul, from first steps to national certification.",
    crumb: "Courses",
    changefreq: "weekly",
    priority: 0.9,
  },
  {
    path: "/classes",
    title: "Monthly Dance Classes, Kids & Adults | Javani Spiritual Hub",
    description: "Join monthly classical dance classes, including Kuchipudi and Nattuvangam, at Javani Spiritual Hub, Secunderabad. Enrol online and pay fees by autopay.",
    h1: "Monthly Classes",
    intro: "Enrol once, pay monthly. Autopay or pay manually, with reminders and a clear payment history.",
    crumb: "Classes",
    changefreq: "weekly",
    priority: 0.9,
  },
  {
    path: "/products",
    title: "Dance Costumes & Instruments Shop | Javani Spiritual Hub",
    description: "Shop classical dance costumes, instruments, books and practice materials curated by the Javani Spiritual Hub faculty for practice and performance.",
    h1: "Artistry Begins With the Right Tools",
    intro: "Authentic costumes, instruments, and learning materials curated for practice and performance.",
    crumb: "Products",
    changefreq: "daily",
    priority: 0.8,
  },
  {
    path: "/gallery",
    title: "Dance Performance Gallery | Javani Spiritual Hub",
    description: "Photos of student performances, workshops, certifications and classes at Javani Spiritual Hub, a classical dance and music academy in Secunderabad.",
    h1: "Gallery of Art & Expression",
    intro: "Every photograph tells the story of a student's devotion.",
    crumb: "Gallery",
    changefreq: "monthly",
    priority: 0.5,
  },
  {
    path: "/grading",
    title: "Dance Grade Exams & Certification | Javani Spiritual Hub",
    description: "How grading and certification work at Javani Spiritual Hub: a clear, grade-based progression from foundation level to Senior Diploma and Arangetram.",
    h1: "Understanding Our Grading System",
    intro: "A transparent, progressive certification pathway from foundation level to Senior Diploma and Arangetram.",
    crumb: "Grading",
    changefreq: "monthly",
    priority: 0.7,
  },
  {
    path: "/guru-bandhu",
    title: "Guru Bandhu Academy Partner Program | Javani Spiritual Hub",
    description: "The Javani Bandhathuvum Program supports classical arts academies with certification, digital management, product distribution, workshops and Guru recognition.",
    h1: "Javani Bandhathuvum Program",
    intro: "Empowering Gurus, strengthening academies, and preserving the sacred classical arts tradition through structured support and recognition.",
    crumb: "Guru Bandhu",
    changefreq: "monthly",
    priority: 0.6,
  },
  {
    path: "/contact",
    title: "Contact Us, Yapral, Secunderabad | Javani Spiritual Hub",
    description: "Contact Javani Spiritual Hub in Yapral, Secunderabad. Send an enquiry and get free initial counselling to find the right dance or music course for you.",
    h1: "Begin Your Journey With Us",
    intro: "Fill in your details and we'll guide you to the perfect course for your goals.",
    crumb: "Contact",
    changefreq: "yearly",
    priority: 0.6,
  },
  {
    path: "/terms-and-conditions",
    title: "Terms, Refund & Cancellation Policy | Javani Spiritual Hub",
    description: "Terms and conditions, refund and cancellation policy for courses, classes, products and services offered by Javani Spiritual Hub, Secunderabad.",
    h1: "Terms & Conditions",
    intro: "Terms and conditions, refund and cancellation policy for Javani Spiritual Hub programs and services.",
    crumb: "Terms & Conditions",
    changefreq: "yearly",
    priority: 0.3,
  },
];

/** Routes that must never be indexed (also disallowed in public/robots.txt). */
export const PRIVATE_PATH_PREFIXES = [
  "/admin", "/account", "/cart", "/checkout", "/login", "/signup",
  "/pay", "/bill", "/partner", "/share", "/history", "/_seo",
];

export const normalizePath = (path: string) => {
  const clean = (path || "/").split(/[?#]/)[0];
  return clean.length > 1 ? clean.replace(/\/+$/, "") || "/" : "/";
};

export const isPrivatePath = (path: string) => {
  const p = normalizePath(path).toLowerCase();
  return PRIVATE_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
};

export const canonicalUrl = (path: string) => `${SITE_URL}${normalizePath(path)}`;

export const getStaticPage = (path: string) => STATIC_PAGES.find((page) => page.path === normalizePath(path));

/** Plain text, collapsed whitespace, cut at a word boundary to `max` characters. */
export const toMetaDescription = (value: unknown, max = 160) => {
  const text = typeof value === "string" ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.-]+$/, "")}…`;
};

/** Cloudinary: serve a resized, auto-format, auto-quality version. Other URLs pass through. */
export const optimizeImageUrl = (url: string | undefined, width: number, extra = "") => {
  if (!url) return url || "";
  const match = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/);
  if (!match) return url;
  // Already transformed (first segment has commas/underscored params) → leave alone.
  if (/^[a-z]{1,3}_[^/]*\//.test(match[2]) && !/^v\d+\//.test(match[2])) return url;
  return `${match[1]}f_auto,q_auto,c_limit,w_${width}${extra ? `,${extra}` : ""}/${match[2]}`;
};

export const ogImageUrl = (url: string | undefined) => {
  if (!url) return DEFAULT_OG_IMAGE;
  const absolute = url.startsWith("//") ? `https:${url}` : url.startsWith("/") ? `${SITE_URL}${url}` : url;
  const match = absolute.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/);
  return match ? `${match[1]}c_fill,w_1200,h_630,q_auto,f_jpg/${match[2]}` : absolute;
};

// ---------- JSON-LD ----------

type JsonLd = Record<string, unknown>;

export interface ContactInfoForSeo {
  phone?: string;
  email?: string;
  address?: string;
  hours?: string;
  instagramUrl?: string;
  youtubeUrl?: string;
  facebookUrl?: string;
}

/** "…, Secunderabad, Telangana 500087" → structured address. Unparseable parts are left out. */
export const parseIndianAddress = (address?: string) => {
  if (!address) return undefined;
  const pin = address.match(/\b(\d{6})\b/)?.[1];
  const parts = address.replace(/\b\d{6}\b/, "").split(",").map((p) => p.trim()).filter(Boolean);
  const region = parts.find((p) => /telangana/i.test(p)) ? "Telangana" : undefined;
  const regionIndex = parts.findIndex((p) => /telangana/i.test(p));
  const locality = regionIndex > 0 ? parts[regionIndex - 1] : undefined;
  const street = regionIndex > 1 ? parts.slice(0, regionIndex - 1).filter((p) => !/^javani spiritual hub$/i.test(p)).join(", ") : undefined;
  return {
    "@type": "PostalAddress",
    ...(street ? { streetAddress: street } : {}),
    ...(locality ? { addressLocality: locality } : {}),
    ...(region ? { addressRegion: region } : {}),
    ...(pin ? { postalCode: pin } : {}),
    addressCountry: "IN",
  };
};

/** "Mon-Sat: 5:30 AM - 8:00 PM" → ["Mo-Sa 05:30-20:00"]. Returns undefined if not understood. */
export const parseOpeningHours = (hours?: string) => {
  if (!hours) return undefined;
  const days: Record<string, string> = { mon: "Mo", tue: "Tu", wed: "We", thu: "Th", fri: "Fr", sat: "Sa", sun: "Su" };
  const m = hours.match(/(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*[-–]\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*:?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return undefined;
  const to24 = (h: string, min: string | undefined, ap: string) => {
    let hour = Number(h) % 12;
    if (ap.toLowerCase() === "pm") hour += 12;
    return `${String(hour).padStart(2, "0")}:${min || "00"}`;
  };
  return [`${days[m[1].toLowerCase()]}-${days[m[2].toLowerCase()]} ${to24(m[3], m[4], m[5])}-${to24(m[6], m[7], m[8])}`];
};

export const organizationJsonLd = (contact?: ContactInfoForSeo): JsonLd => {
  const sameAs = [contact?.instagramUrl, contact?.youtubeUrl, contact?.facebookUrl].filter((u): u is string => !!u && /^https?:\/\//.test(u));
  const address = parseIndianAddress(contact?.address);
  const openingHours = parseOpeningHours(contact?.hours);
  const email = contact?.email?.split(",")[0]?.trim();
  return {
    "@type": ["EducationalOrganization", "LocalBusiness"],
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: LOGO_URL,
    image: DEFAULT_OG_IMAGE,
    description: "Classical dance and music academy in Secunderabad teaching Bharatanatyam, Kuchipudi and Carnatic music.",
    ...(contact?.phone ? { telephone: contact.phone.replace(/\s+/g, " ").trim() } : {}),
    ...(email ? { email } : {}),
    ...(address ? { address } : {}),
    ...(openingHours ? { openingHours } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
};

export const websiteJsonLd = (): JsonLd => ({
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  inLanguage: "en-IN",
  publisher: { "@id": `${SITE_URL}/#organization` },
});

export const breadcrumbJsonLd = (items: { name: string; path: string }[]): JsonLd => ({
  "@type": "BreadcrumbList",
  itemListElement: [{ name: "Home", path: "/" }, ...items].map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: canonicalUrl(item.path),
  })),
});

export const graph = (...nodes: (JsonLd | undefined)[]) => ({
  "@context": "https://schema.org",
  "@graph": nodes.filter(Boolean),
});

export const staticPageJsonLd = (page: StaticSeoPage, contact?: ContactInfoForSeo) => (
  page.path === "/"
    ? graph(organizationJsonLd(contact), websiteJsonLd())
    : graph(breadcrumbJsonLd([{ name: page.crumb || page.h1, path: page.path }]))
);

export interface ProductForSeo {
  id: string;
  name: string;
  description?: string;
  images: string[];
  amountInPaise?: number;
  sku?: string;
  stockStatus?: string;
  category?: string;
}

const AVAILABILITY: Record<string, string> = {
  available: "https://schema.org/InStock",
  "out-of-stock": "https://schema.org/OutOfStock",
  "coming-soon": "https://schema.org/PreOrder",
};

export const productJsonLd = (product: ProductForSeo): JsonLd => {
  const url = canonicalUrl(`/products/${encodeURIComponent(product.id)}`);
  const price = product.amountInPaise && product.amountInPaise > 0 ? (product.amountInPaise / 100).toFixed(2) : undefined;
  return {
    "@type": "Product",
    "@id": `${url}#product`,
    name: product.name,
    url,
    ...(product.description ? { description: toMetaDescription(product.description, 5000) } : {}),
    ...(product.images.length ? { image: product.images.slice(0, 5).map((src) => ogImageUrl(src)) } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.category ? { category: product.category } : {}),
    brand: { "@type": "Brand", name: SITE_NAME },
    ...(price
      ? {
        offers: {
          "@type": "Offer",
          url,
          priceCurrency: "INR",
          price,
          availability: AVAILABILITY[product.stockStatus || "available"] || AVAILABILITY.available,
          itemCondition: "https://schema.org/NewCondition",
          seller: { "@id": `${SITE_URL}/#organization` },
        },
      }
      : {}),
  };
};

export const courseJsonLd = (input: { path: string; name: string; description?: string; image?: string }): JsonLd => ({
  "@type": "Course",
  "@id": `${canonicalUrl(input.path)}#course`,
  name: input.name,
  url: canonicalUrl(input.path),
  description: toMetaDescription(input.description, 500) || `${input.name} at ${SITE_NAME}, Secunderabad.`,
  ...(input.image ? { image: ogImageUrl(input.image) } : {}),
  provider: { "@type": "EducationalOrganization", "@id": `${SITE_URL}/#organization`, name: SITE_NAME, url: `${SITE_URL}/` },
});

// ---------- HTML ----------

const HTML_ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);
export const jsonLdScript = (data: unknown) => `<script type="application/ld+json" id="${JSON_LD_ID}">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

export interface HeadInput {
  title: string;
  description: string;
  path: string;
  image?: string;
  imageAlt?: string;
  type?: "website" | "product" | "article";
  noindex?: boolean;
  jsonLd?: unknown;
}

export const buildHeadTags = (input: HeadInput) => {
  const url = canonicalUrl(input.path);
  const image = ogImageUrl(input.image);
  const t = escapeHtml(input.title);
  const d = escapeHtml(input.description);
  const tags = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
    `<meta name="robots" content="${input.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large"}">`,
    input.noindex ? "" : `<link rel="canonical" href="${escapeHtml(url)}">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:locale" content="${SITE_LOCALE}">`,
    `<meta property="og:type" content="${input.type || "website"}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    input.noindex ? "" : `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    image === DEFAULT_OG_IMAGE ? `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">` : "",
    input.imageAlt ? `<meta property="og:image:alt" content="${escapeHtml(input.imageAlt)}">` : "",
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
    input.jsonLd ? jsonLdScript(input.jsonLd) : "",
  ];
  return tags.filter(Boolean).join("\n    ");
};

const SEO_BLOCK_START = "<!--seo-head-->";
const SEO_BLOCK_END = "<!--/seo-head-->";

/**
 * Put SEO tags and crawlable body content into the built index.html.
 * The template marks the replaceable head area with <!--seo-head--> … <!--/seo-head-->.
 * React's createRoot() replaces the #root content on mount, so `bodyHtml` is only seen
 * by crawlers and link-preview bots (and for a moment before JS runs).
 */
export const renderIntoTemplate = (template: string, headTags: string, bodyHtml = "") => {
  const start = template.indexOf(SEO_BLOCK_START);
  const end = template.indexOf(SEO_BLOCK_END);
  if (start === -1 || end === -1) throw new Error("index.html is missing the <!--seo-head--> markers");
  const withHead = `${template.slice(0, start + SEO_BLOCK_START.length)}\n    ${headTags}\n    ${template.slice(end)}`;
  return bodyHtml ? withHead.replace('<div id="root"></div>', `<div id="root">${bodyHtml}</div>`) : withHead;
};

const NAV_LINKS = STATIC_PAGES.filter((p) => p.path !== "/" && p.path !== "/terms-and-conditions");

export const crawlerBody = (input: { h1: string; paragraphs?: string[]; crumbs?: { name: string; path: string }[]; image?: { src: string; alt: string }; extraHtml?: string }) => {
  const crumbs = input.crumbs?.length
    ? `<nav aria-label="Breadcrumb"><a href="/">Home</a>${input.crumbs.map((c) => ` › <a href="${escapeHtml(c.path)}">${escapeHtml(c.name)}</a>`).join("")}</nav>`
    : "";
  const paragraphs = (input.paragraphs || []).filter(Boolean).map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  const image = input.image ? `<img src="${escapeHtml(optimizeImageUrl(input.image.src, 800))}" alt="${escapeHtml(input.image.alt)}" width="800" height="800">` : "";
  const nav = `<nav aria-label="Site"><ul>${NAV_LINKS.map((p) => `<li><a href="${p.path}">${escapeHtml(p.crumb || p.h1)}</a></li>`).join("")}</ul></nav>`;
  return `<div data-seo-prerender>${crumbs}<main><h1>${escapeHtml(input.h1)}</h1>${image}${paragraphs}${input.extraHtml || ""}</main>${nav}</div>`;
};

// ---------- Sitemap ----------

export interface SitemapEntry { path: string; lastmod?: string; changefreq?: string; priority?: number }

export const buildSitemapXml = (entries: SitemapEntry[]) => {
  const seen = new Set<string>();
  const rows = entries
    .filter((e) => !isPrivatePath(e.path))
    .map((e) => ({ ...e, loc: canonicalUrl(e.path) }))
    .filter((e) => (seen.has(e.loc) ? false : (seen.add(e.loc), true)))
    .map((e) => [
      "  <url>",
      `    <loc>${escapeHtml(e.loc)}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : "",
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : "",
      typeof e.priority === "number" ? `    <priority>${e.priority.toFixed(1)}</priority>` : "",
      "  </url>",
    ].filter(Boolean).join("\n"));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>\n`;
};
