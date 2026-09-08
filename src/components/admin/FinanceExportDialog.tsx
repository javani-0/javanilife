import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Download, FileSpreadsheet, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { downloadCsv, downloadXlsx } from "@/lib/export/xlsx";
import {
  DEFAULT_EXPORT_OPTIONS,
  FINANCE_SHEET_KEYS,
  FINANCE_SHEET_LABELS,
  SALES_COLUMNS,
  SALES_COLUMN_LABELS,
  SALE_CATEGORIES,
  SALE_CATEGORY_LABELS,
  buildExportFilename,
  buildFinanceSheets,
  countExportRows,
  type AmountUnit,
  type FinanceExportInput,
  type FinanceExportOptions,
  type FinanceSheetKey,
  type SaleCategory,
  type SaleMode,
  type SalesColumn,
} from "@/lib/finance";

// ---------------------------------------------------------------------------
// "Export to Excel — with full control" (req 1).
//
// The admin picks the exact date range (not just the page's period chips), the
// tabs, the sale categories, online/offline, the columns, rupees vs paise, and
// the file name — and sees the row count update before they commit. The file is
// written in the browser (src/lib/export/xlsx.ts): no upload, no add-on, and it
// works offline.
// ---------------------------------------------------------------------------

interface FinanceExportDialogProps {
  open: boolean;
  onClose: () => void;
  /** UNFILTERED records — the dialog owns its own range. */
  data: FinanceExportInput;
  /** The page's current range, used as the starting point. */
  defaultFrom: string;
  defaultTo: string;
  periodLabel: string;
  onExported?: (summary: string) => void;
}

const pad = (value: number): string => String(value).padStart(2, "0");
const dayKey = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const toggle = <T,>(list: T[], value: T): T[] =>
  (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-md border px-3 py-1.5 font-body text-xs font-semibold transition-colors ${active ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}
  >
    {children}
  </button>
);

const Check = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2.5 py-2 font-body text-xs text-foreground hover:border-gold/40">
    <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 shrink-0 accent-[hsl(var(--gold,45_60%_50%))]" />
    <span className="min-w-0 truncate">{label}</span>
  </label>
);

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <div>
    <p className="font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
    {hint && <p className="mt-0.5 font-body text-[0.7rem] text-muted-foreground">{hint}</p>}
    <div className="mt-2">{children}</div>
  </div>
);

