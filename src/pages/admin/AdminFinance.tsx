import { useEffect, useMemo, useState } from "react";
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
  grantPartnerRoleByEmail,
  revokePartnerRole,
  savePartnerSettings,
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

  // Partner access form
  const [partnerEmail, setPartnerEmail] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [sharePercent, setSharePercent] = useState("");
  const [savingPartner, setSavingPartner] = useState(false);

  useEffect(() => {
    const unsubOrders = onSnapshot(collection(db, "orders"), (snap) => { setOrders(snap.docs.map((d) => d.data())); setLoading(false); }, () => setLoading(false));
    const unsubFees = onSnapshot(collection(db, "feePayments"), (snap) => setFees(snap.docs.map((d) => d.data())), () => undefined);
    const unsubExpenses = subscribeToExpenses((items) => setExpenses(items), () => undefined);
    const unsubIncome = subscribeToManualIncome((items) => setIncomeEntries(items), () => undefined);
    const unsubSettings = subscribeToPartnerSettings((value) => {
      setSettings(value);
      setPartnerEmail((current) => current || value.partnerEmail || "");
      setPartnerName((current) => current || value.partnerName || "");
      setSharePercent((current) => current || (value.profitSharePercent ? String(value.profitSharePercent) : ""));
    }, () => undefined);
    return () => { unsubOrders(); unsubFees(); unsubExpenses(); unsubIncome(); unsubSettings(); };
  }, []);

  const summary = useMemo(() => buildFinanceSummary({
    productIncomeInPaise: sumOrderIncomeInPaise(orders),
    classIncomeInPaise: sumClassIncomeInPaise(fees.map((fee) => ({ status: String(fee.status || ""), amountInPaise: Number(fee.amountInPaise || 0) }))),
    otherIncomeInPaise: sumManualIncomeInPaise(incomeEntries),
    expensesInPaise: sumExpensesInPaise(expenses),
    profitSharePercent: settings.profitSharePercent,
  }), [orders, fees, incomeEntries, expenses, settings.profitSharePercent]);

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

  const handleSavePartner = async () => {
    const pct = Number(sharePercent);
    if (!partnerEmail.trim()) { toast({ title: "Enter the partner's email", variant: "destructive" }); return; }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) { toast({ title: "Share % must be between 0 and 100", variant: "destructive" }); return; }
    setSavingPartner(true);
    try {
      const uid = await grantPartnerRoleByEmail(partnerEmail);
      if (!uid) {
        toast({ title: "No account found", description: "Ask the partner to sign up with this email first, then try again.", variant: "destructive" });
        return;
      }
      await savePartnerSettings({ partnerEmail, partnerName, partnerUid: uid, profitSharePercent: pct });
      toast({ title: "Partner access granted", description: `${partnerEmail} can now sign in and view the financial summary.` });
    } catch (error) {
      toast({ title: "Could not save partner access", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSavingPartner(false);
    }
  };

  const handleRevokePartner = async () => {
    if (!settings.partnerUid) return;
    if (!confirm("Revoke partner access? They will lose access to the financial summary.")) return;
    setSavingPartner(true);
    try {
      await revokePartnerRole(settings.partnerUid);
      await savePartnerSettings({ partnerUid: "", profitSharePercent: 0 });
      toast({ title: "Partner access revoked" });
    } catch (error) {
      toast({ title: "Could not revoke", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSavingPartner(false);
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

      {/* Summary tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Total Income" value={formatPaiseAsRupees(summary.incomeInPaise)} sub={`Products ${formatPaiseAsRupees(summary.productIncomeInPaise)} · Classes ${formatPaiseAsRupees(summary.classIncomeInPaise)} · Other ${formatPaiseAsRupees(summary.otherIncomeInPaise)}`} accent="text-green-600" icon={TrendingUp} />
        <Tile label="Total Expenses" value={formatPaiseAsRupees(summary.expensesInPaise)} sub={`${expenses.length} entr${expenses.length === 1 ? "y" : "ies"}`} accent="text-red-600" icon={TrendingDown} />
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
          {incomeEntries.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 p-6 text-center font-body text-sm text-muted-foreground">No manual income entries yet.</p>
          ) : incomeEntries.map((entry) => (
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
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
            {expenses.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/60 p-6 text-center font-body text-sm text-muted-foreground">No expenses yet.</p>
            ) : expenses.map((expense) => (
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
        </div>

        {/* Partner access */}
        <div className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 font-display text-xl text-foreground"><ShieldCheck className="h-5 w-5 text-gold" /> Partner Access</h2>
          <p className="mt-1 font-body text-sm text-muted-foreground">Grant a business partner a read-only view of income, expenses, and their profit share. They can sign in but cannot edit anything.</p>

          {settings.partnerUid ? (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="font-body text-sm font-semibold text-green-800">Active partner</p>
              <p className="font-body text-sm text-foreground">{settings.partnerName || "Partner"} · {settings.partnerEmail}</p>
              <p className="font-body text-xs text-muted-foreground">Profit share: {settings.profitSharePercent}%</p>
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-border/60 p-3 font-body text-sm text-muted-foreground">No partner configured yet.</p>
          )}

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block font-body text-xs font-medium text-foreground">Partner name</label>
              <input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} placeholder="e.g. Ramesh" className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block font-body text-xs font-medium text-foreground">Partner email *</label>
              <input value={partnerEmail} onChange={(e) => setPartnerEmail(e.target.value)} type="email" placeholder="partner@email.com" className={inputClass} />
              <p className="mt-1 font-body text-[0.7rem] text-muted-foreground">They must sign up with this email first.</p>
            </div>
            <div>
              <label className="mb-1 block font-body text-xs font-medium text-foreground">Profit share (%) *</label>
              <input value={sharePercent} onChange={(e) => setSharePercent(e.target.value)} inputMode="decimal" placeholder="e.g. 40" className={inputClass} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={handleSavePartner} disabled={savingPartner} className="flex items-center gap-2 rounded-md bg-gradient-primary px-4 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
              {savingPartner ? <Loader2 className="h-4 w-4 animate-spin" /> : <Handshake className="h-4 w-4" />} {settings.partnerUid ? "Update Partner" : "Grant Access"}
            </button>
            {settings.partnerUid && (
              <button onClick={handleRevokePartner} disabled={savingPartner} className="rounded-md border border-border px-4 py-2.5 font-body text-sm font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-60">Revoke</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminFinance;
