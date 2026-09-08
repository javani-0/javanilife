import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { useSearchParams } from "react-router-dom";
import { db } from "@/lib/firebase";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SectionLabel from "@/components/SectionLabel";
import SEO from "@/components/SEO";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/hooks/use-toast";
import {
  createCartItemFromRental,
  formatPaiseAsRupees,
  getProductDisplayPrice,
  isProductActive,
  isProductPurchasable,
  normalizeProduct,
  rentalBaseInPaise,
  rentalDueAt,
  rentalHourlyRateInPaise,
  formatRentalMoment,
  clampRentalDays,
  type Product,
} from "@/lib/ecommerce";
import { CalendarClock, Clock, Info, Minus, Plus, ShoppingBag, Sparkles } from "lucide-react";
import heroDancer1 from "@/assets/hero-dancer-1.jpg";

// ---------------------------------------------------------------------------
// VESTRA (req 2 + 4): the costume house, with its two halves side by side —
// BUY what you want to keep, RENT what you need for one performance.
//
// The rent side is the whole point: the admin has typed a single 24-hour price,
// so the customer picks when they need the piece and for how many days and sees
// the exact amount before it ever reaches the cart. Late time is priced here
// too, in the open, so nobody is surprised by it later (req 3).
// ---------------------------------------------------------------------------

type VestraTab = "buy" | "rent";

const pad = (value: number): string => String(value).padStart(2, "0");

/** "YYYY-MM-DDTHH:mm" for a datetime-local input, in the visitor's own time. */
const localInputValue = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

const tomorrowAtTen = (): string => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return localInputValue(date);
};

