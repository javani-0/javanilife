import { describe, expect, it } from "vitest";
import {
  buildCertificateId,
  buildHallTicketNumber,
  examTimingFor,
  hallTicketEligibility,
  normalizeCertificate,
  normalizeExam,
  slugify,
} from "./exams";

const TODAY = "2026-07-20";

describe("examTimingFor", () => {
  it("classifies upcoming, today and past", () => {
    expect(examTimingFor({ examDate: "2026-07-25" }, TODAY)).toBe("upcoming");
    expect(examTimingFor({ examDate: TODAY }, TODAY)).toBe("today");
    expect(examTimingFor({ examDate: "2026-07-01" }, TODAY)).toBe("past");
  });
  it("treats a dateless exam as upcoming rather than past", () => {
    expect(examTimingFor({ examDate: "" }, TODAY)).toBe("upcoming");
  });
});

describe("hallTicketEligibility", () => {
  const exam = { hallTicketEnabled: true, examDate: "2026-07-25" };

  it("allows download when released, unlocked and upcoming", () => {
    const result = hallTicketEligibility(exam, { locked: false, today: TODAY });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("");
  });

  it("blocks until the admin releases tickets", () => {
    const result = hallTicketEligibility({ ...exam, hallTicketEnabled: false }, { locked: false, today: TODAY });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("haven't been released");
  });

  // The whole point of the fee lock — no ticket while money is owed.
  it("blocks a fee-locked student and says why", () => {
    const result = hallTicketEligibility(exam, { locked: true, today: TODAY });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("pending fee");
  });

  it("blocks after the exam has happened", () => {
    const result = hallTicketEligibility({ ...exam, examDate: "2026-07-01" }, { locked: false, today: TODAY });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("already taken place");
  });

  it("still allows download ON the exam day", () => {
    expect(hallTicketEligibility({ ...exam, examDate: TODAY }, { locked: false, today: TODAY }).allowed).toBe(true);
  });

  it("reports the release block BEFORE the fee block when both apply", () => {
    const result = hallTicketEligibility({ ...exam, hallTicketEnabled: false }, { locked: true, today: TODAY });
    expect(result.reason).toContain("haven't been released");
  });
});

describe("buildHallTicketNumber", () => {
  it("is deterministic so a reprint matches the original", () => {
    const first = buildHallTicketNumber("abc123def", "STU001");
    expect(first).toBe("HT-ABC123-STU001");
    expect(buildHallTicketNumber("abc123def", "STU001")).toBe(first);
  });
  it("differs between students in the same exam", () => {
    expect(buildHallTicketNumber("abc123def", "STU001")).not.toBe(buildHallTicketNumber("abc123def", "STU002"));
  });
  it("falls back when there is no roll number", () => {
    expect(buildHallTicketNumber("abc123def", "")).toContain("GUEST");
  });
});

describe("slugify / buildCertificateId", () => {
  it("makes a Firestore-safe slug", () => {
    expect(slugify("Level 1 — Completion!")).toBe("level-1-completion");
    expect(slugify("  spaced  out  ")).toBe("spaced-out");
  });
  it("never returns an empty slug", () => {
    expect(slugify("!!!")).toBe("certificate");
    expect(slugify("")).toBe("certificate");
  });
  // Re-issuing the same certificate must OVERWRITE, not duplicate.
  it("is stable for the same enrolment and title", () => {
    expect(buildCertificateId("e1", "Level 1 Completion")).toBe("e1_level-1-completion");
    expect(buildCertificateId("e1", "Level 1 Completion")).toBe(buildCertificateId("e1", "level 1 completion"));
  });
});

describe("normalizeExam", () => {
  it("defaults mode to offline and hall tickets to OFF", () => {
    const exam = normalizeExam("x", {});
    expect(exam.mode).toBe("offline");
    expect(exam.hallTicketEnabled).toBe(false);
  });
  it("keeps only string instructions", () => {
    expect(normalizeExam("x", { instructions: ["Bring ID", "", 42, "Arrive 15 min early"] }).instructions)
      .toEqual(["Bring ID", "Arrive 15 min early"]);
  });
});

describe("normalizeCertificate", () => {
  it("defaults to issued and respects revoked", () => {
    expect(normalizeCertificate("c1", {}).status).toBe("issued");
    expect(normalizeCertificate("c1", { status: "revoked" }).status).toBe("revoked");
  });
  it("does not trust an unknown status", () => {
    expect(normalizeCertificate("c1", { status: "forged" }).status).toBe("issued");
  });
});
