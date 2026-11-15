/**
 * Firestore security-rules tests against the local emulator (never production).
 *   firebase emulators:exec --only firestore --project demo-javani "npm run test:rules"
 * Excluded from the normal `vitest run` (see vitest.config.ts).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

const visitor = () => env.unauthenticatedContext().firestore();
const as = (uid: string, email = `${uid}@example.com`) =>
  env.authenticatedContext(uid, { email }).firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-javani",
    firestore: { rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const seed: Record<string, Record<string, unknown>> = {
      "users/admin": { uid: "admin", role: "admin" },
      "users/mgrAcad": { uid: "mgrAcad", role: "manager", managerPages: ["academics"] },
      "users/mgrProd": { uid: "mgrProd", role: "manager", managerPages: ["products"] },
      "users/mgrClasses": { uid: "mgrClasses", role: "manager", managerPages: ["classes"] },
      "users/teacher": { uid: "teacher", role: "teacher", teacherClassIds: ["c1"] },
      "users/bob": { uid: "bob", username: "Bob", email: "bob@example.com", role: "user" },
      "users/alice": { uid: "alice", username: "Alice", email: "Alice@Example.com", role: "user" },
      // Made by Signup.tsx before this fix: no `role` field.
      "users/legacy": { uid: "legacy", username: "Old", email: "legacy@example.com", phone: "9000000000", whatsappNumber: "9000000000" },
      "users/kid": { uid: "kid", role: "user", managedByAdmin: true },
      "orders/o1": { customerId: "bob", status: "placed" },
      "feePayments/f1": { parentUserId: "bob", enrollmentId: "e1" },
      "enrollments/e1": { parentUserId: "bob", classId: "c1", className: "Veena", status: "active" },
      "enrollments/e2": { parentUserId: "bob", classId: "c2", className: "Dance", status: "active" },
      "elearnEnrollments/bob_course1": { uid: "bob", courseId: "course1", status: "active" },
      "attendance/e1_2026-11-01": { classId: "c1", enrollmentId: "e1", studentUid: "bob", status: "present" },
      "testimonials/t1": { name: "A parent", text: "Lovely" },
      "enquiries/q1": { name: "Ravi" },
      "siteSettings/stats": { items: [] },
    };
    for (const [path, data] of Object.entries(seed)) await setDoc(doc(db, path), data);
  });
});

const signupPayload = (uid: string, extra: Record<string, unknown> = {}) => ({
  uid,
  username: "New Person",
  email: `${uid}@example.com`,
  phone: "9876543210",
  whatsappNumber: "9876543210",
  createdAt: serverTimestamp(),
  ...extra,
});

const order = (customerId: string, payment: Record<string, unknown>) => ({
  orderNumber: "JV-1",
  customerId,
  status: "placed",
  items: [],
  payment,
  createdAt: serverTimestamp(),
});

describe("visitor", () => {
  it("reads public content and testimonials", async () => {
    await assertSucceeds(getDoc(doc(visitor(), "testimonials/t1")));
    await assertSucceeds(getDocs(collection(visitor(), "testimonials")));
    await assertSucceeds(getDoc(doc(visitor(), "siteSettings/stats")));
  });

  it("can send an enquiry and a class enrolment request", async () => {
    await assertSucceeds(addDoc(collection(visitor(), "enquiries"), { name: "Ravi", phone: "9" }));
    await assertSucceeds(addDoc(collection(visitor(), "enrollmentRequests"), { name: "Ravi" }));
  });

  it("cannot seed site stats, write testimonials or read enquiries", async () => {
    await assertFails(setDoc(doc(visitor(), "siteSettings/stats"), { items: [1] }));
    await assertFails(setDoc(doc(visitor(), "testimonials/t2"), { name: "x" }));
    await assertFails(getDocs(collection(visitor(), "enquiries")));
  });

  it("cannot read private records", async () => {
    await assertFails(getDoc(doc(visitor(), "users/bob")));
    await assertFails(getDoc(doc(visitor(), "orders/o1")));
    await assertFails(getDoc(doc(visitor(), "feePayments/f1")));
    await assertFails(getDoc(doc(visitor(), "elearnEnrollments/bob_course1")));
  });
});

describe("signup and profile", () => {
  it("allows signup without role (Signup.tsx) and with role user (AuthContext)", async () => {
    await assertSucceeds(setDoc(doc(as("n1"), "users/n1"), signupPayload("n1")));
    await assertSucceeds(setDoc(doc(as("n2"), "users/n2"), signupPayload("n2", { role: "user" })));
  });

  it("allows signup email in a different case", async () => {
    await assertSucceeds(setDoc(doc(as("n3", "n3@example.com"), "users/n3"), signupPayload("n3", { email: "N3@Example.com" })));
  });

  it("denies signup as admin, with extra keys, or with someone else's email", async () => {
    await assertFails(setDoc(doc(as("n4"), "users/n4"), signupPayload("n4", { role: "admin" })));
    await assertFails(setDoc(doc(as("n5"), "users/n5"), signupPayload("n5", { managerPages: ["finance"] })));
    await assertFails(setDoc(doc(as("n6"), "users/n6"), signupPayload("n6", { email: "partner@example.com" })));
  });

  it("allows the Profile.tsx merge save on a legacy doc with no role", async () => {
    await assertSucceeds(setDoc(doc(as("legacy"), "users/legacy"), {
      uid: "legacy",
      username: "Old Name",
      email: "legacy@example.com",
      phone: "9111111111",
      whatsappNumber: "9111111111",
      callNumber: "9111111111",
      role: "user",
      updatedAt: serverTimestamp(),
    }, { merge: true }));
  });

  it("allows the Profile.tsx merge save when the stored email case differs", async () => {
    await assertSucceeds(setDoc(doc(as("alice", "alice@example.com"), "users/alice"), {
      uid: "alice",
      username: "Alice R",
      email: "alice@example.com",
      phone: "9",
      whatsappNumber: "9",
      callNumber: "9",
      role: "user",
      updatedAt: serverTimestamp(),
    }, { merge: true }));
  });

  it("allows the WhatsApp prompt update on a legacy doc", async () => {
    await assertSucceeds(updateDoc(doc(as("legacy"), "users/legacy"), { whatsappNumber: "9", phone: "9", updatedAt: serverTimestamp() }));
  });

  it("denies role escalation and staff fields on the own profile", async () => {
    await assertFails(updateDoc(doc(as("bob"), "users/bob"), { role: "admin" }));
    await assertFails(updateDoc(doc(as("legacy"), "users/legacy"), { role: "manager" }));
    await assertFails(updateDoc(doc(as("bob"), "users/bob"), { managerPages: ["finance"] }));
    await assertFails(updateDoc(doc(as("bob"), "users/bob"), { email: "partner@example.com" }));
    await assertFails(updateDoc(doc(as("kid"), "users/kid"), { username: "x" }));
  });

  it("lets a user read only their own profile", async () => {
    await assertSucceeds(getDoc(doc(as("bob"), "users/bob")));
    await assertFails(getDoc(doc(as("alice", "alice@example.com"), "users/bob")));
  });
});

describe("shopper", () => {
  it("manages their own cart, wishlist and addresses only", async () => {
    const db = as("bob");
    await assertSucceeds(setDoc(doc(db, "users/bob/cart/p1"), { qty: 1 }));
    await assertSucceeds(setDoc(doc(db, "users/bob/wishlist/p1"), { at: 1 }));
    await assertSucceeds(addDoc(collection(db, "users/bob/addresses"), { city: "Vizag" }));
    await assertFails(setDoc(doc(db, "users/alice/cart/p1"), { qty: 1 }));
  });

  it("places razorpay-pending and COD orders", async () => {
    const db = as("bob");
    await assertSucceeds(addDoc(collection(db, "orders"), order("bob", { method: "razorpay", status: "pending", razorpaySignatureVerified: false })));
    await assertSucceeds(addDoc(collection(db, "orders"), order("bob", { method: "cod", status: "cod-pending" })));
  });

  it("cannot forge a paid order or an order for someone else", async () => {
    const db = as("bob");
    await assertFails(addDoc(collection(db, "orders"), order("bob", { method: "razorpay", status: "paid" })));
    await assertFails(addDoc(collection(db, "orders"), order("bob", { method: "razorpay", status: "pending", razorpaySignatureVerified: true })));
    await assertFails(addDoc(collection(db, "orders"), order("alice", { method: "cod", status: "cod-pending" })));
  });

  it("reads own orders by query, never another customer's", async () => {
    await assertSucceeds(getDocs(query(collection(as("bob"), "orders"), where("customerId", "==", "bob"))));
    await assertFails(getDoc(doc(as("alice", "alice@example.com"), "orders/o1")));
    await assertFails(getDocs(collection(as("bob"), "orders")));
  });

  it("creates a fresh rental booking but cannot clear its own late fee", async () => {
    const db = as("bob");
    const booking = { orderId: "o1", customerId: "bob", status: "booked", overdueHours: 0, extraChargeInPaise: 0, extraChargeCollected: false };
    await assertSucceeds(setDoc(doc(db, "rentals/o1_0"), booking));
    await assertFails(setDoc(doc(db, "rentals/o1_1"), { ...booking, status: "returned" }));
    await assertFails(updateDoc(doc(db, "rentals/o1_0"), { extraChargeCollected: true }));
  });

  it("logs only their own history", async () => {
    await assertSucceeds(addDoc(collection(as("bob"), "history"), { uid: "bob", action: "login" }));
    await assertFails(addDoc(collection(as("bob"), "history"), { uid: "alice", action: "login" }));
  });

  it("cannot write site content any more", async () => {
    const db = as("bob");
    await assertFails(setDoc(doc(db, "courses/x"), { title: "x" }));
    await assertFails(setDoc(doc(db, "gallery/x"), { url: "x" }));
    await assertFails(setDoc(doc(db, "faculty/x"), { name: "x" }));
    await assertFails(getDocs(collection(db, "enquiries")));
  });
});

describe("parent and student", () => {
  it("cannot read another family's fees or e-learning access", async () => {
    const db = as("alice", "alice@example.com");
    await assertFails(getDoc(doc(db, "feePayments/f1")));
    await assertFails(getDoc(doc(db, "elearnEnrollments/bob_course1")));
  });

  it("cannot grant themselves e-learning access", async () => {
    await assertFails(setDoc(doc(as("alice", "alice@example.com"), "elearnEnrollments/alice_course1"), { uid: "alice", courseId: "course1", status: "active" }));
    await assertFails(updateDoc(doc(as("bob"), "elearnEnrollments/bob_course1"), { expiresAt: null }));
  });

  it("cannot create or edit their own class enrolment", async () => {
    await assertFails(addDoc(collection(as("bob"), "enrollments"), { parentUserId: "bob", classId: "c1", status: "active" }));
    await assertFails(updateDoc(doc(as("bob"), "enrollments/e1"), { status: "active", monthlyFeeInPaise: 0 }));
  });

  it("reads their own enrolments and attendance by query", async () => {
    await assertSucceeds(getDocs(query(collection(as("bob"), "enrollments"), where("parentUserId", "==", "bob"))));
    await assertSucceeds(getDocs(query(collection(as("bob"), "attendance"), where("studentUid", "==", "bob"))));
  });

  it("ClassRoom fee query needs the parentUserId filter", async () => {
    const db = as("bob");
    // Current client (account/ClassRoom.tsx -> listFeesForEnrollment): denied.
    await assertFails(getDocs(query(collection(db, "feePayments"), where("enrollmentId", "==", "e1"))));
    await assertSucceeds(getDocs(query(collection(db, "feePayments"), where("enrollmentId", "==", "e1"), where("parentUserId", "==", "bob"))));
  });
});

describe("staff", () => {
  it("admin manages testimonials, enquiries and roles", async () => {
    const db = as("admin");
    await assertSucceeds(setDoc(doc(db, "testimonials/t2"), { name: "x" }));
    await assertSucceeds(getDocs(collection(db, "enquiries")));
    await assertSucceeds(updateDoc(doc(db, "users/bob"), { role: "partner" }));
  });

  it("an academics manager lists a class roster", async () => {
    await assertSucceeds(getDocs(query(collection(as("mgrAcad"), "enrollments"), where("classId", "==", "c1"))));
    await assertFails(getDocs(query(collection(as("mgrProd"), "enrollments"), where("classId", "==", "c1"))));
  });

  it("a products manager saves product categories only", async () => {
    await assertSucceeds(setDoc(doc(as("mgrProd"), "siteSettings/productCategories"), { categories: ["Sarees"] }));
    await assertFails(setDoc(doc(as("mgrProd"), "siteSettings/courseCategories"), { categories: [] }));
    await assertFails(setDoc(doc(as("mgrProd"), "siteSettings/hero"), { images: [] }));
  });

  it("a classes manager may re-link an enrolment but not change its fee", async () => {
    const db = as("mgrClasses");
    await assertSucceeds(updateDoc(doc(db, "enrollments/e1"), { classId: "c2", className: "Dance", slotId: "", slotLabel: "", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, "enrollments/e2"), { status: "cancelled" }));
  });

  it("a teacher lists and marks only their own class", async () => {
    const db = as("teacher");
    await assertSucceeds(getDocs(query(collection(db, "enrollments"), where("classId", "==", "c1"))));
    await assertFails(getDocs(query(collection(db, "enrollments"), where("classId", "==", "c2"))));
    await assertSucceeds(setDoc(doc(db, "attendance/e1_2026-11-02"), { classId: "c1", enrollmentId: "e1", studentUid: "bob", status: "present" }));
    await assertFails(setDoc(doc(db, "attendance/e2_2026-11-02"), { classId: "c2", enrollmentId: "e2", studentUid: "bob", status: "present" }));
  });
});
