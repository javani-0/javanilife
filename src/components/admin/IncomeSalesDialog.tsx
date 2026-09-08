import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import {
  SALE_CATEGORY_LABELS,
  summarizeSalesByMode,
  type SaleCategory,
  type SaleLine,
  type SaleMode,
} from "@/lib/finance";

// ---------------------------------------------------------------------------
// "What made up this number?" (req 2). Opened from an income category or from a
// partner's share, it lists the individual sales behind the figure: what was
// sold, to whom, when, for how much, and whether the money came in online or
// offline.
//
// It only DISPLAYS lines the caller has already filtered by period — it never
// re-derives money, so it can't disagree with the tiles.
// ---------------------------------------------------------------------------

const MODE_STYLES: Record<SaleMode, string> = {
  online: "bg-green-100 text-green-700",
  offline: "bg-amber-100 text-amber-700",
  unknown: "bg-muted text-muted-foreground",
};

const MODE_LABELS: Record<SaleMode, string> = {
  online: "Online",
  offline: "Offline",
  unknown: "Not recorded",
};

interface IncomeSalesDialogProps {
  open: boolean;
  onClose: () => void;
  /** Already period-filtered. */
  lines: SaleLine[];
  category: SaleCategory | "all";
  periodLabel: string;
  /** Optional context line, e.g. "VANITHA · 60% of product income". */
  note?: string;
}

const niceDate = (dateKey: string): string => {
  if (!dateKey) return "—";
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const IncomeSalesDialog = ({ open, onClose, lines, category, periodLabel, note }: IncomeSalesDialogProps) => {
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<SaleMode | "all">("all");

  const scoped = useMemo(
    () => (category === "all" ? lines : lines.filter((line) => line.category === category)),
    [lines, category],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return scoped.filter((line) => {
      if (mode !== "all" && line.mode !== mode) return false;
      if (!needle) return true;
      return `${line.name} ${line.buyer} ${line.reference}`.toLowerCase().includes(needle);
    });
  }, [scoped, search, mode]);

  const totalInPaise = useMemo(() => visible.reduce((sum, line) => sum + line.amountInPaise, 0), [visible]);
  const byMode = useMemo(() => summarizeSalesByMode(scoped), [scoped]);

  if (!open) return null;

  const title = category === "all" ? "All sales" : SALE_CATEGORY_LABELS[category];

  // Portalled for the same reason as the export dialog: a `fixed` overlay
  // inside the transformed admin shell lands off-screen on a phone.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      {/* max-h + min-h-0 + shrink-0 header: the canonical scroll-container fix —
          without it the list clips its own top and bottom on a phone. */}
      <div
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 p-5">
          <div className="min-w-0">
            <h3 className="font-display text-xl text-foreground">{title}</h3>
            <p className="mt-0.5 font-body text-xs text-muted-foreground">
              {note ? `${note} · ` : ""}{periodLabel} · {scoped.length} sale{scoped.length === 1 ? "" : "s"}
              {byMode.online.count > 0 && ` · Online ${formatPaiseAsRupees(byMode.online.totalInPaise)}`}
              {byMode.offline.count > 0 && ` · Offline ${formatPaiseAsRupees(byMode.offline.totalInPaise)}`}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 p-4">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              size={1}
              placeholder="Search item, student or customer…"
              className="h-10 w-full min-w-0 rounded-md border border-border bg-background pl-9 pr-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
            />
          </div>
          {(["all", "online", "offline"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={`shrink-0 rounded-md border px-3 py-2 font-body text-xs font-semibold transition-colors ${mode === value ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}
            >
              {value === "all" ? "All" : value === "online" ? "Online" : "Offline"}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 p-8 text-center font-body text-sm text-muted-foreground">
              No sales match this view.
            </p>
          ) : (
            <div className="space-y-2">
              {visible.map((line) => (
                <div key={line.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/70 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-body text-sm font-semibold text-foreground">{line.name}</p>
                    <p className="truncate font-body text-xs text-muted-foreground">
                      {niceDate(line.dateKey)}
                      {line.buyer ? ` · ${line.buyer}` : ""}
                      {line.reference ? ` · ${line.reference}` : ""}
                      {category === "all" ? ` · ${SALE_CATEGORY_LABELS[line.category]}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 font-body text-[0.65rem] font-semibold ${MODE_STYLES[line.mode]}`}>
                      {MODE_LABELS[line.mode]} · {line.methodLabel}
                    </span>
                    <span className="font-display text-sm font-bold text-green-600">{formatPaiseAsRupees(line.amountInPaise)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 p-4">
          <span className="font-body text-sm text-muted-foreground">{visible.length} shown</span>
          <span className="font-display text-lg font-bold text-foreground">{formatPaiseAsRupees(totalInPaise)}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default IncomeSalesDialog;
