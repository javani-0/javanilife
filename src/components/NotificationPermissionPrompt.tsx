import { useEffect, useMemo, useState } from "react";
import { BellRing } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useWebNotifications } from "@/hooks/useWebNotifications";

const dismissedKey = (uid: string) => `javani.webPushPrompt.dismissed.${uid}`;

const NotificationPermissionPrompt = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const webNotifications = useWebNotifications();
  const [open, setOpen] = useState(false);

  const storageKey = useMemo(() => user ? dismissedKey(user.uid) : "", [user]);

  useEffect(() => {
    if (authLoading || !user || !storageKey) {
      setOpen(false);
      return;
    }

    const dismissedThisSession = sessionStorage.getItem(storageKey) === "true";
    setOpen(webNotifications.supported && webNotifications.configured && webNotifications.permission === "default" && !dismissedThisSession);
  }, [authLoading, storageKey, user, webNotifications.configured, webNotifications.permission, webNotifications.supported]);

  const allowNotifications = async () => {
    try {
      await webNotifications.enableNotifications();
      if (storageKey) sessionStorage.removeItem(storageKey);
      setOpen(false);
    } catch (error) {
      toast({ title: "Notifications not enabled", description: error instanceof Error ? error.message : "Please allow notifications from your browser prompt.", variant: "destructive" });
    }
  };

  const dismissPrompt = () => {
    if (storageKey) sessionStorage.setItem(storageKey, "true");
    setOpen(false);
  };

  if (!user || !webNotifications.supported || !webNotifications.configured || webNotifications.permission !== "default") return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) dismissPrompt(); }}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl border-gold/25 bg-card p-0 shadow-[0_24px_70px_rgba(0,0,0,0.25)]">
        <div className="border-b border-gold/15 bg-gold/10 px-5 py-5">
          <DialogHeader className="space-y-2 text-left">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold/15 text-gold">
              <BellRing className="h-5 w-5" />
            </span>
            <DialogTitle className="font-display text-2xl font-normal text-foreground">Allow order notifications</DialogTitle>
            <DialogDescription className="font-body text-sm leading-6 text-muted-foreground">
              Get browser alerts when your Javani order is placed or updated on this device.
            </DialogDescription>
          </DialogHeader>
        </div>
        <DialogFooter className="gap-2 px-5 py-4 sm:justify-start sm:space-x-0">
          <button type="button" onClick={allowNotifications} disabled={webNotifications.loading} className="inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-gradient-primary px-5 font-display text-sm font-semibold tracking-[0.08em] text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60">
            <BellRing className="h-4 w-4" /> {webNotifications.loading ? "Connecting..." : "Allow Notifications"}
          </button>
          <button type="button" onClick={dismissPrompt} className="inline-flex h-11 items-center justify-center rounded-sm border border-border px-5 font-body text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            Later
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NotificationPermissionPrompt;