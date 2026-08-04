import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, ClipboardList, FileText, Loader2, Plus, Save, Ticket, Trash2, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminLog } from "@/hooks/useAdminLog";
import { confirmDialog } from "@/components/ConfirmDialogHost";
import { subscribeToClasses, type ClassDoc } from "@/lib/classes";
import AdminExamsPanel from "@/components/admin/AdminExamsPanel";
import AdminCertificatesPanel from "@/components/admin/AdminCertificatesPanel";
import AdminProgressPanel from "@/components/admin/AdminProgressPanel";
import {
  deleteAssignment,
  listAssignmentsForClass,
  listSubmissionsForAssignment,
  reviewSubmission,
  saveAssignment,
  type Assignment,
  type AssignmentSubmission,
  type SubmissionStatus,
} from "@/lib/portal/assignments";

// ---------------------------------------------------------------------------
// Academics manager (req P3): set assignments per class and review the PDFs
// students submit. Exams and certificates land here as further tabs (P4).
// ---------------------------------------------------------------------------

const inputClass = "w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background";
const labelClass = "font-body text-[0.8rem] text-muted-foreground block mb-1";

const todayIso = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const emptyForm = { title: "", description: "", dueDate: todayIso(), maxMarks: "" };

const AdminAcademics = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const logAction = useAdminLog();

  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [classId, setClassId] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<Record<string, { marks: string; feedback: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"assignments" | "progress" | "exams" | "certificates">("assignments");

  useEffect(() => subscribeToClasses(setClasses, () => undefined), []);

  const selectedClass = useMemo(() => classes.find((cls) => cls.id === classId), [classes, classId]);

  const load = useCallback(async () => {
    if (!classId) { setAssignments([]); return; }
    setLoading(true);
    try {
      setAssignments(await listAssignmentsForClass(classId).catch(() => []));
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!user || !selectedClass) { toast({ title: "Pick a class first", variant: "destructive" }); return; }
    if (!form.title.trim()) { toast({ title: "Give the assignment a title", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await saveAssignment(null, {
        classId: selectedClass.id,
        className: selectedClass.name,
        title: form.title,
        description: form.description,
        dueDate: form.dueDate,
        maxMarks: Number(form.maxMarks) > 0 ? Number(form.maxMarks) : undefined,
        active: true,
        createdBy: user.uid,
      });
      toast({ title: "Assignment created" });
      logAction("Created assignment", `${selectedClass.name} · ${form.title}`);
      setForm(emptyForm);
      await load();
    } catch (error) {
      toast({ title: "Could not create", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openSubmissions = async (assignment: Assignment) => {
    if (openId === assignment.id) { setOpenId(null); return; }
    setOpenId(assignment.id);
    setLoadingSubs(true);
    try {
      const rows = await listSubmissionsForAssignment(assignment.id).catch(() => []);
      setSubmissions(rows);
      setReviewDraft(Object.fromEntries(rows.map((row) => [
        row.id,
        { marks: row.marks != null ? String(row.marks) : "", feedback: row.feedback || "" },
      ])));
    } finally {
      setLoadingSubs(false);
    }
  };

  const review = async (submission: AssignmentSubmission, status: SubmissionStatus) => {
    if (!user) return;
    setBusyId(submission.id);
    try {
      const draft = reviewDraft[submission.id] || { marks: "", feedback: "" };
      await reviewSubmission(submission.id, {
        status,
        marks: draft.marks.trim() ? Number(draft.marks) : undefined,
        feedback: draft.feedback.trim() || undefined,
        reviewedBy: user.uid,
      });
      toast({ title: status === "reviewed" ? "Marked reviewed" : "Sent back for revision" });
      logAction("Reviewed assignment", `${submission.studentName} · ${status}`);
      setSubmissions((current) => current.map((row) => (row.id === submission.id ? { ...row, status } : row)));
    } catch (error) {
      toast({ title: "Could not save the review", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (assignment: Assignment) => {
    if (!(await confirmDialog({
      title: `Delete "${assignment.title}"?`,
      description: "Students will no longer see it. Their submitted files are kept.",
      confirmText: "Delete assignment",
      destructive: true,
    }))) return;
    try {
      await deleteAssignment(assignment.id);
      logAction("Deleted assignment", `${assignment.className} · ${assignment.title}`);
      await load();
    } catch (error) {
      toast({ title: "Could not delete", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">Academics</p>
        <h1 className="mt-2 flex items-center gap-2 font-display text-3xl text-foreground">
          <ClipboardList className="h-7 w-7 text-gold" /> Academics
        </h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">Assignments, examinations and certificates — per class.</p>
      </div>

      <div className="inline-flex flex-wrap rounded-lg border border-border bg-card p-1 shadow-card">
        {([
          ["assignments", "Assignments", ClipboardList],
          ["progress", "Progress", TrendingUp],
          ["exams", "Exams", Ticket],
          ["certificates", "Certificates", Award],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-md px-4 py-2 font-body text-[0.82rem] font-semibold transition-colors ${tab === key ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground hover:text-gold"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
        <label className={labelClass}>Class</label>
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inputClass}>
          <option value="">Select a class…</option>
          {classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}{cls.active ? "" : " (inactive)"}</option>)}
        </select>
      </div>

      {tab === "progress" && <AdminProgressPanel selectedClass={selectedClass} />}
      {tab === "exams" && <AdminExamsPanel selectedClass={selectedClass} />}
      {tab === "certificates" && <AdminCertificatesPanel selectedClass={selectedClass} />}

      {tab === "assignments" && classId && (
        <div className="rounded-xl border border-gold/25 bg-gold/5 p-4">
          <p className="flex items-center gap-1.5 font-body text-sm font-semibold text-foreground"><Plus className="h-4 w-4 text-gold" /> New assignment</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 sm:col-span-2">
              <label className={labelClass}>Title *</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} placeholder="e.g. Adavu practice — week 3" />
            </div>
            <div className="min-w-0 sm:col-span-2">
              <label className={labelClass}>Instructions</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className={inputClass} />
            </div>
            <div className="min-w-0">
              <label className={labelClass}>Due date</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={inputClass} />
            </div>
            <div className="min-w-0">
              <label className={labelClass}>Max marks (optional)</label>
              <input value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: e.target.value.replace(/[^0-9]/g, "") })} className={inputClass} inputMode="numeric" placeholder="e.g. 25" />
            </div>
          </div>
          <button onClick={create} disabled={saving} className="mt-3 flex min-h-10 items-center gap-2 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Create assignment
          </button>
        </div>
      )}

      {tab === "assignments" && (loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border/60 bg-card p-10"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
      ) : classId && assignments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center font-body text-sm text-muted-foreground">No assignments for this class yet.</p>
      ) : (
        <div className="space-y-2">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-display text-lg text-foreground">{assignment.title}</h3>
                  <p className="font-body text-xs text-muted-foreground">
                    Due {assignment.dueDate || "—"}{assignment.maxMarks ? ` · ${assignment.maxMarks} marks` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => openSubmissions(assignment)} className="rounded-md border border-gold/40 px-3 py-1.5 font-body text-xs font-semibold text-gold hover:bg-gold/10">
                    {openId === assignment.id ? "Hide" : "Submissions"}
                  </button>
                  <button onClick={() => remove(assignment)} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {openId === assignment.id && (
                <div className="mt-3 border-t border-border/60 pt-3">
                  {loadingSubs ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gold" /></div>
                  ) : submissions.length === 0 ? (
                    <p className="font-body text-xs text-muted-foreground">Nothing submitted yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {submissions.map((submission) => (
                        <div key={submission.id} className="rounded-lg border border-border/60 bg-background/70 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-body text-sm font-semibold text-foreground">{submission.studentName}</p>
                              <a href={submission.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-body text-xs font-semibold text-gold hover:underline">
                                <FileText className="h-3.5 w-3.5" /> {submission.fileName || "Open PDF"}
                              </a>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 font-body text-[0.65rem] font-semibold ${submission.status === "reviewed" ? "bg-green-100 text-green-700" : submission.status === "needs-revision" ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"}`}>
                              {submission.status}
                            </span>
                          </div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-[110px_1fr]">
                            <input
                              value={reviewDraft[submission.id]?.marks || ""}
                              onChange={(e) => setReviewDraft((current) => ({ ...current, [submission.id]: { ...current[submission.id], marks: e.target.value.replace(/[^0-9]/g, ""), feedback: current[submission.id]?.feedback || "" } }))}
                              className={inputClass}
                              inputMode="numeric"
                              placeholder={assignment.maxMarks ? `Marks / ${assignment.maxMarks}` : "Marks"}
                            />
                            <input
                              value={reviewDraft[submission.id]?.feedback || ""}
                              onChange={(e) => setReviewDraft((current) => ({ ...current, [submission.id]: { ...current[submission.id], feedback: e.target.value, marks: current[submission.id]?.marks || "" } }))}
                              className={inputClass}
                              placeholder="Feedback for the student"
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button onClick={() => review(submission, "reviewed")} disabled={busyId === submission.id} className="rounded-md bg-gradient-primary px-3 py-1.5 font-body text-xs font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
                              Mark reviewed
                            </button>
                            <button onClick={() => review(submission, "needs-revision")} disabled={busyId === submission.id} className="rounded-md border border-orange-400 px-3 py-1.5 font-body text-xs font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-60">
                              Needs revision
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default AdminAcademics;
