import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Clock,
  CreditCard,
  Filter,
  PackageCheck,
  Search,
  Truck,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  ADMIN_ORDER_STATUS_OPTIONS,
  ADMIN_PAYMENT_STATUS_OPTIONS,
  filterAdminOrders,
  formatOrderPlacedDateTime,
  formatPaiseAsRupees,
  getAdminOrderMetrics,
  normalizeCustomerOrder,
  ORDER_STATUS_LABELS,
  sortOrdersNewestFirst,
  type AdminOrderDateFilter,
  type AdminOrderFilters,
  type Order,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/ecommerce";

// ─── Constants ───────────────────────────────────────────────────────────────

const emptyFilters: AdminOrderFilters = {
  search: "",
  status: "all",
  paymentMethod: "all",
  paymentStatus: "all",
  dateRange: "all",
  specificDate: "",
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cod: "COD",
  razorpay: "Razorpay",
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  "partially-paid": "Partially Paid",
  failed: "Failed",
  refunded: "Refunded",
  "cod-pending": "COD Pending",
  "cod-collected": "COD Collected",
};

const getStatusBadgeClass = (status: OrderStatus) => {
  switch (status) {
    case "delivered":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/25";
    case "cancelled":
      return "bg-destructive/10 text-destructive border-destructive/25";
    case "returned":
      return "bg-muted text-muted-foreground border-border";
    case "shipped":
    case "out-for-delivery":
      return "bg-blue-500/10 text-blue-700 border-blue-500/20";
    default:
      return "bg-gold/10 text-gold border-gold/25";
  }
};

// ─── Component ───────────────────────────────────────────────────────────────

const AdminOrders = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<AdminOrderFilters>(emptyFilters);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "orders"),
      (snapshot) => {
        const nextOrders = sortOrdersNewestFirst(
          snapshot.docs.map((d) => normalizeCustomerOrder(d.id, d.data())),
        );
        setOrders(nextOrders);
        setLoading(false);
      },
      (error) => {
        console.error("Unable to load admin orders", error);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, []);

  const filteredOrders = useMemo(
    () => filterAdminOrders(orders, filters),
    [filters, orders],
  );
  const metrics = useMemo(() => getAdminOrderMetrics(orders), [orders]);

  const updateFilter = <K extends keyof AdminOrderFilters>(
    key: K,
    value: AdminOrderFilters[K],
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">
          E-Commerce
        </p>
        <h1 className="mt-2 font-display text-3xl text-foreground">Order Management</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Review orders, update fulfilment, collect COD status, and add internal notes.
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "Total Orders", value: metrics.total, Icon: PackageCheck },
          { label: "Active Orders", value: metrics.active, Icon: Truck },
          { label: "COD Pending", value: metrics.codPending, Icon: Clock },
          { label: "Paid / Collected", value: metrics.paid, Icon: CreditCard },
        ].map(({ label, value, Icon }) => (
          <div
            key={label}
            className="rounded-xl border border-gold/15 bg-card p-4 shadow-card sm:p-5"
          >
            <Icon className="mb-3 h-5 w-5 text-gold" />
            <p className="font-display text-3xl text-foreground">{value}</p>
            <p className="font-body text-xs font-medium text-muted-foreground sm:text-sm">
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Filter className="h-4 w-4 text-gold" />
          <h2 className="font-display text-xl text-foreground">Filters</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr]">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
              className="h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
              placeholder="Search orders or customers"
            />
          </label>
          <select
            value={filters.status}
            onChange={(e) =>
              updateFilter("status", e.target.value as AdminOrderFilters["status"])
            }
            className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold"
          >
            <option value="all">All statuses</option>
            {ADMIN_ORDER_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            value={filters.paymentMethod}
            onChange={(e) =>
              updateFilter("paymentMethod", e.target.value as "all" | PaymentMethod)
            }
            className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold"
          >
            <option value="all">All methods</option>
            <option value="cod">COD</option>
            <option value="razorpay">Razorpay</option>
          </select>
          <select
            value={filters.paymentStatus}
            onChange={(e) =>
              updateFilter("paymentStatus", e.target.value as "all" | PaymentStatus)
            }
            className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold"
          >
            <option value="all">All payments</option>
            {ADMIN_PAYMENT_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {paymentStatusLabels[s]}
              </option>
            ))}
          </select>
          <select
            value={filters.dateRange}
            onChange={(e) =>
              updateFilter("dateRange", e.target.value as AdminOrderDateFilter)
            }
            className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold"
          >
            <option value="all">All dates</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          <input
            type="date"
            value={filters.specificDate}
            onChange={(e) => updateFilter("specificDate", e.target.value)}
            className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
            title="Filter by exact date"
          />
        </div>
      </section>

      {/* Orders grid */}
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl text-foreground">Orders</h2>
          <span className="font-body text-sm text-muted-foreground">
            {filteredOrders.length} shown
          </span>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl border border-border/40 bg-card p-5 shadow-card"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="h-5 w-36 rounded-md bg-muted/60" />
                  <div className="h-6 w-16 rounded-full bg-muted/60" />
                </div>
                <div className="mb-4 h-4 w-28 rounded bg-muted/40" />
                <div className="h-4 w-40 rounded bg-muted/40" />
                <div className="mt-4 flex justify-between border-t border-border/40 pt-4">
                  <div className="h-4 w-28 rounded bg-muted/40" />
                  <div className="h-5 w-16 rounded bg-muted/60" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-2xl border border-gold/15 bg-card p-12 text-center shadow-card">
            <PackageCheck className="mx-auto mb-4 h-10 w-10 text-gold/40" />
            <p className="font-display text-xl text-foreground">No matching orders</p>
            <p className="mt-1 font-body text-sm text-muted-foreground">
              Try clearing filters or placing a test COD order.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => navigate(`/admin/orders/${order.id}`)}
                className="group w-full rounded-2xl border border-border/60 bg-card p-5 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
              >
                {/* Order number + status */}
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate font-display text-base font-semibold text-foreground transition-colors group-hover:text-gold">
                    {order.orderNumber || order.id}
                  </p>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 font-body text-xs font-semibold ${getStatusBadgeClass(order.status)}`}
                  >
                    {ORDER_STATUS_LABELS[order.status] || order.status}
                  </span>
                </div>

                {/* Cancel requested badge */}
                {order.cancellation?.status === "requested" && (
                  <div className="mt-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-destructive/25 bg-destructive/10 px-2.5 py-0.5 font-body text-xs font-semibold text-destructive">
                      <AlertTriangle className="h-3 w-3" /> Cancel requested
                    </span>
                  </div>
                )}

                {/* Customer name */}
                <p className="mt-2 font-body text-sm font-medium text-foreground">
                  {order.customerName}
                </p>

                {/* Date placed */}
                <div className="mt-1.5 flex items-center gap-1.5 font-body text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5 text-gold/70" />
                  {formatOrderPlacedDateTime(order)}
                </div>

                {/* Payment + amount */}
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/50 pt-3">
                  <span className="font-body text-xs text-muted-foreground">
                    {paymentMethodLabels[order.payment?.method] || order.payment?.method}
                    {" / "}
                    {paymentStatusLabels[order.payment?.status] || order.payment?.status}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-base font-semibold text-gold">
                      {formatPaiseAsRupees(order.totalInPaise || 0)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminOrders;
