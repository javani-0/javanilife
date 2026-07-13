import type { FinanceSummary } from "./types";

// The read-only partner dashboard never touches raw orders/customers — it asks
// the server for pre-aggregated totals only (computed with the Admin SDK). The
// response also carries THIS partner's per-category share % and payout (req 4).
export interface PartnerSummaryResponse extends FinanceSummary {
  shareClassesPercent: number;
  shareCoursesPercent: number;
  shareProductsPercent: number;
  shareClassesInPaise: number;
  shareCoursesInPaise: number;
  shareProductsInPaise: number;
  partnerName?: string;
  generatedAt?: string;
}

export const fetchPartnerSummary = async (idToken: string): Promise<PartnerSummaryResponse> => {
  const response = await fetch("/api/partner/summary", {
    method: "GET",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === "string" && data.error.trim()
      ? data.error
      : "Unable to load the financial summary. Please try again.";
    throw new Error(message);
  }
  return data as PartnerSummaryResponse;
};
