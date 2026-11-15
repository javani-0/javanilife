import { describe, expect, it } from "vitest";
import {
  draftErrors,
  draftFromCourse,
  draftPublishProblems,
  draftToSave,
  durationToInput,
  emptyCourseDraft,
  matchesPurchaseSearch,
  moveItem,
  parseDurationInput,
  purchaseTotals,
  sameDraft,
  type CourseDraft,
} from "./adminHelpers";
import { normalizeCourse, normalizeEnrollment } from "./helpers";

const VIMEO = "https://vimeo.com/123456/abcdef";

const filledDraft = (): CourseDraft => ({
  ...emptyCourseDraft(),
  title: "Bharatanatyam Basics",
  priceRupees: "999",
  sections: [{
    id: "s1",
    title: "Start here",
    lessons: [
      { id: "l1", title: "Welcome", vimeoUrl: VIMEO, durationText: "2:30", isPreview: true, resourceUrl: "", notes: "" },
      { id: "l2", title: "Adavus", vimeoUrl: "https://vimeo.com/987", durationText: "10", isPreview: false, resourceUrl: "https://example.com/a.pdf", notes: "Practise daily" },
    ],
  }],
});

describe("parseDurationInput", () => {
  it("reads mm:ss, h:mm:ss and plain minutes", () => {
    expect(parseDurationInput("12:30")).toBe(750);
    expect(parseDurationInput("1:02:03")).toBe(3723);
    expect(parseDurationInput("12")).toBe(720);
    expect(parseDurationInput(" ")).toBe(0);
  });
  it("refuses unreadable values", () => {
    expect(parseDurationInput("12:75")).toBeNull();
    expect(parseDurationInput("abc")).toBeNull();
    expect(parseDurationInput("1:2:3:4")).toBeNull();
  });
  it("round-trips through durationToInput", () => {
    expect(durationToInput(750)).toBe("12:30");
    expect(durationToInput(3723)).toBe("1:02:03");
    expect(durationToInput(0)).toBe("");
    expect(parseDurationInput(durationToInput(3723))).toBe(3723);
  });
});

describe("draftToSave", () => {
  it("puts every link in the private content and only preview links on the public doc", () => {
    const { input, content } = draftToSave(filledDraft(), "published");
    expect(input.status).toBe("published");
    expect(input.priceInPaise).toBe(99900);
    const [preview, paid] = input.sections[0].lessons;
    expect(preview.previewVimeoUrl).toBe(VIMEO);
    expect(preview.durationSec).toBe(150);
    expect(paid.previewVimeoUrl).toBeUndefined();
    expect(paid.durationSec).toBe(600);
    expect(content.lessons.l2).toEqual({ vimeoUrl: "https://vimeo.com/987", resourceUrl: "https://example.com/a.pdf", notes: "Practise daily" });
    expect(content.lessons.l1.vimeoUrl).toBe(VIMEO);
  });
  it("drops an MRP that is not above the price and empty list items", () => {
    const draft = { ...filledDraft(), compareAtRupees: "999", outcomes: ["  Learn adavus ", ""] };
    const { input } = draftToSave(draft);
    expect(input.compareAtInPaise).toBeUndefined();
    expect(input.outcomes).toEqual(["Learn adavus"]);
  });
  it("round-trips with draftFromCourse", () => {
    const draft = filledDraft();
    const { input, content } = draftToSave(draft);
    const course = normalizeCourse("bharatanatyam-basics", input as unknown as Record<string, unknown>);
    expect(sameDraft(draftFromCourse(course, content), { ...draft, sections: [{ ...draft.sections[0], lessons: draft.sections[0].lessons.map((l) => ({ ...l, durationText: durationToInput(parseDurationInput(l.durationText) || 0) })) }] })).toBe(true);
  });
});

describe("draftErrors / draftPublishProblems", () => {
  it("accepts a complete course", () => {
    expect(draftErrors(filledDraft())).toEqual([]);
    expect(draftPublishProblems(filledDraft())).toEqual([]);
  });
  it("catches typing mistakes", () => {
    const draft = filledDraft();
    draft.compareAtRupees = "500";
    draft.trailerVimeoUrl = "https://youtube.com/watch?v=x";
    draft.sections[0].lessons[1].vimeoUrl = "not a link";
    draft.sections[0].lessons[1].durationText = "9:99";
    const errors = draftErrors(draft);
    expect(errors.some((e) => e.includes("MRP"))).toBe(true);
    expect(errors.some((e) => e.includes("trailer"))).toBe(true);
    expect(errors.some((e) => e.includes("Vimeo link"))).toBe(true);
    expect(errors.some((e) => e.includes("mm:ss"))).toBe(true);
  });
  it("blocks publish without price, payment mode or lesson link", () => {
    const draft = filledDraft();
    draft.priceRupees = "";
    draft.paymentModes = { razorpay: false, upi: false };
    draft.sections[0].lessons[1].vimeoUrl = "";
    const problems = draftPublishProblems(draft);
    expect(problems).toContain("Set a price above ₹0.");
    expect(problems).toContain("Turn on at least one payment mode.");
    expect(problems.some((p) => p.includes("Adavus"))).toBe(true);
    // A draft may still be saved.
    expect(draftErrors(draft)).toEqual([]);
  });
});

describe("moveItem", () => {
  it("moves within bounds only", () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 2, -1)).toEqual([1, 3, 2]);
    const same = [1, 2, 3];
    expect(moveItem(same, 0, -1)).toBe(same);
  });
});

describe("purchases", () => {
  const rows = [
    normalizeEnrollment("a_c", { uid: "a", courseId: "c", status: "active", method: "razorpay", amountInPaise: 99900, userName: "Asha", userPhone: "+91 98765 43210" }),
    normalizeEnrollment("b_c", { uid: "b", courseId: "c", status: "active", method: "grant", amountInPaise: 0, userEmail: "b@x.in" }),
    normalizeEnrollment("d_c", { uid: "d", courseId: "c", status: "processing", method: "upi", amountInPaise: 99900, upiRef: "UTR123" }),
    normalizeEnrollment("e_c", { uid: "e", courseId: "c", status: "revoked", method: "upi", amountInPaise: 99900 }),
  ];
  it("totals paid revenue on active, non-grant access", () => {
    expect(purchaseTotals(rows)).toEqual({ revenueInPaise: 99900, activeStudents: 2, pending: 1 });
  });
  it("searches name, email, phone digits and UTR", () => {
    expect(matchesPurchaseSearch(rows[0], "asha")).toBe(true);
    expect(matchesPurchaseSearch(rows[0], "98765")).toBe(true);
    expect(matchesPurchaseSearch(rows[1], "B@X")).toBe(true);
    expect(matchesPurchaseSearch(rows[2], "utr123")).toBe(true);
    expect(matchesPurchaseSearch(rows[2], "zzz")).toBe(false);
  });
});
