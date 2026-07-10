import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  addExpense,
  addManualIncome,
  buildFinanceSummary,
  deleteExpense,
  deleteManualIncome,
  subscribeToExpenses,
  subscribeToManualIncome,
  subscribeToPartnerSettings,
  sumExpensesInPaise,
  sumClassIncomeInPaise,
  sumManualIncomeInPaise,
  sumOrderIncomeInPaise,
  type ExpenseDoc,
  type IncomeDoc,
  type PartnerSettings,
} from "@/lib/finance";
import { IndianRupee, Loader2, Plus, Trash2, TrendingUp, TrendingDown, Wallet, Handshake, ShieldCheck } from "lucide-react";

const Tile = ({ label, value, sub, accent, icon: Icon }: { label: string; value: string; sub?: string; accent: string; icon: typeof IndianRupee }) => (
  <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
    <div className="flex items-center justify-between">
      <p className="font-body text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <span className={`flex h-8 w-8 items-center justify-center rounded-full bg-muted ${accent}`}><Icon className="h-4 w-4" /></span>
    </div>
    <p className={`mt-1 font-display text-2xl font-bold ${accent}`}>{value}</p>
    {sub && <p className="font-body text-xs text-muted-foreground">{sub}</p>}
  </div>
);

// "YYYY-MM-DD" from a Firestore Timestamp, {seconds}, Date, or ISO/date string.
// Empty string when there's no usable date.
const dateKeyOf = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    if (match) return match[1];
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : "";
  }
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : "";
  const record = value as { toDate?: () => Date; seconds?: number };
  if (typeof record.toDate === "function") {
    const date = record.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
  }
  if (typeof record.seconds === "number") return new Date(record.seconds * 1000).toISOString().slice(0, 10);
  return "";
};

type FinancePeriod = "all" | "month" | "today" | "day";

