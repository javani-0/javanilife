import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Repeat, Wallet } from "lucide-react";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import {
  monthKeyFor,
  periodLabel,
  subscribeToEnrollmentsAdmin,
  subscribeToFeesAdmin,
  summarizeFees,
  type EnrollmentDoc,
  type FeePaymentDoc,
} from "@/lib/classes";

// Compact "Classes this month" tiles for the admin dashboard.
const ClassFeeSummaryCards = () => {
  const navigate = useNavigate();
  const monthKey = useMemo(() => monthKeyFor(new Date()), []);
  const [fees, setFees] = useState<FeePaymentDoc[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentDoc[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsubFees = subscribeToFeesAdmin(monthKey, (items) => { setFees(items); setReady(true); }, () => setReady(true));
    const unsubEnrollments = subscribeToEnrollmentsAdmin(setEnrollments, () => undefined);
    return () => { unsubFees(); unsubEnrollments(); };
  }, [monthKey]);

  const totals = useMemo(() => summarizeFees(fees), [fees]);
  const activeAutopays = useMemo(() => enrollments.filter((enrollment) => enrollment.autopay.enabled && enrollment.status === "active").length, [enrollments]);

  // Hide entirely until there's at least one class fee or autopay to report.
  if (ready && fees.length === 0 && activeAutopays === 0) return null;

  const cards = [
    { label: `Collected · ${periodLabel(monthKey)}`, value: formatPaiseAsRupees(totals.collectedInPaise), sub: `${totals.pendingCount} pending · ${formatPaiseAsRupees(totals.pendingInPaise)}`, icon: Wallet, color: "text-green-600" },
    { label: "Active Autopays", value: String(activeAutopays), sub: "mandates charging monthly", icon: Repeat, color: "text-blue-600" },
    { label: "Overdue This Month", value: String(totals.overdueCount + totals.failedCount), sub: formatPaiseAsRupees(totals.overdueInPaise), icon: AlertTriangle, color: "text-red-600" },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-6">
      {cards.map((card) => (
        <div key={card.label} onClick={() => navigate("/admin/fee-collections")} className="cursor-pointer rounded-lg bg-card p-4 shadow-card transition-transform duration-300 hover:-translate-y-1 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-muted ${card.color}`}>
              <card.icon className="h-5 w-5" />
            </div>
          </div>
          <p className="font-display text-[1.8rem] font-bold leading-none text-foreground">{card.value}</p>
          <p className="mt-1 font-body text-[0.8rem] font-medium text-muted-foreground">{card.label}</p>
          <p className="mt-0.5 font-body text-[0.72rem] text-muted-foreground">{card.sub}</p>
        </div>
      ))}
    </div>
  );
};

export default ClassFeeSummaryCards;
