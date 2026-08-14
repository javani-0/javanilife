import { formatPaiseAsRupees } from "@/lib/ecommerce/pricing";
import type { CourseBreakdown, StudentBreakdown } from "./feeBreakdown";
import type { FeeBreakdownRow } from "./types";

// ---------------------------------------------------------------------------
// The WhatsApp payment-link message (req: PAYMENT SPLIT-UP).
//
// A student may be enrolled in several classes but pays ONE total on ONE link.
// The message therefore has to say, per class, exactly what that class costs —
// otherwise the parent sees a single number and has to ask us how it was made.
//
// PURE + unit-tested: this module deliberately imports no Firestore, so the
// exact wording a parent receives can be asserted in tests.
// ---------------------------------------------------------------------------

/**
 * wa.me carries the whole message in the URL, so a 6-class itemised split would
 * produce an unusable link. Past these limits the split COMPRESSES to one line
 * per class (name + class total) — it is never dropped, because the per-class
 * amount is the whole point of the message.
 */
const MAX_ITEMISED_CLASSES = 4;
const MAX_ITEMISED_ROWS = 14;

const money = (amountInPaise: number): string => formatPaiseAsRupees(Math.abs(amountInPaise));

/** "Discount −₹500" reads better than "Discount ₹-500". */
const rowLine = (row: FeeBreakdownRow): string =>
  `   • ${row.label}: ${row.amountInPaise < 0 ? "−" : ""}${money(row.amountInPaise)}`;

const classHeading = (section: CourseBreakdown, index: number, total: number): string => {
  const name = section.className || `Class ${index + 1}`;
  const numbered = total > 1 ? `${index + 1}) ` : "";
  return `${numbered}*${name}*${section.slotLabel ? ` (${section.slotLabel})` : ""}`;
};

/** Whether the itemised form still fits comfortably in a wa.me URL. */
export const shouldItemiseSplit = (sections: CourseBreakdown[]): boolean =>
  sections.length <= MAX_ITEMISED_CLASSES
  && sections.reduce((sum, section) => sum + section.rows.length, 0) <= MAX_ITEMISED_ROWS;

/**
 * The per-class split-up block of the message (req 1). One entry per class with
 * its own charges and its own total, then the combined amount.
 */
export const buildPaymentSplitLines = (breakdown: StudentBreakdown): string[] => {
  const sections = breakdown.sections || [];
  if (sections.length === 0) return [];

  const itemise = shouldItemiseSplit(sections);
  const lines: string[] = [
    sections.length > 1 ? `*Fee split-up (${sections.length} classes)*` : "*Fee split-up*",
    "",
  ];

  sections.forEach((section, index) => {
    lines.push(classHeading(section, index, sections.length));
    if (itemise) {
      section.rows.forEach((row) => lines.push(rowLine(row)));
      lines.push(`   *Class total: ${money(section.totalInPaise)}*`);
    } else {
      lines.push(`   *${money(section.totalInPaise)}*`);
    }
    // Admission money and the monthly fee are different promises — say so on
    // the class it belongs to, never as one blended footnote.
    if (section.recurring) {
      lines.push(`   (then ${money(section.recurring.amountInPaise)} / month)`);
    }
    if (section.dueNowInPaise > 0 && section.dueNowInPaise !== section.totalInPaise) {
      lines.push(`   Payable now for this class: *${money(section.dueNowInPaise)}*`);
    }
    lines.push("");
  });

  lines.push(sections.length > 1
    ? `*TOTAL for ${sections.length} classes: ${money(breakdown.grandTotalInPaise)}*`
    : `*TOTAL: ${money(breakdown.grandTotalInPaise)}*`);
  // When the classes are on installments the parent owes only part of that
  // total today. Saying so HERE stops the two numbers looking like a mistake.
  if (breakdown.dueNowInPaise > 0 && breakdown.dueNowInPaise !== breakdown.grandTotalInPaise) {
    lines.push(`*Payable now: ${money(breakdown.dueNowInPaise)}*`);
  }
  return lines;
};

export interface PaymentLinkStudent {
  name: string;
  parentName?: string;
  className?: string;
  slotLabel?: string;
  trainerName?: string;
  phone?: string;
}

const waUrl = (phone: string | undefined, lines: string[]): string => {
  const text = encodeURIComponent(lines.join("\n"));
  const number = (phone || "").replace(/\D/g, "");
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
};

/** How the classes are named in the greeting: one class, or "N classes". */
const welcomeSuffix = (student: PaymentLinkStudent, breakdown: StudentBreakdown): string => {
  const sections = breakdown.sections || [];
  if (sections.length > 1) return `our ${sections.length} classes`;
  const section = sections[0];
  const name = section?.className || student.className || "our classes";
  const slot = section?.slotLabel || student.slotLabel;
  return `*${name}*${slot ? ` (${slot})` : ""}`;
};

/**
 * The professional payment-link message for the parent (req 2 + split-up).
 *
 * On an EMI onboarding the message asks for the FIRST INSTALLMENT only —
 * `breakdown.dueNowInPaise` is what to pay today and `emi` carries the whole
 * schedule so the parent still sees the full picture.
 */
export const buildPaymentLinkWhatsAppUrl = (
  student: PaymentLinkStudent,
  breakdown: StudentBreakdown,
  payUrl: string,
  emi?: { totalInPaise: number; installments: FeeBreakdownRow[] },
): string => {
  const dueNowInPaise = breakdown.dueNowInPaise;
  const splitLines = buildPaymentSplitLines(breakdown);

  const askLines = emi
    ? [
        `The course fee is *${money(emi.totalInPaise)}*, payable in *${emi.installments.length} installments*.`,
        "",
        `To confirm the admission, please pay the *1st installment of ${money(dueNowInPaise)}* now using the secure link below:`,
        payUrl,
        "",
        "Payment schedule:",
        ...emi.installments.map((row, index) => `${index + 1}. ${row.label} — ${money(row.amountInPaise)}`),
        "",
        "Once you've paid, tap *\"I've paid the 1st installment\"* on the link (you may attach the payment screenshot — it's optional). We'll verify it and your student-portal login will appear on the same link.",
        "",
        `The remaining ${emi.installments.length - 1} installment${emi.installments.length === 2 ? "" : "s"} are NOT due today. After you log in they appear under *My Classes → EMI installments*, and you can pay them any time from there.`,
      ]
    : [
        dueNowInPaise !== breakdown.grandTotalInPaise
          ? `To confirm the admission, please pay *${money(dueNowInPaise)}* now — the first installment across the classes above — using the secure link below:`
          : `To confirm the admission, please complete the fee payment of *${money(dueNowInPaise)}* using the secure link below:`,
        payUrl,
        "",
        "The link shows the same split-up along with the payment options available to you. Once we verify the payment, your login details for the student portal will appear on the same link.",
      ];

  return waUrl(student.phone, [
    `Dear ${student.parentName || "Parent"},`,
    "",
    "Greetings from Javani Spiritual Hub! 🙏",
    "",
    `We're delighted to welcome *${student.name}* to ${welcomeSuffix(student, breakdown)}.`,
    ...(student.trainerName ? [`Trainer: *${student.trainerName}*`] : []),
    "",
    ...(splitLines.length > 0 ? [...splitLines, ""] : []),
    ...askLines,
    "",
    "If you have any questions, simply reply to this message. Thank you!",
    "— Javani Spiritual Hub",
  ]);
};
