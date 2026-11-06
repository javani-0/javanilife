// Pure helpers for server-rendered SEO HTML of /products/:id, /courses/:id, /classes/:id
// and for /sitemap.xml. No Firebase imports, so they are unit-tested in src/test/seo.test.ts.
import {
  SITE_NAME,
  STATIC_PAGES,
  breadcrumbJsonLd,
  buildHeadTags,
  buildSitemapXml,
  courseJsonLd,
  crawlerBody,
  escapeHtml,
  graph,
  productJsonLd,
  renderIntoTemplate,
  toMetaDescription,
  type SitemapEntry,
} from "./seo.js";

export type SeoDetailType = "product" | "course" | "class";
export type SeoDoc = Record<string, unknown>;

export const SEO_COLLECTIONS: Record<SeoDetailType, string> = { product: "products", course: "courses", class: "classes" };
const SLUGS: Record<SeoDetailType, string> = { product: "products", course: "courses", class: "classes" };

export const isSeoDetailType = (value: string): value is SeoDetailType => value === "product" || value === "course" || value === "class";

/** Same visibility rules the website uses when listing items. */
export const isPublicDoc = (type: SeoDetailType, data: SeoDoc | undefined | null) => {
  if (!data) return false;
  if (type === "product") return data.active !== false && !!data.name;
  if (type === "course") return data.status !== "inactive" && !!data.title;
  return data.active === true && !!data.name;
};

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const paise = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined);
const rupees = (amountInPaise: number) => `₹${(amountInPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const imagesOf = (data: SeoDoc) => {
  const list = Array.isArray(data.images) ? data.images.filter((i): i is string => typeof i === "string" && !!i) : [];
  const single = str(data.image);
  return list.length ? list : single ? [single] : [];
};

export const detailPath = (type: SeoDetailType, id: string) => `/${SLUGS[type]}/${encodeURIComponent(id)}`;

export interface DetailRender { status: 200 | 404; html: string }

export const renderDetailPage = (template: string, type: SeoDetailType, id: string, data: SeoDoc | null | undefined): DetailRender => {
  const path = detailPath(type, id);
  if (!isPublicDoc(type, data)) {
    const head = buildHeadTags({ title: `Not found | ${SITE_NAME}`, description: "This page is not available.", path, noindex: true });
    const listing = `/${SLUGS[type]}`;
    const body = crawlerBody({ h1: "Not found", paragraphs: ["This page may have been removed or is no longer available."], extraHtml: `<p><a href="${listing}">See all ${SLUGS[type]}</a></p>` });
    return { status: 404, html: renderIntoTemplate(template, head, body) };
  }

  const doc = data as SeoDoc;
  const images = imagesOf(doc);
  const longText = str(doc.description) || str(doc.shortDescription);
  const listingName = type === "product" ? "Products" : type === "course" ? "Courses" : "Classes";
  const listingPath = `/${SLUGS[type]}`;

  if (type === "product") {
    const name = str(doc.name);
    const amount = paise(doc.amountInPaise);
    const priceText = str(doc.displayPrice) || str(doc.price) || (amount ? rupees(amount) : "");
    const description = toMetaDescription(str(doc.shortDescription) || longText || `Buy ${name} online from ${SITE_NAME}, Secunderabad.`);
    const jsonLd = graph(
      productJsonLd({ id, name, description: longText, images, amountInPaise: amount, sku: str(doc.sku) || undefined, stockStatus: str(doc.stockStatus) || undefined, category: str(doc.categoryLabel) || undefined }),
      breadcrumbJsonLd([{ name: listingName, path: listingPath }, { name, path }]),
    );
    const head = buildHeadTags({ title: `${name} | Buy Online | ${SITE_NAME}`, description, path, image: images[0], imageAlt: name, type: "product", jsonLd });
    const body = crawlerBody({
      h1: name,
      crumbs: [{ name: listingName, path: listingPath }, { name, path }],
      image: images[0] ? { src: images[0], alt: name } : undefined,
      paragraphs: [priceText ? `Price: ${priceText}` : "", longText],
    });
    return { status: 200, html: renderIntoTemplate(template, head, body) };
  }

  const name = type === "course" ? str(doc.title) : str(doc.name);
  const fee = paise(doc.monthlyFeeInPaise);
  const facts = type === "class"
    ? [str(doc.ageGroup) ? `Age group: ${str(doc.ageGroup)}` : "", str(doc.facultyName) ? `Faculty: ${str(doc.facultyName)}` : "", fee ? `Monthly fee: ${rupees(fee)}` : ""].filter(Boolean).join(" · ")
    : [str(doc.category), str(doc.badge)].filter(Boolean).join(" · ");
  const fallback = type === "class"
    ? `Enrol in ${name} monthly classes at ${SITE_NAME}, Yapral, Secunderabad. Enrol online and pay the class fee monthly.`
    : `${name} course at ${SITE_NAME}, Secunderabad.`;
  const description = toMetaDescription(longText || fallback);
  const title = type === "class" ? `${name} Classes | ${SITE_NAME}` : `${name} Course | ${SITE_NAME}`;
  const jsonLd = graph(
    courseJsonLd({ path, name, description: longText, image: images[0] }),
    breadcrumbJsonLd([{ name: listingName, path: listingPath }, { name, path }]),
  );
  const head = buildHeadTags({ title, description, path, image: images[0], imageAlt: name, jsonLd });
  const body = crawlerBody({
    h1: name,
    crumbs: [{ name: listingName, path: listingPath }, { name, path }],
    image: images[0] ? { src: images[0], alt: name } : undefined,
    paragraphs: [facts, longText || fallback],
  });
  return { status: 200, html: renderIntoTemplate(template, head, body) };
};

export interface SitemapDoc { type: SeoDetailType; id: string; data: SeoDoc; updated?: Date }

export const renderSitemap = (docs: SitemapDoc[]) => {
  const entries: SitemapEntry[] = STATIC_PAGES.map((p) => ({ path: p.path, changefreq: p.changefreq, priority: p.priority }));
  for (const d of docs) {
    if (!isPublicDoc(d.type, d.data)) continue;
    entries.push({
      path: detailPath(d.type, d.id),
      lastmod: d.updated && !Number.isNaN(d.updated.getTime()) ? d.updated.toISOString().slice(0, 10) : undefined,
      changefreq: "weekly",
      priority: d.type === "product" ? 0.6 : 0.7,
    });
  }
  return buildSitemapXml(entries);
};

/** Hosts we trust for fetching our own static template (never an arbitrary Host header). */
export const isTrustedHost = (host: string) => /^(www\.)?javanilife\.com$/i.test(host) || /^[a-z0-9-]+\.vercel\.app$/i.test(host) || /^localhost(:\d+)?$/i.test(host);

export { escapeHtml };
