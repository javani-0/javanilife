import { describe, expect, it } from "vitest";
import {
  BUY_NOW_STORAGE_KEY,
  CART_STORAGE_KEY,
  calculateDeliveryEstimate,
  calculateCartTotals,
  createDeliveryOneShipmentPayload,
  createCartItemFromProduct,
  createOrderItemFromCartItem,
  createWishlistItemFromProduct,
  createRazorpayPrefill,
  createRazorpayReceipt,
  filterAdminOrders,
  formatPaiseAsRupees,
  getAdminOrderMetrics,
  isProductActive,
  isProductPurchasable,
  mergeCartItems,
  normalizeCustomerProfile,
  normalizeDeliveryProfile,
  normalizeProduct,
  normalizeWishlistItem,
  parsePriceToPaise,
  type Order,
  type Product,
} from "@/lib/ecommerce";

const product: Product = normalizeProduct("product-1", {
  name: "Kumkum Red Practice Saree",
  category: "clothing",
  categoryLabel: "Clothing",
  description: "Practice saree",
  price: "₹1,200/-",
  image: "https://example.com/saree.jpg",
});

describe("e-commerce pricing foundation", () => {
  it("parses current display price strings into paise", () => {
    expect(parsePriceToPaise("1200/-")).toBe(120000);
    expect(parsePriceToPaise("₹1,400/-")).toBe(140000);
    expect(parsePriceToPaise("₹1,299.50")).toBe(129950);
  });

  it("formats paise as Indian rupee currency", () => {
    expect(formatPaiseAsRupees(120000)).toBe("₹1,200");
    expect(formatPaiseAsRupees(129950)).toBe("₹1,299.50");
  });

  it("calculates cart totals from item snapshots", () => {
    const items = [createCartItemFromProduct(product, 2)];
    expect(calculateCartTotals(items, 5000)).toEqual({
      subtotalInPaise: 240000,
      deliveryChargeInPaise: 5000,
      discountInPaise: 0,
      totalInPaise: 245000,
      totalItems: 2,
    });
  });
});

describe("e-commerce delivery foundation", () => {
  it("calculates the default COD delivery slab from cart items", () => {
    const item = createCartItemFromProduct(product, 1);

    expect(calculateDeliveryEstimate([item], {})).toEqual({
      chargeInPaise: 7000,
      weightInGrams: 500,
      usesFallbackWeight: true,
      freeDeliveryItemCount: 0,
      billableItemCount: 1,
    });
  });

  it("uses product delivery profiles and free-delivery flags", () => {
    const item = createCartItemFromProduct(product, 2);

    expect(calculateDeliveryEstimate([item], {
      [item.productId]: { weightInGrams: 750 },
    })).toEqual({
      chargeInPaise: 14000,
      weightInGrams: 1500,
      usesFallbackWeight: false,
      freeDeliveryItemCount: 0,
      billableItemCount: 2,
    });

    expect(calculateDeliveryEstimate([item], {
      [item.productId]: { freeDeliveryEligible: true },
    })).toEqual({
      chargeInPaise: 0,
      weightInGrams: 0,
      usesFallbackWeight: false,
      freeDeliveryItemCount: 2,
      billableItemCount: 0,
    });
  });

  it("allows overriding the first 500 g slab charge from delivery settings", () => {
    const item = createCartItemFromProduct(product, 1);

    expect(calculateDeliveryEstimate([item], {}, { baseChargeInPaise: 9500 })).toEqual({
      chargeInPaise: 9500,
      weightInGrams: 500,
      usesFallbackWeight: true,
      freeDeliveryItemCount: 0,
      billableItemCount: 1,
    });
  });

  it("normalizes product delivery profiles for admin and checkout use", () => {
    expect(normalizeDeliveryProfile({
      weightInGrams: 850,
      lengthInCm: 18,
      widthInCm: -2,
      heightInCm: 4,
      freeDeliveryEligible: true,
    })).toEqual({
      weightInGrams: 850,
      lengthInCm: 18,
      widthInCm: undefined,
      heightInCm: 4,
      freeDeliveryEligible: true,
    });
  });

  it("builds a Delivery One manual-ready shipment payload from order snapshots", () => {
    const item = createCartItemFromProduct(product, 1);
    const orderItem = createOrderItemFromCartItem(item, { weightInGrams: 750, lengthInCm: 20 });

    const payload = createDeliveryOneShipmentPayload({
      orderDocumentId: "order-doc-1",
      orderNumber: "JAV-20260505-ABC12",
      customerName: "Javani Test",
      customerPhone: "9876543210",
      customerEmail: "test@example.com",
      address: {
        fullName: "Javani Test",
        phone: "9876543210",
        email: "test@example.com",
        line1: "Street",
        city: "Hyderabad",
        state: "Telangana",
        pincode: "500001",
      },
      items: [orderItem],
      payment: { method: "cod", status: "cod-pending" },
      delivery: {
        chargeInPaise: 10500,
        provider: "delivery-one",
        syncStatus: "manual-ready",
        shipmentWeightInGrams: 750,
        usesFallbackWeight: false,
      },
      totalInPaise: 130500,
    });

    expect(payload).toMatchObject({
      provider: "delivery-one",
      mode: "manual-ready",
      orderDocumentId: "order-doc-1",
      payment: { method: "cod", codAmountInPaise: 130500 },
      package: { weightInGrams: 750, deliveryChargeInPaise: 10500 },
      items: [{ productId: "product-1", shipmentWeightInGrams: 750, delivery: { weightInGrams: 750, lengthInCm: 20 } }],
    });
  });
});

