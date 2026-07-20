import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, CalendarClock, Clock, Download, FileText, GraduationCap, Loader2,
  PlayCircle, Radio, Video, Wallet,
} from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  deriveDisplayFeeStatus,
  formatFeeAmount,
  getClass,
  getEnrollment,
  isFeePayable,
  listFeesForEnrollment,
  type ClassDoc,
  type EnrollmentDoc,
  type FeePaymentDoc,
} from "@/lib/classes";

const ClassRoom = () => {
  const { enrollmentId = "" } = useParams();
  const { user } = useAuth();
  const [enrollment, setEnrollment] = useState<EnrollmentDoc | null>(null);
  const [classDoc, setClassDoc] = useState<ClassDoc | null>(null);
  const [fees, setFees] = useState<FeePaymentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || !enrollmentId) return;
      setLoading(true);
      try {
        const enr = await getEnrollment(enrollmentId);
        if (cancelled) return;
        if (!enr || enr.parentUserId !== user.uid) { setDenied(true); setLoading(false); return; }
        setEnrollment(enr);
        const [cls, feeList] = await Promise.all([
          enr.classId ? getClass(enr.classId) : Promise.resolve(null),
          listFeesForEnrollment(enrollmentId).catch(() => []),
        ]);
        if (cancelled) return;
        setClassDoc(cls);
        setFees(feeList);
      } catch {
        if (!cancelled) setDenied(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, enrollmentId]);

  const upcomingFee = useMemo(
    () => fees.find((fee) => isFeePayable({ status: deriveDisplayFeeStatus(fee) })),
    [fees],
  );

  const recordings = classDoc?.recordings || [];
  const materials = classDoc?.materials || [];
  const liveUrl = classDoc?.liveClassUrl || "";

  if (loading) {
    return (
      <AccountLayout title="Class" description="Live class, recordings and study materials.">
        <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-card p-10"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
      </AccountLayout>
    );
  }

  if (denied || !enrollment) {
    return (
      <AccountLayout title="Class" description="Live class, recordings and study materials.">
        <div className="rounded-2xl border border-gold/15 bg-card p-10 text-center shadow-card">
          <GraduationCap className="mx-auto mb-3 h-10 w-10 text-gold" />
          <h3 className="font-display text-xl text-foreground">Class not found</h3>
          <p className="mt-1 font-body text-sm text-muted-foreground">This class isn't linked to your account.</p>
          <Link to="/account/classes" className="mt-4 inline-block rounded-sm bg-gradient-primary px-5 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110">Back to My Classes</Link>
        </div>
      </AccountLayout>
    );
  }

  return (
    <AccountLayout title={enrollment.className} description={`${enrollment.student.name}'s class — live sessions, recordings and materials.`}>
      <div className="space-y-4">
        <Link to="/account/classes" className="inline-flex items-center gap-2 font-body text-sm font-semibold text-gold hover:text-gold-light">
          <ArrowLeft className="h-4 w-4" /> Back to My Classes
        </Link>

        {/* Header card */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl text-foreground">{enrollment.className}</h2>
            <span className="rounded-full bg-gold/10 px-2.5 py-1 font-body text-xs font-semibold text-gold">{enrollment.student.name}</span>
          </div>
          {(enrollment.slotLabel || classDoc?.schedule) && (
            <p className="mt-1 flex items-center gap-1.5 font-body text-sm text-muted-foreground">
              <Clock className="h-4 w-4 text-gold" /> {enrollment.slotLabel || classDoc?.schedule}
            </p>
          )}
          {(enrollment.trainerName || classDoc?.facultyName) && (
            <p className="mt-1 flex items-center gap-1.5 font-body text-sm text-muted-foreground">
              <GraduationCap className="h-4 w-4 text-gold" /> Trainer: <span className="font-semibold text-foreground">{enrollment.trainerName || classDoc?.facultyName}</span>
            </p>
          )}
        </div>

        {/* Live class */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100"><Radio className="h-5 w-5 text-red-600" /></div>
              <div>
                <h3 className="font-display text-lg text-foreground">Live Class</h3>
                <p className="font-body text-xs text-muted-foreground">{liveUrl ? "Join the daily live session." : "The live link will appear here when the class sets it up."}</p>
              </div>
            </div>
            {liveUrl ? (
              <a href={liveUrl} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-gradient-primary px-5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110">
                <PlayCircle className="h-4 w-4" /> Join Live Class
              </a>
            ) : (
              <span className="rounded-md border border-border px-4 py-2 font-body text-sm text-muted-foreground">Not live yet</span>
            )}
          </div>
        </div>

        {/* Fee status shortcut */}
        {upcomingFee && (
          <div className="flex flex-col gap-3 rounded-2xl border border-gold/20 bg-gold/5 p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-gold" />
              <div>
                <p className="font-body text-sm font-semibold text-foreground">{upcomingFee.periodLabel} — {formatFeeAmount(upcomingFee)}</p>
                <p className="font-body text-xs text-muted-foreground">Due {upcomingFee.dueDate || "soon"}</p>
              </div>
            </div>
            <Link to={`/account/classes?fee=${upcomingFee.id}`} className="flex min-h-10 items-center justify-center gap-1.5 rounded-sm bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110">
              <Wallet className="h-4 w-4" /> Pay fee
            </Link>
          </div>
        )}

        {/* Recordings */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
          <h3 className="flex items-center gap-2 font-display text-lg text-foreground"><Video className="h-5 w-5 text-gold" /> Class Recordings</h3>
          {recordings.length === 0 ? (
            <p className="mt-2 font-body text-sm text-muted-foreground">No recordings have been shared yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {recordings.map((rec, index) => (
                <a key={rec.id} href={rec.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/70 px-3 py-3 transition-colors hover:border-gold/40 hover:bg-gold/5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <PlayCircle className="h-5 w-5 shrink-0 text-gold" />
                    <span className="truncate font-body text-sm font-medium text-foreground">{rec.title || `Recording ${index + 1}`}</span>
                  </span>
                  <span className="shrink-0 font-body text-xs font-semibold text-gold">Watch ↗</span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Study materials */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
          <h3 className="flex items-center gap-2 font-display text-lg text-foreground"><FileText className="h-5 w-5 text-gold" /> Study Materials</h3>
          {materials.length === 0 ? (
            <p className="mt-2 font-body text-sm text-muted-foreground">No materials have been uploaded yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {materials.map((mat, index) => (
                <a key={mat.id} href={mat.url} target="_blank" rel="noreferrer" download className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/70 px-3 py-3 transition-colors hover:border-gold/40 hover:bg-gold/5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <FileText className="h-5 w-5 shrink-0 text-gold" />
                    <span className="truncate font-body text-sm font-medium text-foreground">{mat.title || `Material ${index + 1}`}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 font-body text-xs font-semibold text-gold"><Download className="h-3.5 w-3.5" /> Download</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </AccountLayout>
  );
};

export default ClassRoom;
