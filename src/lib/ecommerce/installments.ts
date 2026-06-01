import type { CartItem, CourseInstallmentPlan, CourseInstallmentStatus, CoursePaymentPlanOption, EmiSettings } from "./types";
import { DEFAULT_EMI_SETTINGS } from "./types";

// Backward-compatible export — old code can still import this constant
export const COURSE_INSTALLMENT_MIN_AMOUNT_IN_PAISE = DEFAULT_EMI_SETTINGS.minAmountInPaise;
export const COURSE_INSTALLMENT_REMINDER_DAY = DEFAULT_EMI_SETTINGS.reminderDaysBefore;

export interface CourseInstallmentEligibility {
  eligible: boolean;
  reason?: string;
}

export interface CourseInstallmentPlanInput {
  totalInPaise: number;
  createdAt?: Date;
  paidAt?: Date;
  emiSettings?: EmiSettings;
}

const getSafeAmount = (amountInPaise: number) => (
  Number.isFinite(amountInPaise) ? Math.max(0, Math.round(amountInPaise)) : 0
);

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

const getNextMonthDate = (fromDate: Date, monthOffset: number, dayOfMonth: number) => {
  const dueDate = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth() + 1 + monthOffset, dayOfMonth));
  return dueDate;
};

const getInstallmentLabel = (installmentNumber: number, totalInstallments: number) => {
  if (installmentNumber === 1) return "1st installment";
  if (installmentNumber === 2) return "2nd installment";
  if (installmentNumber === 3) return "3rd installment";
  return `${installmentNumber}th installment`;
};

// ── EMI Eligibility ──

export const getEmiEligibility = (
  items: Pick<CartItem, "itemType">[],
  subtotalInPaise: number,
  emiSettings: EmiSettings = DEFAULT_EMI_SETTINGS,
): CourseInstallmentEligibility => {
  if (!emiSettings.enabled) {
    return { eligible: false, reason: "EMI option is currently disabled." };
  }

  if (items.length === 0) {
    return { eligible: false, reason: "Cart is empty." };
  }

  const minAmount = getSafeAmount(emiSettings.minAmountInPaise);
  const minRupees = Math.round(minAmount / 100);

  if (getSafeAmount(subtotalInPaise) < minAmount) {
    return { eligible: false, reason: `EMI is available for orders of ₹${minRupees.toLocaleString("en-IN")} or above.` };
  }

  return { eligible: true };
};

// Backward-compatible alias
export const getCourseInstallmentEligibility = (
  items: Pick<CartItem, "itemType">[],
  subtotalInPaise: number,
  emiSettings?: EmiSettings,
): CourseInstallmentEligibility => getEmiEligibility(items, subtotalInPaise, emiSettings);

// ── EMI Pay Now Amount ──

export const getEmiPayNowAmount = ({
  paymentPlan,
  totalInPaise,
  emiSettings = DEFAULT_EMI_SETTINGS,
}: {
  paymentPlan: CoursePaymentPlanOption;
  totalInPaise: number;
  emiSettings?: EmiSettings;
}) => {
  const safeTotal = getSafeAmount(totalInPaise);
  if (paymentPlan !== "installment") return safeTotal;
  return Math.ceil(safeTotal * (emiSettings.upfrontPercentage / 100));
};

// Backward-compatible alias
export const getCourseCheckoutPayNowAmount = getEmiPayNowAmount;

// ── EMI Installment Plan ──

export const createEmiInstallmentPlan = ({
  totalInPaise,
  createdAt = new Date(),
  paidAt,
  emiSettings = DEFAULT_EMI_SETTINGS,
}: CourseInstallmentPlanInput): CourseInstallmentPlan => {
  const safeTotal = getSafeAmount(totalInPaise);
  const upfrontPct = emiSettings.upfrontPercentage;
  const installmentPcts = emiSettings.installmentPercentages;
  const totalInstallments = 1 + installmentPcts.length;

  // Calculate amounts
  const initialPaymentInPaise = Math.ceil(safeTotal * (upfrontPct / 100));
  const installmentAmounts = installmentPcts.map((pct) => Math.floor(safeTotal * (pct / 100)));

  // Adjust last installment to absorb rounding difference
  const totalScheduled = initialPaymentInPaise + installmentAmounts.reduce((a, b) => a + b, 0);
  const difference = safeTotal - totalScheduled;
  if (installmentAmounts.length > 0) {
    installmentAmounts[installmentAmounts.length - 1] += difference;
  }

  const firstStatus: CourseInstallmentStatus = paidAt ? "paid" : "pending";
  const scheduleDate = paidAt || createdAt;
  const reminderDay = emiSettings.reminderDaysBefore;

  const installments = [
    {
      installmentNumber: 1,
      label: getInstallmentLabel(1, totalInstallments),
      percentage: upfrontPct,
      amountInPaise: initialPaymentInPaise,
      status: firstStatus,
      dueDate: toIsoDate(scheduleDate),
      paidAt: paidAt?.toISOString(),
    },
    ...installmentPcts.map((pct, index) => ({
      installmentNumber: index + 2,
      label: getInstallmentLabel(index + 2, totalInstallments),
      percentage: pct,
      amountInPaise: installmentAmounts[index],
      status: "pending" as CourseInstallmentStatus,
      dueDate: toIsoDate(getNextMonthDate(scheduleDate, index, 5)),
    })),
  ];

  return {
    status: safeTotal > 0 ? "active" : "completed",
    totalInPaise: safeTotal,
    initialPaymentInPaise,
    remainingInPaise: Math.max(0, safeTotal - initialPaymentInPaise),
    reminderDayOfMonth: 5,
    installments,
  };
};

// Backward-compatible alias
export const createCourseInstallmentPlan = createEmiInstallmentPlan;

// ── Helper: Get recurring installment amount for Razorpay Subscription ──

export const getEmiRecurringAmount = (
  totalInPaise: number,
  emiSettings: EmiSettings = DEFAULT_EMI_SETTINGS,
): number => {
  const safeTotal = getSafeAmount(totalInPaise);
  if (emiSettings.installmentPercentages.length === 0) return 0;
  // All recurring installments should be the same amount for Razorpay Subscriptions
  // Use the first installment percentage
  return Math.floor(safeTotal * (emiSettings.installmentPercentages[0] / 100));
};

export const getEmiRecurringCount = (emiSettings: EmiSettings = DEFAULT_EMI_SETTINGS): number =>
  emiSettings.installmentPercentages.length;

// ── Format helpers ──

export const formatEmiSummary = (emiSettings: EmiSettings = DEFAULT_EMI_SETTINGS): string => {
  const parts = [`${emiSettings.upfrontPercentage}% upfront`];
  emiSettings.installmentPercentages.forEach((pct, i) => {
    parts.push(`${pct}%`);
  });
  return parts.join(" + ");
};

export const isCourseInstallmentEligible = ({
  hasCourseItems,
  hasShippableItems,
  subtotalInPaise,
}: {
  hasCourseItems: boolean;
  hasShippableItems: boolean;
  subtotalInPaise: number;
}) => subtotalInPaise >= DEFAULT_EMI_SETTINGS.minAmountInPaise;