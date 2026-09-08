import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Link2, Loader2, Trash2, UserX, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAdminLog } from "@/hooks/useAdminLog";
import { useUndoableDelete } from "@/hooks/useUndoableDelete";
import UndoDeleteBar from "@/components/UndoDeleteBar";
import { confirmDialog } from "@/components/ConfirmDialogHost";
import {
  relinkEnrollmentClass,
  subscribeToClasses,
  subscribeToEnrollmentsAdmin,
  type ClassDoc,
  type EnrollmentDoc,
} from "@/lib/classes";
import {
  buildStudentClaimIndex,
  findBrokenEnrollments,
  suggestClassFor,
  type StudentClaimSource,
} from "@/lib/students/brokenEnrollments";
import { describeFailures, describeRemoved, purgeEnrollment } from "@/lib/students/purge";
import { subscribeToStudents } from "@/lib/students";

// ---------------------------------------------------------------------------
// Broken enrolments (req 6, extended for req 2 + 3).
//
// When a class document is deleted its enrolments keep pointing at the missing
// id, so those students can never see a live link, recordings or materials.
// Two very different situations end up here:
//
//   1. The student is still with us → pick the right class and re-link.
//   2. The student was deleted and this row is the only thing left of them →
//      re-linking helps nobody. It needs to GO, together with the fees,
//      attendance, certificates and bills that hang off it.
//
// Case 2 was the one the admin kept being nagged about with no way out, so the
// banner now deletes: confirm inline, confirm in a dialog, then five seconds to
// undo before anything is actually written.
// ---------------------------------------------------------------------------

const inputClass = "w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background";

/** Dismissal is remembered per SET of broken ids: a new one un-hides the banner. */
const DISMISS_KEY = "javani.brokenEnrollments.dismissed";

interface BrokenEnrollmentsBannerProps {
  /** Live student profiles. Without them the banner can't tell case 1 from case 2. */
  students?: StudentClaimSource[];
}

