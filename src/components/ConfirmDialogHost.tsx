import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, HelpCircle } from "lucide-react";

// ---------------------------------------------------------------------------
// Professional in-app replacement for window.confirm / window.prompt (req):
// one host mounted in App renders a themed popup; `confirmDialog(...)` and
// `promptDialog(...)` are awaitable from anywhere. Supports destructive
// styling and a type-to-confirm guard for danger-zone actions.
// ---------------------------------------------------------------------------

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  /** The user must type this exact word to enable the confirm button. */
  requireText?: string;
}

export interface PromptOptions {
  title: string;
  description?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  /** When false the confirm button stays disabled until something is typed. */
  optional?: boolean;
}

type DialogRequest =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (value: string | null) => void };

let enqueueRequest: ((request: DialogRequest) => void) | null = null;

/** Ask a yes/no question with a styled popup. Resolves true when confirmed. */
export const confirmDialog = (opts: ConfirmOptions): Promise<boolean> =>
  new Promise((resolve) => {
    if (!enqueueRequest) { resolve(window.confirm(opts.title)); return; } // host not mounted (tests)
    enqueueRequest({ kind: "confirm", opts, resolve });
  });

/** Ask for a short text input. Resolves the text, or null when cancelled. */
export const promptDialog = (opts: PromptOptions): Promise<string | null> =>
  new Promise((resolve) => {
    if (!enqueueRequest) { resolve(window.prompt(opts.title)); return; }
    enqueueRequest({ kind: "prompt", opts, resolve });
  });

const ConfirmDialogHost = () => {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [typed, setTyped] = useState("");
  const current = queue[0] || null;

  useEffect(() => {
    enqueueRequest = (request) => setQueue((existing) => [...existing, request]);
    return () => { enqueueRequest = null; };
  }, []);

  useEffect(() => { setTyped(""); }, [current]);

  useEffect(() => {
    if (!current) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!current) return null;

  const { opts } = current;
  const destructive = opts.destructive === true;
  const requireText = current.kind === "confirm" ? (current.opts.requireText || "").trim() : "";
  const promptRequired = current.kind === "prompt" && current.opts.optional === false;
  const confirmDisabled = requireText
    ? typed.trim().toUpperCase() !== requireText.toUpperCase()
    : promptRequired && !typed.trim();

  const close = (confirmed: boolean) => {
    if (current.kind === "confirm") current.resolve(confirmed);
    else current.resolve(confirmed ? typed.trim() : null);
    setQueue((existing) => existing.slice(1));
  };

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => close(false)} />
      <div className="relative w-full max-w-sm rounded-2xl bg-card p-5 shadow-hero sm:p-6" role="alertdialog" aria-modal="true" aria-label={opts.title}>
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${destructive ? "bg-destructive/10" : "bg-gold/15"}`}>
            {destructive ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <HelpCircle className="h-5 w-5 text-gold" />}
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-lg leading-snug text-foreground">{opts.title}</h2>
            {opts.description && <p className="mt-1 whitespace-pre-line font-body text-sm text-muted-foreground">{opts.description}</p>}
          </div>
        </div>

        {current.kind === "prompt" && (
          <input
            autoFocus
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={current.opts.placeholder || ""}
            onKeyDown={(event) => { if (event.key === "Enter" && !confirmDisabled) close(true); }}
            className="mt-4 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
          />
        )}

        {requireText && (
          <div className="mt-4">
            <p className="mb-1.5 font-body text-xs text-muted-foreground">Type <span className="font-bold text-destructive">{requireText}</span> to confirm:</p>
            <input
              autoFocus
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={requireText}
              onKeyDown={(event) => { if (event.key === "Enter" && !confirmDisabled) close(true); }}
              className="h-11 w-full rounded-md border border-destructive/40 bg-background px-3 font-body text-sm outline-none focus:border-destructive focus:ring-2 focus:ring-destructive/20"
            />
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={() => close(false)}
            className="min-h-10 rounded-md border border-border px-4 font-body text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted"
          >
            {opts.cancelText || "Cancel"}
          </button>
          <button
            onClick={() => close(true)}
            disabled={confirmDisabled}
            className={`min-h-10 rounded-md px-4 font-body text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50 ${destructive ? "bg-destructive hover:brightness-110" : "bg-gradient-primary text-primary-foreground hover:brightness-110"}`}
          >
            {opts.confirmText || "Confirm"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ConfirmDialogHost;
