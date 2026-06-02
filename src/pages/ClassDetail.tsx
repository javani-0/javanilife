import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, CalendarDays, CreditCard, GraduationCap, Loader2, Repeat, Users, Wallet } from "lucide-react";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SEO from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import {
  AUTOPAY_AFA_CAP_IN_PAISE,
  buildClassEmiPlan,
  createEnrollment,
  createSubscription,
  DEFAULT_CLASS_EMI_CONFIG,
  getClass,
  getClassFeeInPaise,
  getClassFeeLabel,
  getEnabledPaymentMethods,
  openSubscriptionCheckout,
  payFeeNow,
  type ClassDoc,
  type ClassPaymentMethod,
  type ClassTimeSlot,
} from "@/lib/classes";
import heroTemple from "@/assets/hero-temple.jpg";

const PAYMENT_METHOD_META: Record<ClassPaymentMethod, { title: string; blurb: string; icon: typeof Repeat; recommended?: boolean }> = {
  autopay: { title: "Autopay", blurb: "Authorise once; the fee is auto-debited each month. We notify you on every debit.", icon: Repeat, recommended: true },
  manual: { title: "Pay monthly", blurb: "Pay each month yourself from your account. We'll remind you before the due date.", icon: Wallet },
  full: { title: "Pay Full", blurb: "Pay the entire course fee once. No further payments.", icon: Wallet },
  emi: { title: "EMI", blurb: "Pay a part upfront now, then the rest in installments. We'll remind you before each due date.", icon: CreditCard },
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
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const enabledMethods = useMemo(() => (classDoc ? getEnabledPaymentMethods(classDoc) : []), [classDoc]);
  const slots = useMemo(() => classDoc?.timeSlots || [], [classDoc]);
  const isTerm = classDoc?.feeType === "term";
  const emiConfig = classDoc?.emi || DEFAULT_CLASS_EMI_CONFIG;
  const emiPlan = useMemo(
    () => (classDoc && isTerm ? buildClassEmiPlan(getClassFeeInPaise(classDoc), emiConfig) : null),
    [classDoc, isTerm, emiConfig],
  );

  // Default the payment method to the first enabled one once the class loads.
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
    try {
      const installmentPlan = method === "emi" ? buildClassEmiPlan(getClassFeeInPaise(classDoc), emiConfig) : undefined;

      const enrollmentId = await createEnrollment({
        parentUserId: user.uid,
        classId: id,
        className: classDoc.name,
        monthlyFeeInPaise: classDoc.monthlyFeeInPaise,
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
        feeType: classDoc.feeType,
        termFeeInPaise: isTerm ? classDoc.termFeeInPaise : undefined,
        emi: method === "emi" ? emiConfig : undefined,
        installmentPlan,
      });

      const idToken = await user.getIdToken();
      const prefill = { name: values.parentName, email: user.email || "", contact: values.parentPhone };

      if (method === "autopay") {
        const subscription = await createSubscription(idToken, enrollmentId);
        await openSubscriptionCheckout({
          subscriptionId: subscription.subscriptionId,
          keyId: subscription.keyId,
          name: "Javani Spiritual Hub",
          description: `${classDoc.name} — monthly autopay`,
          prefill,
        });
        toast({ title: "Autopay set up", description: "We'll auto-debit the monthly fee and notify you each time." });
      } else if (method === "full") {
        await payFeeNow({ idToken, feePaymentIdOrEnrollment: { enrollmentId, kind: "full" }, name: "Javani Spiritual Hub", description: `${classDoc.name} — full course fee`, prefill });
        toast({ title: "Payment received", description: "Your course fee is being confirmed." });
      } else if (method === "emi") {
        await payFeeNow({ idToken, feePaymentIdOrEnrollment: { enrollmentId, kind: "emi", installmentNumber: 1 }, name: "Javani Spiritual Hub", description: `${classDoc.name} — EMI first installment`, prefill });
        toast({ title: "First installment received", description: "Pay the remaining installments from My Classes before their due dates." });
      } else {
        await payFeeNow({ idToken, feePaymentIdOrEnrollment: { enrollmentId, kind: "monthly" }, name: "Javani Spiritual Hub", description: `${classDoc.name} — first month fee`, prefill });
        toast({ title: "Payment received", description: "Your first month's fee is being confirmed." });
      }

      navigate("/account/classes");
    } catch (error) {
      console.error("Enrolment failed", error);
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
                  : "Enrol & Pay First Month"}
              </button>
              {!user && <p className="mt-2 text-center font-body text-[0.78rem] text-muted-foreground">You'll be asked to sign in to complete enrolment.</p>}
            </form>

            {/* Class summary */}
            <aside className="h-fit rounded-2xl border border-gold/15 bg-card p-5 shadow-card lg:sticky lg:top-28">
              {classDoc.image && <img src={classDoc.image} alt={classDoc.name} className="mb-4 h-40 w-full rounded-lg object-cover" />}
              <h3 className="font-display text-xl text-foreground">{classDoc.name}</h3>
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
                <p className="font-display text-2xl font-bold text-primary">{getClassFeeLabel(classDoc)}</p>
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
