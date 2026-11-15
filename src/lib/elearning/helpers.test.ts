import { describe, expect, it } from "vitest";
import { CLOUDINARY_CLOUD_NAME } from "@/lib/cloudinary";
import {
  availablePaymentModes,
  clampAccessDays,
  normalizeUpiUtr,
  buildVimeoEmbedUrl,
  computeExpiresAt,
  courseTotals,
  ELEARN_CLOUDINARY_CLOUD,
  flattenLessons,
  formatDuration,
  formatTotalDuration,
  hasActiveAccess,
  isAllowedProofUrl,
  neighbourLessons,
  normalizeContent,
  normalizeCourse,
  normalizeEnrollment,
  normalizeProgress,
  parseVimeoUrl,
  pickFreeSlug,
  progressPercent,
  publishProblems,
  shouldAutoComplete,
  slugify,
  toMillis,
  vimeoEmbedUrlFromLink,
  vimeoOembedUrl,
} from "./helpers";
import type { ElearnCourse } from "./types";

const DAY = 24 * 60 * 60 * 1000;

const course = (overrides: Partial<ElearnCourse> = {}): ElearnCourse => ({
  ...normalizeCourse("c1", {
    title: "Bharatanatyam Basics",
    priceInPaise: 99900,
    paymentModes: { razorpay: true, upi: true },
    status: "published",
    sections: [
      { id: "s1", title: "Start", lessons: [{ id: "l1", title: "Intro", durationSec: 60, isPreview: true, previewVimeoUrl: "https://vimeo.com/1" }, { id: "l2", title: "Steps", durationSec: 120 }] },
      { id: "s2", title: "More", lessons: [{ id: "l3", title: "Mudras", durationSec: 300 }] },
    ],
  }),
  ...overrides,
});

describe("parseVimeoUrl", () => {
  it("parses a plain video link", () => {
    expect(parseVimeoUrl("https://vimeo.com/123456")).toEqual({ id: "123456", hash: "" });
  });
  it("parses an unlisted link with hash", () => {
    expect(parseVimeoUrl("https://vimeo.com/123456/abcdef12")).toEqual({ id: "123456", hash: "abcdef12" });
  });
  it("parses a player link with ?h=", () => {
    expect(parseVimeoUrl("https://player.vimeo.com/video/123456?h=abcdef&badge=0")).toEqual({ id: "123456", hash: "abcdef" });
  });
  it("parses channel, group and showcase links", () => {
    expect(parseVimeoUrl("https://vimeo.com/channels/staffpicks/123456")).toEqual({ id: "123456", hash: "" });
    expect(parseVimeoUrl("https://vimeo.com/groups/dance/videos/123456")).toEqual({ id: "123456", hash: "" });
    expect(parseVimeoUrl("https://vimeo.com/showcase/999/video/123456")).toEqual({ id: "123456", hash: "" });
  });
  it("accepts www, http and a missing protocol, and trims spaces", () => {
    expect(parseVimeoUrl("  www.vimeo.com/42 ")).toEqual({ id: "42", hash: "" });
    expect(parseVimeoUrl("http://vimeo.com/42?h=zz9")).toEqual({ id: "42", hash: "zz9" });
  });
  it("rejects non-Vimeo hosts and junk", () => {
    expect(parseVimeoUrl("https://youtube.com/watch?v=123")).toBeNull();
    expect(parseVimeoUrl("https://vimeo.com.evil.com/123")).toBeNull();
    expect(parseVimeoUrl("https://evilvimeo.com/123")).toBeNull();
    expect(parseVimeoUrl("https://vimeo.com/channels/staffpicks")).toBeNull();
    expect(parseVimeoUrl("javascript:alert(1)")).toBeNull();
    expect(parseVimeoUrl("")).toBeNull();
    expect(parseVimeoUrl(undefined)).toBeNull();
  });
});

