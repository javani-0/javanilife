import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp } from "firebase/firestore";
import { ArrowLeft, CheckCircle2, CreditCard, LockKeyhole, MapPin, PackageCheck, ShieldCheck, Truck } from "lucide-react";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SEO from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import {
  calculateCartTotals,
  calculateDeliveryEstimate,
  createRazorpayOrder,
  createRazorpayPrefill,
  createOrderItemFromCartItem,
  DEFAULT_DELIVERY_PROVIDER,
  DELIVERY_SETTINGS_DOCUMENT_ID,
  formatPaiseAsRupees,
  createOrderPlacedNotificationPayloads,
  normalizeCustomerAddress,
  normalizeDeliveryProfile,
  normalizeDeliveryPricingSettings,
  openRazorpayCheckout,
  queueNotificationPayloads,
  verifyRazorpayPayment,
  type CheckoutAddress,
  type DeliveryPricingSettings,
  type DeliveryProfileMap,
  type Order,
  type PaymentMethod,
} from "@/lib/ecommerce";
import { useContactInfo } from "@/hooks/useContactInfo";
import heroTemple from "@/assets/hero-temple.jpg";

type FirestoreSafeValue =
  | string
  | number
  | boolean
  | null
  | FirestoreSafeValue[]
  | { [key: string]: FirestoreSafeValue };

const emptyAddress: CheckoutAddress = {
  fullName: "",
  phone: "",
  email: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
  landmark: "",
  notes: "",
};

const checkoutSteps = [
  { label: "Delivery", description: "Recipient details" },
  { label: "Payment", description: "COD or Razorpay" },
  { label: "Review", description: "Order summary" },
];

const createOrderNumber = () => {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `JAV-${datePart}-${randomPart}`;
};

const sanitizeDigits = (value: string) => value.replace(/\D/g, "");

const sanitizeForFirestore = (value: unknown): FirestoreSafeValue | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeForFirestore(item))
      .filter((item): item is FirestoreSafeValue => item !== undefined);
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, sanitizeForFirestore(item)] as const)
      .filter(([, item]) => item !== undefined);
    return Object.fromEntries(entries) as FirestoreSafeValue;
  }
  if (["string", "number", "boolean"].includes(typeof value)) {
    return value as FirestoreSafeValue;
  }
  return undefined;
};

const normalizeAddress = (address: CheckoutAddress): CheckoutAddress => {
  const normalized: CheckoutAddress = {
    fullName: address.fullName.trim(),
    phone: sanitizeDigits(address.phone),
    email: address.email?.trim() || "",
    line1: address.line1.trim(),
    city: address.city.trim(),
    state: address.state.trim(),
    pincode: sanitizeDigits(address.pincode),
  };

  if (address.line2?.trim()) normalized.line2 = address.line2.trim();
  if (address.landmark?.trim()) normalized.landmark = address.landmark.trim();
  if (address.notes?.trim()) normalized.notes = address.notes.trim();

  return normalized;
};

const validateAddress = (address: CheckoutAddress) => {
  if (!address.fullName.trim()) return "Please enter the recipient name.";
  if (sanitizeDigits(address.phone).length < 10) return "Please enter a valid phone number.";
  if (!address.email?.trim()) return "Please enter an email address.";
  if (!address.line1.trim()) return "Please enter the delivery address.";
  if (!address.city.trim()) return "Please enter the city.";
  if (!address.state.trim()) return "Please enter the state.";
  if (sanitizeDigits(address.pincode).length !== 6) return "Please enter a valid 6-digit pincode.";
  return null;
};

const addressSummary = (address: CheckoutAddress) => [
  address.line1,
  address.line2,
  address.city,
  address.state,
  address.pincode,
].filter(Boolean).join(", ");

const hasManualDeliveryInput = (address: CheckoutAddress, user?: { displayName?: string | null; email?: string | null }, userProfile?: { username?: string; email?: string }) => {
  const profileName = user?.displayName || userProfile?.username || "";
  const profileEmail = user?.email || userProfile?.email || "";

  return Boolean(
    address.phone.trim()
    || address.line1.trim()
    || address.line2?.trim()
    || address.city.trim()
    || address.state.trim()
    || address.pincode.trim()
    || address.landmark?.trim()
    || address.notes?.trim()
    || (address.fullName.trim() && address.fullName.trim() !== profileName)
    || (address.email?.trim() && address.email.trim() !== profileEmail)
  );
};

