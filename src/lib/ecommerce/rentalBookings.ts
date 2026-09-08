import {
  collection,
  doc,
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
import { computeRentalCharge, type RentalStatus } from "./rentals";
import type { Order, OrderItem } from "./types";

// ---------------------------------------------------------------------------
// RENTAL BOOKINGS (req 3).
//
// A rental is bought through the ordinary cart, so the money, the payment rail
// and the delivery all work exactly as they do for a purchase. What an order
// cannot express is the part that happens AFTER the sale: the item is out, it
// is due back at a particular hour, and it may come back late.
//
// So every rental line on an order gets its own document here — one row the
// office can work: mark it out, mark it back, see what it now owes, and be told
// when it goes past its hour. Doc ids are `${orderId}_${lineIndex}` so replaying
// an order can never create the same booking twice.
// ---------------------------------------------------------------------------

export const RENTALS_COLLECTION = "rentals";

export interface RentalBooking {
  id: string;
  orderId: string;
  orderNumber: string;
  /** The real product id (the cart line's id is namespaced). */
  productId: string;
  productName: string;
  /** The size that went out, when the piece has sizes. */
  size?: string;
  image?: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerWhatsAppNumber?: string;
  quantity: number;
  days: number;
  pricePerDayInPaise: number;
  baseInPaise: number;
  /** ISO. */
  startAt: string;
  dueAt: string;
  fulfilment: "pickup" | "delivery";
  status: RentalStatus;
  pickedUpAt?: string;
  returnedAt?: string;
  /** Frozen when the item comes back; live-computed while it is out. */
  overdueHours: number;
  extraChargeInPaise: number;
  extraChargeCollected: boolean;
  /** The last overdue-hour count the customer was messaged about. */
  notifiedOverdueHours?: number;
  overdueNotifiedAt?: unknown;
  adminNote?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

const getString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const getNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const allowedStatuses: RentalStatus[] = ["booked", "picked-up", "returned", "cancelled"];

export const normalizeRentalBooking = (id: string, data: DocumentData = {}): RentalBooking => ({
  id,
  orderId: getString(data.orderId),
  orderNumber: getString(data.orderNumber),
  productId: getString(data.productId),
  productName: getString(data.productName, "Rental item"),
  size: getString(data.size) || undefined,
  image: getString(data.image) || undefined,
  customerId: getString(data.customerId),
  customerName: getString(data.customerName),
  customerPhone: getString(data.customerPhone),
  customerWhatsAppNumber: getString(data.customerWhatsAppNumber) || undefined,
  quantity: Math.max(1, Math.round(getNumber(data.quantity, 1))),
  days: Math.max(1, Math.round(getNumber(data.days, 1))),
  pricePerDayInPaise: Math.max(0, Math.round(getNumber(data.pricePerDayInPaise))),
  baseInPaise: Math.max(0, Math.round(getNumber(data.baseInPaise))),
  startAt: getString(data.startAt),
  dueAt: getString(data.dueAt),
  fulfilment: data.fulfilment === "pickup" ? "pickup" : "delivery",
  status: allowedStatuses.includes(data.status as RentalStatus) ? (data.status as RentalStatus) : "booked",
  pickedUpAt: getString(data.pickedUpAt) || undefined,
  returnedAt: getString(data.returnedAt) || undefined,
  overdueHours: Math.max(0, Math.round(getNumber(data.overdueHours))),
  extraChargeInPaise: Math.max(0, Math.round(getNumber(data.extraChargeInPaise))),
  extraChargeCollected: data.extraChargeCollected === true,
  notifiedOverdueHours: data.notifiedOverdueHours != null ? Math.max(0, Math.round(getNumber(data.notifiedOverdueHours))) : undefined,
  overdueNotifiedAt: data.overdueNotifiedAt,
  adminNote: getString(data.adminNote) || undefined,
  createdAt: data.createdAt,
  updatedAt: data.updatedAt,
});

/** Deterministic id — replaying an order never duplicates its bookings. */
export const rentalBookingId = (orderId: string, lineIndex: number): string => `${orderId}_${lineIndex}`;

/**
 * Write one booking per rental line on a freshly placed order. Best-effort by
 * design: a failure here must never lose the customer their order, so the
 * caller logs and moves on — the admin can still see the rental on the order.
 */
export const createRentalBookingsForOrder = async (
  orderId: string,
  order: Pick<Order, "orderNumber" | "customerId" | "customerName" | "customerPhone" | "customerWhatsAppNumber" | "items"> & {
    delivery?: { method?: "shipping" | "store-pickup" };
  },
): Promise<number> => {
  const items = order.items || [];
  let created = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] as OrderItem;
    if (item.itemType !== "rental" || !item.rental) continue;
    const fulfilment = item.rental.fulfilment
      || (order.delivery?.method === "store-pickup" ? "pickup" : "delivery");

    await setDoc(doc(db, RENTALS_COLLECTION, rentalBookingId(orderId, index)), {
      orderId,
      orderNumber: order.orderNumber || "",
      productId: item.sourceId || item.productId,
      productName: item.name,
      size: item.size || "",
      image: item.image || "",
      customerId: order.customerId || "",
      customerName: order.customerName || "",
      customerPhone: order.customerPhone || "",
      customerWhatsAppNumber: order.customerWhatsAppNumber || order.customerPhone || "",
      quantity: Math.max(1, Math.round(item.quantity || 1)),
      days: Math.max(1, Math.round(item.rental.days || 1)),
      pricePerDayInPaise: Math.max(0, Math.round(item.rental.pricePerDayInPaise || 0)),
      baseInPaise: Math.max(0, Math.round(item.lineTotalInPaise || 0)),
      startAt: item.rental.startAt,
      dueAt: item.rental.dueAt,
      fulfilment,
      status: "booked" as RentalStatus,
      overdueHours: 0,
      extraChargeInPaise: 0,
      extraChargeCollected: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    created += 1;
  }

  return created;
};

/** Staff: every rental, newest first. */
export const subscribeToRentals = (
  onChange: (rentals: RentalBooking[]) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  collection(db, RENTALS_COLLECTION),
  (snapshot) => onChange(
    snapshot.docs
      .map((rentalDoc) => normalizeRentalBooking(rentalDoc.id, rentalDoc.data()))
      .sort((a, b) => (b.startAt || "").localeCompare(a.startAt || "")),
  ),
  (error) => onError?.(error),
);

/** A customer's own rentals, for their account page. */
export const subscribeToMyRentals = (
  customerId: string,
  onChange: (rentals: RentalBooking[]) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  query(collection(db, RENTALS_COLLECTION), where("customerId", "==", customerId)),
  (snapshot) => onChange(
    snapshot.docs
      .map((rentalDoc) => normalizeRentalBooking(rentalDoc.id, rentalDoc.data()))
      .sort((a, b) => (b.startAt || "").localeCompare(a.startAt || "")),
  ),
  (error) => onError?.(error),
);

export const listRentalsForOrder = async (orderId: string): Promise<RentalBooking[]> => {
  if (!orderId) return [];
  const snapshot = await getDocs(query(collection(db, RENTALS_COLLECTION), where("orderId", "==", orderId)));
  return snapshot.docs.map((rentalDoc) => normalizeRentalBooking(rentalDoc.id, rentalDoc.data()));
};

/**
 * Staff: the item has gone out. The clock starts NOW rather than at the booked
 * time — a customer who collects two hours late should not lose two hours.
 */
export const markRentalPickedUp = async (booking: RentalBooking, at: Date = new Date()): Promise<void> => {
  const startAt = at.toISOString();
  const dueAt = new Date(at.getTime() + booking.days * 24 * 60 * 60 * 1000).toISOString();
  await updateDoc(doc(db, RENTALS_COLLECTION, booking.id), {
    status: "picked-up" as RentalStatus,
    pickedUpAt: startAt,
    startAt,
    dueAt,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Staff: the item is back. The late charge is FROZEN at this moment — a
 * returned rental must never keep growing while nobody is looking at it.
 */
export const markRentalReturned = async (booking: RentalBooking, at: Date = new Date()): Promise<{
  overdueHours: number; extraChargeInPaise: number;
}> => {
  const charge = computeRentalCharge({
    pricePerDayInPaise: booking.pricePerDayInPaise,
    days: booking.days,
    quantity: booking.quantity,
    startAt: booking.startAt,
    dueAt: booking.dueAt,
    returnedAt: at,
    now: at,
  });
  await updateDoc(doc(db, RENTALS_COLLECTION, booking.id), {
    status: "returned" as RentalStatus,
    returnedAt: at.toISOString(),
    overdueHours: charge.overdueHours,
    extraChargeInPaise: charge.overdueChargeInPaise,
    updatedAt: serverTimestamp(),
  });
  return { overdueHours: charge.overdueHours, extraChargeInPaise: charge.overdueChargeInPaise };
};

/** Staff: the late fee has been paid (it then counts as rental income). */
export const setRentalExtraCollected = async (id: string, collected: boolean): Promise<void> => {
  await updateDoc(doc(db, RENTALS_COLLECTION, id), {
    extraChargeCollected: collected,
    updatedAt: serverTimestamp(),
  });
};

export const cancelRentalBooking = async (id: string, reason = ""): Promise<void> => {
  await updateDoc(doc(db, RENTALS_COLLECTION, id), {
    status: "cancelled" as RentalStatus,
    adminNote: reason,
    updatedAt: serverTimestamp(),
  });
};

/** Remember that the customer has been told about this many overdue hours. */
export const recordRentalOverdueNotice = async (id: string, overdueHours: number): Promise<void> => {
  await updateDoc(doc(db, RENTALS_COLLECTION, id), {
    notifiedOverdueHours: Math.max(0, Math.round(overdueHours)),
    overdueNotifiedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};
