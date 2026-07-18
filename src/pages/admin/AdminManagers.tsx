import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { confirmDialog } from "@/components/ConfirmDialogHost";
import { MANAGER_PAGES } from "@/lib/adminPages";
import {
  buildManagerLoginWhatsAppUrl,
  createManagerLogin,
  revokeManager,
  subscribeToManagerCredentials,
  subscribeToManagers,
  updateManagerPages,
  type ManagerCredential,
  type ManagerDoc,
} from "@/lib/managers";
import { Copy, Eye, EyeOff, KeyRound, Loader2, MessageCircle, Phone, Plus, ShieldCheck, Trash2, UserCog } from "lucide-react";

const fieldClass = "h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20";

const AdminManagers = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [managers, setManagers] = useState<ManagerDoc[]>([]);
  const [credentials, setCredentials] = useState<Record<string, ManagerCredential>>({});
  const [revealPw, setRevealPw] = useState<Record<string, boolean>>({});
  const [busyUid, setBusyUid] = useState<string | null>(null);

  // Create form
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pages, setPages] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);

  useEffect(() => subscribeToManagers(setManagers, (error) => {
    console.error("Unable to load managers", error);
    toast({ title: "Could not load managers", variant: "destructive" });
  }), [toast]);
  useEffect(() => subscribeToManagerCredentials(setCredentials, () => undefined), []);

  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
  const selectedPages = useMemo(() => MANAGER_PAGES.filter((page) => pages[page.key]).map((page) => page.key), [pages]);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: `Could not copy the ${label.toLowerCase()}`, variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    if (!user) return;
    if (!name.trim()) { toast({ title: "Manager name is required", variant: "destructive" }); return; }
    if (!email.trim()) { toast({ title: "Email is required", variant: "destructive" }); return; }
    if (password.trim().length < 6) { toast({ title: "Password must be at least 6 characters", variant: "destructive" }); return; }
    if (selectedPages.length === 0) { toast({ title: "Switch on at least one page", description: "Pick which admin pages this manager can open.", variant: "destructive" }); return; }
    setCreating(true);
    try {
      const idToken = await user.getIdToken();
      await createManagerLogin(idToken, {
        email: email.trim().toLowerCase(),
        password: password.trim(),
        name: name.trim(),
        whatsapp: whatsapp.replace(/\D/g, ""),
        pages: selectedPages,
      });
      toast({ title: "Manager created", description: `${email.trim()} can sign in at /login. Share the login from their card below.` });
      setName(""); setWhatsapp(""); setEmail(""); setPassword(""); setPages({});
    } catch (error) {
      toast({ title: "Could not create the manager", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const togglePage = async (manager: ManagerDoc, pageKey: string) => {
    const next = manager.pages.includes(pageKey)
      ? manager.pages.filter((key) => key !== pageKey)
      : [...manager.pages, pageKey];
    setBusyUid(manager.uid);
    try {
      await updateManagerPages(manager.uid, next);
    } catch (error) {
      toast({ title: "Could not update access", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyUid(null);
    }
  };

  const handleRevoke = async (manager: ManagerDoc) => {
    if (!(await confirmDialog({ title: `Remove ${manager.name || manager.email}'s manager access?`, description: "Their account stays, but they can no longer open the admin.", confirmText: "Remove access", destructive: true }))) return;
    setBusyUid(manager.uid);
    try {
      await revokeManager(manager.uid);
      toast({ title: "Manager removed", description: `${manager.email} is a normal user again.` });
    } catch (error) {
      toast({ title: "Could not remove", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">Team</p>
        <h1 className="mt-2 flex items-center gap-2 font-display text-3xl text-foreground"><UserCog className="h-7 w-7 text-gold" /> Managers</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Create staff logins and switch each admin page on or off per manager. Managers sign in at{" "}
          <a href={loginUrl} target="_blank" rel="noreferrer" className="font-semibold text-gold hover:underline">{loginUrl}</a>{" "}
          and see only the pages you enable.
        </p>
      </div>

      {/* Create manager */}
      <div className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
        <h2 className="flex items-center gap-2 font-display text-xl text-foreground"><Plus className="h-5 w-5 text-gold" /> Add Manager</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block font-body text-xs font-medium text-foreground">Name <span className="text-destructive">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Suresh" className={fieldClass} disabled={creating} />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 font-body text-xs font-medium text-foreground"><Phone className="h-3.5 w-3.5 text-gold" /> WhatsApp</label>
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value.replace(/[^0-9]/g, ""))} inputMode="tel" placeholder="e.g. 919876543210" className={fieldClass} disabled={creating} />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 font-body text-xs font-medium text-foreground"><MessageCircle className="h-3.5 w-3.5 text-gold" /> Login email <span className="text-destructive">*</span></label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="manager@email.com" className={fieldClass} disabled={creating} />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 font-body text-xs font-medium text-foreground"><KeyRound className="h-3.5 w-3.5 text-gold" /> Password <span className="text-destructive">*</span></label>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 6 characters" className={fieldClass} disabled={creating} />
          </div>
        </div>

        <p className="mt-4 flex items-center gap-1.5 font-body text-sm font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-gold" /> Pages this manager can open</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {MANAGER_PAGES.map((page) => (
            <label key={page.key} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 font-body text-[0.82rem] transition-colors ${pages[page.key] ? "border-gold bg-gold/10 font-semibold text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}>
              <input type="checkbox" checked={Boolean(pages[page.key])} onChange={(e) => setPages((current) => ({ ...current, [page.key]: e.target.checked }))} disabled={creating} />
              {page.label}
            </label>
          ))}
        </div>

        <button onClick={handleCreate} disabled={creating} className="mt-4 flex items-center gap-2 rounded-md bg-gradient-primary px-5 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create Manager
        </button>
        <p className="mt-2 font-body text-[0.72rem] text-muted-foreground">The email &amp; password are saved so you can re-share them on WhatsApp anytime. You can switch pages on/off later from the list below.</p>
      </div>

      {/* Managers list */}
      <div className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
        <h2 className="font-display text-xl text-foreground">Current Managers ({managers.length})</h2>
        {managers.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border/60 p-6 text-center font-body text-sm text-muted-foreground">No managers yet — create one above.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {managers.map((manager) => {
              const credential = credentials[manager.uid];
              return (
                <div key={manager.uid} className="rounded-lg border border-border/60 bg-background/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-body text-sm font-semibold text-foreground">{manager.name || manager.email}</p>
                      <p className="font-body text-xs text-muted-foreground">{manager.email}{manager.whatsapp ? ` · ${manager.whatsapp}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {credential?.email && (
                        <>
                          <span className="flex items-center gap-1 rounded-md border border-border px-2 py-1 font-body text-[0.72rem] text-muted-foreground">
                            {revealPw[manager.uid] ? credential.password : "••••••••"}
                            <button onClick={() => setRevealPw((prev) => ({ ...prev, [manager.uid]: !prev[manager.uid] }))} className="ml-1 text-muted-foreground hover:text-gold" title={revealPw[manager.uid] ? "Hide password" : "Show password"}>
                              {revealPw[manager.uid] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </button>
                            <button onClick={() => copyText(credential.password, "Password")} className="text-muted-foreground hover:text-gold" title="Copy password"><Copy className="h-3 w-3" /></button>
                          </span>
                          <a
                            href={buildManagerLoginWhatsAppUrl(credential, loginUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 rounded-md bg-[#25D366] px-3 py-1.5 font-body text-[0.72rem] font-semibold text-white hover:brightness-110"
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> Share login
                          </a>
                        </>
                      )}
                      <button onClick={() => handleRevoke(manager)} disabled={busyUid === manager.uid} className="flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1.5 font-body text-[0.72rem] font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50">
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </div>

                  {/* Page on/off toggles */}
                  <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {MANAGER_PAGES.map((page) => {
                      const on = manager.pages.includes(page.key);
                      return (
                        <label key={page.key} className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-1.5 font-body text-[0.78rem] transition-colors ${on ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}>
                          <span className={on ? "font-semibold" : ""}>{page.label}</span>
                          <input type="checkbox" checked={on} onChange={() => togglePage(manager, page.key)} disabled={busyUid === manager.uid} />
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminManagers;
