import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import { fetchPartnerSummary, type PartnerSummaryResponse } from "@/lib/finance";
import { CalendarDays, Handshake, LogOut, Loader2, RefreshCw, TrendingDown, Trophy, Lock } from "lucide-react";

const StatCard = ({ label, value, sub, accent, icon: Icon }: { label: string; value: string; sub?: string; accent: string; icon: typeof Trophy }) => (
  <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
    <div className="flex items-center justify-between">
      <p className="font-body text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <span className={`flex h-9 w-9 items-center justify-center rounded-full bg-muted ${accent}`}><Icon className="h-4 w-4" /></span>
    </div>
    <p className={`mt-2 font-display text-2xl font-bold sm:text-3xl ${accent}`}>{value}</p>
    {sub && <p className="mt-1 font-body text-xs text-muted-foreground">{sub}</p>}
  </div>
);

/** All "YYYY-MM" keys from `from` up to `to` (inclusive), newest first. */
const monthRange = (from: string, to: string): string[] => {
  const keys: string[] = [];
  const parse = (key: string) => ({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) });
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to) || from > to) return keys;
  let { year, month } = parse(from);
  const end = parse(to);
  while (year < end.year || (year === end.year && month <= end.month)) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return keys.reverse();
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const labelFor = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

const PartnerDashboard = () => {
  const { user, userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<PartnerSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const data = await fetchPartnerSummary(idToken);
      setSummary(data);
      // Default the picker to the newest month that has data.
      setSelectedMonth((current) => current || data.months[0]?.key || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load your share summary.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const shareByMonth = useMemo(
    () => new Map((summary?.months || []).map((month) => [month.key, month.shareInPaise])),
    [summary],
  );

  // Selectable months: from the earliest data month through the CURRENT month
  // (future months never appear); months without data are listed but disabled.
  const monthOptions = useMemo(() => {
    if (!summary || summary.months.length === 0) return [] as string[];
    const earliest = summary.months[summary.months.length - 1].key;
    const nowKey = new Date().toISOString().slice(0, 7);
    return monthRange(earliest, nowKey);
  }, [summary]);

  const selectedShare = selectedMonth ? shareByMonth.get(selectedMonth) || 0 : 0;

  const categoriesLine = summary
    ? [
        summary.shareClassesPercent > 0 ? `Classes ${summary.shareClassesPercent}%` : "",
        summary.shareCoursesPercent > 0 ? `Courses ${summary.shareCoursesPercent}%` : "",
        summary.shareProductsPercent > 0 ? `Products ${summary.shareProductsPercent}%` : "",
      ].filter(Boolean).join(" · ")
    : "";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-ivory/97 px-4 backdrop-blur-sm sm:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground"><Handshake className="h-4 w-4" /></span>
          <div>
            <h1 className="font-display text-lg font-semibold text-foreground">Partner Dashboard</h1>
            <p className="font-body text-[0.7rem] text-muted-foreground">{summary?.partnerName || userProfile?.username || user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} disabled={loading} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-body text-sm hover:bg-muted disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> <span className="hidden sm:inline">Refresh</span>
          </button>
          <button onClick={handleLogout} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-body text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-8">
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-gold/30 bg-gold/5 px-4 py-2.5">
          <Lock className="h-4 w-4 shrink-0 text-gold" />
          <p className="font-body text-xs text-muted-foreground">Read-only view of your profit share{categoriesLine ? ` (${categoriesLine})` : ""}. Figures update automatically.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-card p-16"><Loader2 className="h-7 w-7 animate-spin text-gold" /></div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
            <p className="font-body text-sm text-red-700">{error}</p>
            <button onClick={() => void load()} className="mt-4 rounded-md bg-gradient-primary px-5 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110">Try again</button>
          </div>
        ) : summary ? (
          <>
            {/* Your share + total expenses — nothing detailed (req) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard label="Career Share" value={formatPaiseAsRupees(summary.careerShareInPaise)} sub="all time, across your categories" accent="text-gold" icon={Trophy} />
              <StatCard label="This Month Share" value={formatPaiseAsRupees(summary.thisMonthShareInPaise)} sub={labelFor(new Date().toISOString().slice(0, 7))} accent="text-green-600" icon={Handshake} />
              <StatCard label="Total Expenses" value={formatPaiseAsRupees(summary.careerExpensesInPaise)} sub="overall business expenses" accent="text-red-600" icon={TrendingDown} />
            </div>

            {/* Month picker — pick any past month with data; empty/future months disabled */}
            <div className="mt-6 rounded-2xl border border-gold/25 bg-gold/5 p-5 shadow-card sm:p-6">
              <h2 className="flex items-center gap-2 font-display text-lg text-foreground"><CalendarDays className="h-5 w-5 text-gold" /> Share by month</h2>
              <p className="mt-1 font-body text-xs text-muted-foreground">Pick a month to see the share you earned. Months without data are disabled.</p>

              {monthOptions.length === 0 ? (
                <p className="mt-4 rounded-lg border border-dashed border-border/60 p-6 text-center font-body text-sm text-muted-foreground">No share earned yet — this fills in as payments come in.</p>
              ) : (
                <>
                  <div className="relative mt-4">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold" />
                    <select
                      value={selectedMonth}
                      onChange={(event) => setSelectedMonth(event.target.value)}
                      className="h-12 w-full appearance-none rounded-xl border border-gold/30 bg-card pl-10 pr-4 font-body text-sm font-semibold text-foreground outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
                    >
                      {monthOptions.map((key) => {
                        const hasData = shareByMonth.has(key);
                        return (
                          <option key={key} value={key} disabled={!hasData}>
                            {labelFor(key)}{hasData ? "" : " — no data"}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-border/60 bg-card p-4">
                    <span className="font-body text-sm text-muted-foreground">Your share for <span className="font-semibold text-foreground">{selectedMonth ? labelFor(selectedMonth) : "—"}</span></span>
                    <span className="font-display text-2xl font-bold text-gold">{formatPaiseAsRupees(selectedShare)}</span>
                  </div>
                </>
              )}
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
};

export default PartnerDashboard;
