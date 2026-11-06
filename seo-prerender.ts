// Vite build plugin: writes crawlable HTML for every static page, so Google,
// WhatsApp, Facebook etc. see the real title, description, canonical, OG tags,
// JSON-LD, H1 and text without running JavaScript.
//   dist/index.html            → home page
//   dist/_seo/<page>.html      → /about, /courses, … (served by rewrites in vercel.json)
//   dist/_seo/shell.html       → every other SPA route (noindex) and the template the
//                                 server uses for /products/:id, /courses/:id, /classes/:id
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import {
  SITE_NAME,
  STATIC_PAGES,
  buildHeadTags,
  crawlerBody,
  escapeHtml,
  renderIntoTemplate,
  staticPageJsonLd,
  type ContactInfoForSeo,
} from "./api/_lib/seo";

const FIRESTORE = "https://firestore.googleapis.com/v1/projects/javani-181d5/databases/(default)/documents";

type Fields = Record<string, unknown>;
const value = (v: any): unknown => (v == null ? undefined : v.stringValue ?? v.booleanValue ?? (v.integerValue != null ? Number(v.integerValue) : undefined) ?? v.doubleValue ?? (v.arrayValue ? (v.arrayValue.values || []).map(value) : undefined));
const flatten = (doc: any): Fields & { id: string } => ({ id: String(doc.name).split("/").pop() || "", ...Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, value(v)])) });

const getJson = async (url: string) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

/** Public data only (the same Firestore reads the website does in the browser). Failures fall back to no data. */
const loadPublicData = async () => {
  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch (error) { console.warn(`[seo-prerender] ${(error as Error).message}`); return fallback; }
  };
  const list = (collection: string) => safe(async () => ((await getJson(`${FIRESTORE}/${collection}?pageSize=300`)).documents || []).map(flatten) as (Fields & { id: string })[], []);
  const [contact, products, courses, classes] = await Promise.all([
    safe(async () => flatten(await getJson(`${FIRESTORE}/siteSettings/contactInfo`)) as ContactInfoForSeo, undefined),
    list("products"),
    list("courses"),
    list("classes"),
  ]);
  return {
    contact,
    products: products.filter((p) => p.active !== false && p.name),
    courses: courses.filter((c) => c.status !== "inactive" && c.title),
    classes: classes.filter((c) => c.active === true && c.name),
  };
};

const linkList = (heading: string, items: { href: string; label: string }[]) => (items.length
  ? `<h2>${escapeHtml(heading)}</h2><ul>${items.map((i) => `<li><a href="${escapeHtml(i.href)}">${escapeHtml(i.label)}</a></li>`).join("")}</ul>`
  : "");

const contactHtml = (contact?: ContactInfoForSeo) => {
  if (!contact) return "";
  const rows = [
    contact.address ? `<p>Address: ${escapeHtml(contact.address)}</p>` : "",
    contact.phone ? `<p>Phone: <a href="tel:${escapeHtml(contact.phone.replace(/\s+/g, ""))}">${escapeHtml(contact.phone)}</a></p>` : "",
    contact.hours ? `<p>Hours: ${escapeHtml(contact.hours)}</p>` : "",
  ].join("");
  return rows ? `<section><h2>Visit ${SITE_NAME}</h2>${rows}</section>` : "";
};

export const seoPrerender = (): Plugin => {
  let outDir = "dist";
  return {
    name: "javani-seo-prerender",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const indexPath = path.join(outDir, "index.html");
      if (!fs.existsSync(indexPath)) return;
      const template = fs.readFileSync(indexPath, "utf8");
      const data = await loadPublicData();
      const seoDir = path.join(outDir, "_seo");
      fs.mkdirSync(seoDir, { recursive: true });

      const extraFor: Record<string, string> = {
        "/": linkList("Monthly classes", data.classes.map((c) => ({ href: `/classes/${c.id}`, label: String(c.name) }))) + contactHtml(data.contact),
        "/classes": linkList("Classes open for enrolment", data.classes.map((c) => ({ href: `/classes/${c.id}`, label: String(c.name) }))),
        "/courses": linkList("Courses", data.courses.map((c) => ({ href: `/courses/${c.id}`, label: String(c.title) }))),
        "/products": linkList("Products", data.products.map((p) => ({ href: `/products/${p.id}`, label: String(p.name) }))),
        "/contact": contactHtml(data.contact),
      };

      for (const page of STATIC_PAGES) {
        const head = buildHeadTags({ title: page.title, description: page.description, path: page.path, jsonLd: staticPageJsonLd(page, data.contact) });
        const body = crawlerBody({
          h1: page.h1,
          paragraphs: [page.intro],
          crumbs: page.path === "/" ? undefined : [{ name: page.crumb || page.h1, path: page.path }],
          extraHtml: extraFor[page.path],
        });
        const html = renderIntoTemplate(template, head, body);
        const file = page.path === "/" ? indexPath : path.join(seoDir, `${page.path.slice(1)}.html`);
        fs.writeFileSync(file, html);
      }

      const shellHead = buildHeadTags({ title: SITE_NAME, description: "Classical dance and music academy in Yapral, Secunderabad.", path: "/", noindex: true });
      fs.writeFileSync(path.join(seoDir, "shell.html"), renderIntoTemplate(template, shellHead));
      console.log(`[seo-prerender] wrote ${STATIC_PAGES.length} pages + shell (classes ${data.classes.length}, courses ${data.courses.length}, products ${data.products.length}, contact ${data.contact ? "yes" : "no"})`);
    },
  };
};
