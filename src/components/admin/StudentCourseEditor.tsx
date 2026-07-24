import { useState } from "react";
import { BadgeIndianRupee, Check, GraduationCap, Trash2, X } from "lucide-react";
import { parsePriceToPaise } from "@/lib/ecommerce";
import { classOffersMonthly, classOffersTerm, type ClassDoc } from "@/lib/classes";
import { DEFAULT_EMI_SPLIT, type StudentCourse, type StudentTrack, type StudentType } from "@/lib/students";

const inputClass = "w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background";
const labelClass = "font-body text-[0.8rem] text-muted-foreground block mb-1";

/** Paise → an editable rupee string ("" for zero so the field looks empty). */
const toRupees = (paise: number): string => (paise > 0 ? String(paise / 100) : "");

interface StudentCourseEditorProps {
  course: StudentCourse;
  classes: ClassDoc[];
  index: number;
  total: number;
  /** An approved course keeps its class/slot — only fees and dates stay editable. */
  locked: boolean;
  onChange: (next: StudentCourse) => void;
  onRemove: () => void;
}

/**
 * ONE class row of the student form (req: a student may take several classes).
 * Owns the class/slot/track pickers, the itemised fees, the inventory flags,
 * the payment options and the EMI split for that class alone.
 *
 * Money is held in paise on the course; the rupee text fields keep their own
 * draft strings so typing "12." doesn't get rewritten mid-keystroke. Mount this
 * with `key={course.key}` so switching students remounts and resyncs drafts.
 */
