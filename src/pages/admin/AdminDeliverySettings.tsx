import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { Calculator, Gift, PackageCheck, Ruler, ShieldCheck, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import {
  BASE_DELIVERY_CHARGE_IN_PAISE,
  calculateDeliveryEstimate,
  DEFAULT_DELIVERY_PROVIDER,
  DEFAULT_ITEM_WEIGHT_IN_GRAMS,
  DELIVERY_SETTINGS_DOCUMENT_ID,
  DELIVERY_SLAB_WEIGHT_IN_GRAMS,
  EXTRA_DELIVERY_SLAB_CHARGE_IN_PAISE,
  formatPaiseAsRupees,
  formatShipmentWeight,
  normalizeDeliveryPricingSettings,
  parsePriceToPaise,
  type CartItem,
  type DeliveryPricingSettings,
} from "@/lib/ecommerce";

const previewProductId = "delivery-preview";

const createPreviewItem = (quantity: number): CartItem => ({
  productId: previewProductId,
  name: "Preview package",
  category: "accessories",
  categoryLabel: "Practice Accessories",
  quantity,
  amountInPaise: 0,
  displayPrice: "₹0/-",
  stockStatus: "available",
});

const AdminDeliverySettings = () => {
  const { toast } = useToast();
  const [deliveryPricing, setDeliveryPricing] = useState<Required<DeliveryPricingSettings>>(normalizeDeliveryPricingSettings());
  const [baseRateRupees, setBaseRateRupees] = useState(String(BASE_DELIVERY_CHARGE_IN_PAISE / 100));
  const [freeDeliveryEnabled, setFreeDeliveryEnabled] = useState(false);
  const [freeDeliveryMinRupees, setFreeDeliveryMinRupees] = useState("");
  const [freeDeliveryMessage, setFreeDeliveryMessage] = useState("Free delivery unlocked");
  const [saving, setSaving] = useState(false);
  const [previewWeight, setPreviewWeight] = useState(String(DEFAULT_ITEM_WEIGHT_IN_GRAMS));
  const [previewQuantity, setPreviewQuantity] = useState("1");
  const [previewSubtotalRupees, setPreviewSubtotalRupees] = useState("1200");

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "siteSettings", DELIVERY_SETTINGS_DOCUMENT_ID), (snapshot) => {
      const nextPricing = normalizeDeliveryPricingSettings(snapshot.exists() ? snapshot.data() as DeliveryPricingSettings : undefined);
      setDeliveryPricing(nextPricing);
      setBaseRateRupees(String(nextPricing.baseChargeInPaise / 100));
      setFreeDeliveryEnabled(nextPricing.freeDeliveryEnabled);
      setFreeDeliveryMinRupees(nextPricing.freeDeliveryMinSubtotalInPaise > 0 ? String(nextPricing.freeDeliveryMinSubtotalInPaise / 100) : "");
      setFreeDeliveryMessage(nextPricing.freeDeliveryMessage);
    });

    return unsubscribe;
  }, []);

  const parsedBaseRateInPaise = parsePriceToPaise(baseRateRupees);
  const baseRateError = !parsedBaseRateInPaise || parsedBaseRateInPaise <= 0 ? "Enter a valid amount greater than 0." : "";
  const parsedFreeDeliveryMinInPaise = parsePriceToPaise(freeDeliveryMinRupees);
  const freeDeliveryError = freeDeliveryEnabled && (!parsedFreeDeliveryMinInPaise || parsedFreeDeliveryMinInPaise <= 0)
    ? "Enter a minimum order amount greater than 0."
    : "";

  const ruleCards = [
    {
      label: "Default item weight",
      value: formatShipmentWeight(DEFAULT_ITEM_WEIGHT_IN_GRAMS),
      detail: "Used when product weight is not saved yet.",
      icon: PackageCheck,
    },
    {
      label: "Base slab",
      value: formatShipmentWeight(DELIVERY_SLAB_WEIGHT_IN_GRAMS),
      detail: `${formatPaiseAsRupees(deliveryPricing.baseChargeInPaise)} for the first slab.`,
      icon: Ruler,
    },
    {
      label: "Extra slab charge",
      value: formatPaiseAsRupees(EXTRA_DELIVERY_SLAB_CHARGE_IN_PAISE),
      detail: `Added for every extra ${formatShipmentWeight(DELIVERY_SLAB_WEIGHT_IN_GRAMS)} slab.`,
      icon: Calculator,
    },
    {
      label: "Provider mode",
      value: DEFAULT_DELIVERY_PROVIDER === "delivery-one" ? "Delivery One" : "Manual",
      detail: "Orders are prepared for manual-ready shipment handoff.",
      icon: Truck,
    },
  ];

  const handleSavePricing = async () => {
    if (baseRateError || !parsedBaseRateInPaise) {
      toast({ title: "Invalid base rate", description: "Enter a valid rupee amount for the first 500 g slab.", variant: "destructive" });
      return;
    }
    if (freeDeliveryError) {
      toast({ title: "Invalid free delivery rule", description: freeDeliveryError, variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, "siteSettings", DELIVERY_SETTINGS_DOCUMENT_ID), {
        baseChargeInPaise: parsedBaseRateInPaise,
        freeDeliveryEnabled,
        freeDeliveryMinSubtotalInPaise: freeDeliveryEnabled ? parsedFreeDeliveryMinInPaise : 0,
        freeDeliveryMessage: freeDeliveryMessage.trim() || "Free delivery unlocked",
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast({ title: "Delivery settings saved", description: `The first ${formatShipmentWeight(DELIVERY_SLAB_WEIGHT_IN_GRAMS)} slab now charges ${formatPaiseAsRupees(parsedBaseRateInPaise)}.` });
    } catch (error) {
      console.error("Unable to save delivery settings", error);
      toast({ title: "Save failed", description: "Could not update the delivery base rate right now.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const previewEstimate = useMemo(() => {
    const weightInGrams = Math.max(1, Math.floor(Number(previewWeight) || DEFAULT_ITEM_WEIGHT_IN_GRAMS));
    const quantity = Math.max(1, Math.floor(Number(previewQuantity) || 1));
    const subtotalInPaise = parsePriceToPaise(previewSubtotalRupees) || 0;
    return calculateDeliveryEstimate([createPreviewItem(quantity)], {
      [previewProductId]: { weightInGrams },
    }, deliveryPricing, { subtotalInPaise });
  }, [deliveryPricing, previewQuantity, previewSubtotalRupees, previewWeight]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-gold">Phase 11</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-foreground sm:text-3xl">Delivery Settings</h2>
          <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-muted-foreground">
            Current checkout charges use weight slabs and product shipment profiles. Delivery One is prepared as a manual-ready provider until live API credentials are connected.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-gold/25 bg-gold/10 px-4 py-2 font-body text-xs font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-gold" /> Manual-ready handoff
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ruleCards.map((rule) => (
          <section key={rule.label} className="rounded-lg border border-border/70 bg-card p-5 shadow-card">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-gold/10 text-gold">
              <rule.icon className="h-5 w-5" />
            </div>
            <p className="font-body text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{rule.label}</p>
            <p className="mt-2 font-display text-2xl font-semibold text-foreground">{rule.value}</p>
            <p className="mt-2 font-body text-sm leading-relaxed text-muted-foreground">{rule.detail}</p>
          </section>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-border/70 bg-card p-5 shadow-card sm:p-6">
          <div className="mb-6 rounded-lg border border-gold/20 bg-background/80 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <label className="block flex-1 font-body text-sm font-semibold text-foreground">
                First 500 g slab charge (Rs.)
                <input
                  value={baseRateRupees}
                  onChange={(event) => setBaseRateRupees(event.target.value.replace(/[^0-9.]/g, ""))}
                  className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20"
                  inputMode="decimal"
                  placeholder="70"
                />
              </label>
              <button
                type="button"
                onClick={handleSavePricing}
                disabled={saving || Boolean(baseRateError) || Boolean(freeDeliveryError)}
                className="inline-flex h-11 items-center justify-center rounded-sm bg-gold px-5 font-display text-sm font-semibold tracking-[0.08em] text-charcoal transition-colors hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Delivery Settings"}
              </button>
            </div>
            <p className="mt-2 font-body text-xs text-muted-foreground">This amount is used for the first {formatShipmentWeight(DELIVERY_SLAB_WEIGHT_IN_GRAMS)} charged at checkout.</p>
            {baseRateError && <p className="mt-2 font-body text-xs text-destructive">{baseRateError}</p>}

            <div className="mt-5 rounded-lg border border-border bg-card p-4">
              <label className="flex cursor-pointer items-center justify-between gap-3 font-body text-sm font-semibold text-foreground">
                <span className="flex items-center gap-2"><Gift className="h-4 w-4 text-gold" /> Free delivery above minimum order</span>
                <input type="checkbox" checked={freeDeliveryEnabled} onChange={(event) => setFreeDeliveryEnabled(event.target.checked)} />
              </label>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="font-body text-sm font-semibold text-foreground">
                  Minimum order amount (Rs.)
                  <input
                    value={freeDeliveryMinRupees}
                    onChange={(event) => setFreeDeliveryMinRupees(event.target.value.replace(/[^0-9.]/g, ""))}
                    disabled={!freeDeliveryEnabled}
                    className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20 disabled:opacity-60"
                    inputMode="decimal"
                    placeholder="1500"
                  />
                </label>
                <label className="font-body text-sm font-semibold text-foreground">
                  Checkout message
                  <input
                    value={freeDeliveryMessage}
                    onChange={(event) => setFreeDeliveryMessage(event.target.value)}
                    disabled={!freeDeliveryEnabled}
                    className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20 disabled:opacity-60"
                    placeholder="Free delivery unlocked"
                  />
                </label>
              </div>
              {freeDeliveryError && <p className="mt-2 font-body text-xs text-destructive">{freeDeliveryError}</p>}
            </div>
          </div>

          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/10 text-gold">
              <Calculator className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-xl font-semibold text-foreground">Delivery Charge Preview</h3>
              <p className="font-body text-sm text-muted-foreground">Preview the same slab calculation used at checkout.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="font-body text-sm font-semibold text-foreground">
              Product weight per item (g)
              <input
                value={previewWeight}
                onChange={(event) => setPreviewWeight(event.target.value.replace(/[^0-9]/g, ""))}
                className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20"
                inputMode="numeric"
              />
            </label>
            <label className="font-body text-sm font-semibold text-foreground">
              Quantity
              <input
                value={previewQuantity}
                onChange={(event) => setPreviewQuantity(event.target.value.replace(/[^0-9]/g, ""))}
                className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20"
                inputMode="numeric"
              />
            </label>
            <label className="font-body text-sm font-semibold text-foreground sm:col-span-2">
              Cart subtotal for free-delivery preview (Rs.)
              <input
                value={previewSubtotalRupees}
                onChange={(event) => setPreviewSubtotalRupees(event.target.value.replace(/[^0-9.]/g, ""))}
                className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20"
                inputMode="decimal"
              />
            </label>
          </div>

          <div className="mt-5 grid gap-3 rounded-lg border border-gold/20 bg-gold/10 p-4 font-body text-sm sm:grid-cols-3">
            <div>
              <span className="block text-muted-foreground">Billable weight</span>
              <span className="mt-1 block font-semibold text-foreground">{formatShipmentWeight(previewEstimate.weightInGrams)}</span>
            </div>
            <div>
              <span className="block text-muted-foreground">Delivery charge</span>
              <span className="mt-1 block font-semibold text-foreground">{formatPaiseAsRupees(previewEstimate.chargeInPaise)}</span>
              {previewEstimate.originalChargeInPaise && <span className="mt-1 block text-[0.72rem] text-muted-foreground line-through">{formatPaiseAsRupees(previewEstimate.originalChargeInPaise)}</span>}
            </div>
            <div>
              <span className="block text-muted-foreground">Fallback weight</span>
              <span className="mt-1 block font-semibold text-foreground">{previewEstimate.usesFallbackWeight ? "Used" : "Not used"}</span>
            </div>
          </div>
        </section>

        <aside className="rounded-lg border border-border/70 bg-card p-5 shadow-card sm:p-6">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-gold/10 text-gold">
            <Truck className="h-5 w-5" />
          </div>
          <h3 className="font-display text-xl font-semibold text-foreground">Delivery One Payload</h3>
          <div className="mt-4 space-y-3 font-body text-sm text-muted-foreground">
            <p>Orders now keep package weight, fallback status, delivery charge, provider mode, and per-item shipment snapshots.</p>
            <p>The adapter helper can turn those snapshots into a Delivery One shipment payload when live credentials and endpoint details are ready.</p>
          </div>
          <div className="mt-5 rounded-lg border border-border bg-background/70 p-4 font-body text-xs text-muted-foreground">
            Required data: customer, destination, payment method, COD amount, package weight, delivery charge, and product shipment lines.
          </div>
        </aside>
      </div>
    </div>
  );
};

export default AdminDeliverySettings;
