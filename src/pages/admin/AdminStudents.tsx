import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, BadgeIndianRupee, Check, CheckCircle2, Copy, Eye, EyeOff, GraduationCap,
  Images, KeyRound, Loader2, MessageCircle, Pencil, Power, RefreshCw, Trash2, Upload,
  UserPlus, Wallet, X, XCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";
import { openSquareCropper } from "@/components/SquareImageCropper";
import StudentFeePanel from "@/components/admin/StudentFeePanel";
import { formatPaiseAsRupees, parsePriceToPaise } from "@/lib/ecommerce";
import {
  classOffersMonthly,
  classOffersTerm,
  getTermPayFullPriceInPaise,
  subscribeToClasses,
  type ClassDoc,
  type Gender,
} from "@/lib/classes";
import {
  approveOnboarding,
  buildFeeBreakdown,
  buildPayLinkUrl,
  deleteStudentCompletely,
  buildPaymentLinkWhatsAppUrl,
  buildStudentCredentialsWhatsAppUrl,
  createStudent,
  deleteDraftStudent,
  isPaymentFreeOnboarding,
  markLinkShared,
  ONBOARDING_STATUS_LABELS,
  PARENT_RELATION_LABELS,
  regenerateLinkToken,
  setStudentActive,
  subscribeToStudentCredentials,
  subscribeToStudents,
  updateStudent,
  type OnboardingStatus,
  type ParentRelation,
  type StudentCredential,
  type StudentDoc,
  type StudentMode,
  type StudentTrack,
  type StudentType,
  type StudentWriteInput,
} from "@/lib/students";

const inputClass = "w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background";
const labelClass = "font-body text-[0.8rem] text-muted-foreground block mb-1";

interface StudentFormState {
  name: string;
  age: string;
  gender: Gender;
  email: string;
  phone: string;
  parentName: string;
  parentRelation: ParentRelation;
  address: string;
  mode: StudentMode;
  photoUrl: string;
  classId: string;
  slotId: string;
  track: StudentTrack;
  invUniform: boolean;
  invKit: boolean;
  invBooks: boolean;
  studentType: StudentType;
  kitFeeRupees: string;
  booksFeeRupees: string;
  uniformFeeRupees: string;
  monthlyFeeRupees: string;
  termFeeRupees: string;
  discountRupees: string;
  firstMonthFree: boolean;
  mRazorpay: boolean;
  mQr: boolean;
  mCounter: boolean;
}

const defaultForm: StudentFormState = {
  name: "", age: "", gender: "male", email: "", phone: "",
  parentName: "", parentRelation: "father", address: "", mode: "offline", photoUrl: "",
  classId: "", slotId: "", track: "monthly",
  invUniform: false, invKit: false, invBooks: false,
  studentType: "new",
  kitFeeRupees: "", booksFeeRupees: "", uniformFeeRupees: "",
  monthlyFeeRupees: "", termFeeRupees: "", discountRupees: "", firstMonthFree: false,
  mRazorpay: false, mQr: true, mCounter: true,
};

const statusChip: Record<OnboardingStatus, string> = {
  "awaiting-payment": "bg-amber-100 text-amber-700",
  "payment-submitted": "bg-blue-100 text-blue-700",
  "counter-chosen": "bg-violet-100 text-violet-700",
  "paid-online": "bg-teal-100 text-teal-700",
  approved: "bg-green-100 text-green-700",
};

const toFormFees = (form: StudentFormState) => ({
  studentType: form.studentType,
  track: form.track,
  kitFeeInPaise: parsePriceToPaise(form.kitFeeRupees) || 0,
  booksFeeInPaise: parsePriceToPaise(form.booksFeeRupees) || 0,
  uniformFeeInPaise: parsePriceToPaise(form.uniformFeeRupees) || 0,
  monthlyFeeInPaise: parsePriceToPaise(form.monthlyFeeRupees) || 0,
  termFeeInPaise: parsePriceToPaise(form.termFeeRupees) || 0,
  discountInPaise: parsePriceToPaise(form.discountRupees) || 0,
  firstMonthFree: form.firstMonthFree,
});

