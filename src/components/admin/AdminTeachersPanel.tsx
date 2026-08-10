import { useEffect, useMemo, useState } from "react";
import { BookOpen, Copy, Eye, EyeOff, GraduationCap, KeyRound, Loader2, MessageCircle, Phone, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { confirmDialog } from "@/components/ConfirmDialogHost";
import { subscribeToClasses, type ClassDoc } from "@/lib/classes";
import {
  buildManagerLoginWhatsAppUrl,
  createManagerLogin,
  revokeTeacher,
  subscribeToManagerCredentials,
  subscribeToTeachers,
  updateTeacherClasses,
  type ManagerCredential,
  type TeacherDoc,
} from "@/lib/managers";

// ---------------------------------------------------------------------------
// Teacher logins (req 1).
//
// A teacher is deliberately NOT a manager with two extra page keys: they get a
// fixed console — Attendance + Academics — scoped to the classes assigned
// here. They never see fees, student records or finance, so the only thing to
// configure is which classes are theirs.
// ---------------------------------------------------------------------------

const fieldClass = "h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20";

const AdminTeachersPanel = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [teachers, setTeachers] = useState<TeacherDoc[]>([]);
  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [credentials, setCredentials] = useState<Record<string, ManagerCredential>>({});
  const [revealPw, setRevealPw] = useState<Record<string, boolean>>({});
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);

  useEffect(() => subscribeToTeachers(setTeachers, (error) => {
    console.error("Unable to load teachers", error);
    toast({ title: "Could not load teachers", variant: "destructive" });
  }), [toast]);
  useEffect(() => subscribeToManagerCredentials(setCredentials, () => undefined), []);
  useEffect(() => subscribeToClasses(setClasses, () => undefined), []);

  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
  const selectedClassIds = useMemo(
    () => classes.filter((cls) => picked[cls.id]).map((cls) => cls.id),
    [classes, picked],
  );

  const classNameOf = (classId: string) => classes.find((cls) => cls.id === classId)?.name || "Removed class";

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: `Could not copy the ${label.toLowerCase()}`, variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    if (!user) return;
    if (!name.trim()) { toast({ title: "Teacher name is required", variant: "destructive" }); return; }
    if (!email.trim()) { toast({ title: "Email is required", variant: "destructive" }); return; }
    if (password.trim().length < 6) { toast({ title: "Password must be at least 6 characters", variant: "destructive" }); return; }
    if (selectedClassIds.length === 0) {
      toast({ title: "Assign at least one class", description: "A teacher with no class can't mark attendance or set work.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const idToken = await user.getIdToken();
      await createManagerLogin(idToken, {
        email: email.trim().toLowerCase(),
        password: password.trim(),
        name: name.trim(),
        whatsapp: whatsapp.replace(/\D/g, ""),
        role: "teacher",
        classIds: selectedClassIds,
      });
      toast({ title: "Teacher created", description: `${email.trim()} can sign in at /login and mark attendance.` });
      setName(""); setWhatsapp(""); setEmail(""); setPassword(""); setPicked({});
    } catch (error) {
      toast({ title: "Could not create the teacher", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const toggleClass = async (teacher: TeacherDoc, classId: string) => {
    const next = teacher.classIds.includes(classId)
      ? teacher.classIds.filter((id) => id !== classId)
      : [...teacher.classIds, classId];
    setBusyUid(teacher.uid);
    try {
      await updateTeacherClasses(teacher.uid, next);
    } catch (error) {
      toast({ title: "Could not update classes", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyUid(null);
    }
  };

  const handleRevoke = async (teacher: TeacherDoc) => {
    if (!(await confirmDialog({
      title: `Remove ${teacher.name || teacher.email}'s teacher access?`,
      description: "Their account stays, but they can no longer mark attendance or set work. Attendance they already saved is kept.",
      confirmText: "Remove access",
      destructive: true,
    }))) return;
    setBusyUid(teacher.uid);
    try {
      await revokeTeacher(teacher.uid);
      toast({ title: "Teacher removed", description: `${teacher.email} is a normal user again.` });
    } catch (error) {
      toast({ title: "Could not remove", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gold/25 bg-gold/5 p-4">
        <p className="font-body text-sm text-muted-foreground">
          A teacher signs in at{" "}
          <a href={loginUrl} target="_blank" rel="noreferrer" className="font-semibold text-gold hover:underline">{loginUrl}</a>{" "}
          and sees only <span className="font-semibold text-foreground">Attendance</span> and{" "}
          <span className="font-semibold text-foreground">Academics</span>, for the classes you assign.
          They cannot open fees, student records or finance.
        </p>
      </div>

      {/* Create teacher */}
      <div className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
        <h2 className="flex items-center gap-2 font-display text-xl text-foreground"><Plus className="h-5 w-5 text-gold" /> Add Teacher</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block font-body text-xs font-medium text-foreground">Name <span className="text-destructive">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Guru Vanitha" className={fieldClass} disabled={creating} />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 font-body text-xs font-medium text-foreground"><Phone className="h-3.5 w-3.5 text-gold" /> WhatsApp</label>
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value.replace(/[^0-9]/g, ""))} inputMode="tel" placeholder="e.g. 919876543210" className={fieldClass} disabled={creating} />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 font-body text-xs font-medium text-foreground"><MessageCircle className="h-3.5 w-3.5 text-gold" /> Login email <span className="text-destructive">*</span></label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teacher@email.com" className={fieldClass} disabled={creating} />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 font-body text-xs font-medium text-foreground"><KeyRound className="h-3.5 w-3.5 text-gold" /> Password <span className="text-destructive">*</span></label>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 6 characters" className={fieldClass} disabled={creating} />
          </div>
        </div>

        <p className="mt-4 flex items-center gap-1.5 font-body text-sm font-semibold text-foreground"><BookOpen className="h-4 w-4 text-gold" /> Classes this teacher handles</p>
        {classes.length === 0 ? (
          <p className="mt-2 font-body text-sm text-muted-foreground">No classes exist yet — add one in Classes Manager first.</p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((cls) => (
              <label key={cls.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 font-body text-[0.82rem] transition-colors ${picked[cls.id] ? "border-gold bg-gold/10 font-semibold text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}>
                <input type="checkbox" checked={Boolean(picked[cls.id])} onChange={(e) => setPicked((current) => ({ ...current, [cls.id]: e.target.checked }))} disabled={creating} />
                <span className="min-w-0 truncate">{cls.name}{cls.active ? "" : " (inactive)"}</span>
              </label>
            ))}
          </div>
        )}

        <button onClick={handleCreate} disabled={creating} className="mt-4 flex items-center gap-2 rounded-md bg-gradient-primary px-5 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create Teacher
        </button>
        <p className="mt-2 font-body text-[0.72rem] text-muted-foreground">The email &amp; password are saved so you can re-share them on WhatsApp anytime. You can change their classes later from the list below.</p>
      </div>

      {/* Teachers list */}
      <div className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
        <h2 className="font-display text-xl text-foreground">Current Teachers ({teachers.length})</h2>
        {teachers.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border/60 p-6 text-center font-body text-sm text-muted-foreground">
            No teachers yet — create one above so attendance and assignments can start.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {teachers.map((teacher) => {
              const credential = credentials[teacher.uid];
              return (
                <div key={teacher.uid} className="rounded-lg border border-border/60 bg-background/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-body text-sm font-semibold text-foreground">
                        <GraduationCap className="h-4 w-4 text-gold" /> {teacher.name || teacher.email}
                      </p>
                      <p className="font-body text-xs text-muted-foreground">{teacher.email}{teacher.whatsapp ? ` · ${teacher.whatsapp}` : ""}</p>
                      <p className="mt-1 font-body text-xs text-muted-foreground">
                        {teacher.classIds.length === 0
                          ? <span className="font-semibold text-amber-700">No classes assigned — they can't do anything yet</span>
                          : <>Handles: <span className="font-semibold text-foreground">{teacher.classIds.map(classNameOf).join(", ")}</span></>}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {credential?.email && (
                        <>
                          <span className="flex items-center gap-1 rounded-md border border-border px-2 py-1 font-body text-[0.72rem] text-muted-foreground">
                            {revealPw[teacher.uid] ? credential.password : "••••••••"}
                            <button onClick={() => setRevealPw((prev) => ({ ...prev, [teacher.uid]: !prev[teacher.uid] }))} className="ml-1 text-muted-foreground hover:text-gold" title={revealPw[teacher.uid] ? "Hide password" : "Show password"}>
                              {revealPw[teacher.uid] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </button>
                            <button onClick={() => copyText(credential.password, "Password")} className="text-muted-foreground hover:text-gold" title="Copy password"><Copy className="h-3 w-3" /></button>
                          </span>
                          <a
                            href={buildManagerLoginWhatsAppUrl(credential, loginUrl, "teacher")}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 rounded-md bg-[#25D366] px-3 py-1.5 font-body text-[0.72rem] font-semibold text-white hover:brightness-110"
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> Share login
                          </a>
                        </>
                      )}
                      <button onClick={() => handleRevoke(teacher)} disabled={busyUid === teacher.uid} className="flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1.5 font-body text-[0.72rem] font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50">
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </div>

                  {/* Class assignment toggles */}
                  <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {classes.map((cls) => {
                      const on = teacher.classIds.includes(cls.id);
                      return (
                        <label key={cls.id} className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-1.5 font-body text-[0.78rem] transition-colors ${on ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}>
                          <span className={`min-w-0 truncate ${on ? "font-semibold" : ""}`}>{cls.name}</span>
                          <input type="checkbox" checked={on} onChange={() => toggleClass(teacher, cls.id)} disabled={busyUid === teacher.uid} />
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminTeachersPanel;
