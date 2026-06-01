import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";
import { Plus, Pencil, Trash2, X, Upload, BadgeIndianRupee, AlertTriangle, GraduationCap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatPaiseAsRupees, parsePriceToPaise } from "@/lib/ecommerce";
import {
  AUTOPAY_AFA_CAP_IN_PAISE,
  CLASSES_COLLECTION,
  clampBillingDay,
  composeSchedule,
  getClassFeeLabel,
  subscribeToClasses,
  upsertClass,
  WEEKDAYS,
  type ClassDoc,
} from "@/lib/classes";

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
  billingDayOfMonth: string;
  seatsTotal: string;
  active: boolean;
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
  billingDayOfMonth: "5",
  seatsTotal: "",
  active: true,
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

  const feePreviewInPaise = parsePriceToPaise(form.feeRupees) || 0;
  const overAfaCap = feePreviewInPaise > AUTOPAY_AFA_CAP_IN_PAISE;

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
      billingDayOfMonth: String(classDoc.billingDayOfMonth || 5),
      seatsTotal: classDoc.seatsTotal != null ? String(classDoc.seatsTotal) : "",
      active: classDoc.active,
    });
    setEditing(classDoc.id);
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditing(null); setForm(defaultForm); };

  const handleSave = async () => {
    const monthlyFeeInPaise = parsePriceToPaise(form.feeRupees) || 0;
    if (!form.name.trim()) {
      toast({ title: "Class name required", variant: "destructive" });
      return;
    }
    if (monthlyFeeInPaise <= 0) {
      toast({ title: "Monthly fee required", description: "Enter a valid monthly fee.", variant: "destructive" });
      return;
    }

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
        billingDayOfMonth: clampBillingDay(Number(form.billingDayOfMonth)),
        seatsTotal: form.seatsTotal.trim() ? Number(form.seatsTotal) : undefined,
        active: form.active,
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
                  <span className={`px-2 py-1 rounded-full font-body text-[0.7rem] ${classDoc.active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{classDoc.active ? "Active" : "Inactive"}</span>
                  {classDoc.monthlyFeeInPaise > AUTOPAY_AFA_CAP_IN_PAISE && (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-body text-[0.65rem]" title="Above ₹15,000 — autopay needs OTP each charge">
                      <AlertTriangle className="w-3 h-3" /> AFA
                    </span>
                  )}
                </div>
                <h4 className="font-display font-semibold text-[1.1rem] text-foreground mb-1">{classDoc.name}</h4>
                {classDoc.description && <p className="font-body text-[0.8rem] text-muted-foreground line-clamp-2 mb-2">{classDoc.description}</p>}
                <div className="space-y-1 font-body text-[0.78rem] text-muted-foreground mb-3">
                  {classDoc.schedule && <p>🗓 {classDoc.schedule}</p>}
                  {classDoc.facultyName && <p>👤 {classDoc.facultyName}</p>}
                  {classDoc.ageGroup && <p>🎯 {classDoc.ageGroup}</p>}
                  <p>📅 Billed on day {classDoc.billingDayOfMonth} each month</p>
                </div>
                <p className="font-display text-[1.05rem] font-bold text-primary mb-3">{getClassFeeLabel(classDoc)}</p>
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
              <div>
                <label className={labelClass}>Monthly Fee *</label>
                <div className="relative">
                  <BadgeIndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={form.feeRupees} onChange={(event) => setForm({ ...form, feeRupees: event.target.value })} className={`${inputClass} pl-10`} inputMode="decimal" placeholder="2500" />
                </div>
                <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">Preview: <span className="font-semibold text-gold">{feePreviewInPaise ? formatPaiseAsRupees(feePreviewInPaise) : "Enter fee"}</span></p>
              </div>
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
                <label className={labelClass}>Schedule — Days</label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => {
                    const selected = form.scheduleDays.includes(day.value);
                    return (
                      <button
                        type="button"
                        key={day.value}
                        onClick={() => setForm((currentForm) => ({
                          ...currentForm,
                          scheduleDays: selected
                            ? currentForm.scheduleDays.filter((value) => value !== day.value)
                            : [...currentForm.scheduleDays, day.value],
                        }))}
                        className={`px-3 py-1.5 rounded-md border font-body text-[0.8rem] transition-colors ${selected ? "border-gold bg-gold/15 font-semibold text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className={labelClass}>Class Time — From</label>
                <TimePicker value={form.scheduleStart} onChange={(val) => setForm({ ...form, scheduleStart: val })} />
              </div>
              <div>
                <label className={labelClass}>Class Time — To</label>
                <TimePicker value={form.scheduleEnd} onChange={(val) => setForm({ ...form, scheduleEnd: val })} />
              </div>
              {(form.scheduleDays.length > 0 || form.scheduleStart) && (
                <p className="sm:col-span-2 -mt-2 font-body text-[0.72rem] text-muted-foreground">Schedule preview: <span className="font-semibold text-gold">{composeSchedule(form.scheduleDays, form.scheduleStart, form.scheduleEnd) || "—"}</span></p>
              )}
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
