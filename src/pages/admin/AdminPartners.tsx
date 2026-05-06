import { useState, useEffect, useRef } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";
import { Upload, Trash2, Edit2, Save, X, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

interface Partner {
  id: string;
  name: string;
  logoUrl: string;
  publicId: string;
  order: number;
  timestamp: any;
}

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid File", description: "Please select an image file", variant: "destructive" });
      return;
    }

    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const uploadPartner = async () => {
    if (!selectedFile) {
      toast({ title: "Missing Information", description: "Please select a logo image", variant: "destructive" });
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
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

      await addDoc(collection(db, "partners"), {
        name: partnerName.trim(),
        logoUrl: data.secure_url,
        publicId: data.public_id,
        order: partners.length,
        timestamp: serverTimestamp(),
      });

      setProgress(100);
      toast({ title: "Success", description: "Partner added successfully" });
      
      // Reset form
      setSelectedFile(null);
      setPreview("");
      setPartnerName("");
      if (fileRef.current) fileRef.current.value = "";
      
    } catch (err: any) {
      console.error("[Upload Error]", err);
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const addPartnerByUrl = async () => {
    if (!logoUrl.trim()) {
      toast({ title: "Missing Information", description: "Please provide a logo URL", variant: "destructive" });
      return;
    }

    setAddingUrl(true);
    try {
      await addDoc(collection(db, "partners"), {
        name: partnerName.trim(),
        logoUrl: logoUrl.trim(),
        publicId: "",
        order: partners.length,
        timestamp: serverTimestamp(),
      });

      toast({ title: "Success", description: "Partner added successfully" });
      setPartnerName("");
      setLogoUrl("");
      setUrlPreview("");
    } catch (err: any) {
      console.error("[URL Add Error]", err);
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setAddingUrl(false);
    }
  };

  const deletePartner = async (partner: Partner) => {
    if (!confirm(`Delete ${partner.name}?`)) return;

    try {
      // Delete from Cloudinary
      if (partner.publicId) {
        await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_id: partner.publicId }),
        });
      }

      await deleteDoc(doc(db, "partners", partner.id));
      toast({ title: "Deleted", description: `${partner.name} removed` });
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
  };

  const handleEditFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid File", description: "Please select an image file", variant: "destructive" });
      return;
    }

    setEditFile(file);
    setEditFilePreview(URL.createObjectURL(file));
  };

  const saveEdit = async (partnerId: string) => {
    const partner = partners.find(p => p.id === partnerId);
    if (!partner) return;

    setEditUploading(true);

    try {
      let newLogoUrl = partner.logoUrl;
      let newPublicId = partner.publicId;

      // Handle logo update if provided
      if (editFile) {
        // Upload new file to Cloudinary
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

        // Delete old Cloudinary image if it exists
        if (partner.publicId) {
          await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ public_id: partner.publicId }),
          });
        }
      } else if (editLogoUrl.trim()) {
        // Use URL instead
        newLogoUrl = editLogoUrl.trim();
        newPublicId = "";

        // Delete old Cloudinary image if switching from file to URL
        if (partner.publicId) {
          await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ public_id: partner.publicId }),
          });
        }
      }

      // Update Firestore
      await updateDoc(doc(db, "partners", partnerId), {
        name: editName.trim(),
        logoUrl: newLogoUrl,
        publicId: newPublicId,
      });

      toast({ title: "Updated", description: "Partner updated successfully" });
      setEditingId(null);
      setEditFile(null);
      setEditFilePreview("");
      setEditLogoUrl("");
      setEditUrlPreview("");
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
    if (editFileRef.current) editFileRef.current.value = "";
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-foreground mb-2">Partners Manager</h1>
        <p className="font-body text-sm text-muted-foreground">Manage partner logos displayed on the website</p>
      </div>

      {/* Upload Section */}
      <div className="bg-card border border-border rounded-lg p-6 mb-8 shadow-sm">
        <h2 className="font-display text-lg font-semibold text-foreground mb-4">Add New Partner</h2>

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
              disabled={uploading || !selectedFile}
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
              disabled={addingUrl || !logoUrl.trim()}
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
                    <img
                      src={partner.logoUrl}
                      alt={partner.name}
                      className="max-h-full max-w-full object-contain"
                    />
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
                            <img
                              src={partner.logoUrl}
                              alt={partner.name}
                              className="max-h-full max-w-full object-contain"
                            />
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
                    <p className="font-body text-sm font-medium text-foreground text-center mb-3">{partner.name}</p>
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
