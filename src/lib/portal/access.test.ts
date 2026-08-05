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

/**
 * The lock is OFF by default now, so the tests that exercise locking must turn
 * it on explicitly. The default-off behaviour has its own tests below.
 */
const withLock = (input: Parameters<typeof computeClassAccess>[0]) =>
  computeClassAccess({ lockEnabled: true, ...input });

describe("computeClassAccess", () => {
  it("is open when every fee is settled", () => {
    const result = withLock({ fees: [fee({ id: "a", status: "paid" })], today: TODAY });
    expect(result.locked).toBe(false);
    expect(result.reason).toBe("");
  });

  it("locks a fee overdue beyond the grace period", () => {
    const result = withLock({ fees: [fee({ id: "a", dueDate: "2026-07-05" })], today: TODAY });
    expect(result.locked).toBe(true);
    expect(result.daysOverdue).toBe(15);
    expect(result.blockingFee?.id).toBe("a");
    expect(result.reason).toContain("July 2026");
    expect(result.reason).toContain("unlocks");
  });

  it("does NOT lock inside the grace window, but warns", () => {
    const result = withLock({ fees: [fee({ id: "a", dueDate: "2026-07-18" })], today: TODAY, graceDays: 3 });
    expect(result.locked).toBe(false);
    expect(result.graceEndsOn).toBe("2026-07-21");
    expect(result.reason).toContain("2026-07-21");
  });

  it("does not lock on the exact grace boundary", () => {
    // due 17th + 3 days grace = late by exactly 3 → still open.
    expect(withLock({ fees: [fee({ id: "a", dueDate: "2026-07-17" })], today: TODAY, graceDays: 3 }).locked).toBe(false);
    // one more day and it locks.
    expect(withLock({ fees: [fee({ id: "a", dueDate: "2026-07-16" })], today: TODAY, graceDays: 3 }).locked).toBe(true);
  });

  // The most important rule: don't punish someone who already paid.
  it("NEVER locks on a fee awaiting admin approval", () => {
    const result = withLock({ fees: [fee({ id: "a", status: "processing", dueDate: "2026-06-01" })], today: TODAY });
    expect(result.locked).toBe(false);
  });

  it("never locks on a waived fee", () => {
    const result = withLock({ fees: [fee({ id: "a", status: "waived", dueDate: "2026-06-01" })], today: TODAY });
    expect(result.locked).toBe(false);
  });

  it("locks on a FAILED payment (money is still owed)", () => {
    expect(withLock({ fees: [fee({ id: "a", status: "failed", dueDate: "2026-06-01" })], today: TODAY }).locked).toBe(true);
  });

  it("reports the WORST offender when several are overdue", () => {
    const result = withLock({
      fees: [fee({ id: "june", dueDate: "2026-06-05", periodLabel: "June 2026" }), fee({ id: "july", dueDate: "2026-07-05" })],
      today: TODAY,
    });
    expect(result.blockingFee?.id).toBe("june");
    expect(result.daysOverdue).toBe(45);
  });

  it("respects an admin override", () => {
    const result = withLock({
      fees: [fee({ id: "a", dueDate: "2026-05-01" })],
      today: TODAY,
      overrideUntil: "2026-07-31",
    });
    expect(result.locked).toBe(false);
    expect(result.reason).toContain("extended by the office");
  });

  it("ignores an EXPIRED override", () => {
    const result = withLock({
      fees: [fee({ id: "a", dueDate: "2026-05-01" })],
      today: TODAY,
      overrideUntil: "2026-07-01",
    });
    expect(result.locked).toBe(true);
  });

  it("does not lock a paused or cancelled enrolment", () => {
    expect(withLock({ fees: [fee({ id: "a", dueDate: "2026-05-01" })], today: TODAY, enrollmentStatus: "paused" }).locked).toBe(false);
    expect(withLock({ fees: [fee({ id: "a", dueDate: "2026-05-01" })], today: TODAY, enrollmentStatus: "cancelled" }).locked).toBe(false);
  });

  it("ignores a fee with no due date rather than locking blindly", () => {
    expect(withLock({ fees: [fee({ id: "a", dueDate: "" })], today: TODAY }).locked).toBe(false);
  });

  it("is empty-safe", () => {
    expect(withLock({ fees: [], today: TODAY }).locked).toBe(false);
  });

  it("honours a zero-day grace (lock the day after the due date)", () => {
    expect(withLock({ fees: [fee({ id: "a", dueDate: "2026-07-19" })], today: TODAY, graceDays: 0 }).locked).toBe(true);
    expect(withLock({ fees: [fee({ id: "a", dueDate: "2026-07-20" })], today: TODAY, graceDays: 0 }).locked).toBe(false);
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

// ---------------------------------------------------------------------------
// The master switch. See the INCIDENT note in access.ts.
// ---------------------------------------------------------------------------
describe("lock master switch", () => {
  const badlyOverdue = [fee({ id: "a", dueDate: "2026-05-01" })];

  it("NEVER locks when the switch is off — which is the default", () => {
    // No lockEnabled passed at all: this is exactly what the portal does
    // before the office turns the feature on.
    expect(computeClassAccess({ fees: badlyOverdue, today: TODAY }).locked).toBe(false);
    expect(computeClassAccess({ fees: badlyOverdue, today: TODAY, lockEnabled: false }).locked).toBe(false);
  });

  it("locks the same fee once the switch is on", () => {
    expect(computeClassAccess({ fees: badlyOverdue, today: TODAY, lockEnabled: true }).locked).toBe(true);
  });

  it("stays silent when off — no scary reason text either", () => {
    expect(computeClassAccess({ fees: badlyOverdue, today: TODAY }).reason).toBe("");
  });
});

describe("zero-value dues", () => {
  // A real student was locked out over a Rs.0 pending row.
  it("never locks on a zero-rupee due", () => {
    expect(withLock({
      fees: [fee({ id: "a", dueDate: "2026-05-01", amountInPaise: 0 })],
      today: TODAY,
    }).locked).toBe(false);
  });

  it("still locks when a real amount is owed alongside a zero row", () => {
    expect(withLock({
      fees: [
        fee({ id: "zero", dueDate: "2026-05-01", amountInPaise: 0 }),
        fee({ id: "real", dueDate: "2026-05-01", amountInPaise: 250000 }),
      ],
      today: TODAY,
    }).blockingFee?.id).toBe("real");
  });
});
