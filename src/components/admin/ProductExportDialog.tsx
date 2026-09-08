import { useMemo, useState } from "react";
import DataExportDialog, { type ExportColumn } from "@/components/admin/DataExportDialog";
import { PRODUCT_STOCK_LABEL, type Product, type ProductStockStatus } from "@/lib/ecommerce";

// ---------------------------------------------------------------------------
// "Download the product list as Excel" (req 5). Stock take, price list, or a
// catalogue to hand a printer — the admin filters by category / stock /
// visibility, ticks the columns and gets a real spreadsheet.
// ---------------------------------------------------------------------------

interface ProductExportDialogProps {
  open: boolean;
  onClose: () => void;
  products: Product[];
  /** Label lookup for the managed category list. */
  categoryLabel: (id: string) => string;
}

type Visibility = "all" | "active" | "hidden";

const rupees = (paise: number | undefined): number => Math.round(paise || 0) / 100;

const ProductExportDialog = ({ open, onClose, products, categoryLabel }: ProductExportDialogProps) => {
  const [categories, setCategories] = useState<string[]>([]);
  const [stock, setStock] = useState<ProductStockStatus | "all">("all");
  const [visibility, setVisibility] = useState<Visibility>("all");

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) counts.set(product.category, (counts.get(product.category) || 0) + 1);
    return [...counts.entries()]
      .map(([id, count]) => ({ id, label: categoryLabel(id), count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [products, categoryLabel]);

  const rows = useMemo(() => products.filter((product) => {
    if (categories.length > 0 && !categories.includes(product.category)) return false;
    if (stock !== "all" && (product.stockStatus || "available") !== stock) return false;
    if (visibility === "active" && product.active === false) return false;
    if (visibility === "hidden" && product.active !== false) return false;
    return true;
  }), [products, categories, stock, visibility]);

  const columns: ExportColumn<Product>[] = [
    { key: "name", label: "Product", width: 34, value: (product) => product.name },
    { key: "category", label: "Category", width: 22, value: (product) => product.categoryLabel || categoryLabel(product.category) },
    { key: "sku", label: "SKU", width: 16, value: (product) => product.sku || "—" },
    { key: "price", label: "Price (₹)", width: 14, money: true, value: (product) => rupees(product.amountInPaise) },
    { key: "stockStatus", label: "Stock status", width: 16, value: (product) => PRODUCT_STOCK_LABEL[product.stockStatus || "available"] || product.stockStatus || "—" },
    { key: "stockQuantity", label: "Qty in stock", width: 14, value: (product) => (typeof product.stockQuantity === "number" ? product.stockQuantity : "") },
    { key: "active", label: "Visible on site", width: 14, value: (product) => (product.active === false ? "No" : "Yes") },
    { key: "featured", label: "Featured", width: 12, value: (product) => (product.featured ? "Yes" : "No") },
    { key: "rental", label: "Rentable", width: 12, value: (product) => (product.rental?.enabled ? "Yes" : "No") },
    { key: "rentalPrice", label: "Rent / 24h (₹)", width: 16, money: true, optional: true, value: (product) => rupees(product.rental?.pricePerDayInPaise) },
    { key: "vestra", label: "VESTRA", width: 12, optional: true, value: (product) => (product.vestra ? "Yes" : "No") },
    { key: "payment", label: "Payment methods", width: 22, optional: true, value: (product) => (product.allowedPaymentMethods || []).join(", ") || "All" },
    { key: "weight", label: "Weight (g)", width: 12, optional: true, value: (product) => product.delivery?.weightInGrams || "" },
    { key: "dims", label: "L×W×H (cm)", width: 16, optional: true, value: (product) => {
      const delivery = product.delivery;
      if (!delivery?.lengthInCm && !delivery?.widthInCm && !delivery?.heightInCm) return "—";
      return `${delivery?.lengthInCm || 0}×${delivery?.widthInCm || 0}×${delivery?.heightInCm || 0}`;
    } },
    { key: "shortDescription", label: "Short description", width: 44, optional: true, value: (product) => product.shortDescription || "" },
    { key: "id", label: "Product id", width: 24, optional: true, value: (product) => product.id },
  ];

  const chip = (active: boolean) =>
    `rounded-md border px-3 py-1.5 font-body text-xs font-semibold transition-colors ${active ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`;

  const filters = (
    <>
      <div className="rounded-md border border-border/60 p-2">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="font-body text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">Category</span>
          <button type="button" onClick={() => setCategories([])} className={chip(categories.length === 0)}>All categories</button>
        </div>
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {categoryOptions.map((option) => (
            <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 font-body text-xs text-foreground hover:bg-muted">
              <input
                type="checkbox"
                checked={categories.includes(option.id)}
                onChange={() => setCategories((current) => (current.includes(option.id) ? current.filter((id) => id !== option.id) : [...current, option.id]))}
                className="h-4 w-4 shrink-0"
              />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <span className="shrink-0 font-body text-[0.68rem] text-muted-foreground">{option.count}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "available", "out-of-stock", "coming-soon"] as const).map((value) => (
          <button key={value} type="button" onClick={() => setStock(value)} className={chip(stock === value)}>
            {value === "all" ? "Any stock" : PRODUCT_STOCK_LABEL[value]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {(["all", "active", "hidden"] as Visibility[]).map((value) => (
          <button key={value} type="button" onClick={() => setVisibility(value)} className={chip(visibility === value)}>
            {value === "all" ? "Visible + hidden" : value === "active" ? "Visible only" : "Hidden only"}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <DataExportDialog<Product>
      open={open}
      onClose={onClose}
      title="Export products"
      description="Filter the catalogue, choose the columns, download the sheet."
      rows={rows}
      columns={columns}
      sheetName="Products"
      defaultFilename={`javani-products-${new Date().toISOString().slice(0, 10)}`}
      filters={filters}
      summary={`of ${products.length}`}
    />
  );
};

export default ProductExportDialog;
