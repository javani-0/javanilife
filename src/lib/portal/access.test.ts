import { describe, expect, it } from "vitest";
import type { FeePaymentDoc } from "@/lib/classes";
import { anyLocked, computeClassAccess } from "./access";

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

const TODAY = "2026-07-20";

describe("computeClassAccess", () => {
  it("is open when every fee is settled", () => {
    const access = computeClassAccess({ fees: [fee({ id: "a", status: "paid" })], today: TODAY });
    expect(access.locked).toBe(false);
    expect(access.reason).toBe("");
  });

  it("locks a fee overdue beyond the grace period", () => {
    const access = computeClassAccess({ fees: [fee({ id: "a", dueDate: "2026-07-05" })], today: TODAY });
    expect(access.locked).toBe(true);
    expect(access.daysOverdue).toBe(15);
    expect(access.blockingFee?.id).toBe("a");
    expect(access.reason).toContain("July 2026");
    expect(access.reason).toContain("unlocks");
  });

  it("does NOT lock inside the grace window, but warns", () => {
    const access = computeClassAccess({ fees: [fee({ id: "a", dueDate: "2026-07-18" })], today: TODAY, graceDays: 3 });
    expect(access.locked).toBe(false);
    expect(access.graceEndsOn).toBe("2026-07-21");
    expect(access.reason).toContain("2026-07-21");
  });

  it("does not lock on the exact grace boundary", () => {
    // due 17th + 3 days grace = late by exactly 3 → still open.
    expect(computeClassAccess({ fees: [fee({ id: "a", dueDate: "2026-07-17" })], today: TODAY, graceDays: 3 }).locked).toBe(false);
    // one more day and it locks.
    expect(computeClassAccess({ fees: [fee({ id: "a", dueDate: "2026-07-16" })], today: TODAY, graceDays: 3 }).locked).toBe(true);
  });

  // The most important rule: don't punish someone who already paid.
  it("NEVER locks on a fee awaiting admin approval", () => {
    const access = computeClassAccess({ fees: [fee({ id: "a", status: "processing", dueDate: "2026-06-01" })], today: TODAY });
    expect(access.locked).toBe(false);
  });

  it("never locks on a waived fee", () => {
    const access = computeClassAccess({ fees: [fee({ id: "a", status: "waived", dueDate: "2026-06-01" })], today: TODAY });
    expect(access.locked).toBe(false);
  });

  it("locks on a FAILED payment (money is still owed)", () => {
    expect(computeClassAccess({ fees: [fee({ id: "a", status: "failed", dueDate: "2026-06-01" })], today: TODAY }).locked).toBe(true);
  });

  it("reports the WORST offender when several are overdue", () => {
    const access = computeClassAccess({
      fees: [fee({ id: "june", dueDate: "2026-06-05", periodLabel: "June 2026" }), fee({ id: "july", dueDate: "2026-07-05" })],
      today: TODAY,
    });
    expect(access.blockingFee?.id).toBe("june");
    expect(access.daysOverdue).toBe(45);
  });

  it("respects an admin override", () => {
    const access = computeClassAccess({
      fees: [fee({ id: "a", dueDate: "2026-05-01" })],
      today: TODAY,
      overrideUntil: "2026-07-31",
    });
    expect(access.locked).toBe(false);
    expect(access.reason).toContain("extended by the office");
  });

  it("ignores an EXPIRED override", () => {
    const access = computeClassAccess({
      fees: [fee({ id: "a", dueDate: "2026-05-01" })],
      today: TODAY,
      overrideUntil: "2026-07-01",
    });
    expect(access.locked).toBe(true);
  });

  it("does not lock a paused or cancelled enrolment", () => {
    expect(computeClassAccess({ fees: [fee({ id: "a", dueDate: "2026-05-01" })], today: TODAY, enrollmentStatus: "paused" }).locked).toBe(false);
    expect(computeClassAccess({ fees: [fee({ id: "a", dueDate: "2026-05-01" })], today: TODAY, enrollmentStatus: "cancelled" }).locked).toBe(false);
  });

  it("ignores a fee with no due date rather than locking blindly", () => {
    expect(computeClassAccess({ fees: [fee({ id: "a", dueDate: "" })], today: TODAY }).locked).toBe(false);
  });

  it("is empty-safe", () => {
    expect(computeClassAccess({ fees: [], today: TODAY }).locked).toBe(false);
  });

  it("honours a zero-day grace (lock the day after the due date)", () => {
    expect(computeClassAccess({ fees: [fee({ id: "a", dueDate: "2026-07-19" })], today: TODAY, graceDays: 0 }).locked).toBe(true);
    expect(computeClassAccess({ fees: [fee({ id: "a", dueDate: "2026-07-20" })], today: TODAY, graceDays: 0 }).locked).toBe(false);
  });
});

describe("anyLocked", () => {
  it("is true when at least one class is locked", () => {
    expect(anyLocked({
      e1: { locked: false, reason: "", daysOverdue: 0 },
      e2: { locked: true, reason: "x", daysOverdue: 9 },
    })).toBe(true);
  });
  it("is false when all are open", () => {
    expect(anyLocked({ e1: { locked: false, reason: "", daysOverdue: 0 } })).toBe(false);
  });
});
