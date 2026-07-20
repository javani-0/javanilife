import { useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, Loader2, Trash2, Users2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useAdminLog } from "@/hooks/useAdminLog";
import { confirmDialog } from "@/components/ConfirmDialogHost";
import { manageUser, subscribeToAppUsers, type AppUser } from "@/lib/users";

// ---------------------------------------------------------------------------
// /admin/users (admin only, req 3): every normal-user login — admin-created
// students and self-signups. Deactivate (reversible) or delete (permanent),
// each behind a confirmation.
// ---------------------------------------------------------------------------

const inputClass = "w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background";

const AdminUsers = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const logAction = useAdminLog();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "managed" | "self" | "inactive">("all");
  const [busyUid, setBusyUid] = useState<string | null>(null);

  useEffect(() => subscribeToAppUsers(
    (items) => { setUsers(items); setLoading(false); },
    () => setLoading(false),
  ), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => {
        if (filter === "managed" && !u.managedByAdmin) return false;
        if (filter === "self" && u.managedByAdmin) return false;
        if (filter === "inactive" && !u.disabled) return false;
        if (q && ![u.username, u.email, u.phone, u.whatsappNumber].some((v) => (v || "").toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [users, search, filter]);

  const act = async (target: AppUser, action: "deactivate" | "activate" | "delete") => {
    if (!user) return;
    if (action === "deactivate" && !(await confirmDialog({
      title: `Deactivate ${target.username}?`,
      description: "They won't be able to log in until you reactivate them. Their data is kept.",
      confirmText: "Deactivate",
      destructive: true,
    }))) return;
    if (action === "delete" && !(await confirmDialog({
      title: `Permanently delete ${target.username}?`,
      description: `This removes their login${target.managedByAdmin ? ", student profile, enrolment and all fee history" : " and account data"}. There is no undo.`,
      confirmText: "Delete forever",
      destructive: true,
      requireText: "DELETE",
    }))) return;
    setBusyUid(target.uid);
    try {
      const idToken = await user.getIdToken();
      const result = await manageUser(idToken, target.uid, action);
      if (action === "delete") {
        toast({ title: "User deleted", description: `Removed: ${(result.removed || []).join(", ") || "login"}.` });
        logAction("Deleted user", `${target.username} · ${target.email}`);
      } else {
        toast({ title: action === "deactivate" ? "User deactivated" : "User reactivated", description: target.username });
        logAction(action === "deactivate" ? "Deactivated user" : "Reactivated user", `${target.username} · ${target.email}`);
      }
    } catch (error) {
      toast({ title: "Action failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">People</p>
        <h1 className="mt-2 flex items-center gap-2 font-display text-3xl text-foreground"><Users2 className="h-7 w-7 text-gold" /> Users</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">Everyone with a login — students you created and people who signed up themselves. Deactivate or delete an account here.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card"><p className="font-body text-xs text-muted-foreground">Total users</p><p className="mt-1 font-display text-2xl font-bold text-foreground">{users.length}</p></div>
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card"><p className="font-body text-xs text-muted-foreground">Admin-created</p><p className="mt-1 font-display text-2xl font-bold text-gold">{users.filter((u) => u.managedByAdmin).length}</p></div>
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card"><p className="font-body text-xs text-muted-foreground">Self signup</p><p className="mt-1 font-display text-2xl font-bold text-foreground">{users.filter((u) => !u.managedByAdmin).length}</p></div>
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card"><p className="font-body text-xs text-muted-foreground">Deactivated</p><p className="mt-1 font-display text-2xl font-bold text-muted-foreground">{users.filter((u) => u.disabled).length}</p></div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone…" className={`${inputClass} sm:max-w-md`} />
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className={`${inputClass} sm:max-w-[200px]`}>
          <option value="all">Everyone</option>
          <option value="managed">Admin-created</option>
          <option value="self">Self signup</option>
          <option value="inactive">Deactivated</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-card p-10"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 bg-card p-8 text-center font-body text-sm text-muted-foreground">No users match these filters.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <div key={u.uid} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-card">
              <div className="flex min-w-0 items-center gap-3">
                {u.photoURL ? (
                  <img src={u.photoURL} alt={u.username} className="h-10 w-10 shrink-0 rounded-full border border-border object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 font-display text-base text-gold">{(u.username || "?").charAt(0).toUpperCase()}</div>
                )}
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 truncate font-body text-sm font-semibold text-foreground">
                    {u.username}
                    {u.managedByAdmin && <span className="rounded-full bg-gold/15 px-2 py-0.5 font-body text-[0.65rem] font-semibold text-gold">Admin-created</span>}
                    {u.disabled && <span className="rounded-full bg-muted px-2 py-0.5 font-body text-[0.65rem] font-semibold text-muted-foreground">Deactivated</span>}
                  </p>
                  <p className="truncate font-body text-xs text-muted-foreground">{u.email}{u.phone || u.whatsappNumber ? ` · ${u.phone || u.whatsappNumber}` : ""}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {u.disabled ? (
                  <button onClick={() => act(u, "activate")} disabled={busyUid === u.uid} className="flex items-center gap-1 rounded-md border border-green-500/50 px-2.5 py-1.5 font-body text-[0.72rem] font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> Reactivate</button>
                ) : (
                  <button onClick={() => act(u, "deactivate")} disabled={busyUid === u.uid} className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 font-body text-[0.72rem] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"><Ban className="h-3.5 w-3.5" /> Deactivate</button>
                )}
                <button onClick={() => act(u, "delete")} disabled={busyUid === u.uid} className="flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1.5 font-body text-[0.72rem] font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50">
                  {busyUid === u.uid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
