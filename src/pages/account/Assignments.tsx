import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ClipboardList, Download, FileText, Loader2, Lock, Upload } from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentPortal } from "@/contexts/StudentPortalContext";
import { useToast } from "@/hooks/use-toast";
import {
  ASSIGNMENT_STATE_LABELS,
  assignmentStateFor,
  buildSubmissionId,
  canSubmit,
  listAssignmentsForClasses,
  listMySubmissions,
  submitAssignment,
  uploadSubmissionPdf,
  validateSubmissionFile,
  type Assignment,
  type AssignmentState,
  type AssignmentSubmission,
} from "@/lib/portal/assignments";

// ---------------------------------------------------------------------------
// Assignment / practice submission (req P3). Upload a PDF per assignment; the
// class's own fee lock hides its work, consistent with the rest of the portal.
// ---------------------------------------------------------------------------

const STATE_STYLES: Record<AssignmentState, string> = {
  open: "bg-blue-100 text-blue-700",
  overdue: "bg-red-100 text-red-700",
  submitted: "bg-amber-100 text-amber-700",
  reviewed: "bg-green-100 text-green-700",
  "needs-revision": "bg-orange-100 text-orange-700",
};

const Assignments = () => {
  const { user } = useAuth();
  const { enrollments, access } = useStudentPortal();
  const { toast } = useToast();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // A class that's fee-locked hides its assignments, same as its other content.
  const openEnrollments = useMemo(
    () => enrollments.filter((item) => !access[item.id]?.locked),
    [enrollments, access],
  );
  const lockedCount = enrollments.length - openEnrollments.length;
  const classIds = useMemo(() => openEnrollments.map((item) => item.classId), [openEnrollments]);
  const classKey = classIds.join(",");

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const [list, mine] = await Promise.all([
        listAssignmentsForClasses(classIds).catch(() => []),
        listMySubmissions(user.uid).catch(() => []),
      ]);
      setAssignments(list);
      setSubmissions(mine);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, classKey]);

  useEffect(() => { load(); }, [load]);

  const submissionFor = useCallback(
    (assignment: Assignment) => {
      const enrollment = openEnrollments.find((item) => item.classId === assignment.classId);
      if (!enrollment) return undefined;
      const id = buildSubmissionId(assignment.id, enrollment.id);
      return submissions.find((item) => item.id === id);
    },
    [openEnrollments, submissions],
  );

  const handleUpload = async (assignment: Assignment, file: File | null) => {
    const problem = validateSubmissionFile(file);
    if (problem || !file || !user) {
      toast({ title: problem || "Could not submit", variant: "destructive" });
      return;
    }
    const enrollment = openEnrollments.find((item) => item.classId === assignment.classId);
    if (!enrollment) return;

    setUploadingId(assignment.id);
    try {
      const fileUrl = await uploadSubmissionPdf(file);
      await submitAssignment({
        assignment,
        enrollmentId: enrollment.id,
        studentUid: user.uid,
        studentName: enrollment.student.name,
        studentId: "",
        fileUrl,
        fileName: file.name,
        sizeBytes: file.size,
      });
      toast({ title: "Submitted", description: `${assignment.title} — your teacher will review it.` });
      await load();
    } catch (error) {
      toast({ title: "Could not submit", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setUploadingId(null);
      const input = fileRefs.current[assignment.id];
      if (input) input.value = "";
    }
  };

  if (loading) {
    return (
      <AccountLayout title="Assignments" description="Submit your practice work as a PDF.">
        <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-card p-10">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      </AccountLayout>
    );
  }

  return (
    <AccountLayout title="Assignments" description="Submit your practice work as a PDF.">
      <div className="space-y-3">
        {lockedCount > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <Lock className="h-4 w-4 shrink-0 text-red-600" />
            <p className="font-body text-xs text-red-700">
              Assignments for {lockedCount} class{lockedCount === 1 ? "" : "es"} are hidden while a fee is overdue.
            </p>
          </div>
        )}

        {assignments.length === 0 ? (
          <div className="rounded-2xl border border-gold/15 bg-card p-10 text-center shadow-card">
            <ClipboardList className="mx-auto mb-3 h-10 w-10 text-gold" />
            <h3 className="font-display text-xl text-foreground">No assignments yet</h3>
            <p className="mt-1 font-body text-sm text-muted-foreground">Work set by your teacher will appear here.</p>
          </div>
        ) : (
          assignments.map((assignment) => {
            const submission = submissionFor(assignment);
            const state = assignmentStateFor(assignment, submission);
            const uploadable = canSubmit(state);
            const busy = uploadingId === assignment.id;
            return (
              <div key={assignment.id} className="rounded-2xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display text-lg text-foreground">{assignment.title}</h3>
                    <p className="font-body text-xs text-muted-foreground">
                      {assignment.className}{assignment.dueDate ? ` · due ${assignment.dueDate}` : ""}
                      {assignment.maxMarks ? ` · ${assignment.maxMarks} marks` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 font-body text-[0.68rem] font-semibold ${STATE_STYLES[state]}`}>
                    {ASSIGNMENT_STATE_LABELS[state]}
                  </span>
                </div>

                {assignment.description && (
                  <p className="mt-2 whitespace-pre-wrap font-body text-sm text-muted-foreground">{assignment.description}</p>
                )}

                {assignment.attachmentUrl && (
                  <a href={assignment.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 font-body text-xs font-semibold text-gold hover:underline">
                    <Download className="h-3.5 w-3.5" /> Download the brief
                  </a>
                )}

                {/* What they already sent */}
                {submission && (
                  <div className="mt-3 rounded-lg border border-border/60 bg-background/70 px-3 py-2">
                    <a href={submission.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 font-body text-xs font-semibold text-gold hover:underline">
                      <FileText className="h-3.5 w-3.5" /> {submission.fileName || "Your submission"}
                    </a>
                    {submission.status === "reviewed" && (
                      <p className="mt-1 flex items-center gap-1.5 font-body text-xs text-green-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Reviewed{submission.marks != null ? ` — ${submission.marks}${assignment.maxMarks ? `/${assignment.maxMarks}` : ""} marks` : ""}
                      </p>
                    )}
                    {submission.feedback && (
                      <p className="mt-1 font-body text-xs text-foreground"><span className="font-semibold">Feedback:</span> {submission.feedback}</p>
                    )}
                  </div>
                )}

                {uploadable && (
                  <div className="mt-3">
                    <input
                      ref={(element) => { fileRefs.current[assignment.id] = element; }}
                      type="file"
                      accept="application/pdf,.pdf"
                      hidden
                      onChange={(e) => handleUpload(assignment, e.target.files?.[0] || null)}
                    />
                    <button
                      onClick={() => fileRefs.current[assignment.id]?.click()}
                      disabled={busy}
                      className="flex min-h-10 items-center justify-center gap-2 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {submission ? "Replace PDF" : "Upload PDF"}
                    </button>
                    <p className="mt-1 font-body text-[0.7rem] text-muted-foreground">PDF only, up to 10 MB.</p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </AccountLayout>
  );
};

export default Assignments;
