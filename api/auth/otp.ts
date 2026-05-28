import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { sendWhatsAppOtpTemplate } from "../_lib/whatsapp.js";
import { readJsonBody, requirePost, sendError, sendJson } from "../_lib/http.js";

const sanitizePhone = (phone: string) => phone.replace(/\D/g, "");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;

  let body: { action?: string; phone?: string; code?: string };
  try {
    body = await readJsonBody(req);
  } catch {
    return sendError(res, 400, "Invalid request body.");
  }

  const action = String(body.action || "").trim();
  const phone = sanitizePhone(String(body.phone || "").trim());

  if (phone.length !== 10) {
    return sendError(res, 400, "Please enter a valid 10-digit WhatsApp number.");
  }

  const db = getFirebaseAdminDb();

  if (action === "send") {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await db.collection("otpVerifications").doc(phone).set({
      code,
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
    });

    const result = await sendWhatsAppOtpTemplate({ to: phone, code });
    if (result.status === "failed") {
      return sendError(res, 500, result.errorMessage || "Failed to send OTP. Please try again.");
    }

    return sendJson(res, 200, { success: true });
  }

  if (action === "verify") {
    const code = String(body.code || "").trim();
    if (!code || code.length !== 6) {
      return sendError(res, 400, "Please enter the 6-digit OTP.");
    }

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

  return sendError(res, 400, "Invalid action. Use 'send' or 'verify'.");
}
