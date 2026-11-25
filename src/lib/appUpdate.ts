import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Keeps open tabs on the latest release (client 2026-11-25: a tab opened before
 * a deploy kept showing the old "Contact us" screen). The page compares its own
 * bundle name with the one the server serves now; when they differ it reloads
 * at a safe moment: on the next page change, or when the tab comes back into
 * view with no dialog open and no field being typed in.
 */
const ENTRY = /\/assets\/index-[\w-]+\.js/;
const CHECK_EVERY_MS = 5 * 60 * 1000;

const currentEntry = () => {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  return script?.src.match(ENTRY)?.[0] ?? null;
};

let updateReady = false;
let lastCheck = 0;

const checkForUpdate = async () => {
  const mine = currentEntry();
  if (!mine || updateReady || Date.now() - lastCheck < 60_000) return;
  lastCheck = Date.now();
  try {
    const html = await (await fetch("/", { cache: "no-store" })).text();
    const live = html.match(ENTRY)?.[0];
    if (live && live !== mine) updateReady = true;
  } catch {
    /* offline: try again later */
  }
};

const busy = () => {
  const active = document.activeElement;
  return !!document.querySelector('[role="dialog"]') || (active instanceof HTMLElement && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)));
};

/** Mount once inside the router. Does nothing in dev (no built bundle). */
export const useAppUpdate = () => {
  const { pathname } = useLocation();

  // A new page = a safe moment to load the new release at the new address.
  useEffect(() => {
    if (updateReady) window.location.reload();
  }, [pathname]);

  useEffect(() => {
    if (!currentEntry()) return;
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      await checkForUpdate();
      if (updateReady && !busy()) window.location.reload();
    };
    // A lazy page chunk that no longer exists (after a deploy): reload once to get the new files.
    const onPreloadError = (event: Event) => {
      try {
        if (sessionStorage.getItem("javani-chunk-reload")) return;
        sessionStorage.setItem("javani-chunk-reload", "1");
      } catch {
        /* no storage: still reload once for this page */
      }
      event.preventDefault();
      window.location.reload();
    };
    const timer = window.setInterval(() => void checkForUpdate(), CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("vite:preloadError", onPreloadError);
    void checkForUpdate();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("vite:preloadError", onPreloadError);
    };
  }, []);
};
