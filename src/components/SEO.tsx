import { useEffect } from "react";
import {
  DEFAULT_OG_IMAGE,
  JSON_LD_ID,
  SITE_LOCALE,
  SITE_NAME,
  canonicalUrl,
  getStaticPage,
  isPrivatePath,
  ogImageUrl,
  staticPageJsonLd,
  toMetaDescription,
  type ContactInfoForSeo,
} from "../../api/_lib/seo";

interface SEOProps {
  title: string;
  description: string;
  /** Path or absolute URL. Defaults to the current path on www.javanilife.com. */
  canonical?: string;
  ogImage?: string;
  ogType?: string;
  jsonLd?: object;
  /** Force noindex. Private routes (/admin, /account, /cart…) are noindex automatically. */
  noindex?: boolean;
}

const setMeta = (name: string, content: string, property?: boolean) => {
  const attr = property ? "property" : "name";
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = content;
};

const removeMeta = (selector: string) => document.querySelectorAll(selector).forEach((el) => el.remove());

const SEO = ({ title, description, canonical, ogImage, ogType = "website", jsonLd, noindex }: SEOProps) => {
  useEffect(() => {
    const path = window.location.pathname;
    const blocked = noindex || isPrivatePath(path);
    const url = canonical && /^https?:\/\//.test(canonical) ? canonical : canonicalUrl(canonical || path);
    const image = ogImageUrl(ogImage);
    const desc = toMetaDescription(description, 160);

    document.title = title;
    setMeta("description", desc);
    setMeta("robots", blocked ? "noindex, nofollow" : "index, follow, max-image-preview:large");
    setMeta("og:site_name", SITE_NAME, true);
    setMeta("og:locale", SITE_LOCALE, true);
    setMeta("og:title", title, true);
    setMeta("og:description", desc, true);
    setMeta("og:type", ogType, true);
    setMeta("og:image", image, true);
    setMeta("og:image:secure_url", image, true);
    if (image === DEFAULT_OG_IMAGE) {
      setMeta("og:image:width", "1200", true);
      setMeta("og:image:height", "630", true);
    } else {
      removeMeta('meta[property="og:image:width"], meta[property="og:image:height"]');
    }
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", title);
    setMeta("twitter:description", desc);
    setMeta("twitter:image", image);

    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (blocked) {
      link?.remove();
      removeMeta('meta[property="og:url"]');
    } else {
      if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.appendChild(link);
      }
      link.href = url;
      setMeta("og:url", url, true);
    }

    let script = document.getElementById(JSON_LD_ID) as HTMLScriptElement | null;
    if (jsonLd && !blocked) {
      if (!script) {
        script = document.createElement("script");
        script.id = JSON_LD_ID;
        script.type = "application/ld+json";
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(jsonLd);
    } else {
      script?.remove();
    }

    return () => {
      document.getElementById(JSON_LD_ID)?.remove();
    };
  }, [title, description, canonical, ogImage, ogType, jsonLd, noindex]);

  return null;
};

/** SEO for a static page, from the shared list in api/_lib/seo.ts (same data the build prerenders). */
export const PageSEO = ({ path, contact, ogImage }: { path: string; contact?: ContactInfoForSeo; ogImage?: string }) => {
  const page = getStaticPage(path);
  if (!page) throw new Error(`No SEO entry for ${path} in api/_lib/seo.ts`);
  return <SEO title={page.title} description={page.description} canonical={page.path} ogImage={ogImage} jsonLd={staticPageJsonLd(page, contact)} />;
};

export default SEO;
