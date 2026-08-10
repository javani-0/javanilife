import { describe, expect, it } from "vitest";
import { findBrokenEnrollments, suggestClassFor } from "./brokenEnrollments";
import type { EnrollmentDoc } from "@/lib/classes";

const enrollment = (id: string, classId: string, className: string, status = "active"): EnrollmentDoc => ({
  id,
  classId,
  className,
  status,
  student: { name: "Test" },
  parent: { name: "P", phone: "9" },
  parentUserId: "uid",
} as unknown as EnrollmentDoc);

describe("findBrokenEnrollments", () => {
  // The exact live situation: 3 of 19 enrolments pointed at deleted classes.
  it("finds enrolments whose class document is gone", () => {
    const broken = findBrokenEnrollments(
      [
        enrollment("e1", "live", "KP Grades"),
        enrollment("e2", "deleted", "KUCHIPUDI PREGRADE CLASSES"),
      ],
      ["live"],
    );
    expect(broken).toHaveLength(1);
    expect(broken[0].enrollment.id).toBe("e2");
    expect(broken[0].missingClassId).toBe("deleted");
    expect(broken[0].rememberedClassName).toBe("KUCHIPUDI PREGRADE CLASSES");
  });

  it("is empty when every class exists", () => {
    expect(findBrokenEnrollments([enrollment("e1", "a", "A")], ["a", "b"])).toEqual([]);
  });

  // Nobody is trying to attend a cancelled enrolment — flagging it is noise.
  it("ignores cancelled enrolments", () => {
    expect(findBrokenEnrollments([enrollment("e1", "gone", "X", "cancelled")], ["a"])).toEqual([]);
  });

  it("still flags paused enrolments, which are expected to resume", () => {
    expect(findBrokenEnrollments([enrollment("e1", "gone", "X", "paused")], ["a"])).toHaveLength(1);
  });

  it("ignores an enrolment with no classId at all", () => {
    expect(findBrokenEnrollments([enrollment("e1", "", "X")], ["a"])).toEqual([]);
  });

  it("handles empty input", () => {
    expect(findBrokenEnrollments([], [])).toEqual([]);
  });
});

describe("suggestClassFor", () => {
  const classes = [
    { id: "c1", name: "DIPLOMA IN KUCHIPUDI (JKDP) 1st SEM" },
    { id: "c2", name: "KP Grades System" },
  ];

  it("matches an exact name", () => {
    expect(suggestClassFor({ rememberedClassName: "KP Grades System" }, classes)?.id).toBe("c2");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(suggestClassFor({ rememberedClassName: "  kp   grades system " }, classes)?.id).toBe("c2");
  });

  // Live data: the enrolment says "(JKDP)", the class says "(JKDP) 1st SEM".
  it("matches when the class name has since been extended", () => {
    expect(suggestClassFor({ rememberedClassName: "DIPLOMA IN KUCHIPUDI (JKDP)" }, classes)?.id).toBe("c1");
  });

  it("matches when the remembered name is the longer one", () => {
    expect(suggestClassFor({ rememberedClassName: "KP Grades System 1-10" }, classes)?.id).toBe("c2");
  });

  it("suggests nothing when no name is close", () => {
    expect(suggestClassFor({ rememberedClassName: "NRTYA (6 Months) SADHANA" }, classes)).toBeNull();
  });

  it("suggests nothing when the enrolment remembers no name", () => {
    expect(suggestClassFor({ rememberedClassName: "" }, classes)).toBeNull();
  });
});
