import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminOrders from "@/pages/admin/AdminOrders";
import OrderDetail from "@/pages/account/OrderDetail";

type MockOrder = {
  id: string;
  data: Record<string, unknown>;
};

const firestoreState = vi.hoisted(() => ({
  orders: [] as MockOrder[],
  detail: { id: "", exists: true, data: {} as Record<string, unknown> },
}));

vi.mock("@/lib/firebase", () => ({
  db: {},
  default: {},
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { uid: "user-1", getIdToken: vi.fn().mockResolvedValue("test-token") },
    userProfile: { uid: "user-1", username: "Admin", email: "admin@example.com", role: "admin" },
    loading: false,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/account/AccountLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock("firebase/firestore", () => ({
  arrayUnion: (...items: unknown[]) => items,
  collection: (_db: unknown, path: string) => ({ kind: "collection", path }),
  deleteDoc: vi.fn(),
  doc: (_db: unknown, path: string, id?: string) => ({ kind: "doc", path: id ? `${path}/${id}` : path }),
  onSnapshot: (source: { kind: string }, onNext: (snapshot: unknown) => void) => {
    if (source.kind === "collection") {
      onNext({
        docs: firestoreState.orders.map((order) => ({
          id: order.id,
          data: () => order.data,
        })),
      });
    } else {
      onNext({
        exists: () => firestoreState.detail.exists,
        id: firestoreState.detail.id,
        data: () => firestoreState.detail.data,
      });
    }
    return vi.fn();
  },
  serverTimestamp: () => "server-timestamp",
  updateDoc: vi.fn(),
}));

const createOrder = (delivery: Record<string, unknown> = {}) => ({
  orderNumber: "JAV-20260509-TEST1",
  customerId: "user-1",
  customerName: "Javani Customer",
  customerEmail: "customer@example.com",
  customerPhone: "9876543210",
  status: "confirmed",
  payment: { method: "razorpay", status: "paid" },
  delivery: {
    chargeInPaise: 7000,
    provider: "delivery-one",
    syncStatus: "synced",
    shipmentWeightInGrams: 500,
    ...delivery,
  },
  address: {
    fullName: "Javani Customer",
    line1: "Temple Street",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500001",
  },
  items: [{ productId: "product-1", name: "Practice Saree", quantity: 1, lineTotalInPaise: 120000 }],
  totalInPaise: 127000,
});

describe("Delivery flow UI", () => {
  beforeEach(() => {
    firestoreState.orders = [];
    firestoreState.detail = { id: "order-1", exists: true, data: createOrder() };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows admin label and pickup controls only after an AWB exists", async () => {
    firestoreState.orders = [{
      id: "order-1",
      data: createOrder({
        lifecycleStatus: "ready-for-pickup",
        trackingNumber: "1234567890123",
        labelUrl: "https://example.com/label.pdf",
        labelPdfSize: "4R",
        pickupId: "PICKUP-1",
        pickupDate: "2026-05-10",
        pickupTime: "11:30:00",
        expectedPackageCount: 2,
      }),
    }];

    render(<AdminOrders />);

    expect(await screen.findByText("Manifest Order")).toBeInTheDocument();
    expect(screen.getByText("Refresh Tracking")).toBeInTheDocument();
    expect(screen.getByText("Delivery status")).toBeInTheDocument();
    expect(screen.getByText("Ready for Pickup")).toBeInTheDocument();
    expect(screen.getByText("Manifest status")).toBeInTheDocument();
    expect(screen.getByLabelText("Label size")).toBeInTheDocument();
    expect(screen.getByLabelText("Pickup date")).toBeInTheDocument();
    expect(screen.getByLabelText("Pickup warehouse")).toBeInTheDocument();
    expect(screen.getByText("Open saved shipping label")).toBeInTheDocument();
  });

  it("keeps the admin pre-manifest state simple", async () => {
    firestoreState.orders = [{
      id: "order-1",
      data: createOrder({ syncStatus: "manual-ready", lifecycleStatus: "pending" }),
    }];

    render(<AdminOrders />);

    expect(await screen.findByText("Manifest Order")).toBeInTheDocument();
    expect(screen.getByText("Manifest this order first. Label printing, pickup scheduling, and tracking unlock after the AWB is saved.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Label size")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pickup date")).not.toBeInTheDocument();
  });

  it("locks admin fulfillment controls for cancelled synced orders", async () => {
    firestoreState.orders = [{
      id: "order-1",
      data: {
        ...createOrder({
          lifecycleStatus: "cancelled",
          trackingNumber: "1234567890123",
          labelUrl: "https://example.com/label.pdf",
          pickupId: "PICKUP-1",
          pickupDate: "2026-05-10",
          providerStatus: "Cancellation requested",
          pickupCancellationStatus: "failed",
          pickupCancellationReason: "Pickup request PICKUP-1 cancellation failed.",
        }),
        status: "cancelled",
        cancellation: {
          status: "approved",
          reason: "Customer changed plans.",
          adminNote: "Approved by admin.",
        },
      },
    }];

    render(<AdminOrders />);

    expect(await screen.findByText("Label and pickup controls are locked because this order is Cancelled.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Manifest Order/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Print Label/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Pickup Booked/i })).toBeDisabled();
    expect(screen.queryByLabelText("Pickup date")).not.toBeInTheDocument();
    expect(screen.getByTestId("pickup-cancellation-warning")).toHaveTextContent("Retry it from this dashboard");
    expect(screen.getByRole("button", { name: /Cancel Pickup/i })).toBeInTheDocument();
    expect(screen.getByText("Open saved shipping label")).toBeInTheDocument();
  });

  it("shows customer tracking without internal sync wording", async () => {
    firestoreState.detail = {
      id: "order-1",
      exists: true,
      data: createOrder({
        lifecycleStatus: "out-for-delivery",
        trackingNumber: "1234567890123",
        trackingUrl: "https://www.delhivery.com/track/package/1234567890123",
        providerStatus: "Dispatched",
      }),
    };

    render(
      <MemoryRouter initialEntries={["/account/orders/order-1"]}>
        <Routes>
          <Route path="/account/orders/:id" element={<OrderDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Delivery Tracking")).toBeInTheDocument();
    expect(screen.getAllByText("Out for Delivery").length).toBeGreaterThan(0);
    expect(screen.getByText("Carrier")).toBeInTheDocument();
    expect(screen.getByText("Delhivery")).toBeInTheDocument();
    expect(screen.getByText("AWB number")).toBeInTheDocument();
    expect(screen.getByText("1234567890123")).toBeInTheDocument();
    expect(screen.queryByText("Sync status")).not.toBeInTheDocument();
  });
});