const AdminFinance = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [fees, setFees] = useState<Record<string, unknown>[]>([]);
  const [expenses, setExpenses] = useState<ExpenseDoc[]>([]);
  const [incomeEntries, setIncomeEntries] = useState<IncomeDoc[]>([]);
  const [settings, setSettings] = useState<PartnerSettings>({ profitSharePercent: 0 });
  const [loading, setLoading] = useState(true);

  // Expense form
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Extra income form
  const [incomeTitle, setIncomeTitle] = useState("");
  const [incomeCategory, setIncomeCategory] = useState<string>(INCOME_CATEGORIES[0]);
  const [incomeAmount, setIncomeAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [incomeNote, setIncomeNote] = useState("");
  const [savingIncome, setSavingIncome] = useState(false);
  const [busyIncomeId, setBusyIncomeId] = useState<string | null>(null);

  useEffect(() => {
    const unsubOrders = onSnapshot(collection(db, "orders"), (snap) => { setOrders(snap.docs.map((d) => d.data())); setLoading(false); }, () => setLoading(false));
    const unsubFees = onSnapshot(collection(db, "feePayments"), (snap) => setFees(snap.docs.map((d) => d.data())), () => undefined);
    const unsubExpenses = subscribeToExpenses((items) => setExpenses(items), () => undefined);
    const unsubIncome = subscribeToManualIncome((items) => setIncomeEntries(items), () => undefined);
    const unsubSettings = subscribeToPartnerSettings((value) => setSettings(value), () => undefined);
    return () => { unsubOrders(); unsubFees(); unsubExpenses(); unsubIncome(); unsubSettings(); };
  }, []);

  // Period filter (default: this month). "day" uses the calendar-picked date.
  const [period, setPeriod] = useState<FinancePeriod>("month");
  const [customDay, setCustomDay] = useState(() => new Date().toISOString().slice(0, 10));

  const inPeriod = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const monthKey = todayKey.slice(0, 7);
    return (dateKey: string): boolean => {
      if (period === "all") return true;
      if (!dateKey) return false; // undated records only count in "All time"
      if (period === "month") return dateKey.startsWith(monthKey);
      if (period === "today") return dateKey === todayKey;
      return dateKey === customDay;
    };
  }, [period, customDay]);

  const filteredOrders = useMemo(
    () => orders.filter((order) => inPeriod(dateKeyOf((order.payment as Record<string, unknown> | undefined)?.paidAt || order.createdAt))),
    [orders, inPeriod],
  );
  const filteredFees = useMemo(
    () => fees.filter((fee) => inPeriod(dateKeyOf(fee.paidAt || fee.updatedAt || fee.createdAt))),
    [fees, inPeriod],
  );
  const filteredIncome = useMemo(() => incomeEntries.filter((entry) => inPeriod(entry.receivedOn || "")), [incomeEntries, inPeriod]);
  const filteredExpenses = useMemo(() => expenses.filter((expense) => inPeriod(expense.spentOn || "")), [expenses, inPeriod]);

  const summary = useMemo(() => buildFinanceSummary({
    productIncomeInPaise: sumOrderIncomeInPaise(filteredOrders),
    classIncomeInPaise: sumClassIncomeInPaise(filteredFees.map((fee) => ({ status: String(fee.status || ""), amountInPaise: Number(fee.amountInPaise || 0) }))),
    otherIncomeInPaise: sumManualIncomeInPaise(filteredIncome),
    expensesInPaise: sumExpensesInPaise(filteredExpenses),
    profitSharePercent: settings.profitSharePercent,
  }), [filteredOrders, filteredFees, filteredIncome, filteredExpenses, settings.profitSharePercent]);

  const periodLabel = period === "all" ? "All time"
    : period === "month" ? `This month (${new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })})`
    : period === "today" ? "Today"
    : new Date(`${customDay}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const handleAddExpense = async () => {
    const rupees = Number(amount);
    if (!title.trim()) { toast({ title: "Add a title for the expense", variant: "destructive" }); return; }
    if (!Number.isFinite(rupees) || rupees <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    setSavingExpense(true);
    try {
      await addExpense({ title, category, amountInPaise: Math.round(rupees * 100), note, spentOn, createdBy: user?.uid });
      toast({ title: "Expense added" });
      setTitle(""); setAmount(""); setNote("");
    } catch (error) {
      toast({ title: "Could not add expense", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSavingExpense(false);
    }
  };

  const handleAddIncome = async () => {
    const rupees = Number(incomeAmount);
    if (!incomeTitle.trim()) { toast({ title: "Add a title for the income", variant: "destructive" }); return; }
    if (!Number.isFinite(rupees) || rupees <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    setSavingIncome(true);
    try {
      await addManualIncome({ title: incomeTitle, category: incomeCategory, amountInPaise: Math.round(rupees * 100), note: incomeNote, receivedOn, createdBy: user?.uid });
      toast({ title: "Income added" });
      setIncomeTitle(""); setIncomeAmount(""); setIncomeNote("");
    } catch (error) {
      toast({ title: "Could not add income", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSavingIncome(false);
    }
  };

  const handleDeleteIncome = async (entry: IncomeDoc) => {
    if (!confirm(`Delete income "${entry.title}"?`)) return;
    setBusyIncomeId(entry.id);
    try {
      await deleteManualIncome(entry.id);
      toast({ title: "Income deleted" });
    } catch (error) {
      toast({ title: "Could not delete", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyIncomeId(null);
    }
  };

  const handleDeleteExpense = async (expense: ExpenseDoc) => {
    if (!confirm(`Delete expense "${expense.title}"?`)) return;
    setBusyId(expense.id);
    try {
      await deleteExpense(expense.id);
      toast({ title: "Expense deleted" });
    } catch (error) {
      toast({ title: "Could not delete", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const inputClass = "h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20";

  return (
    <div className="space-y-6">
      <div>
        <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">Finance</p>
        <h1 className="mt-2 font-display text-3xl text-foreground">Income &amp; Expenses</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">Live income from product orders + class fees, your manual expenses, and the partner's profit share.</p>
      </div>

      {/* Period filter — default "This month"; calendar picks a specific day */}
      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {([["month", "This Month"], ["today", "Today"], ["all", "All Time"]] as [FinancePeriod, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={`rounded-md border px-4 py-2 font-body text-sm font-semibold transition-colors ${period === value ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}
            >
              {label}
            </button>
          ))}
          <input
            type="date"
            value={customDay}
            onChange={(e) => { if (e.target.value) { setCustomDay(e.target.value); setPeriod("day"); } }}
            className={`h-10 rounded-md border px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 ${period === "day" ? "border-gold bg-gold/10 text-gold" : "border-border bg-background text-muted-foreground"}`}
            title="Pick a specific day"
          />
        </div>
        <p className="font-body text-sm text-muted-foreground">Showing: <span className="font-semibold text-foreground">{periodLabel}</span></p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Total Income" value={formatPaiseAsRupees(summary.incomeInPaise)} sub={`Products ${formatPaiseAsRupees(summary.productIncomeInPaise)} · Classes ${formatPaiseAsRupees(summary.classIncomeInPaise)} · Other ${formatPaiseAsRupees(summary.otherIncomeInPaise)}`} accent="text-green-600" icon={TrendingUp} />
        <Tile label="Total Expenses" value={formatPaiseAsRupees(summary.expensesInPaise)} sub={`${filteredExpenses.length} entr${filteredExpenses.length === 1 ? "y" : "ies"}`} accent="text-red-600" icon={TrendingDown} />
        <Tile label="Net Profit" value={formatPaiseAsRupees(summary.netProfitInPaise)} sub="Income − Expenses" accent={summary.netProfitInPaise >= 0 ? "text-primary" : "text-red-600"} icon={Wallet} />
        <Tile label="Partner Share" value={formatPaiseAsRupees(summary.partnerShareInPaise)} sub={`${summary.profitSharePercent}% of net profit`} accent="text-gold" icon={Handshake} />
      </div>

      {loading && <p className="font-body text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading financials…</p>}

      {/* Extra income */}
      <div className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
        <h2 className="flex items-center gap-2 font-display text-xl text-foreground"><TrendingUp className="h-5 w-5 text-green-600" /> Other Income</h2>
        <p className="mt-1 font-body text-sm text-muted-foreground">Record income that doesn't come from a product order or class fee — donations, workshops, hall rentals, etc. These add to total income.</p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label className="mb-1 block font-body text-xs font-medium text-foreground">Title *</label>
            <input value={incomeTitle} onChange={(e) => setIncomeTitle(e.target.value)} placeholder="e.g. Weekend workshop" className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block font-body text-xs font-medium text-foreground">Category</label>
            <select value={incomeCategory} onChange={(e) => setIncomeCategory(e.target.value)} className={inputClass}>
              {INCOME_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-body text-xs font-medium text-foreground">Amount (₹) *</label>
            <input value={incomeAmount} onChange={(e) => setIncomeAmount(e.target.value)} inputMode="decimal" placeholder="0" className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block font-body text-xs font-medium text-foreground">Date</label>
            <input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="mb-1 block font-body text-xs font-medium text-foreground">Note</label>
            <input value={incomeNote} onChange={(e) => setIncomeNote(e.target.value)} placeholder="Optional" className={inputClass} />
          </div>
          <div className="flex items-end">
            <button onClick={handleAddIncome} disabled={savingIncome} className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
              {savingIncome ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {filteredIncome.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 p-6 text-center font-body text-sm text-muted-foreground">No manual income entries for {periodLabel.toLowerCase()}.</p>
          ) : filteredIncome.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-background/70 px-3 py-2">
              <div>
                <p className="font-body text-sm font-medium text-foreground">{entry.title}</p>
                <p className="font-body text-xs text-muted-foreground">{entry.category}{entry.receivedOn ? ` · ${entry.receivedOn}` : ""}{entry.note ? ` · ${entry.note}` : ""}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-display text-sm font-bold text-green-600">{formatPaiseAsRupees(entry.amountInPaise)}</span>
                <button onClick={() => handleDeleteIncome(entry)} disabled={busyIncomeId === entry.id} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" title="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Expenses */}
      <div className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
          <h2 className="font-display text-xl text-foreground">Expenses</h2>
          <p className="mt-1 font-body text-sm text-muted-foreground">Manually record business expenses. These reduce net profit.</p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block font-body text-xs font-medium text-foreground">Title *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. June studio rent" className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block font-body text-xs font-medium text-foreground">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-body text-xs font-medium text-foreground">Amount (₹) *</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block font-body text-xs font-medium text-foreground">Date</label>
              <input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block font-body text-xs font-medium text-foreground">Note</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className={inputClass} />
            </div>
          </div>
          <button onClick={handleAddExpense} disabled={savingExpense} className="mt-4 flex items-center gap-2 rounded-md bg-gradient-primary px-4 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
            {savingExpense ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add Expense
          </button>

          <div className="mt-5 space-y-2">
            {filteredExpenses.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/60 p-6 text-center font-body text-sm text-muted-foreground">No expenses for {periodLabel.toLowerCase()}.</p>
            ) : filteredExpenses.map((expense) => (
              <div key={expense.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-background/70 px-3 py-2">
                <div>
                  <p className="font-body text-sm font-medium text-foreground">{expense.title}</p>
                  <p className="font-body text-xs text-muted-foreground">{expense.category}{expense.spentOn ? ` · ${expense.spentOn}` : ""}{expense.note ? ` · ${expense.note}` : ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-display text-sm font-bold text-red-600">{formatPaiseAsRupees(expense.amountInPaise)}</span>
                  <button onClick={() => handleDeleteExpense(expense)} disabled={busyId === expense.id} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-5 rounded-lg border border-border/60 bg-muted/40 p-3 font-body text-sm text-muted-foreground">
            <ShieldCheck className="mr-1.5 inline h-4 w-4 text-gold" />
            Partner access (read-only financial view + profit share) is now managed in{" "}
            <Link to="/admin/partners" className="font-semibold text-gold hover:underline">Partners Manager</Link>.
            {settings.partnerUid && <> Current partner: <span className="font-semibold text-foreground">{settings.partnerName || settings.partnerEmail}</span> · {settings.profitSharePercent}% share.</>}
          </p>
      </div>
    </div>
  );
};

export default AdminFinance;