describe("e-commerce product and cart foundation", () => {
  it("uses stable storage keys for guest cart and buy-now intent", () => {
    expect(CART_STORAGE_KEY).toBe("javani.cart.v1");
    expect(BUY_NOW_STORAGE_KEY).toBe("javani.buyNow.v1");
  });

  it("normalizes legacy product documents without breaking existing fields", () => {
    expect(product.amountInPaise).toBe(120000);
    expect(product.stockStatus).toBe("available");
    expect(product.active).toBe(true);
  });

  it("normalizes inventory fields for admin-managed products", () => {
    const inventoryProduct = normalizeProduct("inventory-product", {
      name: "Featured Practice Set",
      category: "accessories",
      amountInPaise: 185000,
      images: ["https://example.com/primary.jpg", "https://example.com/second.jpg"],
      stockQuantity: 2,
      stockStatus: "available",
      active: false,
      featured: true,
      sku: "JAV-SET-001",
    });

    expect(inventoryProduct.image).toBe("https://example.com/primary.jpg");
    expect(inventoryProduct.images).toHaveLength(2);
    expect(inventoryProduct.displayPrice).toBe("₹1,850/-");
    expect(inventoryProduct.stockQuantity).toBe(2);
    expect(inventoryProduct.featured).toBe(true);
    expect(inventoryProduct.sku).toBe("JAV-SET-001");
    expect(isProductActive(inventoryProduct)).toBe(false);
    expect(isProductPurchasable(inventoryProduct)).toBe(false);
  });

  it("blocks purchase for inactive or unavailable products", () => {
    expect(isProductPurchasable(product)).toBe(true);
    expect(isProductPurchasable({ ...product, stockStatus: "out-of-stock" })).toBe(false);
    expect(isProductPurchasable({ ...product, active: false })).toBe(false);
    expect(isProductPurchasable({ ...product, stockQuantity: 0 })).toBe(false);
  });

  it("merges duplicate cart items by product", () => {
    const first = createCartItemFromProduct(product, 1);
    const second = createCartItemFromProduct(product, 2);
    const merged = mergeCartItems([first], [second]);

    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(3);
  });

  it("creates order item snapshots that preserve purchase-time totals", () => {
    const item = createCartItemFromProduct(product, 3);
    const snapshot = createOrderItemFromCartItem(item);

    expect(snapshot.productId).toBe("product-1");
    expect(snapshot.quantity).toBe(3);
    expect(snapshot.lineTotalInPaise).toBe(360000);
  });
});

