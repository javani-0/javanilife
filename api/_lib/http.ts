type HeaderValue = string | string[] | undefined;

export interface ApiRequest {
  method?: string;
  body?: unknown;
  headers: Record<string, HeaderValue>;
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
}

export interface ApiResponse {
  status: (statusCode: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
}

export const readJsonBody = async <T>(request: ApiRequest): Promise<T> => {
  if (typeof request.body === "string") return JSON.parse(request.body) as T;
  if (request.body && typeof request.body === "object") return request.body as T;

  const rawBody = await new Promise<string>((resolve, reject) => {
    if (!request.on) {
      resolve("");
      return;
    }

    const chunks: Buffer[] = [];
    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });

  return (rawBody.trim() ? JSON.parse(rawBody) : {}) as T;
};

export const sendJson = (response: ApiResponse, statusCode: number, body: unknown) => {
  response.setHeader?.("Cache-Control", "no-store");
  response.status(statusCode).json(body);
};

export const sendError = (response: ApiResponse, statusCode: number, error: string, details?: unknown) => {
  sendJson(response, statusCode, details ? { error, details } : { error });
};

export const requirePost = (request: ApiRequest, response: ApiResponse): boolean => {
  if (request.method === "POST") return true;
  response.setHeader?.("Allow", "POST");
  sendError(response, 405, "Method not allowed");
  return false;
};

export const getBearerToken = (request: ApiRequest): string | null => {
  const headerValue = request.headers.authorization || request.headers.Authorization;
  const authorization = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim() || null;
};