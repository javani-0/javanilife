import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PauseCircle, PlayCircle, Search, UserCheck, X, XCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import {
  cancelEnrollment,
  deleteEnrollment,
  ENROLLMENT_STATUS_LABELS,
  MANDATE_STATUS_LABELS,
  pauseEnrollment,
  resumeEnrollment,
  subscribeToEnrollmentsAdmin,
  type EnrollmentDoc,
  type EnrollmentStatus,
} from "@/lib/classes";

const statusStyles: Record<EnrollmentStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-blue-100 text-blue-700",
  cancelled: "bg-muted text-muted-foreground",
};

const AdminEnrollments = () => {
  const { toast } = useToast();
  const [enrollments, setEnrollments] = useState<EnrollmentDoc[]>([]);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | EnrollmentStatus>("all");
  const [selected, setSelected] = useState<EnrollmentDoc | null>(null);

  useEffect(() => subscribeToEnrollmentsAdmin(setEnrollments, (error) => console.error("Unable to load enrollments", error)), []);

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    enrollments.forEach((enrollment) => { if (enrollment.classId) map.set(enrollment.classId, enrollment.className); });
    return Array.from(map.entries());
  }, [enrollments]);

  const visible = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return enrollments
      .filter((enrollment) => classFilter === "all" || enrollment.classId === classFilter)
      .filter((enrollment) => statusFilter === "all" || enrollment.status === statusFilter)
      .filter((enrollment) => !normalizedSearch || [enrollment.student.name, enrollment.parent.name, enrollment.parent.phone, enrollment.className]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedSearch)))
      .sort((a, b) => a.student.name.localeCompare(b.student.name));
  }, [enrollments, classFilter, statusFilter, search]);

  const runAction = async (label: string, action: () => Promise<void>) => {
    try {
      await action();
      toast({ title: label });
    } catch (error) {
      console.error(label, error);
      toast({ title: "Action failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">Classes</p>
        <h1 className="mt-2 font-display text-3xl text-foreground">Enrollments</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">All enrolled students, parent contacts, autopay status, and enrolment lifecycle.</p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, parent, phone…" className="h-10 w-full rounded-md border border-border bg-background pl-10 pr-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" />
        </label>
        <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)} className="h-10 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold">
          <option value="all">All classes</option>
          {classOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-10 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold">
          <option value="all">All statuses</option>
          {Object.entries(ENROLLMENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-gold/15 bg-card p-10 text-center shadow-card">
          <UserCheck className="mx-auto mb-3 h-10 w-10 text-gold" />
          <h3 className="font-display text-xl text-foreground">No enrollments found</h3>
          <p className="mt-1 font-body text-sm text-muted-foreground">Adjust filters or wait for parents to enrol.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-muted/50">
                  {["Student", "Class", "Parent", "Fee", "Autopay", "Status", "Actions"].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-body text-[0.72rem] font-medium uppercase tracking-wider text-muted-foreground">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((enrollment) => (
                  <tr key={enrollment.id} className="cursor-pointer border-b border-border/50 hover:bg-muted/20" onClick={() => setSelected(enrollment)}>
                    <td className="px-4 py-3">
                      <p className="font-body text-sm font-medium text-foreground">{enrollment.student.name}</p>
                      <p className="font-body text-xs text-muted-foreground">{enrollment.student.age} yrs · {enrollment.student.gender}</p>
                    </td>
                    <td className="px-4 py-3 font-body text-sm text-foreground">{enrollment.className}</td>
                    <td className="px-4 py-3">
                      <p className="font-body text-sm text-foreground">{enrollment.parent.name}</p>
                      <p className="font-body text-xs text-muted-foreground">{enrollment.parent.phone}</p>
                    </td>
                    <td className="px-4 py-3 font-display text-sm font-bold text-primary">{formatPaiseAsRupees(enrollment.monthlyFeeInPaise)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 font-body text-[0.7rem] ${enrollment.autopay.enabled ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                        {enrollment.autopay.enabled ? "On" : "Off"}
                      </span>
                      {enrollment.autopay.mandateStatus && <p className="mt-0.5 font-body text-[0.65rem] text-muted-foreground">{MANDATE_STATUS_LABELS[enrollment.autopay.mandateStatus]}</p>}
                    </td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 font-body text-[0.7rem] ${statusStyles[enrollment.status]}`}>{ENROLLMENT_STATUS_LABELS[enrollment.status]}</span></td>
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <div className="flex gap-1">
                        {enrollment.status === "active" && (
                          <button onClick={() => runAction("Enrollment paused", () => pauseEnrollment(enrollment.id))} className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-blue-600" title="Pause"><PauseCircle className="h-4 w-4" /></button>
                        )}
                        {enrollment.status === "paused" && (
                          <button onClick={() => runAction("Enrollment resumed", () => resumeEnrollment(enrollment.id))} className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-green-600" title="Resume"><PlayCircle className="h-4 w-4" /></button>
                        )}
                        {enrollment.status !== "cancelled" && (
                          <button onClick={() => { if (confirm(`Cancel enrolment for ${enrollment.student.name}?`)) runAction("Enrollment cancelled", () => cancelEnrollment(enrollment.id)); }} className="p-1.5 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Cancel"><XCircle className="h-4 w-4" /></button>
                        )}
                        <button onClick={() => { if (confirm(`Are you sure you want to completely delete the enrolment for ${enrollment.student.name}? This cannot be undone.`)) runAction("Enrollment deleted", () => deleteEnrollment(enrollment.id)); }} className="p-1.5 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setSelected(null)} />
          <div className="relative mx-4 w-full max-w-lg rounded-xl bg-card p-6 shadow-hero">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-xl text-foreground">Enrolment Details</h3>
              <button onClick={() => setSelected(null)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <dl className="space-y-2 font-body text-sm">
              {[
                ["Student", `${selected.student.name} (${selected.student.age} yrs, ${selected.student.gender})`],
                ["Class", selected.className],
                ["Monthly Fee", formatPaiseAsRupees(selected.monthlyFeeInPaise)],
                ["Billing Day", `Day ${selected.billingDayOfMonth}`],
                ["Parent", selected.parent.name],
                ["Phone", selected.parent.phone],
                ["WhatsApp", selected.parent.whatsappNumber || "—"],
                ["Address", selected.parent.address || "—"],
                ["Status", ENROLLMENT_STATUS_LABELS[selected.status]],
                ["Autopay", selected.autopay.enabled ? `On${selected.autopay.mandateStatus ? ` (${MANDATE_STATUS_LABELS[selected.autopay.mandateStatus]})` : ""}` : "Off"],
                ["Next charge", selected.autopay.nextChargeAt || "—"],
                ["Started", selected.startMonthKey || "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-border/40 pb-2">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AdminEnrollments;