describe("Vimeo embed URLs", () => {
  it("builds the embed URL with the privacy hash", () => {
    expect(buildVimeoEmbedUrl({ id: "123", hash: "abc" })).toBe(
      "https://player.vimeo.com/video/123?h=abc&dnt=1&title=0&byline=0&portrait=0",
    );
  });
  it("omits h when there is no hash", () => {
    expect(buildVimeoEmbedUrl({ id: "123", hash: "" })).toBe(
      "https://player.vimeo.com/video/123?dnt=1&title=0&byline=0&portrait=0",
    );
  });
  it("maps a link straight to an embed URL, or null", () => {
    expect(vimeoEmbedUrlFromLink("https://vimeo.com/123/abc")).toContain("/video/123?h=abc");
    expect(vimeoEmbedUrlFromLink("https://example.com/123")).toBeNull();
  });
  it("builds an oEmbed lookup URL only for valid links", () => {
    expect(vimeoOembedUrl("https://vimeo.com/123/abc")).toBe(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent("https://vimeo.com/123/abc")}`,
    );
    expect(vimeoOembedUrl("https://example.com/1")).toBeNull();
  });
});

describe("slugify + pickFreeSlug", () => {
  it("makes a clean slug", () => {
    expect(slugify("  Bharatanatyam Basics!! ")).toBe("bharatanatyam-basics");
    expect(slugify("Café Déjà vu")).toBe("cafe-deja-vu");
    expect(slugify("a__b  c")).toBe("a-b-c");
  });
  it("falls back when nothing is left", () => {
    expect(slugify("!!!")).toBe("course");
    expect(slugify("తెలుగు")).toBe("course");
  });
  it("caps the length without a trailing dash", () => {
    const slug = slugify("word ".repeat(40));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
  it("adds -2, -3 on a clash", () => {
    expect(pickFreeSlug("yoga", new Set())).toBe("yoga");
    expect(pickFreeSlug("yoga", new Set(["yoga"]))).toBe("yoga-2");
    expect(pickFreeSlug("yoga", new Set(["yoga", "yoga-2"]))).toBe("yoga-3");
  });
});

describe("course totals and lessons", () => {
  it("derives lessonCount and totalDurationSec", () => {
    expect(courseTotals(course().sections)).toEqual({ lessonCount: 3, totalDurationSec: 480 });
    expect(courseTotals([])).toEqual({ lessonCount: 0, totalDurationSec: 0 });
  });
  it("flattens lessons in order and finds neighbours", () => {
    const c = course();
    expect(flattenLessons(c.sections).map((l) => l.id)).toEqual(["l1", "l2", "l3"]);
    expect(neighbourLessons(c.sections, "l2")).toEqual({ prevId: "l1", nextId: "l3" });
    expect(neighbourLessons(c.sections, "l1")).toEqual({ prevId: null, nextId: "l2" });
    expect(neighbourLessons(c.sections, "l3")).toEqual({ prevId: "l2", nextId: null });
    expect(neighbourLessons(c.sections, "nope")).toEqual({ prevId: null, nextId: null });
  });
});

describe("formatDuration", () => {
  it("formats a lesson clock", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(-5)).toBe("0:00");
    expect(formatDuration(Number.NaN)).toBe("0:00");
  });
  it("formats a course total", () => {
    expect(formatTotalDuration(0)).toBe("0m");
    expect(formatTotalDuration(45)).toBe("1m");
    expect(formatTotalDuration(2700)).toBe("45m");
    expect(formatTotalDuration(3600)).toBe("1h");
    expect(formatTotalDuration(12000)).toBe("3h 20m");
  });
});

describe("progress", () => {
  it("counts only lessons that still exist", () => {
    const c = course();
    expect(progressPercent(c.sections, [])).toBe(0);
    expect(progressPercent(c.sections, ["l1"])).toBe(33);
    expect(progressPercent(c.sections, ["l1", "l2", "l3", "deleted"])).toBe(100);
    expect(progressPercent([], ["l1"])).toBe(0);
  });
  it("auto-completes at 90 %", () => {
    expect(shouldAutoComplete(89, 100)).toBe(false);
    expect(shouldAutoComplete(90, 100)).toBe(true);
    expect(shouldAutoComplete(10, 0)).toBe(false);
  });
});

describe("expiry + access", () => {
  const now = new Date("2026-11-15T00:00:00Z");
  it("is lifetime (null) for 0 days", () => {
    expect(computeExpiresAt(0, now)).toBeNull();
    expect(computeExpiresAt(undefined, now)).toBeNull();
    expect(computeExpiresAt(-3, now)).toBeNull();
  });
  it("adds whole days", () => {
    expect(computeExpiresAt(30, now)?.getTime()).toBe(now.getTime() + 30 * DAY);
  });
  it("reads timestamp-like values", () => {
    expect(toMillis(new Date(5))).toBe(5);
    expect(toMillis({ toMillis: () => 7 })).toBe(7);
    expect(toMillis({ seconds: 2, nanoseconds: 0 })).toBe(2000);
    expect(toMillis(9)).toBe(9);
    expect(toMillis(null)).toBeNull();
    expect(toMillis("junk")).toBeNull();
  });
  it("grants access only to an active, unexpired enrollment", () => {
    const t = now.getTime();
    expect(hasActiveAccess({ status: "active", expiresAt: null }, t)).toBe(true);
    expect(hasActiveAccess({ status: "active" }, t)).toBe(true);
    expect(hasActiveAccess({ status: "active", expiresAt: new Date(t + DAY) }, t)).toBe(true);
    expect(hasActiveAccess({ status: "active", expiresAt: new Date(t - 1) }, t)).toBe(false);
    expect(hasActiveAccess({ status: "processing", expiresAt: null }, t)).toBe(false);
    expect(hasActiveAccess({ status: "revoked" }, t)).toBe(false);
    expect(hasActiveAccess(null, t)).toBe(false);
  });
});

describe("availablePaymentModes", () => {
  const upiOn = { manualPaymentsEnabled: true, upiId: "javani@okhdfc", qrImageUrl: "" };
  it("offers both when the course and the UPI settings allow", () => {
    expect(availablePaymentModes(course(), upiOn)).toEqual({ razorpay: true, upi: true });
  });
  it("hides QR when manual payments are off or UPI is not configured", () => {
    expect(availablePaymentModes(course(), { ...upiOn, manualPaymentsEnabled: false }).upi).toBe(false);
    expect(availablePaymentModes(course(), { manualPaymentsEnabled: true, upiId: " ", qrImageUrl: "" }).upi).toBe(false);
    expect(availablePaymentModes(course(), { manualPaymentsEnabled: true, upiId: "", qrImageUrl: "https://x/qr.png" }).upi).toBe(true);
    expect(availablePaymentModes(course(), null).upi).toBe(false);
  });
  it("respects the per-course switches", () => {
    expect(availablePaymentModes(course({ paymentModes: { razorpay: false, upi: true } }), upiOn)).toEqual({ razorpay: false, upi: true });
    expect(availablePaymentModes(course({ paymentModes: { razorpay: true, upi: false } }), upiOn)).toEqual({ razorpay: true, upi: false });
  });
  it("offers nothing for a free course", () => {
    expect(availablePaymentModes(course({ priceInPaise: 0 }), upiOn)).toEqual({ razorpay: false, upi: false });
  });
});

describe("isAllowedProofUrl", () => {
  it("keeps the server cloud name in sync with the client upload config", () => {
    expect(ELEARN_CLOUDINARY_CLOUD).toBe(CLOUDINARY_CLOUD_NAME);
  });
  it("accepts https images on our Cloudinary cloud only", () => {
    expect(isAllowedProofUrl(`https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/v1/payment-proofs/a.jpg`)).toBe(true);
    expect(isAllowedProofUrl(`http://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/a.jpg`)).toBe(false);
    expect(isAllowedProofUrl("https://res.cloudinary.com/someoneelse/image/upload/a.jpg")).toBe(false);
    expect(isAllowedProofUrl(`https://res.cloudinary.com.evil.com/${CLOUDINARY_CLOUD_NAME}/a.jpg`)).toBe(false);
    expect(isAllowedProofUrl("https://evil.com/a.jpg")).toBe(false);
    expect(isAllowedProofUrl("")).toBe(false);
  });
  it("rejects fetch proxies, SVGs and other resource paths on our cloud", () => {
    const base = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}`;
    expect(isAllowedProofUrl(`${base}/image/fetch/https://evil.com/a.jpg`)).toBe(false);
    expect(isAllowedProofUrl(`${base}/image/upload/v1/a.svg`)).toBe(false);
    expect(isAllowedProofUrl(`${base}/raw/upload/v1/a.jpg`)).toBe(false);
    expect(isAllowedProofUrl(`https://user:pw@res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/a.jpg`)).toBe(false);
  });
});

