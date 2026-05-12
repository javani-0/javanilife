import { useEffect, useMemo, useState } from "react";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { BadgeIndianRupee, Gift, Percent, Plus, TicketPercent, Trash2 } from "lucide-react";
import { useCoupons } from "@/hooks/useCoupons";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import {
  formatCouponBenefit,
  formatPaiseAsRupees,
  normalizeCouponCode,
  parsePriceToPaise,
  type Coupon,
  type CouponType,
} from "@/lib/ecommerce";

interface CouponFormState {
  code: string;
  title: string;
  description: string;
  type: CouponType;
  value: string;
  maxDiscountRupees: string;
  minSubtotalRupees: string;
  active: boolean;
  visibleAtCheckout: boolean;
  startsAt: string;
  expiresAt: string;
  maxRedemptions: string;
  applicableItemScope: "all" | "product" | "course";
  applicableCategoryIds: string;
  applicableProductIds: string;
}

const emptyForm: CouponFormState = {
  code: "",
  title: "",
  description: "",
  type: "percentage",
  value: "10",
  maxDiscountRupees: "",
  minSubtotalRupees: "",
  active: true,
  visibleAtCheckout: true,
  startsAt: "",
  expiresAt: "",
  maxRedemptions: "",
  applicableItemScope: "all",
  applicableCategoryIds: "",
  applicableProductIds: "",
};

const inputClass = "mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20 disabled:opacity-60";
const textAreaClass = "mt-2 w-full rounded-md border border-border bg-background px-3 py-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20";
const labelClass = "font-body text-sm font-semibold text-foreground";

const joinList = (value?: string[]) => value?.join(", ") || "";
const splitList = (value: string) => value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
const dateInputValue = (value: unknown) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
};

const couponToForm = (coupon: Coupon): CouponFormState => ({
  code: coupon.code,
  title: coupon.title,
  description: coupon.description || "",
  type: coupon.type,
  value: coupon.type === "percentage" ? String(coupon.value) : String(coupon.value / 100),
  maxDiscountRupees: coupon.maxDiscountInPaise ? String(coupon.maxDiscountInPaise / 100) : "",
  minSubtotalRupees: coupon.minSubtotalInPaise ? String(coupon.minSubtotalInPaise / 100) : "",
  active: coupon.active,
  visibleAtCheckout: coupon.visibleAtCheckout,
  startsAt: dateInputValue(coupon.startsAt),
  expiresAt: dateInputValue(coupon.expiresAt),
  maxRedemptions: coupon.maxRedemptions ? String(coupon.maxRedemptions) : "",
  applicableItemScope: coupon.applicableItemTypes?.[0] || "all",
  applicableCategoryIds: joinList(coupon.applicableCategoryIds),
  applicableProductIds: joinList(coupon.applicableProductIds),
});

const getCouponValueInStoreUnits = (form: CouponFormState) => {
  if (form.type === "percentage") {
    const value = Number(form.value);
    return Number.isFinite(value) ? Math.max(0, value) : null;
  }
  if (form.type === "free_delivery") return 0;
  return parsePriceToPaise(form.value);
};

