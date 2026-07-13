import { useState, useEffect, useRef } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";
import { openSquareCropper } from "@/components/SquareImageCropper";
import { Upload, Trash2, Edit2, Save, X, Link2, ShieldCheck, Handshake, GraduationCap, BookOpen, Package, KeyRound, Phone, MessageCircle, Copy, Eye, EyeOff, Link as LinkIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Progress } from "@/components/ui/progress";
import {
  revokePartnerRole,
  createPartnerLogin,
  subscribeToPartnerCredentials,
  deletePartnerCredentials,
  buildPartnerLoginWhatsAppUrl,
  type PartnerCredential,
} from "@/lib/finance";

interface Partner {
  id: string;
  name: string;
  logoUrl: string;
  publicId: string;
  order: number;
  timestamp: any;
  // Optional financial access: when an email is set, this partner can sign in and
  // see a read-only finance dashboard scoped to the categories below. Every
  // partner is independent — granting access to one never affects another (req 4).
  email?: string;
  partnerUid?: string;
  shareClassesPercent?: number;
  shareCoursesPercent?: number;
  shareProductsPercent?: number;
}

// The share a partner draws from each income category. 0 (or blank) = excluded.
interface Shares {
  classes: string;
  courses: string;
  products: string;
}

const emptyShares: Shares = { classes: "", courses: "", products: "" };

const CATEGORY_META: { key: keyof Shares; label: string; icon: typeof GraduationCap }[] = [
  { key: "classes", label: "Classes", icon: GraduationCap },
  { key: "courses", label: "Courses", icon: BookOpen },
  { key: "products", label: "Products", icon: Package },
];

const sanitizePct = (value: string) => value.replace(/[^0-9.]/g, "");

const fieldClass = "h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20";

// A per-category share grid. Defined at module scope (not inside the component)
// so it isn't remounted every render — otherwise the % inputs lose focus after
// each keystroke.
const SharesGrid = ({ value, onChange, disabled }: { value: Shares; onChange: (next: Shares) => void; disabled?: boolean }) => (
  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
    {CATEGORY_META.map(({ key, label, icon: Icon }) => (
      <div key={key}>
        <label className="mb-1 flex items-center gap-1.5 font-body text-xs font-medium text-foreground"><Icon className="h-3.5 w-3.5 text-gold" /> {label} %</label>
        <input
          value={value[key]}
          onChange={(e) => onChange({ ...value, [key]: sanitizePct(e.target.value) })}
          inputMode="decimal"
          placeholder="0"
          className="h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
          disabled={disabled}
        />
      </div>
    ))}
  </div>
);

