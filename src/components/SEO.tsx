import { useEffect } from "react";

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  ogType?: string;
  jsonLd?: object;
}

const SEO = ({ title, description, canonical, ogImage, ogType = "website", jsonLd }: SEOProps) => {
  useEffect(() => {
    document.title = title;

    const toAbsoluteUrl = (value?: string) => {
      if (!value) return undefined;
      try {
        return new URL(value, window.location.origin).toString();
      } catch {
        return value;
      }
    };

    const absoluteCanonical = toAbsoluteUrl(canonical || window.location.pathname);
    const absoluteOgImage = toAbsoluteUrl(ogImage);

    const setMeta = (name: string, content: string, property?: boolean) => {
      const attr = property ? "property" : "name";
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    setMeta("description", description);
    setMeta("og:title", title, true);
    setMeta("og:description", description, true);
    setMeta("og:type", ogType, true);
    if (absoluteCanonical) setMeta("og:url", absoluteCanonical, true);
    if (absoluteOgImage) {
      setMeta("og:image", absoluteOgImage, true);
      setMeta("og:image:secure_url", absoluteOgImage, true);
    }
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", title);
    setMeta("twitter:description", description);
    if (absoluteOgImage) setMeta("twitter:image", absoluteOgImage);

    // Canonical
    if (canonical) {
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
      if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.appendChild(link);
      }
      link.href = absoluteCanonical || canonical;
    }

    // JSON-LD
    if (jsonLd) {
      const id = "json-ld-seo";
      let script = document.getElementById(id) as HTMLScriptElement;
      if (!script) {
        script = document.createElement("script");
        script.id = id;
        script.type = "application/ld+json";
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(jsonLd);
    }

    return () => {
      const jsonScript = document.getElementById("json-ld-seo");
      if (jsonScript) jsonScript.remove();
    };
  }, [title, description, canonical, ogImage, ogType, jsonLd]);

  return null;
};

export default SEO;
