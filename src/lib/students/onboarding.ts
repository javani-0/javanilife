import { doc, onSnapshot, type DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import { ONBOARDING_LINKS_COLLECTION } from "./students";
import type { EmiSplitConfig, FeeBreakdownRow, OnboardingLinkDoc, OnboardingStatus, StudentCredential, StudentDoc } from "./types";

// ---------------------------------------------------------------------------
// The public onboarding payment link (req 2). Parents open /pay/:token from
// WhatsApp — no login. The page live-subscribes to the link doc (public GET by
// unguessable token) and every write goes through the token-authorized server
// actions below.
// ---------------------------------------------------------------------------

const getString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeOnboardingLink = (token: string, data: DocumentData = {}): OnboardingLinkDoc => {
  const methods = (data.methods || {}) as DocumentData;
  const credentials = (data.credentials || null) as DocumentData | null;
  const rawEmiSplit = data.emiSplit as DocumentData | null;
  const emiSplit: EmiSplitConfig | undefined = rawEmiSplit && typeof rawEmiSplit === "object"
    && typeof rawEmiSplit.upfrontPercentage === "number"
    && Array.isArray(rawEmiSplit.installmentPercentages)
    ? { upfrontPercentage: rawEmiSplit.upfrontPercentage, installmentPercentages: rawEmiSplit.installmentPercentages }
    : undefined;
  return {
    token,
    studentDocId: getString(data.studentDocId),
    studentName: getString(data.studentName),
    parentName: getString(data.parentName),
    className: getString(data.className),
    slotLabel: getString(data.slotLabel) || undefined,
    trainerName: getString(data.trainerName) || undefined,
    rows: Array.isArray(data.rows)
      ? data.rows
          .map((row: DocumentData): FeeBreakdownRow => ({ label: getString(row?.label), amountInPaise: Math.round(toNumber(row?.amountInPaise)) }))
          .filter((row) => row.label)
      : [],
    totalInPaise: Math.max(0, Math.round(toNumber(data.totalInPaise))),
    methods: {
      razorpay: methods.razorpay === true,
      qr: methods.qr === true,
      counter: methods.counter === true,
      emi: methods.emi === true,
    },
    status: (getString(data.status) || "awaiting-payment") as OnboardingStatus,
    rejectReason: getString(data.rejectReason) || undefined,
    freeMonthNote: getString(data.freeMonthNote) || undefined,
    emiSplit,
    emiInstallments: Array.isArray(data.emiInstallments)
      ? data.emiInstallments
          .map((row: DocumentData): FeeBreakdownRow => ({ label: getString(row?.label), amountInPaise: Math.round(toNumber(row?.amountInPaise)) }))
          .filter((row) => row.label && row.amountInPaise > 0)
      : undefined,
    credentials: credentials && getString(credentials.email)
      ? { email: getString(credentials.email), password: getString(credentials.password), studentId: getString(credentials.studentId) }
      : undefined,
    updatedAt: data.updatedAt,
  };
};

/** Live view of one payment link (public — token is the capability). */
export const subscribeToOnboardingLink = (
  token: string,
  onChange: (link: OnboardingLinkDoc | null) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  doc(db, ONBOARDING_LINKS_COLLECTION, token),
  (snapshot) => onChange(snapshot.exists() ? normalizeOnboardingLink(snapshot.id, snapshot.data()) : null),
  (error) => onError?.(error),
);

const postJson = async <T>(url: string, payload: unknown, idToken?: string): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof (data as { error?: string })?.error === "string" && (data as { error: string }).error.trim()
      ? (data as { error: string }).error
      : "Request failed. Please try again.";
    throw new Error(message);
  }
  return data as T;
};

/** Parent: submit a UPI screenshot ("qr") or choose pay-at-counter ("counter"). */
export const submitOnboardingPayment = (
  token: string,
  method: "qr" | "counter",
  params?: { proofUrl?: string; upiRef?: string },
): Promise<{ ok: boolean; status: OnboardingStatus }> =>
  postJson("/api/razorpay/onboarding-submit", { token, method, ...params });

export interface OnboardingOrderResponse {
  orderId: string;
  amountInPaise: number;
  currency: string;
  keyId: string;
}