describe("normalizeUpiUtr", () => {
  it("accepts exactly 12 digits, ignoring spaces and dashes", () => {
    expect(normalizeUpiUtr("123456789012")).toBe("123456789012");
    expect(normalizeUpiUtr(" 1234 5678-9012 ")).toBe("123456789012");
  });
  it("rejects anything else", () => {
    expect(normalizeUpiUtr("12345678901")).toBe("");
    expect(normalizeUpiUtr("1234567890123")).toBe("");
    expect(normalizeUpiUtr("T2311151234567")).toBe("");
    expect(normalizeUpiUtr(123456789012)).toBe("");
    expect(normalizeUpiUtr(undefined)).toBe("");
  });
});

describe("clampAccessDays", () => {
  it("keeps 0 = lifetime and caps huge values so a Date never overflows", () => {
    expect(clampAccessDays(0)).toBe(0);
    expect(clampAccessDays(-5)).toBe(0);
    expect(clampAccessDays("abc")).toBe(0);
    expect(clampAccessDays(30.9)).toBe(30);
    expect(clampAccessDays(1e12)).toBe(36500);
    expect(clampAccessDays(Infinity)).toBe(0);
    expect(computeExpiresAt(1e12, new Date(0))?.getTime()).toBe(36500 * 24 * 60 * 60 * 1000);
  });
  it("normalizeCourse caps accessDays too", () => {
    expect(normalizeCourse("x", { accessDays: 9e15 }).accessDays).toBe(36500);
  });
});

