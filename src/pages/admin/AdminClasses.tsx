import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";
import { openSquareCropper } from "@/components/SquareImageCropper";
import { Plus, Pencil, Trash2, X, Upload, BadgeIndianRupee, AlertTriangle, GraduationCap, CalendarRange, Repeat, Clock, Wallet, Video, FileText, MonitorPlay } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAdminLog } from "@/hooks/useAdminLog";
import { confirmDialog } from "@/components/ConfirmDialogHost";
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
  getClassEmiTotalInPaise,
  getClassFeeLabel,
  getTermPayFullOfferLabel,
  getTermPayFullPriceInPaise,
  hasAutopayDiscount,
  hasTermPayFullOffer,
  monthsBetween,
  subscribeToClasses,
  upsertClass,
  WEEKDAYS,
  type ClassContentLink,
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
  termFinalPriceRupees: string; // explicit pay-full final price (₹) — discount shown to users
  payAutopay: boolean;
  payManual: boolean;
  payFull: boolean;
  payEmi: boolean;
  payCash: boolean;
  emiUpfront: string;        // "50"
  emiInstallments: string;   // "25, 25"
  emiSurchargeRupees: string; // flat ₹ convenience fee added once for EMI
  timeSlots: SlotFormState[];
  // Student-portal class content (req): live class link + recorded class links
  // + study material files. Admin can add any number of rows of each.
  liveClassUrl: string;
  recordings: ClassContentLink[];
  materials: ClassContentLink[];
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
  termFinalPriceRupees: "",
  payAutopay: true,
  payManual: true,
  payFull: true,
  payEmi: true,
  payCash: false,
  emiUpfront: String(DEFAULT_CLASS_EMI_CONFIG.upfrontPercentage),
  emiInstallments: DEFAULT_CLASS_EMI_CONFIG.installmentPercentages.join(", "),
  emiSurchargeRupees: "",
  timeSlots: [],
  liveClassUrl: "",
  recordings: [],
  materials: [],
};

let slotIdCounter = 0;
const newSlot = (): SlotFormState => ({ id: `slot-${Date.now()}-${slotIdCounter++}`, days: [], start: "", end: "", seats: "" });

let contentIdCounter = 0;
const newContentLink = (prefix: string): ClassContentLink => ({ id: `${prefix}-${Date.now()}-${contentIdCounter++}`, title: "", url: "" });

