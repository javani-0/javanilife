import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, QrCode, Save, Upload, Trash2, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";
import {
  buildUpiIntentUrl,
  defaultPaymentSettings,
  getPaymentSettings,
  savePaymentSettings,
  type PaymentSettings,
} from "@/lib/settings/paymentSettings";

const inputClass = "h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20";
const labelClass = "mb-1 block font-body text-xs font-medium text-foreground";

const AdminPaymentSettings = () => {
  const { toast } = useToast();
  const [form, setForm] = useState<PaymentSettings>(defaultPaymentSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getPaymentSettings().then((settings) => { setForm(settings); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast({ title: "Please upload an image", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      formData.append("folder", "payment-settings");
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
      const data = await response.json();
      const url = data?.secure_url || data?.url;
      if (!url) throw new Error("No URL returned");
      setForm((current) => ({ ...current, qrImageUrl: url }));
      toast({ title: "QR image uploaded" });
    } catch (error) {
      toast({ title: "Upload failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.upiId.trim() && !form.qrImageUrl.trim()) {
      toast({ title: "Add a UPI ID or QR image", description: "Students need at least one way to pay you.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await savePaymentSettings(form);
      toast({ title: "Payment settings saved" });
    } catch (error) {
      toast({ title: "Could not save", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const previewUpi = form.upiId ? buildUpiIntentUrl({ upiId: form.upiId, name: form.upiName, amountInPaise: 100000, note: "Fee payment" }) : "";

  return (
    <div className="space-y-6">
      <div>
        <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">Payments</p>
        <h1 className="mt-2 flex items-center gap-2 font-display text-3xl text-foreground"><QrCode className="h-7 w-7 text-gold" /> Payment Settings</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">Set the UPI ID and QR that students pay to for manual online payments. They upload a receipt screenshot, which you approve in Fee Collections. (Razorpay is only used for autopay & EMI.)</p>
      </div>

      {loading ? (
        <p className="font-body text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
            <div className="space-y-4">
              <div>
                <label className={labelClass}>UPI ID (VPA) *</label>
                <input value={form.upiId} onChange={(e) => setForm({ ...form, upiId: e.target.value })} placeholder="e.g. javani@okhdfcbank" className={inputClass} />
                <p className="mt-1 font-body text-[0.7rem] text-muted-foreground">Used to auto-generate a QR and pre-fill the amount in the student's UPI app.</p>
              </div>
              <div>
                <label className={labelClass}>Payee name</label>
                <input value={form.upiName} onChange={(e) => setForm({ ...form, upiName: e.target.value })} placeholder="Javani Spiritual Hub" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Payment number (optional)</label>
                <input value={form.upiNumber} onChange={(e) => setForm({ ...form, upiNumber: e.target.value.replace(/[^0-9+ ]/g, "") })} inputMode="tel" placeholder="e.g. 9030200263" className={inputClass} />
                <p className="mt-1 font-body text-[0.7rem] text-muted-foreground">Shown on the pay screen with a Copy button (like the UPI ID) — students paste it into any UPI app to pay.</p>
              </div>
              <div>
                <label className={labelClass}>QR image (optional — shown instead of the generated QR)</label>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 font-body text-sm hover:bg-muted disabled:opacity-50">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {form.qrImageUrl ? "Replace QR" : "Upload QR"}
                  </button>
                  {form.qrImageUrl && (
                    <button type="button" onClick={() => setForm({ ...form, qrImageUrl: "" })} className="flex items-center gap-1 font-body text-xs font-semibold text-destructive hover:underline"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
                  )}
                </div>
              </div>
              <div>
                <label className={labelClass}>Instructions shown to students (optional)</label>
                <textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} rows={2} placeholder="e.g. Add your child's name in the payment note." className="w-full rounded-md border border-border bg-background px-3 py-2 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" />
              </div>
              <label className="flex items-center gap-2 font-body text-sm text-foreground">
                <input type="checkbox" checked={form.manualPaymentsEnabled} onChange={(e) => setForm({ ...form, manualPaymentsEnabled: e.target.checked })} />
                Manual UPI payments enabled
              </label>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-md bg-gradient-primary px-4 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
              </button>
            </div>
          </div>

          {/* Live preview of what the student sees */}
          <div className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
            <h2 className="font-display text-lg text-foreground">Student preview</h2>
            <div className="mt-3 flex flex-col items-center rounded-xl bg-muted/40 p-4">
              {form.qrImageUrl ? (
                <img src={form.qrImageUrl} alt="QR preview" className="h-48 w-48 rounded-lg border border-border object-contain bg-white" />
              ) : previewUpi ? (
                <div className="rounded-lg border border-border bg-white p-3"><QRCodeSVG value={previewUpi} size={176} includeMargin /></div>
              ) : (
                <p className="py-10 text-center font-body text-sm text-muted-foreground">Add a UPI ID or QR image to preview.</p>
              )}
              {form.upiId && <p className="mt-3 font-body text-sm font-semibold text-foreground">{form.upiId}</p>}
              {form.upiId && (
                <p className="mt-1 flex items-center gap-1 font-body text-[0.72rem] text-muted-foreground"><Smartphone className="h-3.5 w-3.5" /> Amount pre-fills in the UPI app</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPaymentSettings;
