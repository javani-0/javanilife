import { FieldValue } from "./firebase-admin.js";
import { getWhatsAppEnvValue, sendWhatsAppTemplate, sendWhatsAppText, type WhatsAppSendResult } from "./whatsapp.js";

// ---------------------------------------------------------------------------
// OVERDUE RENTALS → the customer's WhatsApp (req 3).
//
// A rental is late the moment it passes `dueAt` while still out. From then on
// every STARTED hour costs a 24th of the day rate, so the message has to carry
// two live numbers: how late it is, and what that has come to.
//
// Mirrors src/lib/ecommerce/rentals.ts exactly — this repo already keeps fee
// maths on both sides of the wire (see README), and the two must agree to the
// paisa or the customer is quoted one figure and charged another.
//
// Nagging policy: one message when it first goes late, then at most one more
// every ESCALATION_HOURS. A late return should be chased, not spammed.
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 60 * 60 * 1000;
const ESCALATION_HOURS = 12;

export interface OverdueRentalRecord {
  id: string;
  productName: string;
  customerName: string;
  customerPhone: string;
  customerWhatsAppNumber?: string;
  quantity: number;
  days: number;
  pricePerDayInPaise: number;
  dueAt: string;
  status: string;
  notifiedOverdueHours?: number;
}

export interface RentalNoticeOutcome {
  rentalId: string;
  productName: string;
  customer: string;
  overdueHours: number;
  extraChargeInPaise: number;
  status: WhatsAppSendResult["status"] | "skipped";
  errorMessage?: string;
  /** The exact text, so a manual sender can use the same words. */
  message: string;
}

const getString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const getNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Whole hours STARTED past the due moment; 0 when not late. */
export const overdueHoursAt = (dueAt: string, now: Date): number => {
  const due = new Date(dueAt).getTime();
  if (!Number.isFinite(due)) return 0;
  const late = now.getTime() - due;
  return late > 0 ? Math.ceil(late / MS_PER_HOUR) : 0;
};

export const hourlyRateInPaise = (pricePerDayInPaise: number): number =>
  Math.round(Math.max(0, pricePerDayInPaise) / 24);

