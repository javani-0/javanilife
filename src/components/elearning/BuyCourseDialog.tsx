import { useEffect, useId, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, CheckCircle2, Copy, CreditCard, ExternalLink, ImagePlus, Loader2, QrCode, ShieldCheck, TicketPercent, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import { buyCourseWithRazorpay, previewElearnCoupon, submitElearnUpi, type ElearnCouponPreview, type ElearnCourse, type PaymentModes } from "@/lib/elearning";
import { uploadPaymentProof } from "@/lib/classes/upiPayments";
import { buildUpiIntentUrl, type PaymentSettings } from "@/lib/settings/paymentSettings";
import { isMobileDevice, isValidUtr, normalizeUtr } from "./format";

const MAX_PROOF_BYTES = 8 * 1024 * 1024;
const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** Razorpay purchase (create order → checkout → verify), with an optional coupon the server re-checks. */
export const usePayOnline = (course: ElearnCourse | null, isDemo = false) => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [paying, setPaying] = useState(false);

  const pay = async (couponCode?: string | null) => {
    if (!course || !user || paying) return;
    if (import.meta.env.DEV && isDemo) {
      toast({ title: "Sample course", description: "Online payment is turned off in demo mode." });
      return;
    }
    setPaying(true);
    try {
      const idToken = await user.getIdToken();
      const result = await buyCourseWithRazorpay({
        idToken,
        courseId: course.id,
        couponCode: couponCode || null,
        prefill: { name: userProfile?.username || user.displayName || "", email: userProfile?.email || user.email || "", contact: userProfile?.phone || "" },
        themeColor: "#8B1A1A",
      });
      if (result.verified) {
        toast({ title: "You're enrolled", description: `${course.title} is unlocked. Enjoy the course.` });
        navigate(`/learn/${encodeURIComponent(course.id)}/watch`);
      } else {
        toast({ title: "Payment received", description: "We're confirming it. The course unlocks here as soon as it's done." });
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
  /** Starts the Razorpay checkout (the dialog closes first so checkout gets focus). */
  onPayOnline: (couponCode: string | null) => void;
  isDemo?: boolean;
}

type Step = "choose" | "upi" | "submitted";

const BuyCourseDialog = ({ course, modes, settings, open, onOpenChange, onPayOnline, isDemo = false }: BuyCourseDialogProps) => {
  const bothModes = modes.razorpay && modes.upi;
  // Online-only courses also open here first, so the buyer can add a coupon.
  const firstStep: Step = modes.razorpay ? "choose" : "upi";
  const [step, setStep] = useState<Step>(firstStep);
  const [coupon, setCoupon] = useState<ElearnCouponPreview | null>(null);

  useEffect(() => {
    if (open) setStep(firstStep);
  }, [open, firstStep]);
  useEffect(() => setCoupon(null), [course.id, course.priceInPaise]);

  const payable = coupon ? coupon.finalInPaise : course.priceInPaise;

  const choosePayOnline = () => {
    onOpenChange(false);
    const code = coupon?.couponCode || null;
    // Let the dialog release focus before Razorpay opens its own window.
    window.setTimeout(() => onPayOnline(code), 120);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto rounded-2xl border-gold/20 p-0 sm:rounded-2xl">
        {step === "choose" && (
          <div className="p-6 sm:p-7">
            <DialogHeader className="text-left">
              <DialogTitle className="font-display text-2xl font-semibold text-foreground">{bothModes ? "How would you like to pay?" : "Buy this course"}</DialogTitle>
              <DialogDescription className="font-body text-sm text-muted-foreground">
                {course.title} ·{" "}
                {coupon && <span className="mr-1 line-through">{formatPaiseAsRupees(course.priceInPaise)}</span>}
                <span className="font-semibold text-foreground">{formatPaiseAsRupees(payable)}</span>
              </DialogDescription>
            </DialogHeader>
            <CouponBox course={course} applied={coupon} onChange={setCoupon} isDemo={isDemo} />
            <div className="mt-5 grid gap-3">
              <button
                type="button"
                onClick={choosePayOnline}
                className="group flex w-full items-start gap-4 rounded-xl border border-primary/25 bg-card p-4 text-left transition-[border-color,box-shadow,transform] duration-150 hover:border-primary hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.99]"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><CreditCard className="h-5 w-5" aria-hidden="true" /></span>
                <span>
                  <span className="block font-body text-[0.95rem] font-semibold text-foreground">Pay online · {formatPaiseAsRupees(payable)}</span>
                  <span className="mt-0.5 block font-body text-[0.82rem] text-muted-foreground">UPI apps, cards, netbanking</span>
                  <span className="mt-1.5 inline-flex items-center gap-1 font-body text-[0.78rem] font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Instant access</span>
                </span>
              </button>
              {modes.upi && <button
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
            </div>
            <p className="mt-5 flex items-center gap-1.5 font-body text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Online payments are processed securely by Razorpay.</p>
          </div>
        )}

        {step === "upi" && (
          <UpiPanel course={course} settings={settings} coupon={coupon} onCouponChange={setCoupon} canGoBack={bothModes} onBack={() => setStep("choose")} onSubmitted={() => setStep("submitted")} isDemo={isDemo} />
        )}

        {step === "submitted" && (
          <div className="p-6 text-center sm:p-8">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-7 w-7" aria-hidden="true" /></span>
            <DialogTitle className="mt-4 font-display text-2xl font-semibold text-foreground">Payment submitted</DialogTitle>
            <DialogDescription className="mx-auto mt-2 max-w-sm font-body text-sm leading-relaxed text-muted-foreground">
              Thank you. We'll check your payment and unlock {course.title}. You'll see it in My Learning as soon as it's verified.
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

// ── Coupon code box (the server checks the code and returns the new price) ──
interface CouponBoxProps {
  course: ElearnCourse;
  applied: ElearnCouponPreview | null;
  onChange: (coupon: ElearnCouponPreview | null) => void;
  isDemo: boolean;
}

const CouponBox = ({ course, applied, onChange, isDemo }: CouponBoxProps) => {
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
      const result = await previewElearnCoupon(await user.getIdToken(), course.id, clean);
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
  course: ElearnCourse;
  settings: PaymentSettings;
  coupon: ElearnCouponPreview | null;
  onCouponChange: (coupon: ElearnCouponPreview | null) => void;
  canGoBack: boolean;
  onBack: () => void;
  onSubmitted: () => void;
  isDemo: boolean;
}

const UpiPanel = ({ course, settings, coupon, onCouponChange, canGoBack, onBack, onSubmitted, isDemo }: UpiPanelProps) => {
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
  const amount = coupon ? coupon.finalInPaise : course.priceInPaise;
  const upiUrl = upiId ? buildUpiIntentUrl({ upiId, name: payee, amountInPaise: amount, note: course.title.slice(0, 50) }) : "";
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
        await submitElearnUpi(idToken, { courseId: course.id, proofUrl, upiRef: normalizeUtr(utr), ...(coupon ? { couponCode: coupon.couponCode } : {}) });
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
      {canGoBack && (
        <button type="button" onClick={onBack} className="-ml-1 mb-3 inline-flex items-center gap-1 rounded font-body text-xs font-semibold text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Other ways to pay
        </button>
      )}
      <DialogHeader className="text-left">
        <DialogTitle className="font-display text-2xl font-semibold text-foreground">Scan &amp; pay</DialogTitle>
        <DialogDescription className="font-body text-sm text-muted-foreground">Pay from any UPI app, then upload the screenshot. We unlock the course after we verify it.</DialogDescription>
      </DialogHeader>

      {!canGoBack && <CouponBox course={course} applied={coupon} onChange={onCouponChange} isDemo={isDemo} />}

      <div className="mt-5 rounded-xl border border-gold/25 bg-ivory/60 p-4 sm:p-5">
        <p className="text-center font-body text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Amount to pay</p>
        <p className="text-center font-display text-4xl font-bold text-primary">{formatPaiseAsRupees(amount)}</p>
        {coupon && <p className="text-center font-body text-xs text-muted-foreground"><span className="line-through">{formatPaiseAsRupees(course.priceInPaise)}</span> · {coupon.couponCode} saves {formatPaiseAsRupees(coupon.discountInPaise)}</p>}
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
