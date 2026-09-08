import { CalendarRange } from "lucide-react";
import {
  createPeriodSelection,
  describePeriod,
  monthKeyOf,
  type PeriodSelection,
} from "@/lib/finance";

// ---------------------------------------------------------------------------
// The date filter every admin screen shares (req 3).
//
// This month · Today · All time · a MONTH picker (any month, not just this one)
// · one day · and a FROM–TO range. The label underneath always spells out what
// is actually being shown, because "This month" and "1–15 Sep" look identical
// once you have clicked around for a minute.
// ---------------------------------------------------------------------------

interface PeriodFilterProps {
  value: PeriodSelection;
  onChange: (next: PeriodSelection) => void;
  /** Injected so a page and its export cannot disagree about "today". */
  today?: Date;
  /** Extra controls rendered on the same row (an export button, say). */
  children?: React.ReactNode;
  className?: string;
}

const PeriodFilter = ({ value, onChange, today = new Date(), children, className = "" }: PeriodFilterProps) => {
  const chip = (active: boolean) =>
    `min-h-10 rounded-md border px-4 font-body text-sm font-semibold transition-colors ${active ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`;

  const input = (active: boolean) =>
    `h-10 rounded-md border px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 ${active ? "border-gold bg-gold/10 text-gold" : "border-border bg-background text-muted-foreground"}`;

  const thisMonth = monthKeyOf(today);

  return (
    <div className={`flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...value, mode: "month", monthKey: thisMonth })}
          className={chip(value.mode === "month" && value.monthKey === thisMonth)}
        >
          This Month
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, mode: "today" })}
          className={chip(value.mode === "today")}
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, mode: "all" })}
          className={chip(value.mode === "all")}
        >
          All Time
        </button>

        {/* Any month (req 3) */}
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Pick a month</span>
          <input
            type="month"
            value={value.monthKey}
            onChange={(event) => {
              if (!event.target.value) return;
              onChange({ ...value, mode: "month", monthKey: event.target.value });
            }}
            className={input(value.mode === "month" && value.monthKey !== thisMonth)}
            title="Show a particular month"
          />
        </label>

        {/* One day */}
        <input
          type="date"
          value={value.day}
          onChange={(event) => {
            if (!event.target.value) return;
            onChange({ ...value, mode: "day", day: event.target.value });
          }}
          className={input(value.mode === "day")}
          title="Show one date"
        />
      </div>

      {/* From–To (req 3) */}
      <div className="flex flex-wrap items-end gap-2">
        <span className="flex items-center gap-1.5 self-center font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <CalendarRange className="h-4 w-4 text-gold" /> Date range
        </span>
        <label className="block">
          <span className="mb-1 block font-body text-[0.7rem] text-muted-foreground">From</span>
          <input
            type="date"
            value={value.from}
            onChange={(event) => onChange({ ...value, mode: "range", from: event.target.value })}
            className={input(value.mode === "range")}
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-body text-[0.7rem] text-muted-foreground">To</span>
          <input
            type="date"
            value={value.to}
            onChange={(event) => onChange({ ...value, mode: "range", to: event.target.value })}
            className={input(value.mode === "range")}
          />
        </label>
        <button
          type="button"
          onClick={() => onChange({ ...value, mode: "range" })}
          className={chip(value.mode === "range")}
        >
          Apply range
        </button>
        <button
          type="button"
          onClick={() => onChange(createPeriodSelection(today))}
          className="min-h-10 rounded-md px-3 font-body text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Reset
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3">
        <p className="font-body text-sm text-muted-foreground">
          Showing: <span className="font-semibold text-foreground">{describePeriod(value, today)}</span>
        </p>
        {children}
      </div>
    </div>
  );
};

export default PeriodFilter;
