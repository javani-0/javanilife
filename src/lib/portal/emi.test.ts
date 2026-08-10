import { describe, expect, it } from "vitest";
import {
  emiInstallmentNumber,
  emiInstallmentsOf,
  hasEmiPlan,
  isEmiFee,
  summarizeEmiPlan,
} from "./emi";
import type { FeePaymentDoc } from "@/lib/classes";

// A fee doc with only the fields the EMI rules actually read.
const fee = (id: string, patch: Partial<FeePaymentDoc> = {}): FeePaymentDoc => ({
  id,
  enrollmentId: "enr1",
  classId: "cls1",
  className: "Kuchipudi",
  parentUserId: "uid1",
  studentName: "Asha",
  parentName: "Meera",
  parentPhone: "9",
  monthKey: "2026-08",
  periodLabel: "Installment 1",
  amountInPaise: 100000,
  dueDate: "2026-08-01",
  status: "pending",
  ...patch,
} as FeePaymentDoc);

describe("isEmiFee", () => {
  it("matches the `${enrollmentId}_emi-N` docs the approval flow creates", () => {
    expect(isEmiFee(fee("enr1_emi-1"))).toBe(true);
    expect(isEmiFee(fee("enr1_emi-12"))).toBe(true);
  });

  it("matches a doc tagged with the emi payment plan", () => {
    expect(isEmiFee(fee("enr1_2026-08", { paymentPlan: "emi" }))).toBe(true);
  });

  it("does not match ordinary monthly or admission docs", () => {
    expect(isEmiFee(fee("enr1_2026-08"))).toBe(false);
    expect(isEmiFee(fee("enr1_onboarding"))).toBe(false);
    expect(isEmiFee(fee("enr1_full"))).toBe(false);
  });
});

describe("emiInstallmentNumber", () => {
  it("reads the trailing number", () => {
    expect(emiInstallmentNumber(fee("enr1_emi-3"))).toBe(3);
  });

  it("is 0 when the id carries no installment number", () => {
    expect(emiInstallmentNumber(fee("enr1_2026-08", { paymentPlan: "emi" }))).toBe(0);
  });
});

describe("emiInstallmentsOf", () => {
  it("keeps only installment docs, in schedule order", () => {
    const list = emiInstallmentsOf([
      fee("enr1_emi-10"),
      fee("enr1_2026-08"),
      fee("enr1_emi-2"),
      fee("enr1_emi-1"),
    ]);
    expect(list.map((item) => item.id)).toEqual(["enr1_emi-1", "enr1_emi-2", "enr1_emi-10"]);
  });

  it("sorts numerically, not lexically — 10 comes after 9", () => {
    const list = emiInstallmentsOf([fee("enr1_emi-9"), fee("enr1_emi-10")]);
    expect(list.map((item) => item.id)).toEqual(["enr1_emi-9", "enr1_emi-10"]);
  });

  it("is empty for an enrolment with no installments", () => {
    expect(emiInstallmentsOf([fee("enr1_2026-08")])).toEqual([]);
  });
});

describe("hasEmiPlan", () => {
  // The Classes tab used 2+ as the threshold for owning the installment block;
  // keep that so a lone `_emi-1` admission doc isn't mistaken for a plan.
  it("needs at least two installments", () => {
    expect(hasEmiPlan([fee("enr1_emi-1")])).toBe(false);
    expect(hasEmiPlan([fee("enr1_emi-1"), fee("enr1_emi-2")])).toBe(true);
  });
});

describe("summarizeEmiPlan", () => {
  const plan = [
    fee("enr1_emi-1", { amountInPaise: 500000, status: "paid" }),
    fee("enr1_emi-2", { amountInPaise: 250000, status: "pending", dueDate: "2026-09-01" }),
    fee("enr1_emi-3", { amountInPaise: 250000, status: "pending", dueDate: "2026-10-01" }),
  ];

  it("totals paid, outstanding and counts", () => {
    const summary = summarizeEmiPlan(plan, new Date("2026-08-09T00:00:00+05:30"));
    expect(summary.totalInPaise).toBe(1000000);
    expect(summary.paidInPaise).toBe(500000);
    expect(summary.remainingInPaise).toBe(500000);
    expect(summary.paidCount).toBe(1);
    expect(summary.pendingCount).toBe(2);
    expect(summary.installments).toHaveLength(3);
  });

  it("points at the earliest unpaid installment as the next due", () => {
    const summary = summarizeEmiPlan(plan, new Date("2026-08-09T00:00:00+05:30"));
    expect(summary.nextDue?.id).toBe("enr1_emi-2");
  });

  it("has no next due once every installment is paid", () => {
    const summary = summarizeEmiPlan(
      plan.map((item) => ({ ...item, status: "paid" as const })),
      new Date("2026-08-09T00:00:00+05:30"),
    );
    expect(summary.nextDue).toBeNull();
    expect(summary.remainingInPaise).toBe(0);
    expect(summary.complete).toBe(true);
  });

  it("counts a waived installment as settled, not outstanding", () => {
    const summary = summarizeEmiPlan([
      fee("enr1_emi-1", { amountInPaise: 500000, status: "paid" }),
      fee("enr1_emi-2", { amountInPaise: 500000, status: "waived" }),
    ], new Date("2026-08-09T00:00:00+05:30"));
    expect(summary.remainingInPaise).toBe(0);
    expect(summary.complete).toBe(true);
    expect(summary.nextDue).toBeNull();
  });

  it("treats a UPI proof awaiting approval as not-yet-paid but not payable again", () => {
    const summary = summarizeEmiPlan([
      fee("enr1_emi-1", { amountInPaise: 500000, status: "paid" }),
      fee("enr1_emi-2", { amountInPaise: 500000, status: "processing" }),
    ], new Date("2026-08-09T00:00:00+05:30"));
    expect(summary.remainingInPaise).toBe(500000);
    expect(summary.nextDue).toBeNull();
    expect(summary.processingCount).toBe(1);
  });

  it("reports an overdue installment through the derived status", () => {
    const summary = summarizeEmiPlan([
      fee("enr1_emi-1", { status: "pending", dueDate: "2026-07-01" }),
      fee("enr1_emi-2", { status: "pending", dueDate: "2026-12-01" }),
    ], new Date("2026-08-09T00:00:00+05:30"));
    expect(summary.overdueCount).toBe(1);
  });

  it("is a zeroed summary for no installments", () => {
    const summary = summarizeEmiPlan([], new Date("2026-08-09T00:00:00+05:30"));
    expect(summary.totalInPaise).toBe(0);
    expect(summary.installments).toEqual([]);
    expect(summary.nextDue).toBeNull();
    expect(summary.complete).toBe(false);
  });
});
