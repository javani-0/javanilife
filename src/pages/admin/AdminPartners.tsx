import { useState, useEffect, useRef } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";
import { openSquareCropper } from "@/components/SquareImageCropper";
import { Upload, Trash2, Edit2, Save, X, Link2, ShieldCheck, Handshake, GraduationCap, BookOpen, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { grantPartnerRoleByEmail, revokePartnerRole } from "@/lib/finance";

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

  // Financial-access inputs (per-partner). Each partner gets their own login
  // (email) + a share % for each category they earn from.
  const [addEmail, setAddEmail] = useState("");
  const [addShares, setAddShares] = useState<Shares>(emptyShares);
  const [editEmail, setEditEmail] = useState("");
  const [editShares, setEditShares] = useState<Shares>(emptyShares);

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
   * Grant (or refresh) the "partner" role for this email. Returns the uid, or ""
   * when no account exists yet (the doc is still saved so the admin can re-grant
   * once the partner signs up). Revokes a previous, different uid held by the
   * SAME partner entry so a stale login can't keep access.
   */
  const grantAccess = async (email: string, previousUid?: string): Promise<string> => {
    const uid = await grantPartnerRoleByEmail(email);
    if (!uid) {
      toast({ title: "No account yet for that email", description: `Ask the partner to sign up with ${email}, then save again to switch on their access.`, variant: "destructive" });
      return "";
    }
    if (previousUid && previousUid !== uid) {
      try { await revokePartnerRole(previousUid); } catch (error) { console.error("Could not revoke previous partner login", error); }
    }
    return uid;
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

  /** Shared create: writes the partner doc, granting access when an email is set. */
  const createPartnerDoc = async (logo: { logoUrl: string; publicId: string }) => {
    const email = addEmail.trim();
    const shares = parseShares(addShares);
    if (shares === null) return false; // invalid share — toast already shown

    let partnerUid = "";
    if (email) partnerUid = await grantAccess(email);

    await addDoc(collection(db, "partners"), {
      name: partnerName.trim(),
      logoUrl: logo.logoUrl,
      publicId: logo.publicId,
      email,
      partnerUid,
      shareClassesPercent: shares.classes,
      shareCoursesPercent: shares.courses,
      shareProductsPercent: shares.products,
      order: partners.length,
      timestamp: serverTimestamp(),
    });

    if (email && partnerUid) {
      toast({ title: "Financial access granted", description: `${email} can sign in and view their partner dashboard.` });
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
    setAddShares(emptyShares);
    if (fileRef.current) fileRef.current.value = "";
  };

  const uploadPartner = async () => {
    // A partner needs a logo (for the website) and/or financial access details.
    if (!selectedFile && !addEmail.trim()) {
      toast({ title: "Missing Information", description: "Add a logo image and/or a financial-access email.", variant: "destructive" });
      return;
    }
    // Validate share inputs BEFORE uploading so an invalid % doesn't leave an
    // orphaned Cloudinary image.
    if (parseShares(addShares) === null) return;

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

    // Validate shares BEFORE any logo upload/delete so an invalid % can't leave
    // the doc pointing at a destroyed Cloudinary image.
    const shares = parseShares(editShares);
    if (shares === null) return; // invalid — keep editing

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

      // Financial-access reconciliation: email set → grant/refresh; email cleared
      // → revoke this partner's login. Independent of every other partner.
      const email = editEmail.trim();
      let partnerUid = partner.partnerUid || "";
      if (email) {
        partnerUid = await grantAccess(email, partner.partnerUid);
        if (partnerUid) {
          toast({ title: "Financial access saved", description: `${email} can sign in and view their partner dashboard.` });
        }
      } else if (partner.partnerUid) {
        try { await revokePartnerRole(partner.partnerUid); } catch (error) { console.error("Could not revoke partner login", error); }
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
    setEditShares(emptyShares);
    if (editFileRef.current) editFileRef.current.value = "";
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
        <p className="font-body text-sm text-muted-foreground">One place for every partner — website logo, financial access &amp; a profit share you split by category (classes, courses, products). Each partner signs in to their own dashboard.</p>
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

        {/* Partner Name (shared) */}
        <div className="mb-4">
          <label className="block font-body text-sm font-medium text-foreground mb-2">Partner Name <span className="text-muted-foreground">(Optional)</span></label>
          <input
            type="text"
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
            placeholder="e.g., Microsoft Partner"
            className="w-full px-4 py-2 border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-gold"
            disabled={uploading || addingUrl}
          />
        </div>

        {/* Financial access (shared, optional) */}
        <div className="mb-4 rounded-lg border border-gold/25 bg-gold/5 p-4">
          <p className="flex items-center gap-2 font-body text-sm font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-gold" /> Financial access <span className="font-normal text-muted-foreground">(optional)</span></p>
          <p className="mt-0.5 font-body text-xs text-muted-foreground">Lets this partner sign in and see a read-only dashboard. Set a share % for each category they earn from — leave a category at 0 to exclude it.</p>
          <div className="mt-3">
            <label className="mb-1 block font-body text-xs font-medium text-foreground">Partner email</label>
            <input
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="partner@email.com"
              className="h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
              disabled={uploading || addingUrl}
            />
            <p className="mt-1 font-body text-[0.7rem] text-muted-foreground">They must sign up with this email first.</p>
          </div>
          <SharesGrid value={addShares} onChange={setAddShares} disabled={uploading || addingUrl} />
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
              disabled={uploading || (!selectedFile && !addEmail.trim())}
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
              disabled={addingUrl || (!logoUrl.trim() && !addEmail.trim())}
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
                            Partner Name <span className="text-muted-foreground font-normal">(Optional)</span>
                          </label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="e.g., Microsoft Partner"
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
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            placeholder="partner@email.com"
                            className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
                            disabled={editUploading}
                          />
                          <SharesGrid value={editShares} onChange={setEditShares} disabled={editUploading} />
                          <p className="mt-1.5 font-body text-[0.7rem] text-muted-foreground">Clear the email to revoke this partner's access to the finance dashboard.</p>
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
                        <span className="rounded-full bg-green-100 px-2 py-0.5 font-body text-[0.65rem] font-semibold text-green-700" title={partner.email}>
                          {partner.partnerUid ? "Financial access" : "Access pending sign-up"}
                        </span>
                      )}
                      {shareBadges(partner).map((label) => (
                        <span key={label} className="rounded-full bg-gold/15 px-2 py-0.5 font-body text-[0.65rem] font-semibold text-gold">{label}</span>
                      ))}
                    </div>
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
