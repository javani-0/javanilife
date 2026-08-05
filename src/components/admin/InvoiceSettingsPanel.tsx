import { useEffect, useState } from "react";
import { FileText, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAdminLog } from "@/hooks/useAdminLog";
import {
  DEFAULT_INVOICE_SETTINGS,
  saveInvoiceSettings,
  subscribeToInvoiceSettings,
  type InvoiceSettings,
  type TaxMode,
} from "@/lib/settings/invoiceSettings";

const inputClass = "w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 font-body text-[0.85rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20";
const labelClass = "mb-1 block font-body text-[0.8rem] text-muted-foreground";

/**
 * The business identity printed on every bill (req: professional invoice).
 * Stored in siteSettings/invoice — public read so the bill page can render for
 * a parent who is not signed in.
 */
const InvoiceSettingsPanel = () => {
  const { toast } = useToast();
  const logAction = useAdminLog();
  const [settings, setSettings] = useState<InvoiceSettings>(DEFAULT_INVOICE_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribeToInvoiceSettings(setSettings, () => undefined), []);

  const set = <K extends keyof InvoiceSettings>(key: K, value: InvoiceSettings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await saveInvoiceSettings(settings);
      logAction("Updated invoice details", settings.legalName);
      toast({ title: "Bill details saved", description: "New bills will use these details." });
    } catch (error) {
      toast({ title: "Could not save", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 font-display text-lg text-foreground">
        <FileText className="h-5 w-5 text-gold" /> Bill / invoice details
      </h2>
      <p className="mt-1 font-body text-sm text-muted-foreground">
        These appear on every printed bill. Add your GSTIN to issue proper tax invoices.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-2">
          <label className={labelClass}>Business name (as it should print)</label>
          <input value={settings.legalName} onChange={(e) => set("legalName", e.target.value)} className={inputClass} />
        </div>

        <div className="min-w-0 sm:col-span-2">
          <label className={labelClass}>Address (one line per row)</label>
          <textarea
            value={settings.addressLines.join("\n")}
            onChange={(e) => set("addressLines", e.target.value.split("\n"))}
            rows={3}
            className={inputClass}
            placeholder={"Plot 12, Road No. 4\nBanjara Hills, Hyderabad\nTelangana 500034"}
          />
        </div>

        <div className="min-w-0">
          <label className={labelClass}>GSTIN</label>
          <input value={settings.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} className={inputClass} placeholder="36ABCDE1234F1Z5" />
          <p className="mt-1 font-body text-[0.7rem] text-muted-foreground">Leave blank if you are not GST registered — bills then print as a plain receipt.</p>
        </div>

        <div className="min-w-0">
          <label className={labelClass}>Place of supply (state)</label>
          <input value={settings.placeOfSupply} onChange={(e) => set("placeOfSupply", e.target.value)} className={inputClass} placeholder="Telangana" />
        </div>

        <div className="min-w-0">
          <label className={labelClass}>Phone</label>
          <input value={settings.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
        </div>
        <div className="min-w-0">
          <label className={labelClass}>Email</label>
          <input value={settings.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
        </div>
        <div className="min-w-0">
          <label className={labelClass}>Website</label>
          <input value={settings.website} onChange={(e) => set("website", e.target.value)} className={inputClass} placeholder="javanilife.com" />
        </div>

        <div className="min-w-0">
          <label className={labelClass}>SAC code</label>
          <input value={settings.sacCode} onChange={(e) => set("sacCode", e.target.value)} className={inputClass} />
          <p className="mt-1 font-body text-[0.7rem] text-muted-foreground">999293 = training &amp; coaching services.</p>
        </div>

        <div className="min-w-0">
          <label className={labelClass}>How tax is shown</label>
          <select value={settings.taxMode} onChange={(e) => set("taxMode", e.target.value as TaxMode)} className={inputClass}>
            <option value="cgst-sgst">CGST + SGST (same state — usual)</option>
            <option value="igst">IGST (other state)</option>
            <option value="none">Single tax line</option>
          </select>
        </div>

        <div className="min-w-0">
          <label className={labelClass}>Signatory name</label>
          <input value={settings.signatoryName} onChange={(e) => set("signatoryName", e.target.value)} className={inputClass} />
        </div>
        <div className="min-w-0">
          <label className={labelClass}>Signatory title</label>
          <input value={settings.signatoryTitle} onChange={(e) => set("signatoryTitle", e.target.value)} className={inputClass} />
        </div>

        <div className="min-w-0 sm:col-span-2">
          <label className={labelClass}>Terms printed on the bill (one per row)</label>
          <textarea
            value={settings.termsLines.join("\n")}
            onChange={(e) => set("termsLines", e.target.value.split("\n"))}
            rows={3}
            className={inputClass}
          />
        </div>

        <div className="min-w-0 sm:col-span-2">
          <label className={labelClass}>Logo URL (optional — leave blank to use the Javani logo)</label>
          <input value={settings.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} className={inputClass} placeholder="https://…" />
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="mt-4 flex min-h-10 items-center gap-2 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save bill details
      </button>
    </div>
  );
};

export default InvoiceSettingsPanel;
