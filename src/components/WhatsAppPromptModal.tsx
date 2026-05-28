import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { MessageCircle, Package, BookOpen, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";

const sanitizeDigits = (value: string) => value.replace(/\D/g, "");

const SKIP_PATHS = ["/login", "/signup"];
const isSkippedPath = (pathname: string) =>
  SKIP_PATHS.includes(pathname) || pathname.startsWith("/admin");

const WhatsAppPromptModal = () => {
  const { user, userProfile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading || !user || !userProfile || isSkippedPath(pathname)) {
      setOpen(false);
      return;
    }
    const hasNumber = sanitizeDigits(userProfile.whatsappNumber || userProfile.phone || "").length >= 10;
    setOpen(!hasNumber);
  }, [authLoading, user, userProfile, pathname]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const digits = sanitizeDigits(phone);
    if (digits.length !== 10) {
      toast({ title: "Invalid number", description: "Please enter a valid 10-digit WhatsApp number.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        whatsappNumber: digits,
        phone: digits,
        updatedAt: serverTimestamp(),
      });
      setOpen(false);
      toast({ title: "WhatsApp number saved", description: "You'll now receive order and course updates on WhatsApp." });
    } catch {
      toast({ title: "Could not save", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="w-[calc(100vw-1.5rem)] max-w-md rounded-2xl border-gold/25 bg-card p-0 shadow-[0_24px_70px_rgba(0,0,0,0.25)] [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="border-b border-gold/15 bg-gold/8 px-6 py-5">
          <DialogHeader className="space-y-2 text-left">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold/15 text-gold">
              <MessageCircle className="h-5 w-5" />
            </span>
            <DialogTitle className="font-display text-2xl font-normal text-foreground">
              Add Your WhatsApp Number
            </DialogTitle>
            <DialogDescription className="font-body text-sm leading-relaxed text-muted-foreground">
              Your WhatsApp number is required to receive important updates from Javani.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Why it's needed */}
        <div className="px-6 pt-5 pb-2 space-y-3">
          <p className="font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">Why we need this</p>
          <div className="space-y-2.5">
            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/70 p-3">
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <div>
                <p className="font-body text-sm font-semibold text-foreground">Product Delivery Updates</p>
                <p className="mt-0.5 font-body text-xs leading-relaxed text-muted-foreground">
                  Order confirmations, dispatch alerts, and live delivery tracking — all sent directly to your WhatsApp.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/70 p-3">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <div>
                <p className="font-body text-sm font-semibold text-foreground">Course Enrollment & Updates</p>
                <p className="mt-0.5 font-body text-xs leading-relaxed text-muted-foreground">
                  Course confirmation, installment reminders, and schedule updates are shared exclusively via WhatsApp.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="px-6 pb-5 pt-3 space-y-4">
          <div>
            <label className="mb-1.5 block font-body text-sm font-semibold text-foreground">
              WhatsApp Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              maxLength={15}
              placeholder="10-digit WhatsApp number"
              className="h-11 w-full rounded-xl border border-gold/30 bg-background px-4 font-body text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-gold focus:shadow-[0_0_0_3px_rgba(201,168,76,0.15)]"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary font-display text-sm font-semibold tracking-[0.06em] text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
          >
            <MessageCircle className="h-4 w-4" />
            {saving ? "Saving…" : "Save WhatsApp Number"}
          </button>

          <div className="flex items-start gap-2 rounded-xl border border-gold/20 bg-gold/5 px-3 py-2.5">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
            <p className="font-body text-[0.75rem] leading-relaxed text-muted-foreground">
              You can update this number anytime in{" "}
              <Link to="/account/profile" className="font-semibold text-gold underline-offset-2 hover:underline">
                Account Details
              </Link>
              .
            </p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppPromptModal;