const RentCard = ({ product }: { product: Product }) => {
  const { addItem } = useCart();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [startAt, setStartAt] = useState(tomorrowAtTen);
  const [days, setDays] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);

  const rental = product.rental;
  const perDay = rental?.pricePerDayInPaise || 0;
  const maxDays = rental?.maxDays || 0;
  const units = rental?.units || 0;

  const startIso = useMemo(() => {
    const parsed = new Date(startAt);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
  }, [startAt]);

  const dueAt = useMemo(() => (startIso ? rentalDueAt(startIso, days) : ""), [startIso, days]);
  const totalInPaise = rentalBaseInPaise(perDay, days, quantity);
  const startsInThePast = Boolean(startIso) && new Date(startIso).getTime() < Date.now() - 60_000;

  const book = async () => {
    if (!startIso) { toast({ title: "Pick when you need it", variant: "destructive" }); return; }
    if (startsInThePast) { toast({ title: "Pick a date in the future", variant: "destructive" }); return; }
    setAdding(true);
    try {
      await addItem(createCartItemFromRental(product, { startAt: startIso, days, quantity }));
      toast({
        title: "Rental added to cart",
        description: `${product.name} · ${days} day${days === 1 ? "" : "s"} · back by ${formatRentalMoment(dueAt)}`,
      });
      setOpen(false);
    } catch (error) {
      toast({ title: "Could not add the rental", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const stepper = (value: number, setValue: (next: number) => void, min: number, max: number, label: string) => (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setValue(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground disabled:opacity-40"
        aria-label={`Fewer ${label}`}
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-10 text-center font-body text-sm font-semibold tabular-nums text-foreground">{value}</span>
      <button
        type="button"
        onClick={() => setValue(max > 0 ? Math.min(max, value + 1) : value + 1)}
        disabled={max > 0 && value >= max}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground disabled:opacity-40"
        aria-label={`More ${label}`}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="aspect-square w-full overflow-hidden bg-muted">
        {product.image
          ? <img src={product.image} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
          : <div className="flex h-full items-center justify-center font-body text-sm text-muted-foreground">No image</div>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="font-display text-lg leading-snug text-foreground">{product.name}</p>
        {product.shortDescription && (
          <p className="mt-1 line-clamp-2 font-body text-xs text-muted-foreground">{product.shortDescription}</p>
        )}

        <p className="mt-3 font-display text-xl font-bold text-gold">
          {formatPaiseAsRupees(perDay)} <span className="font-body text-xs font-medium text-muted-foreground">/ 24 hours</span>
        </p>
        <p className="font-body text-[0.7rem] text-muted-foreground">
          Extra time {formatPaiseAsRupees(rentalHourlyRateInPaise(perDay))} per hour
        </p>

        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110"
          >
            <CalendarClock className="h-4 w-4" /> Rent this
          </button>
        ) : (
          <div className="mt-4 space-y-3 rounded-xl border border-gold/30 bg-gold/5 p-3">
            <label className="block">
              <span className="mb-1 block font-body text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">From</span>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold"
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-body text-xs font-semibold text-foreground">Days</span>
              {stepper(days, (next) => setDays(clampRentalDays(next, maxDays)), 1, maxDays, "days")}
            </div>
            {units > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-body text-xs font-semibold text-foreground">Pieces</span>
                {stepper(quantity, setQuantity, 1, units, "pieces")}
              </div>
            )}

            <div className="rounded-lg border border-border/60 bg-background p-3">
              <div className="flex items-center justify-between font-body text-xs text-muted-foreground">
                <span>{days} × 24h{quantity > 1 ? ` × ${quantity}` : ""}</span>
                <span className="font-display text-lg font-bold text-foreground">{formatPaiseAsRupees(totalInPaise)}</span>
              </div>
              {dueAt && (
                <p className="mt-1 font-body text-[0.7rem] text-muted-foreground">
                  Back by <span className="font-semibold text-foreground">{formatRentalMoment(dueAt)}</span>
                </p>
              )}
            </div>

            {rental?.terms && (
              <p className="flex items-start gap-1.5 font-body text-[0.7rem] text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0 text-gold" /> {rental.terms}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-10 flex-1 rounded-md border border-border px-3 font-body text-sm font-semibold text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={book}
                disabled={adding || startsInThePast}
                className="min-h-10 flex-[2] rounded-md bg-gradient-primary px-3 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
              >
                {adding ? "Adding…" : `Add — ${formatPaiseAsRupees(totalInPaise)}`}
              </button>
            </div>
            {startsInThePast && <p className="font-body text-[0.7rem] text-destructive">Pick a date in the future.</p>}
          </div>
        )}
      </div>
    </div>
  );
};

const BuyCard = ({ product }: { product: Product }) => {
  const { addProduct } = useCart();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const purchasable = isProductPurchasable(product);

  const add = async () => {
    setAdding(true);
    try {
      await addProduct(product, 1);
      toast({ title: "Added to cart", description: product.name });
    } catch (error) {
      toast({ title: "Could not add to cart", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="aspect-square w-full overflow-hidden bg-muted">
        {product.image
          ? <img src={product.image} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
          : <div className="flex h-full items-center justify-center font-body text-sm text-muted-foreground">No image</div>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="font-display text-lg leading-snug text-foreground">{product.name}</p>
        {product.shortDescription && (
          <p className="mt-1 line-clamp-2 font-body text-xs text-muted-foreground">{product.shortDescription}</p>
        )}
        <p className="mt-3 font-display text-xl font-bold text-gold">{getProductDisplayPrice(product)}</p>
        {product.rental?.enabled && (
          <p className="font-body text-[0.7rem] text-muted-foreground">
            Also rentable at {formatPaiseAsRupees(product.rental.pricePerDayInPaise)} / 24h
          </p>
        )}
        <button
          type="button"
          onClick={add}
          disabled={adding || !purchasable}
          className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
        >
          <ShoppingBag className="h-4 w-4" /> {purchasable ? (adding ? "Adding…" : "Add to cart") : "Unavailable"}
        </button>
      </div>
    </div>
  );
};

const Vestra = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: VestraTab = searchParams.get("mode") === "rent" ? "rent" : "buy";

  useEffect(() => onSnapshot(
    collection(db, "products"),
    (snapshot) => {
      setProducts(snapshot.docs.map((productDoc) => normalizeProduct(productDoc.id, productDoc.data())));
      setLoading(false);
    },
    () => setLoading(false),
  ), []);

  const vestraProducts = useMemo(
    () => products.filter((product) => product.vestra && isProductActive(product)),
    [products],
  );
  const buyable = useMemo(
    () => vestraProducts.filter((product) => product.purchasable !== false),
    [vestraProducts],
  );
  const rentable = useMemo(
    () => vestraProducts.filter((product) => product.rental?.enabled && (product.rental.pricePerDayInPaise || 0) > 0),
    [vestraProducts],
  );

  const setTab = (next: VestraTab) => setSearchParams((current) => {
    const params = new URLSearchParams(current);
    if (next === "rent") params.set("mode", "rent"); else params.delete("mode");
    return params;
  }, { replace: true });

  const shown = tab === "rent" ? rentable : buyable;

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="VESTRA — Buy or Rent | Javani Spiritual Hub"
        description="VESTRA by Javani: costumes and accessories to buy outright, or to rent for a single performance with transparent 24-hour pricing."
      />
      <PageHero
        backgroundImages={[heroDancer1]}
        label="VESTRA"
        heading="Wear it once, or keep it"
        subtext="Costumes, jewellery and accessories — bought outright, or rented for exactly as long as you need them."
        breadcrumb={[{ label: "Home", path: "/" }, { label: "VESTRA" }]}
      />

      <section className="bg-background py-10 sm:py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col items-center">
            <SectionLabel text="VESTRA COLLECTION" className="mb-5" />
            {/* Buy | Rent — the two halves of VESTRA (req 4) */}
            <div className="inline-flex rounded-xl border border-border bg-card p-1 shadow-card">
              {([["buy", "Buy", ShoppingBag], ["rent", "Rent", Clock]] as const).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={`flex min-h-11 items-center gap-2 rounded-lg px-6 font-body text-sm font-semibold transition-colors ${tab === value ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className="h-4 w-4" /> {label}
                  <span className="font-body text-[0.7rem] opacity-70">
                    {value === "buy" ? buyable.length : rentable.length}
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-4 max-w-2xl text-center font-body text-sm text-muted-foreground">
              {tab === "rent"
                ? "Pick the day you need the piece and how long you'll keep it — the price is worked out before you add it to the cart. Extra time is charged by the hour."
                : "Pieces you can own. Everything ships or can be collected from the studio."}
            </p>
          </div>

          <div className="mt-8">
            {loading ? (
              <p className="py-16 text-center font-body text-sm text-muted-foreground">Loading VESTRA…</p>
            ) : shown.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                <Sparkles className="mx-auto mb-3 h-6 w-6 text-gold" />
                <p className="font-display text-xl text-foreground">
                  {tab === "rent" ? "Nothing available to rent yet" : "Nothing to buy here yet"}
                </p>
                <p className="mt-1 font-body text-sm text-muted-foreground">
                  {tab === "rent"
                    ? "Rental pieces appear here as soon as they are listed."
                    : "New VESTRA pieces are added regularly."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {shown.map((product) => (
                  tab === "rent"
                    ? <RentCard key={product.id} product={product} />
                    : <BuyCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Vestra;
