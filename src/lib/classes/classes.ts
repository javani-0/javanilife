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
import { clampBillingDay, type ClassDoc } from "./types";

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
  billingDayOfMonth: clampBillingDay(toNumber(data.billingDayOfMonth, 5)),
  active: data.active !== false,
  razorpayPlanId: typeof data.razorpayPlanId === "string" ? data.razorpayPlanId : "",
  seatsTotal: data.seatsTotal != null ? Math.max(0, Math.round(toNumber(data.seatsTotal))) : undefined,
  seatsTaken: data.seatsTaken != null ? Math.max(0, Math.round(toNumber(data.seatsTaken))) : undefined,
  createdAt: data.createdAt,
  updatedAt: data.updatedAt,
});

/** "₹2,500 / month" for the monthly fee. */
export const getClassFeeLabel = (classDoc: Pick<ClassDoc, "monthlyFeeInPaise">): string => (
  classDoc.monthlyFeeInPaise > 0
    ? `${formatPaiseAsRupees(classDoc.monthlyFeeInPaise)} / month`
    : "Fee to be updated"
);

export const isClassEnrollable = (classDoc: Pick<ClassDoc, "active" | "monthlyFeeInPaise">): boolean => (
  classDoc.active && classDoc.monthlyFeeInPaise > 0
);

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
  billingDayOfMonth: number;
  active: boolean;
  seatsTotal?: number;
}

const buildClassPayload = (payload: ClassWritePayload) => {
  const scheduleDays = (payload.scheduleDays || []).filter(Boolean);
  const scheduleStart = (payload.scheduleStart || "").trim();
  const scheduleEnd = (payload.scheduleEnd || "").trim();
  const ageFrom = payload.ageFrom != null && Number.isFinite(payload.ageFrom) ? Math.max(0, Math.round(payload.ageFrom)) : null;
  const ageTo = payload.ageTo != null && Number.isFinite(payload.ageTo) ? Math.max(0, Math.round(payload.ageTo)) : null;

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
    schedule: composeSchedule(scheduleDays, scheduleStart, scheduleEnd),
    ageFrom,
    ageTo,
    ageGroup: composeAgeGroup(ageFrom ?? undefined, ageTo ?? undefined),
    monthlyFeeInPaise: Math.max(0, Math.round(payload.monthlyFeeInPaise)),
    billingDayOfMonth: clampBillingDay(payload.billingDayOfMonth),
    active: payload.active,
    seatsTotal: payload.seatsTotal != null ? Math.max(0, Math.round(payload.seatsTotal)) : null,
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