describe("normalizers", () => {
  it("fills safe defaults for a course", () => {
    const c = normalizeCourse("x", {});
    expect(c).toMatchObject({
      id: "x", title: "", status: "draft", level: "all", priceInPaise: 0,
      paymentModes: { razorpay: true, upi: false }, accessDays: 0, sections: [], lessonCount: 0, totalDurationSec: 0,
      outcomes: [], requirements: [], featured: false, sortOrder: 0,
    });
    expect(c.compareAtInPaise).toBeUndefined();
  });
  it("cleans lessons, drops a preview URL on a non-preview lesson, and recomputes totals", () => {
    const c = normalizeCourse("x", {
      priceInPaise: "12345.6",
      level: "expert",
      status: "published",
      outcomes: ["a", "", 3, " b "],
      sections: [{ title: "S", lessons: [{ id: "l", title: " L ", durationSec: "61.4", isPreview: false, previewVimeoUrl: "https://vimeo.com/1" }, "junk"] }],
      lessonCount: 99,
    });
    expect(c.priceInPaise).toBe(12346);
    expect(c.level).toBe("all");
    expect(c.outcomes).toEqual(["a", "b"]);
    expect(c.sections[0].id).toBeTruthy();
    expect(c.sections[0].lessons).toEqual([{ id: "l", title: "L", durationSec: 61, isPreview: false }]);
    expect(c.lessonCount).toBe(1);
  });
  it("keeps compareAt only when above the price", () => {
    expect(normalizeCourse("x", { priceInPaise: 100, compareAtInPaise: 200 }).compareAtInPaise).toBe(200);
    expect(normalizeCourse("x", { priceInPaise: 100, compareAtInPaise: 50 }).compareAtInPaise).toBeUndefined();
  });
  it("normalizes content, enrollment and progress", () => {
    expect(normalizeContent({ lessons: { a: { vimeoUrl: " https://vimeo.com/1 ", notes: "n" }, b: 5 } })).toEqual({
      lessons: { a: { vimeoUrl: "https://vimeo.com/1", notes: "n" } },
    });
    expect(normalizeEnrollment("u_c", { status: "weird", uid: "u", courseId: "c" }).status).toBe("awaiting-payment");
    expect(normalizeEnrollment("u_c", { status: "active", method: "upi", amountInPaise: 500 })).toMatchObject({
      id: "u_c", status: "active", method: "upi", amountInPaise: 500, expiresAt: null,
    });
    expect(normalizeProgress({ completedLessonIds: ["a", 1, "a"], positions: { a: 12.7, b: "x" }, lastLessonId: "a" })).toMatchObject({
      completedLessonIds: ["a"], positions: { a: 13 }, lastLessonId: "a",
    });
  });
});

describe("publishProblems", () => {
  it("is empty for a sellable course", () => {
    expect(publishProblems(course())).toEqual([]);
  });
  it("lists what blocks publishing", () => {
    const problems = publishProblems(course({ title: " ", priceInPaise: 0, paymentModes: { razorpay: false, upi: false }, sections: [] }));
    expect(problems.length).toBe(4);
  });
  it("flags a paid lesson without a Vimeo link when content is given", () => {
    const problems = publishProblems(course(), { lessons: { l2: { vimeoUrl: "https://vimeo.com/2" } } });
    expect(problems.some((p) => p.includes("Mudras"))).toBe(true);
  });
  it("flags a preview lesson without a valid preview link", () => {
    const c = course();
    c.sections[0].lessons[0].previewVimeoUrl = "https://youtube.com/x";
    expect(publishProblems(c).some((p) => p.includes("Intro"))).toBe(true);
  });
});

describe("normalizeEnrollment proof link", () => {
  it("drops a proof URL that is not our Cloudinary image", () => {
    expect(normalizeEnrollment("e", { upiProofUrl: "javascript:alert(1)" }).upiProofUrl).toBeUndefined();
    const ok = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/v1/a.jpg`;
    expect(normalizeEnrollment("e", { upiProofUrl: ok }).upiProofUrl).toBe(ok);
  });
});

describe("normalizeContent resource links", () => {
  it("keeps http(s) links and drops script/data URLs", () => {
    const content = normalizeContent({
      lessons: {
        a: { vimeoUrl: "https://vimeo.com/1", resourceUrl: "https://example.com/a.pdf" },
        b: { vimeoUrl: "https://vimeo.com/2", resourceUrl: "javascript:alert(1)" },
        c: { vimeoUrl: "https://vimeo.com/3", resourceUrl: "data:text/html,x" },
      },
    });
    expect(content.lessons.a.resourceUrl).toBe("https://example.com/a.pdf");
    expect(content.lessons.b.resourceUrl).toBeUndefined();
    expect(content.lessons.c.resourceUrl).toBeUndefined();
  });
});
