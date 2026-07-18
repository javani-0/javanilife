import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, serverTimestamp, setDoc, where, doc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { BellRing, Heart, Lock, MapPin, PackageCheck, Save } from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useWebNotifications } from "@/hooks/useWebNotifications";
import { db } from "@/lib/firebase";

const sanitizeDigits = (value: string) => value.replace(/\D/g, "");

const Profile = () => {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const webNotifications = useWebNotifications();
  const [username, setUsername] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [callNumber, setCallNumber] = useState("");
  const [callNumberEdited, setCallNumberEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [counts, setCounts] = useState({ orders: 0, wishlist: 0, addresses: 0 });

  useEffect(() => {
    setUsername(userProfile?.username || user?.displayName || "");
    const nextWhatsappNumber = userProfile?.whatsappNumber || userProfile?.phone || "";
    const nextCallNumber = userProfile?.callNumber || userProfile?.phone || nextWhatsappNumber;
    setWhatsappNumber(nextWhatsappNumber);
    setCallNumber(nextCallNumber);
    setCallNumberEdited(Boolean(userProfile?.callNumber && sanitizeDigits(userProfile.callNumber) !== sanitizeDigits(nextWhatsappNumber)));
  }, [user, userProfile]);

  const updateWhatsAppNumber = (value: string) => {
    setWhatsappNumber(value);
    if (!callNumberEdited) setCallNumber(value);
  };

  const updateCallNumber = (value: string) => {
    setCallNumberEdited(true);
    setCallNumber(value);
  };

  useEffect(() => {
    if (!user) return;

    const unsubscribeOrders = onSnapshot(query(collection(db, "orders"), where("customerId", "==", user.uid)), (snapshot) => {
      setCounts((current) => ({ ...current, orders: snapshot.size }));
    });
    const unsubscribeWishlist = onSnapshot(collection(db, "users", user.uid, "wishlist"), (snapshot) => {
      setCounts((current) => ({ ...current, wishlist: snapshot.size }));
    });
    const unsubscribeAddresses = onSnapshot(collection(db, "users", user.uid, "addresses"), (snapshot) => {
      setCounts((current) => ({ ...current, addresses: snapshot.size }));
    });

    return () => {
      unsubscribeOrders();
      unsubscribeWishlist();
      unsubscribeAddresses();
    };
  }, [user]);

  // Admin-created student accounts are managed by the admin (req): the parent
  // can't edit details here — they ask the admin, who updates the Student
  // Manager record (and Firestore rules block the write anyway).
  const isManagedAccount = userProfile?.managedByAdmin === true;

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || isManagedAccount) return;

    const trimmedName = username.trim();
    if (!trimmedName) {
      toast({ title: "Name required", description: "Please enter your full name.", variant: "destructive" });
      return;
    }

    const normalizedWhatsAppNumber = sanitizeDigits(whatsappNumber);
    const normalizedCallNumber = sanitizeDigits(callNumber) || normalizedWhatsAppNumber;

    if (normalizedWhatsAppNumber.length < 10) {
      toast({ title: "WhatsApp number required", description: "Please enter only your active WhatsApp number in Account Details.", variant: "destructive" });
      return;
    }

    if (normalizedCallNumber.length < 10) {
      toast({ title: "Call number invalid", description: "Please enter a valid call number or leave it same as WhatsApp.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      await updateProfile(user, { displayName: trimmedName });
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        username: trimmedName,
        email: user.email || userProfile?.email || "",
        phone: normalizedWhatsAppNumber,
        whatsappNumber: normalizedWhatsAppNumber,
        callNumber: normalizedCallNumber,
        role: userProfile?.role || "user",
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast({ title: "Profile updated", description: "Your account details were saved." });
    } catch (error) {
      console.error("Unable to save profile", error);
      toast({ title: "Unable to save profile", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const enableWebNotifications = async () => {
    try {
      await webNotifications.enableNotifications();
    } catch (error) {
      toast({ title: "Web notifications not enabled", description: error instanceof Error ? error.message : "Try again from a supported browser.", variant: "destructive" });
    }
  };

  const notificationsConnected = webNotifications.permission === "granted" && Boolean(webNotifications.token);
  const notificationButtonLabel = webNotifications.loading
    ? "Connecting..."
    : notificationsConnected
      ? "Connected"
      : webNotifications.permission === "granted"
        ? "Connect This Browser"
        : "Enable This Browser";

  return (
    <AccountLayout title="Profile Dashboard" description="Manage your Javani account, orders, wishlist, and delivery addresses.">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Link to="/account/orders" className="rounded-2xl border border-gold/15 bg-card p-5 shadow-card transition-colors hover:border-gold/40">
            <PackageCheck className="mb-3 h-6 w-6 text-gold" />
            <p className="font-display text-3xl text-foreground">{counts.orders}</p>
            <p className="font-body text-sm text-muted-foreground">Orders</p>
          </Link>
          <Link to="/account/wishlist" className="rounded-2xl border border-gold/15 bg-card p-5 shadow-card transition-colors hover:border-gold/40">
            <Heart className="mb-3 h-6 w-6 text-gold" />
            <p className="font-display text-3xl text-foreground">{counts.wishlist}</p>
            <p className="font-body text-sm text-muted-foreground">Wishlist Items</p>
          </Link>
          <Link to="/account/addresses" className="rounded-2xl border border-gold/15 bg-card p-5 shadow-card transition-colors hover:border-gold/40">
            <MapPin className="mb-3 h-6 w-6 text-gold" />
            <p className="font-display text-3xl text-foreground">{counts.addresses}</p>
            <p className="font-body text-sm text-muted-foreground">Saved Addresses</p>
          </Link>
        </div>

        <section className="rounded-2xl border border-gold/15 bg-card p-5 shadow-card sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BellRing className="h-5 w-5 text-gold" />
                <h2 className="font-display text-2xl text-foreground">Web Notifications</h2>
              </div>
              <p className="mt-1 font-body text-sm text-muted-foreground">
                Permission: {webNotifications.permission}. {webNotifications.configError || "Ready to connect this browser."}
              </p>
            </div>
            <button type="button" onClick={enableWebNotifications} disabled={!webNotifications.supported || !webNotifications.configured || webNotifications.loading || notificationsConnected} className="inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-gold/40 px-5 font-body text-sm font-semibold text-gold transition-colors hover:bg-gold hover:text-white disabled:opacity-60">
              <BellRing className="h-4 w-4" /> {notificationButtonLabel}
            </button>
          </div>
        </section>

        <form onSubmit={saveProfile} className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-4">
            {userProfile?.photoURL && (
              <img src={userProfile.photoURL} alt="Profile" className="h-16 w-16 rounded-full border border-gold/30 object-cover" />
            )}
            <div>
              <h2 className="font-display text-2xl text-foreground">Account Details</h2>
              <p className="mt-1 font-body text-sm text-muted-foreground">These details connect checkout and future order history.</p>
            </div>
          </div>

          {isManagedAccount && (
            <p className="mt-4 flex items-start gap-2 rounded-md border border-gold/30 bg-gold/5 p-3 font-body text-sm text-muted-foreground">
              <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold" />
              <span>This account is managed by Javani Spiritual Hub. To update your name, phone number or any other detail, please contact the admin (for example on WhatsApp) and they'll update it for you.</span>
            </p>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="font-body text-sm font-semibold text-foreground">
              Full name
              <input value={username} onChange={(event) => setUsername(event.target.value)} disabled={isManagedAccount} className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20 disabled:bg-muted disabled:text-muted-foreground" />
            </label>
            <label className="font-body text-sm font-semibold text-foreground">
              WhatsApp number
              <input value={whatsappNumber} onChange={(event) => updateWhatsAppNumber(event.target.value)} disabled={isManagedAccount} className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20 disabled:bg-muted disabled:text-muted-foreground" placeholder="Enter only WhatsApp number" inputMode="tel" />
              {!isManagedAccount && <span className="mt-1 block text-xs font-normal text-muted-foreground">Required for order updates. Enter only your active WhatsApp number.</span>}
            </label>
            <label className="font-body text-sm font-semibold text-foreground">
              Call number
              <input value={callNumber} onChange={(event) => updateCallNumber(event.target.value)} disabled={isManagedAccount} className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20 disabled:bg-muted disabled:text-muted-foreground" placeholder="Same as WhatsApp" inputMode="tel" />
              {!isManagedAccount && <span className="mt-1 block text-xs font-normal text-muted-foreground">By default this stays same as WhatsApp unless you change it.</span>}
            </label>
            <label className="font-body text-sm font-semibold text-foreground sm:col-span-2">
              Email
              <input value={user?.email || userProfile?.email || ""} disabled className="mt-2 h-11 w-full rounded-md border border-border bg-muted px-3 font-body text-sm text-muted-foreground" />
            </label>
          </div>

          {!isManagedAccount && (
            <button type="submit" disabled={saving} className="mt-6 inline-flex items-center justify-center gap-2 rounded-sm bg-gradient-primary px-6 py-3 font-display text-sm font-semibold tracking-[0.08em] text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60">
              <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Profile"}
            </button>
          )}
        </form>
      </div>
    </AccountLayout>
  );
};

export default Profile;