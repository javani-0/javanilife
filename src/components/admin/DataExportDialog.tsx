import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Download, FileSpreadsheet, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { downloadCsv, downloadXlsx, type CellValue } from "@/lib/export/xlsx";

// ---------------------------------------------------------------------------
// The shared "download this list as a spreadsheet" dialog (req 1 + 5).
//
// The CALLER owns what is in the list — it passes rows it has already filtered,
// plus its own filter controls to render inside the dialog. This dialog owns
// only the parts every export shares: which columns, Excel or CSV, the file
// name, and the download itself. Finance keeps its own dialog because it builds
// several sheets from several sources.
// ---------------------------------------------------------------------------

export interface ExportColumn<T> {
  key: string;
  label: string;
  /** Column width in characters. */
  width?: number;
  /** Rupee-formatted in Excel. `value` must then return a NUMBER of rupees. */
  money?: boolean;
  value: (row: T) => CellValue;
  /** Unticked by default — for the long/rare columns. */
  optional?: boolean;
}

interface DataExportDialogProps<T> {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Already filtered by the caller's own controls. */
  rows: T[];
  columns: ExportColumn<T>[];
  /** Excel tab name. */
  sheetName: string;
  defaultFilename: string;
  /** The caller's filter UI, rendered above the column pickers. */
  filters?: React.ReactNode;
  /** Line under the footer count, e.g. "of 108 students". */
  summary?: string;
  onExported?: (count: number) => void;
}

const DataExportDialog = <T,>({
  open, onClose, title, description, rows, columns, sheetName, defaultFilename, filters, summary, onExported,
}: DataExportDialogProps<T>) => {
  const { toast } = useToast();
  const [hidden, setHidden] = useState<string[]>(() => columns.filter((column) => column.optional).map((column) => column.key));
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);

  const chosen = useMemo(() => columns.filter((column) => !hidden.includes(column.key)), [columns, hidden]);

  if (!open) return null;

  const download = () => {
    if (chosen.length === 0) { toast({ title: "Pick at least one column", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const name = (filename.trim() || defaultFilename).replace(/\.(xlsx|csv)$/i, "");
      const sheet = {
        name: sheetName,
        header: chosen.map((column) => column.label),
        rows: rows.map((row) => chosen.map((column) => column.value(row))),
        moneyColumns: chosen.map((column, index) => (column.money ? index : -1)).filter((index) => index >= 0),
        widths: chosen.map((column) => column.width || 18),
      };
      if (format === "csv") downloadCsv([sheet], name); else downloadXlsx([sheet], name);
      toast({ title: `Downloaded ${name}.${format}`, description: `${rows.length} row${rows.length === 1 ? "" : "s"} · ${chosen.length} columns` });
      onExported?.(rows.length);
      onClose();
    } catch (error) {
      toast({ title: "Could not build the file", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const chip = (active: boolean) =>
    `rounded-md border px-3 py-1.5 font-body text-xs font-semibold transition-colors ${active ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`;

  // Portalled: a `fixed` overlay inside the admin shell is positioned against a
  // transformed ancestor, which pushes the card off-screen on a phone.
  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 p-5">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-display text-xl text-foreground">
              <FileSpreadsheet className="h-5 w-5 text-green-600" /> {title}
            </h3>
            {description && <p className="mt-0.5 font-body text-xs text-muted-foreground">{description}</p>}
          </div>
          <button onClick={onClose} className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {filters && (
            <div>
              <p className="font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">What to include</p>
              <div className="mt-2 space-y-2">{filters}</div>
            </div>
          )}

          <div>
            <p className="font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">Columns</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setHidden([])} className={chip(hidden.length === 0)}>All columns</button>
              <button
                type="button"
                onClick={() => setHidden(columns.filter((column) => column.optional).map((column) => column.key))}
                className={chip(false)}
              >
                Reset
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {columns.map((column) => {
                const on = !hidden.includes(column.key);
                return (
                  <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2.5 py-2 font-body text-xs text-foreground hover:border-gold/40">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setHidden((current) => (on ? [...current, column.key] : current.filter((key) => key !== column.key)))}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 truncate">{column.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <p className="font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">Format</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setFormat("xlsx")} className={chip(format === "xlsx")}>Excel (.xlsx)</button>
              <button type="button" onClick={() => setFormat("csv")} className={chip(format === "csv")}>CSV</button>
            </div>
            <label className="mt-2 block">
              <span className="mb-1 block font-body text-[0.7rem] text-muted-foreground">File name (optional)</span>
              <input
                value={filename}
                onChange={(event) => setFilename(event.target.value)}
                placeholder={defaultFilename}
                className="h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
              />
            </label>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/60 p-4">
          <p className="font-body text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{rows.length}</span> row{rows.length === 1 ? "" : "s"}
            {summary ? ` ${summary}` : ""} · {chosen.length} column{chosen.length === 1 ? "" : "s"}
          </p>
          <button
            onClick={download}
            disabled={busy || rows.length === 0}
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

export default DataExportDialog;
