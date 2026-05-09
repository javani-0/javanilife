import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface WhatsAppSendResult {
  status: "sent" | "manual-ready" | "failed";
  providerMessageId?: string;
  errorMessage?: string;
}

const WHATSAPP_TOKEN_KEYS = [
  "WHATSAPP_TOKEN",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_API_TOKEN",
  "META_WHATSAPP_TOKEN",
  "META_WHATSAPP_ACCESS_TOKEN",
];

const WHATSAPP_PHONE_ID_KEYS = [
  "WHATSAPP_PHONE_ID",
  "WHATSAPP_PHONE_NUMBER_ID",
  "META_WHATSAPP_PHONE_NUMBER_ID",
  "META_PHONE_NUMBER_ID",
];

let localEnvCache: Record<string, string> | null = null;

const getLocalEnvValue = (key: string) => {
  if (localEnvCache) return localEnvCache[key] || "";

  localEnvCache = {};
  for (const fileName of [".env.local", ".env"]) {
    const envPath = join(process.cwd(), fileName);
    if (!existsSync(envPath)) continue;

    const content = readFileSync(envPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) continue;
      const envKey = line.slice(0, separatorIndex).trim();
      const envValue = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
      localEnvCache[envKey] = envValue;
    }
  }

  return localEnvCache[key] || "";
};

export const getWhatsAppEnvValue = (key: string, fallback = "") => process.env[key]?.trim() || getLocalEnvValue(key) || fallback;
const getFirstWhatsAppEnvValue = (keys: string[], fallback = "") => keys.map((key) => getWhatsAppEnvValue(key)).find(Boolean) || fallback;

export const sanitizeWhatsAppNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
};

const getWhatsAppConfig = () => ({
  token: getFirstWhatsAppEnvValue(WHATSAPP_TOKEN_KEYS),
  phoneId: getFirstWhatsAppEnvValue(WHATSAPP_PHONE_ID_KEYS),
});

export const getWhatsAppConfigStatus = () => {
  const { token, phoneId } = getWhatsAppConfig();
  return {
    hasToken: Boolean(token),
    hasPhoneId: Boolean(phoneId),
    graphApiVersion: getWhatsAppEnvValue("WHATSAPP_GRAPH_API_VERSION", "v21.0"),
  };
};

const readWhatsAppError = (data: unknown) => {
  if (typeof data === "object" && data !== null && "error" in data) {
    const error = (data as { error?: { message?: string; code?: number; error_subcode?: number; error_user_title?: string; error_user_msg?: string; error_data?: { details?: string } } }).error;
    return [
      error?.message,
      error?.error_user_title,
      error?.error_user_msg,
      error?.error_data?.details,
      error?.code ? `code ${error.code}` : "",
      error?.error_subcode ? `subcode ${error.error_subcode}` : "",
    ].filter(Boolean).join(" ");
  }
  return "WhatsApp API request failed.";
};

const postWhatsAppMessage = async (body: Record<string, unknown>): Promise<WhatsAppSendResult> => {
  const { token, phoneId } = getWhatsAppConfig();
  if (!token || !phoneId) {
    return {
      status: "manual-ready",
      errorMessage: "WhatsApp API env vars are missing. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_ID, or WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID, in Vercel.",
    };
  }

  const graphApiVersion = getWhatsAppEnvValue("WHATSAPP_GRAPH_API_VERSION", "v21.0");
  const response = await fetch(`https://graph.facebook.com/${graphApiVersion}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage = readWhatsAppError(data);
    console.error("[WhatsApp] message send failed", { httpStatus: response.status, errorMessage });
    return { status: "failed", errorMessage };
  }

  const messages = typeof data === "object" && data !== null && "messages" in data
    ? (data as { messages?: Array<{ id?: string }> }).messages
    : undefined;

  return { status: "sent", providerMessageId: messages?.[0]?.id };
};

const getTemplateComponents = (params: string[] = [], urlSuffix?: string) => {
  const components: Record<string, unknown>[] = [];

  if (params.length > 0) {
    components.push({
      type: "body",
      parameters: params.map((text) => ({ type: "text", text })),
    });
  }

  if (urlSuffix) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: urlSuffix }],
    });
  }

  return components;
};

export const sendWhatsAppTemplate = ({
  to,
  templateName,
  languageCode = "en",
  params = [],
  urlSuffix,
}: {
  to: string;
  templateName: string;
  languageCode?: string;
  params?: string[];
  urlSuffix?: string;
}) => {
  const safeNumber = sanitizeWhatsAppNumber(to);
  if (!safeNumber) {
    return Promise.resolve({ status: "failed", errorMessage: "WhatsApp recipient phone number is missing." } as WhatsAppSendResult);
  }

  const safeTemplateName = templateName.trim();
  if (!safeTemplateName) {
    return Promise.resolve({ status: "failed", errorMessage: "WhatsApp template name is missing." } as WhatsAppSendResult);
  }

  return postWhatsAppMessage({
    to: safeNumber,
    type: "template",
    template: {
      name: safeTemplateName,
      language: { code: languageCode || "en" },
      components: getTemplateComponents(params.map(String), urlSuffix),
    },
  });
};

export const sendWhatsAppText = (to: string, message: string) => {
  const safeNumber = sanitizeWhatsAppNumber(to);
  if (!safeNumber) {
    return Promise.resolve({ status: "failed", errorMessage: "WhatsApp recipient phone number is missing." } as WhatsAppSendResult);
  }

  return postWhatsAppMessage({
    to: safeNumber,
    type: "text",
    text: {
      preview_url: false,
      body: message,
    },
  });
};

export const sendWhatsAppOtpTemplate = ({ to, code }: { to: string; code: string }) => {
  const resolvedTemplateName = getWhatsAppEnvValue("WHATSAPP_OTP_TEMPLATE", "otp_login");
  const languageCode = getWhatsAppEnvValue("WHATSAPP_OTP_LANG", "en");
  const safeNumber = sanitizeWhatsAppNumber(to);

  if (!safeNumber) {
    return Promise.resolve({ status: "failed", errorMessage: "WhatsApp recipient phone number is missing." } as WhatsAppSendResult);
  }

  const sendWithButton = () => postWhatsAppMessage({
    to: safeNumber,
    type: "template",
    template: {
      name: resolvedTemplateName,
      language: { code: languageCode },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: code }],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: code }],
        },
      ],
    },
  });

  const sendWithoutButton = () => postWhatsAppMessage({
    to: safeNumber,
    type: "template",
    template: {
      name: resolvedTemplateName,
      language: { code: languageCode },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: code }],
        },
      ],
    },
  });

  return sendWithButton().then((result) => result.status === "failed" ? sendWithoutButton() : result);
};