const AdminStudents = () => {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const isAdminRole = userProfile?.role === "admin";

  const [students, setStudents] = useState<StudentDoc[]>([]);
  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [credentials, setCredentials] = useState<Record<string, StudentCredential>>({});
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<StudentDoc | null>(null);
  const [form, setForm] = useState<StudentFormState>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealPw, setRevealPw] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [feesOpenId, setFeesOpenId] = useState<string | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => subscribeToStudents((items) => { setStudents(items); setLoading(false); }, () => setLoading(false)), []);
  useEffect(() => subscribeToClasses(setClasses, () => undefined), []);
  useEffect(() => subscribeToStudentCredentials(setCredentials, () => undefined), []);

  const selectedClass = useMemo(() => classes.find((cls) => cls.id === form.classId), [classes, form.classId]);
  const classTracks = useMemo(() => {
    if (!selectedClass) return [] as StudentTrack[];
    return [classOffersMonthly(selectedClass) ? "monthly" : null, classOffersTerm(selectedClass) ? "term" : null].filter(Boolean) as StudentTrack[];
  }, [selectedClass]);

  const previewFees = useMemo(() => buildFeeBreakdown(toFormFees(form)), [form]);
  const paymentFree = isPaymentFreeOnboarding(toFormFees(form));

  const openAdd = () => { setForm(defaultForm); setEditing(null); setShowModal(true); };

  const openEdit = (student: StudentDoc) => {
    setEditing(student);
    setForm({
      name: student.name,
      age: student.age > 0 ? String(student.age) : "",
      gender: student.gender,
      email: student.email,
      phone: student.phone,
      parentName: student.parentName,
      parentRelation: student.parentRelation,
      address: student.address,
      mode: student.mode,
      photoUrl: student.photoUrl || "",
      classId: student.classId,
      slotId: student.slotId || "",
      track: student.fees.track,
      invUniform: student.inventory.uniform,
      invKit: student.inventory.kit,
      invBooks: student.inventory.books,
      studentType: student.fees.studentType,
      kitFeeRupees: student.fees.kitFeeInPaise > 0 ? String(student.fees.kitFeeInPaise / 100) : "",
      booksFeeRupees: student.fees.booksFeeInPaise > 0 ? String(student.fees.booksFeeInPaise / 100) : "",
      uniformFeeRupees: student.fees.uniformFeeInPaise > 0 ? String(student.fees.uniformFeeInPaise / 100) : "",
      monthlyFeeRupees: student.fees.monthlyFeeInPaise > 0 ? String(student.fees.monthlyFeeInPaise / 100) : "",
      termFeeRupees: student.fees.termFeeInPaise > 0 ? String(student.fees.termFeeInPaise / 100) : "",
      discountRupees: student.fees.discountInPaise > 0 ? String(student.fees.discountInPaise / 100) : "",
      firstMonthFree: student.fees.firstMonthFree,
      mRazorpay: student.methods.razorpay,
      mQr: student.methods.qr,
      mCounter: student.methods.counter,
    });
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditing(null); setForm(defaultForm); };

  // When a class is picked, default its fee + track and (only when adding) its fee amounts.
  const handleClassChange = (classId: string) => {
    const cls = classes.find((item) => item.id === classId);
    const nextTrack: StudentTrack = cls && classOffersMonthly(cls) ? "monthly" : cls && classOffersTerm(cls) ? "term" : "monthly";
    setForm((current) => ({
      ...current,
      classId,
      slotId: "",
      track: nextTrack,
      monthlyFeeRupees: !editing && cls?.monthlyFeeInPaise ? String(cls.monthlyFeeInPaise / 100) : current.monthlyFeeRupees,
      termFeeRupees: !editing && cls?.termFeeInPaise ? String(getTermPayFullPriceInPaise(cls) / 100) : current.termFeeRupees,
    }));
  };

  const buildWriteInput = (): StudentWriteInput | null => {
    const cls = classes.find((item) => item.id === form.classId);
    if (!form.name.trim()) { toast({ title: "Student name is required", variant: "destructive" }); return null; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) { toast({ title: "A valid login email is required", description: "The parent signs in with this email.", variant: "destructive" }); return null; }
    if (!cls) { toast({ title: "Pick a class", variant: "destructive" }); return null; }
    const slot = (cls.timeSlots || []).find((item) => item.id === form.slotId);
    return {
      name: form.name,
      age: Number(form.age) || 0,
      gender: form.gender,
      email: form.email,
      phone: form.phone,
      parentName: form.parentName,
      parentRelation: form.parentRelation,
      address: form.address,
      mode: form.mode,
      photoUrl: form.photoUrl,
      classId: cls.id,
      className: cls.name,
      slotId: slot?.id,
      slotLabel: slot?.label,
      inventory: { uniform: form.invUniform, kit: form.invKit, books: form.invBooks },
      fees: toFormFees(form),
      methods: { razorpay: form.mRazorpay, qr: form.mQr, counter: form.mCounter },
    };
  };

  const handleSave = async () => {
    const input = buildWriteInput();
    if (!input) return;
    if (!input.methods.razorpay && !input.methods.qr && !input.methods.counter && !isPaymentFreeOnboarding(input.fees)) {
      toast({ title: "Enable at least one payment method", description: "Pick which options the parent can use to pay.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateStudent(editing, input);
        toast({ title: "Student updated" });
      } else {
        await createStudent(input);
        toast({ title: "Student created", description: "Share the payment link from the card, then approve to issue the login." });
      }
      closeModal();
    } catch (error) {
      toast({ title: "Could not save the student", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const copyText = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); toast({ title: `${label} copied` }); }
    catch { toast({ title: `Could not copy the ${label.toLowerCase()}`, variant: "destructive" }); }
  };

  const handleApprove = async (student: StudentDoc, paymentMethod: "upi" | "cash" | "manual") => {
    if (!user) return;
    setBusyId(student.id);
    try {
      const idToken = await user.getIdToken();
      const result = await approveOnboarding(idToken, { studentDocId: student.id, approve: true, paymentMethod });
      toast({ title: `Approved — ${result.studentId}`, description: `Login: ${result.credentials.email} · password ${result.credentials.password}. Share it from the card.` });
      (result.warnings || []).forEach((warning) => toast({ title: "Heads up", description: warning }));
    } catch (error) {
      toast({ title: "Could not approve", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (student: StudentDoc) => {
    if (!user) return;
    setBusyId(student.id);
    try {
      const idToken = await user.getIdToken();
      await approveOnboarding(idToken, { studentDocId: student.id, approve: false, rejectReason: rejectReason.trim() });
      toast({ title: "Sent back to the parent", description: "They'll see the reason and can pay again." });
      setRejectingId(null); setRejectReason("");
    } catch (error) {
      toast({ title: "Could not reject", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (student: StudentDoc) => {
    setBusyId(student.id);
    try {
      await setStudentActive(student, !student.active);
      toast({ title: student.active ? "Marked inactive" : "Marked active", description: student.active ? "Dues paused; history kept." : "Class resumed." });
    } catch (error) {
      toast({ title: "Could not update status", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleRegenerate = async (student: StudentDoc) => {
    if (!confirm("Create a new payment link? The old link will stop working.")) return;
    setBusyId(student.id);
    try {
      await regenerateLinkToken(student);
      toast({ title: "New link ready", description: "Share the fresh link with the parent." });
    } catch (error) {
      toast({ title: "Could not regenerate", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (student: StudentDoc) => {
    if (!confirm(`Delete ${student.name}'s draft? This can't be undone.`)) return;
    setBusyId(student.id);
    try {
      await deleteDraftStudent(student);
      toast({ title: "Draft deleted" });
    } catch (error) {
      toast({ title: "Could not delete", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  // Danger zone (admin only, req): removes EVERY trace — fees, enrollment,
  // link, credentials, login. Meant for test students; double confirmation.
  const handleDeleteCompletely = async (student: StudentDoc) => {
    if (!user || !isAdminRole) return;
    if (!confirm(`PERMANENTLY delete ${student.name}${student.studentId ? ` (${student.studentId})` : ""}?\n\nThis removes the student, their login, enrollment and ALL fee history. There is no undo.`)) return;
    const typed = prompt(`Type DELETE to permanently remove ${student.name}:`);
    if ((typed || "").trim().toUpperCase() !== "DELETE") { toast({ title: "Deletion cancelled" }); return; }
    setBusyId(student.id);
    try {
      const idToken = await user.getIdToken();
      const result = await deleteStudentCompletely(idToken, student.id);
      toast({ title: "Student deleted completely", description: `Removed: ${result.removed.join(", ")}.` });
    } catch (error) {
      toast({ title: "Could not delete", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handlePhotoFile = async (file: File | null) => {
    if (!file) return;
    const square = await openSquareCropper(file);
    if (!square) return;
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", square);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      formData.append("folder", "student-profiles");
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
      const data = await response.json();
      if (!data.secure_url) throw new Error(data?.error?.message || "No URL returned");
      setForm((current) => ({ ...current, photoUrl: data.secure_url }));
    } catch (error) {
      toast({ title: "Photo upload failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setPhotoUploading(false);
      if (photoRef.current) photoRef.current.value = "";
    }
  };

  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? students.filter((s) => [s.name, s.email, s.parentName, s.className, s.studentId].some((v) => (v || "").toLowerCase().includes(q)))
      : students;
    return [...list].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [students, search]);

  const activeCount = students.filter((s) => s.active && s.onboardingStatus === "approved").length;
  const pendingApprovals = students.filter((s) => ["payment-submitted", "counter-chosen", "paid-online"].includes(s.onboardingStatus)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">Students</p>
          <h1 className="mt-2 flex items-center gap-2 font-display text-3xl text-foreground"><GraduationCap className="h-7 w-7 text-gold" /> Student Manager</h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">Create student profiles, send the payment link, approve, and issue the portal login.</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 self-start rounded-md bg-gradient-primary px-4 py-2.5 font-body text-[0.85rem] font-medium text-primary-foreground hover:brightness-110">
          <UserPlus className="h-4 w-4" /> Add Student
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
          <p className="font-body text-xs text-muted-foreground">Total students</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{students.length}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
          <p className="font-body text-xs text-muted-foreground">Active</p>
          <p className="mt-1 font-display text-2xl font-bold text-green-700">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
          <p className="font-body text-xs text-muted-foreground">Awaiting approval</p>
          <p className="mt-1 font-display text-2xl font-bold text-blue-700">{pendingApprovals}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
          <p className="font-body text-xs text-muted-foreground">Inactive</p>
          <p className="mt-1 font-display text-2xl font-bold text-muted-foreground">{students.filter((s) => !s.active).length}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, parent, class or STU id…" className={`${inputClass} sm:max-w-md`} />
        <button onClick={() => setShowGallery((v) => !v)} className={`flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 font-body text-[0.8rem] font-semibold transition-colors ${showGallery ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}>
          <Images className="h-4 w-4" /> {showGallery ? "Hide gallery" : "Student gallery"}
        </button>
      </div>

      {/* Student gallery — the admin-uploaded profile photos at a glance */}
      {showGallery && (
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
          <p className="mb-3 font-body text-sm font-semibold text-foreground">Student gallery</p>
          {filtered.length === 0 ? (
            <p className="font-body text-xs text-muted-foreground">No students to show.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {filtered.map((student) => (
                <button key={student.id} onClick={() => openEdit(student)} className="group text-center" title={`Edit ${student.name}`}>
                  {student.photoUrl ? (
                    <img src={student.photoUrl} alt={student.name} className="mx-auto aspect-square w-full rounded-xl border border-border object-cover transition-transform group-hover:scale-[1.03]" loading="lazy" />
                  ) : (
                    <div className="mx-auto flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 font-display text-xl text-muted-foreground">
                      {(student.name || "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <p className="mt-1 truncate font-body text-[0.7rem] font-medium text-foreground">{student.name}</p>
                  {student.studentId && <p className="truncate font-body text-[0.65rem] text-muted-foreground">{student.studentId}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-card p-10"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-gold/15 bg-card p-10 text-center shadow-card">
          <GraduationCap className="mx-auto mb-3 h-10 w-10 text-gold" />
          <h3 className="font-display text-xl text-foreground">No students yet</h3>
          <p className="mt-1 font-body text-sm text-muted-foreground">Add your first student to send a payment link and issue a login.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((student) => {
            const credential = credentials[student.id];
            const payUrl = student.linkToken ? buildPayLinkUrl(student.linkToken) : "";
            const { totalInPaise } = buildFeeBreakdown(student.fees);
            const canApprove = ["payment-submitted", "counter-chosen", "paid-online"].includes(student.onboardingStatus);
            const approveMethod: "upi" | "cash" | "manual" = student.paidVia === "counter" ? "cash" : student.paidVia === "razorpay" ? "manual" : "upi";
            return (
              <div key={student.id} className="rounded-xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    {student.photoUrl ? (
                      <img src={student.photoUrl} alt={student.name} className="h-12 w-12 shrink-0 rounded-full border border-border object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold/15 font-display text-lg text-gold">
                        {(student.name || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-lg text-foreground">{student.name}</h3>
                      {student.studentId && <span className="rounded-full bg-gold/15 px-2.5 py-0.5 font-body text-xs font-semibold text-gold">{student.studentId}</span>}
                      <span className={`rounded-full px-2.5 py-0.5 font-body text-xs font-semibold ${statusChip[student.onboardingStatus]}`}>{ONBOARDING_STATUS_LABELS[student.onboardingStatus]}</span>
                      {!student.active && <span className="rounded-full bg-muted px-2.5 py-0.5 font-body text-xs text-muted-foreground">Inactive</span>}
                    </div>
                    <p className="mt-1 font-body text-sm text-muted-foreground">
                      {student.className}{student.slotLabel ? ` · ${student.slotLabel}` : ""} · {student.fees.studentType === "new" ? "New" : "Existing"} · {student.mode === "online" ? "Online" : "Offline"}
                    </p>
                    <p className="font-body text-xs text-muted-foreground">
                      {PARENT_RELATION_LABELS[student.parentRelation]}: {student.parentName || "—"} · {student.email}{student.phone ? ` · ${student.phone}` : ""}
                    </p>
                    <p className="mt-0.5 font-body text-xs text-muted-foreground">Onboarding total: <span className="font-semibold text-foreground">{formatPaiseAsRupees(totalInPaise)}</span></p>
                    {student.rejectReason && student.onboardingStatus === "awaiting-payment" && (
                      <p className="mt-1 font-body text-xs text-destructive">Sent back: {student.rejectReason}</p>
                    )}
                  </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {student.onboardingStatus === "approved" && student.enrollmentId && (
                      <button
                        onClick={() => setFeesOpenId((current) => (current === student.id ? null : student.id))}
                        className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 font-body text-[0.72rem] font-semibold transition-colors ${feesOpenId === student.id ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/40 hover:text-gold"}`}
                      >
                        <Wallet className="h-3.5 w-3.5" /> Fees
                      </button>
                    )}
                    <button onClick={() => openEdit(student)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-gold" title="Edit"><Pencil className="h-4 w-4" /></button>
                    {student.onboardingStatus === "approved" ? (
                      <button onClick={() => handleToggleActive(student)} disabled={busyId === student.id} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-gold disabled:opacity-50" title={student.active ? "Mark inactive" : "Mark active"}><Power className={`h-4 w-4 ${student.active ? "text-green-600" : ""}`} /></button>
                    ) : (
                      <button onClick={() => handleDelete(student)} disabled={busyId === student.id} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" title="Delete draft"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                </div>

                {/* Payment link + share (before approval) */}
                {student.onboardingStatus !== "approved" && payUrl && (
                  <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border/60 bg-background/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <Wallet className="h-4 w-4 shrink-0 text-gold" />
                      <span className="truncate font-body text-xs text-muted-foreground">{payUrl}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button onClick={() => copyText(payUrl, "Link")} className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 font-body text-[0.72rem] font-semibold text-muted-foreground hover:bg-muted"><Copy className="h-3.5 w-3.5" /> Copy</button>
                      <a href={buildPaymentLinkWhatsAppUrl(student, totalInPaise, payUrl)} target="_blank" rel="noreferrer" onClick={() => markLinkShared(student.id)} className="flex items-center gap-1.5 rounded-md bg-[#25D366] px-3 py-1.5 font-body text-[0.72rem] font-semibold text-white hover:brightness-110"><MessageCircle className="h-3.5 w-3.5" /> Send link</a>
                      <button onClick={() => handleRegenerate(student)} disabled={busyId === student.id} className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 font-body text-[0.72rem] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50" title="New link"><RefreshCw className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                )}

                {/* Proof preview + approve/reject */}
                {canApprove && (
                  <div className="mt-3 rounded-lg border border-gold/30 bg-gold/5 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-body text-sm font-semibold text-foreground">
                        {student.paidVia === "counter" ? "Parent will pay at the counter" : student.paidVia === "razorpay" ? "Paid online (Razorpay) — verify & issue login" : "Payment submitted — review the screenshot"}
                      </p>
                      {student.proofUrl && <a href={student.proofUrl} target="_blank" rel="noreferrer" className="font-body text-xs font-semibold text-gold hover:underline">View screenshot ↗</a>}
                    </div>
                    {student.upiRef && <p className="mt-1 font-body text-xs text-muted-foreground">UTR / ref: {student.upiRef}</p>}
                    {rejectingId === student.id ? (
                      <div className="mt-2 space-y-2">
                        <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason (shown to the parent)" className={inputClass} />
                        <div className="flex gap-2">
                          <button onClick={() => handleReject(student)} disabled={busyId === student.id} className="flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 font-body text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" /> Send back</button>
                          <button onClick={() => { setRejectingId(null); setRejectReason(""); }} className="rounded-md border border-border px-3 py-1.5 font-body text-xs text-muted-foreground hover:bg-muted">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button onClick={() => handleApprove(student, approveMethod)} disabled={busyId === student.id} className="flex items-center gap-1.5 rounded-md bg-gradient-primary px-4 py-1.5 font-body text-xs font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
                          {busyId === student.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Approve & issue login
                        </button>
                        <button onClick={() => setRejectingId(student.id)} disabled={busyId === student.id} className="flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 font-body text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" /> Reject</button>
                      </div>
                    )}
                  </div>
                )}

                {/* Direct-approve for a zero-payment onboarding (existing student, nothing due) */}
                {student.onboardingStatus === "awaiting-payment" && isPaymentFreeOnboarding(student.fees) && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/70 p-3">
                    <p className="font-body text-xs text-muted-foreground">Nothing to pay now — issue the login directly.</p>
                    <button onClick={() => handleApprove(student, "manual")} disabled={busyId === student.id} className="flex items-center gap-1.5 rounded-md bg-gradient-primary px-4 py-1.5 font-body text-xs font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
                      {busyId === student.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />} Create login
                    </button>
                  </div>
                )}

                {/* Credentials (after approval) */}
                {student.onboardingStatus === "approved" && credential && (
                  <div className="mt-3 flex flex-col gap-2 rounded-lg border border-green-200 bg-green-50/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 font-body text-xs">
                      <p className="text-muted-foreground">User ID: <span className="font-semibold text-foreground">{credential.email}</span></p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                        Password:
                        <span className="font-semibold text-foreground">{revealPw[student.id] ? credential.password : "••••••"}</span>
                        <button onClick={() => setRevealPw((prev) => ({ ...prev, [student.id]: !prev[student.id] }))} className="text-muted-foreground hover:text-gold" title={revealPw[student.id] ? "Hide" : "Show"}>{revealPw[student.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}</button>
                        <button onClick={() => copyText(credential.password, "Password")} className="text-muted-foreground hover:text-gold" title="Copy password"><Copy className="h-3 w-3" /></button>
                      </p>
                    </div>
                    <a href={buildStudentCredentialsWhatsAppUrl(credential, loginUrl)} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1.5 self-start rounded-md bg-[#25D366] px-3 py-1.5 font-body text-[0.72rem] font-semibold text-white hover:brightness-110 sm:self-auto"><MessageCircle className="h-3.5 w-3.5" /> Share login</a>
                  </div>
                )}

                {/* Per-student fee collections (req): full ledger + manual entry */}
                {feesOpenId === student.id && user && (
                  <StudentFeePanel student={student} adminUid={user.uid} />
                )}

                {/* Danger zone — admin only, for test logins etc. (req) */}
                {feesOpenId === student.id && isAdminRole && student.onboardingStatus === "approved" && (
                  <div className="mt-3 flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-center gap-1.5 font-body text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Danger zone: permanently removes the student, login, enrollment and all fee history.</p>
                    <button onClick={() => handleDeleteCompletely(student)} disabled={busyId === student.id} className="flex shrink-0 items-center gap-1.5 self-start rounded-md border border-destructive/50 px-3 py-1.5 font-body text-[0.72rem] font-semibold text-destructive hover:bg-destructive hover:text-white disabled:opacity-50 sm:self-auto">
                      {busyId === student.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete completely
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto p-4">
          <div className="fixed inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative mx-4 w-full max-w-2xl overflow-y-auto rounded-xl bg-card p-6 shadow-hero" style={{ maxHeight: "92vh" }}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold">Student Manager</p>
                <h3 className="font-display text-[1.3rem] font-semibold">{editing ? "Edit Student" : "Add New Student"}</h3>
              </div>
              <button onClick={closeModal} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>

            {/* A. Personal details */}
            <p className="mb-2 font-display text-[0.95rem] font-semibold text-foreground">Personal details</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 flex items-center gap-3">
                {form.photoUrl ? (
                  <img src={form.photoUrl} alt="Student" className="h-16 w-16 rounded-full border border-border object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold/15 font-display text-xl text-gold">
                    {(form.name || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => handlePhotoFile(e.target.files?.[0] || null)} />
                  <button type="button" onClick={() => photoRef.current?.click()} disabled={photoUploading} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-body text-[0.78rem] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">
                    <Upload className="h-3.5 w-3.5" /> {photoUploading ? "Uploading…" : form.photoUrl ? "Change photo" : "Upload profile photo"}
                  </button>
                  {form.photoUrl && (
                    <button type="button" onClick={() => setForm({ ...form, photoUrl: "" })} className="mt-1 block font-body text-[0.7rem] text-destructive hover:underline">Remove photo</button>
                  )}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Student name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Full name" />
              </div>
              <div>
                <label className={labelClass}>Age</label>
                <input value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value.replace(/[^0-9]/g, "") })} className={inputClass} inputMode="numeric" placeholder="e.g. 12" />
              </div>
              <div>
                <label className={labelClass}>Gender</label>
                <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as Gender })} className={inputClass}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Email (login id) *</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} placeholder="parent@email.com" />
              </div>
              <div>
                <label className={labelClass}>Phone (WhatsApp)</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} inputMode="tel" placeholder="e.g. 919876543210" />
              </div>
              <div>
                <label className={labelClass}>Parent / Guardian name</label>
                <input value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Relation</label>
                <select value={form.parentRelation} onChange={(e) => setForm({ ...form, parentRelation: e.target.value as ParentRelation })} className={inputClass}>
                  <option value="father">Father</option>
                  <option value="mother">Mother</option>
                  <option value="guardian">Guardian</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Address</label>
                <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Student mode</label>
                <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as StudentMode })} className={inputClass}>
                  <option value="offline">Offline</option>
                  <option value="online">Online</option>
                </select>
              </div>
            </div>

            {/* B. Class details */}
            <p className="mb-2 mt-5 border-t border-border/60 pt-4 font-display text-[0.95rem] font-semibold text-foreground">Class details</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Class *</label>
                <select value={form.classId} onChange={(e) => handleClassChange(e.target.value)} className={inputClass}>
                  <option value="">Select a class…</option>
                  {classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}{cls.active ? "" : " (inactive)"}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Time slot</label>
                <select value={form.slotId} onChange={(e) => setForm({ ...form, slotId: e.target.value })} className={inputClass} disabled={!selectedClass || (selectedClass.timeSlots || []).length === 0}>
                  <option value="">{(selectedClass?.timeSlots || []).length === 0 ? "No slots defined" : "Select a slot…"}</option>
                  {(selectedClass?.timeSlots || []).map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
                </select>
              </div>
              {classTracks.length > 1 && (
                <div className="sm:col-span-2">
                  <label className={labelClass}>Fee track</label>
                  <div className="flex gap-2">
                    {classTracks.map((track) => (
                      <button key={track} type="button" onClick={() => setForm({ ...form, track })} className={`flex-1 rounded-md border px-3 py-2 font-body text-[0.82rem] transition-colors ${form.track === track ? "border-gold bg-gold/10 font-semibold text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}>
                        {track === "monthly" ? "Monthly fee" : "Term course"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="sm:col-span-2">
                <label className={labelClass}>Inventory received</label>
                <div className="flex flex-wrap gap-2">
                  {([["invUniform", "Uniform"], ["invKit", "Kit"], ["invBooks", "Books"]] as const).map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setForm({ ...form, [key]: !form[key] })} className={`flex items-center gap-1.5 rounded-md border px-3 py-2 font-body text-[0.82rem] transition-colors ${form[key] ? "border-green-500 bg-green-50 font-semibold text-green-700" : "border-border text-muted-foreground hover:border-gold/40"}`}>
                      {form[key] ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* C. Fees & payment setup */}
            <p className="mb-2 mt-5 border-t border-border/60 pt-4 font-display text-[0.95rem] font-semibold text-foreground">Fees &amp; payment setup</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>Student type</label>
                <div className="flex gap-2">
                  {(["new", "existing"] as StudentType[]).map((type) => (
                    <button key={type} type="button" onClick={() => setForm({ ...form, studentType: type })} className={`flex-1 rounded-md border px-3 py-2 font-body text-[0.82rem] transition-colors ${form.studentType === type ? "border-gold bg-gold/10 font-semibold text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}>
                      {type === "new" ? "New student" : "Existing student"}
                    </button>
                  ))}
                </div>
                <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">{form.studentType === "new" ? "Includes the first pre-payment on the link." : "No pre-payment charged — only one-time items below."}</p>
              </div>
              {([["kitFeeRupees", "Kit fee"], ["booksFeeRupees", "Books fee"], ["uniformFeeRupees", "Uniform fee"]] as const).map(([key, label]) => (
                <div key={key}>
                  <label className={labelClass}>{label} (₹)</label>
                  <div className="relative">
                    <BadgeIndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={`${inputClass} pl-10`} inputMode="decimal" placeholder="0" />
                  </div>
                </div>
              ))}
              <div>
                <label className={labelClass}>Discount (₹)</label>
                <div className="relative">
                  <BadgeIndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={form.discountRupees} onChange={(e) => setForm({ ...form, discountRupees: e.target.value })} className={`${inputClass} pl-10`} inputMode="decimal" placeholder="0" />
                </div>
              </div>
              {form.track === "term" ? (
                <div className="sm:col-span-2">
                  <label className={labelClass}>Term / course fee (₹)</label>
                  <div className="relative">
                    <BadgeIndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input value={form.termFeeRupees} onChange={(e) => setForm({ ...form, termFeeRupees: e.target.value })} className={`${inputClass} pl-10`} inputMode="decimal" placeholder="0" />
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className={labelClass}>Monthly class fee (₹)</label>
                    <div className="relative">
                      <BadgeIndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input value={form.monthlyFeeRupees} onChange={(e) => setForm({ ...form, monthlyFeeRupees: e.target.value })} className={`${inputClass} pl-10`} inputMode="decimal" placeholder="0" />
                    </div>
                  </div>
                  <label className="flex items-end gap-2 pb-2 font-body text-[0.82rem] text-foreground">
                    <input type="checkbox" checked={form.firstMonthFree} onChange={(e) => setForm({ ...form, firstMonthFree: e.target.checked })} />
                    1 month free
                  </label>
                </>
              )}
            </div>

            {/* Admin-selected payment methods */}
            <div className="mt-3">
              <label className={labelClass}>Payment options the parent will see</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {([["mRazorpay", "Autopay / Pay online", "Razorpay"], ["mQr", "Pay Now (QR)", "Scan & upload screenshot"], ["mCounter", "Pay at counter", "Cash / POS at centre"]] as const).map(([key, label, sub]) => (
                  <button key={key} type="button" onClick={() => setForm({ ...form, [key]: !form[key] })} className={`rounded-md border p-3 text-left font-body text-[0.8rem] transition-colors ${form[key] ? "border-gold bg-gold/5" : "border-border"}`}>
                    <span className="flex items-center gap-2">
                      <input type="checkbox" readOnly checked={form[key]} className="pointer-events-none" />
                      <span className="font-semibold text-foreground">{label}</span>
                    </span>
                    <span className="mt-1 block text-muted-foreground">{sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Live total */}
            <div className="mt-4 rounded-lg border border-gold/25 bg-gold/5 p-3">
              <p className="font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment link total</p>
              {previewFees.rows.length === 0 ? (
                <p className="mt-1 font-body text-sm text-muted-foreground">Nothing to pay now — a login can be issued directly after saving.</p>
              ) : (
                <div className="mt-1 space-y-0.5">
                  {previewFees.rows.map((row, i) => (
                    <div key={i} className="flex justify-between font-body text-xs text-muted-foreground">
                      <span>{row.label}</span>
                      <span className={row.amountInPaise < 0 ? "text-green-700" : "text-foreground"}>{row.amountInPaise < 0 ? "−" : ""}{formatPaiseAsRupees(Math.abs(row.amountInPaise))}</span>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between border-t border-gold/20 pt-1 font-body text-sm font-bold text-foreground">
                    <span>Total</span><span>{formatPaiseAsRupees(previewFees.totalInPaise)}</span>
                  </div>
                </div>
              )}
              {form.firstMonthFree && form.track === "monthly" && <p className="mt-1 font-body text-[0.72rem] text-green-700">First month's class fee will be waived automatically.</p>}
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeModal} className="rounded-md border border-border px-5 py-2.5 font-body text-sm font-semibold text-muted-foreground hover:bg-muted">Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving} className="flex items-center justify-center gap-2 rounded-md bg-gradient-primary px-5 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {editing ? "Update Student" : paymentFree ? "Create Student" : "Create & Get Link"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default AdminStudents;
