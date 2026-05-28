import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getFirebaseAdminDb } from "../_lib/firebase-admin";
import { readJsonBody, requirePost, sendError, sendJson } from "../_lib/http";

const sanitizePhone = (phone: string) => phone.replace(/\D/g, "");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;

  let body: { phone?: string; code?: string };
  try {
    body = await readJsonBody(req);
  } catch {
    return sendError(res, 400, "Invalid request body.");
  }

  const phone = sanitizePhone(String(body.phone || "").trim());
  const code = String(body.code || "").trim();

  if (phone.length !== 10) {
    return sendError(res, 400, "Invalid phone number.");
  }
  if (!code || code.length !== 6) {
    return sendError(res, 400, "Please enter the 6-digit OTP.");
  }

  const db = getFirebaseAdminDb();
  const docRef = db.collection("otpVerifications").doc(phone);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return sendError(res, 400, "OTP not found. Please request a new one.");
  }

  const data = docSnap.data() as { code: string; expiresAt: FirebaseFirestore.Timestamp };
  const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt as unknown as string);

  if (new Date() > expiresAt) {
    await docRef.delete();
    return sendError(res, 400, "OTP has expired. Please request a new one.");
  }

  if (data.code !== code) {
    return sendError(res, 400, "Incorrect OTP. Please try again.");
  }

  await docRef.delete();

  return sendJson(res, 200, { verified: true });
}
