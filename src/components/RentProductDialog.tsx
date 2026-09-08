import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, Clock, Info, Loader2, Minus, Plus, X } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/hooks/use-toast";
import {
  clampRentalDays,
  createCartItemFromRental,
  formatPaiseAsRupees,
  formatRentalMoment,
  rentalBaseInPaise,
  rentalDaysBetween,
  rentalHourlyRateInPaise,
  type Product,
} from "@/lib/ecommerce";

// ---------------------------------------------------------------------------
// "Rent this" — the popup behind the button on the product page.
//
// The customer says FROM when and TO when, and how many pieces. Days are whole
// 24-hour blocks because that is what the price is quoted in: a piece kept from
// Friday evening to Sunday morning is two days, and the panel says so before
// anything reaches the cart. Extra time past the return moment is priced here
// too, in the open, so the late charge is never a surprise.
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const pad = (value: number): string => String(value).padStart(2, "0");

/** "YYYY-MM-DDTHH:mm" for a datetime-local input, in the visitor's own time. */
const toLocalInputValue = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

const defaultStart = (): Date => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return date;
};

interface RentProductDialogProps {
  open: boolean;
  onClose: () => void;
  product: Product;
  /** Pre-selected size from the product page, when the piece has sizes. */
  size?: string;
  /** Sizes to choose from — the dialog asks when the page has not. */
  sizes?: string[];
}

