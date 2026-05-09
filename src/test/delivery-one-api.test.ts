import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  createDeliveryOneCancelShipmentRequest,
  createDeliveryOneCreateShipmentRequest,
  createDeliveryOneLabelRequest,
  createDeliveryOnePickupRequest,
  createDeliveryOneTrackingRequest,
  createDeliveryOneShipmentPayload,
  extractDeliveryOneTrackingUpdate,
  extractDeliveryOneWebhookUpdate,
  extractDeliveryOneProviderResult,
  isDeliveryOnePincodeServiceable,
  mapDeliveryOneStatusToLifecycleStatus,
  mapDeliveryOneStatusToOrderStatus,
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

  it("creates a Delhivery cancellation request for a waybill", () => {
    const request = createDeliveryOneCancelShipmentRequest("1234567890123");

    expect(request.url).toBe("https://track.delhivery.com/api/p/edit");
    expect(request.init.method).toBe("POST");
    expect(request.init.headers).toMatchObject({
      Accept: "application/json",
      Authorization: "Token token_test_123",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(request.init.body)).toEqual({ waybill: "1234567890123", cancellation: "true" });
  });

  it("creates a Delhivery label request with the requested PDF size", () => {
    const request = createDeliveryOneLabelRequest("1234567890123", "4R");

    expect(request.url).toBe("https://track.delhivery.com/api/p/packing_slip?wbns=1234567890123&pdf=true&pdf_size=4R");
    expect(request.pdfSize).toBe("4R");
    expect(request.init.method).toBe("GET");
    expect(request.init.headers.Authorization).toBe("Token token_test_123");
  });

  it("creates a Delhivery pickup request from admin-selected inputs", () => {
    const request = createDeliveryOnePickupRequest("1234567890123", {
      pickupDate: "2026-05-10",
      pickupTime: "11:30",
      pickupLocation: "Javani Warehouse",
      expectedPackageCount: 3,
    });

    expect(request.url).toBe("https://track.delhivery.com/fm/request/new/");
    expect(request.pickupDate).toBe("2026-05-10");
    expect(request.pickupTime).toBe("11:30:00");
    expect(request.pickupLocation).toBe("Javani Warehouse");
    expect(request.expectedPackageCount).toBe(3);
    expect(JSON.parse(request.init.body || "{}")).toEqual({
      pickup_time: "11:30:00",
      pickup_date: "2026-05-10",
      expected_package_count: 3,
      pickup_location: "Javani Warehouse",
    });
  });

  it("creates a Delhivery tracking request and extracts the latest shipment update", () => {
    const request = createDeliveryOneTrackingRequest("1234567890123", "JAV-20260507-ABC12");

    expect(request.url).toBe("https://track.delhivery.com/api/v1/packages/json/?waybill=1234567890123&ref_ids=JAV-20260507-ABC12");
    expect(request.init.method).toBe("GET");
    expect(request.init.headers.Authorization).toBe("Token token_test_123");

    const update = extractDeliveryOneTrackingUpdate({
      ShipmentData: [
        {
          Shipment: {
            AWB: "1234567890123",
            ReferenceNo: "JAV-20260507-ABC12",
            Status: { Status: "Dispatched", StatusType: "UD" },
            Scans: [{ ScanDetail: { Scan: "Manifested" } }],
          },
        },
      ],
    });

    expect(update).toMatchObject({
      trackingNumber: "1234567890123",
      providerOrderId: "JAV-20260507-ABC12",
      providerStatus: "Dispatched",
      providerStatusType: "UD",
      orderStatus: "out-for-delivery",
    });
  });

  it("maps Delhivery statuses into local order statuses", () => {
    expect(mapDeliveryOneStatusToOrderStatus("Delivered", "DL")).toBe("delivered");
    expect(mapDeliveryOneStatusToOrderStatus("Dispatched", "UD")).toBe("out-for-delivery");
    expect(mapDeliveryOneStatusToOrderStatus("In Transit", "UD")).toBe("shipped");
    expect(mapDeliveryOneStatusToOrderStatus("RTO", "DL")).toBe("returned");
    expect(mapDeliveryOneStatusToOrderStatus("Canceled", "CN")).toBe("cancelled");
  });

  it("maps Delhivery statuses into required delivery lifecycle states", () => {
    expect(mapDeliveryOneStatusToLifecycleStatus("Manifested", "UD")).toBe("ready-to-ship");
    expect(mapDeliveryOneStatusToLifecycleStatus("Not Picked", "UD")).toBe("ready-for-pickup");
    expect(mapDeliveryOneStatusToLifecycleStatus("In Transit", "UD")).toBe("in-transit");
    expect(mapDeliveryOneStatusToLifecycleStatus("Dispatched", "UD")).toBe("out-for-delivery");
    expect(mapDeliveryOneStatusToLifecycleStatus("Delivered", "DL")).toBe("delivered");
    expect(mapDeliveryOneStatusToLifecycleStatus("RTO", "DL")).toBe("rto-returned");
    expect(mapDeliveryOneStatusToLifecycleStatus("In Transit", "RT")).toBe("rto-in-transit");
    expect(mapDeliveryOneStatusToLifecycleStatus("Lost", "UD")).toBe("lost");
    expect(mapDeliveryOneStatusToLifecycleStatus("NDR", "UD")).toBe("ndr");
    expect(mapDeliveryOneStatusToLifecycleStatus("Canceled", "CN")).toBe("cancelled");
  });

  it("extracts tracking data from Delhivery webhook payloads", () => {
    const update = extractDeliveryOneWebhookUpdate({
      waybill: "1234567890123",
      order: "JAV-20260507-ABC12",
      status: "Delivered",
      status_type: "DL",
      event_time: "2026-05-07T10:30:00+05:30",
    });

    expect(update).toMatchObject({
      trackingNumber: "1234567890123",
      providerOrderId: "JAV-20260507-ABC12",
      providerStatus: "Delivered",
      providerStatusType: "DL",
      orderStatus: "delivered",
      eventAt: "2026-05-07T10:30:00+05:30",
    });
  });
});