const Checkout = () => {
  const navigate = useNavigate();
  const { user, userProfile, loading: authLoading } = useAuth();
  const { items, loading: cartLoading, clearCart, clearBuyNowItem } = useCart();
  const { toast } = useToast();
  const { whatsappNumber, orderNotificationPhone } = useContactInfo();
  const [address, setAddress] = useState<CheckoutAddress>(emptyAddress);
  const [savedAddresses, setSavedAddresses] = useState<CheckoutAddress[]>([]);
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState<string>("custom");
  const [deliveryPricing, setDeliveryPricing] = useState<Required<DeliveryPricingSettings>>(normalizeDeliveryPricingSettings());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [deliveryProfiles, setDeliveryProfiles] = useState<DeliveryProfileMap>({});
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [savedAddressHydrated, setSavedAddressHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [placedOrder, setPlacedOrder] = useState<{ id: string; orderNumber: string; totalInPaise: number; paymentLabel: string } | null>(null);

  const applySavedAddress = (savedAddress?: CheckoutAddress | null) => {
    if (!savedAddress) {
      setSelectedSavedAddressId("custom");
      setAddress((currentAddress) => ({
        ...emptyAddress,
        fullName: currentAddress.fullName || user?.displayName || userProfile?.username || "",
        email: currentAddress.email || user?.email || userProfile?.email || "",
      }));
      return;
    }

    setSelectedSavedAddressId(savedAddress.id || "custom");
    setAddress((currentAddress) => ({
      ...currentAddress,
      fullName: savedAddress.fullName || user?.displayName || userProfile?.username || "",
      phone: savedAddress.phone || "",
      email: savedAddress.email || user?.email || userProfile?.email || "",
      line1: savedAddress.line1 || "",
      line2: savedAddress.line2 || "",
      city: savedAddress.city || "",
      state: savedAddress.state || "",
      pincode: savedAddress.pincode || "",
      landmark: savedAddress.landmark || "",
      notes: savedAddress.notes || "",
    }));
  };

  useEffect(() => {
    if (!user) return;
    setAddress((currentAddress) => ({
      ...currentAddress,
      fullName: currentAddress.fullName || user.displayName || userProfile?.username || "",
      email: currentAddress.email || user.email || userProfile?.email || "",
    }));
  }, [user, userProfile]);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setSavedAddressHydrated(false);
      return;
    }

    const loadSavedAddress = async () => {
      try {
        const snapshot = await getDocs(collection(db, "users", user.uid, "addresses"));
        if (cancelled) return;

        const savedAddresses = snapshot.docs
          .map((addressDoc) => normalizeCustomerAddress(addressDoc.id, addressDoc.data()))
          .sort((first, second) => Number(second.isDefault === true) - Number(first.isDefault === true));
        setSavedAddresses(savedAddresses);

        const preferredAddress = savedAddresses[0];
        if (!preferredAddress) {
          setSelectedSavedAddressId("custom");
          setSavedAddressHydrated(true);
          return;
        }

        setAddress((currentAddress) => {
          if (hasManualDeliveryInput(currentAddress, user, userProfile)) return currentAddress;

          return {
            ...currentAddress,
            fullName: preferredAddress.fullName || currentAddress.fullName,
            phone: preferredAddress.phone || currentAddress.phone,
            email: preferredAddress.email || currentAddress.email,
            line1: preferredAddress.line1 || currentAddress.line1,
            line2: preferredAddress.line2 || currentAddress.line2,
            city: preferredAddress.city || currentAddress.city,
            state: preferredAddress.state || currentAddress.state,
            pincode: preferredAddress.pincode || currentAddress.pincode,
            landmark: preferredAddress.landmark || currentAddress.landmark,
            notes: preferredAddress.notes || currentAddress.notes,
          };
        });
        setSelectedSavedAddressId(preferredAddress.id || "custom");
        setSavedAddressHydrated(true);
      } catch (error) {
        console.error("Unable to load saved checkout address", error);
        if (!cancelled) setSavedAddressHydrated(true);
      }
    };

    void loadSavedAddress();

    return () => {
      cancelled = true;
    };
  }, [user, userProfile]);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "siteSettings", DELIVERY_SETTINGS_DOCUMENT_ID), (snapshot) => {
      setDeliveryPricing(normalizeDeliveryPricingSettings(snapshot.exists() ? snapshot.data() as DeliveryPricingSettings : undefined));
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (items.length === 0) {
      setDeliveryProfiles({});
      setDeliveryLoading(false);
      return;
    }

    setDeliveryLoading(true);
    Promise.all(
      items.map(async (item) => {
        try {
          const productSnapshot = await getDoc(doc(db, "products", item.productId));
          const productData = productSnapshot.exists() ? productSnapshot.data() : null;
          return [item.productId, normalizeDeliveryProfile(productData?.delivery)] as const;
        } catch {
          return [item.productId, {}] as const;
        }
      })
    )
      .then((entries) => {
        if (!cancelled) setDeliveryProfiles(Object.fromEntries(entries));
      })
      .finally(() => {
        if (!cancelled) setDeliveryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [items]);

  const deliveryEstimate = useMemo(() => calculateDeliveryEstimate(items, deliveryProfiles, deliveryPricing), [deliveryPricing, deliveryProfiles, items]);
  const checkoutTotals = useMemo(
    () => calculateCartTotals(items, deliveryEstimate.chargeInPaise),
    [deliveryEstimate.chargeInPaise, items]
  );

  const updateAddress = (field: keyof CheckoutAddress) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (selectedSavedAddressId !== "custom") setSelectedSavedAddressId("custom");
    setAddress((currentAddress) => ({ ...currentAddress, [field]: event.target.value }));
  };

  const placeOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");

    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent("/checkout")}`);
      return;
    }

    if (items.length === 0) {
      setFormError("Your cart is empty. Add a product before checkout.");
      return;
    }

    const validationError = validateAddress(address);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const normalizedAddress = normalizeAddress(address);
    const orderNumber = createOrderNumber();
    const paymentLabel = paymentMethod === "razorpay" ? "Razorpay Online" : "Cash on Delivery";

    setSubmitting(true);
    try {
      const idToken = paymentMethod === "razorpay" ? await user.getIdToken() : "";
      const razorpayOrder = paymentMethod === "razorpay"
        ? await createRazorpayOrder({
          idToken,
          amountInPaise: checkoutTotals.totalInPaise,
          orderNumber,
          customerId: user.uid,
          customerName: normalizedAddress.fullName,
        })
        : null;
      const orderItems = items.map((item) => sanitizeForFirestore(createOrderItemFromCartItem(item, deliveryProfiles[item.productId])));

      const orderPayload = sanitizeForFirestore({
        orderNumber,
        customerId: user.uid,
        customerName: normalizedAddress.fullName,
        customerEmail: normalizedAddress.email || user.email || "",
        customerPhone: normalizedAddress.phone,
        items: orderItems,
        address: normalizedAddress,
        customerNotes: normalizedAddress.notes,
        payment: paymentMethod === "razorpay"
          ? {
            method: "razorpay",
            status: "pending",
            razorpayOrderId: razorpayOrder?.orderId,
            razorpaySignatureVerified: false,
          }
          : {
            method: "cod",
            status: "cod-pending",
          },
        delivery: {
          chargeInPaise: checkoutTotals.deliveryChargeInPaise,
          status: "placed",
          provider: DEFAULT_DELIVERY_PROVIDER,
          syncStatus: "manual-ready",
          shipmentWeightInGrams: deliveryEstimate.weightInGrams,
          usesFallbackWeight: deliveryEstimate.usesFallbackWeight,
        },
        status: "placed",
        subtotalInPaise: checkoutTotals.subtotalInPaise,
        deliveryChargeInPaise: checkoutTotals.deliveryChargeInPaise,
        discountInPaise: checkoutTotals.discountInPaise,
        totalInPaise: checkoutTotals.totalInPaise,
        timeline: [
          {
            status: "placed",
            label: "Order placed",
            note: paymentMethod === "razorpay" ? "Customer selected Razorpay online payment." : "Customer selected Cash on Delivery.",
            createdAt: new Date().toISOString(),
            createdBy: user.uid,
          },
        ],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const orderDocument = await addDoc(collection(db, "orders"), orderPayload as Record<string, unknown>);

      if (paymentMethod === "razorpay") {
        if (!razorpayOrder) throw new Error("Razorpay order was not created.");

        const razorpayResponse = await openRazorpayCheckout({
          key: razorpayOrder.keyId,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          name: "Javani Spiritual Hub",
          description: orderNumber,
          order_id: razorpayOrder.orderId,
          prefill: createRazorpayPrefill(normalizedAddress, user.email),
          notes: {
            orderNumber,
            orderDocumentId: orderDocument.id,
          },
          theme: { color: "#8B1A1A" },
        });

        const verification = await verifyRazorpayPayment({
          idToken,
          orderDocumentId: orderDocument.id,
          response: razorpayResponse,
        });

        if (!verification.verified) {
          throw new Error("Razorpay payment could not be verified.");
        }
      }

      try {
        const notificationOrder = {
          id: orderDocument.id,
          orderNumber,
          customerId: user.uid,
          customerName: normalizedAddress.fullName,
          customerEmail: normalizedAddress.email || user.email || "",
          customerPhone: normalizedAddress.phone,
          items: orderItems as Order["items"],
          address: normalizedAddress,
          payment: paymentMethod === "razorpay"
            ? { method: "razorpay", status: "paid", razorpayOrderId: razorpayOrder?.orderId, razorpaySignatureVerified: true }
            : { method: "cod", status: "cod-pending" },
          delivery: {
            chargeInPaise: checkoutTotals.deliveryChargeInPaise,
            status: "placed",
            provider: DEFAULT_DELIVERY_PROVIDER,
            syncStatus: "manual-ready",
            shipmentWeightInGrams: deliveryEstimate.weightInGrams,
            usesFallbackWeight: deliveryEstimate.usesFallbackWeight,
          },
          status: "placed",
          subtotalInPaise: checkoutTotals.subtotalInPaise,
          deliveryChargeInPaise: checkoutTotals.deliveryChargeInPaise,
          discountInPaise: checkoutTotals.discountInPaise,
          totalInPaise: checkoutTotals.totalInPaise,
          timeline: [],
        } as Order;

        const notificationPayloads = createOrderPlacedNotificationPayloads(notificationOrder, orderNotificationPhone || whatsappNumber);
        const notificationIdToken = idToken || await user.getIdToken();

        try {
          await queueNotificationPayloads(notificationIdToken, notificationPayloads);
        } catch (apiNotificationError) {
          console.error("Notification API was unavailable; falling back to Firestore queue", apiNotificationError);
          await Promise.all(notificationPayloads.map((notification) => addDoc(collection(db, "notifications"), {
            ...notification,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })));
        }
      } catch (notificationError) {
        console.error("Order was created but notifications could not be queued", notificationError);
      }

      try {
        await clearCart();
      } catch (clearCartError) {
        console.error("Order was created but the cart could not be cleared", clearCartError);
      }
      clearBuyNowItem();
      setPlacedOrder({ id: orderDocument.id, orderNumber, totalInPaise: checkoutTotals.totalInPaise, paymentLabel });
      toast({ title: paymentMethod === "razorpay" ? "Payment received" : "Order placed", description: `${orderNumber} has been created.` });
    } catch (error) {
      console.error("Unable to place order", error);
      const firebaseCode = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
      const message = firebaseCode === "permission-denied"
        ? "Order creation is blocked by Firestore permissions. Please deploy the latest Firestore rules and try again."
        : error instanceof Error && error.message
          ? error.message
          : "Unable to place the order right now. Please try again.";
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const showLoading = authLoading || cartLoading || (Boolean(user) && !savedAddressHydrated);

  if (placedOrder) {
    return (
      <div className="min-h-screen bg-background">
        <SEO title="Order Placed | Javani Spiritual Hub" description="Your Javani Spiritual Hub order has been placed." />
        <main className="mx-auto flex min-h-[80vh] max-w-3xl items-center px-4 py-16 sm:px-6">
          <section className="w-full rounded-2xl border border-gold/25 bg-card p-8 text-center shadow-card sm:p-12">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">Order confirmed</p>
            <h1 className="mt-3 font-display text-3xl text-foreground sm:text-4xl">Thank you for your order</h1>
            <p className="mx-auto mt-4 max-w-xl font-body text-muted-foreground">
              {placedOrder.paymentLabel === "Razorpay Online"
                ? "Your online payment was verified through Razorpay. Admin can now review it, confirm packing, and continue with Delivery One shipment handling."
                : "Your COD order has been placed. Admin can now review it, confirm packing, and continue with Delivery One shipment handling."}
            </p>
            <div className="mx-auto mt-8 max-w-md rounded-xl border border-border bg-background/70 p-5 text-left font-body text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Order number</span>
                <span className="font-semibold text-foreground">{placedOrder.orderNumber}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Payment</span>
                <span className="font-semibold text-foreground">{placedOrder.paymentLabel}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold text-gold">{formatPaiseAsRupees(placedOrder.totalInPaise)}</span>
              </div>
            </div>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/products" className="inline-flex items-center justify-center rounded-sm bg-gold px-6 py-3 font-display text-sm font-semibold tracking-[0.08em] text-charcoal transition-colors hover:bg-gold-light">
                Continue Shopping
              </Link>
              <Link to="/" className="inline-flex items-center justify-center rounded-sm border border-gold/50 px-6 py-3 font-display text-sm font-semibold tracking-[0.08em] text-gold transition-colors hover:bg-gold hover:text-white">
                Back Home
              </Link>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Checkout | Javani Spiritual Hub" description="Complete your Javani Spiritual Hub product order." />
      <PageHero
        backgroundImages={[heroTemple]}
        label="Checkout"
        heading="Complete Your Order"
        subtext="Confirm delivery details, choose payment, and place your product order."
        breadcrumb={[{ label: "Home", path: "/" }, { label: "Cart", path: "/cart" }, { label: "Checkout" }]}
        size="compact"
      />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <Link to="/cart" className="mb-6 inline-flex items-center gap-2 rounded-sm border border-gold/40 bg-card px-4 py-2 font-body text-sm font-semibold text-gold transition-colors hover:bg-gold hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to cart
        </Link>

        {showLoading ? (
          <div className="rounded-xl bg-card p-8 font-body text-muted-foreground shadow-card">Preparing checkout...</div>
        ) : !user ? (
          <section className="rounded-2xl border border-gold/20 bg-card p-8 text-center shadow-card sm:p-12">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gold/10 text-gold">
              <LockKeyhole className="h-8 w-8" />
            </div>
            <h2 className="font-display text-3xl text-foreground">Login required for checkout</h2>
            <p className="mx-auto mt-3 max-w-xl font-body text-muted-foreground">
              You can browse and add products as a guest, but checkout needs an account so your cart, order, and delivery details stay connected.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to={`/login?redirect=${encodeURIComponent("/checkout")}`} className="inline-flex items-center justify-center rounded-sm bg-gold px-7 py-3 font-display text-sm font-semibold tracking-[0.08em] text-charcoal transition-colors hover:bg-gold-light">
                Sign In To Checkout
              </Link>
              <Link to={`/signup?redirect=${encodeURIComponent("/checkout")}`} className="inline-flex items-center justify-center rounded-sm border border-gold/50 px-7 py-3 font-display text-sm font-semibold tracking-[0.08em] text-gold transition-colors hover:bg-gold hover:text-white">
                Create Account
              </Link>
            </div>
          </section>
        ) : items.length === 0 ? (
          <section className="rounded-2xl border border-border/60 bg-card p-8 text-center shadow-card sm:p-12">
            <PackageCheck className="mx-auto mb-5 h-14 w-14 text-gold" />
            <h2 className="font-display text-3xl text-foreground">Your cart is empty</h2>
            <p className="mx-auto mt-3 max-w-xl font-body text-muted-foreground">Add a product before checkout.</p>
            <Link to="/products" className="mt-8 inline-flex items-center justify-center rounded-sm bg-gold px-7 py-3 font-display text-sm font-semibold tracking-[0.08em] text-charcoal transition-colors hover:bg-gold-light">
              Browse Products
            </Link>
          </section>
        ) : (
          <form onSubmit={placeOrder} className="space-y-8">
            <ol className="grid gap-3 rounded-2xl border border-gold/20 bg-card p-4 shadow-card sm:grid-cols-3 sm:p-5">
              {checkoutSteps.map((step, index) => (
                <li key={step.label} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold font-body text-sm font-bold text-charcoal">
                    {index + 1}
                  </span>
                  <span>
                    <span className="block font-display text-base text-foreground">{step.label}</span>
                    <span className="block font-body text-xs text-muted-foreground">{step.description}</span>
                  </span>
                </li>
              ))}
            </ol>

            <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
            <section className="space-y-6">
              <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/10 text-gold">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-2xl text-foreground">Delivery Details</h2>
                    <p className="font-body text-sm text-muted-foreground">Used for Delivery One shipment coordination.</p>
                  </div>
                </div>

                {savedAddresses.length > 0 && (
                  <div className="mb-5 space-y-3 rounded-xl border border-gold/20 bg-background/70 p-4">
                    <div>
                      <p className="font-body text-sm font-semibold text-foreground">Choose saved address</p>
                      <p className="font-body text-xs text-muted-foreground">Select a saved address or switch to a custom one for this order.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {savedAddresses.map((savedAddress) => {
                        const isSelected = selectedSavedAddressId === savedAddress.id;

                        return (
                          <button
                            key={savedAddress.id}
                            type="button"
                            onClick={() => applySavedAddress(savedAddress)}
                            className={`rounded-xl border p-3 text-left transition-colors ${isSelected ? "border-gold bg-gold/10" : "border-border bg-card hover:border-gold/40"}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-body text-sm font-semibold text-foreground">{savedAddress.fullName}</p>
                              {savedAddress.isDefault && <span className="rounded-full bg-gold/10 px-2 py-0.5 font-body text-[0.65rem] font-semibold text-gold">Default</span>}
                            </div>
                            <p className="mt-1 font-body text-xs text-muted-foreground">{savedAddress.phone}</p>
                            <p className="mt-2 font-body text-xs leading-relaxed text-muted-foreground">{addressSummary(savedAddress)}</p>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => applySavedAddress(null)}
                        className={`rounded-xl border p-3 text-left transition-colors ${selectedSavedAddressId === "custom" ? "border-gold bg-gold/10" : "border-border bg-card hover:border-gold/40"}`}
                      >
                        <p className="font-body text-sm font-semibold text-foreground">Use a different address</p>
                        <p className="mt-2 font-body text-xs leading-relaxed text-muted-foreground">Fill the form manually for a one-time delivery address.</p>
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="font-body text-sm font-semibold text-foreground">
                    Full name
                    <input value={address.fullName} onChange={updateAddress("fullName")} className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="Recipient name" />
                  </label>
                  <label className="font-body text-sm font-semibold text-foreground">
                    Phone
                    <input value={address.phone} onChange={updateAddress("phone")} className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="10-digit mobile number" inputMode="tel" />
                  </label>
                  <label className="font-body text-sm font-semibold text-foreground sm:col-span-2">
                    Email
                    <input value={address.email || ""} onChange={updateAddress("email")} className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="you@example.com" type="email" />
                  </label>
                  <label className="font-body text-sm font-semibold text-foreground sm:col-span-2">
                    Address line 1
                    <input value={address.line1} onChange={updateAddress("line1")} className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="House / flat / street" />
                  </label>
                  <label className="font-body text-sm font-semibold text-foreground sm:col-span-2">
                    Address line 2
                    <input value={address.line2 || ""} onChange={updateAddress("line2")} className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="Area / locality" />
                  </label>
                  <label className="font-body text-sm font-semibold text-foreground">
                    City
                    <input value={address.city} onChange={updateAddress("city")} className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="City" />
                  </label>
                  <label className="font-body text-sm font-semibold text-foreground">
                    State
                    <input value={address.state} onChange={updateAddress("state")} className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="State" />
                  </label>
                  <label className="font-body text-sm font-semibold text-foreground">
                    Pincode
                    <input value={address.pincode} onChange={updateAddress("pincode")} className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="6-digit pincode" inputMode="numeric" />
                  </label>
                  <label className="font-body text-sm font-semibold text-foreground">
                    Landmark
                    <input value={address.landmark || ""} onChange={updateAddress("landmark")} className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="Optional" />
                  </label>
                  <label className="font-body text-sm font-semibold text-foreground sm:col-span-2">
                    Delivery notes
                    <textarea value={address.notes || ""} onChange={updateAddress("notes")} rows={3} className="mt-2 w-full rounded-md border border-border bg-background px-3 py-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="Optional notes for delivery or admin follow-up" />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/10 text-gold">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-2xl text-foreground">Payment Method</h2>
                    <p className="font-body text-sm text-muted-foreground">Choose COD or pay now securely through Razorpay.</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={`cursor-pointer rounded-xl border p-4 transition-colors ${paymentMethod === "cod" ? "border-gold bg-gold/10" : "border-border bg-background/70 hover:border-gold/50"}`}>
                    <input type="radio" name="paymentMethod" value="cod" checked={paymentMethod === "cod"} onChange={() => setPaymentMethod("cod")} className="sr-only" />
                    <span className="font-body text-sm font-bold text-foreground">Cash on Delivery</span>
                    <span className="mt-2 block font-body text-xs leading-relaxed text-muted-foreground">Place the order now and collect payment at delivery.</span>
                  </label>
                  <label className={`cursor-pointer rounded-xl border p-4 transition-colors ${paymentMethod === "razorpay" ? "border-gold bg-gold/10" : "border-border bg-background/70 hover:border-gold/50"}`}>
                    <input type="radio" name="paymentMethod" value="razorpay" checked={paymentMethod === "razorpay"} onChange={() => setPaymentMethod("razorpay")} className="sr-only" />
                    <span className="font-body text-sm font-bold text-foreground">Razorpay Online</span>
                    <span className="mt-2 block font-body text-xs leading-relaxed text-muted-foreground">Pay now using Razorpay test or live credentials configured on the server.</span>
                  </label>
                </div>
              </div>
            </section>

            <aside className="h-fit rounded-2xl border border-border/60 bg-card p-5 shadow-card lg:sticky lg:top-28 sm:p-6">
              <h2 className="font-display text-2xl text-foreground">Order Summary</h2>
              <div className="mt-5 space-y-4">
                {items.map((item) => (
                  <div key={item.productId} className="grid grid-cols-[56px_1fr] gap-3">
                    <div className="h-14 w-14 overflow-hidden rounded-md bg-muted">
                      {item.image ? <img src={item.image} alt={item.name} className="h-full w-full object-cover" /> : <PackageCheck className="m-4 h-6 w-6 text-gold" />}
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-2 font-display text-sm font-semibold text-foreground">{item.name}</p>
                      <p className="mt-1 font-body text-xs text-muted-foreground">Qty {item.quantity}</p>
                      <p className="mt-1 font-body text-sm font-semibold text-gold">{formatPaiseAsRupees(item.amountInPaise * item.quantity)}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 space-y-3 border-t border-border pt-5 font-body text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-foreground">{formatPaiseAsRupees(checkoutTotals.subtotalInPaise)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Delivery</span>
                  <span className="font-medium text-foreground">{deliveryLoading ? "Calculating..." : formatPaiseAsRupees(checkoutTotals.deliveryChargeInPaise)}</span>
                </div>
                <div className="flex items-center justify-between gap-4 text-base">
                  <span className="font-semibold text-foreground">Total</span>
                  <span className="font-semibold text-gold">{formatPaiseAsRupees(checkoutTotals.totalInPaise)}</span>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-gold/20 bg-gold/10 p-3 font-body text-xs leading-relaxed text-foreground">
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <Truck className="h-4 w-4 text-gold" /> Delivery estimate
                </div>
                Charges are calculated from product weight. {deliveryEstimate.usesFallbackWeight ? "Some products are using the default 500 g fallback until admin saves exact shipment weight." : "All items have shipment weight snapshots for Delivery One."}
              </div>

              {paymentMethod === "razorpay" && (
                <div className="mt-4 rounded-xl border border-gold/20 bg-gold/10 p-3 font-body text-xs leading-relaxed text-foreground">
                  Razorpay Checkout will open after your order is saved. The order is marked paid only after server-side signature verification.
                </div>
              )}

              {formError && (
                <div className="mt-4 rounded-xl border border-destructive/25 bg-destructive/10 p-3 font-body text-sm text-destructive">
                  {formError}
                </div>
              )}

              <button type="submit" disabled={submitting || deliveryLoading} className="mt-5 flex w-full items-center justify-center gap-2 rounded-sm bg-gradient-primary px-5 py-3 font-display text-sm font-semibold tracking-[0.08em] text-primary-foreground shadow-[0_10px_24px_rgba(139,26,26,0.2)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100">
                <ShieldCheck className="h-4 w-4" /> {submitting ? (paymentMethod === "razorpay" ? "Processing Payment..." : "Placing Order...") : paymentMethod === "razorpay" ? "Pay Now" : "Place COD Order"}
              </button>
              <p className="mt-3 text-center font-body text-xs text-muted-foreground">Your order will be saved for admin order management.</p>
            </aside>
            </div>
          </form>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Checkout;