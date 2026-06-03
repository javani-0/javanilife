interface CreateShareUrlOptions {
  origin: string;
  url: string;
}

const sharePreviewRoutes: Array<{ source: RegExp; destination: string }> = [
  { source: /^\/products\/([^/?#]+)\/?$/i, destination: "/share/products" },
  { source: /^\/courses\/([^/?#]+)\/?$/i, destination: "/share/courses" },
  { source: /^\/classes\/([^/?#]+)\/?$/i, destination: "/share/classes" },
];

export const getSharePreviewPath = (url: string) => {
  if (!url.startsWith("/")) return url;

  const parsedUrl = new URL(url, "https://javani.local");
  const route = sharePreviewRoutes.find(({ source }) => source.test(parsedUrl.pathname));
  if (!route) return url;

  const match = parsedUrl.pathname.match(route.source);
  const itemId = match?.[1];
  if (!itemId) return url;

  return `${route.destination}/${itemId}${parsedUrl.search}${parsedUrl.hash}`;
};

export const createShareUrl = ({ origin, url }: CreateShareUrlOptions) => {
  const sharePath = getSharePreviewPath(url);
  if (!sharePath.startsWith("/")) return sharePath;
  return new URL(sharePath, origin).toString();
};