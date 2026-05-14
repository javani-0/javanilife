import type { CartItem, CourseInstallmentPlan, CourseInstallmentStatus, CoursePaymentPlanOption } from "./types";

export const COURSE_INSTALLMENT_MIN_AMOUNT_IN_PAISE = 1000000;
export const COURSE_INSTALLMENT_REMINDER_DAY = 5;

export interface CourseInstallmentEligibility {
  eligible: boolean;
  reason?: string;
}

export interface CourseInstallmentPlanInput {
  totalInPaise: number;
  createdAt?: Date;
  paidAt?: Date;
}

const getSafeAmount = (amountInPaise: number) => (
  Number.isFinite(amountInPaise) ? Math.max(0, Math.round(amountInPaise)) : 0
);

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const getNextFifthDate = (fromDate: Date, monthOffset = 0) => {
  const dueDate = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), COURSE_INSTALLMENT_REMINDER_DAY));
  if (fromDate.getUTCDate() > COURSE_INSTALLMENT_REMINDER_DAY) {
    dueDate.setUTCMonth(dueDate.getUTCMonth() + 1);
  }
  dueDate.setUTCMonth(dueDate.getUTCMonth() + monthOffset);
  return dueDate;
};

const getInstallmentLabel = (installmentNumber: number) => {
  if (installmentNumber === 1) return "1st installment";
  if (installmentNumber === 2) return "2nd installment";
  return "3rd installment";
};

export const isCourseInstallmentEligible = ({
  hasCourseItems,
  hasShippableItems,
  subtotalInPaise,
}: {
  hasCourseItems: boolean;
  hasShippableItems: boolean;
  subtotalInPaise: number;
}) => hasCourseItems && !hasShippableItems && getSafeAmount(subtotalInPaise) >= COURSE_INSTALLMENT_MIN_AMOUNT_IN_PAISE;

export const getCourseInstallmentEligibility = (
  items: Pick<CartItem, "itemType">[],
  subtotalInPaise: number,
): CourseInstallmentEligibility => {
  const hasCourseItems = items.some((item) => item.itemType === "course");
  const hasShippableItems = items.some((item) => item.itemType !== "course");

  if (!hasCourseItems || hasShippableItems) {
    return { eligible: false, reason: "Installments are available only for course checkout." };
  }

  if (getSafeAmount(subtotalInPaise) < COURSE_INSTALLMENT_MIN_AMOUNT_IN_PAISE) {
    return { eligible: false, reason: "Installments are available for course payments of ₹10,000 or above." };
  }

  return { eligible: true };
};

export const getCourseCheckoutPayNowAmount = ({
  paymentPlan,
  totalInPaise,
}: {
  paymentPlan: CoursePaymentPlanOption;
  totalInPaise: number;
}) => {
  const safeTotal = getSafeAmount(totalInPaise);
  return paymentPlan === "installment" ? Math.ceil(safeTotal * 0.5) : safeTotal;
};

export const createCourseInstallmentPlan = ({
  totalInPaise,
  createdAt = new Date(),
  paidAt,
}: CourseInstallmentPlanInput): CourseInstallmentPlan => {
  const safeTotal = getSafeAmount(totalInPaise);
  const initialPaymentInPaise = Math.ceil(safeTotal * 0.5);
  const secondInstallmentInPaise = Math.floor(safeTotal * 0.25);
  const thirdInstallmentInPaise = Math.max(0, safeTotal - initialPaymentInPaise - secondInstallmentInPaise);
  const firstStatus: CourseInstallmentStatus = paidAt ? "paid" : "pending";
  const scheduleDate = paidAt || createdAt;

  return {
    status: safeTotal > 0 ? "active" : "completed",
    totalInPaise: safeTotal,
    initialPaymentInPaise,
    remainingInPaise: Math.max(0, safeTotal - initialPaymentInPaise),
    reminderDayOfMonth: COURSE_INSTALLMENT_REMINDER_DAY,
    installments: [
      {
        installmentNumber: 1,
        label: getInstallmentLabel(1),
        percentage: 50,
        amountInPaise: initialPaymentInPaise,
        status: firstStatus,
        dueDate: toIsoDate(scheduleDate),
        paidAt: paidAt?.toISOString(),
      },
      {
        installmentNumber: 2,
        label: getInstallmentLabel(2),
        percentage: 25,
        amountInPaise: secondInstallmentInPaise,
        status: "pending",
        dueDate: toIsoDate(getNextFifthDate(scheduleDate, 0)),
      },
      {
        installmentNumber: 3,
        label: getInstallmentLabel(3),
        percentage: 25,
        amountInPaise: thirdInstallmentInPaise,
        status: "pending",
        dueDate: toIsoDate(getNextFifthDate(scheduleDate, 1)),
      },
    ],
  };
};