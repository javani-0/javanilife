import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, BadgeIndianRupee, Check, CheckCircle2, Copy, Eye, EyeOff, GraduationCap,
  Images, KeyRound, LayoutGrid, List, Loader2, MessageCircle, Pencil, Power, RefreshCw, Trash2, Upload,
  UserPlus, Wallet, X, XCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useAdminLog } from "@/hooks/useAdminLog";
import { confirmDialog } from "@/components/ConfirmDialogHost";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";
import { openSquareCropper } from "@/components/SquareImageCropper";
import StudentFeePanel from "@/components/admin/StudentFeePanel";
import StudentFeeCollections from "@/components/admin/StudentFeeCollections";
import StudentCourseEditor from "@/components/admin/StudentCourseEditor";
import StudentFeeSummary from "@/components/admin/StudentFeeSummary";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
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
  buildCourseBreakdown,
  buildPayLinkUrl,
  buildStudentBreakdown,
  deleteStudentCompletely,
  buildPaymentLinkWhatsAppUrl,
  buildStudentCredentialsWhatsAppUrl,
  createStudent,
  deleteDraftStudent,
  deleteEnrollmentRequest,
  markEnrollmentRequestAdded,
  newCourseKey,
  subscribeToEnrollmentRequests,
  markLinkShared,
  ONBOARDING_STATUS_LABELS,
  PARENT_RELATION_LABELS,
  regenerateLinkToken,
  resyncOnboardingLink,
  ROLL_NUMBER_PATTERN,
  setStudentActive,
  suggestNextStudentId,
  suggestStudentEmail,
  subscribeToStudentCredentials,
  subscribeToStudents,
  updateStudent,
  type OnboardingStatus,
  type ParentRelation,
  type StudentCourse,
  type StudentCredential,
  type StudentDoc,
  type StudentMode,
  type StudentTrack,
  type StudentWriteInput,
  type EnrollmentRequestDoc,
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
  rollNumber: string;
  // Every class this student takes (req). Each carries its own slot, fees,
  // inventory, payment methods and dates.
  courses: StudentCourse[];
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** A blank course row, optionally seeded from a class's catalog defaults. */
const makeCourse = (cls?: ClassDoc, overrides: Partial<StudentCourse> = {}): StudentCourse => {
  const track: StudentTrack = cls && !classOffersMonthly(cls) && classOffersTerm(cls) ? "term" : "monthly";
  return {
    key: newCourseKey(),
    classId: cls?.id || "",
    className: cls?.name || "",
    slotId: "",
    slotLabel: "",
    trainerName: cls?.facultyName || "",
    joiningDate: todayIso(),
    nextChargeDate: "",
    inventory: { uniform: false, kit: false, books: false },
    fees: {
      studentType: "new",
      track,
      kitFeeInPaise: 0,
      booksFeeInPaise: 0,
      uniformFeeInPaise: 0,
      monthlyFeeInPaise: track === "monthly" ? (cls?.monthlyFeeInPaise || 0) : 0,
      termFeeInPaise: track === "term" && cls ? getTermPayFullPriceInPaise(cls) : 0,
      discountInPaise: 0,
      firstMonthFree: false,
    },
    methods: { razorpay: false, qr: true, counter: true, emi: false },
    status: "active",
    ...overrides,
  };
};

const defaultForm: StudentFormState = {
  name: "", age: "", gender: "male", email: "", phone: "",
  parentName: "", parentRelation: "father", address: "", mode: "offline", photoUrl: "", rollNumber: "",
  courses: [],
};

const statusChip: Record<OnboardingStatus, string> = {
  "awaiting-payment": "bg-amber-100 text-amber-700",
  "payment-submitted": "bg-blue-100 text-blue-700",
  "counter-chosen": "bg-violet-100 text-violet-700",
  "paid-online": "bg-teal-100 text-teal-700",
  approved: "bg-green-100 text-green-700",
};

