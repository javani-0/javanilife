import { describe, expect, it } from "vitest";
import { createShareUrl, getSharePreviewPath } from "./shareLinks";

describe("share links", () => {
  it("returns URLs unchanged (OG meta is served via bot UA rewrite, no /share/ redirect)", () => {
    expect(getSharePreviewPath("/products/product-123")).toBe("/products/product-123");
    expect(getSharePreviewPath("/courses/course-456")).toBe("/courses/course-456");
    expect(getSharePreviewPath("/products")).toBe("/products");
    expect(getSharePreviewPath("/contact")).toBe("/contact");
    expect(getSharePreviewPath("https://example.com/products/product-123")).toBe("https://example.com/products/product-123");
  });

  it("creates absolute share URLs from the site origin", () => {
    expect(createShareUrl({ origin: "https://www.javanilife.com", url: "/products/product-123" })).toBe("https://www.javanilife.com/products/product-123");
  });
});