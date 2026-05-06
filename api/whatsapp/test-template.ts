import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.ts";
import { getRequesterContext } from "../_lib/notification-dispatch.ts";
import { sendWhatsAppOtpTemplate } from "../_lib/whatsapp.ts";

interface TestTemplateBody {
  to?: string;
  code?: string;
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  const token = getBearerToken(request);
  if (!token) {
    sendError(response, 401, "Missing Firebase ID token.");
    return;
  }

  try {
    const requester = await getRequesterContext(token);
    if (requester.role !== "admin") {
      sendError(response, 403, "Only admins can test WhatsApp templates.");
      return;
    }

    const body = await readJsonBody<TestTemplateBody>(request);
    if (!body.to) {
      sendError(response, 400, "Recipient phone number is required.");
      return;
    }

    const result = await sendWhatsAppOtpTemplate({ to: body.to, code: body.code || "123456" });
    sendJson(response, result.status === "failed" ? 502 : 200, result);
  } catch (error) {
    console.error("Unable to test WhatsApp template", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to test WhatsApp template.");
  }
}