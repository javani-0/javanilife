import { useEffect, useId, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Check, CheckCircle2, Copy, CreditCard, ExternalLink, Gift, ImagePlus, Loader2, Plus, QrCode, ShieldCheck, TicketPercent, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import { optimizeImageUrl } from "@/lib/cloudinary";
import { availablePaymentModes, buyCourseWithRazorpay, hasActiveAccess, previewElearnCoupon, submitElearnUpi, type ElearnCouponPreview, type ElearnCourse, type PaymentModes } from "@/lib/elearning";
import { uploadPaymentProof } from "@/lib/classes/upiPayments";
import { buildUpiIntentUrl, type PaymentSettings } from "@/lib/settings/paymentSettings";
import { isMobileDevice, isValidUtr, normalizeUtr } from "./format";
import { useMyEnrollments, usePublishedCourses } from "./useElearn";

const MAX_PROOF_BYTES = 8 * 1024 * 1024;
/** The server accepts up to 5 master classes in one payment. */
const MAX_TOGETHER = 5;
const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);
const purchaseLabel = (courses: ElearnCourse[]) => (courses.length === 1 ? courses[0].title : `${courses.length} master classes`);

/** Razorpay purchase (create order → checkout → verify), with an optional coupon the server re-checks. */
export const usePayOnline = (course: ElearnCourse | null, isDemo = false) => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [paying, setPaying] = useState(false);

  /** `courses` = everything bought together (the page's course first). */
  const pay = async (couponCode?: string | null, courses?: ElearnCourse[]) => {
    const list = courses?.length ? courses : course ? [course] : [];
    if (!list.length || !user || paying) return;
    if (import.meta.env.DEV && isDemo) {
      toast({ title: "Sample course", description: "Online payment is turned off in demo mode." });
      return;
    }
    setPaying(true);
    try {
      const idToken = await user.getIdToken();
      const result = await buyCourseWithRazorpay({
        idToken,
        courseIds: list.map((item) => item.id),
        couponCode: couponCode || null,
        prefill: { name: userProfile?.username || user.displayName || "", email: userProfile?.email || user.email || "", contact: userProfile?.phone || "" },
        themeColor: "#8B1A1A",
      });
      if (result.verified) {
        toast({
          title: result.free ? "Unlocked with your coupon" : "You're enrolled",
          description: `${purchaseLabel(list)} ${list.length === 1 ? "is" : "are"} unlocked. Enjoy learning.`,
        });
        navigate(list.length === 1 ? `/learn/${encodeURIComponent(list[0].id)}/watch` : "/account/learning");
      } else {
        toast({ title: "Payment received", description: "We're confirming it. The master class unlocks here as soon as it's done." });
      }
    } catch (error) {
      const message = errorMessage(error, "The payment didn't go through. You can try again.");
      const cancelled = /cancel/i.test(message);
      toast({
        title: cancelled ? "Payment not completed" : "Payment failed",
        description: cancelled ? "You closed the payment window. Nothing was charged. You can try again any time." : message,
        variant: cancelled ? undefined : "destructive",
      });
    } finally {
      setPaying(false);
    }
  };

  return { pay, paying };
};

interface BuyCourseDialogProps {
  course: ElearnCourse;
  modes: PaymentModes;
  settings: PaymentSettings;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Starts the Razorpay checkout (the dialog closes first so checkout gets focus). A 100% coupon unlocks at once. */
  onPayOnline: (couponCode: string | null, courses: ElearnCourse[]) => void;
  isDemo?: boolean;
}

type Step = "choose" | "upi" | "submitted";