export const formatRupees = (paise: number): string =>
  `₹${(Math.round(paise) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatMoment = (value: string): string => {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "—";
  return new Date(time).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
};

export const buildOverdueMessage = (
  rental: OverdueRentalRecord,
  overdueHours: number,
  extraChargeInPaise: number,
): string => [
  `Dear ${rental.customerName || "Customer"},`,
  "",
  `Your rental *${rental.productName}*${rental.quantity > 1 ? ` (${rental.quantity} pieces)` : ""} was due back on ${formatMoment(rental.dueAt)}.`,
  "",
  `It is now *${overdueHours} hour${overdueHours === 1 ? "" : "s"} overdue*, and the extra time comes to *${formatRupees(extraChargeInPaise)}* so far.`,
  "",
  "Extra time is charged by the hour until the item is returned, so please bring it back at the earliest.",
  "",
  "Thank you — Javani Spiritual Hub (VESTRA)",
].join("\n");

/** Message again only once the lateness has meaningfully grown. */
export const shouldNotify = (rental: OverdueRentalRecord, overdueHours: number): boolean => {
  if (overdueHours <= 0) return false;
  const alreadyToldAbout = getNumber(rental.notifiedOverdueHours, 0);
  if (alreadyToldAbout <= 0) return true;
  return overdueHours - alreadyToldAbout >= ESCALATION_HOURS;
};

const templateName = () => getWhatsAppEnvValue("WHATSAPP_RENTAL_OVERDUE_TEMPLATE", "rental_overdue");
const templateLanguage = () => getWhatsAppEnvValue("WHATSAPP_TEMPLATE_LANGUAGE", "en");

/**
 * Notify one customer. A template is tried first (that is what Meta allows a
 * business to start a conversation with); if the template is not approved, a
 * plain text message is attempted, which lands whenever the customer has
 * messaged recently. Either way the exact wording is returned so the office can
 * send it by hand from the Rental Desk.
 */
export const notifyOverdueRental = async (
  rental: OverdueRentalRecord,
  overdueHours: number,
  extraChargeInPaise: number,
): Promise<RentalNoticeOutcome> => {
  const message = buildOverdueMessage(rental, overdueHours, extraChargeInPaise);
  const to = getString(rental.customerWhatsAppNumber) || getString(rental.customerPhone);

  const base = {
    rentalId: rental.id,
    productName: rental.productName,
    customer: rental.customerName,
    overdueHours,
    extraChargeInPaise,
    message,
  };

  if (!to) return { ...base, status: "failed", errorMessage: "No phone number on this booking." };

  const template = await sendWhatsAppTemplate({
    to,
    templateName: templateName(),
    languageCode: templateLanguage(),
    params: [
      rental.customerName || "Customer",
      rental.productName,
      formatMoment(rental.dueAt),
      String(overdueHours),
      formatRupees(extraChargeInPaise),
    ],
  });
  if (template.status === "sent") return { ...base, status: "sent" };

  const text = await sendWhatsAppText(to, message);
  return {
    ...base,
    status: text.status,
    errorMessage: text.status === "sent" ? undefined : (text.errorMessage || template.errorMessage),
  };
};

export interface SweepResult {
  checked: number;
  overdue: number;
  notified: number;
  outcomes: RentalNoticeOutcome[];
}

/**
 * Find every rental that is still out and past its hour, and tell the customer.
 * `dryRun` computes and returns the messages without sending or recording —
 * used by the Rental Desk to preview what the job would do.
 */
export const sweepOverdueRentals = async (
  db: FirebaseFirestore.Firestore,
  options: { now?: Date; limit?: number; dryRun?: boolean } = {},
): Promise<SweepResult> => {
  const now = options.now || new Date();
  const limit = Math.min(Math.max(1, options.limit || 200), 500);

  const snapshot = await db
    .collection("rentals")
    .where("status", "in", ["booked", "picked-up"])
    .limit(limit)
    .get();

  const outcomes: RentalNoticeOutcome[] = [];
  let overdue = 0;
  let notified = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() || {};
    const rental: OverdueRentalRecord = {
      id: docSnap.id,
      productName: getString(data.productName, "Rental item"),
      customerName: getString(data.customerName),
      customerPhone: getString(data.customerPhone),
      customerWhatsAppNumber: getString(data.customerWhatsAppNumber),
      quantity: Math.max(1, Math.round(getNumber(data.quantity, 1))),
      days: Math.max(1, Math.round(getNumber(data.days, 1))),
      pricePerDayInPaise: Math.max(0, Math.round(getNumber(data.pricePerDayInPaise))),
      dueAt: getString(data.dueAt),
      status: getString(data.status, "booked"),
      notifiedOverdueHours: getNumber(data.notifiedOverdueHours, 0),
    };

    const overdueHours = overdueHoursAt(rental.dueAt, now);
    if (overdueHours <= 0) continue;
    overdue += 1;

    const extraChargeInPaise = overdueHours * hourlyRateInPaise(rental.pricePerDayInPaise) * rental.quantity;

    // The live figure is always written back, so the desk shows the truth even
    // when no message goes out.
    if (!options.dryRun) {
      await docSnap.ref.update({
        overdueHours,
        extraChargeInPaise,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    if (!shouldNotify(rental, overdueHours)) {
      outcomes.push({
        rentalId: rental.id,
        productName: rental.productName,
        customer: rental.customerName,
        overdueHours,
        extraChargeInPaise,
        status: "skipped",
        message: buildOverdueMessage(rental, overdueHours, extraChargeInPaise),
      });
      continue;
    }

    if (options.dryRun) {
      outcomes.push({
        rentalId: rental.id,
        productName: rental.productName,
        customer: rental.customerName,
        overdueHours,
        extraChargeInPaise,
        status: "manual-ready",
        message: buildOverdueMessage(rental, overdueHours, extraChargeInPaise),
      });
      continue;
    }

    const outcome = await notifyOverdueRental(rental, overdueHours, extraChargeInPaise);
    outcomes.push(outcome);
    if (outcome.status === "sent") {
      notified += 1;
      await docSnap.ref.update({
        notifiedOverdueHours: overdueHours,
        overdueNotifiedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  return { checked: snapshot.size, overdue, notified, outcomes };
};