/** Parent: create a Razorpay order for the onboarding total (server-priced). */
export const createOnboardingOrder = (token: string): Promise<OnboardingOrderResponse> =>
  postJson("/api/razorpay/onboarding-order", { token });

/** Parent: report the Razorpay success payload; server verifies the signature. */
export const verifyOnboardingPayment = (
  token: string,
  payload: { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string },
): Promise<{ ok: boolean; status: OnboardingStatus }> =>
  postJson("/api/razorpay/onboarding-verify", { token, ...payload });

export interface ApproveOnboardingResponse {
  ok: boolean;
  studentId: string;
  uid: string;
  enrollmentId: string;
  credentials: { email: string; password: string; studentId: string };
  warnings?: string[];
}

/**
 * Staff: approve the onboarding — generates the STU id, creates the login
 * (password = student id), the enrollment, and the paid fee record; or reject
 * with a reason (parent sees it live on the link).
 */
export const approveOnboarding = (
  idToken: string,
  params: { studentDocId: string; approve: boolean; paymentMethod?: "upi" | "cash" | "manual"; rejectReason?: string },
): Promise<ApproveOnboardingResponse> =>
  postJson("/api/razorpay/approve-onboarding", params, idToken);

/**
 * ADMIN ONLY (danger zone, req): permanently delete a student and every trace —
 * fees, enrollment, link, credentials, users doc and the Auth login. Used for
 * test logins etc.; managers can't call this.
 */
export const deleteStudentCompletely = (
  idToken: string,
  studentDocId: string,
): Promise<{ ok: boolean; removed: string[] }> =>
  postJson("/api/razorpay/delete-student", { studentDocId }, idToken);

// ---------------------------------------------------------------------------
// WhatsApp share messages (sent from the admin's own WhatsApp via wa.me — the
// same model as partner/manager credential sharing; no Meta template needed).
// ---------------------------------------------------------------------------

const waUrl = (phone: string | undefined, lines: string[]): string => {
  const text = encodeURIComponent(lines.join("\n"));
  const number = (phone || "").replace(/\D/g, "");
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
};

/** The professional payment-link message for the parent (req 2). */
export const buildPaymentLinkWhatsAppUrl = (
  student: Pick<StudentDoc, "name" | "parentName" | "className" | "slotLabel" | "trainerName" | "phone">,
  totalInPaise: number,
  payUrl: string,
): string =>
  waUrl(student.phone, [
    `Dear ${student.parentName || "Parent"},`,
    "",
    `Greetings from Javani Spiritual Hub! 🙏`,
    "",
    `We're delighted to welcome *${student.name}* to *${student.className}*${student.slotLabel ? ` (${student.slotLabel})` : ""}.`,
    ...(student.trainerName ? [`Trainer: *${student.trainerName}*`] : []),
    "",
    `To confirm the admission, please complete the fee payment of *${formatPaiseAsRupees(totalInPaise)}* using the secure link below:`,
    payUrl,
    "",
    "The link shows the full fee breakdown and the payment options available to you. Once we verify the payment, your login details for the student portal will appear on the same link.",
    "",
    "If you have any questions, simply reply to this message. Thank you!",
    "— Javani Spiritual Hub",
  ]);

/** Login credentials message (req 2: admin can re-share anytime). */
export const buildStudentCredentialsWhatsAppUrl = (
  credential: Pick<StudentCredential, "email" | "password" | "studentId" | "name" | "whatsapp">,
  loginUrl: string,
): string =>
  waUrl(credential.whatsapp, [
    `Dear Parent,`,
    "",
    `${credential.name ? `*${credential.name}*'s` : "Your"} student portal login is ready! 🎉`,
    ...(credential.studentId ? ["", `Student ID: *${credential.studentId}*`] : []),
    "",
    `Login page: ${loginUrl}`,
    `User ID (email): ${credential.email}`,
    `Password: ${credential.password}`,
    "",
    "In the portal you can join the live class, watch recordings, download study materials, pay the monthly fee, and see your full payment history.",
    "",
    "Please keep these details private. — Javani Spiritual Hub",
  ]);
