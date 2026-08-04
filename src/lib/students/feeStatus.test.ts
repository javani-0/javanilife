import { describe, expect, it } from "vitest";
import type { FeePaymentDoc } from "@/lib/classes";
import { matchesFeeFilter, summarizeStudentFees } from "./feeStatus";

const ts = (iso: string) => ({ toMillis: () => new Date(iso).getTime() });

const fee = (over: Partial<FeePaymentDoc> & { id: string }): FeePaymentDoc => ({
  enrollmentId: "e1",
  classId: "c1",
  className: "Vocal",
  parentUserId: "u1",
  studentName: "Asha",
  parentName: "Meera",
  parentPhone: "9",
  monthKey: "2026-07",
  periodLabel: "July 2026",
  amountInPaise: 100000,
  dueDate: "2026-07-05",
  status: "pending",
  ...over,
} as FeePaymentDoc);

const NOW = new Date("2026-07-20T00:00:00Z");

describe("summarizeStudentFees", () => {
  // THE REPORTED BUG: paying the admission fee today makes it the most recently
  // touched doc, so a status derived from "latest activity" reads Paid while an
  // older pending month is still outstanding.
  it("reports outstanding even when the most RECENTLY TOUCHED fee is paid", () => {
    const summary = summarizeStudentFees([
      fee({ id: "admission", status: "paid", monthKey: "2026-06", paidAt: ts("2026-07-19") as never, createdAt: ts("2026-06-01") as never }),
      fee({ id: "july", status: "pending", monthKey: "2026-07", dueDate: "2026-07-25", createdAt: ts("2026-07-01") as never }),
    ], NOW);

    expect(summary.hasOutstanding).toBe(true);
    expect(summary.outstanding.map((f) => f.id)).toEqual(["july"]);
    expect(summary.outstandingInPaise).toBe(100000);
    // The latest-activity doc is still exposed for captions, but it must not
    // decide whether the student owes anything.
    expect(summary.latest?.id).toBe("admission");
  });

  it("counts a past-due pending fee as overdue", () => {
    const summary = summarizeStudentFees([
      fee({ id: "june", status: "pending", dueDate: "2026-07-05" }),
    ], NOW);
    expect(summary.overdueCount).toBe(1);
    expect(summary.hasOutstanding).toBe(true);
    expect(summary.status).toBe("overdue");
  });

  it("treats a fee awaiting admin approval as NOT outstanding", () => {
    // status "processing" = UPI proof submitted. The parent has paid; chasing
    // them again would be wrong.
    const summary = summarizeStudentFees([
      fee({ id: "p", status: "processing", dueDate: "2026-07-05" }),
    ], NOW);
    expect(summary.hasOutstanding).toBe(false);
    expect(summary.awaitingApproval).toHaveLength(1);
    expect(summary.status).toBe("processing");
  });

  it("ignores waived months", () => {
    const summary = summarizeStudentFees([
      fee({ id: "free", status: "waived", dueDate: "2026-07-05" }),
    ], NOW);
    expect(summary.hasOutstanding).toBe(false);
    expect(summary.status).toBe("waived");
  });

  it("sums outstanding ACROSS CLASSES and reports the earliest due first", () => {
    const summary = summarizeStudentFees([
      fee({ id: "vocal", enrollmentId: "e1", className: "Vocal", status: "pending", dueDate: "2026-08-05", amountInPaise: 100000 }),
      fee({ id: "veena", enrollmentId: "e2", className: "Veena", status: "pending", dueDate: "2026-07-05", amountInPaise: 250000 }),
    ], NOW);
    expect(summary.outstandingInPaise).toBe(350000);
    expect(summary.nextDue?.id).toBe("veena"); // earliest dueDate
    expect(summary.classesWithDues).toEqual(["Veena", "Vocal"]);
  });

  it("is all-clear when every fee is settled", () => {
    const summary = summarizeStudentFees([
      fee({ id: "a", status: "paid", paidAt: ts("2026-07-10") as never }),
      fee({ id: "b", status: "paid", paidAt: ts("2026-07-18") as never }),
    ], NOW);
    expect(summary.hasOutstanding).toBe(false);
    expect(summary.status).toBe("paid");
    expect(summary.latest?.id).toBe("b");
  });

  it("is empty-safe", () => {
    const summary = summarizeStudentFees([], NOW);
    expect(summary.hasOutstanding).toBe(false);
    expect(summary.status).toBeUndefined();
    expect(summary.outstandingInPaise).toBe(0);
  });
});

describe("matchesFeeFilter", () => {
  const withPendingAndPaid = summarizeStudentFees([
    fee({ id: "admission", status: "paid", paidAt: ts("2026-07-19") as never }),
    fee({ id: "july", status: "pending", dueDate: "2026-07-25" }),
  ], NOW);

  // The old filter compared only the latest doc, so filtering by "pending"
  // HID the students who actually owed money.
  it("matches pending when ANY fee is pending, not just the latest", () => {
    expect(matchesFeeFilter(withPendingAndPaid, "pending")).toBe(true);
  });

  it("still matches paid when a paid fee exists", () => {
    expect(matchesFeeFilter(withPendingAndPaid, "paid")).toBe(true);
  });

  it("matches overdue only when something is actually past due", () => {
    expect(matchesFeeFilter(withPendingAndPaid, "overdue")).toBe(false);
    const late = summarizeStudentFees([fee({ id: "x", status: "pending", dueDate: "2026-07-01" })], NOW);
    expect(matchesFeeFilter(late, "overdue")).toBe(true);
  });

  it("'all' always matches and 'none' only matches a student with no fees", () => {
    expect(matchesFeeFilter(withPendingAndPaid, "all")).toBe(true);
    expect(matchesFeeFilter(withPendingAndPaid, "none")).toBe(false);
    expect(matchesFeeFilter(summarizeStudentFees([], NOW), "none")).toBe(true);
  });
});
