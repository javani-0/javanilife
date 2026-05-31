// Meta Pixel (Facebook Pixel) helpers.
//
// The base pixel is initialised once in index.html with dataset "Hastra mudra"
// (Pixel ID 1500016554837133). That snippet only calls `fbq('init', ...)` — it does
// NOT auto-fire PageView, because this is a single-page app and we fire PageView on
// every client-side route change instead (see MetaPixelPageViews in App.tsx).
//
// These helpers fire events against the already-loaded global `fbq`. Every call is
// guarded with `if (window.fbq)` so it is a no-op if the pixel script was blocked
// (ad blocker, offline, etc.) and never throws.

declare global {
  interface Window {
    fbq?: (
      method: "track" | "trackCustom" | "init" | string,
      eventName?: string,
      params?: Record<string, unknown>,
      options?: { eventID?: string },
    ) => void;
    _fbq?: unknown;
  }
}

/** Fire a standard PageView. Called on initial load and on every route change. */
export const trackPageView = (): void => {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  window.fbq("track", "PageView");
};

/**
 * Fire a standard Purchase exactly once per confirmed order.
 *
 * @param value    Real order total in major currency units (e.g. rupees, not paise).
 * @param currency ISO currency code. Defaults to INR.
 * @param eventId  Unique order number (e.g. JAV-20260531-R7Y39). Sent as `eventID`
 *                 so Meta deduplicates against any accidental double-fire.
 */
export const trackPurchase = ({
  value,
  currency = "INR",
  eventId,
}: {
  value: number;
  currency?: string;
  eventId: string;
}): void => {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  if (!Number.isFinite(value)) return;
  window.fbq("track", "Purchase", { value, currency }, { eventID: eventId });
};

export {};
