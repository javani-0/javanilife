import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  createDeliveryOneCreateShipmentRequest,
  createDeliveryOneShipmentPayload,
  extractDeliveryOneProviderResult,
  isDeliveryOnePincodeServiceable,
} from "../../api/_lib/delivery-one";

const originalEnv = { ...process.env };

const order = {
  orderNumber: "JAV-20260507-ABC12",
  customerName: "Javani Test",
  customerPhone: "+91 98765 43210",
  customerEmail: "test@example.com",
  address: {
    fullName: "Javani Test",
    phone: "9876543210",
    line1: "Street 1",
    line2: "Near Temple",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500001",
  },
  payment: { method: "razorpay", status: "paid" },
  delivery: { shipmentWeightInGrams: 750, chargeInPaise: 10500 },
  items: [
    { productId: "product-1", name: "Practice Saree", quantity: 1, shipmentWeightInGrams: 750, delivery: { lengthInCm: 20, widthInCm: 15, heightInCm: 4 } },
    { productId: "product-2", name: "Sattvic Book", quantity: 2, shipmentWeightInGrams: 0 },
  ],
  status: "confirmed",
  totalInPaise: 147000,
};

describe("Delhivery Delivery One API mapping", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DELIVERY_ONE_PICKUP_LOCATION = "Javani Warehouse";
    process.env.DELIVERY_ONE_API_TOKEN = "token_test_123";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("builds a Delhivery CMU shipment payload from an order", () => {
    const payload = createDeliveryOneShipmentPayload("order-doc-1", order);

    expect(payload).toMatchObject({
      pickup_location: { name: "Javani Warehouse" },
      shipments: [
        {
          name: "Javani Test",
          order: "JAV-20260507-ABC12",
          phone: "9876543210",
          add: "Street 1, Near Temple",
          pin: "500001",
          city: "Hyderabad",
          state: "Telangana",
          country: "India",
          payment_mode: "Prepaid",
          cod_amount: "0",
          total_amount: "1470",
          products_desc: "Practice Saree x1, Sattvic Book x2",
          weight: "750",
          shipment_length: "20",
          shipment_width: "15",
          shipment_height: "4",
          shipping_mode: "Surface",
        },
      ],
    });
  });

  it("creates the Delhivery shipment request with Token auth and URL encoded data", () => {
    const payload = createDeliveryOneShipmentPayload("order-doc-1", order);
    const request = createDeliveryOneCreateShipmentRequest(payload);

    expect(request.url).toBe("https://track.delhivery.com/api/cmu/create.json");
    expect(request.init.method).toBe("POST");
    expect(request.init.headers).toMatchObject({
      Accept: "application/json",
      Authorization: "Token token_test_123",
      "Content-Type": "application/x-www-form-urlencoded",
    });

    const params = new URLSearchParams(String(request.init.body));
    expect(params.get("format")).toBe("json");
    expect(JSON.parse(params.get("data") || "{}")).toEqual(payload);
  });

  it("treats empty or embargoed pincode responses as not serviceable", () => {
    expect(isDeliveryOnePincodeServiceable({ delivery_codes: [] })).toBe(false);
    expect(isDeliveryOnePincodeServiceable({ delivery_codes: [{ postal_code: { remarks: "Embargo" } }] })).toBe(false);
    expect(isDeliveryOnePincodeServiceable({ delivery_codes: [{ postal_code: { remarks: "" } }] })).toBe(true);
  });

  it("extracts waybill tracking details from Delhivery create responses", () => {
    const result = extractDeliveryOneProviderResult({
      success: true,
      packages: [{ status: "Success", waybill: "1234567890123", refnum: "JAV-20260507-ABC12" }],
    });

    expect(result).toMatchObject({
      providerOrderId: "JAV-20260507-ABC12",
      trackingNumber: "1234567890123",
      providerStatus: "Success",
    });
    expect(result.trackingUrl).toContain("1234567890123");
  });
});
