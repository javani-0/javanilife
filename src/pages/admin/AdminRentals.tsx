import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock, IndianRupee, MessageCircle,
  PackageCheck, Search, Truck, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAdminLog } from "@/hooks/useAdminLog";
import { confirmDialog } from "@/components/ConfirmDialogHost";
import DataExportDialog, { type ExportColumn } from "@/components/admin/DataExportDialog";
import { FileSpreadsheet } from "lucide-react";
import {
  RENTAL_STATUS_LABELS,
  cancelRentalBooking,
  computeRentalCharge,
  describeRentalCountdown,
  formatPaiseAsRupees,
  formatRentalMoment,
  isRentalOverdue,
  markRentalPickedUp,
  markRentalReturned,
  recordRentalOverdueNotice,
  rentalHourlyRateInPaise,
  setRentalExtraCollected,
  subscribeToRentals,
  type RentalBooking,
  type RentalStatus,
} from "@/lib/ecommerce";
import { buildRentalOverdueWhatsAppUrl, runRentalOverdueSweep } from "@/lib/ecommerce/rentalMessages";
import { useAuth } from "@/contexts/AuthContext";

// ---------------------------------------------------------------------------
// RENTAL DESK (req 3).
//
// One row per item that is out. The clock is the point of the screen: what is
// due today, what is already late, and exactly what that lateness has cost so
// far — recomputed every minute from the same pure function the customer's
// page, the cron and the return receipt use, so no two screens can disagree.
// ---------------------------------------------------------------------------

type Filter = "live" | "overdue" | "returned" | "all";

const STATUS_STYLES: Record<RentalStatus, string> = {
  booked: "bg-blue-100 text-blue-700",
  "picked-up": "bg-amber-100 text-amber-700",
  returned: "bg-green-100 text-green-700",
  cancelled: "bg-muted text-muted-foreground",
};