/** Parse "50" + "25, 25" (+ optional surcharge ₹) into a ClassEmiConfig; returns null if the split is invalid. */
const parseEmiConfig = (upfrontStr: string, installmentsStr: string, surchargeRupees = ""): { config: ClassEmiConfig | null; sum: number } => {
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
  const emiSurchargeInPaise = Math.max(0, parsePriceToPaise(surchargeRupees) || 0);
  return { config: { upfrontPercentage: upfront, installmentPercentages: installments, emiSurchargeInPaise }, sum };
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
  const [materialsUploading, setMaterialsUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const materialsRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const logAction = useAdminLog();

  useEffect(() => subscribeToClasses(setClasses, (error) => {
    console.error("Unable to load classes", error);
  }), []);

  const sortedClasses = useMemo(() => [...classes].sort((a, b) => a.name.localeCompare(b.name)), [classes]);

  const monthlyFeePreviewInPaise = parsePriceToPaise(form.feeRupees) || 0;
  const termFeePreviewInPaise = parsePriceToPaise(form.termFeeRupees) || 0;
  const overAfaCap = form.offersMonthly && monthlyFeePreviewInPaise > AUTOPAY_AFA_CAP_IN_PAISE;

  const emiParsed = useMemo(() => parseEmiConfig(form.emiUpfront, form.emiInstallments, form.emiSurchargeRupees), [form.emiUpfront, form.emiInstallments, form.emiSurchargeRupees]);
  const emiPreview = useMemo(() => {
    if (!form.offersTerm || !form.payEmi || !emiParsed.config || termFeePreviewInPaise <= 0) return null;
    return buildClassEmiPlan(getClassEmiTotalInPaise(termFeePreviewInPaise, emiParsed.config), emiParsed.config);
  }, [form.offersTerm, form.payEmi, emiParsed.config, termFeePreviewInPaise]);
  const durationMonths = useMemo(() => monthsBetween(form.startDate, form.endDate), [form.startDate, form.endDate]);

  // Pay-full offer preview: an explicit final price wins; else the free-months calc.
  const freeMonthsNum = Math.max(0, Math.round(Number(form.termFreeMonths) || 0));
  const termFinalPricePreviewInPaise = parsePriceToPaise(form.termFinalPriceRupees) || 0;
  const finalPriceInvalid = termFinalPricePreviewInPaise > 0 && termFeePreviewInPaise > 0 && termFinalPricePreviewInPaise >= termFeePreviewInPaise;
  const payFullPreviewInPaise = useMemo(() => {
    if (!form.offersTerm || termFeePreviewInPaise <= 0) return null;
    if (termFinalPricePreviewInPaise > 0 && termFinalPricePreviewInPaise < termFeePreviewInPaise) return termFinalPricePreviewInPaise;
    if (durationMonths <= 0 || freeMonthsNum <= 0) return null;
    return getTermPayFullPriceInPaise({
      termFeeInPaise: termFeePreviewInPaise,
      durationMonths,
      termFreeMonthsOnFullPayment: freeMonthsNum,
    });
  }, [form.offersTerm, termFeePreviewInPaise, termFinalPricePreviewInPaise, durationMonths, freeMonthsNum]);

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
      billingDayOfMonth: String(classDoc.billingDayOfMonth || 1),
      seatsTotal: classDoc.seatsTotal != null ? String(classDoc.seatsTotal) : "",
      active: classDoc.active,
      offersMonthly: classOffersMonthly(classDoc),
      offersTerm: classOffersTerm(classDoc),
      termFeeRupees: (classDoc.termFeeInPaise || 0) > 0 ? String((classDoc.termFeeInPaise || 0) / 100) : "",
      startDate: classDoc.startDate || "",
      endDate: classDoc.endDate || "",
      termFreeMonths: (classDoc.termFreeMonthsOnFullPayment || 0) > 0 ? String(classDoc.termFreeMonthsOnFullPayment) : "",
      termFinalPriceRupees: (classDoc.termPayFullPriceInPaise || 0) > 0 ? String((classDoc.termPayFullPriceInPaise || 0) / 100) : "",
      payAutopay: classDoc.payment?.autopay ?? true,
      payManual: classDoc.payment?.manual ?? true,
      payFull: classDoc.payment?.full ?? true,
      payEmi: classDoc.payment?.emi ?? false,
      payCash: classDoc.payment?.cash ?? false,
      emiUpfront: String(classDoc.emi?.upfrontPercentage ?? DEFAULT_CLASS_EMI_CONFIG.upfrontPercentage),
      emiInstallments: (classDoc.emi?.installmentPercentages ?? DEFAULT_CLASS_EMI_CONFIG.installmentPercentages).join(", "),
      emiSurchargeRupees: (classDoc.emi?.emiSurchargeInPaise || 0) > 0 ? String((classDoc.emi?.emiSurchargeInPaise || 0) / 100) : "",
      timeSlots: (classDoc.timeSlots || []).map((slot) => ({
        id: slot.id,
        days: slot.days || [],
        start: slot.start || "",
        end: slot.end || "",
        seats: slot.seatsTotal != null ? String(slot.seatsTotal) : "",
      })),
      liveClassUrl: classDoc.liveClassUrl || "",
      recordings: (classDoc.recordings || []).map((link) => ({ ...link })),
      materials: (classDoc.materials || []).map((link) => ({ ...link })),
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

  // Class-content rows (recordings / materials): add, edit, remove + bulk
  // material file upload (multiple PDFs at once via Cloudinary).
  const addContentLink = (kind: "recordings" | "materials") =>
    setForm((current) => ({ ...current, [kind]: [...current[kind], newContentLink(kind === "recordings" ? "rec" : "mat")] }));
  const removeContentLink = (kind: "recordings" | "materials", id: string) =>
    setForm((current) => ({ ...current, [kind]: current[kind].filter((link) => link.id !== id) }));
  const updateContentLink = (kind: "recordings" | "materials", id: string, patch: Partial<ClassContentLink>) =>
    setForm((current) => ({ ...current, [kind]: current[kind].map((link) => (link.id === id ? { ...link, ...patch } : link)) }));

  const handleMaterialFiles = async (files: FileList | null) => {
    const list = Array.from(files || []);
    if (list.length === 0) return;
    setMaterialsUploading(true);
    try {
      for (const file of list) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
        formData.append("folder", "class-materials");
        // `auto/upload` accepts PDFs and other documents, not just images.
        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: "POST", body: formData });
        const data = await response.json();
        if (!data.secure_url) throw new Error(data?.error?.message || "No URL returned");
        const title = file.name.replace(/\.[^.]+$/, "");
        setForm((current) => ({ ...current, materials: [...current.materials, { ...newContentLink("mat"), title, url: data.secure_url }] }));
      }
      toast({ title: `${list.length} file${list.length > 1 ? "s" : ""} uploaded` });
    } catch (error) {
      console.error("Material upload failed", error);
      toast({ title: "Upload failed", description: error instanceof Error ? error.message : "Please try again or paste the file URL instead.", variant: "destructive" });
    } finally {
      setMaterialsUploading(false);
      if (materialsRef.current) materialsRef.current.value = "";
    }
  };

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
      // No payment-option check needed: "Pay Now" is always available for
      // monthly classes; Autopay is an optional extra (req 1).
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
      if (form.payFull && finalPriceInvalid) {
        toast({ title: "Final price must be below the course fee", description: "The pay-full final price has to be less than the total course fee (or leave it blank).", variant: "destructive" });
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
        termPayFullPriceInPaise: offersTerm && form.payFull ? (parsePriceToPaise(form.termFinalPriceRupees) || 0) : 0,
        // Each track's options are gated by whether that track is enabled.
        // Monthly: Autopay is optional; "Pay Now" (manual UPI + pay-at-counter)
        // is always on, so manual & cash are both enabled together (req 1).
        payment: {
          autopay: offersMonthly && form.payAutopay,
          manual: offersMonthly,
          cash: offersMonthly,
          full: offersTerm && form.payFull,
          emi: offersTerm && form.payEmi,
        },
        emi: offersTerm && form.payEmi ? emiParsed.config : null,
        timeSlots,
        liveClassUrl: form.liveClassUrl,
        recordings: form.recordings.filter((link) => link.url.trim()),
        materials: form.materials.filter((link) => link.url.trim()),
      });
      toast({ title: editing ? "Class updated" : "Class added" });
      logAction(editing ? "Updated class" : "Created class", form.name.trim());
      closeModal();
    } catch (error) {
      console.error("Error saving class", error);
      toast({ title: "Error saving class", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteClass = async (id: string, name: string) => {
    if (!(await confirmDialog({
      title: `Delete "${name}"?`,
      description: "Existing enrollments and fee history are not removed.",
      confirmText: "Delete class",
      destructive: true,
    }))) return;
    await deleteDoc(doc(db, CLASSES_COLLECTION, id));
    toast({ title: "Class deleted" });
    logAction("Deleted class", name);
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
                <div className="aspect-square overflow-hidden">
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
                    classOffersMonthly(classDoc) && "Pay Now",
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
                  <div>
                    <label className={labelClass}>Billing Day (1–28)</label>
                    <input value={form.billingDayOfMonth} onChange={(event) => setForm({ ...form, billingDayOfMonth: event.target.value })} className={inputClass} inputMode="numeric" placeholder="5" />
                    <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">The monthly due date. Defaults to the 5th — change it if you like.</p>
                  </div>
                  {overAfaCap && (
                    <div className="sm:col-span-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                      <p className="font-body text-[0.78rem] text-amber-800">
                        This fee is above ₹15,000. Per RBI rules, silent autopay only works up to ₹15,000 — larger amounts need an OTP on every auto-debit. Parents may prefer to use Pay Now for this class.
                      </p>
                    </div>
                  )}
                  {/* Req 1: monthly classes offer exactly two options to parents —
                      "Autopay" (optional, admin's choice) and "Pay Now" (UPI QR +
                      pay-at-counter), which is always available. */}
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Payment options for parents</label>
                    <label className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 font-body text-[0.8rem] ${form.payAutopay ? "border-gold bg-gold/5" : "border-border"}`}>
                      <input type="checkbox" className="mt-0.5" checked={form.payAutopay} onChange={(event) => setForm({ ...form, payAutopay: event.target.checked })} />
                      <span><span className="font-semibold text-foreground">Offer Autopay</span> <span className="text-muted-foreground">(optional)</span><br /><span className="text-muted-foreground">Recurring auto-debit each month. Leave off to only accept Pay Now.</span></span>
                    </label>
                    {/* Req 5: enabling Autopay asks for an OPTIONAL discount. */}
                    {form.payAutopay && (
                      <div className="mt-2 rounded-md border border-gold/25 bg-gold/5 p-3">
                        <label className={labelClass}>Autopay discount (₹) <span className="font-normal text-muted-foreground">(optional)</span></label>
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
                          return <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">Give parents a discount for choosing autopay, or leave blank for none.</p>;
                        })()}
                      </div>
                    )}
                    <p className="mt-2 flex items-start gap-1.5 font-body text-[0.72rem] text-muted-foreground">
                      <Wallet className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gold" />
                      <span><span className="font-semibold text-foreground">Pay Now</span> is always available — parents scan a UPI QR (upload the receipt) or submit without one to pay at the counter.</span>
                    </p>
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
                    <div className="sm:col-span-2 rounded-md border border-green-200 bg-green-50/50 p-3">
                      <p className="mb-2 font-body text-[0.8rem] font-semibold text-foreground">Pay-full offer — price, final price &amp; discount</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label className={labelClass}>Final price on full payment (₹)</label>
                          <div className="relative">
                            <BadgeIndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input value={form.termFinalPriceRupees} onChange={(event) => setForm({ ...form, termFinalPriceRupees: event.target.value })} className={`${inputClass} pl-10`} inputMode="decimal" placeholder="e.g. 25000" />
                          </div>
                        </div>
                        <div>
                          <label className={labelClass}>Or free months (legacy offer)</label>
                          <input value={form.termFreeMonths} onChange={(event) => setForm({ ...form, termFreeMonths: event.target.value })} className={inputClass} inputMode="numeric" placeholder="0 (no offer)" />
                        </div>
                      </div>
                      {finalPriceInvalid ? (
                        <p className="mt-2 font-body text-[0.72rem] text-destructive">Final price must be LESS than the course fee ({formatPaiseAsRupees(termFeePreviewInPaise)}).</p>
                      ) : payFullPreviewInPaise != null ? (
                        <p className="mt-2 font-body text-[0.72rem] text-muted-foreground">
                          Parents will see: <span className="text-muted-foreground line-through">{formatPaiseAsRupees(termFeePreviewInPaise)}</span>{" "}
                          <span className="font-semibold text-green-700">{formatPaiseAsRupees(payFullPreviewInPaise)}</span>{" "}
                          <span className="font-semibold text-green-700">(save {formatPaiseAsRupees(termFeePreviewInPaise - payFullPreviewInPaise)})</span>
                        </p>
                      ) : (
                        <p className="mt-2 font-body text-[0.72rem] text-muted-foreground">
                          Set a discounted final price (recommended — parents see price, final price &amp; savings) or use free months. Leave both blank for no offer.
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
                        <div className="col-span-2">
                          <label className={labelClass}>EMI convenience fee (₹, optional) — added once to the total when a parent chooses EMI</label>
                          <input value={form.emiSurchargeRupees} onChange={(event) => setForm({ ...form, emiSurchargeRupees: event.target.value })} className={inputClass} inputMode="numeric" placeholder="e.g. 500" />
                        </div>
                      </div>
                      {!emiParsed.config ? (
                        <p className="mt-2 font-body text-[0.72rem] text-destructive">
                          {Number.isNaN(emiParsed.sum) ? "Enter a valid upfront % and at least one installment %." : `Total is ${emiParsed.sum}% — adjust so upfront + installments = 100%.`}
                        </p>
                      ) : emiPreview ? (
                        <div className="mt-2 space-y-0.5 font-body text-[0.72rem] text-muted-foreground">
                          {(emiParsed.config.emiSurchargeInPaise || 0) > 0 && (
                            <p className="text-amber-700">Term fee {formatPaiseAsRupees(termFeePreviewInPaise)} + convenience fee {formatPaiseAsRupees(emiParsed.config.emiSurchargeInPaise || 0)} = <span className="font-semibold">{formatPaiseAsRupees(emiPreview.totalInPaise)}</span></p>
                          )}
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
              {/* Class content — powers the student-portal class room (req):
                  live class link, recorded class links, study material PDFs. */}
              <div className="sm:col-span-2 rounded-md border border-border/70 p-3">
                <p className="mb-2 flex items-center gap-2 font-body text-[0.85rem] font-semibold text-foreground">
                  <MonitorPlay className="h-4 w-4 text-gold" /> Class Content <span className="font-normal text-muted-foreground">(shown to enrolled students in their portal)</span>
                </p>
                <label className={labelClass}>Live class link (Google Meet / Zoom)</label>
                <input value={form.liveClassUrl} onChange={(event) => setForm({ ...form, liveClassUrl: event.target.value })} className={inputClass} placeholder="https://meet.google.com/xxx-xxxx-xxx" />
                <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">Students see a "Join Live Class" button with this link. Update it whenever the meeting changes.</p>

                <div className="mt-3 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-body text-[0.8rem] font-semibold text-foreground"><Video className="h-4 w-4 text-gold" /> Class recordings</span>
                  <button type="button" onClick={() => addContentLink("recordings")} className="flex items-center gap-1 rounded-md border border-gold/40 px-2.5 py-1.5 font-body text-[0.75rem] font-semibold text-gold hover:bg-gold/10"><Plus className="h-3.5 w-3.5" /> Add link</button>
                </div>
                {form.recordings.length === 0 ? (
                  <p className="mt-1.5 font-body text-[0.72rem] text-muted-foreground">No recordings yet. Add YouTube/Drive links of past classes — students can rewatch them anytime.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {form.recordings.map((link, index) => (
                      <div key={link.id} className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-2.5 sm:flex-row sm:items-center">
                        <input value={link.title} onChange={(event) => updateContentLink("recordings", link.id, { title: event.target.value })} className={`${inputClass} sm:max-w-[38%]`} placeholder={`Recording title (e.g. Class ${index + 1})`} />
                        <input value={link.url} onChange={(event) => updateContentLink("recordings", link.id, { url: event.target.value })} className={`${inputClass} flex-1`} placeholder="https://youtu.be/…" />
                        <button type="button" onClick={() => removeContentLink("recordings", link.id)} className="self-end rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:self-auto" aria-label={`Remove recording ${index + 1}`}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-body text-[0.8rem] font-semibold text-foreground"><FileText className="h-4 w-4 text-gold" /> Study materials (PDFs)</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => materialsRef.current?.click()} disabled={materialsUploading} className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 font-body text-[0.75rem] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">
                      <Upload className="h-3.5 w-3.5" /> {materialsUploading ? "Uploading…" : "Upload PDFs"}
                    </button>
                    <button type="button" onClick={() => addContentLink("materials")} className="flex items-center gap-1 rounded-md border border-gold/40 px-2.5 py-1.5 font-body text-[0.75rem] font-semibold text-gold hover:bg-gold/10"><Plus className="h-3.5 w-3.5" /> Add link</button>
                  </div>
                </div>
                <input ref={materialsRef} type="file" accept="application/pdf,.pdf,.doc,.docx,.ppt,.pptx" multiple hidden onChange={(event) => handleMaterialFiles(event.target.files)} />
                {form.materials.length === 0 ? (
                  <p className="mt-1.5 font-body text-[0.72rem] text-muted-foreground">Upload one or many PDFs at once, or paste Drive links — students can download them from their portal.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {form.materials.map((link, index) => (
                      <div key={link.id} className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-2.5 sm:flex-row sm:items-center">
                        <input value={link.title} onChange={(event) => updateContentLink("materials", link.id, { title: event.target.value })} className={`${inputClass} sm:max-w-[38%]`} placeholder="Material title (e.g. Notes — Week 1)" />
                        <input value={link.url} onChange={(event) => updateContentLink("materials", link.id, { url: event.target.value })} className={`${inputClass} flex-1`} placeholder="https://…/file.pdf" />
                        <button type="button" onClick={() => removeContentLink("materials", link.id)} className="self-end rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:self-auto" aria-label={`Remove material ${index + 1}`}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
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
                {form.image && <img src={form.image} alt="Preview" className="aspect-square w-full max-w-xs object-cover rounded-md mb-2" />}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => imageRef.current?.click()} disabled={imageUploading} className="flex items-center gap-2 px-3 py-2 rounded-md border border-border font-body text-[0.85rem] hover:bg-muted disabled:opacity-50">
                    <Upload className="w-4 h-4" /> {imageUploading ? "Uploading..." : "Upload Image"}
                  </button>
                  <input ref={imageRef} type="file" accept="image/*" hidden onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    // Enforce 1:1 — crop to square before uploading.
                    const square = await openSquareCropper(file);
                    if (!square) return;
                    setImageUploading(true);
                    const formData = new FormData();
                    formData.append("file", square);
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
