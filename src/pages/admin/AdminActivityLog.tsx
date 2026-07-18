import { useEffect, useMemo, useState } from "react";
import { History, Loader2, ScrollText } from "lucide-react";
import { subscribeToAdminLogs, type AdminLogEntry } from "@/lib/adminLog";

// ---------------------------------------------------------------------------
// /admin/activity (admin-only, req): a live feed of every action the admin or
// a manager took — who, what, on whom, and when. Entries are immutable.
// ---------------------------------------------------------------------------

const inputClass = "w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background";

const formatWhen = (entry: AdminLogEntry): string => {
  const date = entry.at && typeof entry.at.toDate === "function" ? entry.at.toDate() : null;
  if (!date) return "";
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
};

const AdminActivityLog = () => {
  const [entries, setEntries] = useState<AdminLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "manager">("all");

  useEffect(() => subscribeToAdminLogs(
    (items) => { setEntries(items); setLoading(false); },
    () => setLoading(false),
  ), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (roleFilter !== "all" && entry.role !== roleFilter) return false;
      if (!q) return true;
      return [entry.action, entry.details, entry.email, entry.name].some((value) => (value || "").toLowerCase().includes(q));
    });
  }, [entries, search, roleFilter]);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">Audit</p>
        <h1 className="mt-2 flex items-center gap-2 font-display text-3xl text-foreground"><ScrollText className="h-7 w-7 text-gold" /> Activity Log</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">Every action taken by the admin and managers — newest first. Entries can't be edited or deleted.</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search action, student, email…" className={`${inputClass} sm:max-w-md`} />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)} className={`${inputClass} sm:max-w-[170px]`}>
          <option value="all">Everyone</option>
          <option value="admin">Admin only</option>
          <option value="manager">Managers only</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-card p-10"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-gold/15 bg-card p-10 text-center shadow-card">
          <History className="mx-auto mb-3 h-10 w-10 text-gold" />
          <h3 className="font-display text-xl text-foreground">No activity yet</h3>
          <p className="mt-1 font-body text-sm text-muted-foreground">Actions taken in the admin will appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-card">
              <div className="min-w-0">
                <p className="font-body text-sm font-semibold text-foreground">{entry.action}</p>
                {entry.details && <p className="mt-0.5 font-body text-xs text-muted-foreground">{entry.details}</p>}
                <p className="mt-1 font-body text-[0.7rem] text-muted-foreground">
                  by <span className="font-semibold text-foreground">{entry.name || entry.email || "unknown"}</span>
                  <span className={`ml-1.5 rounded-full px-2 py-0.5 font-semibold ${entry.role === "admin" ? "bg-gold/15 text-gold" : "bg-blue-100 text-blue-700"}`}>{entry.role}</span>
                </p>
              </div>
              <span className="shrink-0 font-body text-[0.72rem] text-muted-foreground">{formatWhen(entry)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminActivityLog;
