import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";
import { Plus, Pencil, Trash2, X, Upload, BadgeIndianRupee, AlertTriangle, GraduationCap, CalendarRange, Repeat, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatPaiseAsRupees, parsePriceToPaise } from "@/lib/ecommerce";
import {
  AUTOPAY_AFA_CAP_IN_PAISE,
  CLASSES_COLLECTION,
  buildClassEmiPlan,
  clampBillingDay,
  classOffersMonthly,
  classOffersTerm,
  composeSchedule,
  DEFAULT_CLASS_EMI_CONFIG,
  getAutopayFeeLabel,
  getClassFeeLabel,
  getTermPayFullOfferLabel,
  getTermPayFullPriceInPaise,
  hasAutopayDiscount,
  hasTermPayFullOffer,
  monthsBetween,
  subscribeToClasses,
  upsertClass,
  WEEKDAYS,
  type ClassDoc,
  type ClassEmiConfig,
  type ClassTimeSlot,
} from "@/lib/classes";

interface SlotFormState {
  id: string;
  days: string[];
  start: string;
  end: string;
  seats: string;
}

interface ClassFormState {
  name: string;
  description: string;
  image: string;
  scheduleDays: string[];
  scheduleStart: string;
  scheduleEnd: string;
  ageFrom: string;
  ageTo: string;
  facultyName: string;
  feeRupees: string;
  autopayDiscountRupees: string;
  billingDayOfMonth: string;
  seatsTotal: string;
  active: boolean;
  // New: track capabilities (a class can offer monthly, term, or both) + term
  // fields + pay-full offer + payment options + EMI split + time slots.
  offersMonthly: boolean;
  offersTerm: boolean;
  termFeeRupees: string;
  startDate: string;
  endDate: string;
  termFreeMonths: string;
  payAutopay: boolean;
  payManual: boolean;
  payFull: boolean;
  payEmi: boolean;
  payCash: boolean;
  emiUpfront: string;        // "50"
  emiInstallments: string;   // "25, 25"
  timeSlots: SlotFormState[];
}

const defaultForm: ClassFormState = {
  name: "",
  description: "",
  image: "",
  scheduleDays: [],
  scheduleStart: "",
  scheduleEnd: "",
  ageFrom: "",
  ageTo: "",
  facultyName: "",
  feeRupees: "",
  autopayDiscountRupees: "",
  billingDayOfMonth: "5",
  seatsTotal: "",
  active: true,
  offersMonthly: true,
  offersTerm: false,
  termFeeRupees: "",
  startDate: "",
  endDate: "",
  termFreeMonths: "",
  payAutopay: true,
  payManual: true,
  payFull: true,
  payEmi: true,
  payCash: false,
  emiUpfront: String(DEFAULT_CLASS_EMI_CONFIG.upfrontPercentage),
  emiInstallments: DEFAULT_CLASS_EMI_CONFIG.installmentPercentages.join(", "),
  timeSlots: [],
};

let slotIdCounter = 0;
const newSlot = (): SlotFormState => ({ id: `slot-${Date.now()}-${slotIdCounter++}`, days: [], start: "", end: "", seats: "" });

/** Parse "50" + "25, 25" into a ClassEmiConfig; returns null if the split is invalid. */
const parseEmiConfig = (upfrontStr: string, installmentsStr: string): { config: ClassEmiConfig | null; sum: number } => {
  const upfront = Math.round(Number(upfrontStr));
  const installments = installmentsStr
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Math.round(Number(part)));
  if (!Number.isFinite(upfront) || upfront < 1 || upfront > 99) return { config: null, sum: NaN };
  if (installments.length === 0 || installments.some((value) => !Number.isFinite(value) || value <= 0)) return { config: null, sum: NaN };
  const sum = upfront + installments.reduce((a, b) => a + b, 0);
  if (sum !== 100) return { config: null, sum };
  return { config: { upfrontPercentage: upfront, installmentPercentages: installments }, sum };
};

const inputClass = "w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background";
const labelClass = "font-body text-[0.85rem] text-muted-foreground block mb-1";

