import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin";
import { sendWhatsAppOtpTemplate } from "../_lib/whatsapp";
import { readJsonBody, requirePost, sendError, sendJson } from "../_lib/http";

const sanitizePhone = (phone: string) => phone.replace(/\D/g, "");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;

  let body: { phone?: string };
  try {
    body = await readJsonBody(req);
  } catch {
    return sendError(res, 400, "Invalid request body.");
  }

  const rawPhone = String(body.phone || "").trim();
  const phone = sanitizePhone(rawPhone);

  if (phone.length !== 10) {
    return sendError(res, 400, "Please enter a valid 10-digit phone number.");
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  const db = getFirebaseAdminDb();
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
