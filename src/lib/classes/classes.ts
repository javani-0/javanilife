import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import { createEmiInstallmentPlan } from "@/lib/ecommerce/installments";
import type { CourseInstallmentPlan, EmiSettings } from "@/lib/ecommerce/types";
import {
  clampBillingDay,
  DEFAULT_CLASS_EMI_CONFIG,
  DEFAULT_CLASS_PAYMENT_OPTIONS,
  type ClassDoc,
  type ClassEmiConfig,
  type ClassFeeType,
  type ClassPaymentMethod,
  type ClassPaymentOptions,
  type ClassTimeSlot,
  type ClassTrack,
} from "./types";

export const CLASSES_COLLECTION = "classes";

// Weekdays in display order (Mon-first). Value stored is the short label.
export const WEEKDAYS = [
  { value: "Mon", label: "Mon" },
  { value: "Tue", label: "Tue" },
  { value: "Wed", label: "Wed" },
  { value: "Thu", label: "Thu" },
  { value: "Fri", label: "Fri" },
  { value: "Sat", label: "Sat" },
  { value: "Sun", label: "Sun" },
] as const;

const WEEKDAY_ORDER = WEEKDAYS.map((day) => day.value as string);

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** "18:00" → "6:00 PM". Returns the input unchanged if not a HH:MM string. */
export const formatTime12 = (value: string): string => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || "");
  if (!match) return value || "";
  const hours = Number(match[1]);
  const minutes = match[2];
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${period}`;
};

/** Sort selected days into week order and join readably (collapses Mon–Fri). */
export const formatScheduleDays = (days: string[] = []): string => {
  const ordered = WEEKDAY_ORDER.filter((day) => days.includes(day));
  if (ordered.length === 0) return "";
  const isMonToFri = ordered.length === 5 && ["Mon", "Tue", "Wed", "Thu", "Fri"].every((day) => ordered.includes(day));
  if (isMonToFri) return "Mon–Fri";
  if (ordered.length === 7) return "Every day";
  if (ordered.length === 1) return ordered[0];
  return `${ordered.slice(0, -1).join(", ")} & ${ordered[ordered.length - 1]}`;
};

/** "Mon–Fri · 6:00 PM – 7:00 PM" from structured parts. */
export const composeSchedule = (days: string[] = [], start = "", end = ""): string => {
  const dayPart = formatScheduleDays(days);
  const timePart = start && end ? `${formatTime12(start)} – ${formatTime12(end)}` : start ? formatTime12(start) : "";
  return [dayPart, timePart].filter(Boolean).join(" · ");
};

/** "8–16 yrs" from from/to ages. */
export const composeAgeGroup = (from?: number, to?: number): string => {
  if (from && to) return `${from}–${to} yrs`;
  if (from) return `${from}+ yrs`;
  if (to) return `Up to ${to} yrs`;
  return "";
};

/**
 * Calendar months a course RUNS THROUGH, inclusive of both endpoints (min 1).
 * 14 Jul → 31 Dec touches Jul, Aug, Sep, Oct, Nov, Dec = 6 months (the old
 * difference-only count said 5 — user-reported bug). 0 if unparseable.
 */
export const monthsBetween = (startDate?: string, endDate?: string): number => {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  return Math.max(1, months);
};

/** Normalize one stored/draft time slot, recomposing its display label. */
export const normalizeTimeSlot = (raw: Partial<ClassTimeSlot> & { id?: string }, index = 0): ClassTimeSlot => {
  const days = Array.isArray(raw.days) ? raw.days.filter((day): day is string => typeof day === "string") : [];
  const start = typeof raw.start === "string" ? raw.start : "";
  const end = typeof raw.end === "string" ? raw.end : "";
  return {
    id: raw.id || `slot-${index + 1}`,
    days,
    start,
    end,
    label: composeSchedule(days, start, end) || `Slot ${index + 1}`,
    seatsTotal: raw.seatsTotal != null ? Math.max(0, Math.round(toNumber(raw.seatsTotal))) : undefined,
    seatsTaken: raw.seatsTaken != null ? Math.max(0, Math.round(toNumber(raw.seatsTaken))) : undefined,
  };
};

const normalizePaymentOptions = (raw: unknown): ClassPaymentOptions => {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CLASS_PAYMENT_OPTIONS };
  const data = raw as Record<string, unknown>;
  return {
    autopay: data.autopay === true,
    manual: data.manual === true,
    full: data.full === true,
    emi: data.emi === true,
    cash: data.cash === true,
  };
};

const normalizeEmiConfig = (raw: unknown): ClassEmiConfig | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const data = raw as Record<string, unknown>;
  const upfront = Math.round(toNumber(data.upfrontPercentage, DEFAULT_CLASS_EMI_CONFIG.upfrontPercentage));
  const pcts = Array.isArray(data.installmentPercentages)
    ? data.installmentPercentages.map((value) => Math.round(toNumber(value))).filter((value) => value > 0)
    : [];
  return {
    upfrontPercentage: Math.min(100, Math.max(1, upfront)),
    installmentPercentages: pcts.length > 0 ? pcts : [...DEFAULT_CLASS_EMI_CONFIG.installmentPercentages],
    emiSurchargeInPaise: Math.max(0, Math.round(toNumber(data.emiSurchargeInPaise, 0))),
  };
};

/** The flat EMI convenience fee (paise) configured for a class's EMI split. */
export const getClassEmiSurchargeInPaise = (emi?: Pick<ClassEmiConfig, "emiSurchargeInPaise">): number =>
  Math.max(0, Math.round(Number(emi?.emiSurchargeInPaise || 0)));

/** The total a parent pays via EMI: base term fee + the flat EMI surcharge. */
export const getClassEmiTotalInPaise = (termFeeInPaise: number, emi?: Pick<ClassEmiConfig, "emiSurchargeInPaise">): number =>
  Math.max(0, Math.round(Number(termFeeInPaise || 0))) + getClassEmiSurchargeInPaise(emi);

/** Adapt a per-class EMI split into the ecommerce EmiSettings shape (for the math helpers). */
export const classEmiToSettings = (emi: ClassEmiConfig): EmiSettings => ({
  enabled: true,
  minAmountInPaise: 0,
  upfrontPercentage: emi.upfrontPercentage,
  installmentPercentages: emi.installmentPercentages,
  reminderDaysBefore: 5,
});

/** Build the installment schedule for a term class, reusing the course EMI math. */
export const buildClassEmiPlan = (
  termFeeInPaise: number,
  emi: ClassEmiConfig,
  createdAt: Date = new Date(),
): CourseInstallmentPlan =>
  createEmiInstallmentPlan({ totalInPaise: termFeeInPaise, createdAt, emiSettings: classEmiToSettings(emi) });

export const normalizeClass = (id: string, data: DocumentData = {}): ClassDoc => ({
  id,
  name: typeof data.name === "string" ? data.name : "Untitled Class",
  description: typeof data.description === "string" ? data.description : "",
  image: typeof data.image === "string" ? data.image : "",
  category: typeof data.category === "string" ? data.category : "",
  facultyId: typeof data.facultyId === "string" ? data.facultyId : "",
  facultyName: typeof data.facultyName === "string" ? data.facultyName : "",
  schedule: typeof data.schedule === "string" ? data.schedule : "",
  scheduleDays: Array.isArray(data.scheduleDays) ? data.scheduleDays.filter((day: unknown): day is string => typeof day === "string") : [],
  scheduleStart: typeof data.scheduleStart === "string" ? data.scheduleStart : "",
  scheduleEnd: typeof data.scheduleEnd === "string" ? data.scheduleEnd : "",
  ageGroup: typeof data.ageGroup === "string" ? data.ageGroup : "",
  ageFrom: data.ageFrom != null ? Math.max(0, Math.round(toNumber(data.ageFrom))) : undefined,
  ageTo: data.ageTo != null ? Math.max(0, Math.round(toNumber(data.ageTo))) : undefined,
  monthlyFeeInPaise: Math.max(0, Math.round(toNumber(data.monthlyFeeInPaise))),
  autopayDiscountInPaise: data.autopayDiscountInPaise != null ? Math.max(0, Math.round(toNumber(data.autopayDiscountInPaise))) : undefined,
  billingDayOfMonth: clampBillingDay(toNumber(data.billingDayOfMonth, 1)),
  active: data.active !== false,
  razorpayPlanId: typeof data.razorpayPlanId === "string" ? data.razorpayPlanId : "",
  seatsTotal: data.seatsTotal != null ? Math.max(0, Math.round(toNumber(data.seatsTotal))) : undefined,
  seatsTaken: data.seatsTaken != null ? Math.max(0, Math.round(toNumber(data.seatsTaken))) : undefined,
  // New: fee type, term fields, payment options, EMI split, time slots.
  // Legacy docs (no feeType) read as "monthly" with autopay+manual enabled.
  feeType: data.feeType === "term" ? "term" : "monthly",
  // Track capabilities — fall back to feeType so existing single-type classes
  // keep behaving exactly as before.
  offersMonthly: data.offersMonthly != null ? data.offersMonthly === true : data.feeType !== "term",
  offersTerm: data.offersTerm != null ? data.offersTerm === true : data.feeType === "term",
  termFeeInPaise: data.termFeeInPaise != null ? Math.max(0, Math.round(toNumber(data.termFeeInPaise))) : undefined,
  startDate: typeof data.startDate === "string" ? data.startDate : "",
  endDate: typeof data.endDate === "string" ? data.endDate : "",
  durationMonths: data.durationMonths != null ? Math.max(0, Math.round(toNumber(data.durationMonths))) : undefined,
  termFreeMonthsOnFullPayment: data.termFreeMonthsOnFullPayment != null ? Math.max(0, Math.round(toNumber(data.termFreeMonthsOnFullPayment))) : undefined,
  termPayFullPriceInPaise: data.termPayFullPriceInPaise != null ? Math.max(0, Math.round(toNumber(data.termPayFullPriceInPaise))) : undefined,
  payment: data.payment ? normalizePaymentOptions(data.payment) : { ...DEFAULT_CLASS_PAYMENT_OPTIONS },
  emi: normalizeEmiConfig(data.emi),
  timeSlots: Array.isArray(data.timeSlots)
    ? data.timeSlots.map((slot: Record<string, unknown>, index: number) => normalizeTimeSlot(slot, index))
    : [],
  createdAt: data.createdAt,
  updatedAt: data.updatedAt,
});

type ClassTrackShape = {
  feeType?: ClassFeeType;
  offersMonthly?: boolean;
  offersTerm?: boolean;
};

/** Which tracks does this class expose? Falls back to feeType for legacy docs. */
export const classOffersMonthly = (classDoc: ClassTrackShape): boolean =>
  classDoc.offersMonthly != null ? classDoc.offersMonthly : classDoc.feeType !== "term";

export const classOffersTerm = (classDoc: ClassTrackShape): boolean =>
  classDoc.offersTerm != null ? classDoc.offersTerm : classDoc.feeType === "term";

export const classOffersBoth = (classDoc: ClassTrackShape): boolean =>
  classOffersMonthly(classDoc) && classOffersTerm(classDoc);

/** The tracks a parent may choose, in display order (monthly first). */
export const classTracks = (classDoc: ClassTrackShape): ClassTrack[] => ([
  classOffersMonthly(classDoc) ? "monthly" : null,
  classOffersTerm(classDoc) ? "term" : null,
] as (ClassTrack | null)[]).filter(Boolean) as ClassTrack[];

type ClassFeeShape = ClassTrackShape & { monthlyFeeInPaise?: number; termFeeInPaise?: number; autopayDiscountInPaise?: number };

const monthlyFeeLabel = (classDoc: ClassFeeShape) =>
  (classDoc.monthlyFeeInPaise || 0) > 0 ? `${formatPaiseAsRupees(classDoc.monthlyFeeInPaise || 0)} / month` : "Fee to be updated";

const termFeeLabel = (classDoc: ClassFeeShape) =>
  (classDoc.termFeeInPaise || 0) > 0 ? `${formatPaiseAsRupees(classDoc.termFeeInPaise || 0)} · full course` : "Fee to be updated";

/**
 * The headline price label. For a both-track class it shows both prices
 * ("₹2,000 / month · ₹8,000 course"); otherwise just the relevant one.
 */
export const getClassFeeLabel = (classDoc: ClassFeeShape): string => {
  const monthly = classOffersMonthly(classDoc);
  const term = classOffersTerm(classDoc);
  if (monthly && term) {
    return `${monthlyFeeLabel(classDoc)} · ${termFeeLabel(classDoc)}`;
  }
  return term ? termFeeLabel(classDoc) : monthlyFeeLabel(classDoc);
};

/** Price label for a single chosen track. */
export const getTrackFeeLabel = (classDoc: ClassFeeShape, track: ClassTrack): string =>
  track === "term" ? termFeeLabel(classDoc) : monthlyFeeLabel(classDoc);

/** The effective fee amount in paise for a given track (defaults to primary feeType). */
export const getClassFeeInPaise = (classDoc: ClassFeeShape, track?: ClassTrack): number => {
  const resolved: ClassTrack = track || (classDoc.feeType === "term" ? "term" : "monthly");
  return resolved === "term" ? classDoc.termFeeInPaise || 0 : classDoc.monthlyFeeInPaise || 0;
};

// --- Term pay-full offer (N months free when paying the whole fee upfront) ---

type TermOfferShape = {
  termFeeInPaise?: number;
  durationMonths?: number;
  startDate?: string;
  endDate?: string;
  termFreeMonthsOnFullPayment?: number;
  termPayFullPriceInPaise?: number;
};

const termDurationMonths = (classDoc: TermOfferShape): number => {
  const stored = Math.max(0, Math.round(Number(classDoc.durationMonths || 0)));
  return stored > 0 ? stored : monthsBetween(classDoc.startDate, classDoc.endDate);
};

/** The explicit pay-full final price, or 0 when unset/invalid (must beat the term fee). */
const explicitPayFullPriceInPaise = (classDoc: TermOfferShape): number => {
  const price = Math.max(0, Math.round(Number(classDoc.termPayFullPriceInPaise || 0)));
  const termFee = Math.max(0, Math.round(Number(classDoc.termFeeInPaise || 0)));
  return price >= 100 && termFee > 0 && price < termFee ? price : 0;
};

/** Whole free months granted on full payment (clamped to < duration). */
export const getTermFreeMonths = (classDoc: TermOfferShape): number => {
  const freeMonths = Math.max(0, Math.round(Number(classDoc.termFreeMonthsOnFullPayment || 0)));
  const duration = termDurationMonths(classDoc);
  if (freeMonths <= 0 || duration <= 0) return 0;
  // Never give away the whole course; cap at duration - 1.
  return Math.min(freeMonths, Math.max(0, duration - 1));
};

/**
 * The ₹ discount (paise) applied to a full payment. An explicit final price
 * (termPayFullPriceInPaise) wins; otherwise fall back to the free-months offer.
 */
export const getTermPayFullDiscountInPaise = (classDoc: TermOfferShape): number => {
  const termFee = Math.max(0, Math.round(Number(classDoc.termFeeInPaise || 0)));
  const explicit = explicitPayFullPriceInPaise(classDoc);
  if (explicit > 0) return termFee - explicit;
  const freeMonths = getTermFreeMonths(classDoc);
  const duration = termDurationMonths(classDoc);
  if (freeMonths <= 0 || duration <= 0 || termFee <= 0) return 0;
  return Math.round((termFee / duration) * freeMonths);
};

/** The full-payment FINAL price after the offer (clamped ≥ ₹1). */
export const getTermPayFullPriceInPaise = (classDoc: TermOfferShape): number => {
  const explicit = explicitPayFullPriceInPaise(classDoc);
  if (explicit > 0) return explicit;
  const termFee = Math.max(0, Math.round(Number(classDoc.termFeeInPaise || 0)));
  const discount = getTermPayFullDiscountInPaise(classDoc);
  return discount > 0 ? Math.max(100, termFee - discount) : termFee;
};

export const hasTermPayFullOffer = (classDoc: TermOfferShape): boolean => getTermPayFullDiscountInPaise(classDoc) > 0;

/** A short marketing label: "Save ₹2,000 on full payment" / "Pay full & get 1 month free". */
export const getTermPayFullOfferLabel = (classDoc: TermOfferShape): string => {
  if (explicitPayFullPriceInPaise(classDoc) > 0) {
    return `Save ${formatPaiseAsRupees(getTermPayFullDiscountInPaise(classDoc))} on full payment`;
  }
  const freeMonths = getTermFreeMonths(classDoc);
  if (freeMonths <= 0) return "";
  return `Pay full & get ${freeMonths} month${freeMonths > 1 ? "s" : ""} free`;
};

/** The monthly fee in paise after autopay discount (clamped ≥ 100 paise i.e. ₹1). */
export const getAutopayFeeInPaise = (classDoc: ClassFeeShape): number => {
  const monthly = classDoc.monthlyFeeInPaise || 0;
  const discount = classDoc.autopayDiscountInPaise || 0;
  return Math.max(100, monthly - discount);
};

/** Whether this class has a non-zero autopay discount. */
export const hasAutopayDiscount = (classDoc: ClassFeeShape): boolean =>
  (classDoc.autopayDiscountInPaise || 0) > 0 && (classDoc.monthlyFeeInPaise || 0) > (classDoc.autopayDiscountInPaise || 0);

/** Formatted autopay fee label: "₹2,300 / month" */
export const getAutopayFeeLabel = (classDoc: ClassFeeShape): string => {
  if (!hasAutopayDiscount(classDoc)) return getClassFeeLabel(classDoc);
  return `${formatPaiseAsRupees(getAutopayFeeInPaise(classDoc))} / month`;
};

export const isClassEnrollable = (
  classDoc: { active?: boolean } & ClassFeeShape,
): boolean => Boolean(classDoc.active) && getClassFeeInPaise(classDoc) > 0;

/** Which payment rails a parent may use for a specific track of this class. */
export const getPaymentMethodsForTrack = (
  classDoc: { payment?: ClassPaymentOptions },
  track: ClassTrack,
): ClassPaymentMethod[] => {
  const payment = classDoc.payment || DEFAULT_CLASS_PAYMENT_OPTIONS;
  if (track === "term") {
    return ([
      payment.full ? "full" : null,
      payment.emi ? "emi" : null,
    ].filter(Boolean) as ClassPaymentMethod[]);
  }
  return ([
    payment.autopay ? "autopay" : null,
    payment.manual ? "manual" : null,
    payment.cash ? "cash" : null,
  ].filter(Boolean) as ClassPaymentMethod[]);
};

/**
 * Which payment rails a parent may use for this class, for the primary/default
 * track. Kept for callers that don't drive a track choice; track-aware screens
 * should use {@link getPaymentMethodsForTrack}.
 */
export const getEnabledPaymentMethods = (
  classDoc: { feeType?: ClassFeeType; offersMonthly?: boolean; offersTerm?: boolean; payment?: ClassPaymentOptions },
): ClassPaymentMethod[] => {
  const tracks = classTracks(classDoc);
  return tracks.flatMap((track) => getPaymentMethodsForTrack(classDoc, track));
};

/** Live subscription to every class (admin). Returns the unsubscribe fn. */
export const subscribeToClasses = (
  onChange: (classes: ClassDoc[]) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  collection(db, CLASSES_COLLECTION),
  (snapshot) => onChange(snapshot.docs.map((classDoc) => normalizeClass(classDoc.id, classDoc.data()))),
  (error) => onError?.(error),
);

/** Live subscription to active classes only (public). Returns the unsubscribe fn. */
export const subscribeToActiveClasses = (
  onChange: (classes: ClassDoc[]) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  query(collection(db, CLASSES_COLLECTION), where("active", "==", true)),
  (snapshot) => onChange(snapshot.docs.map((classDoc) => normalizeClass(classDoc.id, classDoc.data()))),
  (error) => onError?.(error),
);

export const listActiveClasses = async (): Promise<ClassDoc[]> => {
  const snapshot = await getDocs(query(collection(db, CLASSES_COLLECTION), where("active", "==", true)));
  return snapshot.docs.map((classDoc) => normalizeClass(classDoc.id, classDoc.data()));
};

export const getClass = async (id: string): Promise<ClassDoc | null> => {
  const snapshot = await getDoc(doc(db, CLASSES_COLLECTION, id));
  return snapshot.exists() ? normalizeClass(snapshot.id, snapshot.data()) : null;
};

export interface ClassWritePayload {
  name: string;
  description?: string;
  image?: string;
  category?: string;
  facultyName?: string;
  scheduleDays?: string[];
  scheduleStart?: string;
  scheduleEnd?: string;
  ageFrom?: number;
  ageTo?: number;
  monthlyFeeInPaise: number;
  autopayDiscountInPaise?: number;
  billingDayOfMonth: number;
  active: boolean;
  seatsTotal?: number;
  // New fields
  feeType?: ClassFeeType;
  offersMonthly?: boolean;
  offersTerm?: boolean;
  termFeeInPaise?: number;
  startDate?: string;
  endDate?: string;
  termFreeMonthsOnFullPayment?: number;
  termPayFullPriceInPaise?: number;
  payment?: ClassPaymentOptions;
  emi?: ClassEmiConfig | null;
  timeSlots?: ClassTimeSlot[];
}

const sanitizeTimeSlot = (slot: ClassTimeSlot, index: number) => {
  const normalized = normalizeTimeSlot(slot, index);
  return {
    id: normalized.id,
    days: normalized.days,
    start: normalized.start,
    end: normalized.end,
    label: normalized.label,
    // Firestore rejects undefined — store null when unset.
    seatsTotal: normalized.seatsTotal != null ? normalized.seatsTotal : null,
    seatsTaken: normalized.seatsTaken != null ? normalized.seatsTaken : 0,
  };
};

const buildClassPayload = (payload: ClassWritePayload) => {
  const scheduleDays = (payload.scheduleDays || []).filter(Boolean);
  const scheduleStart = (payload.scheduleStart || "").trim();
  const scheduleEnd = (payload.scheduleEnd || "").trim();
  const ageFrom = payload.ageFrom != null && Number.isFinite(payload.ageFrom) ? Math.max(0, Math.round(payload.ageFrom)) : null;
  const ageTo = payload.ageTo != null && Number.isFinite(payload.ageTo) ? Math.max(0, Math.round(payload.ageTo)) : null;

  // Track capabilities — a class may offer monthly, term, or both.
  const offersMonthly = payload.offersMonthly ?? (payload.feeType !== "term");
  const offersTerm = payload.offersTerm ?? (payload.feeType === "term");
  // Primary/headline track: monthly takes precedence when both are on.
  const feeType: ClassFeeType = offersMonthly ? "monthly" : "term";
  const startDate = (payload.startDate || "").trim();
  const endDate = (payload.endDate || "").trim();
  const durationMonths = offersTerm ? monthsBetween(startDate, endDate) : 0;
  const timeSlots = (payload.timeSlots || []).map(sanitizeTimeSlot);
  const payment = payload.payment || DEFAULT_CLASS_PAYMENT_OPTIONS;
  // Clamp the pay-full free-months offer to a valid range (< duration).
  const freeMonthsRaw = Math.max(0, Math.round(Number(payload.termFreeMonthsOnFullPayment || 0)));
  const termFreeMonthsOnFullPayment = offersTerm && durationMonths > 0
    ? Math.min(freeMonthsRaw, Math.max(0, durationMonths - 1))
    : 0;

  // Display schedule string: prefer an explicit day/time (legacy), else derive
  // from the time slots so public cards still show a schedule.
  const explicitSchedule = composeSchedule(scheduleDays, scheduleStart, scheduleEnd);
  const schedule = explicitSchedule
    || (timeSlots.length === 1 ? timeSlots[0].label : timeSlots.length > 1 ? `${timeSlots.length} time slots` : "");

  return {
    name: payload.name.trim(),
    description: (payload.description || "").trim(),
    image: (payload.image || "").trim(),
    category: (payload.category || "").trim(),
    facultyName: (payload.facultyName || "").trim(),
    // Structured fields + composed display strings (public pages read these).
    scheduleDays,
    scheduleStart,
    scheduleEnd,
    schedule,
    ageFrom,
    ageTo,
    ageGroup: composeAgeGroup(ageFrom ?? undefined, ageTo ?? undefined),
    monthlyFeeInPaise: Math.max(0, Math.round(payload.monthlyFeeInPaise)),
    autopayDiscountInPaise: offersMonthly && payload.autopayDiscountInPaise
      ? Math.min(Math.max(0, Math.round(payload.autopayDiscountInPaise)), Math.max(0, Math.round(payload.monthlyFeeInPaise)) - 100)
      : null,
    billingDayOfMonth: clampBillingDay(payload.billingDayOfMonth),
    active: payload.active,
    seatsTotal: payload.seatsTotal != null ? Math.max(0, Math.round(payload.seatsTotal)) : null,
    // New persisted fields.
    feeType,
    offersMonthly,
    offersTerm,
    termFeeInPaise: offersTerm ? Math.max(0, Math.round(payload.termFeeInPaise || 0)) : null,
    startDate: offersTerm ? startDate : "",
    endDate: offersTerm ? endDate : "",
    durationMonths: offersTerm ? durationMonths : null,
    termFreeMonthsOnFullPayment,
    // Explicit pay-full final price — only stored when it genuinely discounts.
    termPayFullPriceInPaise: (() => {
      if (!offersTerm) return 0;
      const finalPrice = Math.max(0, Math.round(Number(payload.termPayFullPriceInPaise || 0)));
      const termFee = Math.max(0, Math.round(Number(payload.termFeeInPaise || 0)));
      return finalPrice >= 100 && finalPrice < termFee ? finalPrice : 0;
    })(),
    payment: {
      autopay: payment.autopay === true,
      manual: payment.manual === true,
      full: payment.full === true,
      emi: payment.emi === true,
      cash: payment.cash === true,
    },
    emi: payload.emi ? {
      upfrontPercentage: payload.emi.upfrontPercentage,
      installmentPercentages: payload.emi.installmentPercentages,
      emiSurchargeInPaise: Math.max(0, Math.round(Number(payload.emi.emiSurchargeInPaise || 0))),
    } : null,
    timeSlots,
    updatedAt: serverTimestamp(),
  };
};

/** Create (id omitted) or update (id provided) a class catalog entry. */
export const upsertClass = async (id: string | null, payload: ClassWritePayload): Promise<string> => {
  const data = buildClassPayload(payload);
  if (id) {
    await updateDoc(doc(db, CLASSES_COLLECTION, id), data);
    return id;
  }
  const created = await addDoc(collection(db, CLASSES_COLLECTION), { ...data, createdAt: serverTimestamp() });
  return created.id;
};

export const setClassActive = async (id: string, active: boolean): Promise<void> => {
  await setDoc(doc(db, CLASSES_COLLECTION, id), { active, updatedAt: serverTimestamp() }, { merge: true });
};