const TimePicker = ({ value, onChange }: { value: string; onChange: (val: string) => void }) => {
  const [hourStr, minuteStr] = value ? value.split(':') : ["", ""];
  const h24 = hourStr ? parseInt(hourStr, 10) : null;
  const h12 = h24 === null ? "" : (h24 % 12 === 0 ? 12 : h24 % 12).toString();
  const ampm = h24 === null ? "" : (h24 >= 12 ? "PM" : "AM");
  const minute = minuteStr || "";

  const updateTime = (newH12: string, newMin: string, newAmPm: string) => {
    if (!newH12) return onChange("");
    const minToUse = newMin || "00";
    const amPmToUse = newAmPm || "PM";
    let h = parseInt(newH12, 10);
    if (amPmToUse === "PM" && h < 12) h += 12;
    if (amPmToUse === "AM" && h === 12) h = 0;
    onChange(`${h.toString().padStart(2, '0')}:${minToUse}`);
  };

  return (
    <div className="flex gap-2">
      <select value={h12} onChange={e => updateTime(e.target.value, minute, ampm)} className="flex-1 px-2 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background">
        <option value="" disabled>HH</option>
        {Array.from({length: 12}, (_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
      </select>
      <span className="self-center font-bold text-muted-foreground">:</span>
      <select value={minute} onChange={e => updateTime(h12 || "12", e.target.value, ampm)} className="flex-1 px-2 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background">
        <option value="" disabled>MM</option>
        {Array.from({length: 60}, (_, i) => i.toString().padStart(2, '0')).map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select value={ampm} onChange={e => updateTime(h12 || "12", minute, e.target.value)} className="flex-[1.2] px-2 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background">
        <option value="" disabled>AM/PM</option>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
};

const AdminClasses = () => {
  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<ClassFormState>(defaultForm);
  const [imageUploading, setImageUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => subscribeToClasses(setClasses, (error) => {
    console.error("Unable to load classes", error);
  }), []);

  const sortedClasses = useMemo(() => [...classes].sort((a, b) => a.name.localeCompare(b.name)), [classes]);

  const monthlyFeePreviewInPaise = parsePriceToPaise(form.feeRupees) || 0;
  const termFeePreviewInPaise = parsePriceToPaise(form.termFeeRupees) || 0;
  const overAfaCap = form.offersMonthly && monthlyFeePreviewInPaise > AUTOPAY_AFA_CAP_IN_PAISE;

  const emiParsed = useMemo(() => parseEmiConfig(form.emiUpfront, form.emiInstallments), [form.emiUpfront, form.emiInstallments]);
  const emiPreview = useMemo(() => {
    if (!form.offersTerm || !form.payEmi || !emiParsed.config || termFeePreviewInPaise <= 0) return null;
    return buildClassEmiPlan(termFeePreviewInPaise, emiParsed.config);
  }, [form.offersTerm, form.payEmi, emiParsed.config, termFeePreviewInPaise]);
  const durationMonths = useMemo(() => monthsBetween(form.startDate, form.endDate), [form.startDate, form.endDate]);

  // Pay-full offer preview: discounted full price after the free months.
  const freeMonthsNum = Math.max(0, Math.round(Number(form.termFreeMonths) || 0));
  const payFullPreviewInPaise = useMemo(() => {
    if (!form.offersTerm || termFeePreviewInPaise <= 0 || durationMonths <= 0 || freeMonthsNum <= 0) return null;
    return getTermPayFullPriceInPaise({
      termFeeInPaise: termFeePreviewInPaise,
      durationMonths,
      termFreeMonthsOnFullPayment: freeMonthsNum,
    });
  }, [form.offersTerm, termFeePreviewInPaise, durationMonths, freeMonthsNum]);

  const openAdd = () => { setForm(defaultForm); setEditing(null); setShowModal(true); };
  const openEdit = (classDoc: ClassDoc) => {
    setForm({
      name: classDoc.name,
      description: classDoc.description || "",
      image: classDoc.image || "",
      scheduleDays: classDoc.scheduleDays || [],
      scheduleStart: classDoc.scheduleStart || "",
      scheduleEnd: classDoc.scheduleEnd || "",
      ageFrom: classDoc.ageFrom != null ? String(classDoc.ageFrom) : "",
      ageTo: classDoc.ageTo != null ? String(classDoc.ageTo) : "",
      facultyName: classDoc.facultyName || "",
      feeRupees: classDoc.monthlyFeeInPaise > 0 ? String(classDoc.monthlyFeeInPaise / 100) : "",
      autopayDiscountRupees: (classDoc.autopayDiscountInPaise || 0) > 0 ? String((classDoc.autopayDiscountInPaise || 0) / 100) : "",
      billingDayOfMonth: String(classDoc.billingDayOfMonth || 5),
      seatsTotal: classDoc.seatsTotal != null ? String(classDoc.seatsTotal) : "",
      active: classDoc.active,
      offersMonthly: classOffersMonthly(classDoc),
      offersTerm: classOffersTerm(classDoc),
      termFeeRupees: (classDoc.termFeeInPaise || 0) > 0 ? String((classDoc.termFeeInPaise || 0) / 100) : "",
      startDate: classDoc.startDate || "",
      endDate: classDoc.endDate || "",
      termFreeMonths: (classDoc.termFreeMonthsOnFullPayment || 0) > 0 ? String(classDoc.termFreeMonthsOnFullPayment) : "",
      payAutopay: classDoc.payment?.autopay ?? true,
      payManual: classDoc.payment?.manual ?? true,
      payFull: classDoc.payment?.full ?? true,
      payEmi: classDoc.payment?.emi ?? false,
      payCash: classDoc.payment?.cash ?? false,
      emiUpfront: String(classDoc.emi?.upfrontPercentage ?? DEFAULT_CLASS_EMI_CONFIG.upfrontPercentage),
      emiInstallments: (classDoc.emi?.installmentPercentages ?? DEFAULT_CLASS_EMI_CONFIG.installmentPercentages).join(", "),
      timeSlots: (classDoc.timeSlots || []).map((slot) => ({
        id: slot.id,
        days: slot.days || [],
        start: slot.start || "",
        end: slot.end || "",
        seats: slot.seatsTotal != null ? String(slot.seatsTotal) : "",
      })),
    });
    setEditing(classDoc.id);
    setShowModal(true);
  };

  const addSlot = () => setForm((current) => ({ ...current, timeSlots: [...current.timeSlots, newSlot()] }));
  const removeSlot = (id: string) => setForm((current) => ({ ...current, timeSlots: current.timeSlots.filter((slot) => slot.id !== id) }));
  const updateSlot = (id: string, patch: Partial<SlotFormState>) =>
    setForm((current) => ({ ...current, timeSlots: current.timeSlots.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)) }));
  const toggleSlotDay = (id: string, day: string) =>
    setForm((current) => ({
      ...current,
      timeSlots: current.timeSlots.map((slot) =>
        slot.id === id
          ? { ...slot, days: slot.days.includes(day) ? slot.days.filter((value) => value !== day) : [...slot.days, day] }
          : slot,
      ),
    }));

  const closeModal = () => { setShowModal(false); setEditing(null); setForm(defaultForm); };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Class name required", variant: "destructive" });
      return;
    }

    const offersMonthly = form.offersMonthly;
    const offersTerm = form.offersTerm;
    const monthlyFeeInPaise = parsePriceToPaise(form.feeRupees) || 0;
    const termFeeInPaise = parsePriceToPaise(form.termFeeRupees) || 0;

    if (!offersMonthly && !offersTerm) {
      toast({ title: "Pick at least one fee type", description: "Enable Monthly class and/or Term course for this class.", variant: "destructive" });
      return;
    }

    if (offersMonthly) {
      if (monthlyFeeInPaise <= 0) {
        toast({ title: "Monthly fee required", description: "Enter a valid monthly fee.", variant: "destructive" });
        return;
      }
      if (!form.payAutopay && !form.payManual && !form.payCash) {
        toast({ title: "Select a monthly payment option", description: "Enable Autopay, Pay monthly, and/or Cash.", variant: "destructive" });
        return;
      }
    }

    if (offersTerm) {
      if (termFeeInPaise <= 0) {
        toast({ title: "Term fee required", description: "Enter a valid total course fee.", variant: "destructive" });
        return;
      }
      if (!form.startDate || !form.endDate || new Date(form.endDate) <= new Date(form.startDate)) {
        toast({ title: "Valid dates required", description: "Set a start date and a later end date.", variant: "destructive" });
        return;
      }
      if (!form.payFull && !form.payEmi) {
        toast({ title: "Select a term payment option", description: "Enable Pay Full and/or EMI for the course.", variant: "destructive" });
        return;
      }
      if (form.payEmi && !emiParsed.config) {
        toast({ title: "EMI split must total 100%", description: `Upfront + installments currently total ${Number.isNaN(emiParsed.sum) ? "an invalid value" : `${emiParsed.sum}%`}.`, variant: "destructive" });
        return;
      }
    }

    // Validate any time slots that have been started.
    const slotsWithContent = form.timeSlots.filter((slot) => slot.days.length > 0 || slot.start || slot.end);
    if (slotsWithContent.some((slot) => slot.days.length === 0 || !slot.start || !slot.end)) {
      toast({ title: "Incomplete time slot", description: "Each slot needs day(s) and a from–to time.", variant: "destructive" });
      return;
    }

    const timeSlots: ClassTimeSlot[] = slotsWithContent.map((slot, index) => ({
      id: slot.id || `slot-${index + 1}`,
      days: slot.days,
      start: slot.start,
      end: slot.end,
      label: composeSchedule(slot.days, slot.start, slot.end),
      seatsTotal: slot.seats.trim() ? Number(slot.seats) : undefined,
    }));

    setSaving(true);
    try {
      await upsertClass(editing, {
        name: form.name,
        description: form.description,
        image: form.image,
        scheduleDays: form.scheduleDays,
        scheduleStart: form.scheduleStart,
        scheduleEnd: form.scheduleEnd,
        ageFrom: form.ageFrom.trim() ? Number(form.ageFrom) : undefined,
        ageTo: form.ageTo.trim() ? Number(form.ageTo) : undefined,
        facultyName: form.facultyName,
        monthlyFeeInPaise,
        autopayDiscountInPaise: offersMonthly && form.payAutopay && form.autopayDiscountRupees.trim()
          ? (parsePriceToPaise(form.autopayDiscountRupees) || 0)
          : undefined,
        billingDayOfMonth: clampBillingDay(Number(form.billingDayOfMonth)),
        seatsTotal: form.seatsTotal.trim() ? Number(form.seatsTotal) : undefined,
        active: form.active,
        offersMonthly,
        offersTerm,
        termFeeInPaise,
        startDate: form.startDate,
        endDate: form.endDate,
        termFreeMonthsOnFullPayment: offersTerm ? Math.max(0, Math.round(Number(form.termFreeMonths) || 0)) : 0,
        // Each track's options are gated by whether that track is enabled.
        payment: {
          autopay: offersMonthly && form.payAutopay,
          manual: offersMonthly && form.payManual,
          cash: offersMonthly && form.payCash,
          full: offersTerm && form.payFull,
          emi: offersTerm && form.payEmi,
        },
        emi: offersTerm && form.payEmi ? emiParsed.config : null,
        timeSlots,
      });
      toast({ title: editing ? "Class updated" : "Class added" });
      closeModal();
    } catch (error) {
      console.error("Error saving class", error);
      toast({ title: "Error saving class", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteClass = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? Existing enrollments and fee history are not removed.`)) return;
    await deleteDoc(doc(db, CLASSES_COLLECTION, id));
    toast({ title: "Class deleted" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">Classes</p>
          <h1 className="mt-2 font-display text-3xl text-foreground">Classes Manager</h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">Recurring monthly-fee classes with autopay. Set fee, billing day, and capacity.</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-gradient-primary text-primary-foreground font-body text-[0.85rem] font-medium hover:brightness-110 self-start">
          <Plus className="w-4 h-4" /> Add Class
        </button>
      </div>

      {sortedClasses.length === 0 ? (
        <div className="rounded-xl border border-gold/15 bg-card p-10 text-center shadow-card">
          <GraduationCap className="mx-auto mb-3 h-10 w-10 text-gold" />
          <h3 className="font-display text-xl text-foreground">No classes yet</h3>
          <p className="mt-1 font-body text-sm text-muted-foreground">Add your first monthly-fee class to start enrolling students.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedClasses.map((classDoc) => (
            <div key={classDoc.id} className="bg-card shadow-card rounded-lg overflow-hidden hover:shadow-hero transition-shadow">
              {classDoc.image && (
                <div className="aspect-[3/2] overflow-hidden">
                  <img src={classDoc.image} alt={classDoc.name} className="w-full h-full object-cover" loading="lazy" />
                </div>
              )}
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex flex-wrap gap-1">
                    <span className={`px-2 py-1 rounded-full font-body text-[0.7rem] ${classDoc.active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{classDoc.active ? "Active" : "Inactive"}</span>
                    {classOffersMonthly(classDoc) && <span className="px-2 py-1 rounded-full bg-gold/15 text-gold font-body text-[0.65rem] font-semibold">Monthly</span>}
                    {classOffersTerm(classDoc) && <span className="px-2 py-1 rounded-full bg-gold/15 text-gold font-body text-[0.65rem] font-semibold">Term course</span>}
                  </div>
                  {classOffersMonthly(classDoc) && classDoc.monthlyFeeInPaise > AUTOPAY_AFA_CAP_IN_PAISE && (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-body text-[0.65rem]" title="Above ₹15,000 — autopay needs OTP each charge">
                      <AlertTriangle className="w-3 h-3" /> AFA
                    </span>
                  )}
                </div>
                <h4 className="font-display font-semibold text-[1.1rem] text-foreground mb-1">{classDoc.name}</h4>
                {classDoc.description && <p className="font-body text-[0.8rem] text-muted-foreground line-clamp-2 mb-2">{classDoc.description}</p>}
                <div className="space-y-1 font-body text-[0.78rem] text-muted-foreground mb-3">
                  {classDoc.schedule && <p>🗓 {classDoc.schedule}</p>}
                  {(classDoc.timeSlots?.length || 0) > 0 && <p>🕒 {classDoc.timeSlots!.length} time slot{classDoc.timeSlots!.length > 1 ? "s" : ""}</p>}
                  {classDoc.facultyName && <p>👤 {classDoc.facultyName}</p>}
                  {classDoc.ageGroup && <p>🎯 {classDoc.ageGroup}</p>}
                  {classOffersTerm(classDoc) && <p>📆 {classDoc.startDate || "?"} → {classDoc.endDate || "?"}{classDoc.durationMonths ? ` · ${classDoc.durationMonths} mo` : ""}</p>}
                  {classOffersMonthly(classDoc) && <p>📅 Billed on day {classDoc.billingDayOfMonth} each month</p>}
                  <p>💳 {[
                    classOffersMonthly(classDoc) && classDoc.payment?.autopay && "Autopay",
                    classOffersMonthly(classDoc) && classDoc.payment?.manual && "Pay monthly",
                    classOffersMonthly(classDoc) && classDoc.payment?.cash && "Cash",
                    classOffersTerm(classDoc) && classDoc.payment?.full && "Pay Full",
                    classOffersTerm(classDoc) && classDoc.payment?.emi && "EMI",
                  ].filter(Boolean).join(" · ") || "No payment options"}</p>
                </div>
                <p className="font-display text-[1.05rem] font-bold text-primary mb-1">{getClassFeeLabel(classDoc)}</p>
                {hasAutopayDiscount(classDoc) && (
                  <p className="font-body text-[0.78rem] text-green-700 mb-1">Autopay: <span className="font-semibold">{getAutopayFeeLabel(classDoc)}</span> <span className="text-muted-foreground">(₹{((classDoc.autopayDiscountInPaise || 0) / 100).toLocaleString("en-IN")} off)</span></p>
                )}
                {hasTermPayFullOffer(classDoc) && (
                  <p className="font-body text-[0.78rem] text-green-700 mb-3">🎁 {getTermPayFullOfferLabel(classDoc)} — pay <span className="font-semibold">{formatPaiseAsRupees(getTermPayFullPriceInPaise(classDoc))}</span></p>
                )}
                <div className="flex items-center justify-end gap-1 pt-3 border-t border-border/50">
                  <button onClick={() => openEdit(classDoc)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-gold" aria-label={`Edit ${classDoc.name}`}><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => deleteClass(classDoc.id, classDoc.name)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label={`Delete ${classDoc.name}`}><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto p-4">
          <div className="fixed inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative bg-card rounded-xl shadow-hero w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold">Class Setup</p>
                <h3 className="font-display font-semibold text-[1.3rem]">{editing ? "Edit Class" : "Add New Class"}</h3>
              </div>
              <button onClick={closeModal} aria-label="Close class form"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>Class Name *</label>
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} placeholder="Carnatic Vocals — Level 1" />
              </div>
              {/* Fee type selector — a class can offer one or both tracks. */}
              <div className="sm:col-span-2">
                <label className={labelClass}>Fee Type * <span className="font-normal text-muted-foreground">(enable one or both — parents choose)</span></label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setForm({ ...form, offersMonthly: !form.offersMonthly })} className={`flex items-center gap-2 rounded-md border px-3 py-2.5 text-left font-body text-[0.82rem] transition-colors ${form.offersMonthly ? "border-gold bg-gold/10 font-semibold text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}>
                    <input type="checkbox" readOnly checked={form.offersMonthly} className="pointer-events-none" />
                    <Repeat className="h-4 w-4" /> Monthly class
                  </button>
                  <button type="button" onClick={() => setForm({ ...form, offersTerm: !form.offersTerm })} className={`flex items-center gap-2 rounded-md border px-3 py-2.5 text-left font-body text-[0.82rem] transition-colors ${form.offersTerm ? "border-gold bg-gold/10 font-semibold text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}>
                    <input type="checkbox" readOnly checked={form.offersTerm} className="pointer-events-none" />
                    <CalendarRange className="h-4 w-4" /> Term course
                  </button>
                </div>
                <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">
                  {form.offersMonthly && form.offersTerm
                    ? "Both enabled — parents choose Monthly or Term course at enrolment."
                    : form.offersTerm
                      ? "One-time course fee for a fixed duration — parents pay in full or by EMI."
                      : "Recurring monthly fee — parents pay by autopay or monthly."}
                </p>
              </div>

              {form.offersMonthly && (
                <>
                  {form.offersTerm && (
                    <div className="sm:col-span-2 flex items-center gap-2 border-t border-border/60 pt-3">
                      <Repeat className="h-4 w-4 text-gold" />
                      <span className="font-display text-[0.95rem] font-semibold text-foreground">Monthly class</span>
                    </div>
                  )}
                  <div>
                    <label className={labelClass}>Monthly Fee *</label>
                    <div className="relative">
                      <BadgeIndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input value={form.feeRupees} onChange={(event) => setForm({ ...form, feeRupees: event.target.value })} className={`${inputClass} pl-10`} inputMode="decimal" placeholder="2500" />
                    </div>
                    <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">Preview: <span className="font-semibold text-gold">{monthlyFeePreviewInPaise ? formatPaiseAsRupees(monthlyFeePreviewInPaise) : "Enter fee"}</span></p>
                  </div>
                  {form.payAutopay && (
                    <div>
                      <label className={labelClass}>Autopay Discount (₹)</label>
                      <div className="relative">
                        <BadgeIndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input value={form.autopayDiscountRupees} onChange={(event) => setForm({ ...form, autopayDiscountRupees: event.target.value })} className={`${inputClass} pl-10`} inputMode="decimal" placeholder="0 (no discount)" />
                      </div>
                      {(() => {
                        const discountPaise = parsePriceToPaise(form.autopayDiscountRupees) || 0;
                        const autopayFee = monthlyFeePreviewInPaise - discountPaise;
                        if (discountPaise > 0 && monthlyFeePreviewInPaise > 0) {
                          if (autopayFee < 100) {
                            return <p className="mt-1 font-body text-[0.72rem] text-destructive">Discount too high — autopay fee must be at least ₹1.</p>;
                          }
                          return <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">Autopay price: <span className="font-semibold text-green-700">{formatPaiseAsRupees(autopayFee)}/mo</span> <span className="text-muted-foreground">(₹{(discountPaise / 100).toLocaleString("en-IN")} off)</span></p>;
                        }
                        return <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">Leave blank or 0 for no autopay discount.</p>;
                      })()}
                    </div>
                  )}
                  <div>
                    <label className={labelClass}>Billing Day (1–28)</label>
                    <input value={form.billingDayOfMonth} onChange={(event) => setForm({ ...form, billingDayOfMonth: event.target.value })} className={inputClass} inputMode="numeric" placeholder="5" />
                  </div>
                  {overAfaCap && (
                    <div className="sm:col-span-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                      <p className="font-body text-[0.78rem] text-amber-800">
                        This fee is above ₹15,000. Per RBI rules, silent autopay only works up to ₹15,000 — larger amounts need an OTP on every auto-debit. Parents may prefer manual monthly pay for this class.
                      </p>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Payment options offered to parents *</label>
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <label className={`flex flex-1 cursor-pointer items-start gap-2 rounded-md border p-3 font-body text-[0.8rem] ${form.payAutopay ? "border-gold bg-gold/5" : "border-border"}`}>
                          <input type="checkbox" className="mt-0.5" checked={form.payAutopay} onChange={(event) => setForm({ ...form, payAutopay: event.target.checked })} />
                          <span><span className="font-semibold text-foreground">Autopay</span><br /><span className="text-muted-foreground">Auto-debit the fee every month.</span></span>
                        </label>
                        <label className={`flex flex-1 cursor-pointer items-start gap-2 rounded-md border p-3 font-body text-[0.8rem] ${form.payManual ? "border-gold bg-gold/5" : "border-border"}`}>
                          <input type="checkbox" className="mt-0.5" checked={form.payManual} onChange={(event) => setForm({ ...form, payManual: event.target.checked })} />
                          <span><span className="font-semibold text-foreground">Pay monthly</span><br /><span className="text-muted-foreground">Parent pays each month manually.</span></span>
                        </label>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <label className={`flex flex-1 cursor-pointer items-start gap-2 rounded-md border p-3 font-body text-[0.8rem] ${form.payCash ? "border-gold bg-gold/5" : "border-border"}`}>
                          <input type="checkbox" className="mt-0.5" checked={form.payCash} onChange={(event) => setForm({ ...form, payCash: event.target.checked })} />
                          <span><span className="font-semibold text-foreground">Cash</span><br /><span className="text-muted-foreground">Parent pays cash, admin collects offline.</span></span>
                        </label>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {form.offersTerm && (
                <>
                  {form.offersMonthly && (
                    <div className="sm:col-span-2 flex items-center gap-2 border-t border-border/60 pt-3">
                      <CalendarRange className="h-4 w-4 text-gold" />
                      <span className="font-display text-[0.95rem] font-semibold text-foreground">Term course</span>
                    </div>
                  )}
                  <div>
                    <label className={labelClass}>Total Course Fee *</label>
                    <div className="relative">
                      <BadgeIndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input value={form.termFeeRupees} onChange={(event) => setForm({ ...form, termFeeRupees: event.target.value })} className={`${inputClass} pl-10`} inputMode="decimal" placeholder="30000" />
                    </div>
                    <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">Preview: <span className="font-semibold text-gold">{termFeePreviewInPaise ? formatPaiseAsRupees(termFeePreviewInPaise) : "Enter fee"}</span></p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>Start Date *</label>
                      <input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>End Date *</label>
                      <input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} className={inputClass} />
                    </div>
                  </div>
                  {durationMonths > 0 && (
                    <p className="sm:col-span-2 -mt-2 font-body text-[0.72rem] text-muted-foreground">Duration: <span className="font-semibold text-gold">{durationMonths} month{durationMonths > 1 ? "s" : ""}</span></p>
                  )}
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Payment options offered to parents *</label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <label className={`flex flex-1 cursor-pointer items-start gap-2 rounded-md border p-3 font-body text-[0.8rem] ${form.payFull ? "border-gold bg-gold/5" : "border-border"}`}>
                        <input type="checkbox" className="mt-0.5" checked={form.payFull} onChange={(event) => setForm({ ...form, payFull: event.target.checked })} />
                        <span><span className="font-semibold text-foreground">Pay Full</span><br /><span className="text-muted-foreground">One-time payment of the whole fee.</span></span>
                      </label>
                      <label className={`flex flex-1 cursor-pointer items-start gap-2 rounded-md border p-3 font-body text-[0.8rem] ${form.payEmi ? "border-gold bg-gold/5" : "border-border"}`}>
                        <input type="checkbox" className="mt-0.5" checked={form.payEmi} onChange={(event) => setForm({ ...form, payEmi: event.target.checked })} />
                        <span><span className="font-semibold text-foreground">EMI</span><br /><span className="text-muted-foreground">Split into upfront + installments.</span></span>
                      </label>
                    </div>
                  </div>
                  {form.payFull && (
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Pay-full offer — free months</label>
                      <input value={form.termFreeMonths} onChange={(event) => setForm({ ...form, termFreeMonths: event.target.value })} className={inputClass} inputMode="numeric" placeholder="0 (no offer) · e.g. 1 = one month free" />
                      {payFullPreviewInPaise != null ? (
                        <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">
                          Pay-full price: <span className="font-semibold text-green-700">{formatPaiseAsRupees(payFullPreviewInPaise)}</span>
                          <span className="text-muted-foreground"> (was {formatPaiseAsRupees(termFeePreviewInPaise)}, {freeMonthsNum} month{freeMonthsNum > 1 ? "s" : ""} free)</span>
                        </p>
                      ) : (
                        <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">
                          When a parent pays the whole fee upfront they get this many months free. Needs a term fee + valid dates. Leave 0 for no offer.
                        </p>
                      )}
                    </div>
                  )}
                  {form.payEmi && (
                    <div className="sm:col-span-2 rounded-md border border-gold/30 bg-gold/5 p-3">
                      <p className="mb-2 font-body text-[0.8rem] font-semibold text-foreground">EMI split (must total 100%)</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={labelClass}>Upfront %</label>
                          <input value={form.emiUpfront} onChange={(event) => setForm({ ...form, emiUpfront: event.target.value })} className={inputClass} inputMode="numeric" placeholder="50" />
                        </div>
                        <div>
                          <label className={labelClass}>Installments % (comma-separated)</label>
                          <input value={form.emiInstallments} onChange={(event) => setForm({ ...form, emiInstallments: event.target.value })} className={inputClass} placeholder="25, 25" />
                        </div>
                      </div>
                      {!emiParsed.config ? (
                        <p className="mt-2 font-body text-[0.72rem] text-destructive">
                          {Number.isNaN(emiParsed.sum) ? "Enter a valid upfront % and at least one installment %." : `Total is ${emiParsed.sum}% — adjust so upfront + installments = 100%.`}
                        </p>
                      ) : emiPreview ? (
                        <div className="mt-2 space-y-0.5 font-body text-[0.72rem] text-muted-foreground">
                          <p>Pay now ({emiParsed.config.upfrontPercentage}%): <span className="font-semibold text-gold">{formatPaiseAsRupees(emiPreview.initialPaymentInPaise)}</span></p>
                          {emiPreview.installments.slice(1).map((inst) => (
                            <p key={inst.installmentNumber}>{inst.label} ({inst.percentage}%) on {inst.dueDate}: <span className="font-semibold">{formatPaiseAsRupees(inst.amountInPaise)}</span></p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              )}
              {/* Time slot builder — parents pick one of these at enrolment */}
              <div className="sm:col-span-2 rounded-md border border-border/70 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2 font-body text-[0.85rem] font-semibold text-foreground"><Clock className="h-4 w-4 text-gold" /> Time Slots <span className="font-normal text-muted-foreground">(days, time & seats — parents pick one)</span></span>
                  <button type="button" onClick={addSlot} className="flex items-center gap-1 rounded-md border border-gold/40 px-2.5 py-1.5 font-body text-[0.75rem] font-semibold text-gold hover:bg-gold/10"><Plus className="h-3.5 w-3.5" /> Add slot</button>
                </div>
                {form.timeSlots.length === 0 ? (
                  <p className="font-body text-[0.72rem] text-muted-foreground">No slots yet. Add at least one slot with its days, time and seats so parents can choose a batch.</p>
                ) : (
                  <div className="space-y-3">
                    {form.timeSlots.map((slot, index) => {
                      const slotLabel = composeSchedule(slot.days, slot.start, slot.end);
                      return (
                      <div key={slot.id} className="rounded-lg border border-border bg-background/60 p-3.5">
                        <div className="mb-2.5 flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2 font-body text-[0.8rem] font-semibold text-foreground">
                            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gold/15 text-[0.7rem] text-gold">{index + 1}</span>
                            <span className="truncate text-muted-foreground">{slotLabel || `Slot ${index + 1}`}</span>
                          </span>
                          <button type="button" onClick={() => removeSlot(slot.id)} className="flex-shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove slot ${index + 1}`}><Trash2 className="h-4 w-4" /></button>
                        </div>
                        <label className="mb-1.5 block font-body text-[0.72rem] font-medium text-muted-foreground">Days</label>
                        <div className="mb-3 flex flex-wrap gap-1.5">
                          {WEEKDAYS.map((day) => {
                            const selected = slot.days.includes(day.value);
                            return (
                              <button type="button" key={day.value} onClick={() => toggleSlotDay(slot.id, day.value)} className={`px-2.5 py-1 rounded-md border font-body text-[0.72rem] transition-colors ${selected ? "border-gold bg-gold/15 font-semibold text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}>{day.label}</button>
                            );
                          })}
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className={labelClass}>From</label>
                            <TimePicker value={slot.start} onChange={(val) => updateSlot(slot.id, { start: val })} />
                          </div>
                          <div>
                            <label className={labelClass}>To</label>
                            <TimePicker value={slot.end} onChange={(val) => updateSlot(slot.id, { end: val })} />
                          </div>
                        </div>
                        <div className="mt-3 sm:max-w-[200px]">
                          <label className={labelClass}>Seats (capacity)</label>
                          <input value={slot.seats} onChange={(event) => updateSlot(slot.id, { seats: event.target.value })} className={inputClass} inputMode="numeric" placeholder="Leave blank = unlimited" />
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <label className={labelClass}>Age From</label>
                <input type="number" inputMode="numeric" min={1} max={120} value={form.ageFrom} onChange={(event) => setForm({ ...form, ageFrom: event.target.value })} className={inputClass} placeholder="8" />
              </div>
              <div>
                <label className={labelClass}>Age To</label>
                <input type="number" inputMode="numeric" min={1} max={120} value={form.ageTo} onChange={(event) => setForm({ ...form, ageTo: event.target.value })} className={inputClass} placeholder="16" />
              </div>
              <div>
                <label className={labelClass}>Faculty Name</label>
                <input value={form.facultyName} onChange={(event) => setForm({ ...form, facultyName: event.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Total Seats (optional)</label>
                <input value={form.seatsTotal} onChange={(event) => setForm({ ...form, seatsTotal: event.target.value })} className={inputClass} inputMode="numeric" placeholder="Leave blank for unlimited" />
              </div>
              <label className="flex items-end gap-2 pb-2 font-body text-sm font-semibold text-foreground">
                <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
                Active (visible to parents)
              </label>
              <div className="sm:col-span-2">
                <label className={labelClass}>Description</label>
                <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Class Image</label>
                {form.image && <img src={form.image} alt="Preview" className="w-full h-40 object-cover rounded-md mb-2" />}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => imageRef.current?.click()} disabled={imageUploading} className="flex items-center gap-2 px-3 py-2 rounded-md border border-border font-body text-[0.85rem] hover:bg-muted disabled:opacity-50">
                    <Upload className="w-4 h-4" /> {imageUploading ? "Uploading..." : "Upload Image"}
                  </button>
                  <input ref={imageRef} type="file" accept="image/*" hidden onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setImageUploading(true);
                    const formData = new FormData();
                    formData.append("file", file);
                    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
                    try {
                      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
                      const data = await response.json();
                      if (!data.secure_url) throw new Error("No URL returned");
                      setForm((currentForm) => ({ ...currentForm, image: data.secure_url }));
                    } catch (error) {
                      console.error("Class image upload failed", error);
                      toast({ title: "Upload failed", variant: "destructive" });
                    } finally {
                      setImageUploading(false);
                      if (imageRef.current) imageRef.current.value = "";
                    }
                  }} />
                </div>
                <input value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} placeholder="Or paste image URL" className={`${inputClass} mt-2`} />
              </div>
              <div className="sm:col-span-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={closeModal} className="rounded-md border border-border px-5 py-2.5 font-body text-sm font-semibold text-muted-foreground hover:bg-muted">Cancel</button>
                <button type="button" onClick={handleSave} disabled={saving} className="rounded-md bg-gradient-primary px-5 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50">
                  {saving ? "Saving..." : editing ? "Update Class" : "Add Class"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AdminClasses;