const AdminCoupons = () => {
  const { coupons, loading } = useCoupons();
  const { toast } = useToast();
  const [form, setForm] = useState<CouponFormState>(emptyForm);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sortedCoupons = useMemo(() => [...coupons].sort((first, second) => Number(second.active) - Number(first.active) || first.code.localeCompare(second.code)), [coupons]);
  const activeCount = useMemo(() => coupons.filter((coupon) => coupon.active).length, [coupons]);
  const visibleCount = useMemo(() => coupons.filter((coupon) => coupon.visibleAtCheckout).length, [coupons]);

  useEffect(() => {
    if (form.type === "free_delivery") setForm((currentForm) => ({ ...currentForm, value: "0", maxDiscountRupees: "" }));
  }, [form.type]);

  const resetForm = () => {
    setEditingCode(null);
    setForm(emptyForm);
  };

  const editCoupon = (coupon: Coupon) => {
    setEditingCode(coupon.code);
    setForm(couponToForm(coupon));
  };

  const validateForm = () => {
    const code = normalizeCouponCode(form.code);
    const value = getCouponValueInStoreUnits(form);
    const maxDiscount = parsePriceToPaise(form.maxDiscountRupees);
    const minSubtotal = parsePriceToPaise(form.minSubtotalRupees);
    const maxRedemptions = Number(form.maxRedemptions);

    if (!code) return "Coupon code is required.";
    if (!form.title.trim()) return "Coupon title is required.";
    if (form.type !== "free_delivery" && (!value || value <= 0)) return "Enter a valid coupon value.";
    if (form.type === "percentage" && value && value > 100) return "Percentage coupons cannot be more than 100%.";
    if (form.maxDiscountRupees.trim() && (!maxDiscount || maxDiscount <= 0)) return "Enter a valid max discount amount.";
    if (form.minSubtotalRupees.trim() && (!minSubtotal || minSubtotal <= 0)) return "Enter a valid minimum subtotal amount.";
    if (form.maxRedemptions.trim() && (!Number.isInteger(maxRedemptions) || maxRedemptions <= 0)) return "Max redemptions must be a whole number greater than 0.";
    return null;
  };

  const saveCoupon = async () => {
    const validationError = validateForm();
    if (validationError) {
      toast({ title: "Invalid coupon", description: validationError, variant: "destructive" });
      return;
    }

    const code = normalizeCouponCode(form.code);
    const value = getCouponValueInStoreUnits(form) || 0;
    const maxDiscountInPaise = parsePriceToPaise(form.maxDiscountRupees);
    const minSubtotalInPaise = parsePriceToPaise(form.minSubtotalRupees);
    const maxRedemptions = Number(form.maxRedemptions);
    const applicableItemTypes = form.applicableItemScope === "all" ? [] : [form.applicableItemScope];

    setSaving(true);
    try {
      if (editingCode && editingCode !== code) await deleteDoc(doc(db, "coupons", editingCode));
      await setDoc(doc(db, "coupons", code), {
        code,
        title: form.title.trim(),
        description: form.description.trim(),
        type: form.type,
        value,
        maxDiscountInPaise: maxDiscountInPaise || 0,
        minSubtotalInPaise: minSubtotalInPaise || 0,
        active: form.active,
        visibleAtCheckout: form.visibleAtCheckout,
        startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00.000`).toISOString() : null,
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59.999`).toISOString() : null,
        maxRedemptions: form.maxRedemptions.trim() ? maxRedemptions : 0,
        applicableItemTypes,
        applicableCategoryIds: splitList(form.applicableCategoryIds),
        applicableProductIds: splitList(form.applicableProductIds),
        updatedAt: serverTimestamp(),
        ...(editingCode ? {} : { createdAt: serverTimestamp(), redeemedCount: 0 }),
      }, { merge: true });
      toast({ title: editingCode ? "Coupon updated" : "Coupon created", description: `${code} is ready for checkout.` });
      resetForm();
    } catch (error) {
      console.error("Unable to save coupon", error);
      toast({ title: "Save failed", description: "Could not save this coupon right now.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteCoupon = async (coupon: Coupon) => {
    if (!window.confirm(`Delete coupon ${coupon.code}?`)) return;
    try {
      await deleteDoc(doc(db, "coupons", coupon.code));
      toast({ title: "Coupon deleted", description: `${coupon.code} has been removed.` });
      if (editingCode === coupon.code) resetForm();
    } catch (error) {
      console.error("Unable to delete coupon", error);
      toast({ title: "Delete failed", description: "Could not delete this coupon right now.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-gold">Promotions</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-foreground sm:text-3xl">Discount Coupons</h2>
          <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-muted-foreground">
            Create checkout-visible coupon offers for percentage discounts, fixed amount discounts, or free delivery.
          </p>
        </div>
        <button type="button" onClick={resetForm} className="inline-flex w-fit items-center gap-2 rounded-sm bg-gold px-5 py-3 font-display text-sm font-semibold tracking-[0.08em] text-charcoal transition-colors hover:bg-gold-light">
          <Plus className="h-4 w-4" /> New Coupon
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-lg border border-border/70 bg-card p-5 shadow-card">
          <TicketPercent className="mb-3 h-5 w-5 text-gold" />
          <p className="font-body text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Total coupons</p>
          <p className="mt-2 font-display text-3xl font-semibold text-foreground">{coupons.length}</p>
        </section>
        <section className="rounded-lg border border-border/70 bg-card p-5 shadow-card">
          <Gift className="mb-3 h-5 w-5 text-gold" />
          <p className="font-body text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Active</p>
          <p className="mt-2 font-display text-3xl font-semibold text-foreground">{activeCount}</p>
        </section>
        <section className="rounded-lg border border-border/70 bg-card p-5 shadow-card">
          <Percent className="mb-3 h-5 w-5 text-gold" />
          <p className="font-body text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Visible checkout offers</p>
          <p className="mt-2 font-display text-3xl font-semibold text-foreground">{visibleCount}</p>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <section className="rounded-lg border border-border/70 bg-card p-5 shadow-card sm:p-6">
          <h3 className="font-display text-xl font-semibold text-foreground">{editingCode ? `Edit ${editingCode}` : "Create Coupon"}</h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <label className={labelClass}>Code
              <input value={form.code} onChange={(event) => setForm({ ...form, code: normalizeCouponCode(event.target.value) })} className={inputClass} placeholder="SAVE10" />
            </label>
            <label className={labelClass}>Title
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} placeholder="Save 10%" />
            </label>
            <label className={`${labelClass} sm:col-span-2 xl:col-span-1`}>Description
              <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} className={textAreaClass} placeholder="Shown on the checkout coupon card" />
            </label>
            <label className={labelClass}>Type
              <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as CouponType })} className={inputClass}>
                <option value="percentage">Percentage</option>
                <option value="fixed_amount">Fixed amount</option>
                <option value="free_delivery">Free delivery</option>
              </select>
            </label>
            <label className={labelClass}>{form.type === "percentage" ? "Percentage" : "Amount (Rs.)"}
              <div className="relative">
                {form.type === "percentage" ? <Percent className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /> : <BadgeIndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />}
                <input value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value.replace(/[^0-9.]/g, "") })} disabled={form.type === "free_delivery"} className={`${inputClass} pl-10`} inputMode="decimal" />
              </div>
            </label>
            <label className={labelClass}>Max discount (Rs.)
              <input value={form.maxDiscountRupees} onChange={(event) => setForm({ ...form, maxDiscountRupees: event.target.value.replace(/[^0-9.]/g, "") })} disabled={form.type !== "percentage"} className={inputClass} placeholder="Optional" inputMode="decimal" />
            </label>
            <label className={labelClass}>Minimum subtotal (Rs.)
              <input value={form.minSubtotalRupees} onChange={(event) => setForm({ ...form, minSubtotalRupees: event.target.value.replace(/[^0-9.]/g, "") })} className={inputClass} placeholder="Optional" inputMode="decimal" />
            </label>
            <label className={labelClass}>Item scope
              <select value={form.applicableItemScope} onChange={(event) => setForm({ ...form, applicableItemScope: event.target.value as CouponFormState["applicableItemScope"] })} className={inputClass}>
                <option value="all">Products and courses</option>
                <option value="product">Products only</option>
                <option value="course">Courses only</option>
              </select>
            </label>
            <label className={labelClass}>Category IDs
              <input value={form.applicableCategoryIds} onChange={(event) => setForm({ ...form, applicableCategoryIds: event.target.value })} className={inputClass} placeholder="Optional, comma-separated" />
            </label>
            <label className={labelClass}>Product/Course IDs
              <input value={form.applicableProductIds} onChange={(event) => setForm({ ...form, applicableProductIds: event.target.value })} className={inputClass} placeholder="Optional, comma-separated" />
            </label>
            <label className={labelClass}>Starts
              <input type="date" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} className={inputClass} />
            </label>
            <label className={labelClass}>Expires
              <input type="date" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} className={inputClass} />
            </label>
            <label className={labelClass}>Max redemptions
              <input value={form.maxRedemptions} onChange={(event) => setForm({ ...form, maxRedemptions: event.target.value.replace(/[^0-9]/g, "") })} className={inputClass} placeholder="Optional" inputMode="numeric" />
            </label>
            <div className="grid gap-3 sm:col-span-2 xl:col-span-1">
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm font-semibold text-foreground">
                Active
                <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm font-semibold text-foreground">
                Visible in checkout
                <input type="checkbox" checked={form.visibleAtCheckout} onChange={(event) => setForm({ ...form, visibleAtCheckout: event.target.checked })} />
              </label>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            {editingCode && <button type="button" onClick={resetForm} className="rounded-md border border-border px-5 py-2.5 font-body text-sm font-semibold text-muted-foreground hover:bg-muted">Cancel Edit</button>}
            <button type="button" onClick={saveCoupon} disabled={saving} className="rounded-md bg-gradient-primary px-5 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
              {saving ? "Saving..." : editingCode ? "Update Coupon" : "Create Coupon"}
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-border/70 bg-card shadow-card">
          <div className="border-b border-border p-5 sm:p-6">
            <h3 className="font-display text-xl font-semibold text-foreground">Coupon Library</h3>
            <p className="mt-1 font-body text-sm text-muted-foreground">Checkout shows active coupons marked visible.</p>
          </div>
          <div className="divide-y divide-border">
            {loading ? (
              <div className="p-6 font-body text-sm text-muted-foreground">Loading coupons...</div>
            ) : sortedCoupons.length === 0 ? (
              <div className="p-6 font-body text-sm text-muted-foreground">No coupons yet. Create one to show offers at checkout.</div>
            ) : sortedCoupons.map((coupon) => (
              <article key={coupon.code} className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-start sm:p-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-gold/10 px-3 py-1 font-body text-xs font-bold text-gold">{coupon.code}</span>
                    <span className={`rounded-full px-2.5 py-1 font-body text-[0.68rem] font-bold ${coupon.active ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{coupon.active ? "Active" : "Inactive"}</span>
                    {coupon.visibleAtCheckout && <span className="rounded-full bg-background px-2.5 py-1 font-body text-[0.68rem] font-bold text-muted-foreground">Checkout visible</span>}
                  </div>
                  <h4 className="mt-3 font-display text-lg font-semibold text-foreground">{coupon.title}</h4>
                  {coupon.description && <p className="mt-1 font-body text-sm text-muted-foreground">{coupon.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-2 font-body text-xs text-muted-foreground">
                    <span className="rounded-full border border-border px-2.5 py-1">{formatCouponBenefit(coupon)}</span>
                    {coupon.minSubtotalInPaise ? <span className="rounded-full border border-border px-2.5 py-1">Min {formatPaiseAsRupees(coupon.minSubtotalInPaise)}</span> : null}
                    {coupon.applicableItemTypes?.length ? <span className="rounded-full border border-border px-2.5 py-1">{coupon.applicableItemTypes.join(", ")}</span> : null}
                  </div>
                </div>
                <div className="flex gap-2 sm:justify-end">
                  <button type="button" onClick={() => editCoupon(coupon)} className="rounded-md border border-border px-4 py-2 font-body text-sm font-semibold text-foreground hover:border-gold hover:text-gold">Edit</button>
                  <button type="button" onClick={() => void deleteCoupon(coupon)} className="rounded-md border border-destructive/30 px-3 py-2 text-destructive hover:bg-destructive/10" aria-label={`Delete ${coupon.code}`}><Trash2 className="h-4 w-4" /></button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminCoupons;
