import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Link2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAdminLog } from "@/hooks/useAdminLog";
import {
  relinkEnrollmentClass,
  subscribeToClasses,
  subscribeToEnrollmentsAdmin,
  type ClassDoc,
  type EnrollmentDoc,
} from "@/lib/classes";
import { findBrokenEnrollments, suggestClassFor } from "@/lib/students/brokenEnrollments";

// ---------------------------------------------------------------------------
// Broken enrolments (req 6).
//
// When a class document is deleted its enrolments keep pointing at the missing
// id, so those students can never see a live link, recordings or materials —
// the class room has nothing to read. Three live enrolments were in this state.
//
// The admin picks the correct class here; the mapping is never guessed, only
// suggested from the name the enrolment remembers.
// ---------------------------------------------------------------------------

const inputClass = "w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background";

const BrokenEnrollmentsBanner = () => {
  const { toast } = useToast();
  const logAction = useAdminLog();

  const [enrollments, setEnrollments] = useState<EnrollmentDoc[]>([]);
  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [choice, setChoice] = useState<Record<string, { classId: string; slotId: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => subscribeToEnrollmentsAdmin(setEnrollments, () => undefined), []);
  useEffect(() => subscribeToClasses(setClasses, () => undefined), []);

  const broken = useMemo(
    () => findBrokenEnrollments(enrollments, classes.map((cls) => cls.id)),
    [enrollments, classes],
  );

  // Pre-select the closest class by name so the common case is one click.
  useEffect(() => {
    setChoice((current) => {
      const next = { ...current };
      let changed = false;
      for (const item of broken) {
        if (next[item.enrollment.id]) continue;
        const suggestion = suggestClassFor(item, classes);
        next[item.enrollment.id] = { classId: suggestion?.id || "", slotId: "" };
        changed = true;
      }
      return changed ? next : current;
    });
  }, [broken, classes]);

  if (broken.length === 0 || dismissed) return null;

  const relink = async (enrollmentId: string, studentName: string) => {
    const picked = choice[enrollmentId];
    const target = classes.find((cls) => cls.id === picked?.classId);
    if (!target) {
      toast({ title: "Pick a class first", variant: "destructive" });
      return;
    }
    const slot = (target.timeSlots || []).find((item) => item.id === picked.slotId);
    setBusyId(enrollmentId);
    try {
      await relinkEnrollmentClass(enrollmentId, {
        classId: target.id,
        className: target.name,
        slotId: slot?.id,
        slotLabel: slot?.label,
      });
      toast({
        title: "Enrolment re-linked",
        description: `${studentName} is now attached to ${target.name} and can see its content.`,
      });
      logAction("Re-linked enrolment", `${studentName} → ${target.name}`);
    } catch (error) {
      toast({
        title: "Could not re-link",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="font-display text-lg text-amber-900">
              {broken.length} enrolment{broken.length === 1 ? "" : "s"} point{broken.length === 1 ? "s" : ""} at a deleted class
            </p>
            <p className="mt-0.5 font-body text-sm text-amber-800">
              These students can't see a live link, recordings or materials — their class no longer exists.
              Pick the correct class for each and they'll have access immediately.
            </p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 font-body text-xs font-semibold text-amber-700 hover:underline"
        >
          Hide for now
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {broken.map(({ enrollment, rememberedClassName }) => {
          const picked = choice[enrollment.id] || { classId: "", slotId: "" };
          const target = classes.find((cls) => cls.id === picked.classId);
          const slots = target?.timeSlots || [];
          return (
            <div key={enrollment.id} className="rounded-lg border border-amber-200 bg-white/70 p-3">
              <div className="mb-2 min-w-0">
                <p className="font-body text-sm font-semibold text-foreground">{enrollment.student.name}</p>
                <p className="font-body text-xs text-muted-foreground">
                  Was enrolled in "{rememberedClassName || "an unnamed class"}"
                  {enrollment.slotLabel ? ` · ${enrollment.slotLabel}` : ""}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <select
                  value={picked.classId}
                  onChange={(e) => setChoice((current) => ({ ...current, [enrollment.id]: { classId: e.target.value, slotId: "" } }))}
                  className={inputClass}
                  aria-label={`Class for ${enrollment.student.name}`}
                >
                  <option value="">Select the correct class…</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>{cls.name}{cls.active ? "" : " (inactive)"}</option>
                  ))}
                </select>
                <select
                  value={picked.slotId}
                  onChange={(e) => setChoice((current) => ({ ...current, [enrollment.id]: { ...picked, slotId: e.target.value } }))}
                  className={inputClass}
                  disabled={slots.length === 0}
                  aria-label={`Batch for ${enrollment.student.name}`}
                >
                  <option value="">{slots.length === 0 ? "No batches on this class" : "Batch (optional)"}</option>
                  {slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
                </select>
                <button
                  onClick={() => relink(enrollment.id, enrollment.student.name)}
                  disabled={busyId === enrollment.id || !picked.classId}
                  className="flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
                >
                  {busyId === enrollment.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Re-link
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BrokenEnrollmentsBanner;
