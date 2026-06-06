import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Banknote, CalendarDays, CreditCard, GraduationCap, Loader2, Repeat, Users, Wallet } from "lucide-react";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SEO from "@/components/SEO";
import ShareButton from "@/components/ShareButton";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import {
  AUTOPAY_AFA_CAP_IN_PAISE,
  buildClassEmiPlan,
  classTracks,
  confirmSubscription,
  createEnrollment,
  createSubscription,
  DEFAULT_CLASS_EMI_CONFIG,
  deleteEnrollment,
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
  manual: { title: "Advance Fee", blurb: "Pay this cycle now as an advance. We'll show your next charge date; pay later months from My Classes.", icon: Wallet },
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
  const [track, setTrack] = useState<ClassTrack | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const availableTracks = useMemo(() => (classDoc ? classTracks(classDoc) : []), [classDoc]);
  // The active track: the parent's choice, or the only available one.
  const activeTrack: ClassTrack | null = track && availableTracks.includes(track) ? track : availableTracks[0] || null;
  const enabledMethods = useMemo(
    () => (classDoc && activeTrack ? getPaymentMethodsForTrack(classDoc, activeTrack) : []),
    [classDoc, activeTrack],
  );
  const slots = useMemo(() => classDoc?.timeSlots || [], [classDoc]);
  const isTerm = activeTrack === "term";
  const emiConfig = classDoc?.emi || DEFAULT_CLASS_EMI_CONFIG;
  const emiPlan = useMemo(
    () => (classDoc && isTerm ? buildClassEmiPlan(getClassFeeInPaise(classDoc, "term"), emiConfig) : null),
    [classDoc, isTerm, emiConfig],
  );

  // Default the track to the first available once the class loads.
  useEffect(() => {
    if (availableTracks.length > 0) setTrack((current) => (current && availableTracks.includes(current) ? current : availableTracks[0]));
  }, [availableTracks]);

  // Default the payment method to the first enabled one for the active track.
  useEffect(() => {
    if (enabledMethods.length > 0) setPaymentMethod((current) => (current && enabledMethods.includes(current) ? current : enabledMethods[0]));
  }, [enabledMethods]);

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
      const installmentPlan = method === "emi" ? buildClassEmiPlan(getClassFeeInPaise(classDoc, "term"), emiConfig) : undefined;

      const enrollmentMonthlyFee = method === "autopay" && classDoc && hasAutopayDiscount(classDoc)
        ? getAutopayFeeInPaise(classDoc)
        : classDoc.monthlyFeeInPaise;

      // A sensible default next charge date the admin can later adjust: the
      // course start for term enrolments, else the 1st of next month (monthly
      // billing now runs 1st-to-month-end).
      const now = new Date();
      const firstOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
      const defaultNextCharge = isTerm ? (classDoc.startDate || "") : firstOfNextMonth;

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
        // "Advance Fee" = the manual monthly option pays this cycle upfront.
        advancePaid: method === "manual" ? true : undefined,
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
      } else if (method === "full") {
        await payFeeNow({ idToken, feePaymentIdOrEnrollment: { enrollmentId, kind: "full" }, name: "Javani Spiritual Hub", description: `${classDoc.name} — full course fee`, prefill });
        toast({ title: "Payment received", description: "Your course fee is being confirmed." });
      } else if (method === "emi") {
        await payFeeNow({ idToken, feePaymentIdOrEnrollment: { enrollmentId, kind: "emi", installmentNumber: 1 }, name: "Javani Spiritual Hub", description: `${classDoc.name} — EMI first installment`, prefill });
        toast({ title: "First installment received", description: "Pay the remaining installments from My Classes before their due dates." });
      } else {
        await payFeeNow({ idToken, feePaymentIdOrEnrollment: { enrollmentId, kind: "monthly" }, name: "Javani Spiritual Hub", description: `${classDoc.name} — advance fee`, prefill });
        toast({ title: "Advance paid", description: `Your advance fee is being confirmed.${defaultNextCharge ? ` Next charge: ${formatNiceDate(defaultNextCharge)}.` : ""}` });
      }

      navigate("/account/classes");
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

          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            {/* Enrol form */}
            <form onSubmit={handleSubmit(onSubmit)} className="rounded-2xl border border-gold/15 bg-card p-5 shadow-card sm:p-6">
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

              {/* Payment method */}
              <h3 className="mt-7 font-display text-lg text-foreground">How would you like to pay?</h3>
              {enabledMethods.length === 0 ? (
                <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 font-body text-[0.78rem] text-amber-800">No payment option is set up for this class yet. Please contact us to enrol.</p>
              ) : (
                <div className={`mt-3 grid gap-3 ${enabledMethods.length > 1 ? "sm:grid-cols-2" : ""}`}>
                  {enabledMethods.map((method) => {
                    const meta = PAYMENT_METHOD_META[method];
                    const Icon = meta.icon;
                    const active = paymentMethod === method;
                    return (
                      <button type="button" key={method} onClick={() => setPaymentMethod(method)} className={`flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors ${active ? "border-gold bg-gold/10" : "border-border hover:border-gold/40"}`}>
                        <span className="flex items-center gap-2 font-body font-semibold text-foreground">
                          <Icon className="h-4 w-4 text-gold" /> {meta.title}
                          {meta.recommended && <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[0.6rem] font-bold uppercase text-gold">Recommended</span>}
                        </span>
                        <span className="font-body text-[0.78rem] text-muted-foreground">{meta.blurb}</span>
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
                  <div className="mt-2 space-y-1 font-body text-[0.78rem] text-muted-foreground">
                    <div className="flex justify-between gap-3"><span>Pay now ({emiConfig.upfrontPercentage}%)</span><span className="font-semibold text-gold">{formatPaiseAsRupees(emiPlan.initialPaymentInPaise)}</span></div>
                    {emiPlan.installments.slice(1).map((inst) => (
                      <div key={inst.installmentNumber} className="flex justify-between gap-3"><span>{inst.label} on {inst.dueDate}</span><span className="font-semibold">{formatPaiseAsRupees(inst.amountInPaise)}</span></div>
                    ))}
                  </div>
                  <p className="mt-2 font-body text-[0.72rem] text-muted-foreground">Remaining installments can be paid from <span className="font-semibold">My Classes</span> before each due date.</p>
                </div>
              )}

              {paymentMethod === "autopay" && overAfaCap && (
                <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 font-body text-[0.78rem] text-amber-800">
                  This fee is above ₹15,000, so each auto-debit needs an OTP confirmation (RBI rule). You may prefer "Pay monthly".
                </p>
              )}

              <button type="submit" disabled={submitting || enabledMethods.length === 0} className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-sm bg-gradient-primary px-4 py-3 font-body text-[0.9rem] font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60">
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                  : paymentMethod === "autopay" ? "Enrol & Set Up Autopay"
                  : paymentMethod === "full" ? "Enrol & Pay Full Fee"
                  : paymentMethod === "emi" ? "Enrol & Pay First Installment"
                  : paymentMethod === "cash" ? "Enrol & Pay Cash"
                  : "Enrol & Pay Advance"}
              </button>
              {!user && <p className="mt-2 text-center font-body text-[0.78rem] text-muted-foreground">You'll be asked to sign in to complete enrolment.</p>}
            </form>

            {/* Class summary */}
            <aside className="h-fit rounded-2xl border border-gold/15 bg-card p-5 shadow-card lg:sticky lg:top-28">
              {classDoc.image && <img src={classDoc.image} alt={classDoc.name} className="mb-4 h-40 w-full rounded-lg object-cover" />}
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
    </>
  );
};

export default ClassDetail;