const RentProductDialog = ({ open, onClose, product, size, sizes = [] }: RentProductDialogProps) => {
  const { addItem, openCart } = useCart();
  const { toast } = useToast();

  const [startAt, setStartAt] = useState(() => toLocalInputValue(defaultStart()));
  const [endAt, setEndAt] = useState(() => toLocalInputValue(new Date(defaultStart().getTime() + MS_PER_DAY)));
  const [quantity, setQuantity] = useState(1);
  const [chosenSize, setChosenSize] = useState(size || "");
  const [adding, setAdding] = useState(false);

  useEffect(() => { setChosenSize(size || ""); }, [size, open]);

  const rental = product.rental;
  const perDay = rental?.pricePerDayInPaise || 0;
  const maxDays = rental?.maxDays || 0;
  const units = rental?.units || 0;

  const startIso = useMemo(() => {
    const parsed = new Date(startAt);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
  }, [startAt]);
  const endIso = useMemo(() => {
    const parsed = new Date(endAt);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
  }, [endAt]);

  const rawDays = startIso && endIso ? rentalDaysBetween(startIso, endIso) : 1;
  const days = clampRentalDays(rawDays, maxDays);
  const cappedByMax = maxDays > 0 && rawDays > maxDays;
  const totalInPaise = rentalBaseInPaise(perDay, days, quantity);
  // The billed return moment always follows the price: whole days from the
  // start. Showing anything else would promise time the customer has not paid for.
  const dueAt = startIso ? new Date(new Date(startIso).getTime() + days * MS_PER_DAY).toISOString() : "";
  const startsInThePast = Boolean(startIso) && new Date(startIso).getTime() < Date.now() - 60_000;
  const endsBeforeStart = Boolean(startIso && endIso) && new Date(endIso).getTime() <= new Date(startIso).getTime();
  const needsSize = sizes.length > 0 && !chosenSize;

  if (!open) return null;

  /** Moving the day count moves the TO date, which is what people expect. */
  const setDays = (next: number) => {
    if (!startIso) return;
    const wanted = clampRentalDays(next, maxDays);
    setEndAt(toLocalInputValue(new Date(new Date(startIso).getTime() + wanted * MS_PER_DAY)));
  };

  const book = async () => {
    if (!startIso) { toast({ title: "Pick when you need it", variant: "destructive" }); return; }
    if (startsInThePast) { toast({ title: "Pick a date in the future", variant: "destructive" }); return; }
    if (endsBeforeStart) { toast({ title: "The return date must be after the pick-up date", variant: "destructive" }); return; }
    if (needsSize) { toast({ title: "Choose a size first", variant: "destructive" }); return; }
    setAdding(true);
    try {
      await addItem(createCartItemFromRental(product, { startAt: startIso, days, quantity, size: chosenSize }));
      toast({
        title: "Rental added to cart",
        description: `${days} day${days === 1 ? "" : "s"} · back by ${formatRentalMoment(dueAt)}`,
      });
      onClose();
      openCart();
    } catch (error) {
      toast({ title: "Could not add the rental", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const inputClass = "h-11 w-full rounded-md border border-[#C4A882] bg-white px-3 font-body text-sm text-[#2A0D05] outline-none focus:border-[#8B1A1A]";

  return createPortal(
    <div className="fixed inset-0 z-[10045] flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-[#FDF6EC] shadow-hero"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Rent ${product.name}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#C4A882]/50 p-5">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-display text-xl text-[#2A0D05]">
              <CalendarClock className="h-5 w-5 text-[#8B1A1A]" /> Rent this piece
            </h3>
            <p className="mt-0.5 truncate font-body text-xs text-[#6B4C3B]">{product.name}</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded p-1.5 text-[#6B4C3B] hover:bg-[#EDD4BE]" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-lg border border-[#C4A882]/60 bg-white/70 p-3">
            <p className="font-display text-lg font-bold text-[#8B1A1A]">
              {formatPaiseAsRupees(perDay)} <span className="font-body text-xs font-medium text-[#6B4C3B]">for 24 hours</span>
            </p>
            <p className="font-body text-[0.72rem] text-[#6B4C3B]">
              <Clock className="mr-1 inline h-3 w-3" />
              Kept longer? {formatPaiseAsRupees(rentalHourlyRateInPaise(perDay))} for every extra hour.
            </p>
          </div>

          {sizes.length > 0 && (
            <div>
              <p className="mb-1.5 font-body text-xs font-semibold uppercase tracking-wider text-[#6B4C3B]">Size</p>
              <div className="flex flex-wrap gap-2">
                {sizes.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setChosenSize(option)}
                    className={`min-h-10 rounded-md border px-4 font-body text-sm font-semibold transition-colors ${chosenSize === option ? "border-[#8B1A1A] bg-[#8B1A1A] text-white" : "border-[#C4A882] bg-white text-[#6B4C3B] hover:border-[#8B1A1A]"}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-[#6B4C3B]">From</span>
              <input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-[#6B4C3B]">To</span>
              <input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} className={inputClass} />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-body text-sm font-semibold text-[#2A0D05]">Days</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDays(days - 1)}
                disabled={days <= 1}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-[#C4A882] text-[#6B4C3B] disabled:opacity-40"
                aria-label="Fewer days"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center font-body text-sm font-bold tabular-nums text-[#2A0D05]">{days}</span>
              <button
                type="button"
                onClick={() => setDays(days + 1)}
                disabled={maxDays > 0 && days >= maxDays}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-[#C4A882] text-[#6B4C3B] disabled:opacity-40"
                aria-label="More days"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-body text-sm font-semibold text-[#2A0D05]">Pieces</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                disabled={quantity <= 1}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-[#C4A882] text-[#6B4C3B] disabled:opacity-40"
                aria-label="Fewer pieces"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center font-body text-sm font-bold tabular-nums text-[#2A0D05]">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((value) => (units > 0 ? Math.min(units, value + 1) : value + 1))}
                disabled={units > 0 && quantity >= units}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-[#C4A882] text-[#6B4C3B] disabled:opacity-40"
                aria-label="More pieces"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          {units > 0 && (
            <p className="font-body text-[0.7rem] text-[#6B4C3B]">{units} piece{units === 1 ? "" : "s"} available to hire.</p>
          )}

          <div className="rounded-lg border border-[#8B1A1A]/25 bg-white p-3">
            <div className="flex items-center justify-between">
              <span className="font-body text-xs text-[#6B4C3B]">
                {days} day{days === 1 ? "" : "s"} × {formatPaiseAsRupees(perDay)}{quantity > 1 ? ` × ${quantity}` : ""}
              </span>
              <span className="font-display text-xl font-bold text-[#8B1A1A]">{formatPaiseAsRupees(totalInPaise)}</span>
            </div>
            {dueAt && (
              <p className="mt-1 font-body text-xs text-[#6B4C3B]">
                Return by <span className="font-semibold text-[#2A0D05]">{formatRentalMoment(dueAt)}</span>
              </p>
            )}
            {cappedByMax && (
              <p className="mt-1 font-body text-[0.7rem] text-[#8B1A1A]">
                This piece can be hired for at most {maxDays} day{maxDays === 1 ? "" : "s"}.
              </p>
            )}
          </div>

          {rental?.terms && (
            <p className="flex items-start gap-1.5 font-body text-[0.72rem] text-[#6B4C3B]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8B1A1A]" /> {rental.terms}
            </p>
          )}
          {startsInThePast && <p className="font-body text-xs font-semibold text-[#8B1A1A]">Pick a start in the future.</p>}
          {endsBeforeStart && <p className="font-body text-xs font-semibold text-[#8B1A1A]">The return must be after the pick-up.</p>}
        </div>

        <div className="shrink-0 border-t border-[#C4A882]/50 p-4">
          <button
            type="button"
            onClick={book}
            disabled={adding || startsInThePast || endsBeforeStart || needsSize}
            className="flex min-h-12 w-full items-center justify-center gap-2 font-display text-base font-semibold tracking-wide text-white shadow-lg transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #9B2020 0%, #7A1010 100%)" }}
          >
            {adding ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarClock className="h-5 w-5" />}
            {needsSize ? "Choose a size" : `Add rental — ${formatPaiseAsRupees(totalInPaise)}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default RentProductDialog;
