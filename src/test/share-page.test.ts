import { describe, expect, it } from "vitest";
import { createSocialShareHtml, resolveShareImageUrl } from "../../api/_lib/share-page";

describe("social share preview pages", () => {
  it("renders server-readable Open Graph and Twitter image tags", () => {
    const html = createSocialShareHtml({
      title: "Blue Practice Saree",
      description: "A practice saree for dancers.",
      imageUrl: "https://cdn.example.com/product.jpg",
      targetUrl: "https://www.javanilife.com/products/product-123",
      previewUrl: "https://www.javanilife.com/share/products/product-123",
      siteName: "Javani Spiritual Hub",
    });

    expect(html).toContain('<meta property="og:title" content="Blue Practice Saree"');
    expect(html).toContain('<meta property="og:image" content="https://cdn.example.com/product.jpg"');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
    expect(html).toContain('<meta name="twitter:image" content="https://cdn.example.com/product.jpg"');
    expect(html).toContain('window.location.replace("https://www.javanilife.com/products/product-123")');
  });

  it("escapes shared content before writing it into HTML", () => {
    const html = createSocialShareHtml({
      title: 'Dance "Special" <Course>',
      description: "Learn & perform <today>",
      imageUrl: "https://cdn.example.com/course.jpg",
      targetUrl: "https://www.javanilife.com/courses/course-123",
      previewUrl: "https://www.javanilife.com/share/courses/course-123",
      siteName: "Javani Spiritual Hub",
    });

    expect(html).toContain("Dance &quot;Special&quot; &lt;Course&gt;");
    expect(html).toContain("Learn &amp; perform &lt;today&gt;");
  });

  it("resolves relative and protocol-relative images to absolute URLs", () => {
    expect(resolveShareImageUrl("/assets/product.jpg", "https://www.javanilife.com")).toBe("https://www.javanilife.com/assets/product.jpg");
    expect(resolveShareImageUrl("//cdn.example.com/product.jpg", "https://www.javanilife.com")).toBe("https://cdn.example.com/product.jpg");
    expect(resolveShareImageUrl("https://cdn.example.com/product.jpg", "https://www.javanilife.com")).toBe("https://cdn.example.com/product.jpg");
  });
});