import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import { fetchPartnerSummary, type PartnerSummaryResponse } from "@/lib/finance";
import { Handshake, LogOut, Loader2, RefreshCw, TrendingUp, TrendingDown, Wallet, Lock } from "lucide-react";

const StatCard = ({ label, value, sub, accent, icon: Icon }: { label: string; value: string; sub?: string; accent: string; icon: typeof Wallet }) => (
  <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
    <div className="flex items-center justify-between">
      <p className="font-body text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <span className={`flex h-9 w-9 items-center justify-center rounded-full bg-muted ${accent}`}><Icon className="h-4 w-4" /></span>
    </div>
    <p className={`mt-2 font-display text-3xl font-bold ${accent}`}>{value}</p>
    {sub && <p className="mt-1 font-body text-xs text-muted-foreground">{sub}</p>}
  </div>
);

const PartnerDashboard = () => {
  const { user, userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<PartnerSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      setSummary(await fetchPartnerSummary(idToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the financial summary.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

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

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-gold/30 bg-gold/5 px-4 py-2.5">
          <Lock className="h-4 w-4 text-gold" />
          <p className="font-body text-xs text-muted-foreground">Read-only view. Figures update automatically from website sales, class fees, and admin-entered expenses.</p>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total Income" value={formatPaiseAsRupees(summary.incomeInPaise)} sub="Products + courses + classes" accent="text-green-600" icon={TrendingUp} />
              <StatCard label="Total Expenses" value={formatPaiseAsRupees(summary.expensesInPaise)} accent="text-red-600" icon={TrendingDown} />
              <StatCard label="Net Profit" value={formatPaiseAsRupees(summary.netProfitInPaise)} sub="Income − Expenses" accent={summary.netProfitInPaise >= 0 ? "text-primary" : "text-red-600"} icon={Wallet} />
              <StatCard label="Your Total Share" value={formatPaiseAsRupees(summary.partnerShareInPaise)} sub="across your categories" accent="text-gold" icon={Handshake} />
            </div>

            {/* Your share, split by the categories the admin assigned you */}
            <div className="mt-6 rounded-2xl border border-gold/25 bg-gold/5 p-6 shadow-card">
              <h2 className="flex items-center gap-2 font-display text-lg text-foreground"><Handshake className="h-5 w-5 text-gold" /> Your profit share</h2>
              <p className="mt-1 font-body text-xs text-muted-foreground">You earn a share of the income in each category below. Categories set to 0% aren't included.</p>
              <dl className="mt-4 space-y-2 font-body text-sm">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <dt className="text-muted-foreground">Classes <span className="text-gold">({summary.shareClassesPercent}%)</span> <span className="text-muted-foreground">of {formatPaiseAsRupees(summary.classIncomeInPaise)}</span></dt>
                  <dd className="font-semibold text-foreground">{formatPaiseAsRupees(summary.shareClassesInPaise)}</dd>
                </div>
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <dt className="text-muted-foreground">Courses <span className="text-gold">({summary.shareCoursesPercent}%)</span> <span className="text-muted-foreground">of {formatPaiseAsRupees(summary.courseIncomeInPaise)}</span></dt>
                  <dd className="font-semibold text-foreground">{formatPaiseAsRupees(summary.shareCoursesInPaise)}</dd>
                </div>
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <dt className="text-muted-foreground">Products <span className="text-gold">({summary.shareProductsPercent}%)</span> <span className="text-muted-foreground">of {formatPaiseAsRupees(summary.productIncomeInPaise)}</span></dt>
                  <dd className="font-semibold text-foreground">{formatPaiseAsRupees(summary.shareProductsInPaise)}</dd>
                </div>
                <div className="flex justify-between pt-1"><dt className="font-semibold text-foreground">Your total share</dt><dd className="font-display text-base font-bold text-gold">{formatPaiseAsRupees(summary.partnerShareInPaise)}</dd></div>
              </dl>
            </div>

            <div className="mt-6 rounded-2xl border border-border/60 bg-card p-6 shadow-card">
              <h2 className="font-display text-lg text-foreground">Income breakdown</h2>
              <dl className="mt-4 space-y-2 font-body text-sm">
                <div className="flex justify-between border-b border-border/40 pb-2"><dt className="text-muted-foreground">Product sales</dt><dd className="font-semibold text-foreground">{formatPaiseAsRupees(summary.productIncomeInPaise)}</dd></div>
                <div className="flex justify-between border-b border-border/40 pb-2"><dt className="text-muted-foreground">Course sales</dt><dd className="font-semibold text-foreground">{formatPaiseAsRupees(summary.courseIncomeInPaise)}</dd></div>
                <div className="flex justify-between border-b border-border/40 pb-2"><dt className="text-muted-foreground">Class fees collected</dt><dd className="font-semibold text-foreground">{formatPaiseAsRupees(summary.classIncomeInPaise)}</dd></div>
                <div className="flex justify-between border-b border-border/40 pb-2"><dt className="text-muted-foreground">Total income</dt><dd className="font-semibold text-green-600">{formatPaiseAsRupees(summary.incomeInPaise)}</dd></div>
                <div className="flex justify-between border-b border-border/40 pb-2"><dt className="text-muted-foreground">Total expenses</dt><dd className="font-semibold text-red-600">− {formatPaiseAsRupees(summary.expensesInPaise)}</dd></div>
                <div className="flex justify-between pt-1"><dt className="font-semibold text-foreground">Net profit</dt><dd className="font-display text-base font-bold text-primary">{formatPaiseAsRupees(summary.netProfitInPaise)}</dd></div>
              </dl>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
};

export default PartnerDashboard;
