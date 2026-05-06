import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { BellRing, CheckCircle2, ExternalLink, MessageCircle, RefreshCw, Search, Send, XCircle } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useWebNotifications } from "@/hooks/useWebNotifications";
import {
  dispatchNotificationById,
  formatAccountDate,
  getDateValue,
  normalizeNotificationLog,
  sendTestWebPush,
  type NotificationAudience,
  type NotificationChannel,
  type NotificationLog,
  type NotificationStatus,
} from "@/lib/ecommerce";

const statusLabels: Record<NotificationStatus | "all", string> = {
  all: "All statuses",
  "manual-ready": "Manual Ready",
  pending: "Pending",
  sent: "Sent",
  failed: "Failed",
  skipped: "Skipped",
};

const channelLabels: Record<NotificationChannel | "all", string> = {
  all: "All channels",
  whatsapp: "WhatsApp",
  "web-push": "Web Push",
};

const audienceLabels: Record<NotificationAudience | "all", string> = {
  all: "All audiences",
  customer: "Customer",
  admin: "Admin",
};

const statusClasses: Record<NotificationStatus, string> = {
  "manual-ready": "border-amber-200 bg-amber-50 text-amber-700",
  pending: "border-blue-200 bg-blue-50 text-blue-700",
  sent: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-destructive/25 bg-destructive/10 text-destructive",
  skipped: "border-slate-200 bg-slate-50 text-slate-600",
};

