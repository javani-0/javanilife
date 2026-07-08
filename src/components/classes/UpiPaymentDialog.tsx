import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Loader2, Smartphone, Upload, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import { submitUpiPayment, uploadPaymentProof, type UpiPaymentTarget } from "@/lib/classes";
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
  const [copied, setCopied] = useState(false);
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
    if (open) { setFile(null); setPreviewUrl(""); setUpiRef(""); setCopied(false); }
  }, [open]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  if (!open) return null;

  const upiIntentUrl = settings.upiId
    ? buildUpiIntentUrl({ upiId: settings.upiId, name: settings.upiName, amountInPaise, note: note || title })
    : "";

  const handleCopy = async () => {
    if (!settings.upiId) return;
    try {
      await navigator.clipboard.writeText(settings.upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
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

  const handleSubmit = async () => {
    if (!user || !target) return;
    if (!file) { toast({ title: "Add your payment screenshot", description: "Upload a screenshot of your UPI receipt so we can verify it.", variant: "destructive" }); return; }
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
          <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 font-body text-[0.8rem] text-amber-800">
            Online UPI payment isn't set up yet. Please contact us to pay, or choose Cash at the centre.
          </p>
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
                <button onClick={handleCopy} className="flex shrink-0 items-center gap-1 rounded-md border border-gold/40 px-2.5 py-1.5 font-body text-xs font-semibold text-gold hover:bg-gold/10">
                  {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                </button>
              </div>
            )}

            {upiIntentUrl && (
              <a href={upiIntentUrl} className="mt-2 flex items-center justify-center gap-2 rounded-md border border-gold/40 py-2 font-body text-sm font-semibold text-gold hover:bg-gold/10 sm:hidden">
                <Smartphone className="h-4 w-4" /> Pay in your UPI app
              </a>
            )}

            {settings.instructions && (
              <p className="mt-3 rounded-md bg-muted/60 p-2.5 font-body text-[0.76rem] text-muted-foreground">{settings.instructions}</p>
            )}

            {/* Screenshot upload */}
            <div className="mt-4">
              <p className="font-body text-sm font-semibold text-foreground">After paying, upload your receipt screenshot *</p>
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
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : "Submit for approval"}
            </button>
            <p className="mt-2 text-center font-body text-[0.72rem] text-muted-foreground">Your enrolment is confirmed once an admin verifies the payment.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default UpiPaymentDialog;
