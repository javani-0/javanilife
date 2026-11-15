// "Grant access" dialog: give a student free access to a course by email
// (reviewElearnEnrollment op "grant"). Server errors are shown as they come.
import { useEffect, useState, type FormEvent } from "react";
import { Gift, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { reviewElearnEnrollment, type ElearnCourse } from "@/lib/elearning";
import { Field, inputClass, primaryButton, secondaryButton } from "./ui";
import { cn } from "@/lib/utils";

const MAX_ACCESS_DAYS = 36500;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GrantAccessDialog = ({
  open,
  onOpenChange,
  courses,
  defaultCourseId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: ElearnCourse[];
  defaultCourseId?: string;
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [courseId, setCourseId] = useState("");
  const [email, setEmail] = useState("");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCourseId(defaultCourseId && courses.some((course) => course.id === defaultCourseId) ? defaultCourseId : courses[0]?.id || "");
    setEmail("");
    setDays("");
    setServerError(null);
    setAttempted(false);
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const course = courses.find((item) => item.id === courseId);
  const daysText = days.trim();
  const daysNumber = daysText ? Number(daysText) : null;
  const daysError = daysText && (!/^\d+$/.test(daysText) || (daysNumber ?? 0) > MAX_ACCESS_DAYS)
    ? `Use a whole number from 0 to ${MAX_ACCESS_DAYS} (0 = lifetime).`
    : null;
  const emailError = attempted && !EMAIL_PATTERN.test(email.trim()) ? "Type the email the student signed up with." : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    setServerError(null);
    if (!courseId || !EMAIL_PATTERN.test(email.trim()) || daysError) return;
    if (!user) {
      setServerError("You are signed out. Sign in again and retry.");
      return;
    }
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const result = await reviewElearnEnrollment(token, {
        op: "grant",
        courseId,
        email: email.trim().toLowerCase(),
        ...(daysNumber !== null ? { accessDays: daysNumber } : {}),
      });
      toast({
        title: result.alreadyActive ? "This student already has access" : "Access granted",
        description: `${email.trim()} can now open "${course?.title || "the course"}".`,
      });
      onOpenChange(false);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Could not grant access. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Grant free access</DialogTitle>
          <DialogDescription className="font-body">
            For a gift, a scholarship or a payment made outside the site. The student must already have an account on the site.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
          <Field label="Course" required>
            {({ id }) => (
              <select id={id} value={courseId} onChange={(event) => setCourseId(event.target.value)} className={cn(inputClass, "h-[2.4rem]")}>
                {courses.length === 0 && <option value="">No courses yet</option>}
                {courses.map((item) => (
                  <option key={item.id} value={item.id}>{item.title || item.id}{item.status === "draft" ? " (draft)" : ""}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Student email" required error={emailError}>
            {({ id, describedBy, invalid }) => (
              <input id={id} type="email" autoComplete="off" aria-describedby={describedBy} aria-invalid={invalid} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="student@example.com" className={inputClass} />
            )}
          </Field>
          <Field label="Access days (optional)" error={daysError}
            hint={course ? `Leave empty to use the course setting (${course.accessDays > 0 ? `${course.accessDays} days` : "lifetime"}). 0 = lifetime.` : "Leave empty to use the course setting. 0 = lifetime."}>
            {({ id, describedBy, invalid }) => (
              <input id={id} inputMode="numeric" aria-describedby={describedBy} aria-invalid={invalid} value={days} onChange={(event) => setDays(event.target.value)} placeholder="Course default" className={cn(inputClass, "w-40 tabular-nums")} />
            )}
          </Field>
          {serverError && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 font-body text-sm font-medium text-destructive">{serverError}</p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <button type="button" onClick={() => onOpenChange(false)} disabled={busy} className={secondaryButton}>Cancel</button>
            <button type="submit" disabled={busy || !courseId} className={primaryButton}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Gift className="h-4 w-4" aria-hidden="true" />}
              {busy ? "Granting…" : "Grant access"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default GrantAccessDialog;
