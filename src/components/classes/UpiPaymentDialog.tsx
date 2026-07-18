import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Loader2, Smartphone, Upload, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import { requestCounterPayment, submitUpiPayment, uploadPaymentProof, type UpiPaymentTarget } from "@/lib/classes";
import {
  buildUpiIntentUrl,
  defaultPaymentSettings,
  hasUsableUpi,
  subscribeToPaymentSettings,
  type PaymentSettings,
} from "@/lib/settings/paymentSettings";

interface UpiPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  target: UpiPaymentTarget | null;
  amountInPaise: number;
  title: string;
  note?: string;
  couponCode?: string;
  onSuccess?: () => void;
}

const UpiPaymentDialog = ({ open, onClose, target, amountInPaise, title, note, couponCode, onSuccess }: UpiPaymentDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<PaymentSettings>(defaultPaymentSettings);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [copied, setCopied] = useState<"" | "id" | "number">("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [upiRef, setUpiRef] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const unsub = subscribeToPaymentSettings((value) => { setSettings(value); setLoadingSettings(false); }, () => setLoadingSettings(false));
    return () => unsub();
  }, [open]);

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (open) { setFile(null); setPreviewUrl(""); setUpiRef(""); setCopied(""); }
  }, [open]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  if (!open) return null;

  const upiIntentUrl = settings.upiId
    ? buildUpiIntentUrl({ upiId: settings.upiId, name: settings.upiName, amountInPaise, note: note || title })
    : "";

  const handleCopy = async (value: string, which: "id" | "number") => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(""), 1800);
    } catch { /* clipboard may be blocked; ignore */ }
  };

  const handlePickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    if (!picked) return;
    if (!picked.type.startsWith("image/")) { toast({ title: "Please upload an image screenshot", variant: "destructive" }); return; }
    if (picked.size > 8 * 1024 * 1024) { toast({ title: "Screenshot too large", description: "Please upload an image under 8 MB.", variant: "destructive" }); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
  };

  // Submitting WITHOUT a screenshot is a valid choice: it's treated as "pay at
  // the counter" (req 1). For current dues/enrolments nothing is written — the
  // due already exists and the admin settles it with Collect Cash. For an
  // ADVANCE month the fee doc doesn't exist yet, so we ask the server to create
  // it as pending — otherwise the admin never sees the request (req).
  const handlePayAtCounter = async () => {
    const advanceTarget = target && "enrollmentId" in target && target.kind === "monthly" && target.monthKey
      ? { enrollmentId: target.enrollmentId, kind: "monthly" as const, monthKey: target.monthKey }
      : null;
    if (user && advanceTarget) {
      setSubmitting(true);
      try {
        const idToken = await user.getIdToken();
        await requestCounterPayment(idToken, advanceTarget);
      } catch (error) {
        setSubmitting(false);
        toast({ title: "Could not record your request", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
        return;
      }
      setSubmitting(false);
    }
    toast({ title: "Noted — pay at the counter", description: "Please pay at the centre. Your enrolment/fee is confirmed once we collect it." });
    onSuccess?.();
    onClose();
  };

  const handleSubmit = async () => {
    if (!user || !target) return;
    // No screenshot → pay at counter.
    if (!file) { handlePayAtCounter(); return; }
    setSubmitting(true);
    try {
      const proofUrl = await uploadPaymentProof(file);
      const idToken = await user.getIdToken();
      await submitUpiPayment(idToken, target, proofUrl, upiRef.trim() || undefined, couponCode);
      toast({ title: "Payment submitted", description: "We'll confirm it shortly. You'll see it update in My Classes once approved." });
      onSuccess?.();
      onClose();
    } catch (error) {
      toast({ title: "Could not submit payment", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const upiConfigured = hasUsableUpi(settings);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-xl text-foreground">Pay by UPI</h2>
            <p className="font-body text-[0.8rem] text-muted-foreground">{title}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-3 rounded-xl bg-gold/10 p-3 text-center">
          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground">Amount to pay</p>
          <p className="font-display text-2xl font-bold text-primary">{formatPaiseAsRupees(amountInPaise)}</p>
        </div>

        {loadingSettings ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
        ) : !upiConfigured ? (
          <>
            <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 font-body text-[0.8rem] text-amber-800">
              Online UPI payment isn't set up yet — you can still pay at the centre.
            </p>
            <button onClick={handlePayAtCounter} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-gradient-primary px-4 py-3 font-body text-sm font-semibold text-primary-foreground hover:brightness-110">
              Pay at the counter
            </button>
            <p className="mt-2 text-center font-body text-[0.72rem] text-muted-foreground">Your enrolment is confirmed once an admin collects the payment.</p>
          </>
        ) : (
          <>
            {/* QR: uploaded image preferred, else generated from the UPI id */}
            <div className="mt-4 flex flex-col items-center">
              {settings.qrImageUrl ? (
                <img src={settings.qrImageUrl} alt="Scan to pay" className="h-52 w-52 rounded-lg border border-border object-contain" />
              ) : upiIntentUrl ? (
                <div className="rounded-lg border border-border bg-white p-3">
                  <QRCodeSVG value={upiIntentUrl} size={192} includeMargin />
                </div>
              ) : null}
              <p className="mt-2 font-body text-[0.75rem] text-muted-foreground">Scan with any UPI app (GPay, PhonePe, Paytm…)</p>
            </div>

            {settings.upiId && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2">
                <div className="min-w-0">
                  <p className="font-body text-[0.7rem] uppercase tracking-wide text-muted-foreground">UPI ID</p>
                  <p className="truncate font-body text-sm font-semibold text-foreground">{settings.upiId}</p>
                </div>
                <button onClick={() => handleCopy(settings.upiId, "id")} className="flex shrink-0 items-center gap-1 rounded-md border border-gold/40 px-2.5 py-1.5 font-body text-xs font-semibold text-gold hover:bg-gold/10">
                  {copied === "id" ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                </button>
              </div>
            )}

            {/* Payment number — copy & pay from any UPI app (replaces the old
                "Pay in your UPI app" deep link, which was unreliable). */}
            {settings.upiNumber && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1 font-body text-[0.7rem] uppercase tracking-wide text-muted-foreground"><Smartphone className="h-3 w-3" /> Payment Number</p>
                  <p className="truncate font-body text-sm font-semibold text-foreground">{settings.upiNumber}</p>
                </div>
                <button onClick={() => handleCopy(settings.upiNumber, "number")} className="flex shrink-0 items-center gap-1 rounded-md border border-gold/40 px-2.5 py-1.5 font-body text-xs font-semibold text-gold hover:bg-gold/10">
                  {copied === "number" ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                </button>
              </div>
            )}

            {settings.instructions && (
              <p className="mt-3 rounded-md bg-muted/60 p-2.5 font-body text-[0.76rem] text-muted-foreground">{settings.instructions}</p>
            )}

            {/* Screenshot upload (optional — skip it to pay at the counter) */}
            <div className="mt-4">
              <p className="font-body text-sm font-semibold text-foreground">Paid online? Upload your receipt screenshot <span className="font-normal text-muted-foreground">(optional)</span></p>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickFile} />
              {previewUrl ? (
                <div className="mt-2 flex items-center gap-3 rounded-md border border-border p-2">
                  <img src={previewUrl} alt="Receipt preview" className="h-16 w-16 rounded object-cover" />
                  <button onClick={() => fileInputRef.current?.click()} className="font-body text-xs font-semibold text-gold hover:underline">Change screenshot</button>
                </div>
              ) : (
                <button onClick={() => fileInputRef.current?.click()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border py-3 font-body text-sm text-muted-foreground hover:border-gold/50 hover:text-gold">
                  <Upload className="h-4 w-4" /> Upload screenshot
                </button>
              )}
            </div>

            <div className="mt-3">
              <label className="mb-1 block font-body text-xs font-medium text-foreground">UPI reference / UTR (optional)</label>
              <input value={upiRef} onChange={(e) => setUpiRef(e.target.value)} placeholder="e.g. 4172xxxxxx" className="h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" />
            </div>

            <button onClick={handleSubmit} disabled={submitting} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-gradient-primary px-4 py-3 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : file ? "Submit for approval" : "Submit — I'll pay at the counter"}
            </button>
            <p className="mt-2 text-center font-body text-[0.72rem] text-muted-foreground">
              {file
                ? "Your enrolment is confirmed once an admin verifies the payment."
                : "No screenshot? Submitting marks this as pay-at-counter — pay at the centre and we'll confirm it."}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default UpiPaymentDialog;