const AdminRentals = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const logAction = useAdminLog();

  const [rentals, setRentals] = useState<RentalBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("live");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  // Ticks once a minute so the overdue hours and charges stay honest without a
  // page refresh.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => subscribeToRentals(
    (items) => { setRentals(items); setLoading(false); },
    () => setLoading(false),
  ), []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  /** Every booking with its live charge attached. */
  const priced = useMemo(() => rentals.map((booking) => ({
    booking,
    charge: computeRentalCharge({
      pricePerDayInPaise: booking.pricePerDayInPaise,
      days: booking.days,
      quantity: booking.quantity,
      startAt: booking.startAt,
      dueAt: booking.dueAt,
      returnedAt: booking.returnedAt || null,
      now,
    }),
    overdue: isRentalOverdue(booking, now),
  })), [rentals, now]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return priced.filter(({ booking, overdue }) => {
      if (filter === "live" && !(booking.status === "booked" || booking.status === "picked-up")) return false;
      if (filter === "overdue" && !overdue) return false;
      if (filter === "returned" && booking.status !== "returned") return false;
      if (!needle) return true;
      return `${booking.productName} ${booking.customerName} ${booking.customerPhone} ${booking.orderNumber}`.toLowerCase().includes(needle);
    });
  }, [priced, filter, search]);

  const counts = useMemo(() => ({
    live: priced.filter(({ booking }) => booking.status === "booked" || booking.status === "picked-up").length,
    overdue: priced.filter(({ overdue }) => overdue).length,
    returned: priced.filter(({ booking }) => booking.status === "returned").length,
    all: priced.length,
  }), [priced]);

  const outstandingInPaise = useMemo(
    () => priced
      .filter(({ booking }) => !booking.extraChargeCollected)
      .reduce((sum, { booking, charge }) => sum + (booking.status === "returned" ? booking.extraChargeInPaise : charge.overdueChargeInPaise), 0),
    [priced],
  );

  /**
   * Run the overdue check now rather than waiting for the nightly job. The
   * server sends the messages; if WhatsApp is not configured it says so and the
   * per-row button still opens the same text in the admin's own WhatsApp.
   */
  const chaseOverdue = async () => {
    if (!user) return;
    setSweeping(true);
    try {
      const idToken = await user.getIdToken();
      const result = await runRentalOverdueSweep(idToken);
      toast({
        title: result.notified > 0 ? `${result.notified} customer${result.notified === 1 ? "" : "s"} messaged` : "Nothing to send",
        description: result.whatsappConfigured
          ? result.message
          : `${result.overdue} overdue. WhatsApp is not configured on the server — use the WhatsApp button on each row.`,
        variant: result.whatsappConfigured ? undefined : "destructive",
      });
      logAction("Ran rental overdue check", `${result.overdue} overdue · ${result.notified} messaged`);
    } catch (error) {
      toast({
        title: "Could not run the check",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSweeping(false);
    }
  };

  const handlePickup = async (booking: RentalBooking) => {
    if (!(await confirmDialog({
      title: `Hand over ${booking.productName}?`,
      description: `The ${booking.days}-day clock starts now, so it is due back ${formatRentalMoment(new Date(Date.now() + booking.days * 86_400_000))}.`,
      confirmText: "Mark as collected",
    }))) return;
    setBusyId(booking.id);
    try {
      await markRentalPickedUp(booking);
      toast({ title: "Marked as collected", description: `${booking.productName} is now with ${booking.customerName}.` });
      logAction("Rental collected", `${booking.productName} · ${booking.customerName}`);
    } catch (error) {
      toast({ title: "Could not update", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleReturn = async (booking: RentalBooking, liveExtraInPaise: number) => {
    if (!(await confirmDialog({
      title: `Take ${booking.productName} back?`,
      description: liveExtraInPaise > 0
        ? `It is late, so ${formatPaiseAsRupees(liveExtraInPaise)} of extra time is owed. That amount is frozen the moment you confirm.`
        : "It is back within its time, so there is nothing extra to pay.",
      confirmText: "Mark as returned",
    }))) return;
    setBusyId(booking.id);
    try {
      const result = await markRentalReturned(booking);
      toast({
        title: "Marked as returned",
        description: result.extraChargeInPaise > 0
          ? `${result.overdueHours} late hour${result.overdueHours === 1 ? "" : "s"} · ${formatPaiseAsRupees(result.extraChargeInPaise)} to collect.`
          : "Back on time — nothing extra to collect.",
      });
      logAction("Rental returned", `${booking.productName} · ${booking.customerName} · extra ${formatPaiseAsRupees(result.extraChargeInPaise)}`);
    } catch (error) {
      toast({ title: "Could not update", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (booking: RentalBooking) => {
    const ok = await confirmDialog({
      title: `Cancel this booking?`,
      description: `${booking.productName} for ${booking.customerName}. The order itself is not touched — refund it from Orders Manager if money was taken.`,
      confirmText: "Cancel booking",
      destructive: true,
    });
    if (!ok) return;
    setBusyId(booking.id);
    try {
      await cancelRentalBooking(booking.id, "Cancelled by staff");
      toast({ title: "Booking cancelled" });
      logAction("Rental cancelled", `${booking.productName} · ${booking.customerName}`);
    } catch (error) {
      toast({ title: "Could not cancel", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  /** Manual nudge — the same message the overdue job sends, from your phone. */
  const messageCustomer = (booking: RentalBooking, overdueHours: number, extraInPaise: number) => {
    window.open(buildRentalOverdueWhatsAppUrl(booking, { overdueHours, extraChargeInPaise: extraInPaise }), "_blank", "noopener");
    void recordRentalOverdueNotice(booking.id, overdueHours);
  };

  const exportColumns: ExportColumn<{ booking: RentalBooking; charge: ReturnType<typeof computeRentalCharge> }>[] = [
    { key: "item", label: "Item", width: 30, value: (row) => row.booking.productName },
    { key: "customer", label: "Customer", width: 24, value: (row) => row.booking.customerName },
    { key: "phone", label: "Phone", width: 16, value: (row) => row.booking.customerPhone },
    { key: "order", label: "Order", width: 16, value: (row) => row.booking.orderNumber || "—" },
    { key: "qty", label: "Pieces", width: 10, value: (row) => row.booking.quantity },
    { key: "days", label: "Days", width: 10, value: (row) => row.booking.days },
    { key: "perDay", label: "Per 24h (₹)", width: 14, money: true, value: (row) => row.booking.pricePerDayInPaise / 100 },
    { key: "base", label: "Rental (₹)", width: 14, money: true, value: (row) => row.booking.baseInPaise / 100 },
    { key: "start", label: "Out from", width: 22, value: (row) => formatRentalMoment(row.booking.startAt) },
    { key: "due", label: "Due back", width: 22, value: (row) => formatRentalMoment(row.booking.dueAt) },
    { key: "returned", label: "Returned", width: 22, value: (row) => (row.booking.returnedAt ? formatRentalMoment(row.booking.returnedAt) : "—") },
    { key: "lateHours", label: "Late hours", width: 12, value: (row) => (row.booking.status === "returned" ? row.booking.overdueHours : row.charge.overdueHours) },
    { key: "extra", label: "Late charge (₹)", width: 16, money: true, value: (row) => (row.booking.status === "returned" ? row.booking.extraChargeInPaise : row.charge.overdueChargeInPaise) / 100 },
    { key: "collected", label: "Late charge paid", width: 16, value: (row) => (row.booking.extraChargeCollected ? "Yes" : "No") },
    { key: "fulfilment", label: "Pickup / delivery", width: 16, value: (row) => (row.booking.fulfilment === "pickup" ? "Store pickup" : "Delivery") },
    { key: "status", label: "Status", width: 14, value: (row) => RENTAL_STATUS_LABELS[row.booking.status] },
  ];

  const chip = (active: boolean) =>
    `rounded-md border px-4 py-2 font-body text-sm font-semibold transition-colors ${active ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`;

  return (
    <div className="space-y-6">
      <DataExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export rentals"
        description="Everything currently listed, with the live late charges."
        rows={visible}
        columns={exportColumns}
        sheetName="Rentals"
        defaultFilename={`javani-rentals-${new Date().toISOString().slice(0, 10)}`}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">VASTRA</p>
          <h1 className="mt-2 flex items-center gap-2 font-display text-3xl text-foreground">
            <CalendarClock className="h-7 w-7 text-gold" /> Rental Desk
          </h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            What is out, when it is due back, and what the late hours have cost. Rentals are booked by customers from the product page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={chaseOverdue}
            disabled={sweeping || counts.overdue === 0}
            title={counts.overdue === 0 ? "Nothing is overdue" : "Send the overdue message to every late customer"}
            className="flex min-h-10 items-center gap-2 rounded-md border border-red-400 px-4 font-body text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <MessageCircle className="h-4 w-4" /> {sweeping ? "Sending…" : `Chase ${counts.overdue} overdue`}
          </button>
          <button
            onClick={() => setExportOpen(true)}
            className="flex min-h-10 items-center gap-2 rounded-md border border-gold/40 px-4 font-body text-sm font-semibold text-gold hover:bg-gold/10"
          >
            <FileSpreadsheet className="h-4 w-4" /> Export Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "Out now", value: counts.live, Icon: PackageCheck, accent: "text-blue-600" },
          { label: "Overdue", value: counts.overdue, Icon: AlertTriangle, accent: counts.overdue > 0 ? "text-red-600" : "text-muted-foreground" },
          { label: "Returned", value: counts.returned, Icon: CheckCircle2, accent: "text-green-600" },
          { label: "Late fees to collect", value: formatPaiseAsRupees(outstandingInPaise), Icon: IndianRupee, accent: "text-gold" },
        ].map(({ label, value, Icon, accent }) => (
          <div key={label} className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
            <div className="flex items-center justify-between">
              <p className="font-body text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
              <Icon className={`h-4 w-4 ${accent}`} />
            </div>
            <p className={`mt-1 font-display text-2xl font-bold ${accent}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {([["live", "Out now"], ["overdue", "Overdue"], ["returned", "Returned"], ["all", "All"]] as [Filter, string][]).map(([value, label]) => (
            <button key={value} onClick={() => setFilter(value)} className={chip(filter === value)}>
              {label} <span className="opacity-70">{counts[value]}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-0 sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            size={1}
            placeholder="Item, customer, phone or order…"
            className="h-10 w-full min-w-0 rounded-md border border-border bg-background pl-9 pr-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
          />
        </div>
      </div>

      {loading ? (
        <p className="py-12 text-center font-body text-sm text-muted-foreground">Loading rentals…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <CalendarClock className="mx-auto mb-3 h-6 w-6 text-gold" />
          <p className="font-display text-xl text-foreground">Nothing here</p>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            {filter === "overdue" ? "Nothing is overdue — good." : "Rentals booked from a product page show up here."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(({ booking, charge, overdue }) => {
            const isOut = booking.status === "booked" || booking.status === "picked-up";
            const extraInPaise = booking.status === "returned" ? booking.extraChargeInPaise : charge.overdueChargeInPaise;
            const lateHours = booking.status === "returned" ? booking.overdueHours : charge.overdueHours;
            return (
              <div
                key={booking.id}
                className={`rounded-xl border p-4 shadow-card ${overdue ? "border-red-300 bg-red-50" : "border-border/60 bg-card"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    {booking.image && (
                      <img src={booking.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                    )}
                    <div className="min-w-0">
                      <p className="font-body text-sm font-semibold text-foreground">
                        {booking.productName}
                        {booking.quantity > 1 && <span className="ml-1 text-muted-foreground">× {booking.quantity}</span>}
                        <span className={`ml-2 rounded-full px-2 py-0.5 font-body text-[0.65rem] font-semibold ${STATUS_STYLES[booking.status]}`}>
                          {RENTAL_STATUS_LABELS[booking.status]}
                        </span>
                        <span className="ml-2 inline-flex items-center gap-1 font-body text-[0.68rem] text-muted-foreground">
                          {booking.fulfilment === "pickup" ? <><PackageCheck className="h-3 w-3" /> Store pickup</> : <><Truck className="h-3 w-3" /> Delivery</>}
                        </span>
                      </p>
                      <p className="font-body text-xs text-muted-foreground">
                        {booking.customerName} · {booking.customerPhone}
                        {booking.orderNumber ? ` · ${booking.orderNumber}` : ""}
                      </p>
                      <p className="mt-1 font-body text-xs text-muted-foreground">
                        Out {formatRentalMoment(booking.startAt)} · due {formatRentalMoment(booking.dueAt)}
                        {booking.returnedAt ? ` · returned ${formatRentalMoment(booking.returnedAt)}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className={`font-display text-lg font-bold ${overdue ? "text-red-600" : "text-foreground"}`}>
                      {formatPaiseAsRupees(booking.baseInPaise + extraInPaise)}
                    </p>
                    <p className="font-body text-[0.7rem] text-muted-foreground">
                      {formatPaiseAsRupees(booking.baseInPaise)} rental
                      {extraInPaise > 0 && ` + ${formatPaiseAsRupees(extraInPaise)} late`}
                    </p>
                    {isOut && (
                      <p className={`font-body text-xs font-semibold ${overdue ? "text-red-600" : "text-muted-foreground"}`}>
                        {describeRentalCountdown(booking.dueAt, now)}
                      </p>
                    )}
                  </div>
                </div>

                {extraInPaise > 0 && (
                  <p className="mt-2 rounded-lg border border-red-200 bg-white/70 px-3 py-2 font-body text-xs text-red-800">
                    <Clock className="mr-1 inline h-3.5 w-3.5" />
                    {lateHours} hour{lateHours === 1 ? "" : "s"} past the return time at{" "}
                    {formatPaiseAsRupees(rentalHourlyRateInPaise(booking.pricePerDayInPaise))}/hour
                    {booking.quantity > 1 ? ` × ${booking.quantity} pieces` : ""} ={" "}
                    <span className="font-bold">{formatPaiseAsRupees(extraInPaise)}</span>
                    {booking.extraChargeCollected ? " · paid" : " · not yet collected"}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {booking.status === "booked" && (
                    <button
                      onClick={() => handlePickup(booking)}
                      disabled={busyId === booking.id}
                      className="flex min-h-9 items-center gap-1.5 rounded-md bg-gradient-primary px-3 font-body text-xs font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
                    >
                      <PackageCheck className="h-3.5 w-3.5" /> Mark collected
                    </button>
                  )}
                  {isOut && (
                    <button
                      onClick={() => handleReturn(booking, extraInPaise)}
                      disabled={busyId === booking.id}
                      className="flex min-h-9 items-center gap-1.5 rounded-md border border-green-500/50 px-3 font-body text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark returned
                    </button>
                  )}
                  {overdue && (
                    <button
                      onClick={() => messageCustomer(booking, lateHours, extraInPaise)}
                      className="flex min-h-9 items-center gap-1.5 rounded-md border border-gold/50 px-3 font-body text-xs font-semibold text-gold hover:bg-gold/10"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp customer
                    </button>
                  )}
                  {extraInPaise > 0 && booking.status === "returned" && (
                    <button
                      onClick={() => setRentalExtraCollected(booking.id, !booking.extraChargeCollected)}
                      className="flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 font-body text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      <IndianRupee className="h-3.5 w-3.5" />
                      {booking.extraChargeCollected ? "Mark late fee unpaid" : "Late fee collected"}
                    </button>
                  )}
                  {isOut && (
                    <button
                      onClick={() => handleCancel(booking)}
                      disabled={busyId === booking.id}
                      className="flex min-h-9 items-center gap-1.5 rounded-md border border-destructive/40 px-3 font-body text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                  )}
                  {booking.orderId && (
                    <Link
                      to={`/admin/orders/${booking.orderId}`}
                      className="flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 font-body text-xs font-semibold text-muted-foreground hover:bg-muted"
                    >
                      Open order
                    </Link>
                  )}
                </div>

                {booking.overdueNotifiedAt && (
                  <p className="mt-2 font-body text-[0.68rem] text-muted-foreground">
                    Customer was last messaged about {booking.notifiedOverdueHours || 0} overdue hour(s).
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminRentals;
