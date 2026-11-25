import { useSyncExternalStore } from "react";

/**
 * Master class cart (owner 2026-11-25): students add classes, then pay for them
 * together in one bill. Only course ids are kept (in this browser); prices and
 * access are always re-read from the live courses and checked again by the server.
 */
const KEY = "javani-learn-cart";
/** The server accepts up to 5 master classes in one payment. */
export const CART_MAX = 5;

const listeners = new Set<() => void>();
let cache: string[] | null = null;

const read = (): string[] => {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    cache = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && !!id).slice(0, CART_MAX) : [];
  } catch {
    cache = [];
  }
  return cache;
};

const write = (ids: string[]) => {
  cache = Array.from(new Set(ids)).slice(0, CART_MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* private mode: the cart still works for this visit */
  }
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
};

const EMPTY: string[] = [];

export const learnCart = {
  add: (id: string) => write([...read(), id]),
  remove: (id: string) => write(read().filter((x) => x !== id)),
  removeMany: (ids: string[]) => write(read().filter((x) => !ids.includes(x))),
  clear: () => write([]),
};

/** The cart's course ids, kept in sync across the page and other tabs. */
export const useLearnCart = () => useSyncExternalStore(subscribe, read, () => EMPTY);