const AdminPartners = () => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [partnerName, setPartnerName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [uploadMode, setUploadMode] = useState<"file" | "url">("file");
  const [logoUrl, setLogoUrl] = useState("");
  const [urlPreview, setUrlPreview] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const [editUploadMode, setEditUploadMode] = useState<"file" | "url">("file");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editFilePreview, setEditFilePreview] = useState("");
  const [editLogoUrl, setEditLogoUrl] = useState("");
  const [editUrlPreview, setEditUrlPreview] = useState("");
  const [editUploading, setEditUploading] = useState(false);
  const editFileRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // Financial-access inputs (per-partner). Each partner gets their own login
  // (email + admin-set password) + a share % for each category they earn from.
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addWhatsapp, setAddWhatsapp] = useState("");
  const [addShares, setAddShares] = useState<Shares>(emptyShares);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editWhatsapp, setEditWhatsapp] = useState("");
  const [editShares, setEditShares] = useState<Shares>(emptyShares);

  // Stored partner sign-in credentials (admin-only) for re-sharing on WhatsApp.
  const [credentials, setCredentials] = useState<Record<string, PartnerCredential>>({});
  const [revealPw, setRevealPw] = useState<Record<string, boolean>>({});
  useEffect(() => subscribeToPartnerCredentials(setCredentials, () => undefined), []);

  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";

  /** Validate share inputs. Returns clamped numbers, or null if any is invalid. */
  const parseShares = (shares: Shares): { classes: number; courses: number; products: number } | null => {
    const parseOne = (raw: string): number | null => {
      const trimmed = raw.trim();
      if (!trimmed) return 0;
      const value = Number(trimmed);
      if (!Number.isFinite(value) || value < 0 || value > 100) return null;
      return value;
    };
    const classes = parseOne(shares.classes);
    const courses = parseOne(shares.courses);
    const products = parseOne(shares.products);
    if (classes === null || courses === null || products === null) {
      toast({ title: "Share % must be between 0 and 100", description: "Set a valid percentage for each category (or leave it blank for 0).", variant: "destructive" });
      return null;
    }
    return { classes, courses, products };
  };

  /**
   * Create (or reset) the partner's sign-in via the server (Admin SDK) and store
   * the credentials for re-sharing. Returns the partner's uid.
   */
  const createLogin = async (partnerId: string, email: string, password: string, name: string, whatsapp: string): Promise<string> => {
    if (!user) throw new Error("You must be signed in as an admin.");
    const idToken = await user.getIdToken();
    const { uid } = await createPartnerLogin(idToken, { email, password, partnerId, name: name || email, whatsapp });
    return uid;
  };

  /** Partner name is mandatory — it identifies them everywhere (share list, login, WhatsApp). */
  const nameInvalid = (name: string): boolean => {
    if (name.trim()) return false;
    toast({ title: "Partner name is required", description: "Enter the partner's name before saving.", variant: "destructive" });
    return true;
  };

  /** email set ⇒ a 6+ char password is required (to create their login). */
  const accessInputsInvalid = (email: string, password: string, hasExistingLogin: boolean): boolean => {
    const e = email.trim();
    if (!e) return false;
    // Existing login can be kept without re-typing a password.
    if (hasExistingLogin && !password.trim()) return false;
    if (password.trim().length < 6) {
      toast({ title: "Set a password for their login", description: "Enter a password with at least 6 characters so this partner can sign in.", variant: "destructive" });
      return true;
    }
    return false;
  };

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "partners"),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Partner));
        setPartners(data.sort((a, b) => (a.order || 0) - (b.order || 0)));
      },
      (err) => {
        console.error("[Firestore Partners Error]", err);
        toast({ title: "Error", description: `Failed to load partners: ${err.message}`, variant: "destructive" });
      }
    );
    return unsub;
  }, [toast]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after a cancel
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid File", description: "Please select an image file", variant: "destructive" });
      return;
    }

    // Enforce 1:1 — crop to square before accepting the file.
    const square = await openSquareCropper(file);
    if (!square) return;

    setSelectedFile(square);
    setPreview(URL.createObjectURL(square));
  };

  /** Shared create: writes the partner doc, then creates their login if set. */
  const createPartnerDoc = async (logo: { logoUrl: string; publicId: string }) => {
    const email = addEmail.trim().toLowerCase();
    const password = addPassword.trim();
    if (nameInvalid(partnerName)) return false;
    const shares = parseShares(addShares);
    if (shares === null) return false; // invalid share — toast already shown
    if (accessInputsInvalid(email, password, false)) return false;

    const docRef = await addDoc(collection(db, "partners"), {
      name: partnerName.trim(),
      logoUrl: logo.logoUrl,
      publicId: logo.publicId,
      email,
      partnerUid: "",
      shareClassesPercent: shares.classes,
      shareCoursesPercent: shares.courses,
      shareProductsPercent: shares.products,
      order: partners.length,
      timestamp: serverTimestamp(),
    });

    if (email && password) {
      const uid = await createLogin(docRef.id, email, password, partnerName.trim(), addWhatsapp.trim());
      await updateDoc(docRef, { partnerUid: uid });
      toast({ title: "Partner login created", description: `${email} can now sign in. Share the login from their card below.` });
    }
    return true;
  };

  const resetAddForm = () => {
    setSelectedFile(null);
    setPreview("");
    setPartnerName("");
    setLogoUrl("");
    setUrlPreview("");
    setAddEmail("");
    setAddPassword("");
    setAddWhatsapp("");
    setAddShares(emptyShares);
    if (fileRef.current) fileRef.current.value = "";
  };

  const uploadPartner = async () => {
    // A partner needs a logo (for the website) and/or financial access details.
    if (!selectedFile && !addEmail.trim()) {
      toast({ title: "Missing Information", description: "Add a logo image and/or a financial-access email.", variant: "destructive" });
      return;
    }
    // Validate name + share + login inputs BEFORE uploading so nothing leaves an
    // orphaned Cloudinary image.
    if (nameInvalid(partnerName)) return;
    if (parseShares(addShares) === null) return;
    if (accessInputsInvalid(addEmail.trim().toLowerCase(), addPassword.trim(), false)) return;

    setUploading(true);
    setProgress(0);

    try {
      let logo = { logoUrl: "", publicId: "" };
      if (selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
        formData.append("folder", "partners");

        setProgress(30);

        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        setProgress(60);

        if (!data.secure_url) {
          throw new Error(data.error?.message || "Upload failed");
        }
        logo = { logoUrl: data.secure_url, publicId: data.public_id };
      }

      const created = await createPartnerDoc(logo);
      if (!created) return;

      setProgress(100);
      toast({ title: "Success", description: "Partner added successfully" });
      resetAddForm();
    } catch (err: any) {
      console.error("[Upload Error]", err);
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const addPartnerByUrl = async () => {
    if (nameInvalid(partnerName)) return;
    if (!logoUrl.trim() && !addEmail.trim()) {
      toast({ title: "Missing Information", description: "Add a logo URL and/or a financial-access email.", variant: "destructive" });
      return;
    }

    setAddingUrl(true);
    try {
      const created = await createPartnerDoc({ logoUrl: logoUrl.trim(), publicId: "" });
      if (!created) return;
      toast({ title: "Success", description: "Partner added successfully" });
      resetAddForm();
    } catch (err: any) {
      console.error("[URL Add Error]", err);
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setAddingUrl(false);
    }
  };

  const deletePartner = async (partner: Partner) => {
    const hasAccess = Boolean(partner.email || partner.partnerUid);
    if (!confirm(`Delete ${partner.name || partner.email || "this partner"}?${hasAccess ? " Their financial access will also be revoked." : ""}`)) return;

    try {
      // Delete from Cloudinary
      if (partner.publicId) {
        await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_id: partner.publicId }),
        });
      }

      if (partner.partnerUid) {
        try { await revokePartnerRole(partner.partnerUid); } catch (error) { console.error("Could not revoke partner login", error); }
      }
      try { await deletePartnerCredentials(partner.id); } catch (error) { console.error("Could not delete stored credentials", error); }
      await deleteDoc(doc(db, "partners", partner.id));
      toast({ title: "Deleted", description: `${partner.name || partner.email || "Partner"} removed` });
    } catch (err: any) {
      console.error("[Delete Error]", err);
      toast({ title: "Delete Failed", description: err.message, variant: "destructive" });
    }
  };

  const startEdit = (partner: Partner) => {
    setEditingId(partner.id);
    setEditName(partner.name);
    setEditUploadMode("file");
    setEditFile(null);
    setEditFilePreview("");
    setEditLogoUrl("");
    setEditUrlPreview("");
    setEditEmail(partner.email || "");
    setEditPassword("");
    setEditWhatsapp(credentials[partner.id]?.whatsapp || "");
    setEditShares({
      classes: partner.shareClassesPercent ? String(partner.shareClassesPercent) : "",
      courses: partner.shareCoursesPercent ? String(partner.shareCoursesPercent) : "",
      products: partner.shareProductsPercent ? String(partner.shareProductsPercent) : "",
    });
  };

  const handleEditFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid File", description: "Please select an image file", variant: "destructive" });
      return;
    }

    const square = await openSquareCropper(file);
    if (!square) return;

    setEditFile(square);
    setEditFilePreview(URL.createObjectURL(square));
  };

  const saveEdit = async (partnerId: string) => {
    const partner = partners.find(p => p.id === partnerId);
    if (!partner) return;

    // Validate shares + login BEFORE any logo upload/delete so nothing can leave
    // the doc pointing at a destroyed Cloudinary image.
    if (nameInvalid(editName)) return;
    const shares = parseShares(editShares);
    if (shares === null) return; // invalid — keep editing
    const email = editEmail.trim().toLowerCase();
    const password = editPassword.trim();
    if (accessInputsInvalid(email, password, Boolean(partner.partnerUid))) return;

    setEditUploading(true);

    try {
      let newLogoUrl = partner.logoUrl;
      let newPublicId = partner.publicId;

      // Handle logo update if provided
      if (editFile) {
        const formData = new FormData();
        formData.append("file", editFile);
        formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
        formData.append("folder", "partners");

        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!data.secure_url) {
          throw new Error(data.error?.message || "Upload failed");
        }

        newLogoUrl = data.secure_url;
        newPublicId = data.public_id;

        if (partner.publicId) {
          await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ public_id: partner.publicId }),
          });
        }
      } else if (editLogoUrl.trim()) {
        newLogoUrl = editLogoUrl.trim();
        newPublicId = "";

        if (partner.publicId) {
          await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ public_id: partner.publicId }),
          });
        }
      }

      // Financial-access reconciliation (independent per partner):
      //  • email + new password  → create/reset their login (server, Admin SDK)
      //  • email, no password, existing login → keep it; just refresh WhatsApp
      //  • email cleared          → revoke the login + delete stored credentials
      let partnerUid = partner.partnerUid || "";
      if (email) {
        if (password) {
          partnerUid = await createLogin(partner.id, email, password, editName.trim(), editWhatsapp.trim());
          toast({ title: "Partner login saved", description: `${email} can sign in with the new password. Share it from their card.` });
        } else {
          // Keep the existing login; persist any WhatsApp change for re-sharing.
          if (editWhatsapp.trim() !== (credentials[partner.id]?.whatsapp || "")) {
            await setDoc(doc(db, "partnerCredentials", partner.id), { whatsapp: editWhatsapp.trim() }, { merge: true });
          }
        }
      } else if (partner.partnerUid) {
        try { await revokePartnerRole(partner.partnerUid); } catch (error) { console.error("Could not revoke partner login", error); }
        try { await deletePartnerCredentials(partner.id); } catch (error) { console.error("Could not delete stored credentials", error); }
        partnerUid = "";
        toast({ title: "Financial access revoked", description: `${partner.email || "This partner"} can no longer view the finance dashboard.` });
      }

      await updateDoc(doc(db, "partners", partnerId), {
        name: editName.trim(),
        logoUrl: newLogoUrl,
        publicId: newPublicId,
        email,
        partnerUid,
        shareClassesPercent: shares.classes,
        shareCoursesPercent: shares.courses,
        shareProductsPercent: shares.products,
      });

      toast({ title: "Updated", description: "Partner updated successfully" });
      setEditingId(null);
      setEditFile(null);
      setEditFilePreview("");
      setEditLogoUrl("");
      setEditUrlPreview("");
      setEditEmail("");
      setEditPassword("");
      setEditWhatsapp("");
      setEditShares(emptyShares);
      if (editFileRef.current) editFileRef.current.value = "";
    } catch (err: any) {
      console.error("[Update Error]", err);
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    } finally {
      setEditUploading(false);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditFile(null);
    setEditFilePreview("");
    setEditLogoUrl("");
    setEditUrlPreview("");
    setEditEmail("");
    setEditPassword("");
    setEditWhatsapp("");
    setEditShares(emptyShares);
    if (editFileRef.current) editFileRef.current.value = "";
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: `Could not copy the ${label.toLowerCase()}`, variant: "destructive" });
    }
  };

  const shareBadges = (partner: Partner) => {
    const items: string[] = [];
    if (partner.shareClassesPercent) items.push(`Classes ${partner.shareClassesPercent}%`);
    if (partner.shareCoursesPercent) items.push(`Courses ${partner.shareCoursesPercent}%`);
    if (partner.shareProductsPercent) items.push(`Products ${partner.shareProductsPercent}%`);
    return items;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-foreground mb-2">Partners Manager</h1>
        <p className="font-body text-sm text-muted-foreground">One place for every partner — website logo, financial access &amp; a profit share you split by category (classes, courses, products).</p>
        <p className="mt-1.5 font-body text-sm text-muted-foreground">
          Partners sign in at <a href={loginUrl} target="_blank" rel="noreferrer" className="font-semibold text-gold hover:underline">{loginUrl}</a> and land on their own read-only dashboard at <span className="font-semibold text-foreground">/partner</span>.
        </p>
      </div>

      {/* Add partner — logo and/or financial access in ONE form */}
      <div className="bg-card border border-border rounded-lg p-6 mb-8 shadow-sm">
        <h2 className="font-display text-lg font-semibold text-foreground mb-1">Add Partner</h2>
        <p className="font-body text-sm text-muted-foreground mb-4">Add a logo to show them on the website, fill the financial-access fields to let them view income &amp; their share — or both.</p>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setUploadMode("file")}
            className={`px-4 py-2 rounded-md font-body text-sm font-medium transition-colors flex items-center gap-2 ${
              uploadMode === "file"
                ? "bg-gold text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <Upload className="w-4 h-4" />
            Upload File
          </button>
          <button
            onClick={() => setUploadMode("url")}
            className={`px-4 py-2 rounded-md font-body text-sm font-medium transition-colors flex items-center gap-2 ${
              uploadMode === "url"
                ? "bg-gold text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <Link2 className="w-4 h-4" />
            Paste URL
          </button>
        </div>

        {/* Partner details + financial access (name is required) */}
        <div className="mb-4 rounded-lg border border-gold/25 bg-gold/5 p-4">
          <p className="flex items-center gap-2 font-body text-sm font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-gold" /> Partner details &amp; financial access</p>
          <p className="mt-0.5 font-body text-xs text-muted-foreground">Lets this partner sign in and see a read-only dashboard. Set a share % for each category they earn from — leave a category at 0 to exclude it.</p>

          <div className="mt-3">
            <label className="mb-1 flex items-center gap-1.5 font-body text-xs font-medium text-foreground"><Handshake className="h-3.5 w-3.5 text-gold" /> Partner name <span className="text-destructive">*</span></label>
            <input
              type="text"
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
              placeholder="e.g., Ramesh Kumar"
              className={fieldClass}
              disabled={uploading || addingUrl}
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 flex items-center gap-1.5 font-body text-xs font-medium text-foreground"><MessageCircle className="h-3.5 w-3.5 text-gold" /> Login email</label>
              <input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="partner@email.com" className={fieldClass} disabled={uploading || addingUrl} />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 font-body text-xs font-medium text-foreground"><KeyRound className="h-3.5 w-3.5 text-gold" /> Password</label>
              <input type="text" value={addPassword} onChange={(e) => setAddPassword(e.target.value)} placeholder="min 6 characters" className={fieldClass} disabled={uploading || addingUrl} />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 font-body text-xs font-medium text-foreground"><Phone className="h-3.5 w-3.5 text-gold" /> WhatsApp <span className="font-normal text-muted-foreground">(optional)</span></label>
              <input value={addWhatsapp} onChange={(e) => setAddWhatsapp(e.target.value.replace(/[^0-9]/g, ""))} inputMode="tel" placeholder="e.g. 919876543210" className={fieldClass} disabled={uploading || addingUrl} />
            </div>
          </div>
          <p className="mt-1.5 font-body text-[0.7rem] text-muted-foreground">
            You create the login here — the partner does <span className="font-semibold text-foreground">not</span> need to sign up. The email &amp; password are saved so you can re-share them on WhatsApp anytime.
          </p>
          <SharesGrid value={addShares} onChange={setAddShares} disabled={uploading || addingUrl} />

          {/* Where the partner signs in */}
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-gold/30 bg-card px-3 py-2">
            <span className="flex items-center gap-1.5 font-body text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
              <LinkIcon className="h-3.5 w-3.5 text-gold" /> Partner portal
            </span>
            <code className="min-w-0 flex-1 truncate font-mono text-[0.75rem] text-foreground">{loginUrl}</code>
            <button type="button" onClick={() => copyText(loginUrl, "Partner portal link")} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-gold/10 hover:text-gold" title="Copy link">
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1 font-body text-[0.7rem] text-muted-foreground">
            They sign in at <span className="font-semibold text-foreground">/login</span> with the email &amp; password above and are taken straight to their dashboard at <span className="font-semibold text-foreground">/partner</span> (read-only — they only see their own share).
          </p>
        </div>

        {uploadMode === "file" ? (
          /* File Upload Mode */
          <>
            <div>
              <label className="block font-body text-sm font-medium text-foreground mb-2">Logo Image</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="w-full px-4 py-2 border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                disabled={uploading}
              />
            </div>

            {preview && (
              <div className="mt-4 p-4 border border-border rounded-md bg-background">
                <p className="font-body text-sm text-muted-foreground mb-2">Preview:</p>
                <img src={preview} alt="Preview" className="h-20 w-auto object-contain" />
              </div>
            )}

            {uploading && (
              <div className="mt-4">
                <Progress value={progress} className="h-2" />
                <p className="font-body text-sm text-muted-foreground mt-2">Uploading... {progress}%</p>
              </div>
            )}

            <button
              onClick={uploadPartner}
              disabled={uploading || !partnerName.trim() || (!selectedFile && !addEmail.trim())}
              className="mt-4 px-6 py-2.5 bg-gold text-white rounded-md font-body text-sm font-medium hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {uploading ? "Uploading..." : "Add Partner"}
            </button>
          </>
        ) : (
          /* URL Mode */
          <>
            <div>
              <label className="block font-body text-sm font-medium text-foreground mb-2">Logo URL</label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => {
                  setLogoUrl(e.target.value);
                  setUrlPreview(e.target.value);
                }}
                placeholder="https://example.com/logo.png"
                className="w-full px-4 py-2 border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                disabled={addingUrl}
              />
            </div>

            {urlPreview && (
              <div className="mt-4 p-4 border border-border rounded-md bg-background">
                <p className="font-body text-sm text-muted-foreground mb-2">Preview:</p>
                <img
                  src={urlPreview}
                  alt="URL Preview"
                  className="h-20 w-auto object-contain"
                  onError={() => setUrlPreview("")}
                />
              </div>
            )}

            <button
              onClick={addPartnerByUrl}
              disabled={addingUrl || !partnerName.trim() || (!logoUrl.trim() && !addEmail.trim())}
              className="mt-4 px-6 py-2.5 bg-gold text-white rounded-md font-body text-sm font-medium hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              {addingUrl ? "Adding..." : "Add Partner"}
            </button>
          </>
        )}
      </div>

      {/* Partners List */}
      <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
        <h2 className="font-display text-lg font-semibold text-foreground mb-4">
          Current Partners ({partners.length})
        </h2>

        {partners.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground text-center py-8">No partners yet</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {partners.map((partner) => (
              <div
                key={partner.id}
                className={`border border-border rounded-lg p-4 bg-background transition-all ${
                  editingId === partner.id
                    ? "sm:col-span-2 lg:col-span-3 xl:col-span-4 shadow-lg p-6"
                    : "hover:shadow-md"
                }`}
              >
                {editingId !== partner.id && (
                  <div className="flex items-center justify-center h-24 mb-3">
                    {partner.logoUrl ? (
                      <img
                        src={partner.logoUrl}
                        alt={partner.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gold/10 text-gold"><Handshake className="h-8 w-8" /></span>
                    )}
                  </div>
                )}

                {editingId === partner.id ? (
                  <div>
                    <h3 className="font-display text-base font-semibold text-foreground mb-4 pb-2 border-b border-border">
                      Edit Partner
                    </h3>
                    <div className="grid md:grid-cols-2 gap-6">
                      {/* Current Logo Preview */}
                      <div className="space-y-3">
                        <div>
                          <p className="font-body text-sm text-muted-foreground mb-2">Current Logo</p>
                          <div className="border border-border rounded-lg p-6 bg-card flex items-center justify-center h-48">
                            {partner.logoUrl ? (
                              <img
                                src={partner.logoUrl}
                                alt={partner.name}
                                className="max-h-full max-w-full object-contain"
                              />
                            ) : (
                              <span className="font-body text-sm text-muted-foreground">No logo — financial-access partner</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Edit Form */}
                      <div className="space-y-4">
                        {/* Partner Name */}
                        <div>
                          <label className="block font-body text-sm font-medium text-foreground mb-2">
                            Partner Name <span className="text-destructive">*</span>
                          </label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="e.g., Ramesh Kumar"
                            className="w-full px-4 py-2 border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                            disabled={editUploading}
                          />
                        </div>

                        {/* Upload Mode Toggle */}
                        <div>
                          <label className="block font-body text-sm font-medium text-foreground mb-2">Update Logo</label>
                          <div className="flex gap-2 mb-3">
                            <button
                              onClick={() => setEditUploadMode("file")}
                              className={`flex-1 px-4 py-2 rounded-md font-body text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                editUploadMode === "file" ? "bg-gold text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
                              }`}
                              disabled={editUploading}
                            >
                              <Upload className="w-4 h-4" />
                              Upload File
                            </button>
                            <button
                              onClick={() => setEditUploadMode("url")}
                              className={`flex-1 px-4 py-2 rounded-md font-body text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                editUploadMode === "url" ? "bg-gold text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
                              }`}
                              disabled={editUploading}
                            >
                              <Link2 className="w-4 h-4" />
                              Paste URL
                            </button>
                          </div>

                          {editUploadMode === "file" ? (
                            <div>
                              <input
                                ref={editFileRef}
                                type="file"
                                accept="image/*"
                                onChange={handleEditFileSelect}
                                className="w-full px-4 py-2 border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                                disabled={editUploading}
                              />
                              {editFilePreview && (
                                <div className="mt-3 p-4 border border-border rounded-md bg-background">
                                  <p className="font-body text-xs text-muted-foreground mb-2">New Preview:</p>
                                  <img src={editFilePreview} alt="Preview" className="h-24 w-auto object-contain mx-auto" />
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <input
                                type="url"
                                value={editLogoUrl}
                                onChange={(e) => {
                                  setEditLogoUrl(e.target.value);
                                  setEditUrlPreview(e.target.value);
                                }}
                                placeholder="https://example.com/logo.png"
                                className="w-full px-4 py-2 border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                                disabled={editUploading}
                              />
                              {editUrlPreview && (
                                <div className="mt-3 p-4 border border-border rounded-md bg-background">
                                  <p className="font-body text-xs text-muted-foreground mb-2">New Preview:</p>
                                  <img
                                    src={editUrlPreview}
                                    alt="Preview"
                                    className="h-24 w-auto object-contain mx-auto"
                                    onError={() => setEditUrlPreview("")}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Financial access */}
                        <div className="rounded-lg border border-gold/25 bg-gold/5 p-3">
                          <p className="flex items-center gap-1.5 font-body text-sm font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-gold" /> Financial access <span className="font-normal text-muted-foreground">(optional)</span></p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-3">
                            <div>
                              <label className="mb-1 flex items-center gap-1.5 font-body text-xs font-medium text-foreground"><MessageCircle className="h-3.5 w-3.5 text-gold" /> Login email</label>
                              <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="partner@email.com" className={fieldClass} disabled={editUploading} />
                            </div>
                            <div>
                              <label className="mb-1 flex items-center gap-1.5 font-body text-xs font-medium text-foreground"><KeyRound className="h-3.5 w-3.5 text-gold" /> Password</label>
                              <input type="text" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder={partner.partnerUid ? "leave blank to keep" : "min 6 characters"} className={fieldClass} disabled={editUploading} />
                            </div>
                            <div>
                              <label className="mb-1 flex items-center gap-1.5 font-body text-xs font-medium text-foreground"><Phone className="h-3.5 w-3.5 text-gold" /> WhatsApp</label>
                              <input value={editWhatsapp} onChange={(e) => setEditWhatsapp(e.target.value.replace(/[^0-9]/g, ""))} inputMode="tel" placeholder="919876543210" className={fieldClass} disabled={editUploading} />
                            </div>
                          </div>
                          <SharesGrid value={editShares} onChange={setEditShares} disabled={editUploading} />
                          <p className="mt-1.5 font-body text-[0.7rem] text-muted-foreground">
                            {partner.partnerUid
                              ? "Leave the password blank to keep their current one — type a new one to reset it. Clear the email to revoke their access."
                              : "Set an email + password to create this partner's login. Clear the email to skip financial access."}
                          </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3 pt-4">
                          <button
                            onClick={() => saveEdit(partner.id)}
                            disabled={editUploading}
                            className="flex-1 px-6 py-2.5 bg-green-600 text-white rounded-md font-body text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                          >
                            <Save className="w-4 h-4" />
                            {editUploading ? "Saving..." : "Save Changes"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={editUploading}
                            className="flex-1 px-6 py-2.5 bg-gray-500 text-white rounded-md font-body text-sm font-medium hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                          >
                            <X className="w-4 h-4" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="font-body text-sm font-medium text-foreground text-center mb-1">{partner.name || partner.email || "Partner"}</p>
                    <div className="mb-3 flex flex-wrap items-center justify-center gap-1.5">
                      {partner.logoUrl && <span className="rounded-full bg-muted px-2 py-0.5 font-body text-[0.65rem] font-semibold text-muted-foreground">Website logo</span>}
                      {partner.email && (
                        <span className={`rounded-full px-2 py-0.5 font-body text-[0.65rem] font-semibold ${partner.partnerUid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`} title={partner.email}>
                          {partner.partnerUid ? "Can sign in" : "No login yet"}
                        </span>
                      )}
                      {shareBadges(partner).map((label) => (
                        <span key={label} className="rounded-full bg-gold/15 px-2 py-0.5 font-body text-[0.65rem] font-semibold text-gold">{label}</span>
                      ))}
                    </div>

                    {/* Saved login — admin can copy or re-share it on WhatsApp anytime */}
                    {credentials[partner.id]?.email && (
                      <div className="mb-3 rounded-lg border border-gold/25 bg-gold/5 p-2.5 text-left">
                        <p className="mb-1.5 flex items-center gap-1.5 font-body text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                          <KeyRound className="h-3 w-3 text-gold" /> Login details
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate font-body text-[0.72rem] text-foreground">{credentials[partner.id].email}</span>
                          <button onClick={() => copyText(credentials[partner.id].email, "Email")} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-gold/10 hover:text-gold" title="Copy email"><Copy className="h-3 w-3" /></button>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate font-body text-[0.72rem] text-foreground">
                            {revealPw[partner.id] ? credentials[partner.id].password : "••••••••"}
                          </span>
                          <span className="flex shrink-0 items-center">
                            <button onClick={() => setRevealPw((prev) => ({ ...prev, [partner.id]: !prev[partner.id] }))} className="rounded p-1 text-muted-foreground hover:bg-gold/10 hover:text-gold" title={revealPw[partner.id] ? "Hide password" : "Show password"}>
                              {revealPw[partner.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </button>
                            <button onClick={() => copyText(credentials[partner.id].password, "Password")} className="rounded p-1 text-muted-foreground hover:bg-gold/10 hover:text-gold" title="Copy password"><Copy className="h-3 w-3" /></button>
                          </span>
                        </div>
                        <a
                          href={buildPartnerLoginWhatsAppUrl(credentials[partner.id], loginUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 flex items-center justify-center gap-1.5 rounded-md bg-[#25D366] px-3 py-1.5 font-body text-[0.7rem] font-semibold text-white transition-all hover:brightness-110"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> Share on WhatsApp
                        </a>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(partner)}
                        className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => deletePartner(partner)}
                        className="flex-1 px-3 py-1.5 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors flex items-center justify-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPartners;
