import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ClassEmiCard from "@/components/account/ClassEmiCard";
import type { EnrollmentDoc, FeePaymentDoc } from "@/lib/classes";

// ---------------------------------------------------------------------------
// The EMI Payments regression (req 5).
//
// /account/emi read only the e-commerce `orders` collection, so students on a
// CLASS EMI plan saw "No EMI Orders Found" while their installments rendered
// on the Classes tab. These tests pin the class-EMI card to the shape the live
// data actually has: `feePayments/${enrollmentId}_emi-N` docs.
// ---------------------------------------------------------------------------

vi.mock("@/lib/firebase", () => ({ db: {}, auth: {}, default: {} }));

const enrollment = (over: Partial<EnrollmentDoc> = {}): EnrollmentDoc => ({
  id: "enr1",
  classId: "cls1",
  className: "NATTUVANGAM ON KUCHIPUDI DIPLOMA 1st SEM",
  status: "active",
  student: { name: "SAMVIDHA CHANDRAS" },
  parent: { name: "Parent", phone: "9" },
  parentUserId: "uid1",
  slotLabel: "Sat · 4:00 PM – 6:00 PM",
  ...over,
} as unknown as EnrollmentDoc);

const fee = (id: string, over: Partial<FeePaymentDoc> = {}): FeePaymentDoc => ({
  id,
  enrollmentId: "enr1",
  classId: "cls1",
  className: "NATTUVANGAM ON KUCHIPUDI DIPLOMA 1st SEM",
  parentUserId: "uid1",
  studentName: "SAMVIDHA CHANDRAS",
  parentName: "Parent",
  parentPhone: "9",
  monthKey: "2026-08",
  periodLabel: "Installment 1",
  amountInPaise: 500000,
  dueDate: "2026-08-01",
  status: "pending",
  ...over,
} as FeePaymentDoc);

const renderCard = (fees: FeePaymentDoc[], onPay = vi.fn()) => {
  render(
    <MemoryRouter>
      <ClassEmiCard enrollment={enrollment()} fees={fees} busyId={null} onPay={onPay} />
    </MemoryRouter>,
  );
  return onPay;
};

const PLAN = [
  fee("enr1_emi-1", { periodLabel: "Installment 1", amountInPaise: 500000, status: "paid" }),
  fee("enr1_emi-2", { periodLabel: "Installment 2", amountInPaise: 250000, status: "pending", dueDate: "2026-09-01" }),
  fee("enr1_emi-3", { periodLabel: "Installment 3", amountInPaise: 250000, status: "pending", dueDate: "2026-10-01" }),
];

describe("class EMI card", () => {
  it("names the COURSE the plan belongs to — the client could not tell before", () => {
    renderCard(PLAN);
    expect(screen.getByText("NATTUVANGAM ON KUCHIPUDI DIPLOMA 1st SEM")).toBeInTheDocument();
    expect(screen.getByText("SAMVIDHA CHANDRAS")).toBeInTheDocument();
  });

  it("lists every installment with its amount", () => {
    renderCard(PLAN);
    expect(screen.getByText(/Installment 1 —/)).toBeInTheDocument();
    expect(screen.getByText(/Installment 2 —/)).toBeInTheDocument();
    expect(screen.getByText(/Installment 3 —/)).toBeInTheDocument();
  });

  it("shows paid-of-total, what is still owed, and how many are left", () => {
    renderCard(PLAN);
    // Scope to the summary line — the amounts also appear on the rows below.
    const summary = screen.getByText(/installments$/).textContent || "";
    expect(summary).toContain("5,000");   // paid so far
    expect(summary).toContain("10,000");  // plan total
    expect(summary).toContain("remaining");
    expect(summary).toContain("1/3 installments");
  });

  it("offers Pay now on the unpaid installments only", () => {
    renderCard(PLAN);
    expect(screen.getAllByRole("button", { name: /Pay now/i })).toHaveLength(2);
  });

  it("hands the right fee to the payment handler", async () => {
    const onPay = renderCard(PLAN);
    const buttons = screen.getAllByRole("button", { name: /Pay now/i });
    buttons[0].click();
    expect(onPay).toHaveBeenCalledTimes(1);
    expect(onPay.mock.calls[0][0].id).toBe("enr1_emi-2");
  });

  it("marks a finished plan as fully paid and offers nothing to pay", () => {
    renderCard(PLAN.map((item) => ({ ...item, status: "paid" as const })));
    expect(screen.getByText(/Fully Paid/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pay now/i })).toBeNull();
  });

  it("shows a submitted UPI proof as awaiting approval, not payable again", () => {
    renderCard([
      fee("enr1_emi-1", { status: "paid" }),
      fee("enr1_emi-2", { periodLabel: "Installment 2", status: "processing" }),
    ]);
    expect(screen.getByText(/Awaiting admin approval/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pay now/i })).toBeNull();
  });

  it("renders nothing when the enrolment has no installments", () => {
    const { container } = render(
      <MemoryRouter>
        <ClassEmiCard enrollment={enrollment()} fees={[fee("enr1_2026-08")]} busyId={null} onPay={vi.fn()} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("falls back to the class schedule when the enrolment has no slot label", () => {
    render(
      <MemoryRouter>
        <ClassEmiCard
          enrollment={enrollment({ slotLabel: "" })}
          fees={PLAN}
          scheduleLabel="Mon & Wed · 6:00 PM – 7:00 PM"
          busyId={null}
          onPay={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Mon & Wed · 6:00 PM – 7:00 PM")).toBeInTheDocument();
  });

  it("links through to the class room", () => {
    renderCard(PLAN);
    expect(screen.getByRole("link", { name: /Open class/i })).toHaveAttribute("href", "/account/classes/enr1");
  });
});
