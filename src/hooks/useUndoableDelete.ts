import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// DELETE WITH A GRACE PERIOD (req 2): "two step confirmation for delete and 5
// seconds undo".
//
// The confirmation happens in the UI; this hook owns the five seconds that
// follow. The row disappears immediately (so the admin sees the result they
// asked for), the real delete is held back, and an Undo button cancels it
// outright — nothing was ever written, so there is nothing to restore.
//
// A row stays hidden AFTER the timer fires too, until the delete has actually
// gone through. Without that it flashes back into the list for the second or
// two Firestore takes to confirm, which reads as "the delete failed". If the
// delete really does fail, the row comes back and the caller's error toast
// explains why.
//
// If the page unmounts while a delete is still waiting, it is FLUSHED rather
// than dropped: the admin confirmed it, so navigating away must not silently
// cancel the request.
// ---------------------------------------------------------------------------

export interface PendingDelete {
  key: string;
  label: string;
  /** Whole seconds still on the clock, 5 → 0. */
  secondsLeft: number;
}

interface Waiting {
  label: string;
  deadline: number;
  run: () => void | Promise<void>;
  timer: ReturnType<typeof setTimeout>;
}

export const useUndoableDelete = (delayMs = 5000) => {
  const waiting = useRef(new Map<string, Waiting>());
  /** Confirmed and running/ran — hidden, but no longer undoable. */
  const committed = useRef(new Set<string>());
  const [pending, setPending] = useState<PendingDelete[]>([]);
  // Bumped whenever `committed` changes, so consumers' memos re-run.
  const [revision, setRevision] = useState(0);

  const snapshot = useCallback(() => {
    const now = Date.now();
    setPending(Array.from(waiting.current.entries()).map(([key, item]) => ({
      key,
      label: item.label,
      secondsLeft: Math.max(0, Math.ceil((item.deadline - now) / 1000)),
    })));
  }, []);

  // Tick only while something is waiting — no idle timer on the page.
  useEffect(() => {
    if (pending.length === 0) return;
    const interval = setInterval(snapshot, 250);
    return () => clearInterval(interval);
  }, [pending.length, snapshot]);

  const commit = useCallback(async (key: string, run: () => void | Promise<void>) => {
    committed.current.add(key);
    setRevision((value) => value + 1);
    try {
      await run();
    } catch (error) {
      // The write failed — the record still exists, so show it again.
      console.error("useUndoableDelete: the delete failed", error);
      committed.current.delete(key);
      setRevision((value) => value + 1);
    }
  }, []);

  useEffect(() => () => {
    // Unmount: honour every confirmed delete immediately.
    for (const item of waiting.current.values()) {
      clearTimeout(item.timer);
      void item.run();
    }
    waiting.current.clear();
  }, []);

  /** Hide the row now; actually delete it in `delayMs` unless undone. */
  const scheduleDelete = useCallback((key: string, label: string, run: () => void | Promise<void>) => {
    const existing = waiting.current.get(key);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      waiting.current.delete(key);
      snapshot();
      void commit(key, run);
    }, delayMs);
    waiting.current.set(key, { label, run, timer, deadline: Date.now() + delayMs });
    snapshot();
  }, [delayMs, snapshot, commit]);

  /** Cancel a waiting delete — nothing was written, so nothing is restored. */
  const undoDelete = useCallback((key: string): boolean => {
    const item = waiting.current.get(key);
    if (!item) return false;
    clearTimeout(item.timer);
    waiting.current.delete(key);
    snapshot();
    return true;
  }, [snapshot]);

  /** Hidden from the list: waiting out its undo window, or already committed. */
  const isPendingDelete = useCallback(
    (key: string): boolean => waiting.current.has(key) || committed.current.has(key),
    [],
  );

  return { pending, revision, scheduleDelete, undoDelete, isPendingDelete };
};
