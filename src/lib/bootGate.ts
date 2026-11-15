import { useLayoutEffect, useSyncExternalStore } from "react";

// Boot gate: the dark <PageLoader /> stays up until the first real page is ready.
// Any interim loader (lazy-route Suspense fallback, auth-check spinner) "holds" the
// boot while it is mounted, so a reload goes splash -> page, never splash -> cream
// spinner -> page. After boot these loaders behave as before (normal navigation).
let pending = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((fn) => fn());

const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => subs.delete(fn);
};
const getSnapshot = () => pending;

/** Mount inside any interim loader component. */
export const useHoldBoot = () => {
  useLayoutEffect(() => {
    pending++;
    emit();
    return () => {
      pending--;
      emit();
    };
  }, []);
};

/** Number of interim loaders currently mounted. */
export const useBootPending = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