const AdminStudents = () => {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const logAction = useAdminLog();
  const isAdminRole = userProfile?.role === "admin";

  const [students, setStudents] = useState<StudentDoc[]>([]);
  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [credentials, setCredentials] = useState<Record<string, StudentCredential>>({});
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<StudentDoc | null>(null);
  const [form, setForm] = useState<StudentFormState>(defaultForm);
  const [saving, setSaving] = useState(false);
  // Whether the login email is still auto-derived from the name (req). Flips to
  // false the moment the admin edits it, so we stop overwriting their choice.
  const [emailAuto, setEmailAuto] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealPw, setRevealPw] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [feesOpenId, setFeesOpenId] = useState<string | null>(null);
  const [view, setView] = useState<"students" | "collections" | "enrolls">("students");
  const [requests, setRequests] = useState<EnrollmentRequestDoc[]>([]);
  // Grid/List for the Student Details list — desktop defaults to list, mobile
  // to grid (req); the toggle overrides. Everything stays responsive.
  const [detailView, setDetailView] = useState<"list" | "grid">(
    () => (typeof window !== "undefined" && window.innerWidth < 768 ? "grid" : "list"),
  );
  const [showGallery, setShowGallery] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => subscribeToStudents((items) => { setStudents(items); setLoading(false); }, () => setLoading(false)), []);
  useEffect(() => subscribeToClasses(setClasses, () => undefined), []);
  useEffect(() => subscribeToStudentCredentials(setCredentials, () => undefined), []);
  useEffect(() => subscribeToEnrollmentRequests(setRequests, () => undefined), []);

  // The transparent price the admin sees — and exactly what the parent's link
  // will show: one section per class, then the one grand total (req).
  const previewFees = useMemo(() => buildStudentBreakdown(form.courses), [form.courses]);
  const paymentFree = previewFees.grandTotalInPaise <= 0;
  const firstMonthFreeNotes = useMemo(() => {
    const active = form.courses.filter((course) => course.status !== "dropped");
    return active
      .filter((course) => course.fees.firstMonthFree && course.fees.track === "monthly")
      .map((course) => (active.length > 1
        ? `${course.className || "This class"}: first month's class fee will be waived automatically.`
        : "First month's class fee will be waived automatically."));
  }, [form.courses]);

  const patchCourse = (key: string, next: StudentCourse) =>
    setForm((current) => ({ ...current, courses: current.courses.map((course) => (course.key === key ? next : course)) }));

  const addCourse = () => setForm((current) => ({ ...current, courses: [...current.courses, makeCourse()] }));

  // Removing an APPROVED class never deletes it — it is marked dropped so the
  // fee history survives and only that enrollment is paused.
  const removeCourse = async (key: string) => {
    const course = form.courses.find((item) => item.key === key);
    if (!course) return;
    if (course.enrollmentId) {
      const ok = await confirmDialog({
        title: `Drop ${course.className || "this class"}?`,
        description: "Billing stops for this class and it disappears from the parent's portal. The fee history is kept.",
        confirmText: "Drop class",
        destructive: true,
      });
      if (!ok) return;
      setForm((current) => ({
        ...current,
        courses: current.courses.map((item) => (item.key === key ? { ...item, status: "dropped" as const } : item)),
      }));
      return;
    }
    setForm((current) => ({ ...current, courses: current.courses.filter((item) => item.key !== key) }));
  };

  const openAdd = (prefill?: Partial<StudentFormState>) => {
    // Suggest the next roll number — the admin can overwrite it (req). Joining
    // date defaults to today (editable).
    setForm({ ...defaultForm, rollNumber: suggestNextStudentId(students), courses: [makeCourse()], ...prefill });
    setEmailAuto(!prefill?.email); // auto-derive the email unless one was prefilled
    setEditing(null);
    setShowModal(true);
  };

  // "Add to student" from an enrolment lead (req 1): open the Add Student form
  // pre-filled with the lead's details + the class's fee/track defaults, and
  // mark the lead handled.
  const addFromRequest = (request: EnrollmentRequestDoc) => {
    const cls = classes.find((item) => item.id === request.classId);
    const slot = (cls?.timeSlots || []).find((item) => item.id === request.slotId);
    openAdd({
      name: request.studentName,
      age: request.age > 0 ? String(request.age) : "",
      gender: request.gender,
      email: request.email || suggestStudentEmail(request.studentName, students.map((s) => s.email)),
      phone: request.whatsapp || request.phone,
      parentName: request.parentName,
      address: request.address,
      courses: [makeCourse(cls, { slotId: slot?.id || "", slotLabel: slot?.label || "" })],
    });
    markEnrollmentRequestAdded(request.id).catch(() => undefined);
    logAction("Added student from enrolment lead", `${request.studentName} · ${request.className}`);
  };

  const dismissRequest = async (request: EnrollmentRequestDoc) => {
    if (!(await confirmDialog({ title: `Delete ${request.studentName}'s enrolment request?`, description: "This removes the lead. It can't be undone.", confirmText: "Delete lead", destructive: true }))) return;
    try {
      await deleteEnrollmentRequest(request.id);
      toast({ title: "Lead deleted" });
    } catch (error) {
      toast({ title: "Could not delete", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const openEdit = (student: StudentDoc) => {
    setEditing(student);
    setEmailAuto(false); // keep the student's existing email; don't auto-rewrite it
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
      rollNumber: student.studentId || student.desiredStudentId || "",
      // Every class the student takes — legacy single-class docs normalise to
      // a one-entry array, so old students open exactly as before.
      courses: student.courses.map((course) => ({ ...course })),
    });
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditing(null); setForm(defaultForm); };

  const buildWriteInput = (): StudentWriteInput | null => {
    if (!form.name.trim()) { toast({ title: "Student name is required", variant: "destructive" }); return null; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) { toast({ title: "A valid login email is required", description: "The parent signs in with this email.", variant: "destructive" }); return null; }
    const rollNumber = form.rollNumber.trim().toUpperCase();
    if (rollNumber && !ROLL_NUMBER_PATTERN.test(rollNumber)) {
      toast({ title: "Invalid roll number", description: "Use 6–20 letters/numbers (it becomes the login password), e.g. STU005.", variant: "destructive" });
      return null;
    }
    if (rollNumber) {
      // Block if ANY existing (non-deleted) student holds this number — active
      // or inactive. Reuse only becomes possible once that student is deleted
      // (req). Deleted students aren't in the list, so they never conflict.
      const holder = students.find((s) => s.id !== editing?.id && (s.studentId || s.desiredStudentId) === rollNumber);
      if (holder) { toast({ title: `Roll number ${rollNumber} is already taken`, description: `It belongs to ${holder.name}. Delete that student to free the number, or pick another.`, variant: "destructive" }); return null; }
    }
    const liveCourses = form.courses.filter((course) => course.status !== "dropped");
    if (liveCourses.length === 0 || liveCourses.some((course) => !course.classId)) {
      toast({ title: "Pick a class", description: "Every class row needs a class selected.", variant: "destructive" });
      return null;
    }
    // The same class twice would create two enrollments and two ledgers for it.
    const classIds = liveCourses.map((course) => course.classId);
    const duplicate = classIds.find((id, index) => classIds.indexOf(id) !== index);
    if (duplicate) {
      const name = classes.find((cls) => cls.id === duplicate)?.name || "That class";
      toast({ title: `${name} is already added`, description: "Remove the duplicate row — a student can only enrol once per class.", variant: "destructive" });
      return null;
    }
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
      desiredStudentId: rollNumber,
      courses: form.courses.map((course) => ({
        ...course,
        joiningDate: course.joiningDate || todayIso(),
      })),
    };
  };

  const handleSave = async () => {
    const input = buildWriteInput();
    if (!input) return;

    // Per-class validation — the parent pays one combined total, but each class
    // carries its own methods and EMI split.
    for (const course of input.courses) {
      if (course.status === "dropped") continue;
      const label = course.className || "A class";
      const courseTotal = buildCourseBreakdown(course).totalInPaise;
      if (!course.methods.razorpay && !course.methods.qr && !course.methods.counter && courseTotal > 0) {
        toast({ title: `Enable a payment method for ${label}`, description: "Pick which options the parent can use to pay.", variant: "destructive" });
        return;
      }
      if (course.methods.emi && course.fees.emiSplit) {
        const total = course.fees.emiSplit.upfrontPercentage + course.fees.emiSplit.installmentPercentages.reduce((sum, value) => sum + value, 0);
        if (total !== 100) {
          toast({ title: `EMI split for ${label} must total 100%`, description: `Currently ${total}%. Adjust the percentages.`, variant: "destructive" });
          return;
        }
      }
    }

    const classSummary = input.courses.filter((course) => course.status !== "dropped").map((course) => course.className).filter(Boolean).join(", ");
    setSaving(true);
    try {
      if (editing) {
        await updateStudent(editing, input);
        toast({ title: "Student updated" });
        logAction("Updated student", `${input.name}${editing.studentId ? ` (${editing.studentId})` : ""} · ${classSummary}`);
      } else {
        await createStudent(input);
        toast({ title: "Student created", description: "Share the payment link from the card, then approve to issue the login." });
        logAction("Created student", `${input.name} · ${classSummary}${input.desiredStudentId ? ` · roll ${input.desiredStudentId}` : ""}`);
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

  // Before the link leaves the building, push the CURRENT fees/methods onto the
  // public link doc. Without this a link written before an EMI (or price)
  // change keeps showing the parent the old amount.
  const shareLink = (student: StudentDoc) => {
    resyncOnboardingLink(student).catch((error) => {
      console.error("Could not refresh the payment link before sharing", error);
      toast({ title: "The link may be out of date", description: "Open Edit → Update Student to refresh it before the parent pays.", variant: "destructive" });
    });
  };

  const handleApprove = async (student: StudentDoc, paymentMethod: "upi" | "cash" | "manual") => {
    if (!user) return;
    setBusyId(student.id);
    try {
      const idToken = await user.getIdToken();
      const result = await approveOnboarding(idToken, { studentDocId: student.id, approve: true, paymentMethod });
      toast({ title: `Approved — ${result.studentId}`, description: `Login: ${result.credentials.email} · password ${result.credentials.password}. Share it from the card.` });
      logAction("Approved student & issued login", `${student.name} → ${result.studentId} · ${student.className} · via ${paymentMethod}`);
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
      logAction("Rejected onboarding payment", `${student.name} · ${student.className}${rejectReason.trim() ? ` · "${rejectReason.trim()}"` : ""}`);
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
      logAction(student.active ? "Marked student inactive" : "Marked student active", `${student.name}${student.studentId ? ` (${student.studentId})` : ""}`);
    } catch (error) {
      toast({ title: "Could not update status", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleRegenerate = async (student: StudentDoc) => {
    if (!(await confirmDialog({
      title: "Create a new payment link?",
      description: "The old link will stop working. Share the fresh link with the parent afterwards.",
      confirmText: "Create new link",
    }))) return;
    setBusyId(student.id);
    try {
      await regenerateLinkToken(student);
      toast({ title: "New link ready", description: "Share the fresh link with the parent." });
      logAction("Regenerated payment link", student.name);
    } catch (error) {
      toast({ title: "Could not regenerate", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (student: StudentDoc) => {
    if (!(await confirmDialog({
      title: `Delete ${student.name}'s draft?`,
      description: "The profile and its payment link are removed. This can't be undone.",
      confirmText: "Delete draft",
      destructive: true,
    }))) return;
    setBusyId(student.id);
    try {
      await deleteDraftStudent(student);
      toast({ title: "Draft deleted" });
      logAction("Deleted student draft", `${student.name} · ${student.className}`);
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
    if (!(await confirmDialog({
      title: `Permanently delete ${student.name}${student.studentId ? ` (${student.studentId})` : ""}?`,
      description: "This removes the student, their login, enrollment and ALL fee history. There is no undo.",
      confirmText: "Delete forever",
      destructive: true,
      requireText: "DELETE",
    }))) return;
    setBusyId(student.id);
    try {
      const idToken = await user.getIdToken();
      const result = await deleteStudentCompletely(idToken, student.id);
      toast({ title: "Student deleted completely", description: `Removed: ${result.removed.join(", ")}.` });
      logAction("PERMANENTLY deleted student", `${student.name}${student.studentId ? ` (${student.studentId})` : ""} · removed: ${result.removed.join(", ")}`);
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
      // Search every class the student takes, not just the first (req).
      ? students.filter((s) => [s.name, s.email, s.parentName, s.studentId, ...s.courses.map((course) => course.className)]
          .some((v) => (v || "").toLowerCase().includes(q)))
      : students;
    return [...list].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [students, search]);

  const activeCount = students.filter((s) => s.active && s.onboardingStatus === "approved").length;
  const pendingApprovals = students.filter((s) => ["payment-submitted", "counter-chosen", "paid-online"].includes(s.onboardingStatus)).length;
  const newLeadCount = requests.filter((r) => r.status === "new").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">Students</p>
          <h1 className="mt-2 flex items-center gap-2 font-display text-3xl text-foreground"><GraduationCap className="h-7 w-7 text-gold" /> Student Manager</h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">Create student profiles, send the payment link, approve, and issue the portal login.</p>
        </div>
        <button onClick={() => openAdd()} className="flex items-center gap-2 self-start rounded-md bg-gradient-primary px-4 py-2.5 font-body text-[0.85rem] font-medium text-primary-foreground hover:brightness-110">
          <UserPlus className="h-4 w-4" /> Add Student
        </button>
      </div>

      {/* Toggle: Student details · Fee collections · Enrolls (leads) (req) */}
      <div className="inline-flex flex-wrap rounded-lg border border-border bg-card p-1 shadow-card">
        <button
          onClick={() => setView("students")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 font-body text-[0.82rem] font-semibold transition-colors ${view === "students" ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground hover:text-gold"}`}
        >
          <GraduationCap className="h-4 w-4" /> Student Details
        </button>
        <button
          onClick={() => setView("collections")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 font-body text-[0.82rem] font-semibold transition-colors ${view === "collections" ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground hover:text-gold"}`}
        >
          <Wallet className="h-4 w-4" /> Fee Collections
        </button>
        <button
          onClick={() => setView("enrolls")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 font-body text-[0.82rem] font-semibold transition-colors ${view === "enrolls" ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground hover:text-gold"}`}
        >
          <UserPlus className="h-4 w-4" /> Enrolls
          {newLeadCount > 0 && <span className={`rounded-full px-1.5 py-0.5 font-body text-[0.65rem] font-bold ${view === "enrolls" ? "bg-white/20 text-white" : "bg-red-500 text-white"}`}>{newLeadCount}</span>}
        </button>
      </div>

      {view === "collections" && user ? (
        <StudentFeeCollections students={students} adminUid={user.uid} />
      ) : view === "enrolls" ? (
        <div className="space-y-3">
          <p className="font-body text-sm text-muted-foreground">Enrolment requests from the public class pages. Click <span className="font-semibold text-foreground">Add to student</span> to open a pre-filled form and create the student.</p>
          {requests.length === 0 ? (
            <div className="rounded-2xl border border-gold/15 bg-card p-10 text-center shadow-card">
              <UserPlus className="mx-auto mb-3 h-10 w-10 text-gold" />
              <h3 className="font-display text-xl text-foreground">No enrolment requests</h3>
              <p className="mt-1 font-body text-sm text-muted-foreground">When someone enrols from a class page, it shows up here.</p>
            </div>
          ) : (
            requests.map((request) => (
              <div key={request.id} className={`flex flex-col gap-3 rounded-xl border p-4 shadow-card sm:flex-row sm:items-center sm:justify-between ${request.status === "new" ? "border-gold/40 bg-gold/5" : "border-border/60 bg-card"}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg text-foreground">{request.studentName}</h3>
                    {request.status === "new" ? <span className="rounded-full bg-red-500 px-2 py-0.5 font-body text-[0.65rem] font-semibold text-white">New</span> : <span className="rounded-full bg-muted px-2 py-0.5 font-body text-[0.65rem] font-semibold text-muted-foreground">Added</span>}
                  </div>
                  <p className="mt-0.5 font-body text-sm text-muted-foreground">{request.className}{request.slotLabel ? ` · ${request.slotLabel}` : ""} · {request.age > 0 ? `${request.age} yrs · ` : ""}{request.gender}</p>
                  <p className="font-body text-xs text-muted-foreground">Parent: {request.parentName || "—"} · {request.phone || request.whatsapp}{request.email ? ` · ${request.email}` : ""}</p>
                  {request.address && <p className="font-body text-xs text-muted-foreground">{request.address}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={() => addFromRequest(request)} className="flex items-center gap-1.5 rounded-md bg-gradient-primary px-4 py-2 font-body text-[0.72rem] font-semibold text-primary-foreground hover:brightness-110">
                    <UserPlus className="h-3.5 w-3.5" /> Add to student
                  </button>
                  <button onClick={() => dismissRequest(request)} className="rounded-md border border-destructive/40 p-2 text-destructive hover:bg-destructive/10" title="Delete lead"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
      <>
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
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, parent, class or STU id…" className={`${inputClass} min-w-0 flex-1 sm:max-w-md`} />
        <div className="flex items-center gap-2">
          <button onClick={() => setShowGallery((v) => !v)} className={`flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 font-body text-[0.8rem] font-semibold transition-colors ${showGallery ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}>
            <Images className="h-4 w-4" /> <span className="hidden sm:inline">{showGallery ? "Hide gallery" : "Gallery"}</span>
          </button>
          <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
            <button onClick={() => setDetailView("list")} className={`px-2.5 py-2 ${detailView === "list" ? "bg-gold/10 text-gold" : "text-muted-foreground hover:bg-muted"}`} title="List view"><List className="h-4 w-4" /></button>
            <button onClick={() => setDetailView("grid")} className={`px-2.5 py-2 ${detailView === "grid" ? "bg-gold/10 text-gold" : "text-muted-foreground hover:bg-muted"}`} title="Grid view"><LayoutGrid className="h-4 w-4" /></button>
          </div>
        </div>
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
        <div className={detailView === "grid" ? "grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
          {filtered.map((student) => {
            const credential = credentials[student.id];
            const payUrl = student.linkToken ? buildPayLinkUrl(student.linkToken) : "";
            // The combined price across EVERY class this student takes (req).
            const studentBreakdown = buildStudentBreakdown(student.courses);
            const totalInPaise = studentBreakdown.grandTotalInPaise;
            // EMI onboarding → the link (and the WhatsApp message) ask for the
            // FIRST installment only; the rest become dues after approval. EMI
            // only applies when a single class drives the link.
            const emiSchedule = studentBreakdown.sections.length === 1
              ? studentBreakdown.sections[0].emiInstallments
              : undefined;
            const dueNowInPaise = studentBreakdown.dueNowInPaise;
            const canApprove = ["payment-submitted", "counter-chosen", "paid-online"].includes(student.onboardingStatus);
            // Classes added after the student was approved still need their own
            // enrolment + ledger — re-running Approve materialises only those.
            const newClassCount = student.courses.filter((course) => !course.enrollmentId && course.status !== "dropped").length;
            const approveMethod: "upi" | "cash" | "manual" = student.paidVia === "counter" ? "cash" : student.paidVia === "razorpay" ? "manual" : "upi";
            // An open fees panel / danger zone needs the full width — span all
            // grid columns so its table isn't cramped in one narrow cell.
            const spanFull = detailView === "grid" && feesOpenId === student.id;
            return (
              <div key={student.id} className={`rounded-xl border border-border/60 bg-card p-4 shadow-card sm:p-5 ${spanFull ? "sm:col-span-2 xl:col-span-3" : ""}`}>
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
                      {student.courses.filter((course) => course.status !== "dropped").map((course) => course.className).filter(Boolean).join(" · ") || "—"}
                      {student.courses.length === 1 && student.slotLabel ? ` · ${student.slotLabel}` : ""} · {student.fees.studentType === "new" ? "New" : "Existing"} · {student.mode === "online" ? "Online" : "Offline"}
                    </p>
                    <p className="font-body text-xs text-muted-foreground">
                      {PARENT_RELATION_LABELS[student.parentRelation]}: {student.parentName || "—"} · {student.email}{student.phone ? ` · ${student.phone}` : ""}
                    </p>
                    <p className="mt-0.5 font-body text-xs text-muted-foreground">
                      Onboarding total: <span className="font-semibold text-foreground">{formatPaiseAsRupees(totalInPaise)}</span>
                      {emiSchedule && <span className="text-gold"> · EMI — 1st installment {formatPaiseAsRupees(dueNowInPaise)} of {emiSchedule.length}</span>}
                    </p>
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
                      <button onClick={() => { shareLink(student); copyText(payUrl, "Link"); }} className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 font-body text-[0.72rem] font-semibold text-muted-foreground hover:bg-muted"><Copy className="h-3.5 w-3.5" /> Copy</button>
                      <a href={buildPaymentLinkWhatsAppUrl(student, dueNowInPaise, payUrl, emiSchedule ? { totalInPaise, installments: emiSchedule } : undefined)} target="_blank" rel="noreferrer" onClick={() => { shareLink(student); markLinkShared(student.id); logAction("Sent payment link on WhatsApp", `${student.name} · ${formatPaiseAsRupees(dueNowInPaise)}${emiSchedule ? ` (EMI 1/${emiSchedule.length} of ${formatPaiseAsRupees(totalInPaise)})` : ""}`); }} className="flex items-center gap-1.5 rounded-md bg-[#25D366] px-3 py-1.5 font-body text-[0.72rem] font-semibold text-white hover:brightness-110"><MessageCircle className="h-3.5 w-3.5" /> Send link</a>
                      <button onClick={() => handleRegenerate(student)} disabled={busyId === student.id} className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 font-body text-[0.72rem] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50" title="New link"><RefreshCw className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                )}

                {/* Proof preview + approve/reject */}
                {canApprove && (
                  <div className="mt-3 rounded-lg border border-gold/30 bg-gold/5 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-body text-sm font-semibold text-foreground">
                        {student.emiInstallmentSubmitted
                          ? `1st installment paid — please verify${student.submittedAmountInPaise ? ` (${formatPaiseAsRupees(student.submittedAmountInPaise)})` : ""}`
                          : student.paidVia === "counter" ? "Parent will pay at the counter"
                          : student.paidVia === "razorpay" ? "Paid online (Razorpay) — verify & issue login"
                          : "Payment submitted — please verify"}
                      </p>
                      {student.proofUrl
                        ? <a href={student.proofUrl} target="_blank" rel="noreferrer" className="font-body text-xs font-semibold text-gold hover:underline">View screenshot ↗</a>
                        : student.paidVia === "qr" && <span className="font-body text-xs text-muted-foreground">No screenshot attached — check the UPI statement</span>}
                    </div>
                    {student.emiInstallmentSubmitted && emiSchedule && (
                      <p className="mt-1 font-body text-xs text-muted-foreground">
                        Installment 1 of {emiSchedule.length} · remaining {formatPaiseAsRupees(Math.max(0, totalInPaise - dueNowInPaise))} becomes due after approval.
                      </p>
                    )}
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

                {/* A class added AFTER approval — materialise just that class
                    (req: one student can take multiple classes). */}
                {student.onboardingStatus === "approved" && newClassCount > 0 && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/40 bg-gold/5 p-3">
                    <p className="min-w-0 font-body text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{newClassCount} new {newClassCount > 1 ? "classes" : "class"}</span> added — set up {newClassCount > 1 ? "their" : "its"} enrolment &amp; fees.
                    </p>
                    <button onClick={() => handleApprove(student, approveMethod)} disabled={busyId === student.id} className="flex shrink-0 items-center gap-1.5 rounded-md bg-gradient-primary px-4 py-1.5 font-body text-xs font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
                      {busyId === student.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Approve new {newClassCount > 1 ? "classes" : "class"}
                    </button>
                  </div>
                )}

                {/* Direct-approve for a zero-payment onboarding (existing student, nothing due) */}
                {student.onboardingStatus === "awaiting-payment" && totalInPaise <= 0 && (
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
      </>
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
                <input
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    // Auto-derive the login email from the name until the admin
                    // edits the email themselves (req).
                    if (emailAuto) {
                      const takenEmails = students.filter((s) => s.id !== editing?.id).map((s) => s.email);
                      setForm((current) => ({ ...current, name, email: suggestStudentEmail(name, takenEmails) }));
                    } else {
                      setForm((current) => ({ ...current, name }));
                    }
                  }}
                  className={inputClass}
                  placeholder="Full name"
                />
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
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => { setForm({ ...form, email: e.target.value }); setEmailAuto(false); }}
                  className={inputClass}
                  placeholder="name@javani.com"
                />
                {emailAuto && !editing && (
                  <p className="mt-1 font-body text-[0.7rem] text-muted-foreground">Auto-filled from the name — edit it if you'd like a different login.</p>
                )}
              </div>
              <div>
                <label className={labelClass}>Roll number (Student ID)</label>
                <input
                  value={form.rollNumber}
                  onChange={(e) => setForm({ ...form, rollNumber: e.target.value.toUpperCase() })}
                  className={`${inputClass} ${editing?.onboardingStatus === "approved" ? "bg-muted text-muted-foreground" : ""}`}
                  placeholder="e.g. STU005"
                  disabled={editing?.onboardingStatus === "approved"}
                />
                <p className="mt-1 font-body text-[0.7rem] text-muted-foreground">
                  {editing?.onboardingStatus === "approved"
                    ? "Assigned at approval — it's also their password."
                    : "Suggested — edit it if you like (e.g. reuse a dropped student's number). It becomes the login password."}
                </p>
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

            {/* B + C. Classes — one editor per class the student takes (req). */}
            <div className="mb-2 mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
              <p className="font-display text-[0.95rem] font-semibold text-foreground">
                Classes &amp; fees
                {form.courses.filter((course) => course.status !== "dropped").length > 1 && (
                  <span className="ml-2 rounded-full bg-gold/15 px-2 py-0.5 font-body text-[0.68rem] font-semibold text-gold">
                    {form.courses.filter((course) => course.status !== "dropped").length} classes
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={addCourse}
                className="flex items-center gap-1.5 rounded-md border border-gold/40 px-3 py-1.5 font-body text-[0.78rem] font-semibold text-gold hover:bg-gold/10"
              >
                <UserPlus className="h-3.5 w-3.5" /> Add another class
              </button>
            </div>

            <div className="space-y-3">
              {form.courses.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center font-body text-sm text-muted-foreground">
                  No classes yet — click <span className="font-semibold text-foreground">Add another class</span>.
                </p>
              ) : form.courses.map((course, index) => (
                <StudentCourseEditor
                  key={course.key}
                  course={course}
                  classes={classes}
                  index={index}
                  total={form.courses.length}
                  locked={Boolean(course.enrollmentId)}
                  onChange={(next) => patchCourse(course.key, next)}
                  onRemove={() => { void removeCourse(course.key); }}
                />
              ))}
            </div>

            <StudentFeeSummary breakdown={previewFees} firstMonthFreeNotes={firstMonthFreeNotes} />

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
