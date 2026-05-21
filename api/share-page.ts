import { getFirebaseAdminDb } from "./_lib/firebase-admin.js";
import { sendError, type ApiRequest, type ApiResponse } from "./_lib/http.js";
import {
  createSocialShareHtml,
  getSharePageCollection,
  getSharePageDescription,
  getSharePageImage,
  getSharePageTargetPath,
  getSharePageTitle,
  resolveShareImageUrl,
  type ShareDocumentData,
  type SharePageType,
} from "./_lib/share-page.js";

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

const isSharePageType = (type: string): type is SharePageType => type === "product" || type === "course";

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

export default async function handler(request: SharePageRequest, response: HtmlApiResponse) {
  if (request.method && !["GET", "HEAD"].includes(request.method)) {
    response.setHeader?.("Allow", "GET, HEAD");
    sendError(response, 405, "Method not allowed");
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
    const previewUrl = new URL(`/share/${type === "product" ? "products" : "courses"}/${encodeURIComponent(id)}`, origin).toString();
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