import { formatPaiseAsRupees } from "./pricing";
import { formatRentalMoment } from "./rentals";

// ---------------------------------------------------------------------------
// What the customer is actually told when a rental runs late (req 3).
//
// The wording lives here, not in the page, because the SAME message goes out
// two ways: the automatic overdue job sends it, and the rental desk can send it
// by hand from the admin's own WhatsApp. Nobody should have to wonder which
// version the customer received.
// ---------------------------------------------------------------------------

export interface RentalOverdueContext {
  overdueHours: number;
  extraChargeInPaise: number;
}

export interface RentalMessageBooking {
  productName: string;
  customerName: string;
  customerPhone: string;
  customerWhatsAppNumber?: string;
  quantity: number;
  dueAt: string;
  pricePerDayInPaise: number;
}

const hourWord = (hours: number): string => `${hours} hour${hours === 1 ? "" : "s"}`;

/** The plain-text body — identical on both routes. */
export const buildRentalOverdueMessage = (
  booking: RentalMessageBooking,
  context: RentalOverdueContext,
): string => [
  `Dear ${booking.customerName || "Customer"},`,
  "",
  `Your rental *${booking.productName}*${booking.quantity > 1 ? ` (${booking.quantity} pieces)` : ""} was due back on ${formatRentalMoment(booking.dueAt)}.`,
  "",
  `It is now *${hourWord(context.overdueHours)} overdue*, and the extra time comes to *${formatPaiseAsRupees(context.extraChargeInPaise)}* so far.`,
  "",
  "Extra time is charged by the hour until the item is returned, so please bring it back at the earliest.",
  "",
  "Thank you — Javani Spiritual Hub (VASTRA)",
].join("\n");

/** wa.me link so the admin can send it from their own phone. */
export const buildRentalOverdueWhatsAppUrl = (
  booking: RentalMessageBooking,
  context: RentalOverdueContext,
): string => {
  const number = (booking.customerWhatsAppNumber || booking.customerPhone || "").replace(/\D/g, "");
  const text = encodeURIComponent(buildRentalOverdueMessage(booking, context));
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
};

/** A short line for the return receipt / toast. */
export const describeRentalCharges = (
  baseInPaise: number,
  extraChargeInPaise: number,
): string => (extraChargeInPaise > 0
  ? `${formatPaiseAsRupees(baseInPaise)} rental + ${formatPaiseAsRupees(extraChargeInPaise)} late = ${formatPaiseAsRupees(baseInPaise + extraChargeInPaise)}`
  : `${formatPaiseAsRupees(baseInPaise)} rental, nothing extra`);

export interface RentalOverdueSweepResult {
  ok: boolean;
  checked: number;
  overdue: number;
  notified: number;
  whatsappConfigured: boolean;
  message?: string;
  outcomes?: {
    rentalId: string; productName: string; customer: string;
    overdueHours: number; extraChargeInPaise: number; status: string; errorMessage?: string;
  }[];
}

/**
 * Staff: run the overdue check right now instead of waiting for the daily job
 * (req 3). `dryRun` previews without sending or recording anything.
 */
export const runRentalOverdueSweep = async (
  idToken: string,
  options: { dryRun?: boolean } = {},
): Promise<RentalOverdueSweepResult> => {
  const response = await fetch("/api/razorpay/rental-overdue", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun: options.dryRun === true }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Could not run the overdue check.");
  return data as RentalOverdueSweepResult;
};
