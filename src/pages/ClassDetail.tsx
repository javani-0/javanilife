import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Banknote, CalendarDays, CreditCard, GraduationCap, Loader2, Maximize2, Repeat, Users, Wallet } from "lucide-react";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SEO from "@/components/SEO";
import ShareButton from "@/components/ShareButton";
import ImageViewer from "@/components/ImageViewer";
import UpiPaymentDialog from "@/components/classes/UpiPaymentDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useCoupons } from "@/hooks/useCoupons";
import { calculateCouponDiscount, evaluateCouponEligibility, formatPaiseAsRupees, normalizeCouponCode } from "@/lib/ecommerce";
import {
  AUTOPAY_AFA_CAP_IN_PAISE,
  buildClassEmiPlan,
  classTracks,
  computeBillingPeriod,
  confirmSubscription,
  createEnrollment,
  createSubscription,
  DEFAULT_CLASS_EMI_CONFIG,
  deleteEnrollment,
  dueDateFor,
  getClassEmiSurchargeInPaise,
  getClassEmiTotalInPaise,
  getAutopayFeeInPaise,
  getAutopayFeeLabel,
  formatNiceDate,
  getClass,
  getClassFeeInPaise,
  getClassFeeLabel,
  getPaymentMethodsForTrack,
  getTermPayFullOfferLabel,
  getTermPayFullPriceInPaise,
  getTrackFeeLabel,
  hasAutopayDiscount,
  hasTermPayFullOffer,
  openSubscriptionCheckout,
  payFeeNow,
  type ClassDoc,
  type ClassPaymentMethod,
  type ClassTimeSlot,
  type ClassTrack,
} from "@/lib/classes";
import heroTemple from "@/assets/hero-temple.jpg";

const PAYMENT_METHOD_META: Record<ClassPaymentMethod, { title: string; blurb: string; icon: typeof Repeat; recommended?: boolean }> = {
  autopay: { title: "Autopay", blurb: "Authorise once; the fee is auto-debited each month. We notify you on every debit.", icon: Repeat, recommended: true },
  // "Pay Now" is the manual rail: scan the QR to pay now (upload the receipt for
  // us to confirm), or submit without a screenshot to pay at the counter.
  manual: { title: "Pay Now", blurb: "Scan the QR to pay this month now — upload your receipt, or submit without one to pay at the counter.", icon: Wallet },
  full: { title: "Pay Full", blurb: "Pay the entire course fee once. No further payments.", icon: Wallet },
  emi: { title: "EMI", blurb: "Pay a part upfront now, then the rest in installments. We'll remind you before each due date.", icon: CreditCard },
  cash: { title: "Pay Cash", blurb: "Pay in cash at the centre. Your enrolment will be confirmed once the admin collects the payment.", icon: Banknote },
};

const seatsLeft = (slot: ClassTimeSlot): number | null => (
  slot.seatsTotal != null ? Math.max(0, slot.seatsTotal - (slot.seatsTaken || 0)) : null
);

const enrollSchema = z.object({
  studentName: z.string().trim().min(2, "Student name is required"),
  studentAge: z.coerce.number({ invalid_type_error: "Enter a valid age" }).int().min(2, "Enter a valid age").max(100, "Enter a valid age"),
  studentGender: z.enum(["male", "female", "other"], { errorMap: () => ({ message: "Select a gender" }) }),
  parentName: z.string().trim().min(2, "Parent name is required"),
  parentPhone: z.string().trim().regex(/^\d{10}$/, "Enter a 10-digit phone number"),
  parentWhatsapp: z.string().trim().regex(/^\d{10}$/, "Enter a 10-digit number").or(z.literal("")).optional(),
  parentAddress: z.string().trim().min(5, "Address is required"),
});

type EnrollFormValues = z.infer<typeof enrollSchema>;

const inputClass = "w-full px-3 py-2.5 rounded-md border border-border font-body text-[0.9rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background";
const labelClass = "font-body text-[0.85rem] font-medium text-foreground block mb-1.5";
const errorClass = "mt-1 font-body text-[0.75rem] text-destructive";

const ClassDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [classDoc, setClassDoc] = useState<ClassDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<ClassPaymentMethod | null>(null);
  // New students shouldn't be pushed into autopay right away (client-confirmed).
  const [studentStatus, setStudentStatus] = useState<"new" | "existing">("new");
  const [track, setTrack] = useState<ClassTrack | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [upiDialog, setUpiDialog] = useState<{ open: boolean; target: { enrollmentId: string; kind: "monthly" | "full" }; amount: number; title: string; couponCode?: string } | null>(null);

  const availableTracks = useMemo(() => (classDoc ? classTracks(classDoc) : []), [classDoc]);
  // The active track: the parent's choice, or the only available one.
  const activeTrack: ClassTrack | null = track && availableTracks.includes(track) ? track : availableTracks[0] || null;
  const enabledMethods = useMemo(
    () => (classDoc && activeTrack ? getPaymentMethodsForTrack(classDoc, activeTrack) : []),
    [classDoc, activeTrack],
  );
  // Req 1: a MONTHLY class shows only two options — "Autopay" and "Pay Now".
  // "Pay Now" is the manual UPI rail (which also covers pay-at-counter) and is
  // ALWAYS available for monthly classes (even legacy ones), so we render it
  // regardless of the stored manual/cash flags and never show a separate cash
  // button. Term courses keep their own methods (Pay Full / EMI) unchanged.
  const displayMethods = useMemo<ClassPaymentMethod[]>(() => {
    if (activeTrack === "term") return enabledMethods;
    const monthly: ClassPaymentMethod[] = [];
    if (enabledMethods.includes("autopay")) monthly.push("autopay");
    monthly.push("manual"); // Pay Now — always offered for monthly classes
    return monthly;
  }, [activeTrack, enabledMethods]);
  const slots = useMemo(() => classDoc?.timeSlots || [], [classDoc]);
  const isTerm = activeTrack === "term";
  const emiConfig = classDoc?.emi || DEFAULT_CLASS_EMI_CONFIG;
  const emiSurchargeInPaise = getClassEmiSurchargeInPaise(emiConfig);
  const emiPlan = useMemo(
    () => (classDoc && isTerm ? buildClassEmiPlan(getClassEmiTotalInPaise(getClassFeeInPaise(classDoc, "term"), emiConfig), emiConfig) : null),
    [classDoc, isTerm, emiConfig],
  );

  // Coupons (req 2) — only apply to the one-time UPI rails (pre-payment + pay
  // full). Autopay/EMI/cash don't take a coupon.
  const { redeemableCoupons } = useCoupons();
  const [couponInput, setCouponInput] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState("");
  const couponEligible = paymentMethod === "manual" || paymentMethod === "full";
  const payableBaseInPaise = useMemo(() => {
    if (!classDoc) return 0;
    if (paymentMethod === "full") return getTermPayFullPriceInPaise(classDoc);
    if (paymentMethod === "manual") return classDoc.monthlyFeeInPaise;
    return 0;
  }, [classDoc, paymentMethod]);
  const couponContext = useMemo(() => ({
    items: classDoc ? [{ productId: classDoc.id, sourceId: classDoc.id, itemType: "course" as const, category: classDoc.category, quantity: 1, amountInPaise: payableBaseInPaise }] : [],
    subtotalInPaise: payableBaseInPaise,
    deliveryChargeInPaise: 0,
  }), [classDoc, payableBaseInPaise]);
  const appliedCoupon = useMemo(() => redeemableCoupons.find((c) => c.code === appliedCouponCode) || null, [redeemableCoupons, appliedCouponCode]);
  const couponDiscountInPaise = useMemo(() => {
    if (!appliedCoupon || !couponEligible || payableBaseInPaise <= 0) return 0;
    return calculateCouponDiscount(appliedCoupon, couponContext).discountInPaise;
  }, [appliedCoupon, couponEligible, payableBaseInPaise, couponContext]);
  const discountedAmountInPaise = Math.max(100, payableBaseInPaise - couponDiscountInPaise);

  const applyCoupon = () => {
    const code = normalizeCouponCode(couponInput);
    if (!code) return;
    const coupon = redeemableCoupons.find((item) => item.code === code);
    if (!coupon) { toast({ title: "Coupon not available", description: "This coupon is inactive, hidden, or does not exist.", variant: "destructive" }); return; }
    const eligibility = evaluateCouponEligibility(coupon, couponContext);
    if (!eligibility.eligible) { toast({ title: "Coupon not eligible", description: eligibility.reason || "This coupon cannot be used here.", variant: "destructive" }); return; }
    setAppliedCouponCode(coupon.code);
    setCouponInput("");
    toast({ title: "Coupon applied", description: `${coupon.code} applied.` });
  };

  // Default the track to the first available once the class loads.
  useEffect(() => {
    if (availableTracks.length > 0) setTrack((current) => (current && availableTracks.includes(current) ? current : availableTracks[0]));
  }, [availableTracks]);

  // Default the payment method. Keep the parent's current pick if still valid;
  // otherwise pick the first enabled one — but a NEW student is never defaulted
  // into autopay (they can still choose it), only nudged to pre-pay/cash first.
  useEffect(() => {
    if (displayMethods.length === 0) return;
    setPaymentMethod((current) => {
      if (current && displayMethods.includes(current)) return current;
      if (studentStatus === "new") {
        const nonAutopay = displayMethods.find((method) => method !== "autopay");
        return nonAutopay || displayMethods[0];
      }
      return displayMethods[0];
    });
  }, [displayMethods, studentStatus]);

  // When a parent flips to "New student" while autopay was selected, move them
  // off autopay so they aren't forced into it (requirement 3).
  const handleStudentStatusChange = (next: "new" | "existing") => {
    setStudentStatus(next);
    if (next === "new" && paymentMethod === "autopay") {
      const nonAutopay = displayMethods.find((method) => method !== "autopay");
      if (nonAutopay) setPaymentMethod(nonAutopay);
    }
  };

  const { register, handleSubmit, reset, formState: { errors } } = useForm<EnrollFormValues>({
    resolver: zodResolver(enrollSchema),
    defaultValues: { studentGender: "male" },
  });

  useEffect(() => {
    let active = true;
    if (!id) { setNotFound(true); setLoading(false); return; }
    getClass(id)
      .then((result) => {
        if (!active) return;
        if (!result || !result.active) { setNotFound(true); } else { setClassDoc(result); }
        setLoading(false);
      })
      .catch((error) => {
        console.error("Unable to load class", error);
        if (active) { setNotFound(true); setLoading(false); }
      });
    return () => { active = false; };
  }, [id]);

  // Prefill parent fields from the signed-in profile once known.
  useEffect(() => {
    if (!userProfile) return;
    reset((current) => ({
      ...current,
      parentName: current.parentName || userProfile.username || "",
      parentPhone: current.parentPhone || (userProfile.phone || "").replace(/\D/g, "").slice(-10),
      parentWhatsapp: current.parentWhatsapp || (userProfile.whatsappNumber || "").replace(/\D/g, "").slice(-10),
    }));
  }, [userProfile, reset]);

  const overAfaCap = useMemo(() => (classDoc?.monthlyFeeInPaise || 0) > AUTOPAY_AFA_CAP_IN_PAISE, [classDoc]);

  const onSubmit = async (values: EnrollFormValues) => {
    if (!classDoc || !id) return;
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(`/classes/${id}`)}`);
      return;
    }

    const method = paymentMethod;
    if (!method) {
      toast({ title: "No payment option available", description: "This class has no payment method enabled. Please contact us.", variant: "destructive" });
      return;
    }

    // Slot selection (when the class offers slots).
    let chosenSlot: ClassTimeSlot | undefined;
    if (slots.length > 0) {
      chosenSlot = slots.find((slot) => slot.id === selectedSlotId);
      if (!chosenSlot) {
        toast({ title: "Pick a time slot", description: "Please choose a batch to enrol in.", variant: "destructive" });
        return;
      }
      const left = seatsLeft(chosenSlot);
      if (left !== null && left <= 0) {
        toast({ title: "Slot full", description: "That batch is full. Please pick another slot.", variant: "destructive" });
        return;
      }
    }

    setSubmitting(true);
    let enrollmentId: string | undefined;
    try {
      const installmentPlan = method === "emi" ? buildClassEmiPlan(getClassEmiTotalInPaise(getClassFeeInPaise(classDoc, "term"), emiConfig), emiConfig) : undefined;

      const enrollmentMonthlyFee = method === "autopay" && classDoc && hasAutopayDiscount(classDoc)
        ? getAutopayFeeInPaise(classDoc)
        : classDoc.monthlyFeeInPaise;

      // Advance vs. arrears billing period (client-confirmed rule): "manual"
      // (Advance Fee) pre-pays the current month; every other rail is arrears
      // (start = previous month). Term courses span their full duration, so a
      // 4-month term paid in June (arrears) covers "May to August" and the next
      // charge falls in September. The admin can still adjust nextChargeDate.
      const durationMonths = isTerm ? Math.max(1, classDoc.durationMonths || 1) : 1;
      const billing = computeBillingPeriod(method, new Date(), durationMonths);
      const defaultNextCharge = dueDateFor(billing.nextChargeMonthKey, classDoc.billingDayOfMonth);

      enrollmentId = await createEnrollment({
        parentUserId: user.uid,
        classId: id,
        className: classDoc.name,
        monthlyFeeInPaise: enrollmentMonthlyFee,
        billingDayOfMonth: classDoc.billingDayOfMonth,
        student: { name: values.studentName, age: values.studentAge, gender: values.studentGender },
        parent: {
          name: values.parentName,
          phone: values.parentPhone,
          whatsappNumber: values.parentWhatsapp || values.parentPhone,
          address: values.parentAddress,
        },
        autopayRequested: method === "autopay",
        paymentPlan: method,
        slotId: chosenSlot?.id,
        slotLabel: chosenSlot?.label,
        feeType: isTerm ? "term" : "monthly",
        termFeeInPaise: isTerm ? classDoc.termFeeInPaise : undefined,
        termStartDate: isTerm ? classDoc.startDate : undefined,
        termEndDate: isTerm ? classDoc.endDate : undefined,
        nextChargeDate: defaultNextCharge || undefined,
        billingStartMonth: billing.startMonthKey,
        billingEndMonth: billing.endMonthKey,
        billingPeriodLabel: billing.periodLabel,
        // Existing students on the manual rail pre-pay the current cycle
        // ("advance"). New students pay the standalone Pre-payment instead —
        // their joining month's fee stays owed (due next month, in arrears).
        advancePaid: method === "manual" && studentStatus !== "new" ? true : undefined,
        studentStatus,
        emi: method === "emi" ? emiConfig : undefined,
        installmentPlan,
      });

      // Cash: No payment checkout needed — enrollment stays pending until admin collects cash.
      if (method === "cash") {
        toast({ title: "Enrolment submitted", description: "Please pay in cash at the centre. Your enrolment will be confirmed once the admin collects the payment." });
        navigate("/account/classes");
        return;
      }

      const idToken = await user.getIdToken();
      const prefill = { name: values.parentName, email: user.email || "", contact: values.parentPhone };

      if (method === "autopay") {
        const subscription = await createSubscription(idToken, enrollmentId);
        const mandate = await openSubscriptionCheckout({
          subscriptionId: subscription.subscriptionId,
          keyId: subscription.keyId,
          name: "Javani Spiritual Hub",
          description: `${classDoc.name} — monthly autopay`,
          prefill,
        });
        // Confirm the mandate with the server right away so the enrolment's
        // autopay status reflects immediately instead of waiting on the webhook
        // (which can lag or be missed). Best-effort: the webhook reconciles if
        // this fails, so never block or roll back the enrolment on its error.
        try {
          await confirmSubscription(idToken, {
            enrollmentId,
            razorpay_payment_id: mandate.razorpay_payment_id,
            razorpay_subscription_id: mandate.razorpay_subscription_id,
            razorpay_signature: mandate.razorpay_signature,
          });
        } catch (confirmError) {
          console.error("Autopay confirmation sync failed (webhook will reconcile)", confirmError);
        }
        toast({ title: "Autopay set up", description: `We'll auto-debit the monthly fee and notify you each time.${defaultNextCharge ? ` Next charge: ${formatNiceDate(defaultNextCharge)}.` : ""}` });
        navigate("/account/classes");
      } else if (method === "emi") {
        // EMI stays on Razorpay (auto-pay installments) — client-confirmed.
        await payFeeNow({ idToken, feePaymentIdOrEnrollment: { enrollmentId, kind: "emi", installmentNumber: 1 }, name: "Javani Spiritual Hub", description: `${classDoc.name} — EMI first installment`, prefill });
        toast({ title: "First installment received", description: "Pay the remaining installments from My Classes before their due dates." });
        navigate("/account/classes");
      } else {
        // manual (pre-payment) + full (pay in one shot) → low-commission manual
        // UPI QR + screenshot + admin approval. Open the dialog and let it drive
        // submission; the enrolment stays pending until an admin approves.
        const upiBase = method === "full" ? getTermPayFullPriceInPaise(classDoc) : enrollmentMonthlyFee;
        // Apply the coupon discount to the shown amount; the server re-validates
        // and applies the same coupon authoritatively to the fee doc.
        const upiAmount = couponDiscountInPaise > 0 ? Math.max(100, upiBase - couponDiscountInPaise) : upiBase;
        setUpiDialog({
          open: true,
          target: { enrollmentId, kind: method === "full" ? "full" : "monthly" },
          amount: upiAmount,
          title: `${classDoc.name} — ${method === "full" ? "full course fee" : studentStatus === "new" ? "pre-payment" : "monthly fee"}`,
          couponCode: couponDiscountInPaise > 0 ? appliedCouponCode : undefined,
        });
      }
    } catch (error) {
      console.error("Enrolment failed", error);

      // Clean up the orphaned enrollment if payment was cancelled or failed.
      // For cash enrollments, don't delete — they stay pending for admin to collect.
      if (enrollmentId && method !== "cash") {
        try {
          await deleteEnrollment(enrollmentId);
        } catch (cleanupError) {
          console.error("Failed to clean up enrollment after payment failure", cleanupError);
        }
      }

      toast({
        title: "Enrolment incomplete",
        description: error instanceof Error ? error.message : "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  if (notFound || !classDoc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <GraduationCap className="h-12 w-12 text-gold/60" />
        <h1 className="font-display text-2xl text-foreground">Class not found</h1>
        <p className="font-body text-sm text-muted-foreground">This class may be inactive or no longer available.</p>
        <Link to="/classes" className="rounded-sm bg-gradient-primary px-5 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110">Browse classes</Link>
      </div>
    );
  }

  return (
    <>
      <SEO title={`Enrol — ${classDoc.name} | Javani Spiritual Hub`} description={classDoc.description || `Enrol in ${classDoc.name} and pay the monthly fee online.`} />
      <main>
        <PageHero backgroundImages={[heroTemple]} label="ENROLMENT" heading={classDoc.name} subtext={getClassFeeLabel(classDoc)} size="compact" breadcrumb={[{ label: "Home", path: "/" }, { label: "Classes", path: "/classes" }, { label: "Enrol" }]} />

        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
          <Link to="/classes" className="mb-6 inline-flex items-center gap-2 rounded-sm border border-gold/40 bg-card px-4 py-2 font-body text-sm font-semibold text-gold transition-colors hover:bg-gold hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to classes
          </Link>

          {/* min-w-0 on the grid items: grid items default to min-width:auto, so a
              wide child (e.g. the coupon row) would otherwise push the column
              past the viewport on small screens. */}
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            {/* Enrol form */}
            <form onSubmit={handleSubmit(onSubmit)} className="min-w-0 rounded-2xl border border-gold/15 bg-card p-5 shadow-card sm:p-6">
              <h2 className="font-display text-2xl text-foreground">Student & Parent Details</h2>
              <p className="mt-1 font-body text-sm text-muted-foreground">We use these to set up the enrolment and send fee reminders.</p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Student Name *</label>
                  <input className={inputClass} {...register("studentName")} />
                  {errors.studentName && <p className={errorClass}>{errors.studentName.message}</p>}
                </div>
                <div>
                  <label className={labelClass}>Age *</label>
                  <input className={inputClass} inputMode="numeric" {...register("studentAge")} />
                  {errors.studentAge && <p className={errorClass}>{errors.studentAge.message}</p>}
                </div>
                <div>
                  <label className={labelClass}>Gender *</label>
                  <select className={inputClass} {...register("studentGender")}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                  {errors.studentGender && <p className={errorClass}>{errors.studentGender.message}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Parent / Guardian Name *</label>
                  <input className={inputClass} {...register("parentName")} />
                  {errors.parentName && <p className={errorClass}>{errors.parentName.message}</p>}
                </div>
                <div>
                  <label className={labelClass}>Phone Number *</label>
                  <input className={inputClass} inputMode="numeric" placeholder="10-digit number" {...register("parentPhone")} />
                  {errors.parentPhone && <p className={errorClass}>{errors.parentPhone.message}</p>}
                </div>
                <div>
                  <label className={labelClass}>WhatsApp Number</label>
                  <input className={inputClass} inputMode="numeric" placeholder="If different from phone" {...register("parentWhatsapp")} />
                  {errors.parentWhatsapp && <p className={errorClass}>{errors.parentWhatsapp.message}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Address *</label>
                  <textarea className={inputClass} rows={2} {...register("parentAddress")} />
                  {errors.parentAddress && <p className={errorClass}>{errors.parentAddress.message}</p>}
                </div>
              </div>

              {/* Time slot selection */}
              {slots.length > 0 && (
                <>
                  <h3 className="mt-7 font-display text-lg text-foreground">Choose a time slot</h3>
                  <p className="mt-1 font-body text-[0.8rem] text-muted-foreground">Pick the batch you'd like to join.</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {slots.map((slot) => {
                      const left = seatsLeft(slot);
                      const full = left !== null && left <= 0;
                      const active = selectedSlotId === slot.id;
                      const [dayPart, timePart] = (slot.label || "").split(" · ");
                      return (
                        <button
                          type="button"
                          key={slot.id}
                          disabled={full}
                          onClick={() => setSelectedSlotId(slot.id)}
                          className={`relative flex min-h-[5.5rem] flex-col justify-between gap-3 rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${active ? "border-gold bg-gold/10 ring-1 ring-gold" : "border-border hover:border-gold/50 hover:bg-gold/5"}`}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${active ? "bg-gold text-white" : "bg-gold/15 text-gold"}`}><CalendarDays className="h-4 w-4" /></span>
                            <span className={`rounded-full px-2 py-0.5 font-body text-[0.68rem] font-semibold ${full ? "bg-red-100 text-red-700" : left === null ? "bg-muted text-muted-foreground" : "bg-green-100 text-green-700"}`}>
                              {left === null ? "Open" : full ? "Full" : `${left} seat${left === 1 ? "" : "s"} left`}
                            </span>
                          </span>
                          <span className="block">
                            <span className="block font-body text-[0.92rem] font-semibold leading-snug text-foreground">{dayPart || "Slot"}</span>
                            {timePart && <span className="mt-0.5 block font-body text-[0.8rem] text-muted-foreground">{timePart}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Track selector — only when the class offers both monthly + term */}
              {availableTracks.length > 1 && (
                <>
                  <h3 className="mt-7 font-display text-lg text-foreground">Choose your plan</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {availableTracks.map((option) => {
                      const active = activeTrack === option;
                      const isTermOption = option === "term";
                      return (
                        <button type="button" key={option} onClick={() => setTrack(option)} className={`flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors ${active ? "border-gold bg-gold/10" : "border-border hover:border-gold/40"}`}>
                          <span className="flex items-center gap-2 font-body font-semibold text-foreground">
                            {isTermOption ? <CalendarDays className="h-4 w-4 text-gold" /> : <Repeat className="h-4 w-4 text-gold" />}
                            {isTermOption ? "Term course" : "Monthly"}
                          </span>
                          <span className="font-display text-base font-bold text-primary">{getTrackFeeLabel(classDoc, option)}</span>
                          <span className="font-body text-[0.74rem] text-muted-foreground">
                            {isTermOption ? "Pay once for the whole course (or by EMI)." : "Pay every month — autopay or manual."}
                          </span>
                          {isTermOption && hasTermPayFullOffer(classDoc) && (
                            <span className="mt-0.5 inline-block rounded-full bg-green-100 px-2 py-0.5 font-body text-[0.66rem] font-semibold text-green-700">🎁 {getTermPayFullOfferLabel(classDoc)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* New vs existing student — new students aren't forced into autopay */}
              {enabledMethods.includes("autopay") && (
                <>
                  <h3 className="mt-7 font-display text-lg text-foreground">Is this a new or existing student?</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {(["new", "existing"] as const).map((option) => {
                      const active = studentStatus === option;
                      return (
                        <button
                          type="button"
                          key={option}
                          onClick={() => handleStudentStatusChange(option)}
                          className={`flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors ${active ? "border-gold bg-gold/10" : "border-border hover:border-gold/40"}`}
                        >
                          <span className="flex items-center gap-2 font-body font-semibold text-foreground">
                            {option === "new" ? <GraduationCap className="h-4 w-4 text-gold" /> : <Users className="h-4 w-4 text-gold" />}
                            {option === "new" ? "New student" : "Existing student"}
                          </span>
                          <span className="font-body text-[0.74rem] text-muted-foreground">
                            {option === "new" ? "Start by paying now — set up autopay later." : "Already enrolled — autopay is available."}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {studentStatus === "new" && (
                    <p className="mt-2 font-body text-[0.75rem] text-muted-foreground">You can enable autopay anytime later from <span className="font-semibold">My Classes</span>.</p>
                  )}
                </>
              )}

              {/* Payment method */}
              <h3 className="mt-7 font-display text-lg text-foreground">How would you like to pay?</h3>
              {displayMethods.length === 0 ? (
                <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 font-body text-[0.78rem] text-amber-800">No payment option is set up for this class yet. Please contact us to enrol.</p>
              ) : (
                <div className={`mt-3 grid gap-3 ${displayMethods.length > 1 ? "sm:grid-cols-2" : ""}`}>
                  {displayMethods.map((method) => {
                    const meta = PAYMENT_METHOD_META[method];
                    const Icon = meta.icon;
                    const active = paymentMethod === method;
                    // A NEW student's first Pay Now is a Pre-payment — same flow,
                    // labelled so their history/WhatsApp record it as such (req).
                    const isNewStudentPrepay = method === "manual" && studentStatus === "new" && activeTrack !== "term";
                    const title = isNewStudentPrepay ? "Pre-payment (Pay Now)" : meta.title;
                    const blurb = isNewStudentPrepay
                      ? "Pay the one-time pre-payment to join — this month's fee is then due next month. Scan the QR & upload the receipt, or submit without one to pay at the counter."
                      : meta.blurb;
                    return (
                      <button type="button" key={method} onClick={() => setPaymentMethod(method)} className={`flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors ${active ? "border-gold bg-gold/10" : "border-border hover:border-gold/40"}`}>
                        <span className="flex items-center gap-2 font-body font-semibold text-foreground">
                          <Icon className="h-4 w-4 text-gold" /> {title}
                          {meta.recommended && <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[0.6rem] font-bold uppercase text-gold">Recommended</span>}
                        </span>
                        <span className="font-body text-[0.78rem] text-muted-foreground">{blurb}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Autopay discount banner */}
              {paymentMethod === "autopay" && classDoc && hasAutopayDiscount(classDoc) && (
                <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-4">
                  <p className="font-body text-[0.82rem] font-semibold text-green-800">🎉 Autopay discount applied!</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-body text-[0.78rem] text-muted-foreground line-through">{getClassFeeLabel(classDoc)}</span>
                    <span className="font-display text-lg font-bold text-green-700">{getAutopayFeeLabel(classDoc)}</span>
                  </div>
                  <p className="mt-1 font-body text-[0.72rem] text-green-700">You save ₹{((classDoc.autopayDiscountInPaise || 0) / 100).toLocaleString("en-IN")} every month with autopay.</p>
                </div>
              )}

              {/* Pay-full offer banner */}
              {paymentMethod === "full" && classDoc && hasTermPayFullOffer(classDoc) && (
                <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-4">
                  <p className="font-body text-[0.82rem] font-semibold text-green-800">🎁 {getTermPayFullOfferLabel(classDoc)}!</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-body text-[0.78rem] text-muted-foreground line-through">{formatPaiseAsRupees(classDoc.termFeeInPaise || 0)}</span>
                    <span className="font-display text-lg font-bold text-green-700">{formatPaiseAsRupees(getTermPayFullPriceInPaise(classDoc))}</span>
                  </div>
                  <p className="mt-1 font-body text-[0.72rem] text-green-700">You save ₹{(((classDoc.termFeeInPaise || 0) - getTermPayFullPriceInPaise(classDoc)) / 100).toLocaleString("en-IN")} when you pay the full course fee now.</p>
                </div>
              )}

              {/* EMI schedule preview */}
              {paymentMethod === "emi" && emiPlan && (
                <div className="mt-3 rounded-xl border border-gold/20 bg-gold/5 p-4">
                  <p className="font-body text-[0.82rem] font-semibold text-foreground">EMI schedule</p>
                  {emiSurchargeInPaise > 0 && (
                    <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-1.5 font-body text-[0.74rem]">
                      <span className="text-amber-800">Course fee {formatPaiseAsRupees(getClassFeeInPaise(classDoc, "term"))} + EMI convenience fee</span>
                      <span className="font-semibold text-amber-800">+{formatPaiseAsRupees(emiSurchargeInPaise)}</span>
                    </div>
                  )}
                  <div className="mt-2 space-y-1 font-body text-[0.78rem] text-muted-foreground">
                    <div className="flex justify-between gap-3"><span>Pay now ({emiConfig.upfrontPercentage}%)</span><span className="font-semibold text-gold">{formatPaiseAsRupees(emiPlan.initialPaymentInPaise)}</span></div>
                    {emiPlan.installments.slice(1).map((inst) => (
                      <div key={inst.installmentNumber} className="flex justify-between gap-3"><span>{inst.label} on {inst.dueDate}</span><span className="font-semibold">{formatPaiseAsRupees(inst.amountInPaise)}</span></div>
                    ))}
                    <div className="mt-1 flex justify-between gap-3 border-t border-gold/20 pt-1.5"><span className="font-semibold text-foreground">EMI total</span><span className="font-semibold text-foreground">{formatPaiseAsRupees(emiPlan.totalInPaise)}</span></div>
                  </div>
                  <p className="mt-2 font-body text-[0.72rem] text-muted-foreground">Remaining installments can be paid from <span className="font-semibold">My Classes</span> before each due date.</p>
                </div>
              )}

              {paymentMethod === "autopay" && overAfaCap && (
                <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 font-body text-[0.78rem] text-amber-800">
                  This fee is above ₹15,000, so each auto-debit needs an OTP confirmation (RBI rule). You may prefer "Pay monthly".
                </p>
              )}

              {/* Coupon code — applies to pre-payment & pay-full (paid by UPI) */}
              {couponEligible && payableBaseInPaise > 0 && (
                <div className="mt-4 rounded-xl border border-gold/20 bg-gold/5 p-4">
                  <p className="font-body text-[0.82rem] font-semibold text-foreground">Have a coupon?</p>
                  {appliedCoupon && couponDiscountInPaise > 0 ? (
                    <div className="mt-2">
                      <div className="flex items-center justify-between gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2">
                        <span className="font-body text-[0.82rem] font-semibold text-green-800">🎉 {appliedCoupon.code} applied — you save {formatPaiseAsRupees(couponDiscountInPaise)}</span>
                        <button type="button" onClick={() => setAppliedCouponCode("")} className="font-body text-xs font-semibold text-destructive hover:underline">Remove</button>
                      </div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="font-body text-[0.8rem] text-muted-foreground">Total to pay</span>
                        <span className="flex items-baseline gap-2">
                          <span className="font-body text-[0.78rem] text-muted-foreground line-through">{formatPaiseAsRupees(payableBaseInPaise)}</span>
                          <span className="font-display text-lg font-bold text-green-700">{formatPaiseAsRupees(discountedAmountInPaise)}</span>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex min-w-0 gap-2">
                      <input
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }}
                        placeholder="Enter coupon code"
                        size={1}
                        className="h-10 w-full min-w-0 flex-1 rounded-md border border-border bg-background px-3 font-body text-sm uppercase outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
                      />
                      <button type="button" onClick={applyCoupon} disabled={!couponInput.trim()} className="shrink-0 rounded-md bg-gold px-4 font-body text-sm font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-50">Apply</button>
                    </div>
                  )}
                </div>
              )}

              <button type="submit" disabled={submitting || displayMethods.length === 0} className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-sm bg-gradient-primary px-4 py-3 font-body text-[0.9rem] font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60">
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                  : paymentMethod === "autopay" ? "Enrol & Set Up Autopay"
                  : paymentMethod === "full" ? "Enrol & Pay Full Fee"
                  : paymentMethod === "emi" ? "Enrol & Pay First Installment"
                  : paymentMethod === "cash" ? "Enrol & Pay Cash"
                  : studentStatus === "new" && activeTrack !== "term" ? "Enrol & Pre-pay Now"
                  : "Enrol & Pay Now"}
              </button>
              {!user && <p className="mt-2 text-center font-body text-[0.78rem] text-muted-foreground">You'll be asked to sign in to complete enrolment.</p>}
            </form>

            {/* Class summary */}
            <aside className="h-fit min-w-0 rounded-2xl border border-gold/15 bg-card p-5 shadow-card lg:sticky lg:top-28">
              {classDoc.image && (
                <div className="group relative mb-4 cursor-zoom-in overflow-hidden rounded-lg" onClick={() => setViewerOpen(true)}>
                  <img src={classDoc.image} alt={classDoc.name} className="aspect-square w-full object-cover" />
                  <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 font-body text-[0.7rem] text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <Maximize2 className="h-3.5 w-3.5" /> View full
                  </span>
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-xl text-foreground">{classDoc.name}</h3>
                <ShareButton
                  title={classDoc.name}
                  text={`Check out *${classDoc.name}* at Javani Spiritual Hub — *${getClassFeeLabel(classDoc)}*`}
                  url={`/classes/${classDoc.id}`}
                  imageUrl={classDoc.image}
                />
              </div>
              {classDoc.description && <p className="mt-2 font-body text-sm text-muted-foreground">{classDoc.description}</p>}
              <div className="mt-4 space-y-2 font-body text-sm text-muted-foreground">
                {classDoc.schedule && <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-gold" /> {classDoc.schedule}</p>}
                {classDoc.ageGroup && <p className="flex items-center gap-2"><Users className="h-4 w-4 text-gold" /> {classDoc.ageGroup}</p>}
                {classDoc.facultyName && <p className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-gold" /> {classDoc.facultyName}</p>}
                {isTerm
                  ? <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-gold" /> {classDoc.startDate || "?"} → {classDoc.endDate || "?"}{classDoc.durationMonths ? ` · ${classDoc.durationMonths} mo` : ""}</p>
                  : <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-gold" /> Billed on day {classDoc.billingDayOfMonth} each month</p>}
              </div>
              <div className="mt-4 rounded-xl bg-gold/10 p-4">
                <p className="font-body text-xs uppercase tracking-wider text-muted-foreground">{isTerm ? "Course fee" : "Monthly fee"}</p>
                <p className="font-display text-2xl font-bold text-primary">{activeTrack ? getTrackFeeLabel(classDoc, activeTrack) : getClassFeeLabel(classDoc)}</p>
                {!isTerm && hasAutopayDiscount(classDoc) && (
                  <div className="mt-2 rounded-lg bg-green-100/70 px-3 py-2">
                    <p className="font-body text-xs uppercase tracking-wider text-green-800">With Autopay</p>
                    <p className="font-display text-lg font-bold text-green-700">{getAutopayFeeLabel(classDoc)}</p>
                    <p className="font-body text-[0.7rem] text-green-700">Save ₹{((classDoc.autopayDiscountInPaise || 0) / 100).toLocaleString("en-IN")}/mo</p>
                  </div>
                )}
                {isTerm && hasTermPayFullOffer(classDoc) && (
                  <div className="mt-2 rounded-lg bg-green-100/70 px-3 py-2">
                    <p className="font-body text-xs uppercase tracking-wider text-green-800">Pay full</p>
                    <p className="font-display text-lg font-bold text-green-700">{formatPaiseAsRupees(getTermPayFullPriceInPaise(classDoc))}</p>
                    <p className="font-body text-[0.7rem] text-green-700">{getTermPayFullOfferLabel(classDoc)}</p>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
      {classDoc.image && <ImageViewer images={[classDoc.image]} isOpen={viewerOpen} onClose={() => setViewerOpen(false)} />}
      <UpiPaymentDialog
        open={Boolean(upiDialog?.open)}
        target={upiDialog?.target || null}
        amountInPaise={upiDialog?.amount || 0}
        title={upiDialog?.title || classDoc.name}
        couponCode={upiDialog?.couponCode}
        onClose={() => { setUpiDialog(null); navigate("/account/classes"); }}
        onSuccess={() => { setUpiDialog(null); navigate("/account/classes"); }}
      />
    </>
  );
};

export default ClassDetail;
