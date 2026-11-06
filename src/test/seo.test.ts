import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  STATIC_PAGES,
  buildHeadTags,
  canonicalUrl,
  isPrivatePath,
  optimizeImageUrl,
  organizationJsonLd,
  parseIndianAddress,
  parseOpeningHours,
  productJsonLd,
  renderIntoTemplate,
  toMetaDescription,
} from "../../api/_lib/seo";
import { isTrustedHost, renderDetailPage, renderSitemap } from "../../api/_lib/seo-pages";

const root = path.resolve(__dirname, "../..");
const template = fs.readFileSync(path.join(root, "index.html"), "utf8").replace('<div id="root"></div>', '<div id="root"></div>');
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const contact = {
  phone: "+91 9030200263",
  email: "seva@javanilife.com, spiritualhub@javanilife.com",
  hours: "Mon-Sat: 5:30 AM - 8:00 PM",
  address: "JAVANI SPIRITUAL HUB, Plot # 7&8, Raghava Kalyan Estate, Chandragiri Colony, Yapral, Secunderabad, Telangana 500087",
  instagramUrl: "",
};

describe("static page meta", () => {
  it.each(STATIC_PAGES.map((p) => [p.path, p] as const))("%s has a title ≤ 60 chars (brand last) and a 140-160 char description", (_path, page) => {
    expect(page.title.length).toBeLessThanOrEqual(60);
    expect(page.title.endsWith("| Javani Spiritual Hub")).toBe(true);
    expect(page.description.length).toBeGreaterThanOrEqual(140);
    expect(page.description.length).toBeLessThanOrEqual(160);
  });

  it("has unique titles and descriptions", () => {
    expect(new Set(STATIC_PAGES.map((p) => p.title)).size).toBe(STATIC_PAGES.length);
    expect(new Set(STATIC_PAGES.map((p) => p.description)).size).toBe(STATIC_PAGES.length);
  });
});

describe("vercel.json routing", () => {
  const rewrites: { source: string; destination: string }[] = vercel.rewrites;
  const catchAllIndex = rewrites.findIndex((r) => r.source.startsWith("/((?!api/"));

  it("keeps the SPA catch-all last and points it at the noindex shell", () => {
    expect(catchAllIndex).toBe(rewrites.length - 1);
    expect(rewrites[catchAllIndex].destination).toBe("/_seo/shell.html");
  });

  it("serves every static page from its prerendered file", () => {
    for (const page of STATIC_PAGES.filter((p) => p.path !== "/")) {
      expect(rewrites).toContainEqual({ source: page.path, destination: `/_seo/${page.path.slice(1)}.html` });
    }
  });

  it("routes the sitemap and detail pages to the existing share-page function", () => {
    expect(rewrites).toContainEqual({ source: "/sitemap.xml", destination: "/api/share-page?mode=sitemap" });
    for (const [slug, type] of [["products", "product"], ["courses", "course"], ["classes", "class"]]) {
      expect(rewrites).toContainEqual({ source: `/${slug}/:id`, destination: `/api/share-page?mode=page&type=${type}&id=:id` });
    }
    expect(vercel.trailingSlash).toBe(false);
  });

  it("does not add a new serverless function (Hobby limit 12)", () => {
    const functions = fs.readdirSync(path.join(root, "api")).filter((f) => /\.(ts|js)$/.test(f));
    expect(functions.length).toBeLessThanOrEqual(12);
  });
});

describe("robots.txt", () => {
  const robots = fs.readFileSync(path.join(root, "public/robots.txt"), "utf8");
  it("lists the sitemap and blocks private areas", () => {
    expect(robots).toContain("Sitemap: https://www.javanilife.com/sitemap.xml");
    for (const p of ["/admin", "/account", "/cart", "/checkout", "/api/", "/_seo/"]) expect(robots).toContain(`Disallow: ${p}`);
  });
});

describe("helpers", () => {
  it("normalises canonicals to the www host without trailing slash", () => {
    expect(canonicalUrl("/about/")).toBe("https://www.javanilife.com/about");
    expect(canonicalUrl("/")).toBe("https://www.javanilife.com/");
    expect(canonicalUrl("/courses?x=1")).toBe("https://www.javanilife.com/courses");
  });

  it("marks private routes", () => {
    expect(isPrivatePath("/admin/products")).toBe(true);
    expect(isPrivatePath("/account")).toBe(true);
    expect(isPrivatePath("/pay/abc")).toBe(true);
    expect(isPrivatePath("/products")).toBe(false);
    expect(isPrivatePath("/partnership")).toBe(false);
  });

  it("trims descriptions at a word boundary", () => {
    const text = "word ".repeat(80);
    const out = toMetaDescription(text, 160);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith("…")).toBe(true);
    expect(toMetaDescription("<p>Hello <b>dance</b></p>")).toBe("Hello dance");
  });

  it("adds Cloudinary resize params once and leaves other URLs alone", () => {
    const raw = "https://res.cloudinary.com/dxeyhsuyr/image/upload/v123/hero.jpg";
    expect(optimizeImageUrl(raw, 800)).toBe("https://res.cloudinary.com/dxeyhsuyr/image/upload/f_auto,q_auto,c_limit,w_800/v123/hero.jpg");
    expect(optimizeImageUrl(optimizeImageUrl(raw, 800), 400)).toBe(optimizeImageUrl(raw, 800));
    expect(optimizeImageUrl("https://example.com/a.jpg", 800)).toBe("https://example.com/a.jpg");
  });

  it("parses the real address and opening hours", () => {
    expect(parseIndianAddress(contact.address)).toEqual({
      "@type": "PostalAddress",
      streetAddress: "Plot # 7&8, Raghava Kalyan Estate, Chandragiri Colony, Yapral",
      addressLocality: "Secunderabad",
      addressRegion: "Telangana",
      postalCode: "500087",
      addressCountry: "IN",
    });
    expect(parseOpeningHours(contact.hours)).toEqual(["Mo-Sa 05:30-20:00"]);
    expect(parseOpeningHours("By appointment")).toBeUndefined();
  });

  it("only trusts our own hosts for the template fetch", () => {
    expect(isTrustedHost("www.javanilife.com")).toBe(true);
    expect(isTrustedHost("javani-sprirtual-abc.vercel.app")).toBe(true);
    expect(isTrustedHost("evil.com")).toBe(false);
    expect(isTrustedHost("www.javanilife.com.evil.com")).toBe(false);
  });
});

describe("structured data", () => {
  it("organization uses real NAP, the right domain, and never ratings", () => {
    const org = organizationJsonLd(contact);
    const json = JSON.stringify(org);
    expect(org.url).toBe("https://www.javanilife.com/");
    expect(org.telephone).toBe("+91 9030200263");
    expect(org.email).toBe("seva@javanilife.com");
    expect(json).not.toMatch(/javaniarts/i);
    expect(json).not.toContain("aggregateRating");
    expect(org).not.toHaveProperty("sameAs");
  });

  it("product has an INR offer with availability from stock status", () => {
    const p = productJsonLd({ id: "p1", name: "Practice Saree", images: ["https://res.cloudinary.com/dxeyhsuyr/image/upload/v1/s.jpg"], amountInPaise: 149900, stockStatus: "out-of-stock" });
    expect(p.offers).toMatchObject({ "@type": "Offer", priceCurrency: "INR", price: "1499.00", availability: "https://schema.org/OutOfStock" });
    expect(JSON.stringify(p)).not.toMatch(/aggregateRating|"review"/);
  });

  it("product without a price has no offer (Google rejects an offer with no price)", () => {
    expect(productJsonLd({ id: "p2", name: "On request", images: [] })).not.toHaveProperty("offers");
  });
});

describe("HTML rendering", () => {
  it("index.html has the head markers", () => {
    expect(() => renderIntoTemplate(template, buildHeadTags({ title: "T", description: "D", path: "/" }))).not.toThrow();
  });

  it("renders a product page with canonical, OG, JSON-LD, H1 and escaped text", () => {
    const { status, html } = renderDetailPage(template, "product", "p1", {
      name: 'Ghungroo "Brass" <Set>', active: true, amountInPaise: 99900, description: "Bells & cords for practice.", images: ["https://res.cloudinary.com/dxeyhsuyr/image/upload/v1/g.jpg"],
    });
    expect(status).toBe(200);
    expect(html).toContain('<link rel="canonical" href="https://www.javanilife.com/products/p1">');
    expect(html).toContain("<h1>Ghungroo &quot;Brass&quot; &lt;Set&gt;</h1>");
    expect(html).toContain('"@type":"Product"');
    expect(html).toContain('content="index, follow');
    expect(html).toContain("og:image\" content=\"https://res.cloudinary.com/dxeyhsuyr/image/upload/c_fill,w_1200,h_630,q_auto,f_jpg/v1/g.jpg");
    expect((html.match(/<title>/g) || []).length).toBe(1);
    expect(html).not.toContain("<Set>");
  });

  it("returns 404 + noindex for missing or inactive items", () => {
    for (const [type, data] of [["product", null], ["product", { name: "x", active: false }], ["class", { name: "y", active: false }], ["course", { title: "z", status: "inactive" }]] as const) {
      const { status, html } = renderDetailPage(template, type, "id1", data);
      expect(status).toBe(404);
      expect(html).toContain('content="noindex, nofollow"');
      expect(html).not.toContain('rel="canonical"');
    }
  });

  it("renders a class page with a Course schema and its fee", () => {
    const { html } = renderDetailPage(template, "class", "c1", { name: "Kuchipudi Grades", active: true, monthlyFeeInPaise: 150000, description: "" });
    expect(html).toContain('"@type":"Course"');
    expect(html).toContain("Monthly fee: ₹1,500");
    expect(html).toContain("<title>Kuchipudi Grades Classes | Javani Spiritual Hub</title>");
  });
});

describe("sitemap", () => {
  it("lists static pages and only public items, with lastmod", () => {
    const xml = renderSitemap([
      { type: "class", id: "c1", data: { name: "A", active: true }, updated: new Date("2026-11-01T10:00:00Z") },
      { type: "class", id: "c2", data: { name: "B", active: false } },
      { type: "product", id: "p1", data: { name: "C" } },
      { type: "course", id: "k1", data: { title: "D", status: "inactive" } },
    ]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<loc>https://www.javanilife.com/</loc>");
    expect(xml).toContain("<loc>https://www.javanilife.com/about</loc>");
    expect(xml).toContain("<loc>https://www.javanilife.com/classes/c1</loc>\n    <lastmod>2026-11-01</lastmod>");
    expect(xml).toContain("<loc>https://www.javanilife.com/products/p1</loc>");
    expect(xml).not.toContain("/classes/c2");
    expect(xml).not.toContain("/courses/k1");
    expect(xml).not.toContain("/admin");
  });
});
