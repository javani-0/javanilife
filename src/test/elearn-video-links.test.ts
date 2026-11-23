import { describe, expect, it } from "vitest";
import { isVideoUrl, parseYouTubeUrl, publishProblems, videoEmbedUrlFromLink, videoProvider } from "@/lib/elearning/helpers";

describe("YouTube lesson links", () => {
  it("reads the common YouTube link shapes", () => {
    for (const link of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "youtube.com/shorts/dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    ]) expect(parseYouTubeUrl(link)).toEqual({ id: "dQw4w9WgXcQ" });
  });

  it("rejects look-alikes and broken ids", () => {
    for (const link of ["https://evil.com/watch?v=dQw4w9WgXcQ", "https://youtube.com/watch?v=short", "https://youtube.com/channel/UC123", "javascript:alert(1)", ""]) {
      expect(parseYouTubeUrl(link)).toBeNull();
    }
  });

  it("builds a privacy-enhanced embed and keeps Vimeo working", () => {
    expect(videoEmbedUrlFromLink("https://youtu.be/dQw4w9WgXcQ")).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*enablejsapi=1/);
    expect(videoEmbedUrlFromLink("https://vimeo.com/123456/abcdef")).toMatch(/^https:\/\/player\.vimeo\.com\/video\/123456\?h=abcdef/);
    expect(videoProvider("https://vimeo.com/123456")).toBe("vimeo");
    expect(videoProvider("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube");
    expect(isVideoUrl("https://example.com/video.mp4")).toBe(false);
  });

  it("lets a course publish with YouTube lessons", () => {
    const course = {
      title: "T", priceInPaise: 1000, paymentModes: { razorpay: true, upi: false },
      sections: [{ id: "s", title: "S", lessons: [{ id: "l1", title: "L1", isPreview: true, previewVimeoUrl: "https://youtu.be/dQw4w9WgXcQ", durationSec: 60 }] }],
    } as never;
    expect(publishProblems(course, { lessons: {} } as never)).toEqual([]);
  });
});
