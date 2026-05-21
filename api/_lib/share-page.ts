export interface SocialShareHtmlInput {
  title: string;
  description: string;
  imageUrl: string;
  targetUrl: string;
  previewUrl: string;
  siteName: string;
}

export interface ShareDocumentData {
  name?: unknown;
  title?: unknown;
  shortDescription?: unknown;
  description?: unknown;
  image?: unknown;
  images?: unknown;
  thumbnail?: unknown;
  coverImage?: unknown;
}

export type SharePageType = "product" | "course";

export const defaultSocialShareImageUrl = "https://storage.googleapis.com/gpt-engineer-file-uploads/ZMQ3Ng6WbiRxr5JyCkn0LjomTk12/social-images/social-1771669806007-ChatGPT_Image_Feb_21,_2026,_03_59_53_PM.webp";

const htmlEntities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => htmlEntities[character]);

const getTextValue = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const resolveShareImageUrl = (imageUrl: string | undefined, origin: string) => {
  const trimmedImageUrl = imageUrl?.trim();
  if (!trimmedImageUrl) return defaultSocialShareImageUrl;
  if (trimmedImageUrl.startsWith("//")) return `https:${trimmedImageUrl}`;

  try {
    return new URL(trimmedImageUrl, origin).toString();
  } catch {
    return defaultSocialShareImageUrl;
  }
};

export const getSharePageCollection = (type: SharePageType) => (type === "product" ? "products" : "courses");

export const getSharePageTargetPath = (type: SharePageType, id: string) => {
  const encodedId = encodeURIComponent(id);
  return type === "product" ? `/products/${encodedId}` : `/courses/${encodedId}`;
};

export const getSharePageTitle = (type: SharePageType, data: ShareDocumentData) => {
  const title = type === "product" ? getTextValue(data.name) : getTextValue(data.title);
  return title || "Javani Spiritual Hub";
};

export const getSharePageDescription = (data: ShareDocumentData) => (
  getTextValue(data.shortDescription)
  || getTextValue(data.description)
  || "Explore curated products and courses from Javani Spiritual Hub."
);

export const getSharePageImage = (data: ShareDocumentData) => {
  const imageCandidates = [
    getTextValue(data.image),
    ...(Array.isArray(data.images) ? data.images.map(getTextValue) : []),
    getTextValue(data.thumbnail),
    getTextValue(data.coverImage),
  ];

  return imageCandidates.find(Boolean) || defaultSocialShareImageUrl;
};

export const createSocialShareHtml = ({ title, description, imageUrl, targetUrl, previewUrl, siteName }: SocialShareHtmlInput) => {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeImageUrl = escapeHtml(imageUrl);
  const safeTargetUrl = escapeHtml(targetUrl);
  const safePreviewUrl = escapeHtml(previewUrl);
  const safeSiteName = escapeHtml(siteName);
  const redirectScriptUrl = JSON.stringify(targetUrl).replace(/</g, "\\u003C");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}">
  <link rel="canonical" href="${safeTargetUrl}">
  <meta property="og:site_name" content="${safeSiteName}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:url" content="${safeTargetUrl}">
  <meta property="og:image" content="${safeImageUrl}">
  <meta property="og:image:secure_url" content="${safeImageUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  <meta name="twitter:image" content="${safeImageUrl}">
  <meta name="share-preview-url" content="${safePreviewUrl}">
  <meta http-equiv="refresh" content="0;url=${safeTargetUrl}">
  <script>window.location.replace(${redirectScriptUrl});</script>
</head>
<body>
  <noscript><meta http-equiv="refresh" content="0;url=${safeTargetUrl}"></noscript>
</body>
</html>`;
};