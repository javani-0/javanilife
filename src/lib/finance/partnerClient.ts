// The read-only partner dashboard never touches raw orders/customers — it asks
// the server for pre-aggregated, PARTNER-SCOPED numbers only (computed with the
// Admin SDK). The partner sees just their own share (career + per month) and
// the total-expenses figure — nothing detailed (req).

export interface PartnerShareMonth {
  key: string;          // "2026-07"
  label: string;        // "July 2026"
  shareInPaise: number; // this partner's share earned that month
}

export interface PartnerSummaryResponse {
  partnerName?: string;
  shareClassesPercent: number;
  shareCoursesPercent: number;
  shareProductsPercent: number;
  /** Months (newest first) where this partner actually earned a share. */
  months: PartnerShareMonth[];
  careerShareInPaise: number;     // all-time total share
  thisMonthShareInPaise: number;  // current month's share
  careerExpensesInPaise: number;  // total expenses — just the figure
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
  const parsed = data as Partial<PartnerSummaryResponse>;
  return {
    partnerName: parsed.partnerName || "",
    shareClassesPercent: parsed.shareClassesPercent || 0,
    shareCoursesPercent: parsed.shareCoursesPercent || 0,
    shareProductsPercent: parsed.shareProductsPercent || 0,
    months: Array.isArray(parsed.months) ? parsed.months : [],
    careerShareInPaise: parsed.careerShareInPaise || 0,
    thisMonthShareInPaise: parsed.thisMonthShareInPaise || 0,
    careerExpensesInPaise: parsed.careerExpensesInPaise || 0,
    generatedAt: parsed.generatedAt,
  };
};
