import { describe, expect, it } from "vitest";
import {
  assignmentStateFor,
  buildSubmissionId,
  canSubmit,
  normalizeAssignment,
  normalizeSubmission,
  validateSubmissionFile,
} from "./assignments";

const TODAY = "2026-07-20";

describe("validateSubmissionFile", () => {
  it("accepts a PDF within the size limit", () => {
    expect(validateSubmissionFile({ type: "application/pdf", size: 1024, name: "work.pdf" })).toBeNull();
  });

  it("accepts by EXTENSION when the browser reports no mime type", () => {
    expect(validateSubmissionFile({ type: "", size: 1024, name: "work.PDF" })).toBeNull();
  });

  it("rejects a non-PDF", () => {
    expect(validateSubmissionFile({ type: "image/png", size: 1024, name: "photo.png" }))
      .toBe("Only PDF files can be submitted.");
  });

  it("rejects a file over 10 MB", () => {
    const message = validateSubmissionFile({ type: "application/pdf", size: 11 * 1024 * 1024, name: "big.pdf" });
    expect(message).toContain("larger than 10 MB");
  });

  it("accepts exactly 10 MB", () => {
    expect(validateSubmissionFile({ type: "application/pdf", size: 10 * 1024 * 1024, name: "edge.pdf" })).toBeNull();
  });

  it("rejects an empty file", () => {
    expect(validateSubmissionFile({ type: "application/pdf", size: 0, name: "empty.pdf" }))
      .toBe("That file appears to be empty.");
  });

  it("rejects nothing selected", () => {
    expect(validateSubmissionFile(null)).toBe("Choose a PDF file to upload.");
  });
});

describe("assignmentStateFor", () => {
  it("is open before the due date with no submission", () => {
    expect(assignmentStateFor({ dueDate: "2026-07-25" }, undefined, TODAY)).toBe("open");
  });

  it("is overdue past the due date with no submission", () => {
    expect(assignmentStateFor({ dueDate: "2026-07-19" }, undefined, TODAY)).toBe("overdue");
  });

  it("is open ON the due date", () => {
    expect(assignmentStateFor({ dueDate: TODAY }, undefined, TODAY)).toBe("open");
  });

  // Handing in late is still handed in — don't keep calling it overdue.
  it("reports the submission state even when the due date has passed", () => {
    expect(assignmentStateFor({ dueDate: "2026-07-01" }, { status: "submitted" }, TODAY)).toBe("submitted");
    expect(assignmentStateFor({ dueDate: "2026-07-01" }, { status: "reviewed" }, TODAY)).toBe("reviewed");
    expect(assignmentStateFor({ dueDate: "2026-07-01" }, { status: "needs-revision" }, TODAY)).toBe("needs-revision");
  });

  it("is open when there is no due date at all", () => {
    expect(assignmentStateFor({ dueDate: "" }, undefined, TODAY)).toBe("open");
  });
});

describe("canSubmit", () => {
  it("allows uploading for work that is open, late, or sent back", () => {
    expect(canSubmit("open")).toBe(true);
    expect(canSubmit("overdue")).toBe(true);
    expect(canSubmit("needs-revision")).toBe(true);
    expect(canSubmit("submitted")).toBe(true); // replace a wrong file before review
  });

  it("closes uploading once it has been reviewed", () => {
    expect(canSubmit("reviewed")).toBe(false);
  });
});

describe("buildSubmissionId", () => {
  // One row per student per assignment — a re-upload must REPLACE, not add.
  it("is stable for the same assignment and enrolment", () => {
    expect(buildSubmissionId("a1", "e1")).toBe("a1_e1");
    expect(buildSubmissionId("a1", "e1")).toBe(buildSubmissionId("a1", "e1"));
  });
  it("differs across students", () => {
    expect(buildSubmissionId("a1", "e1")).not.toBe(buildSubmissionId("a1", "e2"));
  });
});

describe("normalizeAssignment", () => {
  it("treats a missing active flag as active", () => {
    expect(normalizeAssignment("a1", {}).active).toBe(true);
    expect(normalizeAssignment("a1", { active: false }).active).toBe(false);
  });
  it("drops a zero or negative maxMarks", () => {
    expect(normalizeAssignment("a1", { maxMarks: 0 }).maxMarks).toBeUndefined();
    expect(normalizeAssignment("a1", { maxMarks: 25 }).maxMarks).toBe(25);
  });
});

describe("normalizeSubmission", () => {
  // A student must never be able to write themselves an arbitrary status.
  it("defaults an unknown status to submitted", () => {
    expect(normalizeSubmission("s1", { status: "graded-A+" }).status).toBe("submitted");
  });
  it("is empty-safe", () => {
    const submission = normalizeSubmission("s1", {});
    expect(submission.fileUrl).toBe("");
    expect(submission.sizeBytes).toBe(0);
    expect(submission.marks).toBeUndefined();
  });
});