const BrokenEnrollmentsBanner = ({ students }: BrokenEnrollmentsBannerProps) => {
  const { toast } = useToast();
  const logAction = useAdminLog();
  const { pending, revision, scheduleDelete, undoDelete, isPendingDelete } = useUndoableDelete(5000);

  const [enrollments, setEnrollments] = useState<EnrollmentDoc[]>([]);
  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [choice, setChoice] = useState<Record<string, { classId: string; slotId: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null); // step 1 of the delete
  const [dismissedSignature, setDismissedSignature] = useState<string>(() => {
    try { return localStorage.getItem(DISMISS_KEY) || ""; } catch { return ""; }
  });

  useEffect(() => subscribeToEnrollmentsAdmin(setEnrollments, () => undefined), []);
  useEffect(() => subscribeToClasses(setClasses, () => undefined), []);

  // Pages that already hold the student list pass it in; the rest (Classes
  // Manager) get their own subscription, because without it the banner cannot
  // tell "re-link this" from "this student is gone, delete it".
  const [ownStudents, setOwnStudents] = useState<StudentClaimSource[] | null>(null);
  useEffect(() => {
    if (students) return undefined;
    return subscribeToStudents((items) => setOwnStudents(items), () => setOwnStudents([]));
  }, [students]);

  const studentIndex = useMemo(() => {
    const list = students || ownStudents;
    return list ? buildStudentClaimIndex(list) : undefined;
  }, [students, ownStudents]);

  const broken = useMemo(
    () => findBrokenEnrollments(enrollments, classes.map((cls) => cls.id), studentIndex)
      // A row waiting out its undo window is already gone as far as the admin
      // is concerned — showing it again would look like the delete failed.
      .filter((item) => !isPendingDelete(item.enrollment.id)),
    // `pending` is in the deps because it is what CHANGES when a row starts or
    // cancels its undo window — `isPendingDelete` reads a ref and never does.
    [enrollments, classes, studentIndex, isPendingDelete, pending, revision],
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

  const signature = useMemo(
    () => broken.map((item) => item.enrollment.id).sort().join("|"),
    [broken],
  );

  const orphans = broken.filter((item) => item.studentDeleted);

  const undoBar = <UndoDeleteBar pending={pending} onUndo={undoDelete} />;

  // Nothing to show — but the undo bar must still render while a delete waits.
  if (broken.length === 0 || (signature && signature === dismissedSignature)) return undoBar;

  const hideForNow = () => {
    setDismissedSignature(signature);
    try { localStorage.setItem(DISMISS_KEY, signature); } catch { /* private mode */ }
    toast({
      title: "Hidden",
      description: "It comes back only if another enrolment breaks. Delete or re-link them to clear it for good.",
    });
  };

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

  /** The delete itself — runs only after the 5-second undo window expires. */
  const runDelete = async (enrollmentId: string, studentName: string, className: string) => {
    try {
      const result = await purgeEnrollment(enrollmentId);
      toast({
        title: `Deleted ${studentName}'s broken enrolment`,
        description: `Removed ${describeRemoved(result.removed)}.${result.failed.length > 0 ? ` Could not remove: ${describeFailures(result.failed)}.` : ""}`,
        variant: result.failed.length > 0 ? "destructive" : undefined,
      });
      logAction(
        "Deleted broken enrolment",
        `${studentName} · was in "${className}" · removed ${describeRemoved(result.removed)}`,
      );
    } catch (error) {
      toast({
        title: "Could not delete the enrolment",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
      // Rethrow so the row comes back — it is still there in Firestore.
      throw error;
    }
  };

  /** Step 2: the dialog. Step 1 is the inline "Confirm" the row already showed. */
  const askAndDelete = async (enrollmentId: string, studentName: string, className: string, studentDeleted: boolean) => {
    setArmed(null);
    const ok = await confirmDialog({
      title: `Delete ${studentName}'s enrolment permanently?`,
      description: [
        `It points at "${className || "a class"}", which no longer exists.`,
        studentDeleted
          ? "This student's profile is already deleted, so nothing else is attached to them."
          : "The student's profile stays — only this class enrolment goes.",
        "Its fee records, attendance, progress reports, submissions, certificates and bills are removed with it.",
        "You'll get 5 seconds to undo.",
      ].join("\n\n"),
      confirmText: "Delete enrolment",
      destructive: true,
    });
    if (!ok) return;
    scheduleDelete(
      enrollmentId,
      `${studentName} · broken enrolment`,
      () => runDelete(enrollmentId, studentName, className),
    );
  };

  const deleteAllOrphans = async () => {
    const ok = await confirmDialog({
      title: `Delete all ${orphans.length} enrolments left by deleted students?`,
      description: "Every one of these points at a class that no longer exists AND has no student profile. Their fees, attendance, certificates and bills go too.\n\nYou'll get 5 seconds to undo.",
      confirmText: `Delete ${orphans.length} enrolments`,
      destructive: true,
      requireText: "DELETE",
    });
    if (!ok) return;
    for (const item of orphans) {
      const name = item.enrollment.student.name || "Unnamed student";
      scheduleDelete(item.enrollment.id, `${name} · broken enrolment`, () => runDelete(item.enrollment.id, name, item.rememberedClassName));
    }
  };

  return (
    <>
      {undoBar}
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="font-display text-lg text-amber-900">
                {broken.length} enrolment{broken.length === 1 ? "" : "s"} point{broken.length === 1 ? "s" : ""} at a deleted class
              </p>
              <p className="mt-0.5 font-body text-sm text-amber-800">
                {orphans.length === broken.length
                  ? "Their student profiles are already deleted, so there is nothing to re-link — delete them to clear this for good."
                  : "Pick the correct class for each and they'll have access immediately, or delete the ones whose student is gone."}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {orphans.length > 1 && (
              <button
                onClick={deleteAllOrphans}
                className="flex items-center gap-1.5 rounded-md border border-red-400 bg-white px-3 py-1.5 font-body text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete all {orphans.length}
              </button>
            )}
            <button
              onClick={hideForNow}
              className="font-body text-xs font-semibold text-amber-700 hover:underline"
            >
              Hide for now
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {broken.map(({ enrollment, rememberedClassName, studentDeleted }) => {
            const picked = choice[enrollment.id] || { classId: "", slotId: "" };
            const target = classes.find((cls) => cls.id === picked.classId);
            const slots = target?.timeSlots || [];
            const studentName = enrollment.student.name || "Unnamed student";
            const isArmed = armed === enrollment.id;
            return (
              <div key={enrollment.id} className="rounded-lg border border-amber-200 bg-white/70 p-3">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-body text-sm font-semibold text-foreground">
                      {studentName}
                      {studentDeleted && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 font-body text-[0.65rem] font-semibold text-red-700">
                          <UserX className="h-3 w-3" /> Student profile deleted
                        </span>
                      )}
                    </p>
                    <p className="font-body text-xs text-muted-foreground">
                      Was enrolled in "{rememberedClassName || "an unnamed class"}"
                      {enrollment.slotLabel ? ` · ${enrollment.slotLabel}` : ""}
                    </p>
                  </div>

                  {/* Step 1 of 2: arm the delete on this row. */}
                  {isArmed ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="font-body text-xs font-semibold text-red-700">Delete this?</span>
                      <button
                        onClick={() => askAndDelete(enrollment.id, studentName, rememberedClassName, studentDeleted)}
                        className="rounded-md bg-destructive px-2.5 py-1.5 font-body text-xs font-semibold text-white hover:brightness-110"
                      >
                        Yes, continue
                      </button>
                      <button
                        onClick={() => setArmed(null)}
                        className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted"
                        aria-label="Keep this enrolment"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setArmed(enrollment.id)}
                      className="flex shrink-0 items-center gap-1.5 rounded-md border border-red-300 px-2.5 py-1.5 font-body text-xs font-semibold text-red-700 hover:bg-red-50"
                      title="Delete this enrolment and everything attached to it"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <select
                    value={picked.classId}
                    onChange={(e) => setChoice((current) => ({ ...current, [enrollment.id]: { classId: e.target.value, slotId: "" } }))}
                    className={inputClass}
                    aria-label={`Class for ${studentName}`}
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
                    aria-label={`Batch for ${studentName}`}
                  >
                    <option value="">{slots.length === 0 ? "No batches on this class" : "Batch (optional)"}</option>
                    {slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
                  </select>
                  <button
                    onClick={() => relink(enrollment.id, studentName)}
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
    </>
  );
};

export default BrokenEnrollmentsBanner;
