import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { ArrowLeft, BookOpen, CalendarDays, CheckCircle2, CreditCard, Eye, EyeOff, KeyRound, LockKeyhole, MapPin, MessageCircle, PackageCheck, Phone, ShieldCheck, TicketPercent, Truck, UserRound, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SEO from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/cart-context";
import { useCoupons } from "@/hooks/useCoupons";
import { useToast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase";
import {
  calculateCartTotals,
  calculateCouponDiscount,
  createCourseInstallmentPlan,
  calculateDeliveryEstimate,
  createRazorpayOrder,
  createRazorpayPrefill,
  createOrderItemFromCartItem,
  DEFAULT_DELIVERY_PROVIDER,
  DELIVERY_SETTINGS_DOCUMENT_ID,
  evaluateCouponEligibility,
  formatCouponBenefit,
  formatPaiseAsRupees,
  getCourseCheckoutPayNowAmount,
  getCourseInstallmentEligibility,
  getAllowedPaymentMethodsForCart,
  normalizeCustomerAddress,
  normalizeCouponCode,
  normalizeDeliveryProfile,
  normalizeDeliveryPricingSettings,
  openRazorpayCheckout,
  sendOrderAutomation,
  verifyRazorpayPayment,
  type CheckoutAddress,
  type CoursePaymentPlanOption,
  type DeliveryPricingSettings,
  type DeliveryProfileMap,
  type PaymentMethod,
} from "@/lib/ecommerce";
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
  { label: "Details", description: "Recipient details" },
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

const getAccountWhatsAppNumber = (profile?: { whatsappNumber?: string; phone?: string } | null) => (
  sanitizeDigits(profile?.whatsappNumber || profile?.phone || "")
);

const getAccountCallNumber = (profile: { callNumber?: string; phone?: string } | null | undefined, fallback: string) => (
  sanitizeDigits(profile?.callNumber || profile?.phone || fallback)
);

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

const validateAddress = (address: CheckoutAddress, { requireShippingAddress = true } = {}) => {
  if (!address.fullName.trim()) return "Please enter the recipient name.";
  if (sanitizeDigits(address.phone).length < 10) return "Please enter a valid phone number.";
  if (!address.email?.trim()) return "Please enter an email address.";
  if (!requireShippingAddress) return null;
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
  const { redeemableCoupons, checkoutCoupons, loading: couponsLoading } = useCoupons();
  const { toast } = useToast();
  const [address, setAddress] = useState<CheckoutAddress>(emptyAddress);
  const [deliveryMethod, setDeliveryMethod] = useState<"shipping" | "store-pickup">("shipping");
  const [savedAddresses, setSavedAddresses] = useState<CheckoutAddress[]>([]);
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState<string>("custom");
  const [deliveryPricing, setDeliveryPricing] = useState<Required<DeliveryPricingSettings>>(normalizeDeliveryPricingSettings());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [deliveryProfiles, setDeliveryProfiles] = useState<DeliveryProfileMap>({});
  const [couponInput, setCouponInput] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState("");
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [savedAddressHydrated, setSavedAddressHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [accountWhatsAppDialogOpen, setAccountWhatsAppDialogOpen] = useState(false);
  const [coursePaymentPlan, setCoursePaymentPlan] = useState<CoursePaymentPlanOption>("full");
  const [placedOrder, setPlacedOrder] = useState<{ id: string; orderNumber: string; totalInPaise: number; paidNowInPaise: number; paymentLabel: string; hasShippableItems: boolean; paymentPlan: CoursePaymentPlanOption; deliveryMethod: "shipping" | "store-pickup" } | null>(null);

  // Inline signup / login for unauthenticated users
  const [inlineMode, setInlineMode] = useState<"signup" | "login">("signup");
  const [inlineName, setInlineName] = useState("");
  const [inlineEmail, setInlineEmail] = useState("");
  const [inlinePhone, setInlinePhone] = useState("");
  const [inlinePassword, setInlinePassword] = useState("");
  const [inlineShowPassword, setInlineShowPassword] = useState(false);
  const [inlineLoading, setInlineLoading] = useState(false);
  const [inlineError, setInlineError] = useState("");

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
      phone: currentAddress.phone || sanitizeDigits(userProfile?.whatsappNumber || userProfile?.phone || ""),
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
    const shippableItems = items.filter((item) => item.itemType !== "course");

    if (shippableItems.length === 0) {
      setDeliveryProfiles({});
      setDeliveryLoading(false);
      return;
    }

    setDeliveryLoading(true);
    Promise.all(
      shippableItems.map(async (item) => {
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

  const cartSubtotalInPaise = useMemo(() => calculateCartTotals(items).subtotalInPaise, [items]);
  const deliveryEstimate = useMemo(
    () => calculateDeliveryEstimate(items, deliveryProfiles, deliveryPricing, { subtotalInPaise: cartSubtotalInPaise }),
    [cartSubtotalInPaise, deliveryPricing, deliveryProfiles, items],
  );
  const couponContext = useMemo(() => ({
    items,
    subtotalInPaise: cartSubtotalInPaise,
    deliveryChargeInPaise: deliveryEstimate.chargeInPaise,
  }), [cartSubtotalInPaise, deliveryEstimate.chargeInPaise, items]);
  const selectedCoupon = useMemo(
    () => redeemableCoupons.find((coupon) => coupon.code === appliedCouponCode),
    [appliedCouponCode, redeemableCoupons],
  );
  const selectedCouponEligibility = useMemo(
    () => selectedCoupon ? evaluateCouponEligibility(selectedCoupon, couponContext) : null,
    [couponContext, selectedCoupon],
  );
  const appliedCoupon = useMemo(
    () => selectedCoupon && selectedCouponEligibility?.eligible ? calculateCouponDiscount(selectedCoupon, couponContext) : null,
    [couponContext, selectedCoupon, selectedCouponEligibility?.eligible],
  );
  const finalDeliveryChargeInPaise = deliveryMethod === "store-pickup" ? 0 : Math.max(0, deliveryEstimate.chargeInPaise - (appliedCoupon?.deliveryDiscountInPaise || 0));
  const checkoutTotals = useMemo(
    () => calculateCartTotals(items, finalDeliveryChargeInPaise, appliedCoupon?.discountInPaise || 0),
    [appliedCoupon?.discountInPaise, finalDeliveryChargeInPaise, items]
  );
  const couponOptions = useMemo(() => checkoutCoupons.map((coupon) => ({
    coupon,
    eligibility: evaluateCouponEligibility(coupon, couponContext),
    discount: calculateCouponDiscount(coupon, couponContext),
  })), [checkoutCoupons, couponContext]);
  const paymentEligibility = useMemo(() => getAllowedPaymentMethodsForCart(items), [items]);
  const allowedPaymentMethodsKey = paymentEligibility.allowedMethods.join("|");
  const hasCourseItems = useMemo(() => items.some((item) => item.itemType === "course"), [items]);
  const hasShippableItems = useMemo(() => items.some((item) => item.itemType !== "course"), [items]);
  const courseInstallmentEligibility = useMemo(
    () => getCourseInstallmentEligibility(items, checkoutTotals.totalInPaise),
    [checkoutTotals.totalInPaise, items],
  );
  const selectedCoursePaymentPlan: CoursePaymentPlanOption = coursePaymentPlan === "installment" && courseInstallmentEligibility.eligible ? "installment" : "full";
  const courseInstallmentPreview = useMemo(
    () => courseInstallmentEligibility.eligible ? createCourseInstallmentPlan({ totalInPaise: checkoutTotals.totalInPaise }) : null,
    [checkoutTotals.totalInPaise, courseInstallmentEligibility.eligible],
  );
  const onlinePaymentAmountInPaise = useMemo(
    () => getCourseCheckoutPayNowAmount({ paymentPlan: selectedCoursePaymentPlan, totalInPaise: checkoutTotals.totalInPaise }),
    [checkoutTotals.totalInPaise, selectedCoursePaymentPlan],
  );
  const codAvailable = paymentEligibility.allowedMethods.includes("cod");
  const onlineAvailable = paymentEligibility.allowedMethods.includes("razorpay");
  const activeCheckoutSteps = useMemo(() => checkoutSteps.map((step) => (
    step.label === "Details"
      ? { ...step, description: hasShippableItems ? "Delivery details" : "Enrollment details" }
      : step.label === "Payment" && hasCourseItems
        ? { ...step, description: "Razorpay online" }
        : step
  )), [hasCourseItems, hasShippableItems]);

  useEffect(() => {
    if (appliedCouponCode && (!selectedCoupon || selectedCouponEligibility?.eligible === false)) {
      setAppliedCouponCode("");
    }
  }, [appliedCouponCode, selectedCoupon, selectedCouponEligibility?.eligible]);

  useEffect(() => {
    if (items.length === 0) return;
    if (!paymentEligibility.allowedMethods.includes(paymentMethod)) {
      setPaymentMethod(paymentEligibility.allowedMethods[0] || "razorpay");
    }
  }, [allowedPaymentMethodsKey, items.length, paymentEligibility.allowedMethods, paymentMethod]);

  useEffect(() => {
    if (!courseInstallmentEligibility.eligible && coursePaymentPlan === "installment") {
      setCoursePaymentPlan("full");
    }
  }, [courseInstallmentEligibility.eligible, coursePaymentPlan]);

  const applyCoupon = (code: string) => {
    const normalizedCode = normalizeCouponCode(code);
    if (!normalizedCode) return;

    const coupon = redeemableCoupons.find((item) => item.code === normalizedCode);
    if (!coupon) {
      toast({ title: "Coupon not available", description: "This coupon is inactive, hidden, or does not exist.", variant: "destructive" });
      return;
    }

    const eligibility = evaluateCouponEligibility(coupon, couponContext);
    if (!eligibility.eligible) {
      toast({ title: "Coupon not eligible", description: eligibility.reason || "This coupon cannot be used for this cart.", variant: "destructive" });
      return;
    }

    setAppliedCouponCode(coupon.code);
    setCouponInput("");
    toast({ title: "Coupon applied", description: `${coupon.code} has been applied to your order.` });
  };

  const updateAddress = (field: keyof CheckoutAddress) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (selectedSavedAddressId !== "custom") setSelectedSavedAddressId("custom");
    setAddress((currentAddress) => ({ ...currentAddress, [field]: event.target.value }));
  };

  const handleInlineSignup = async (e: FormEvent) => {
    e.preventDefault();
    setInlineError("");
    if (!inlineName.trim()) { setInlineError("Full name is required."); return; }
    const digits = sanitizeDigits(inlinePhone);
    if (digits.length !== 10) { setInlineError("Please enter a valid 10-digit WhatsApp number."); return; }
    if (inlinePassword.length < 6) { setInlineError("Password must be at least 6 characters."); return; }
    setInlineLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, inlineEmail, inlinePassword);
      await updateProfile(cred.user, { displayName: inlineName.trim() });
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        username: inlineName.trim(),
        email: inlineEmail.trim(),
        phone: digits,
        whatsappNumber: digits,
        createdAt: serverTimestamp(),
      });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/email-already-in-use") setInlineError("This email is already registered. Please sign in instead.");
      else if (code === "auth/invalid-email") setInlineError("Please enter a valid email address.");
      else if (code === "auth/weak-password") setInlineError("Password must be at least 6 characters.");
      else setInlineError("Something went wrong. Please try again.");
      setInlineLoading(false);
    }
  };

  const handleInlineLogin = async (e: FormEvent) => {
    e.preventDefault();
    setInlineError("");
    setInlineLoading(true);
    try {
      await signInWithEmailAndPassword(auth, inlineEmail, inlinePassword);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") setInlineError("Incorrect email or password. Please try again.");
      else if (code === "auth/invalid-email") setInlineError("Please enter a valid email address.");
      else setInlineError("Sign in failed. Please try again.");
      setInlineLoading(false);
    }
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

    if (paymentEligibility.blockingReason || !paymentEligibility.allowedMethods.includes(paymentMethod)) {
      setFormError(paymentEligibility.blockingReason || "Please choose an available payment method for this cart.");
      return;
    }

    const accountWhatsAppNumber = getAccountWhatsAppNumber(userProfile);
    if (accountWhatsAppNumber.length < 10) {
      setFormError("Please add your active WhatsApp number in Account Details before placing an order.");
      setAccountWhatsAppDialogOpen(true);
      return;
    }

    const accountCallNumber = getAccountCallNumber(userProfile, accountWhatsAppNumber);

    const validationError = validateAddress(address, { requireShippingAddress: hasShippableItems && deliveryMethod === "shipping" });
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const normalizedAddress = normalizeAddress(address);
    const orderNumber = createOrderNumber();
    const paymentPlan = paymentMethod === "razorpay" ? selectedCoursePaymentPlan : "full";
    const payNowAmountInPaise = paymentMethod === "razorpay" ? onlinePaymentAmountInPaise : checkoutTotals.totalInPaise;
    const paymentLabel = paymentMethod === "razorpay"
      ? paymentPlan === "installment" ? "Razorpay Installment (50%)" : "Razorpay Online"
      : "Cash on Delivery";
    const orderCreatedAt = new Date();
    const installmentPlan = paymentMethod === "razorpay" && paymentPlan === "installment"
      ? createCourseInstallmentPlan({ totalInPaise: checkoutTotals.totalInPaise, createdAt: orderCreatedAt })
      : undefined;

    setSubmitting(true);
    try {
      const idToken = paymentMethod === "razorpay" ? await user.getIdToken() : "";
      const razorpayOrder = paymentMethod === "razorpay"
        ? await createRazorpayOrder({
          idToken,
          amountInPaise: payNowAmountInPaise,
          orderNumber,
          customerId: user.uid,
          customerName: normalizedAddress.fullName,
        })
        : null;
      const orderItems = items.map((item) => sanitizeForFirestore(createOrderItemFromCartItem(item, deliveryProfiles[item.productId])));

      const sanitizedOrderPayload = sanitizeForFirestore({
        orderNumber,
        customerId: user.uid,
        customerName: normalizedAddress.fullName,
        customerEmail: normalizedAddress.email || user.email || "",
        customerPhone: normalizedAddress.phone,
        customerWhatsAppNumber: accountWhatsAppNumber,
        customerCallNumber: accountCallNumber,
        items: orderItems,
        address: normalizedAddress,
        customerNotes: normalizedAddress.notes,
        payment: paymentMethod === "razorpay"
          ? {
            method: "razorpay",
            status: "pending",
            plan: paymentPlan,
            totalPayableInPaise: checkoutTotals.totalInPaise,
            expectedOnlineAmountInPaise: payNowAmountInPaise,
            razorpayOrderId: razorpayOrder?.orderId,
            razorpaySignatureVerified: false,
            installmentPlan,
          }
          : {
            method: "cod",
            status: "cod-pending",
          },
        delivery: {
          chargeInPaise: checkoutTotals.deliveryChargeInPaise,
          originalChargeInPaise: deliveryEstimate.originalChargeInPaise,
          freeDeliveryReason: deliveryMethod === "store-pickup" ? "Store Pick Up" : deliveryEstimate.freeDeliveryReason,
          couponDeliveryDiscountInPaise: appliedCoupon?.deliveryDiscountInPaise || 0,
          status: "placed",
          provider: hasShippableItems && deliveryMethod === "shipping" ? DEFAULT_DELIVERY_PROVIDER : "manual",
          syncStatus: "manual-ready",
          shipmentWeightInGrams: deliveryEstimate.weightInGrams,
          usesFallbackWeight: deliveryEstimate.usesFallbackWeight,
          method: deliveryMethod,
        },
        status: "placed",
        subtotalInPaise: checkoutTotals.subtotalInPaise,
        deliveryChargeInPaise: checkoutTotals.deliveryChargeInPaise,
        discountInPaise: checkoutTotals.discountInPaise,
        coupon: appliedCoupon ? {
          id: appliedCoupon.id,
          code: appliedCoupon.code,
          title: appliedCoupon.title,
          type: appliedCoupon.type,
          discountInPaise: appliedCoupon.discountInPaise,
          deliveryDiscountInPaise: appliedCoupon.deliveryDiscountInPaise,
          freeDelivery: appliedCoupon.freeDelivery,
        } : undefined,
        totalInPaise: checkoutTotals.totalInPaise,
        timeline: [
          {
            status: "placed",
            label: "Order placed",
            note: paymentMethod === "razorpay"
              ? paymentPlan === "installment" ? "Customer selected course installment payment." : "Customer selected Razorpay online payment."
              : "Customer selected Cash on Delivery.",
            createdAt: orderCreatedAt.toISOString(),
            createdBy: user.uid,
          },
        ],
      }) as Record<string, unknown>;

      const orderPayload = {
        ...sanitizedOrderPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const orderDocument = await addDoc(collection(db, "orders"), orderPayload);

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

      const notificationIdToken = idToken || await user.getIdToken();
      void sendOrderAutomation(notificationIdToken, { orderId: orderDocument.id, event: "order-placed" })
        .then((automationResult) => {
          if (automationResult.warnings?.length) {
            console.warn("Order was created but some automatic messages need attention", automationResult.warnings);
          }
        })
        .catch((notificationError) => {
          console.error("Order was created but automatic messages could not be sent", notificationError);
        });

      try {
        await clearCart();
      } catch (clearCartError) {
        console.error("Order was created but the cart could not be cleared", clearCartError);
      }
      clearBuyNowItem();

      // Auto-save custom address to address book after successful order
      if (selectedSavedAddressId === "custom") {
        void (async () => {
          try {
            const existingAddressesSnapshot = await getDocs(collection(db, "users", user.uid, "addresses"));
            await addDoc(collection(db, "users", user.uid, "addresses"), {
              fullName: normalizedAddress.fullName,
              phone: normalizedAddress.phone,
              email: normalizedAddress.email || "",
              line1: normalizedAddress.line1 || "",
              line2: normalizedAddress.line2 || "",
              city: normalizedAddress.city || "",
              state: normalizedAddress.state || "",
              pincode: normalizedAddress.pincode || "",
              landmark: normalizedAddress.landmark || "",
              notes: normalizedAddress.notes || "",
              isDefault: existingAddressesSnapshot.empty,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            toast({ title: "Address saved", description: "Your delivery address has been saved for future orders." });
          } catch (saveError) {
            console.error("Could not auto-save checkout address", saveError);
          }
        })();
      }

      setPlacedOrder({ id: orderDocument.id, orderNumber, totalInPaise: checkoutTotals.totalInPaise, paidNowInPaise: payNowAmountInPaise, paymentLabel, hasShippableItems, paymentPlan, deliveryMethod });
      toast({ title: paymentMethod === "razorpay" ? (paymentPlan === "installment" ? "First installment received" : "Payment received") : "Order placed", description: `${orderNumber} has been created.` });
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

  const showLoading = authLoading || cartLoading || (Boolean(user) && (!savedAddressHydrated || !userProfile));

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
            <h1 className="mt-3 font-display text-3xl text-foreground sm:text-4xl">{placedOrder.hasShippableItems ? "Thank you for your order" : "Course purchase confirmed"}</h1>
            <p className="mx-auto mt-4 max-w-xl font-body text-muted-foreground">
              {!placedOrder.hasShippableItems
                ? placedOrder.paymentPlan === "installment"
                  ? "Your first installment was verified through Razorpay. Admin can now review the course purchase and follow up with enrollment details."
                  : "Your online payment was verified through Razorpay. Admin can now review the course purchase and follow up with enrollment details."
                : placedOrder.deliveryMethod === "store-pickup"
                ? placedOrder.paymentLabel === "Razorpay Online"
                  ? "Your online payment was verified. Admin will prepare your order for store pickup."
                  : "Your store pickup order has been placed. Admin will prepare your items for collection."
                : placedOrder.paymentLabel === "Razorpay Online"
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
              {placedOrder.paidNowInPaise < placedOrder.totalInPaise && (
                <div className="mt-3 flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Paid now</span>
                  <span className="font-semibold text-foreground">{formatPaiseAsRupees(placedOrder.paidNowInPaise)}</span>
                </div>
              )}
              <div className="mt-3 flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{placedOrder.paidNowInPaise < placedOrder.totalInPaise ? "Course fee" : "Total"}</span>
                <span className="font-semibold text-gold">{formatPaiseAsRupees(placedOrder.totalInPaise)}</span>
              </div>
            </div>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to={placedOrder.hasShippableItems ? "/products" : "/courses"} className="inline-flex items-center justify-center rounded-sm bg-gold px-6 py-3 font-display text-sm font-semibold tracking-[0.08em] text-charcoal transition-colors hover:bg-gold-light">
                {placedOrder.hasShippableItems ? "Continue Shopping" : "Browse Courses"}
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
        subtext="Confirm details, choose payment, and place your order."
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
          <section className="rounded-2xl border border-gold/20 bg-card shadow-card">
            {/* Header */}
            <div className="border-b border-gold/15 px-6 py-5 sm:px-8">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold">
                  <UserRound className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-2xl text-foreground">
                    {inlineMode === "signup" ? "Create Account & Continue" : "Sign In & Continue"}
                  </h2>
                  <p className="font-body text-sm text-muted-foreground">
                    {inlineMode === "signup"
                      ? "Quick setup — your account will be ready for checkout right away."
                      : "Welcome back — sign in to continue with your order."}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-6 sm:px-8">
              {/* Mode toggle */}
              <div className="mb-5 flex rounded-xl border border-border bg-background/70 p-1">
                <button
                  type="button"
                  onClick={() => { setInlineMode("signup"); setInlineError(""); }}
                  className={`flex-1 rounded-lg py-2.5 font-body text-sm font-semibold transition-colors ${inlineMode === "signup" ? "bg-gold text-charcoal shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  New Account
                </button>
                <button
                  type="button"
                  onClick={() => { setInlineMode("login"); setInlineError(""); }}
                  className={`flex-1 rounded-lg py-2.5 font-body text-sm font-semibold transition-colors ${inlineMode === "login" ? "bg-gold text-charcoal shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Sign In
                </button>
              </div>

              {inlineError && (
                <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 font-body text-sm text-destructive">
                  {inlineError}
                </div>
              )}

              {inlineMode === "signup" ? (
                <form onSubmit={handleInlineSignup} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="font-body text-sm font-semibold text-foreground">
                      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-foreground/70">
                        <UserRound className="h-3.5 w-3.5 text-gold" /> FULL NAME
                      </span>
                      <input
                        type="text"
                        value={inlineName}
                        onChange={(e) => setInlineName(e.target.value)}
                        required
                        placeholder="Your full name"
                        className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 font-body text-sm font-normal text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-gold focus:ring-2 focus:ring-gold/20"
                      />
                    </label>
                    <label className="font-body text-sm font-semibold text-foreground">
                      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-foreground/70">
                        <Phone className="h-3.5 w-3.5 text-gold" /> WHATSAPP NUMBER
                      </span>
                      <input
                        type="tel"
                        value={inlinePhone}
                        onChange={(e) => setInlinePhone(e.target.value)}
                        required
                        inputMode="tel"
                        maxLength={15}
                        placeholder="10-digit number"
                        className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 font-body text-sm font-normal text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-gold focus:ring-2 focus:ring-gold/20"
                      />
                    </label>
                  </div>
                  <label className="block font-body text-sm font-semibold text-foreground">
                    <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-foreground/70">
                      <MessageCircle className="h-3.5 w-3.5 text-gold" /> EMAIL ADDRESS
                    </span>
                    <input
                      type="email"
                      value={inlineEmail}
                      onChange={(e) => setInlineEmail(e.target.value)}
                      required
                      placeholder="you@example.com"
                      className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 font-body text-sm font-normal text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-gold focus:ring-2 focus:ring-gold/20"
                    />
                  </label>
                  <label className="block font-body text-sm font-semibold text-foreground">
                    <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-foreground/70">
                      <KeyRound className="h-3.5 w-3.5 text-gold" /> PASSWORD
                    </span>
                    <div className="relative mt-1">
                      <input
                        type={inlineShowPassword ? "text" : "password"}
                        value={inlinePassword}
                        onChange={(e) => setInlinePassword(e.target.value)}
                        required
                        minLength={6}
                        placeholder="Minimum 6 characters"
                        className="h-11 w-full rounded-xl border border-border bg-background px-3 pr-11 font-body text-sm font-normal text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-gold focus:ring-2 focus:ring-gold/20"
                      />
                      <button
                        type="button"
                        onClick={() => setInlineShowPassword(!inlineShowPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gold"
                      >
                        {inlineShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>

                  {/* Why WhatsApp */}
                  <div className="flex items-start gap-2 rounded-xl border border-gold/20 bg-gold/5 px-3 py-2.5">
                    <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
                    <p className="font-body text-[0.75rem] leading-relaxed text-muted-foreground">
                      Your WhatsApp number is used for <strong className="text-foreground">delivery updates</strong> on products and <strong className="text-foreground">course enrollment confirmations</strong>. You can update it anytime in Account Details.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={inlineLoading}
                    className="flex h-12 w-full items-center justify-center rounded-xl bg-gradient-primary font-display text-sm font-semibold tracking-[0.06em] text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
                  >
                    {inlineLoading ? "Creating Account…" : "Create Account & Continue to Checkout"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleInlineLogin} className="space-y-3">
                  <label className="block font-body text-sm font-semibold text-foreground">
                    <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-foreground/70">
                      <MessageCircle className="h-3.5 w-3.5 text-gold" /> EMAIL ADDRESS
                    </span>
                    <input
                      type="email"
                      value={inlineEmail}
                      onChange={(e) => setInlineEmail(e.target.value)}
                      required
                      placeholder="you@example.com"
                      className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 font-body text-sm font-normal text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-gold focus:ring-2 focus:ring-gold/20"
                    />
                  </label>
                  <label className="block font-body text-sm font-semibold text-foreground">
                    <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-foreground/70">
                      <KeyRound className="h-3.5 w-3.5 text-gold" /> PASSWORD
                    </span>
                    <div className="relative mt-1">
                      <input
                        type={inlineShowPassword ? "text" : "password"}
                        value={inlinePassword}
                        onChange={(e) => setInlinePassword(e.target.value)}
                        required
                        placeholder="Your password"
                        className="h-11 w-full rounded-xl border border-border bg-background px-3 pr-11 font-body text-sm font-normal text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-gold focus:ring-2 focus:ring-gold/20"
                      />
                      <button
                        type="button"
                        onClick={() => setInlineShowPassword(!inlineShowPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gold"
                      >
                        {inlineShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>
                  <button
                    type="submit"
                    disabled={inlineLoading}
                    className="flex h-12 w-full items-center justify-center rounded-xl bg-gradient-primary font-display text-sm font-semibold tracking-[0.06em] text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
                  >
                    {inlineLoading ? "Signing In…" : "Sign In & Continue to Checkout"}
                  </button>
                  <p className="text-center font-body text-xs text-muted-foreground">
                    <Link to="/login" className="font-semibold text-gold hover:underline">Forgot password?</Link>
                  </p>
                </form>
              )}
            </div>
          </section>
        ) : items.length === 0 ? (
          <section className="rounded-2xl border border-border/60 bg-card p-8 text-center shadow-card sm:p-12">
            <PackageCheck className="mx-auto mb-5 h-14 w-14 text-gold" />
            <h2 className="font-display text-3xl text-foreground">Your cart is empty</h2>
            <p className="mx-auto mt-3 max-w-xl font-body text-muted-foreground">Add a product or course before checkout.</p>
            <Link to="/products" className="mt-8 inline-flex items-center justify-center rounded-sm bg-gold px-7 py-3 font-display text-sm font-semibold tracking-[0.08em] text-charcoal transition-colors hover:bg-gold-light">
              Browse Products
            </Link>
          </section>
        ) : (
          <form onSubmit={placeOrder} className="space-y-8">
            <ol className="grid gap-3 rounded-2xl border border-gold/20 bg-card p-4 shadow-card sm:grid-cols-3 sm:p-5">
              {activeCheckoutSteps.map((step, index) => (
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
                {hasShippableItems && (
                  <div className="mb-8">
                    <div className="mb-5 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/10 text-gold">
                        <Truck className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="font-display text-2xl text-foreground">Delivery Method</h2>
                        <p className="font-body text-sm text-muted-foreground">How would you like to receive your order?</p>
                      </div>
                    </div>
                    
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={`cursor-pointer rounded-xl border p-4 transition-colors ${deliveryMethod === "shipping" ? "border-gold bg-gold/10" : "border-border bg-background/70 hover:border-gold/50"}`}>
                        <input type="radio" name="deliveryMethod" value="shipping" checked={deliveryMethod === "shipping"} onChange={() => setDeliveryMethod("shipping")} className="sr-only" />
                        <span className="font-body text-sm font-bold text-foreground">Ship to address</span>
                        <span className="mt-2 block font-body text-xs leading-relaxed text-muted-foreground">Standard delivery via courier.</span>
                      </label>
                      <label className={`cursor-pointer rounded-xl border p-4 transition-colors ${deliveryMethod === "store-pickup" ? "border-gold bg-gold/10" : "border-border bg-background/70 hover:border-gold/50"}`}>
                        <input type="radio" name="deliveryMethod" value="store-pickup" checked={deliveryMethod === "store-pickup"} onChange={() => setDeliveryMethod("store-pickup")} className="sr-only" />
                        <span className="font-body text-sm font-bold text-foreground">Store Pick Up</span>
                        <span className="mt-2 block font-body text-xs leading-relaxed text-muted-foreground">Pick up directly from our store. No delivery charges.</span>
                      </label>
                    </div>
                  </div>
                )}

                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/10 text-gold">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-2xl text-foreground">{hasShippableItems ? (deliveryMethod === "store-pickup" ? "Customer Details" : "Delivery Details") : "Enrollment Details"}</h2>
                    <p className="font-body text-sm text-muted-foreground">{hasShippableItems ? (deliveryMethod === "store-pickup" ? "Required for order tracking and contact." : "Used for Delivery One shipment coordination.") : "Used to attach this course purchase to your account and WhatsApp updates."}</p>
                  </div>
                </div>

                {hasShippableItems && deliveryMethod === "shipping" && savedAddresses.length > 0 && (
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
                  {hasShippableItems && (
                    <label className="font-body text-sm font-semibold text-foreground sm:col-span-2">
                      Email
                      <input value={address.email || ""} onChange={updateAddress("email")} className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="you@example.com" type="email" />
                    </label>
                  )}
                  {hasShippableItems && deliveryMethod === "shipping" && (
                    <>
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
                    </>
                  )}
                  {hasShippableItems && (
                    <label className="font-body text-sm font-semibold text-foreground sm:col-span-2">
                      {deliveryMethod === "shipping" ? "Delivery notes" : "Order notes"}
                      <textarea value={address.notes || ""} onChange={updateAddress("notes")} rows={3} className="mt-2 w-full rounded-md border border-border bg-background px-3 py-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder={deliveryMethod === "shipping" ? "Optional notes for delivery or admin follow-up" : "Optional notes for admin follow-up"} />
                    </label>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/10 text-gold">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-2xl text-foreground">Payment Method</h2>
                    <p className="font-body text-sm text-muted-foreground">Choose from the payment methods available for every item in this cart.</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {hasShippableItems && (
                    <label className={`cursor-pointer rounded-xl border p-4 transition-colors ${paymentMethod === "cod" ? "border-gold bg-gold/10" : "border-border bg-background/70 hover:border-gold/50"} ${!codAvailable ? "cursor-not-allowed opacity-50" : ""}`}>
                      <input type="radio" name="paymentMethod" value="cod" checked={paymentMethod === "cod"} onChange={() => codAvailable && setPaymentMethod("cod")} disabled={!codAvailable} className="sr-only" />
                      <span className="font-body text-sm font-bold text-foreground">Cash on Delivery</span>
                      <span className="mt-2 block font-body text-xs leading-relaxed text-muted-foreground">{codAvailable ? "Place the order now and collect payment at delivery." : paymentEligibility.codUnavailableReason || "COD is unavailable for this cart."}</span>
                    </label>
                  )}
                  <label className={`cursor-pointer rounded-xl border p-4 transition-colors ${paymentMethod === "razorpay" ? "border-gold bg-gold/10" : "border-border bg-background/70 hover:border-gold/50"} ${!onlineAvailable ? "cursor-not-allowed opacity-50" : ""}`}>
                    <input type="radio" name="paymentMethod" value="razorpay" checked={paymentMethod === "razorpay"} onChange={() => onlineAvailable && setPaymentMethod("razorpay")} disabled={!onlineAvailable} className="sr-only" />
                    <span className="font-body text-sm font-bold text-foreground">Razorpay Online</span>
                    <span className="mt-2 block font-body text-xs leading-relaxed text-muted-foreground">{onlineAvailable ? "Pay now using Razorpay test or live credentials configured on the server." : paymentEligibility.onlineUnavailableReason || "Online payment is unavailable for this cart."}</span>
                  </label>
                </div>
                {hasCourseItems && !hasShippableItems && onlineAvailable && (
                  <div className="mt-5 rounded-xl border border-gold/20 bg-gold/10 p-4">
                    <div className="mb-3 flex items-start gap-2">
                      <CalendarDays className="mt-0.5 h-4 w-4 text-gold" />
                      <div>
                        <p className="font-body text-sm font-bold text-foreground">Course installment option</p>
                        <p className="font-body text-xs leading-relaxed text-muted-foreground">
                          {courseInstallmentEligibility.eligible
                            ? "Available for this course payment. Pay 50% now, then 25% + 25% on the 5th of the next months."
                            : courseInstallmentEligibility.reason}
                        </p>
                      </div>
                    </div>
                    {courseInstallmentEligibility.eligible && courseInstallmentPreview && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className={`cursor-pointer rounded-lg border p-3 transition-colors ${selectedCoursePaymentPlan === "full" ? "border-gold bg-card" : "border-border bg-background/70 hover:border-gold/50"}`}>
                          <input type="radio" name="coursePaymentPlan" value="full" checked={selectedCoursePaymentPlan === "full"} onChange={() => setCoursePaymentPlan("full")} className="sr-only" />
                          <span className="block font-body text-sm font-bold text-foreground">Pay full fee</span>
                          <span className="mt-1 block font-body text-xs text-muted-foreground">Pay {formatPaiseAsRupees(checkoutTotals.totalInPaise)} now.</span>
                        </label>
                        <label className={`cursor-pointer rounded-lg border p-3 transition-colors ${selectedCoursePaymentPlan === "installment" ? "border-gold bg-card" : "border-border bg-background/70 hover:border-gold/50"}`}>
                          <input type="radio" name="coursePaymentPlan" value="installment" checked={selectedCoursePaymentPlan === "installment"} onChange={() => setCoursePaymentPlan("installment")} className="sr-only" />
                          <span className="block font-body text-sm font-bold text-foreground">3 installments</span>
                          <span className="mt-1 block font-body text-xs text-muted-foreground">Pay {formatPaiseAsRupees(courseInstallmentPreview.initialPaymentInPaise)} now.</span>
                        </label>
                      </div>
                    )}
                  </div>
                )}
                {paymentEligibility.blockingReason && <p className="mt-3 rounded-xl border border-destructive/25 bg-destructive/10 p-3 font-body text-sm text-destructive">{paymentEligibility.blockingReason}</p>}
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

              <div className="mt-6 rounded-xl border border-gold/20 bg-gold/10 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <TicketPercent className="h-4 w-4 text-gold" />
                  <div>
                    <h3 className="font-display text-lg text-foreground">Available Offers</h3>
                    <p className="font-body text-xs text-muted-foreground">Apply an eligible coupon before payment.</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    value={couponInput}
                    onChange={(event) => setCouponInput(normalizeCouponCode(event.target.value))}
                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 font-body text-sm uppercase outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20"
                    placeholder="COUPON CODE"
                  />
                  <button type="button" onClick={() => applyCoupon(couponInput)} disabled={!couponInput.trim()} className="rounded-md bg-gold px-4 py-2 font-body text-sm font-semibold text-charcoal transition-colors hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60">
                    Apply
                  </button>
                </div>

                {appliedCoupon && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-body text-sm text-emerald-800">
                    <span><strong>{appliedCoupon.code}</strong> applied</span>
                    <button type="button" onClick={() => setAppliedCouponCode("")} className="rounded p-1 text-emerald-700 hover:bg-emerald-100" aria-label="Remove applied coupon"><X className="h-4 w-4" /></button>
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  {couponsLoading ? (
                    <p className="font-body text-xs text-muted-foreground">Loading offers...</p>
                  ) : couponOptions.length === 0 ? (
                    <p className="font-body text-xs text-muted-foreground">No public offers are active right now.</p>
                  ) : couponOptions.map(({ coupon, eligibility, discount }) => {
                    const savings = discount.discountInPaise + discount.deliveryDiscountInPaise;
                    return (
                      <button
                        key={coupon.code}
                        type="button"
                        onClick={() => applyCoupon(coupon.code)}
                        disabled={!eligibility.eligible || appliedCouponCode === coupon.code}
                        className={`w-full rounded-lg border p-3 text-left transition-colors ${appliedCouponCode === coupon.code ? "border-emerald-300 bg-emerald-50" : eligibility.eligible ? "border-gold/30 bg-card hover:border-gold" : "border-border bg-background/70 opacity-60"}`}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span>
                            <span className="block font-body text-sm font-bold text-foreground">{coupon.code} · {formatCouponBenefit(coupon)}</span>
                            <span className="mt-1 block font-body text-xs text-muted-foreground">{eligibility.eligible ? coupon.description || (savings > 0 ? `Save ${formatPaiseAsRupees(savings)} on this order.` : "Apply this coupon to your cart.") : eligibility.reason}</span>
                          </span>
                          <span className="shrink-0 rounded-full bg-gold/10 px-2.5 py-1 font-body text-[0.68rem] font-bold text-gold">{appliedCouponCode === coupon.code ? "Applied" : eligibility.eligible ? "Apply" : "Locked"}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 space-y-3 border-t border-border pt-5 font-body text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-foreground">{formatPaiseAsRupees(checkoutTotals.subtotalInPaise)}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">Delivery</span>
                  <span className="text-right font-medium text-foreground">
                    {!hasShippableItems ? "Not required" : deliveryMethod === "store-pickup" ? "Free (Store Pick Up)" : deliveryLoading ? "Calculating..." : (
                      <>
                        <span className="block">
                          {(deliveryEstimate.originalChargeInPaise || appliedCoupon?.deliveryDiscountInPaise) ? <span className="mr-2 text-muted-foreground line-through">{formatPaiseAsRupees(deliveryEstimate.originalChargeInPaise || deliveryEstimate.chargeInPaise)}</span> : null}
                          <span>{formatPaiseAsRupees(checkoutTotals.deliveryChargeInPaise)}</span>
                        </span>
                        {(deliveryEstimate.freeDeliveryReason || appliedCoupon?.freeDelivery) && checkoutTotals.deliveryChargeInPaise === 0 ? (
                          <span className="mt-1 block text-[0.72rem] font-semibold text-emerald-700">{deliveryEstimate.freeDeliveryReason || "Free delivery coupon applied"}</span>
                        ) : null}
                      </>
                    )}
                  </span>
                </div>
                {checkoutTotals.discountInPaise > 0 && (
                  <div className="flex items-center justify-between gap-4 text-emerald-700">
                    <span>Discount{appliedCoupon ? ` (${appliedCoupon.code})` : ""}</span>
                    <span className="font-medium">-{formatPaiseAsRupees(checkoutTotals.discountInPaise)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-4 text-base">
                  <span className="font-semibold text-foreground">Total</span>
                  <span className="font-semibold text-gold">{formatPaiseAsRupees(checkoutTotals.totalInPaise)}</span>
                </div>
              </div>

              {paymentMethod === "razorpay" && selectedCoursePaymentPlan === "installment" && courseInstallmentPreview && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-body text-xs leading-relaxed text-emerald-900">
                  <div className="mb-2 flex items-center gap-2 font-semibold">
                    <CalendarDays className="h-4 w-4 text-emerald-700" /> Installment schedule
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between gap-3"><span>Pay now (50%)</span><span className="font-semibold">{formatPaiseAsRupees(courseInstallmentPreview.initialPaymentInPaise)}</span></div>
                    {courseInstallmentPreview.installments.slice(1).map((installment) => (
                      <div key={installment.installmentNumber} className="flex justify-between gap-3"><span>{installment.label} on {installment.dueDate}</span><span className="font-semibold">{formatPaiseAsRupees(installment.amountInPaise)}</span></div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5 rounded-xl border border-gold/20 bg-gold/10 p-3 font-body text-xs leading-relaxed text-foreground">
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <MessageCircle className="h-4 w-4 text-gold" /> WhatsApp updates
                </div>
                Order messages are sent to the WhatsApp number saved in Account Details, not this delivery phone field.
              </div>

              {hasShippableItems && deliveryMethod === "shipping" && <div className="mt-4 rounded-xl border border-gold/20 bg-gold/10 p-3 font-body text-xs leading-relaxed text-foreground">
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <Truck className="h-4 w-4 text-gold" /> Delivery estimate
                </div>
                Charges are calculated from product weight. {deliveryEstimate.usesFallbackWeight ? "Some products are using the default 500 g fallback until admin saves exact shipment weight." : "All items have shipment weight snapshots for Delivery One."}
              </div>}

              {paymentMethod === "razorpay" && (
                <div className="mt-4 rounded-xl border border-gold/20 bg-gold/10 p-3 font-body text-xs leading-relaxed text-foreground">
                  {selectedCoursePaymentPlan === "installment"
                    ? "Razorpay Checkout will collect the 50% first installment now. The remaining installments are tracked for monthly WhatsApp reminders."
                    : "Razorpay Checkout will open after your order is saved. The order is marked paid only after server-side signature verification."}
                </div>
              )}

              {formError && (
                <div className="mt-4 rounded-xl border border-destructive/25 bg-destructive/10 p-3 font-body text-sm text-destructive">
                  {formError}
                </div>
              )}

              <button type="submit" disabled={submitting || deliveryLoading || paymentEligibility.allowedMethods.length === 0} className="mt-5 flex w-full items-center justify-center gap-2 rounded-sm bg-gradient-primary px-5 py-3 font-display text-sm font-semibold tracking-[0.08em] text-primary-foreground shadow-[0_10px_24px_rgba(139,26,26,0.2)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100">
                <ShieldCheck className="h-4 w-4" /> {submitting ? (paymentMethod === "razorpay" ? "Processing Payment..." : "Placing Order...") : paymentMethod === "razorpay" ? (selectedCoursePaymentPlan === "installment" ? "Pay 1st Installment" : "Pay Now") : "Place COD Order"}
              </button>
              <p className="mt-3 text-center font-body text-xs text-muted-foreground">Your order will be saved for admin order management.</p>
            </aside>
            </div>
          </form>
        )}
      </main>

      <AlertDialog open={accountWhatsAppDialogOpen} onOpenChange={setAccountWhatsAppDialogOpen}>
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl border-gold/25 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-foreground">WhatsApp number required</AlertDialogTitle>
            <AlertDialogDescription className="font-body leading-6 text-muted-foreground">
              Please enter only your active WhatsApp number in Account Details before placing this order. Javani sends order confirmation and updates to that WhatsApp number.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start sm:space-x-0">
            <AlertDialogAction onClick={() => navigate("/account/profile")} className="rounded-sm bg-gradient-primary px-5 font-display tracking-[0.08em] text-primary-foreground hover:brightness-110">
              Open Account Details
            </AlertDialogAction>
            <AlertDialogCancel className="mt-0 rounded-sm border-border font-body">
              Stay on Checkout
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Footer />
    </div>
  );
};

export default Checkout;