const AdminNotifications = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const webNotifications = useWebNotifications();
  const [notifications, setNotifications] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<NotificationStatus | "all">("all");
  const [audienceFilter, setAudienceFilter] = useState<NotificationAudience | "all">("all");
  const [channelFilter, setChannelFilter] = useState<NotificationChannel | "all">("all");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "notifications"), (snapshot) => {
      const nextNotifications = snapshot.docs
        .map((notificationDoc) => normalizeNotificationLog(notificationDoc.id, notificationDoc.data()))
        .sort((first, second) => {
          const firstDate = getDateValue(first.createdAt)?.getTime() || 0;
          const secondDate = getDateValue(second.createdAt)?.getTime() || 0;
          return secondDate - firstDate;
        });
      setNotifications(nextNotifications);
      setLoading(false);
    }, (error) => {
      console.error("Unable to load WhatsApp notifications", error);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const metrics = useMemo(() => ({
    manualReady: notifications.filter((notification) => notification.status === "manual-ready").length,
    pending: notifications.filter((notification) => notification.status === "pending").length,
    sent: notifications.filter((notification) => notification.status === "sent").length,
    failed: notifications.filter((notification) => notification.status === "failed").length,
  }), [notifications]);

  const filteredNotifications = useMemo(() => {
    const query = search.trim().toLowerCase();

    return notifications.filter((notification) => {
      const matchesStatus = statusFilter === "all" || notification.status === statusFilter;
      const matchesAudience = audienceFilter === "all" || notification.audience === audienceFilter;
      const matchesChannel = channelFilter === "all" || notification.channel === channelFilter;
      const searchableText = [
        notification.title,
        notification.message,
        notification.orderNumber,
        notification.customerName,
        notification.customerPhone,
        notification.whatsappNumber,
        notification.channel,
      ].filter(Boolean).join(" ").toLowerCase();

      return matchesStatus && matchesAudience && matchesChannel && (!query || searchableText.includes(query));
    });
  }, [audienceFilter, channelFilter, notifications, search, statusFilter]);

  const updateStatus = async (notificationId: string, status: NotificationStatus, errorMessage = "") => {
    setSavingId(notificationId);
    try {
      await updateDoc(doc(db, "notifications", notificationId), {
        status,
        errorMessage,
        updatedAt: serverTimestamp(),
      });
      toast({ title: "Notification updated", description: statusLabels[status] });
    } catch (error) {
      console.error("Unable to update notification", error);
      toast({ title: "Update failed", description: "Check admin permissions and try again.", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const dispatchNotification = async (notificationId: string) => {
    setSavingId(notificationId);
    try {
      const idToken = await user?.getIdToken();
      if (!idToken) throw new Error("Admin authentication token was unavailable.");
      const result = await dispatchNotificationById(idToken, notificationId);
      toast({ title: "Dispatch complete", description: statusLabels[result.status as NotificationStatus] || result.status });
    } catch (error) {
      console.error("Unable to dispatch notification", error);
      toast({ title: "Dispatch failed", description: error instanceof Error ? error.message : "Check server credentials and try again.", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const testWebPush = async () => {
    setSavingId("test-web-push");
    try {
      const idToken = await user?.getIdToken();
      if (!idToken) throw new Error("Admin authentication token was unavailable.");
      await sendTestWebPush(idToken);
      toast({ title: "Test queued", description: "Firebase web push test was sent to registered admin browsers." });
    } catch (error) {
      console.error("Unable to send test web push", error);
      toast({ title: "Web push test failed", description: error instanceof Error ? error.message : "Check Firebase Admin credentials and browser token registration.", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const enableWebNotifications = async () => {
    try {
      await webNotifications.enableNotifications();
    } catch (error) {
      toast({ title: "Web notifications not enabled", description: error instanceof Error ? error.message : "Try again from a supported browser.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">Phase 12</p>
        <h1 className="mt-2 font-display text-3xl text-foreground">Notifications</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">Review WhatsApp and web push delivery logs, retry API sends, and keep manual fallback available.</p>
      </div>

      <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-gold" />
              <h2 className="font-display text-xl text-foreground">Browser Push</h2>
            </div>
            <p className="mt-1 font-body text-sm text-muted-foreground">
              Permission: {webNotifications.permission}. {webNotifications.configError || "Firebase VAPID key is configured."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={enableWebNotifications} disabled={!webNotifications.supported || !webNotifications.configured || webNotifications.loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-gold/40 px-4 font-body text-sm font-semibold text-gold transition-colors hover:bg-gold hover:text-white disabled:opacity-60">
              <BellRing className="h-4 w-4" /> {webNotifications.loading ? "Enabling..." : "Enable This Browser"}
            </button>
            <button type="button" onClick={testWebPush} disabled={savingId === "test-web-push"} className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-gold px-4 font-body text-sm font-semibold text-white transition-colors hover:bg-gold-dark disabled:opacity-60">
              <Send className="h-4 w-4" /> {savingId === "test-web-push" ? "Sending..." : "Send Test"}
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Ready", value: metrics.manualReady, Icon: MessageCircle },
          { label: "Pending", value: metrics.pending, Icon: RefreshCw },
          { label: "Sent", value: metrics.sent, Icon: CheckCircle2 },
          { label: "Failed", value: metrics.failed, Icon: XCircle },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="rounded-xl border border-gold/15 bg-card p-4 shadow-card sm:p-5">
            <Icon className="mb-3 h-5 w-5 text-gold" />
            <p className="font-display text-3xl text-foreground">{value}</p>
            <p className="font-body text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_180px]">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="Search messages" />
          </label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as NotificationStatus | "all")} className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold">
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value as NotificationChannel | "all")} className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold">
            {Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={audienceFilter} onChange={(event) => setAudienceFilter(event.target.value as NotificationAudience | "all")} className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold">
            {Object.entries(audienceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl text-foreground">Notification Queue</h2>
          <span className="font-body text-sm text-muted-foreground">{filteredNotifications.length} shown</span>
        </div>

        {loading ? (
          <p className="font-body text-sm text-muted-foreground">Loading notifications...</p>
        ) : filteredNotifications.length === 0 ? (
          <div className="rounded-xl border border-gold/15 bg-background/70 p-8 text-center">
            <MessageCircle className="mx-auto mb-3 h-9 w-9 text-gold" />
            <p className="font-display text-xl text-foreground">No notifications found</p>
            <p className="mt-1 font-body text-sm text-muted-foreground">Order placement and admin updates will add messages here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notification) => (
              <article key={notification.id} className="rounded-xl border border-border/70 bg-background/70 p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-lg text-foreground">{notification.title}</p>
                      <span className={`rounded-full border px-2.5 py-1 font-body text-xs font-semibold ${statusClasses[notification.status]}`}>{statusLabels[notification.status]}</span>
                      <span className="rounded-full bg-background px-2.5 py-1 font-body text-xs font-semibold text-muted-foreground ring-1 ring-border">{channelLabels[notification.channel]}</span>
                      <span className="rounded-full bg-gold/10 px-2.5 py-1 font-body text-xs font-semibold text-gold">{audienceLabels[notification.audience]}</span>
                    </div>
                    <p className="mt-1 font-body text-xs text-muted-foreground">{notification.orderNumber || notification.orderId || "No order"} · {notification.customerName || "Javani"} · {formatAccountDate(notification.createdAt)}</p>
                    <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-card p-3 font-body text-sm leading-relaxed text-foreground">{notification.message}</pre>
                    {notification.errorMessage && <p className="mt-2 font-body text-xs text-destructive">{notification.errorMessage}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 xl:min-w-[260px] xl:justify-end">
                    {notification.status !== "sent" && (
                      <button type="button" onClick={() => dispatchNotification(notification.id)} disabled={savingId === notification.id} className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-gold px-4 font-body text-sm font-semibold text-white transition-colors hover:bg-gold-dark disabled:opacity-60">
                        <Send className="h-4 w-4" /> Send API
                      </button>
                    )}
                    {notification.channel === "whatsapp" && notification.whatsappUrl && (
                      <a href={notification.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-[#25D366] px-4 font-body text-sm font-semibold text-white transition-colors hover:bg-[#128C7E]">
                        <ExternalLink className="h-4 w-4" /> Open WhatsApp
                      </a>
                    )}
                    <button type="button" onClick={() => updateStatus(notification.id, "sent")} disabled={savingId === notification.id} className="inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-emerald-300 px-4 font-body text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-60">
                      <CheckCircle2 className="h-4 w-4" /> Sent
                    </button>
                    <button type="button" onClick={() => updateStatus(notification.id, "failed", "Marked failed by admin for manual follow-up.")} disabled={savingId === notification.id} className="inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-destructive/30 px-4 font-body text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60">
                      <XCircle className="h-4 w-4" /> Failed
                    </button>
                    {notification.status === "failed" && (
                      <button type="button" onClick={() => updateStatus(notification.id, "manual-ready")} disabled={savingId === notification.id} className="inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-gold/40 px-4 font-body text-sm font-semibold text-gold transition-colors hover:bg-gold hover:text-white disabled:opacity-60">
                        <RefreshCw className="h-4 w-4" /> Retry
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminNotifications;