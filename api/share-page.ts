import { getFirebaseAdminDb } from "./_lib/firebase-admin.js";
import { sendError, type ApiRequest, type ApiResponse } from "./_lib/http.js";
import {
  createSocialShareHtml,
  getSharePageCollection,
  getSharePageDescription,
  getSharePageImage,
  getSharePageSlug,
  getSharePageTargetPath,
  getSharePageTitle,
  resolveShareImageUrl,
  type ShareDocumentData,
  type SharePageType,
} from "./_lib/share-page.js";
import { SEO_COLLECTIONS, isSeoDetailType, isTrustedHost, renderDetailPage, renderSitemap, type SitemapDoc } from "./_lib/seo-pages.js";
import { SITE_URL } from "./_lib/seo.js";

interface SharePageRequest extends ApiRequest {
  query?: Record<string, string | string[] | undefined>;
  url?: string;
}

interface HtmlApiResponse extends ApiResponse {
  end?: (body: string) => void;
  send?: (body: string) => void;
}

const siteName = "Javani Spiritual Hub";

const getHeader = (request: ApiRequest, name: string) => {
  const value = request.headers[name] || request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const getOrigin = (request: ApiRequest) => {
  // Use the actual request host first — this is the domain the visitor used,
  // so the redirect lands on the same domain they came from (e.g. www.javanilife.com).
  const protocol = getHeader(request, "x-forwarded-proto") || "https";
  const host = getHeader(request, "x-forwarded-host") || getHeader(request, "host");
  if (host) return `${protocol}://${host}`.replace(/\/+$/, "");

  // Fall back to explicit env var, then Vercel deployment URL, then localhost.
  const configuredOrigin = process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || process.env.VITE_SITE_URL || process.env.SITE_URL;
  if (configuredOrigin) return configuredOrigin.replace(/\/+$/, "");

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  return "http://localhost:8080";
};

const getQueryValue = (request: SharePageRequest, key: string) => {
  const queryValue = request.query?.[key];
  if (Array.isArray(queryValue)) return queryValue[0] || "";
  if (queryValue) return queryValue;

  const origin = getOrigin(request);
  const requestUrl = new URL(request.url || "/", origin);
  return requestUrl.searchParams.get(key) || "";
};

const isSharePageType = (type: string): type is SharePageType => type === "product" || type === "course" || type === "class";

const sendHtml = (response: HtmlApiResponse, html: string) => {
  response.setHeader?.("Content-Type", "text/html; charset=utf-8");
  response.setHeader?.("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
  response.status(200);

  if (response.send) {
    response.send(html);
    return;
  }

  response.end?.(html);
};

// Social media crawlers that need the OG HTML preview page.
// Real browsers get an instant 302 redirect instead.
const CRAWLER_PATTERNS = [
  /facebookexternalhit/i,
  /twitterbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /linkedinbot/i,
  /slackbot/i,
  /discordbot/i,
  /googlebot/i,
  /bingbot/i,
  /applebot/i,
  /pinterest/i,
  /vkshare/i,
  /rogerbot/i,
  /embedly/i,
  /quora link preview/i,
  /showyoubot/i,
  /outbrain/i,
  /semrushbot/i,
  /ahrefsbot/i,
];

const isSocialCrawler = (request: ApiRequest) => {
  const ua = getHeader(request, "user-agent") || "";
  return CRAWLER_PATTERNS.some((pattern) => pattern.test(ua));
};


// ---------- SEO: /sitemap.xml and server-rendered /products/:id, /courses/:id, /classes/:id ----------
// Folded into this function on purpose: the project is at the 12-function Hobby limit.

const EDGE_CACHE = "public, max-age=0, s-maxage=600, stale-while-revalidate=86400";
const TEMPLATE_TTL_MS = 10 * 60 * 1000;
let templateCache: { origin: string; html: string; at: number } | null = null;

const getTemplate = async (request: ApiRequest) => {
  const host = getHeader(request, "x-forwarded-host") || getHeader(request, "host") || "";
  const origin = isTrustedHost(host) ? `${/^localhost/i.test(host) ? "http" : "https"}://${host}` : SITE_URL;
  if (templateCache && templateCache.origin === origin && Date.now() - templateCache.at < TEMPLATE_TTL_MS) return templateCache.html;
  const res = await fetch(`${origin}/_seo/shell.html`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`shell template ${res.status}`);
  const html = await res.text();
  templateCache = { origin, html, at: Date.now() };
  return html;
};

const send = (response: HtmlApiResponse, status: number, contentType: string, body: string, cache: string) => {
  response.setHeader?.("Content-Type", contentType);
  response.setHeader?.("Cache-Control", cache);
  response.status(status);
  if (response.send) response.send(body);
  else response.end?.(body);
};

const handleSitemap = async (response: HtmlApiResponse) => {
  const db = getFirebaseAdminDb();
  const [products, courses, classes] = await Promise.all([
    db.collection("products").select("active", "name").get(),
    db.collection("courses").select("status", "title").get(),
    db.collection("classes").where("active", "==", true).select("active", "name").get(),
  ]);
  const docs: SitemapDoc[] = [
    ...products.docs.map((d) => ({ type: "product" as const, id: d.id, data: d.data(), updated: d.updateTime?.toDate() })),
    ...courses.docs.map((d) => ({ type: "course" as const, id: d.id, data: d.data(), updated: d.updateTime?.toDate() })),
    ...classes.docs.map((d) => ({ type: "class" as const, id: d.id, data: d.data(), updated: d.updateTime?.toDate() })),
  ];
  send(response, 200, "application/xml; charset=utf-8", renderSitemap(docs), "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
};

const handleDetailPage = async (request: SharePageRequest, response: HtmlApiResponse) => {
  const type = getQueryValue(request, "type");
  const id = getQueryValue(request, "id");
  if (!isSeoDetailType(type) || !id || id.length > 200 || id.includes("/")) {
    const template = await getTemplate(request);
    const result = renderDetailPage(template, "product", id || "unknown", null);
    send(response, 404, "text/html; charset=utf-8", result.html, EDGE_CACHE);
    return;
  }
  const template = await getTemplate(request);
  let data: Record<string, unknown> | null = null;
  try {
    const snapshot = await getFirebaseAdminDb().collection(SEO_COLLECTIONS[type]).doc(id).get();
    data = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : null;
  } catch (error) {
    // Database trouble must not break the page for visitors: serve the plain app shell (noindex), not cached.
    console.error("SEO detail lookup failed", error);
    send(response, 200, "text/html; charset=utf-8", template, "no-store");
    return;
  }
  const result = renderDetailPage(template, type, id, data);
  send(response, result.status, "text/html; charset=utf-8", result.html, EDGE_CACHE);
};

export default async function handler(request: SharePageRequest, response: HtmlApiResponse) {
  if (request.method && !["GET", "HEAD"].includes(request.method)) {
    response.setHeader?.("Allow", "GET, HEAD");
    sendError(response, 405, "Method not allowed");
    return;
  }

  const mode = getQueryValue(request, "mode");
  if (mode === "sitemap" || mode === "page") {
    try {
      if (mode === "sitemap") await handleSitemap(response);
      else await handleDetailPage(request, response);
    } catch (error) {
      console.error(`SEO ${mode} failed`, error);
      sendError(response, 503, "Temporarily unavailable");
    }
    return;
  }

  const type = getQueryValue(request, "type");
  const id = getQueryValue(request, "id");

  if (!isSharePageType(type) || !id) {
    sendError(response, 400, "Invalid share page request");
    return;
  }

  try {
    const origin = getOrigin(request);
    const targetPath = getSharePageTargetPath(type, id);
    const targetUrl = new URL(targetPath, origin).toString();

    // Real browser click — instant redirect, no HTML page, no flash.
    if (!isSocialCrawler(request)) {
      response.setHeader?.("Cache-Control", "no-store");
      response.setHeader?.("Location", targetUrl);
      response.status(302).end?.();
      return;
    }

    // Social crawler — serve the full OG meta HTML for the preview card.
    const previewUrl = new URL(`/share/${getSharePageSlug(type)}/${encodeURIComponent(id)}`, origin).toString();
    const snapshot = await getFirebaseAdminDb().collection(getSharePageCollection(type)).doc(id).get();

    if (!snapshot.exists) {
      sendError(response, 404, "Shared item not found");
      return;
    }

    const data = snapshot.data() as ShareDocumentData;
    const imageUrl = resolveShareImageUrl(getSharePageImage(data), origin);
    const html = createSocialShareHtml({
      title: getSharePageTitle(type, data),
      description: getSharePageDescription(data),
      imageUrl,
      targetUrl,
      previewUrl,
      siteName,
    });

    sendHtml(response, html);
  } catch (error) {
    console.error("Unable to render share page", error);
    sendError(response, 500, "Unable to render share page");
  }
}