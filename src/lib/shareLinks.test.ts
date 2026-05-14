import { describe, expect, it } from "vitest";
import { createShareUrl, getSharePreviewPath } from "./shareLinks";

describe("share links", () => {
  it("routes product and course detail shares through preview pages", () => {
    expect(getSharePreviewPath("/products/product-123")).toBe("/share/products/product-123");
    expect(getSharePreviewPath("/courses/course-456")).toBe("/share/courses/course-456");
  });

  it("keeps unrelated URLs unchanged", () => {
    expect(getSharePreviewPath("/products")).toBe("/products");
    expect(getSharePreviewPath("/contact")).toBe("/contact");
    expect(getSharePreviewPath("https://example.com/products/product-123")).toBe("https://example.com/products/product-123");
  });

  it("creates absolute share URLs from the site origin", () => {
    expect(createShareUrl({ origin: "https://www.javanilife.com", url: "/products/product-123" })).toBe("https://www.javanilife.com/share/products/product-123");
  });
});