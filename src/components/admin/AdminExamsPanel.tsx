import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Save, Ticket, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminLog } from "@/hooks/useAdminLog";
import { confirmDialog } from "@/components/ConfirmDialogHost";
import type { ClassDoc } from "@/lib/classes";
import { deleteExam, listExamsForClass, saveExam, type Exam } from "@/lib/portal/exams";

const inputClass = "w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background";
const labelClass = "font-body text-[0.8rem] text-muted-foreground block mb-1";

const todayIso = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const emptyForm = {
  title: "", examDate: todayIso(), startTime: "10:00", endTime: "12:00",
  venue: "", mode: "offline" as "offline" | "online", syllabus: "", instructions: "",
  hallTicketEnabled: false,
};

/** Exams tab of the Academics manager (req P4). */
const AdminExamsPanel = ({ selectedClass }: { selectedClass: ClassDoc | undefined }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const logAction = useAdminLog();

  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const classId = selectedClass?.id || "";

  const load = useCallback(async () => {
    if (!classId) { setExams([]); return; }
    setLoading(true);
    try {
      setExams(await listExamsForClass(classId).catch(() => []));
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!user || !selectedClass) return;
    if (!form.title.trim()) { toast({ title: "Give the exam a title", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await saveExam(null, {
        classId: selectedClass.id,
        className: selectedClass.name,
        title: form.title,
        examDate: form.examDate,
        startTime: form.startTime,
        endTime: form.endTime,
        venue: form.venue,
        mode: form.mode,
        syllabus: form.syllabus,
        instructions: form.instructions.split("\n").map((line) => line.trim()).filter(Boolean),
        hallTicketEnabled: form.hallTicketEnabled,
        createdBy: user.uid,
      });
      toast({ title: "Exam created" });
      logAction("Created exam", `${selectedClass.name} · ${form.title}`);
      setForm(emptyForm);
      await load();
    } catch (error) {
      toast({ title: "Could not create the exam", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleTickets = async (exam: Exam) => {
    if (!user) return;
    try {
      await saveExam(exam.id, { ...exam, hallTicketEnabled: !exam.hallTicketEnabled, createdBy: exam.createdBy || user.uid });
      logAction(exam.hallTicketEnabled ? "Withdrew hall tickets" : "Released hall tickets", `${exam.className} · ${exam.title}`);
      await load();
    } catch (error) {
      toast({ title: "Could not update", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const remove = async (exam: Exam) => {
    if (!(await confirmDialog({
      title: `Delete "${exam.title}"?`,
      description: "Students will no longer see this exam or its hall ticket.",
      confirmText: "Delete exam",
      destructive: true,
    }))) return;
    await deleteExam(exam.id);
    logAction("Deleted exam", `${exam.className} · ${exam.title}`);
    await load();
  };

  if (!selectedClass) {
    return <p className="rounded-xl border border-dashed border-border p-10 text-center font-body text-sm text-muted-foreground">Choose a class to manage its exams.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gold/25 bg-gold/5 p-4">
        <p className="flex items-center gap-1.5 font-body text-sm font-semibold text-foreground"><Plus className="h-4 w-4 text-gold" /> New exam</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0 sm:col-span-2">
            <label className={labelClass}>Title *</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} placeholder="e.g. Grade 1 Practical Examination" />
          </div>
          <div className="min-w-0"><label className={labelClass}>Date</label>
            <input type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} className={inputClass} /></div>
          <div className="min-w-0"><label className={labelClass}>Mode</label>
            <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as "offline" | "online" })} className={inputClass}>
              <option value="offline">Offline</option><option value="online">Online</option>
            </select></div>
          <div className="min-w-0"><label className={labelClass}>Start time</label>
            <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className={inputClass} /></div>
          <div className="min-w-0"><label className={labelClass}>End time</label>
            <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className={inputClass} /></div>
          <div className="min-w-0 sm:col-span-2"><label className={labelClass}>Venue</label>
            <input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} className={inputClass} placeholder="e.g. Javani Studio, Hall 2" /></div>
          <div className="min-w-0 sm:col-span-2"><label className={labelClass}>Syllabus</label>
            <textarea value={form.syllabus} onChange={(e) => setForm({ ...form, syllabus: e.target.value })} rows={2} className={inputClass} /></div>
          <div className="min-w-0 sm:col-span-2"><label className={labelClass}>Instructions (one per line)</label>
            <textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} rows={3} className={inputClass} placeholder={"Arrive 15 minutes early\nCarry your hall ticket"} /></div>
          <label className="flex items-center gap-2 font-body text-[0.85rem] text-foreground sm:col-span-2">
            <input type="checkbox" checked={form.hallTicketEnabled} onChange={(e) => setForm({ ...form, hallTicketEnabled: e.target.checked })} />
            Release hall tickets immediately
          </label>
        </div>
        <button onClick={create} disabled={saving} className="mt-3 flex min-h-10 items-center gap-2 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Create exam
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center rounded-xl border border-border/60 bg-card p-8"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
      ) : exams.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center font-body text-sm text-muted-foreground">No exams for this class yet.</p>
      ) : (
        <div className="space-y-2">
          {exams.map((exam) => (
            <div key={exam.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-card">
              <div className="min-w-0">
                <p className="truncate font-body text-sm font-semibold text-foreground">{exam.title}</p>
                <p className="font-body text-xs text-muted-foreground">
                  {exam.examDate} · {exam.startTime}–{exam.endTime} · {exam.venue || "—"} ({exam.mode})
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => toggleTickets(exam)}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-body text-xs font-semibold ${exam.hallTicketEnabled ? "border-green-500 bg-green-50 text-green-700" : "border-border text-muted-foreground hover:border-gold/40"}`}
                >
                  <Ticket className="h-3.5 w-3.5" /> {exam.hallTicketEnabled ? "Tickets released" : "Release tickets"}
                </button>
                <button onClick={() => remove(exam)} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminExamsPanel;
