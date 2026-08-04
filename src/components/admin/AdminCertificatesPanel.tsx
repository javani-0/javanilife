import { useCallback, useEffect, useRef, useState } from "react";
import { Award, Loader2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminLog } from "@/hooks/useAdminLog";
import { confirmDialog } from "@/components/ConfirmDialogHost";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";
import { listEnrollmentsForClass, type ClassDoc, type EnrollmentDoc } from "@/lib/classes";
import {
  issueCertificate,
  listCertificatesForClass,
  setCertificateStatus,
  type Certificate,
} from "@/lib/portal/exams";

const inputClass = "w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background";
const labelClass = "font-body text-[0.8rem] text-muted-foreground block mb-1";

const todayIso = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** Certificates tab of the Academics manager (req P4). */
const AdminCertificatesPanel = ({ selectedClass }: { selectedClass: ClassDoc | undefined }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const logAction = useAdminLog();

  const [roster, setRoster] = useState<EnrollmentDoc[]>([]);
  const [issued, setIssued] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(false);
  const [enrollmentId, setEnrollmentId] = useState("");
  const [title, setTitle] = useState("");
  const [issuedOn, setIssuedOn] = useState(todayIso());
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const classId = selectedClass?.id || "";

  const load = useCallback(async () => {
    if (!classId) { setRoster([]); setIssued([]); return; }
    setLoading(true);
    try {
      const [enrollments, certificates] = await Promise.all([
        listEnrollmentsForClass(classId).catch(() => [] as EnrollmentDoc[]),
        listCertificatesForClass(classId).catch(() => []),
      ]);
      setRoster(enrollments);
      setIssued(certificates);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { load(); }, [load]);

  const upload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      formData.append("folder", "certificates");
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: "POST", body: formData });
      if (!response.ok) throw new Error("Upload failed.");
      const data = await response.json();
      setImageUrl(data?.secure_url || data?.url || "");
      toast({ title: "Certificate uploaded" });
    } catch (error) {
      toast({ title: "Could not upload", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const issue = async () => {
    const enrollment = roster.find((item) => item.id === enrollmentId);
    if (!user || !selectedClass || !enrollment) { toast({ title: "Pick a student", variant: "destructive" }); return; }
    if (!title.trim()) { toast({ title: "Give the certificate a title", variant: "destructive" }); return; }
    if (!imageUrl) { toast({ title: "Upload the certificate image first", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await issueCertificate({
        enrollmentId: enrollment.id,
        studentUid: enrollment.parentUserId,
        classId: selectedClass.id,
        className: selectedClass.name,
        studentName: enrollment.student.name,
        studentId: "",
        title: title.trim(),
        issuedOn,
        certificateNumber: `JAV-CERT-${issuedOn.replace(/-/g, "")}-${enrollment.id.slice(-4).toUpperCase()}`,
        imageUrl,
        issuedBy: user.uid,
      });
      toast({ title: "Certificate issued", description: `${enrollment.student.name} · ${title}` });
      logAction("Issued certificate", `${enrollment.student.name} · ${selectedClass.name} · ${title}`);
      setTitle(""); setImageUrl(""); setEnrollmentId("");
      await load();
    } catch (error) {
      toast({ title: "Could not issue", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (certificate: Certificate) => {
    const revoking = certificate.status === "issued";
    if (revoking && !(await confirmDialog({
      title: `Revoke ${certificate.studentName}'s certificate?`,
      description: "It disappears from their portal immediately. You can restore it later.",
      confirmText: "Revoke",
      destructive: true,
    }))) return;
    await setCertificateStatus(certificate.id, revoking ? "revoked" : "issued");
    logAction(revoking ? "Revoked certificate" : "Restored certificate", `${certificate.studentName} · ${certificate.title}`);
    await load();
  };

  if (!selectedClass) {
    return <p className="rounded-xl border border-dashed border-border p-10 text-center font-body text-sm text-muted-foreground">Choose a class to issue certificates.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gold/25 bg-gold/5 p-4">
        <p className="flex items-center gap-1.5 font-body text-sm font-semibold text-foreground"><Award className="h-4 w-4 text-gold" /> Issue a certificate</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label className={labelClass}>Student *</label>
            <select value={enrollmentId} onChange={(e) => setEnrollmentId(e.target.value)} className={inputClass}>
              <option value="">Select a student…</option>
              {roster.map((item) => <option key={item.id} value={item.id}>{item.student.name}</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <label className={labelClass}>Issued on</label>
            <input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} className={inputClass} />
          </div>
          <div className="min-w-0 sm:col-span-2">
            <label className={labelClass}>Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Grade 1 Completion" />
          </div>
          <div className="min-w-0 sm:col-span-2">
            <label className={labelClass}>Certificate image *</label>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => upload(e.target.files?.[0] || null)} />
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-body text-[0.8rem] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {imageUrl ? "Replace file" : "Upload file"}
              </button>
              {imageUrl && <img src={imageUrl} alt="Certificate" className="h-14 rounded border border-border object-cover" />}
            </div>
          </div>
        </div>
        <button onClick={issue} disabled={saving} className="mt-3 flex min-h-10 items-center gap-2 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />} Issue certificate
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center rounded-xl border border-border/60 bg-card p-8"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
      ) : issued.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center font-body text-sm text-muted-foreground">No certificates issued for this class yet.</p>
      ) : (
        <div className="space-y-2">
          {issued.map((certificate) => (
            <div key={certificate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-card">
              <div className="flex min-w-0 items-center gap-3">
                <img src={certificate.imageUrl} alt="" className="h-10 w-14 shrink-0 rounded border border-border object-cover" loading="lazy" />
                <div className="min-w-0">
                  <p className="truncate font-body text-sm font-semibold text-foreground">{certificate.studentName}</p>
                  <p className="truncate font-body text-xs text-muted-foreground">{certificate.title} · {certificate.issuedOn}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 font-body text-[0.65rem] font-semibold ${certificate.status === "issued" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                  {certificate.status}
                </span>
                <button onClick={() => revoke(certificate)} className="rounded-md border border-border px-3 py-1.5 font-body text-xs font-semibold text-muted-foreground hover:bg-muted">
                  {certificate.status === "issued" ? "Revoke" : "Restore"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminCertificatesPanel;
