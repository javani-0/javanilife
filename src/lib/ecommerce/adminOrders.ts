import { getDateValue } from "./customers";
import type { Order, OrderStatus, PaymentMethod, PaymentStatus } from "./types";

export type AdminOrderDateFilter = "all" | "today" | "7d" | "30d";

export interface AdminOrderFilters {
  search: string;
  status: "all" | OrderStatus;
  paymentMethod: "all" | PaymentMethod;
  paymentStatus: "all" | PaymentStatus;
  dateRange: AdminOrderDateFilter;
  specificDate: string; // "YYYY-MM-DD" – empty string means no specific-date filter
}

export const ADMIN_ORDER_STATUS_OPTIONS: OrderStatus[] = [
  "placed",
  "confirmed",
  "packed",
  "shipped",
  "out-for-delivery",
  "delivered",
  "cancelled",
  "returned",
];

export const ADMIN_PAYMENT_STATUS_OPTIONS: PaymentStatus[] = [
  "pending",
  "paid",
  "failed",
  "refunded",
  "cod-pending",
  "cod-collected",
];

const getSearchText = (order: Order) => [
  order.orderNumber,
  order.id,
  order.customerName,
  order.customerEmail,
  order.customerPhone,
  order.address?.city,
  order.address?.state,
  ...(order.items || []).map((item) => item.name),
].filter(Boolean).join(" ").toLowerCase();

const matchesDateRange = (order: Order, dateRange: AdminOrderDateFilter) => {
  if (dateRange === "all") return true;

  const orderDate = getDateValue(order.createdAt);
  if (!orderDate) return false;

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (dateRange === "today") return orderDate >= start;

  const days = dateRange === "7d" ? 7 : 30;
  start.setDate(start.getDate() - (days - 1));
  return orderDate >= start;
};

const matchesSpecificDate = (order: Order, specificDate: string): boolean => {
  if (!specificDate) return true;
  const orderDate = getDateValue(order.createdAt);
  if (!orderDate) return false;
  const y = orderDate.getFullYear();
  const m = String(orderDate.getMonth() + 1).padStart(2, "0");
  const d = String(orderDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}` === specificDate;
};

export const filterAdminOrders = (orders: Order[], filters: AdminOrderFilters) => {
  const search = filters.search.trim().toLowerCase();

  return orders.filter((order) => {
    const matchesSearch = !search || getSearchText(order).includes(search);
    const matchesStatus = filters.status === "all" || order.status === filters.status;
    const matchesPaymentMethod = filters.paymentMethod === "all" || order.payment?.method === filters.paymentMethod;
    const matchesPaymentStatus = filters.paymentStatus === "all" || order.payment?.status === filters.paymentStatus;

    return matchesSearch
      && matchesStatus
      && matchesPaymentMethod
      && matchesPaymentStatus
      && matchesDateRange(order, filters.dateRange)
      && matchesSpecificDate(order, filters.specificDate);
  });
};

export const getAdminOrderMetrics = (orders: Order[]) => ({
  total: orders.length,
  active: orders.filter((order) => !["delivered", "cancelled", "returned"].includes(order.status)).length,
  codPending: orders.filter((order) => order.payment?.status === "cod-pending").length,
  paid: orders.filter((order) => order.payment?.status === "paid" || order.payment?.status === "cod-collected").length,
});