const BuyCourseDialog = ({ course, modes, settings, open, onOpenChange, onPayOnline, isDemo = false }: BuyCourseDialogProps) => {
  const [step, setStep] = useState<Step>("choose");
  const [coupon, setCoupon] = useState<ElearnCouponPreview | null>(null);
  const [extras, setExtras] = useState<ElearnCourse[]>([]);

  useEffect(() => {
    if (open) setStep("choose");
  }, [open]);
  useEffect(() => setExtras([]), [course.id]);

  const courses = useMemo(() => [course, ...extras], [course, extras]);
  // Every master class in the purchase must allow the payment mode.
  const combined = useMemo<PaymentModes>(() => extras.reduce(
    (acc, item) => {
      const m = availablePaymentModes(item, settings);
      return { razorpay: acc.razorpay && m.razorpay, upi: acc.upi && m.upi };
    },
    modes,
  ), [extras, modes, settings]);
  const listPrice = courses.reduce((sum, item) => sum + item.priceInPaise, 0);
  const payable = coupon ? coupon.finalInPaise : listPrice;
  const free = !!coupon?.free;
  const idsKey = courses.map((item) => `${item.id}:${item.priceInPaise}`).join(",");

  // A coupon was checked for one set of master classes; a change needs a new check.
  useEffect(() => setCoupon(null), [idsKey]);

  const toggleExtra = (item: ElearnCourse) => setExtras((list) => (
    list.some((x) => x.id === item.id) ? list.filter((x) => x.id !== item.id) : [...list, item].slice(0, MAX_TOGETHER - 1)
  ));

  const choosePayOnline = () => {
    onOpenChange(false);
    const code = coupon?.couponCode || null;
    // Let the dialog release focus before Razorpay opens its own window.
    window.setTimeout(() => onPayOnline(code, courses), 120);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto rounded-2xl border-gold/20 p-0 sm:rounded-2xl">
        {step === "choose" && (
          <div className="p-6 sm:p-7">
            <DialogHeader className="text-left">
              <DialogTitle className="font-display text-2xl font-semibold text-foreground">
                {free ? "Free with your coupon" : courses.length > 1 ? `Buy ${courses.length} master classes` : combined.razorpay && combined.upi ? "How would you like to pay?" : "Buy this master class"}
              </DialogTitle>
              <DialogDescription className="font-body text-sm text-muted-foreground">
                {purchaseLabel(courses)} ·{" "}
                {coupon && <span className="mr-1 line-through">{formatPaiseAsRupees(listPrice)}</span>}
                <span className="font-semibold text-foreground">{free ? "Free" : formatPaiseAsRupees(payable)}</span>
              </DialogDescription>
            </DialogHeader>
            {open && <AddMore course={course} extras={extras} modes={modes} combined={combined} settings={settings} onToggle={toggleExtra} />}
            <CouponBox courseIds={courses.map((item) => item.id)} applied={coupon} onChange={setCoupon} isDemo={isDemo} />
            <div className="mt-5 grid gap-3">
              {free ? (
                <button
                  type="button"
                  onClick={choosePayOnline}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-gradient-primary font-body text-sm font-semibold text-primary-foreground shadow-gold transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.98]"
                >
                  <Gift className="h-4 w-4" aria-hidden="true" /> Get it free
                </button>
              ) : (
                <>
                  {combined.razorpay && <button
                    type="button"
                    onClick={choosePayOnline}
                    className="group flex w-full items-start gap-4 rounded-xl border border-primary/25 bg-card p-4 text-left transition-[border-color,box-shadow,transform] duration-150 hover:border-primary hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.99]"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><CreditCard className="h-5 w-5" aria-hidden="true" /></span>
                    <span>
                      <span className="block font-body text-[0.95rem] font-semibold text-foreground">Pay online · {formatPaiseAsRupees(payable)}</span>
                      <span className="mt-0.5 block font-body text-[0.82rem] text-muted-foreground">UPI apps, cards, netbanking</span>
                      <span className="mt-1.5 inline-flex items-center gap-1 font-body text-[0.78rem] font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Instant access</span>
                    </span>
                  </button>}
                  {combined.upi && <button
                    type="button"
                    onClick={() => setStep("upi")}
                    className="group flex w-full items-start gap-4 rounded-xl border border-gold/30 bg-card p-4 text-left transition-[border-color,box-shadow,transform] duration-150 hover:border-primary hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.99]"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ivory text-primary ring-1 ring-gold/40"><QrCode className="h-5 w-5" aria-hidden="true" /></span>
                    <span>
                      <span className="block font-body text-[0.95rem] font-semibold text-foreground">Scan QR &amp; upload screenshot</span>
                      <span className="mt-0.5 block font-body text-[0.82rem] text-muted-foreground">Pay from any UPI app, then send us the screenshot</span>
                      <span className="mt-1.5 block font-body text-[0.78rem] font-medium text-muted-foreground">Unlocked after we verify</span>
                    </span>
                  </button>}
                </>
              )}
            </div>
            {!free && combined.razorpay && <p className="mt-5 flex items-center gap-1.5 font-body text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Online payments are processed securely by Razorpay.</p>}
          </div>
        )}

        {step === "upi" && (
          <UpiPanel courses={courses} listPrice={listPrice} settings={settings} coupon={coupon} onBack={() => setStep("choose")} onSubmitted={() => setStep("submitted")} isDemo={isDemo} />
        )}

        {step === "submitted" && (
          <div className="p-6 text-center sm:p-8">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-7 w-7" aria-hidden="true" /></span>
            <DialogTitle className="mt-4 font-display text-2xl font-semibold text-foreground">Payment submitted</DialogTitle>
            <DialogDescription className="mx-auto mt-2 max-w-sm font-body text-sm leading-relaxed text-muted-foreground">
              Thank you. We'll check your payment and unlock {courses.length === 1 ? course.title : `your ${courses.length} master classes`}. You'll see {courses.length === 1 ? "it" : "them"} in My Learning as soon as it's verified.
            </DialogDescription>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <Link
                to="/account/learning"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.97]"
              >
                Go to My Learning
              </Link>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-gold/30 px-4 font-body text-sm font-semibold text-foreground hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ── Add more master classes (bought together: one payment, one coupon) ─────
interface AddMoreProps {
  course: ElearnCourse;
  extras: ElearnCourse[];
  modes: PaymentModes;
  combined: PaymentModes;
  settings: PaymentSettings;
  onToggle: (course: ElearnCourse) => void;
}

const AddMore = ({ course, extras, modes, combined, settings, onToggle }: AddMoreProps) => {
  const { courses } = usePublishedCourses();
  const { enrollments } = useMyEnrollments();
  const options = useMemo(() => {
    const blocked = new Set(enrollments
      .filter((e) => hasActiveAccess(e) || e.status === "processing" || e.status === "revoked")
      .map((e) => e.courseId));
    return courses.filter((item) => {
      if (item.id === course.id || item.priceInPaise <= 0 || blocked.has(item.id)) return false;
      const m = availablePaymentModes(item, settings);
      return (modes.razorpay && m.razorpay) || (modes.upi && m.upi);
    });
  }, [courses, enrollments, course.id, modes, settings]);

  if (!options.length) return null;
  const full = extras.length >= MAX_TOGETHER - 1;

  return (
    <fieldset className="mt-5">
      <legend className="font-body text-sm font-semibold text-foreground">Add more master classes</legend>
      <p className="mt-0.5 font-body text-xs text-muted-foreground">Buy them together in one payment.</p>
      <ul className="mt-2.5 grid gap-2">
        {options.map((item) => {
          const picked = extras.some((x) => x.id === item.id);
          const m = availablePaymentModes(item, settings);
          // Adding it must leave at least one way to pay for everything.
          const fits = (combined.razorpay && m.razorpay) || (combined.upi && m.upi);
          const disabled = !picked && (full || !fits);
          return (
            <li key={item.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={picked}
                disabled={disabled}
                onClick={() => onToggle(item)}
                className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-[border-color,background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${picked ? "border-primary bg-primary/5" : "border-gold/25 bg-card hover:border-primary/60"}`}
              >
                {item.coverImageUrl ? (
                  <img src={optimizeImageUrl(item.coverImageUrl, 160)} alt="" loading="lazy" className="h-11 w-16 shrink-0 rounded-md object-cover ring-1 ring-black/5" />
                ) : (
                  <span className="h-11 w-16 shrink-0 rounded-md bg-muted" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block font-body text-[0.85rem] font-semibold leading-snug text-foreground">{item.title}</span>
                  <span className="block font-body text-xs text-muted-foreground">{formatPaiseAsRupees(item.priceInPaise)}{!fits && !picked ? " · pay for this one separately" : ""}</span>
                </span>
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${picked ? "bg-primary text-primary-foreground" : "border border-gold/40 text-primary"}`} aria-hidden="true">
                  {picked ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
};

// ── Coupon code box (the server checks the code and returns the new price) ──
interface CouponBoxProps {
  courseIds: string[];
  applied: ElearnCouponPreview | null;
  onChange: (coupon: ElearnCouponPreview | null) => void;
  isDemo: boolean;
}

const CouponBox = ({ courseIds, applied, onChange, isDemo }: CouponBoxProps) => {
  const { user } = useAuth();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const apply = async () => {
    const clean = code.trim().toUpperCase();
    if (!clean || checking || !user) return;
    setChecking(true);
    setError("");
    try {
      if (import.meta.env.DEV && isDemo) throw new Error("Coupons work on live courses only (demo mode).");
      const result = await previewElearnCoupon(await user.getIdToken(), courseIds, clean);
      onChange(result);
      setCode("");
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err, "We couldn't check this coupon. Please try again."));
    } finally {
      setChecking(false);
    }
  };

  if (applied) {
    return (
      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-600/30 bg-emerald-50 px-3 py-2.5 dark:bg-emerald-950/30">
        <p className="min-w-0 font-body text-sm text-emerald-800 dark:text-emerald-300">
          <TicketPercent className="mr-1.5 inline h-4 w-4 align-[-3px]" aria-hidden="true" />
          <span className="font-semibold">{applied.couponCode}</span> applied · you save {formatPaiseAsRupees(applied.discountInPaise)}
        </p>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-emerald-800 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-emerald-300 dark:hover:bg-emerald-900/40"
        >
          <X className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Remove coupon</span>
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex min-h-9 items-center gap-1.5 rounded font-body text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <TicketPercent className="h-4 w-4" aria-hidden="true" /> Have a coupon code?
      </button>
    );
  }

  return (
    <div className="mt-4">
      <label htmlFor={inputId} className="block font-body text-sm font-semibold text-foreground">Coupon code</label>
      <div className="mt-1.5 flex gap-2">
        <input
          id={inputId}
          value={code}
          onChange={(event) => { setCode(event.target.value.toUpperCase()); setError(""); }}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void apply(); } }}
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={40}
          autoFocus
          placeholder="e.g. GURU10"
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="h-11 min-w-0 flex-1 rounded-lg border border-gold/30 bg-card px-3 font-body text-sm uppercase tracking-wide text-foreground placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-[invalid=true]:border-destructive"
        />
        <button
          type="button"
          onClick={() => void apply()}
          disabled={!code.trim() || checking}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 font-body text-sm font-semibold text-primary-foreground transition-[transform,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checking && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Apply
        </button>
      </div>
      {error && <p id={`${inputId}-error`} role="alert" className="mt-1.5 font-body text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
};


interface UpiPanelProps {
  courses: ElearnCourse[];
  listPrice: number;
  settings: PaymentSettings;
  coupon: ElearnCouponPreview | null;
  onBack: () => void;
  onSubmitted: () => void;
  isDemo: boolean;
}

const UpiPanel = ({ courses, listPrice, settings, coupon, onBack, onSubmitted, isDemo }: UpiPanelProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileId = useId();
  const utrId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [fileError, setFileError] = useState("");
  const [utr, setUtr] = useState("");
  const [utrTouched, setUtrTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const upiId = settings.upiId.trim();
  const payee = settings.upiName.trim() || "Javani Spiritual Hub";
  const amount = coupon ? coupon.finalInPaise : listPrice;
  const upiUrl = upiId ? buildUpiIntentUrl({ upiId, name: payee, amountInPaise: amount, note: purchaseLabel(courses).slice(0, 50) }) : "";
  const utrValid = isValidUtr(utr);
  const canSubmit = !!file && utrValid && !submitting;

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: "Couldn't copy", description: value });
    }
  };

  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    event.target.value = "";
    setFileError("");
    if (!next) return;
    if (!next.type.startsWith("image/")) { setFileError("Please choose an image (a screenshot of the payment)."); return; }
    if (next.size > MAX_PROOF_BYTES) { setFileError("This image is larger than 8 MB. Please choose a smaller screenshot."); return; }
    setFile(next);
    setPreview(URL.createObjectURL(next));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setUtrTouched(true);
    if (!canSubmit || !user) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      if (!(import.meta.env.DEV && isDemo)) {
        const proofUrl = await uploadPaymentProof(file!);
        const idToken = await user.getIdToken();
        await submitElearnUpi(idToken, { courseIds: courses.map((item) => item.id), proofUrl, upiRef: normalizeUtr(utr), ...(coupon ? { couponCode: coupon.couponCode } : {}) });
      }
      onSubmitted();
    } catch (error) {
      const message = errorMessage(error, "We couldn't submit your payment. Please try again.");
      setSubmitError(message);
      toast({ title: "Not submitted", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-6 sm:p-7" noValidate>
      <button type="button" onClick={onBack} className="-ml-1 mb-3 inline-flex items-center gap-1 rounded font-body text-xs font-semibold text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back
      </button>
      <DialogHeader className="text-left">
        <DialogTitle className="font-display text-2xl font-semibold text-foreground">Scan &amp; pay</DialogTitle>
        <DialogDescription className="font-body text-sm text-muted-foreground">Pay from any UPI app, then upload the screenshot. We unlock {courses.length === 1 ? "the master class" : `all ${courses.length} master classes`} after we verify it.</DialogDescription>
      </DialogHeader>

      <div className="mt-5 rounded-xl border border-gold/25 bg-ivory/60 p-4 sm:p-5">
        <p className="text-center font-body text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Amount to pay</p>
        <p className="text-center font-display text-4xl font-bold text-primary">{formatPaiseAsRupees(amount)}</p>
        {coupon && <p className="text-center font-body text-xs text-muted-foreground"><span className="line-through">{formatPaiseAsRupees(listPrice)}</span> · {coupon.couponCode} saves {formatPaiseAsRupees(coupon.discountInPaise)}</p>}
        <div className="mx-auto mt-4 w-fit rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
          {settings.qrImageUrl ? (
            <img src={settings.qrImageUrl} alt={`UPI QR code to pay ${payee}`} className="h-48 w-48 object-contain" />
          ) : upiUrl ? (
            <QRCodeSVG value={upiUrl} size={192} includeMargin role="img" aria-label={`UPI QR code to pay ${formatPaiseAsRupees(amount)} to ${payee}`} />
          ) : null}
        </div>
        <p className="mt-3 text-center font-body text-sm text-foreground">Pay to <span className="font-semibold">{payee}</span></p>
        {settings.qrImageUrl && <p className="mt-1 text-center font-body text-xs text-muted-foreground">Enter exactly {formatPaiseAsRupees(amount)} in your UPI app.</p>}
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {upiId && (
            <button type="button" onClick={() => copy(upiId, "UPI ID")} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-gold/30 bg-card px-3 font-body text-xs font-medium text-foreground hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <span className="max-w-[12rem] truncate">{upiId}</span> <Copy className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">Copy UPI ID</span>
            </button>
          )}
          {settings.upiNumber.trim() && (
            <button type="button" onClick={() => copy(settings.upiNumber.trim(), "UPI number")} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-gold/30 bg-card px-3 font-body text-xs font-medium text-foreground hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              {settings.upiNumber.trim()} <Copy className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">Copy UPI number</span>
            </button>
          )}
        </div>
        {upiUrl && isMobileDevice() && (
          <a href={upiUrl} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-primary/40 bg-card font-body text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            Open UPI app <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
        {settings.instructions.trim() && <p className="mt-3 whitespace-pre-line text-center font-body text-xs leading-relaxed text-muted-foreground">{settings.instructions.trim()}</p>}
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor={fileId} className="block font-body text-sm font-semibold text-foreground">Payment screenshot</label>
          <label
            htmlFor={fileId}
            className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-gold/50 bg-card p-3 transition-colors hover:border-primary focus-within:ring-2 focus-within:ring-primary"
          >
            {preview ? (
              <img src={preview} alt="Your payment screenshot" className="h-16 w-16 rounded-md object-cover ring-1 ring-black/5" />
            ) : (
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><ImagePlus className="h-6 w-6" aria-hidden="true" /></span>
            )}
            <span className="min-w-0 font-body text-sm">
              <span className="block font-semibold text-primary">{file ? "Change screenshot" : "Choose screenshot"}</span>
              <span className="block truncate text-xs text-muted-foreground">{file ? file.name : "Image, up to 8 MB"}</span>
            </span>
            <input id={fileId} type="file" accept="image/*" onChange={pickFile} className="sr-only" aria-describedby={fileError ? `${fileId}-error` : undefined} />
          </label>
          {fileError && <p id={`${fileId}-error`} role="alert" className="mt-1.5 font-body text-xs font-medium text-destructive">{fileError}</p>}
        </div>

        <div>
          <label htmlFor={utrId} className="block font-body text-sm font-semibold text-foreground">12-digit UTR / UPI Ref No.</label>
          <input
            id={utrId}
            value={utr}
            onChange={(event) => setUtr(event.target.value)}
            onBlur={() => setUtrTouched(true)}
            inputMode="numeric"
            autoComplete="off"
            maxLength={20}
            required
            aria-invalid={utrTouched && !utrValid}
            aria-describedby={`${utrId}-help`}
            placeholder="e.g. 412345678901"
            className="mt-1.5 h-11 w-full rounded-lg border border-gold/30 bg-card px-3 font-body text-sm tracking-wide text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-[invalid=true]:border-destructive"
          />
          <p id={`${utrId}-help`} className={`mt-1.5 font-body text-xs ${utrTouched && utr && !utrValid ? "font-medium text-destructive" : "text-muted-foreground"}`}>
            {utrTouched && utr && !utrValid ? "Enter the 12-digit number exactly as shown. " : ""}Find it in your UPI app under the payment details.
          </p>
        </div>

        {submitError && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 font-body text-sm font-medium text-destructive">{submitError}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-gradient-primary font-body text-sm font-semibold text-primary-foreground shadow-gold transition-[transform,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {submitting ? "Submitting…" : "Submit payment"}
        </button>
      </div>
    </form>
  );
};

export default BuyCourseDialog;
