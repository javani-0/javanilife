import { createPortal } from "react-dom";
import { RotateCcw, Trash2 } from "lucide-react";
import type { PendingDelete } from "@/hooks/useUndoableDelete";

// ---------------------------------------------------------------------------
// The five-second window itself, made visible (req 2). One bar per waiting
// delete, pinned above the mobile nav so it is reachable on a phone.
// ---------------------------------------------------------------------------

interface UndoDeleteBarProps {
  pending: PendingDelete[];
  onUndo: (key: string) => void;
}

const UndoDeleteBar = ({ pending, onUndo }: UndoDeleteBarProps) => {
  if (pending.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[10040] flex flex-col items-center gap-2 px-4 sm:bottom-6">
      {pending.map((item) => (
        <div
          key={item.key}
          role="status"
          className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-hero"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <Trash2 className="h-4 w-4 text-destructive" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-body text-sm font-semibold text-foreground">{item.label}</p>
            <p className="font-body text-xs text-muted-foreground">
              Deleting in {item.secondsLeft}s — you can still undo.
            </p>
          </div>
          <button
            onClick={() => onUndo(item.key)}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-gold/50 px-3 py-2 font-body text-xs font-bold uppercase tracking-wide text-gold transition-colors hover:bg-gold/10"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Undo
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
};

export default UndoDeleteBar;
