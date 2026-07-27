import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  BadgeCheck, Building2, Check, Copy, CreditCard, KeyRound, Loader2, LogIn,
  QrCode, Smartphone, Upload, Wallet,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatPaiseAsRupees, openRazorpayCheckout } from "@/lib/ecommerce";
import { uploadPaymentProof } from "@/lib/classes";
import {
  buildUpiIntentUrl,
  defaultPaymentSettings,
  hasUsableUpi,
  subscribeToPaymentSettings,
  type PaymentSettings,
} from "@/lib/settings/paymentSettings";
import {
  createOnboardingOrder,
  subscribeToOnboardingLink,
  submitOnboardingPayment,
  verifyOnboardingPayment,
  type OnboardingLinkDoc,
} from "@/lib/students";
import logo from "@/assets/logo-white.png";

// "pay" is the declare-a-payment panel: the UPI QR (when enabled + configured),
// an OPTIONAL screenshot, an optional UTR, and the submit button. It doubles as
// the EMI "I've paid the 1st installment" flow.
type Mode = "choose" | "pay";

const OnboardingPay = () => {
  const { token = "" } = useParams();
  const { toast } = useToast();
  const [link, setLink] = useState<OnboardingLinkDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<PaymentSettings>(defaultPaymentSettings);
  const [mode, setMode] = useState<Mode>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [upiRef, setUpiRef] = useState("");
  const [busy, setBusy] = useState<"" | "razorpay" | "qr" | "counter">("");
  const [copied, setCopied] = useState<"" | "id" | "number">("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    const unsub = subscribeToOnboardingLink(token, (value) => { setLink(value); setLoading(false); }, () => setLoading(false));
    return () => unsub();
  }, [token]);
  useEffect(() => subscribeToPaymentSettings(setSettings, () => undefined), []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
  const total = link?.totalInPaise || 0;
  // On an EMI link the parent is asked for the FIRST INSTALLMENT only (req);
  // everywhere else "due now" is simply the whole onboarding total.
  const dueNow = link?.dueNowInPaise ?? total;
  const isEmi = Boolean(link?.methods.emi && dueNow > 0 && dueNow < total);
  // Multi-class links carry one breakdown section per class. Links written
  // before multi-class have no `sections` — those fall back to the flat rows.
  const sections = link?.sections || [];
  const multiClass = sections.length > 1;
  const upiIntentUrl = useMemo(
    () => (settings.upiId ? buildUpiIntentUrl({ upiId: settings.upiId, name: settings.upiName, amountInPaise: dueNow, note: link ? `${link.studentName} admission` : "" }) : ""),
    [settings.upiId, settings.upiName, dueNow, link],
  );

  const copy = async (value: string, which: "id" | "number") => {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); setCopied(which); setTimeout(() => setCopied(""), 1600); } catch { /* ignore */ }
  };

  const pickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    if (!picked) return;
    if (!picked.type.startsWith("image/")) { toast({ title: "Please upload an image", variant: "destructive" }); return; }
    if (picked.size > 8 * 1024 * 1024) { toast({ title: "Screenshot too large (max 8 MB)", variant: "destructive" }); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
  };

  const handleRazorpay = async () => {
    if (!link) return;
    setBusy("razorpay");
    try {
      const order = await createOnboardingOrder(token);
      const success = await openRazorpayCheckout({
        key: order.keyId,
        amount: order.amountInPaise,
        currency: order.currency,
        order_id: order.orderId,
        name: "Javani Spiritual Hub",
        description: `${link.studentName} — ${link.className} admission`,
        prefill: { name: link.parentName },
      });
      await verifyOnboardingPayment(token, {
        razorpay_order_id: success.razorpay_order_id,
        razorpay_payment_id: success.razorpay_payment_id,
        razorpay_signature: success.razorpay_signature,
      });
      toast({ title: "Payment received!", description: "We'll verify and share your login shortly." });
    } catch (error) {
      toast({ title: "Payment not completed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  // The screenshot is OPTIONAL (req) — the parent can simply declare that they
  // paid and we verify it against the UPI statement.
  const handleQrSubmit = async () => {
    setBusy("qr");
    try {
      const proofUrl = file ? await uploadPaymentProof(file) : undefined;
      await submitOnboardingPayment(token, "qr", { proofUrl, upiRef: upiRef.trim() || undefined });
      toast({
        title: isEmi ? "1st installment submitted" : "Submitted for verification",
        description: "We'll confirm shortly and your login will appear here.",
      });
    } catch (error) {
      toast({ title: "Could not submit", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const handleCounter = async () => {
    setBusy("counter");
    try {
      await submitOnboardingPayment(token, "counter");
      toast({ title: "Noted — pay at the centre", description: "We'll confirm your admission once you pay at the counter." });
    } catch (error) {
      toast({ title: "Could not submit", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-dvh bg-gradient-to-b from-[#1A0A0A] to-[#2a1414] px-4 py-8">
      <div className="mx-auto flex max-w-lg flex-col items-center">
        <img src={logo} alt="Javani" className="mb-5 h-12 w-auto object-contain" />
        {children}
      </div>
    </div>
  );

  if (loading) {
    return <Shell><div className="flex items-center justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-gold" /></div></Shell>;
  }

  if (!link) {
    return (
      <Shell>
        <div className="w-full rounded-2xl bg-card p-6 text-center shadow-xl">
          <QrCode className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h1 className="font-display text-xl text-foreground">Link not found</h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">This payment link is invalid or has been replaced. Please contact Javani Spiritual Hub for a fresh link.</p>
        </div>
      </Shell>
    );
  }

  const status = link.status;
  const upiConfigured = hasUsableUpi(settings);

  // Approved → show credentials (req: the link now contains the login).
  if (status === "approved" && link.credentials) {
    return (
      <Shell>
        <div className="w-full rounded-2xl bg-card p-6 shadow-xl">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100"><BadgeCheck className="h-8 w-8 text-green-600" /></div>
            <h1 className="mt-3 font-display text-2xl text-foreground">Admission confirmed! 🎉</h1>
            <p className="mt-1 font-body text-sm text-muted-foreground">Welcome, {link.studentName}. Your student portal login is ready.</p>
          </div>
          <div className="mt-5 space-y-2 rounded-xl border border-green-200 bg-green-50/60 p-4">
            {link.credentials.studentId && (
              <div className="flex items-center justify-between font-body text-sm"><span className="text-muted-foreground">Student ID</span><span className="font-semibold text-foreground">{link.credentials.studentId}</span></div>
            )}
            <div className="flex items-center justify-between gap-2 font-body text-sm">
              <span className="text-muted-foreground">User ID (email)</span>
              <span className="flex items-center gap-1.5 truncate font-semibold text-foreground">{link.credentials.email}<button onClick={() => copy(link.credentials!.email, "id")} className="text-muted-foreground hover:text-gold"><Copy className="h-3.5 w-3.5" /></button></span>
            </div>
            <div className="flex items-center justify-between gap-2 font-body text-sm">
              <span className="text-muted-foreground">Password</span>
              <span className="flex items-center gap-1.5 font-semibold text-foreground">{link.credentials.password}<button onClick={() => copy(link.credentials!.password, "number")} className="text-muted-foreground hover:text-gold"><Copy className="h-3.5 w-3.5" /></button></span>
            </div>
          </div>
          <a href={loginUrl} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110">
            <LogIn className="h-4 w-4" /> Open the portal
          </a>
          <p className="mt-3 text-center font-body text-[0.72rem] text-muted-foreground">In the portal you can join the live class, watch recordings, download materials, and pay monthly fees. Please keep these details private.</p>
        </div>
      </Shell>
    );
  }

  // Payment submitted / counter / paid-online → waiting for admin.
  if (status === "payment-submitted" || status === "counter-chosen" || status === "paid-online") {
    const message = status === "counter-chosen"
      ? "Please pay at the centre. We'll confirm your admission and share your login here once collected."
      : isEmi
        ? "Thank you! We've received your 1st installment and are verifying it. Your login will appear here shortly, and the remaining installments will show up in your portal."
        : "Thank you! We've received your payment details and are verifying them. Your login will appear here shortly.";
    return (
      <Shell>
        <div className="w-full rounded-2xl bg-card p-6 text-center shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
          <h1 className="mt-3 font-display text-xl text-foreground">Almost there</h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">{message}</p>
          <p className="mt-3 font-body text-xs text-muted-foreground">You can keep this page open — it updates automatically.</p>
        </div>
      </Shell>
    );
  }

  // awaiting-payment → the payment options the admin enabled.
  return (
    <Shell>
      <div className="w-full rounded-2xl bg-card p-6 shadow-xl">
        <h1 className="font-display text-2xl text-foreground">Complete admission</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          {link.studentName}
          {multiClass
            ? ` — ${sections.length} classes`
            : ` — ${link.className}${link.slotLabel ? ` · ${link.slotLabel}` : ""}`}
        </p>
        {link.trainerName && (
          <p className="mt-0.5 font-body text-xs text-muted-foreground">Trainer: <span className="font-semibold text-foreground">{link.trainerName}</span></p>
        )}
        {link.rejectReason && (
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 font-body text-[0.8rem] text-amber-800">{link.rejectReason}</p>
        )}

        {/* Fee breakdown — one section PER CLASS (req: transparent pricing),
            falling back to the flat rows for links written before multi-class. */}
        <div className="mt-4 rounded-xl border border-border/60 bg-background/60 p-4">
          {sections.length > 0 ? (
            <div className="space-y-3">
              {sections.map((section) => (
                <div key={section.key} className={multiClass ? "rounded-lg border border-border/60 bg-card/60 p-3" : ""}>
                  {multiClass && (
                    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2">
                      <p className="min-w-0 font-body text-sm font-semibold text-foreground">{section.className}</p>
                      {section.slotLabel && <p className="font-body text-xs text-muted-foreground">{section.slotLabel}</p>}
                    </div>
                  )}
                  <div className="space-y-1">
                    {section.rows.map((row, i) => (
                      <div key={i} className="flex justify-between gap-2 font-body text-sm">
                        <span className="min-w-0 text-muted-foreground">{row.label}</span>
                        <span className={row.amountInPaise < 0 ? "shrink-0 font-semibold text-green-700" : "shrink-0 text-foreground"}>{row.amountInPaise < 0 ? "−" : ""}{formatPaiseAsRupees(Math.abs(row.amountInPaise))}</span>
                      </div>
                    ))}
                  </div>
                  {multiClass && (
                    <div className="mt-1.5 flex justify-between gap-2 border-t border-border/60 pt-1.5 font-body text-sm font-semibold text-foreground">
                      <span className="min-w-0">Subtotal</span>
                      <span className="shrink-0">{formatPaiseAsRupees(section.totalInPaise)}</span>
                    </div>
                  )}
                  {section.recurring && (
                    <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">
                      Then {formatPaiseAsRupees(section.recurring.amountInPaise)} / month
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {link.rows.map((row, i) => (
                <div key={i} className="flex justify-between gap-2 font-body text-sm">
                  <span className="min-w-0 text-muted-foreground">{row.label}</span>
                  <span className={row.amountInPaise < 0 ? "shrink-0 font-semibold text-green-700" : "shrink-0 text-foreground"}>{row.amountInPaise < 0 ? "−" : ""}{formatPaiseAsRupees(Math.abs(row.amountInPaise))}</span>
                </div>
              ))}
            </div>
          )}
          <div className={`mt-2 flex justify-between gap-2 border-t border-border/60 pt-2 font-display ${isEmi ? "text-base font-semibold text-muted-foreground" : "text-lg font-bold text-foreground"}`}>
            <span className="min-w-0">{isEmi ? "Course fee (total)" : multiClass ? `Total for ${sections.length} classes` : "Total"}</span>
            <span className={isEmi ? "shrink-0 text-foreground" : "shrink-0 text-primary"}>{formatPaiseAsRupees(total)}</span>
          </div>
          {link.freeMonthNote && <p className="mt-2 font-body text-[0.72rem] text-green-700">🎁 {link.freeMonthNote}</p>}
          {isEmi && link.emiInstallments && link.emiInstallments.length > 0 && (
            <div className="mt-3 border-t border-border/60 pt-3">
              <p className="font-body text-[0.72rem] font-semibold uppercase tracking-wide text-gold">EMI Payment Schedule</p>
              <div className="mt-1.5 space-y-1">
                {link.emiInstallments.map((row, i) => (
                  <div key={i} className={`flex justify-between rounded-md px-2.5 py-1.5 font-body text-sm ${i === 0 ? "border border-gold/30 bg-gold/5 font-semibold text-foreground" : "text-muted-foreground"}`}>
                    <span>{row.label}</span>
                    <span className={i === 0 ? "text-primary" : "text-foreground"}>{formatPaiseAsRupees(row.amountInPaise)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 font-body text-[0.68rem] text-muted-foreground">
                Only the <span className="font-semibold text-foreground">1st installment</span> is payable today. Once we confirm it you'll get your portal login — the remaining installments appear under <span className="font-semibold text-foreground">My Classes → EMI installments</span>, and you can pay them any time from there.
              </p>
            </div>
          )}
        </div>

        {/* On EMI the headline amount is the 1st installment, NOT the total —
            the Total row above is demoted so this can't be misread (req). */}
        {isEmi && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/5 px-4 py-3">
            <div className="min-w-0">
              <p className="font-body text-[0.7rem] font-semibold uppercase tracking-wide text-gold">Pay now · 1st installment</p>
              <p className="font-body text-[0.7rem] text-muted-foreground">of {formatPaiseAsRupees(total)} total</p>
            </div>
            <span className="shrink-0 font-display text-2xl font-bold text-primary">{formatPaiseAsRupees(dueNow)}</span>
          </div>
        )}

        {mode === "pay" ? (
          <div className="mt-5">
            <button onClick={() => setMode("choose")} className="mb-3 font-body text-xs font-semibold text-gold hover:underline">← Back to options</button>
            {!upiConfigured && !link.methods.emi ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-3 font-body text-[0.8rem] text-amber-800">Online UPI isn't set up yet. Please use another option.</p>
            ) : (
              <>
                {upiConfigured && (
                <>
                <div className="flex flex-col items-center">
                  {settings.qrImageUrl ? (
                    <img src={settings.qrImageUrl} alt="Scan to pay" className="h-52 w-52 rounded-lg border border-border object-contain" />
                  ) : upiIntentUrl ? (
                    <div className="rounded-lg border border-border bg-white p-3"><QRCodeSVG value={upiIntentUrl} size={192} includeMargin /></div>
                  ) : null}
                  <p className="mt-2 font-body text-[0.75rem] text-muted-foreground">Scan with any UPI app (GPay, PhonePe, Paytm…)</p>
                </div>
                {settings.upiId && (
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2">
                    <div className="min-w-0"><p className="font-body text-[0.7rem] uppercase text-muted-foreground">UPI ID</p><p className="truncate font-body text-sm font-semibold text-foreground">{settings.upiId}</p></div>
                    <button onClick={() => copy(settings.upiId, "id")} className="flex shrink-0 items-center gap-1 rounded-md border border-gold/40 px-2.5 py-1.5 font-body text-xs font-semibold text-gold hover:bg-gold/10">{copied === "id" ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}</button>
                  </div>
                )}
                {settings.upiNumber && (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2">
                    <div className="min-w-0"><p className="flex items-center gap-1 font-body text-[0.7rem] uppercase text-muted-foreground"><Smartphone className="h-3 w-3" /> Payment number</p><p className="truncate font-body text-sm font-semibold text-foreground">{settings.upiNumber}</p></div>
                    <button onClick={() => copy(settings.upiNumber, "number")} className="flex shrink-0 items-center gap-1 rounded-md border border-gold/40 px-2.5 py-1.5 font-body text-xs font-semibold text-gold hover:bg-gold/10">{copied === "number" ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}</button>
                  </div>
                )}
                {settings.instructions && <p className="mt-3 rounded-md bg-muted/60 p-2.5 font-body text-[0.76rem] text-muted-foreground">{settings.instructions}</p>}
                </>
                )}

                {/* The screenshot is OPTIONAL (req) — attaching it just speeds
                    up our verification. */}
                <p className="mt-4 font-body text-sm font-semibold text-foreground">
                  Payment screenshot <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
                {previewUrl ? (
                  <div className="mt-2 flex items-center gap-3 rounded-md border border-border p-2">
                    <img src={previewUrl} alt="Receipt" className="h-16 w-16 rounded object-cover" />
                    <button onClick={() => fileRef.current?.click()} className="font-body text-xs font-semibold text-gold hover:underline">Change</button>
                    <button onClick={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setFile(null); setPreviewUrl(""); }} className="font-body text-xs text-destructive hover:underline">Remove</button>
                  </div>
                ) : (
                  <button onClick={() => fileRef.current?.click()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border py-3 font-body text-sm text-muted-foreground hover:border-gold/50 hover:text-gold"><Upload className="h-4 w-4" /> Attach screenshot</button>
                )}
                <div className="mt-3">
                  <label className="mb-1 block font-body text-xs font-medium text-foreground">UPI reference / UTR (optional)</label>
                  <input value={upiRef} onChange={(e) => setUpiRef(e.target.value)} placeholder="e.g. 4172xxxxxx" className="h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" />
                </div>
                <button onClick={handleQrSubmit} disabled={busy === "qr"} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
                  {busy === "qr"
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                    : isEmi ? `I've paid the 1st installment (${formatPaiseAsRupees(dueNow)})` : "Submit for verification"}
                </button>
                <p className="mt-2 text-center font-body text-[0.7rem] text-muted-foreground">We'll verify it and confirm the admission on this page.</p>
              </>
            )}
          </div>
        ) : (
          <div className="mt-5 space-y-2.5">
            <p className="font-body text-sm font-semibold text-foreground">Choose how you'd like to pay</p>
            {link.methods.razorpay && (
              <button onClick={handleRazorpay} disabled={busy !== ""} className="flex w-full items-center gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:border-gold hover:bg-gold/5 disabled:opacity-60">
                <CreditCard className="h-6 w-6 shrink-0 text-gold" />
                <span className="flex-1"><span className="block font-body text-sm font-semibold text-foreground">Pay {formatPaiseAsRupees(dueNow)} online</span><span className="block font-body text-xs text-muted-foreground">Card, UPI, netbanking via Razorpay</span></span>
                {busy === "razorpay" ? <Loader2 className="h-5 w-5 animate-spin text-gold" /> : <Wallet className="h-5 w-5 text-muted-foreground" />}
              </button>
            )}
            {link.methods.qr && (
              <button onClick={() => setMode("pay")} disabled={busy !== ""} className="flex w-full items-center gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:border-gold hover:bg-gold/5 disabled:opacity-60">
                <QrCode className="h-6 w-6 shrink-0 text-gold" />
                <span className="flex-1"><span className="block font-body text-sm font-semibold text-foreground">{isEmi ? `Pay the 1st installment (${formatPaiseAsRupees(dueNow)})` : "Pay Now (UPI QR)"}</span><span className="block font-body text-xs text-muted-foreground">Scan the QR — the screenshot is optional</span></span>
              </button>
            )}
            {/* EMI without the QR rail: the parent still needs a way to tell us
                the 1st installment is paid (req). */}
            {isEmi && !link.methods.qr && (
              <button onClick={() => setMode("pay")} disabled={busy !== ""} className="flex w-full items-center gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:border-gold hover:bg-gold/5 disabled:opacity-60">
                <BadgeCheck className="h-6 w-6 shrink-0 text-gold" />
                <span className="flex-1"><span className="block font-body text-sm font-semibold text-foreground">I've paid the 1st installment</span><span className="block font-body text-xs text-muted-foreground">Tell us you've paid {formatPaiseAsRupees(dueNow)} — screenshot optional</span></span>
              </button>
            )}
            {link.methods.counter && (
              <button onClick={handleCounter} disabled={busy !== ""} className="flex w-full items-center gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:border-gold hover:bg-gold/5 disabled:opacity-60">
                <Building2 className="h-6 w-6 shrink-0 text-gold" />
                <span className="flex-1"><span className="block font-body text-sm font-semibold text-foreground">Pay at the counter</span><span className="block font-body text-xs text-muted-foreground">Cash or card at the centre</span></span>
                {busy === "counter" ? <Loader2 className="h-5 w-5 animate-spin text-gold" /> : <KeyRound className="h-5 w-5 text-muted-foreground" />}
              </button>
            )}
            {!link.methods.razorpay && !link.methods.qr && !link.methods.counter && !isEmi && (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-3 font-body text-sm text-amber-800">No payment options are enabled. Please contact us.</p>
            )}
          </div>
        )}
      </div>
      <p className="mt-4 font-body text-[0.72rem] text-white/50">🔒 Secure admission payment · Javani Spiritual Hub</p>
    </Shell>
  );
};

export default OnboardingPay;
