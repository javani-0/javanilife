export interface CourseInstallmentSnapshot {
  installmentNumber?: number;
  label?: string;
  percentage?: number;
  amountInPaise?: number;
  status?: string;
  dueDate?: string;
  paidAt?: unknown;
  lastReminderSentAt?: unknown;
  lastReminderMonthKey?: string;
  reminderCount?: number;
}

export interface CourseInstallmentPlanSnapshot {
  status?: string;
  totalInPaise?: number;
  initialPaymentInPaise?: number;
  remainingInPaise?: number;
  reminderDayOfMonth?: number;
  installments?: CourseInstallmentSnapshot[];
}

export interface CourseInstallmentOrderSnapshot {
  id: string;
  orderNumber?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerWhatsAppNumber?: string;
  address?: { phone?: string };
  payment?: {
    method?: string;
    status?: string;
    installmentPlan?: CourseInstallmentPlanSnapshot;
  };
}

export interface DueCourseInstallmentReminder {
  orderId: string;
  orderNumber?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerWhatsAppNumber?: string;
  installmentNumber: number;
  label: string;
  amountInPaise: number;
  dueDate: string;
  monthKey: string;
  installment: CourseInstallmentSnapshot;
}

const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

export const getCourseInstallmentReminderMonthKey = (date: Date) => date.toISOString().slice(0, 7);

const isDueDateReached = (dueDate: string | undefined, now: Date) => {
  if (!dueDate) return false;
  return dueDate <= toDateKey(now);
};

export const collectDueCourseInstallmentReminders = (
  orders: CourseInstallmentOrderSnapshot[],
  now = new Date(),
): DueCourseInstallmentReminder[] => {
  const monthKey = getCourseInstallmentReminderMonthKey(now);

  return orders.flatMap((order) => {
    const payment = order.payment || {};
    const plan = payment.installmentPlan;
    if (payment.status !== "partially-paid" || plan?.status !== "active" || !Array.isArray(plan.installments)) return [];

    return plan.installments
      .filter((installment) => installment.status === "pending")
      .filter((installment) => isDueDateReached(installment.dueDate, now))
      .filter((installment) => installment.lastReminderMonthKey !== monthKey)
      .map((installment) => ({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        customerName: order.customerName,
        customerPhone: order.customerPhone || order.address?.phone,
        customerWhatsAppNumber: order.customerWhatsAppNumber,
        installmentNumber: Number(installment.installmentNumber || 0),
        label: installment.label || `${installment.installmentNumber || "Next"} installment`,
        amountInPaise: Number(installment.amountInPaise || 0),
        dueDate: installment.dueDate || "",
        monthKey,
        installment,
      }))
      .filter((candidate) => candidate.installmentNumber > 1 && candidate.amountInPaise > 0);
  });
};