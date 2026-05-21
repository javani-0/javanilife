interface CreateShareUrlOptions {
  origin: string;
  url: string;
}

// Social crawlers (WhatsApp, Facebook, etc.) are served OG meta tags via a
// Vercel User-Agent rewrite on the actual /products/:id and /courses/:id URLs,
// so no /share/ redirect is needed. Just share the canonical URL directly.
export const getSharePreviewPath = (url: string) => url;

export const createShareUrl = ({ origin, url }: CreateShareUrlOptions) => {
  if (!url.startsWith("/")) return url;
  return new URL(url, origin).toString();
};