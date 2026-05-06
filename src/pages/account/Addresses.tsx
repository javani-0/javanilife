import { useEffect, useState, type FormEvent } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { Edit, MapPin, Plus, Trash2 } from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { normalizeCustomerAddress, type CheckoutAddress } from "@/lib/ecommerce";

const emptyAddress: CheckoutAddress = {
  fullName: "",
  phone: "",
  email: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
  landmark: "",
  notes: "",
  isDefault: false,
};

const Addresses = () => {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [addresses, setAddresses] = useState<CheckoutAddress[]>([]);
  const [form, setForm] = useState<CheckoutAddress>(emptyAddress);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;

    setForm((current) => ({
      ...current,
      fullName: current.fullName || user.displayName || userProfile?.username || "",
      email: current.email || user.email || userProfile?.email || "",
    }));

    const unsubscribe = onSnapshot(collection(db, "users", user.uid, "addresses"), (snapshot) => {
      const nextAddresses = snapshot.docs
        .map((addressDoc) => normalizeCustomerAddress(addressDoc.id, addressDoc.data()))
        .sort((first, second) => Number(second.isDefault === true) - Number(first.isDefault === true));
      setAddresses(nextAddresses);
      setLoading(false);
    }, (error) => {
      console.error("Unable to load addresses", error);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, userProfile]);

  const updateForm = (field: keyof CheckoutAddress, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...emptyAddress, fullName: user?.displayName || userProfile?.username || "", email: user?.email || userProfile?.email || "" });
  };

  const saveAddress = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    if (!form.fullName.trim() || !form.phone.trim() || !form.line1.trim() || !form.city.trim() || !form.state.trim() || !form.pincode.trim()) {
      toast({ title: "Missing address details", description: "Please complete the required delivery fields.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (form.isDefault) {
        await Promise.all(addresses.filter((address) => address.id && address.id !== editingId).map((address) => updateDoc(doc(db, "users", user.uid, "addresses", address.id!), { isDefault: false, updatedAt: serverTimestamp() })));
      }

      const payload = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email?.trim() || "",
        line1: form.line1.trim(),
        line2: form.line2?.trim() || "",
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        landmark: form.landmark?.trim() || "",
        notes: form.notes?.trim() || "",
        isDefault: form.isDefault || addresses.length === 0,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await setDoc(doc(db, "users", user.uid, "addresses", editingId), payload, { merge: true });
      } else {
        await addDoc(collection(db, "users", user.uid, "addresses"), { ...payload, createdAt: serverTimestamp() });
      }

      resetForm();
      toast({ title: "Address saved", description: "Your delivery address is ready for checkout." });
    } catch (error) {
      console.error("Unable to save address", error);
      toast({ title: "Unable to save address", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const editAddress = (address: CheckoutAddress) => {
    setEditingId(address.id || null);
    setForm(address);
  };

  const removeAddress = async (addressId?: string) => {
    if (!user || !addressId) return;
    await deleteDoc(doc(db, "users", user.uid, "addresses", addressId));
  };

  return (
    <AccountLayout title="Saved Addresses" description="Create, edit, and manage delivery addresses for future checkout.">
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
          <h2 className="font-display text-2xl text-foreground">Your Addresses</h2>
          <p className="mt-1 font-body text-sm text-muted-foreground">Default address appears first.</p>

          {loading ? (
            <p className="mt-5 font-body text-sm text-muted-foreground">Loading addresses...</p>
          ) : addresses.length === 0 ? (
            <div className="mt-5 rounded-xl border border-gold/15 bg-background/70 p-8 text-center">
              <MapPin className="mx-auto mb-4 h-10 w-10 text-gold" />
              <h3 className="font-display text-xl text-foreground">No saved addresses</h3>
              <p className="mt-2 font-body text-sm text-muted-foreground">Add one now to make future checkout faster.</p>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {addresses.map((address) => (
                <article key={address.id} className="rounded-xl border border-border/70 bg-background/70 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="font-display text-lg text-foreground">{address.fullName}</p>
                    {address.isDefault && <span className="rounded-full bg-gold/10 px-2.5 py-1 font-body text-xs font-semibold text-gold">Default</span>}
                  </div>
                  <div className="font-body text-sm leading-relaxed text-muted-foreground">
                    <p>{address.phone}</p>
                    <p>{address.line1}</p>
                    {address.line2 && <p>{address.line2}</p>}
                    <p>{address.city}, {address.state} {address.pincode}</p>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button type="button" onClick={() => editAddress(address)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-sm border border-gold/40 px-3 py-2 font-body text-sm font-semibold text-gold hover:bg-gold hover:text-white">
                      <Edit className="h-4 w-4" /> Edit
                    </button>
                    <button type="button" onClick={() => removeAddress(address.id)} className="rounded-sm border border-destructive/30 px-3 py-2 text-destructive hover:bg-destructive/10" aria-label={`Delete ${address.fullName} address`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <form onSubmit={saveAddress} className="h-fit rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6 xl:sticky xl:top-28">
          <h2 className="font-display text-2xl text-foreground">{editingId ? "Edit Address" : "Add Address"}</h2>
          <div className="mt-5 grid gap-3">
            <input value={form.fullName} onChange={(event) => updateForm("fullName", event.target.value)} className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="Full name" />
            <input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="Phone" />
            <input value={form.email || ""} onChange={(event) => updateForm("email", event.target.value)} className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="Email" />
            <input value={form.line1} onChange={(event) => updateForm("line1", event.target.value)} className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="Address line 1" />
            <input value={form.line2 || ""} onChange={(event) => updateForm("line2", event.target.value)} className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="Address line 2" />
            <div className="grid grid-cols-2 gap-3">
              <input value={form.city} onChange={(event) => updateForm("city", event.target.value)} className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="City" />
              <input value={form.state} onChange={(event) => updateForm("state", event.target.value)} className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="State" />
            </div>
            <input value={form.pincode} onChange={(event) => updateForm("pincode", event.target.value)} className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="Pincode" />
            <input value={form.landmark || ""} onChange={(event) => updateForm("landmark", event.target.value)} className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="Landmark" />
            <textarea value={form.notes || ""} onChange={(event) => updateForm("notes", event.target.value)} className="min-h-20 rounded-md border border-border bg-background px-3 py-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="Delivery notes" />
            <label className="flex items-center gap-2 font-body text-sm text-muted-foreground">
              <input type="checkbox" checked={form.isDefault === true} onChange={(event) => updateForm("isDefault", event.target.checked)} /> Make default address
            </label>
          </div>
          <div className="mt-5 flex gap-2">
            <button type="submit" disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-sm bg-gradient-primary px-5 py-3 font-display text-sm font-semibold tracking-[0.08em] text-primary-foreground hover:brightness-110 disabled:opacity-60">
              <Plus className="h-4 w-4" /> {saving ? "Saving..." : editingId ? "Update" : "Add"}
            </button>
            {editingId && <button type="button" onClick={resetForm} className="rounded-sm border border-border px-4 py-3 font-body text-sm font-semibold text-muted-foreground hover:bg-muted">Cancel</button>}
          </div>
        </form>
      </div>
    </AccountLayout>
  );
};

export default Addresses;