const StudentCourseEditor = ({ course, classes, index, total, locked, onChange, onRemove }: StudentCourseEditorProps) => {
  const [money, setMoney] = useState({
    kit: toRupees(course.fees.kitFeeInPaise),
    books: toRupees(course.fees.booksFeeInPaise),
    uniform: toRupees(course.fees.uniformFeeInPaise),
    monthly: toRupees(course.fees.monthlyFeeInPaise),
    term: toRupees(course.fees.termFeeInPaise),
    discount: toRupees(course.fees.discountInPaise),
  });
  const [emiUpfront, setEmiUpfront] = useState(String(course.fees.emiSplit?.upfrontPercentage ?? DEFAULT_EMI_SPLIT.upfrontPercentage));
  const [emiParts, setEmiParts] = useState<string[]>(
    (course.fees.emiSplit?.installmentPercentages ?? DEFAULT_EMI_SPLIT.installmentPercentages).map(String),
  );

  const selectedClass = classes.find((cls) => cls.id === course.classId);
  const classTracks = selectedClass
    ? ([classOffersMonthly(selectedClass) ? "monthly" : null, classOffersTerm(selectedClass) ? "term" : null].filter(Boolean) as StudentTrack[])
    : [];

  const patch = (changes: Partial<StudentCourse>) => onChange({ ...course, ...changes });
  const patchFees = (changes: Partial<StudentCourse["fees"]>) => onChange({ ...course, fees: { ...course.fees, ...changes } });

  const setMoneyField = (field: keyof typeof money, raw: string, feeKey: keyof StudentCourse["fees"]) => {
    setMoney((current) => ({ ...current, [field]: raw }));
    patchFees({ [feeKey]: parsePriceToPaise(raw) || 0 } as Partial<StudentCourse["fees"]>);
  };

  const writeEmiSplit = (upfront: string, parts: string[]) => {
    patchFees({
      emiSplit: {
        upfrontPercentage: Math.max(1, Math.round(Number(upfront) || DEFAULT_EMI_SPLIT.upfrontPercentage)),
        installmentPercentages: parts.map((value) => Math.round(Number(value) || 0)).filter((value) => value > 0),
      },
    });
  };

  const handleClassChange = (classId: string) => {
    const cls = classes.find((item) => item.id === classId);
    // Default to the only track the class offers; monthly when it offers both.
    const track: StudentTrack = cls && !classOffersMonthly(cls) && classOffersTerm(cls) ? "term" : "monthly";
    const monthlyFeeInPaise = track === "monthly" ? (cls?.monthlyFeeInPaise || 0) : 0;
    const termFeeInPaise = track === "term" ? (cls?.termFeeInPaise || 0) : 0;
    setMoney((current) => ({ ...current, monthly: toRupees(monthlyFeeInPaise), term: toRupees(termFeeInPaise) }));
    onChange({
      ...course,
      classId,
      className: cls?.name || "",
      slotId: "",
      slotLabel: "",
      trainerName: cls?.facultyName || "",
      fees: { ...course.fees, track, monthlyFeeInPaise, termFeeInPaise },
      methods: { ...course.methods, emi: course.methods.emi && track === "term" },
    });
  };

  const emiTotal = (Number(emiUpfront) || 0) + emiParts.reduce((sum, value) => sum + (Number(value) || 0), 0);

  return (
    <div className={`rounded-lg border p-3 ${course.status === "dropped" ? "border-destructive/30 bg-destructive/5 opacity-70" : "border-border/70 bg-background/50"}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-body text-sm font-semibold text-foreground">
          Class {index + 1}
          {course.enrollmentId && <span className="ml-1.5 rounded-full bg-green-100 px-2 py-0.5 font-body text-[0.65rem] font-semibold text-green-700">Approved</span>}
          {course.status === "dropped" && <span className="ml-1.5 rounded-full bg-destructive/15 px-2 py-0.5 font-body text-[0.65rem] font-semibold text-destructive">Dropped</span>}
        </p>
        {(total > 1 || course.status === "dropped") && (
          course.status === "dropped" ? (
            <button type="button" onClick={() => patch({ status: "active" })} className="rounded-md border border-border px-2 py-1 font-body text-[0.7rem] font-semibold text-muted-foreground hover:bg-muted">
              Restore
            </button>
          ) : (
            <button type="button" onClick={onRemove} className="flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 font-body text-[0.7rem] font-semibold text-destructive hover:bg-destructive/10">
              <Trash2 className="h-3.5 w-3.5" /> {course.enrollmentId ? "Drop class" : "Remove"}
            </button>
          )
        )}
      </div>

      {/* B. Class details */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label className={labelClass}>Class *</label>
          <select value={course.classId} onChange={(e) => handleClassChange(e.target.value)} className={inputClass} disabled={locked}>
            <option value="">Select a class…</option>
            {classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}{cls.active ? "" : " (inactive)"}</option>)}
          </select>
          {locked && <p className="mt-1 font-body text-[0.7rem] text-muted-foreground">Locked — this class is already approved.</p>}
        </div>
        <div className="min-w-0">
          <label className={labelClass}>Time slot</label>
          <select
            value={course.slotId || ""}
            onChange={(e) => {
              const slot = (selectedClass?.timeSlots || []).find((item) => item.id === e.target.value);
              patch({ slotId: slot?.id || "", slotLabel: slot?.label || "" });
            }}
            className={inputClass}
            disabled={locked || !selectedClass || (selectedClass.timeSlots || []).length === 0}
          >
            <option value="">{(selectedClass?.timeSlots || []).length === 0 ? "No slots defined" : "Select a slot…"}</option>
            {(selectedClass?.timeSlots || []).map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
          </select>
        </div>

        {classTracks.length > 1 && (
          <div className="min-w-0 sm:col-span-2">
            <label className={labelClass}>Fee track</label>
            <div className="flex gap-2">
              {classTracks.map((track) => (
                <button
                  key={track}
                  type="button"
                  onClick={() => patchFees({ track, ...(track === "monthly" ? { termFeeInPaise: 0 } : { monthlyFeeInPaise: 0, firstMonthFree: false }) })}
                  className={`min-w-0 flex-1 rounded-md border px-3 py-2 font-body text-[0.82rem] transition-colors ${course.fees.track === track ? "border-gold bg-gold/10 font-semibold text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}
                >
                  {track === "monthly" ? "Monthly fee" : "Term course"}
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedClass?.facultyName && (
          <div className="-mt-1 flex min-w-0 items-center gap-1.5 font-body text-[0.75rem] text-muted-foreground sm:col-span-2">
            <GraduationCap className="h-3.5 w-3.5 shrink-0 text-gold" /> Trainer: <span className="font-semibold text-foreground">{selectedClass.facultyName}</span>
          </div>
        )}

        <div className="min-w-0">
          <label className={labelClass}>Joining date</label>
          <input type="date" value={course.joiningDate || ""} onChange={(e) => patch({ joiningDate: e.target.value })} className={inputClass} />
        </div>
        <div className="min-w-0">
          <label className={labelClass}>Next charge date</label>
          <input type="date" value={course.nextChargeDate || ""} onChange={(e) => patch({ nextChargeDate: e.target.value })} className={inputClass} />
        </div>

        <div className="min-w-0 sm:col-span-2">
          <label className={labelClass}>Inventory received</label>
          <div className="flex flex-wrap gap-2">
            {([["uniform", "Uniform"], ["kit", "Kit"], ["books", "Books"]] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => patch({ inventory: { ...course.inventory, [key]: !course.inventory[key] } })}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-2 font-body text-[0.82rem] transition-colors ${course.inventory[key] ? "border-green-500 bg-green-50 font-semibold text-green-700" : "border-border text-muted-foreground hover:border-gold/40"}`}
              >
                {course.inventory[key] ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* C. Fees & payment setup — every line the parent will see (req). */}
      <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-2">
          <label className={labelClass}>Student type</label>
          <div className="flex gap-2">
            {(["new", "existing"] as StudentType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => patchFees({ studentType: type })}
                className={`min-w-0 flex-1 rounded-md border px-3 py-2 font-body text-[0.82rem] transition-colors ${course.fees.studentType === type ? "border-gold bg-gold/10 font-semibold text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}
              >
                {type === "new" ? "New student" : "Existing student"}
              </button>
            ))}
          </div>
          <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">
            {course.fees.studentType === "new"
              ? (course.fees.track === "term" ? "Includes the full course fee on the link." : "Includes the first month's pre-payment on the link.")
              : (course.fees.track === "term" ? "No monthly pre-payment — the full course fee & one-time items are charged." : "No pre-payment charged — only the one-time items below.")}
          </p>
        </div>

        {([
          ["kit", "Kit fee", "kitFeeInPaise"],
          ["books", "Books fee", "booksFeeInPaise"],
          ["uniform", "Uniform fee", "uniformFeeInPaise"],
          ["discount", "Discount", "discountInPaise"],
        ] as const).map(([field, label, feeKey]) => (
          <div key={field} className="min-w-0">
            <label className={labelClass}>{label} (₹)</label>
            <div className="relative">
              <BadgeIndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={money[field]} onChange={(e) => setMoneyField(field, e.target.value, feeKey)} className={`${inputClass} pl-10`} inputMode="decimal" placeholder="0" />
            </div>
          </div>
        ))}

        {course.fees.track === "term" ? (
          <div className="min-w-0 sm:col-span-2">
            <label className={labelClass}>Term / course fee (₹)</label>
            <div className="relative">
              <BadgeIndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={money.term} onChange={(e) => setMoneyField("term", e.target.value, "termFeeInPaise")} className={`${inputClass} pl-10`} inputMode="decimal" placeholder="0" />
            </div>
          </div>
        ) : (
          <>
            <div className="min-w-0">
              <label className={labelClass}>Monthly class fee (₹)</label>
              <div className="relative">
                <BadgeIndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={money.monthly} onChange={(e) => setMoneyField("monthly", e.target.value, "monthlyFeeInPaise")} className={`${inputClass} pl-10`} inputMode="decimal" placeholder="0" />
              </div>
            </div>
            <label className="flex min-w-0 items-end gap-2 pb-2 font-body text-[0.82rem] text-foreground">
              <input type="checkbox" checked={course.fees.firstMonthFree} onChange={(e) => patchFees({ firstMonthFree: e.target.checked })} />
              1 month free
            </label>
          </>
        )}
      </div>

      {/* Admin-selected payment methods for THIS class. */}
      <div className="mt-3">
        <label className={labelClass}>Payment options the parent will see</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {([
            ["razorpay", "Autopay / Pay online", "Razorpay"],
            ["qr", "Pay Now (QR)", "Scan & upload screenshot"],
            ["counter", "Pay at counter", "Cash / POS at centre"],
            // EMI only makes sense for a term course (installment plan).
            ...(course.fees.track === "term" ? [["emi", "EMI (installments)", "Pay the course in parts"] as const] : []),
          ] as const).map(([key, label, sub]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                const next = !course.methods[key];
                if (key === "emi") {
                  onChange({
                    ...course,
                    methods: { ...course.methods, emi: next },
                    fees: { ...course.fees, emiSplit: next ? (course.fees.emiSplit || DEFAULT_EMI_SPLIT) : undefined },
                  });
                } else {
                  onChange({ ...course, methods: { ...course.methods, [key]: next } });
                }
              }}
              className={`rounded-md border p-3 text-left font-body text-[0.8rem] transition-colors ${course.methods[key] ? "border-gold bg-gold/5" : "border-border"}`}
            >
              <span className="flex items-center gap-2">
                <input type="checkbox" readOnly checked={course.methods[key]} className="pointer-events-none" />
                <span className="min-w-0 font-semibold text-foreground">{label}</span>
              </span>
              <span className="mt-1 block text-muted-foreground">{sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* EMI split configuration — shown when EMI is toggled on. */}
      {course.methods.emi && course.fees.track === "term" && (
        <div className="mt-3 rounded-lg border border-gold/25 bg-gold/5 p-3">
          <p className="font-body text-xs font-semibold uppercase tracking-wide text-gold">EMI split method</p>
          <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">Configure how the total is split into installments. Percentages must add up to 100%.</p>
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <label className={`${labelClass} mb-0 w-32 shrink-0`}>Pay now</label>
              <div className="relative min-w-0 flex-1">
                <input
                  value={emiUpfront}
                  onChange={(e) => { const value = e.target.value.replace(/[^0-9]/g, ""); setEmiUpfront(value); writeEmiSplit(value, emiParts); }}
                  className={`${inputClass} pr-7`}
                  inputMode="numeric"
                  placeholder="50"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-body text-xs text-muted-foreground">%</span>
              </div>
            </div>
            {emiParts.map((part, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <label className={`${labelClass} mb-0 w-32 shrink-0`}>{idx + 2}{idx === 0 ? "nd" : idx === 1 ? "rd" : "th"} installment</label>
                <div className="relative min-w-0 flex-1">
                  <input
                    value={part}
                    onChange={(e) => {
                      const next = [...emiParts];
                      next[idx] = e.target.value.replace(/[^0-9]/g, "");
                      setEmiParts(next);
                      writeEmiSplit(emiUpfront, next);
                    }}
                    className={`${inputClass} pr-7`}
                    inputMode="numeric"
                    placeholder="25"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-body text-xs text-muted-foreground">%</span>
                </div>
                {emiParts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => { const next = emiParts.filter((_, i) => i !== idx); setEmiParts(next); writeEmiSplit(emiUpfront, next); }}
                    className="shrink-0 rounded p-1 text-destructive hover:bg-destructive/10"
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setEmiParts([...emiParts, ""])} className="mt-1 font-body text-[0.75rem] font-semibold text-gold hover:underline">+ Add installment</button>
            {emiTotal !== 100
              ? <p className="mt-1 font-body text-[0.72rem] font-semibold text-destructive">Total is {emiTotal}% — must be 100%</p>
              : <p className="mt-1 font-body text-[0.72rem] text-green-700">✓ Percentages add up to 100%</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentCourseEditor;