const FinanceExportDialog = ({ open, onClose, data, defaultFrom, defaultTo, periodLabel, onExported }: FinanceExportDialogProps) => {
  const { toast } = useToast();

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [sheets, setSheets] = useState<FinanceSheetKey[]>(DEFAULT_EXPORT_OPTIONS.sheets);
  const [categories, setCategories] = useState<SaleCategory[]>(DEFAULT_EXPORT_OPTIONS.categories);
  const [mode, setMode] = useState<SaleMode | "all">("all");
  const [columns, setColumns] = useState<SalesColumn[]>(DEFAULT_EXPORT_OPTIONS.columns);
  const [amountUnit, setAmountUnit] = useState<AmountUnit>("rupees");
  const [includeTotals, setIncludeTotals] = useState(true);
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);

  // Re-open on whatever period the page is showing now.
  useEffect(() => {
    if (!open) return;
    setFrom(defaultFrom);
    setTo(defaultTo);
    setFilename("");
  }, [open, defaultFrom, defaultTo]);

  // The Summary tab must name the range that was actually exported. Only while
  // the dates are untouched does the page's own label still describe it.
  const rangeLabel = useMemo(() => {
    if (from === defaultFrom && to === defaultTo) return periodLabel;
    if (!from && !to) return "All time";
    const nice = (key: string) => new Date(`${key}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    if (from && to) return from === to ? nice(from) : `${nice(from)} → ${nice(to)}`;
    return from ? `${nice(from)} onwards` : `Up to ${nice(to)}`;
  }, [from, to, defaultFrom, defaultTo, periodLabel]);

  const options: FinanceExportOptions = useMemo(() => ({
    from, to, sheets, categories, mode, columns, amountUnit, includeTotals, periodLabel: rangeLabel,
  }), [from, to, sheets, categories, mode, columns, amountUnit, includeTotals, rangeLabel]);

  const counts = useMemo(() => (open ? countExportRows(data, options) : { sales: 0, expenses: 0, otherIncome: 0 }), [open, data, options]);

  if (!open) return null;

  const applyQuickRange = (kind: "month" | "lastMonth" | "year" | "all") => {
    const now = new Date();
    if (kind === "all") { setFrom(""); setTo(""); return; }
    if (kind === "year") { setFrom(`${now.getFullYear()}-01-01`); setTo(dayKey(now)); return; }
    const offset = kind === "lastMonth" ? -1 : 0;
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    setFrom(dayKey(start));
    setTo(dayKey(end));
  };

  const download = () => {
    if (sheets.length === 0) { toast({ title: "Pick at least one sheet to export", variant: "destructive" }); return; }
    if (from && to && from > to) { toast({ title: "The From date is after the To date", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const built = buildFinanceSheets(data, options);
      const name = (filename.trim() || buildExportFilename(options)).replace(/\.(xlsx|csv)$/i, "");
      if (format === "csv") downloadCsv(built, name); else downloadXlsx(built, name);
      const summary = `${counts.sales} sales · ${counts.expenses} expenses · ${counts.otherIncome} other income (${from || "start"} → ${to || "today"})`;
      toast({ title: `Downloaded ${name}.${format}`, description: summary });
      onExported?.(summary);
      onClose();
    } catch (error) {
      toast({ title: "Could not build the file", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const dateInput = "h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20";

  // Portalled to <body>: the admin shell has a transformed ancestor, which
  // makes a `fixed` overlay position against THAT box instead of the
  // viewport — on a phone the card ends up hundreds of pixels below the fold.
  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 p-5">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-display text-xl text-foreground">
              <FileSpreadsheet className="h-5 w-5 text-green-600" /> Export finance
            </h3>
            <p className="mt-0.5 font-body text-xs text-muted-foreground">
              Choose exactly what goes into the file — dates, sheets, categories, columns and format.
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <Section title="Date range" hint="Any range you like — this is not limited to the page's period buttons.">
            <div className="flex flex-wrap gap-2">
              <Chip active={false} onClick={() => applyQuickRange("month")}>This month</Chip>
              <Chip active={false} onClick={() => applyQuickRange("lastMonth")}>Last month</Chip>
              <Chip active={false} onClick={() => applyQuickRange("year")}>This year</Chip>
              <Chip active={!from && !to} onClick={() => applyQuickRange("all")}>All time</Chip>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block font-body text-[0.7rem] text-muted-foreground">From</span>
                <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={dateInput} />
              </label>
              <label className="block">
                <span className="mb-1 block font-body text-[0.7rem] text-muted-foreground">To</span>
                <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={dateInput} />
              </label>
            </div>
          </Section>

          <Section title="Sheets to include">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {FINANCE_SHEET_KEYS.map((key) => (
                <Check key={key} checked={sheets.includes(key)} onChange={() => setSheets((current) => toggle(current, key))} label={FINANCE_SHEET_LABELS[key]} />
              ))}
            </div>
          </Section>

          <Section title="Which sales" hint="Filters the Sales tab and every total derived from it.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SALE_CATEGORIES.map((category) => (
                <Check
                  key={category}
                  checked={categories.includes(category)}
                  onChange={() => setCategories((current) => toggle(current, category))}
                  label={SALE_CATEGORY_LABELS[category]}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["all", "online", "offline"] as const).map((value) => (
                <Chip key={value} active={mode === value} onClick={() => setMode(value)}>
                  {value === "all" ? "Online + offline" : value === "online" ? "Online only" : "Offline only"}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title="Columns on the sales tab">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SALES_COLUMNS.map((column) => (
                <Check
                  key={column}
                  checked={columns.includes(column)}
                  onChange={() => setColumns((current) => toggle(current, column))}
                  label={SALES_COLUMN_LABELS[column]}
                />
              ))}
            </div>
          </Section>

          <Section title="Format">
            <div className="flex flex-wrap gap-2">
              <Chip active={format === "xlsx"} onClick={() => setFormat("xlsx")}>Excel (.xlsx)</Chip>
              <Chip active={format === "csv"} onClick={() => setFormat("csv")}>CSV</Chip>
              <Chip active={amountUnit === "rupees"} onClick={() => setAmountUnit("rupees")}>Amounts in ₹</Chip>
              <Chip active={amountUnit === "paise"} onClick={() => setAmountUnit("paise")}>Amounts in paise</Chip>
              <Chip active={includeTotals} onClick={() => setIncludeTotals((value) => !value)}>
                {includeTotals ? "Totals row: on" : "Totals row: off"}
              </Chip>
            </div>
            <label className="mt-2 block">
              <span className="mb-1 block font-body text-[0.7rem] text-muted-foreground">File name (optional)</span>
              <input
                value={filename}
                onChange={(event) => setFilename(event.target.value)}
                placeholder={buildExportFilename(options)}
                className={dateInput}
              />
            </label>
          </Section>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/60 p-4">
          <p className="font-body text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{counts.sales}</span> sales ·{" "}
            <span className="font-semibold text-foreground">{counts.expenses}</span> expenses ·{" "}
            <span className="font-semibold text-foreground">{counts.otherIncome}</span> other income
          </p>
          <button
            onClick={download}
            disabled={busy || sheets.length === 0}
            className="flex min-h-10 items-center gap-2 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download {format === "xlsx" ? "Excel" : "CSV"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default FinanceExportDialog;