describe("e-commerce payment foundation", () => {
  it("creates Razorpay-safe receipt ids", () => {
    expect(createRazorpayReceipt("JAV-20260505-ABC12")).toBe("JAV-20260505-ABC12");
    const receipt = createRazorpayReceipt("JAV 2026/05/05 ABC12 with a very long suffix and extra numbers 1234567890");
    expect(receipt.length).toBeLessThanOrEqual(40);
    expect(receipt).not.toMatch(/[^a-zA-Z0-9_-]/);
  });

  it("builds Razorpay prefill data from checkout address", () => {
    expect(createRazorpayPrefill({
      fullName: "Javani Test",
      phone: "9876543210",
      email: "test@example.com",
      line1: "Street",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500001",
    }, "fallback@example.com")).toEqual({
      name: "Javani Test",
      email: "test@example.com",
      contact: "9876543210",
    });
  });
});

describe("customer account foundation", () => {
  it("normalizes explicit WhatsApp and call numbers with legacy phone fallback", () => {
    expect(normalizeCustomerProfile("customer-1", {
      username: "Anaya Rao",
      email: "anaya@example.com",
      phone: "9876543210",
    })).toMatchObject({
      phone: "9876543210",
      whatsappNumber: "9876543210",
      callNumber: "9876543210",
    });

    expect(normalizeCustomerProfile("customer-2", {
      username: "Maya Sen",
      email: "maya@example.com",
      phone: "9876500000",
      whatsappNumber: "919876500001",
      callNumber: "9876500002",
    })).toMatchObject({
      phone: "9876500000",
      whatsappNumber: "919876500001",
      callNumber: "9876500002",
    });
  });

  it("creates wishlist snapshots from products", () => {
    expect(createWishlistItemFromProduct(product)).toMatchObject({
      productId: "product-1",
      name: "Kumkum Red Practice Saree",
      categoryLabel: "Clothing",
      amountInPaise: 120000,
      displayPrice: "₹1,200/-",
    });
  });

  it("normalizes wishlist documents with a product id fallback", () => {
    expect(normalizeWishlistItem("fallback-id", { name: "Saved item" })).toMatchObject({
      productId: "fallback-id",
      name: "Saved item",
    });
  });
});

describe("admin order foundation", () => {
  const adminOrders = [
    {
      id: "order-1",
      orderNumber: "JAV-1",
      customerId: "customer-1",
      customerName: "Anaya Rao",
      customerEmail: "anaya@example.com",
      customerPhone: "9876543210",
      status: "placed",
      payment: { method: "cod", status: "cod-pending" },
      items: [],
      totalInPaise: 120000,
      createdAt: "2026-05-05T10:00:00.000Z",
    },
    {
      id: "order-2",
      orderNumber: "JAV-2",
      customerId: "customer-2",
      customerName: "Maya Sen",
      customerEmail: "maya@example.com",
      customerPhone: "9876500000",
      status: "delivered",
      payment: { method: "razorpay", status: "paid" },
      items: [],
      totalInPaise: 240000,
      createdAt: "2026-05-04T10:00:00.000Z",
    },
  ] as Order[];

  it("filters admin orders by search, status, and payment fields", () => {
    expect(filterAdminOrders(adminOrders, {
      search: "anaya",
      status: "placed",
      paymentMethod: "cod",
      paymentStatus: "cod-pending",
      dateRange: "all",
      specificDate: "",
    })).toHaveLength(1);
  });

  it("summarizes order management metrics", () => {
    expect(getAdminOrderMetrics(adminOrders)).toEqual({
      total: 2,
      active: 1,
      codPending: 1,
      paid: 1,
    });
  });
});

