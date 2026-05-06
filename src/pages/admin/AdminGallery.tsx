import { useState, useEffect, useRef } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";
import { Upload, Trash2, Image as ImageIcon, AlertTriangle, Link as LinkIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

interface GalleryItem {
  id: string;
  url: string;
  publicId: string;
  category: string;
  timestamp: any;
}

const categories = ["Performances", "Workshops", "Certifications", "Behind the Scenes", "Recitals"];

const AdminGallery = () => {
  const [images, setImages] = useState<GalleryItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState("Performances");
  const [previewFiles, setPreviewFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [imageUrl, setImageUrl] = useState("");
  const [urlCategory, setUrlCategory] = useState("Performances");
  const [addingUrl, setAddingUrl] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "gallery"),
      (snap) => {
        setImages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as GalleryItem)));
      },
      (err) => {
        console.error("[Firestore Gallery Error]", err);
        setLastError(`Firestore error: ${err.message}`);
      }
    );
    return unsub;
  }, []);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setPreviewFiles(arr);
    setPreviews(arr.map((f) => URL.createObjectURL(f)));
  };

  const uploadAll = async () => {
    if (previewFiles.length === 0) return;
    setUploading(true);
    setProgress(0);
    setLastError(null);
    let successCount = 0;

    for (let i = 0; i < previewFiles.length; i++) {
      const formData = new FormData();
      formData.append("file", previewFiles[i]);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

      try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        console.log("[Cloudinary response]", data);

        if (!data.secure_url) {
          const errMsg = data.error?.message || "No secure_url returned. Check that the upload preset is set to UNSIGNED in Cloudinary dashboard.";
          console.error("[Cloudinary error]", errMsg, data);
          toast({ title: `Upload failed: ${previewFiles[i].name}`, description: errMsg, variant: "destructive" });
          continue;
        }

        console.log("[Saving to Firestore] URL:", data.secure_url);
        await addDoc(collection(db, "gallery"), {
          url: data.secure_url,
          publicId: data.public_id,
          category: selectedCategory,
          timestamp: serverTimestamp(),
        });
        successCount++;
      } catch (err: any) {
        const msg = err?.message || "Unknown error";
        console.error("[Upload catch]", msg);
        setLastError(msg);
        toast({ title: `Failed to upload ${previewFiles[i].name}`, description: msg, variant: "destructive" });
      }
      setProgress(((i + 1) / previewFiles.length) * 100);
    }

    setPreviewFiles([]);
    setPreviews([]);
    setUploading(false);
    if (successCount > 0) {
      toast({ title: `✓ ${successCount} image${successCount !== 1 ? "s" : ""} uploaded successfully!` });
    } else {
      toast({ title: "No images were uploaded", description: "Check the error messages above", variant: "destructive" });
    }
  };

  const deleteImage = async (item: GalleryItem) => {
    if (!confirm("Remove this image from gallery?")) return;
    await deleteDoc(doc(db, "gallery", item.id));
    toast({ title: "Image removed from gallery" });
  };

  const handleImageError = (id: string) => {
    setBrokenImages((prev) => new Set(prev).add(id));
  };

  const normalizeUrl = (raw: string): string => {
    // Convert Google Drive share links to direct image URLs
    const driveMatch = raw.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (driveMatch) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
    return raw;
  };

  const addByUrl = async () => {
    const trimmed = normalizeUrl(imageUrl.trim());
    if (!trimmed) return;
    try {
      new URL(trimmed);
    } catch {
      toast({ title: "Please enter a valid URL", variant: "destructive" });
      return;
    }
    setAddingUrl(true);
    try {
      await addDoc(collection(db, "gallery"), {
        url: trimmed,
        publicId: "",
        category: urlCategory,
        timestamp: serverTimestamp(),
      });
      setImageUrl("");
      toast({ title: "Image added from URL!" });
    } catch (err: any) {
      toast({ title: "Failed to add image", description: err?.message || "Check Firestore rules — write may be blocked", variant: "destructive" });
    }
    setAddingUrl(false);
  };

  return (
    <div className="space-y-8">
      {lastError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-body font-medium text-destructive text-[0.875rem]">Upload Error</p>
            <p className="font-body text-[0.8rem] text-destructive/80 mt-0.5 break-all">{lastError}</p>
          </div>
          <button onClick={() => setLastError(null)} className="ml-auto text-destructive/60 hover:text-destructive text-lg leading-none">&times;</button>
        </div>
      )}
      {/* Upload Section */}
      <div className="bg-card shadow-card rounded-lg p-4 sm:p-6">
        <h3 className="font-display font-semibold text-[1.3rem] text-foreground mb-4">Upload Images</h3>
        <div className="grid md:grid-cols-[1fr_auto] gap-4 items-end mb-4">
          <div
            className="border-2 border-dashed border-gold/30 rounded-lg p-6 sm:p-8 text-center cursor-pointer hover:border-gold/60 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFiles(e.dataTransfer.files); }}
          >
            <Upload className="w-8 h-8 text-gold mx-auto mb-2" />
            <p className="font-body text-[0.9rem] text-muted-foreground">Drag & drop images or click to browse</p>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
          </div>
          <div className="space-y-3">
            <div>
              <label className="font-body text-[0.8rem] text-muted-foreground block mb-1">Category</label>
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="px-3 py-2 rounded-md border border-border bg-card font-body text-[0.85rem] outline-none w-full">
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button onClick={uploadAll} disabled={uploading || previewFiles.length === 0} className="w-full px-4 py-2.5 rounded-md bg-gradient-primary text-primary-foreground font-body text-[0.85rem] font-medium disabled:opacity-50 hover:brightness-110 transition-all">
              {uploading ? "Uploading..." : `Upload ${previewFiles.length} Image${previewFiles.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>

        {uploading && <Progress value={progress} className="h-2" />}

        {previews.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-4">
            {previews.map((p, i) => (
              <img key={i} src={p} alt="" className="w-20 h-20 object-cover rounded-md border border-border" />
            ))}
          </div>
        )}
      </div>

      {/* Add by URL Section */}
      <div className="bg-card shadow-card rounded-lg p-4 sm:p-6">
        <h3 className="font-display font-semibold text-[1.3rem] text-foreground mb-4 flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-gold" /> Add Image by URL
        </h3>
        <div className="grid md:grid-cols-[1fr_auto_auto] gap-3 items-end">
          <div>
            <label className="font-body text-[0.8rem] text-muted-foreground block mb-1">Image URL</label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full px-3 py-2 rounded-md border border-border bg-card font-body text-[0.85rem] outline-none focus:border-gold transition-colors"
            />
            <p className="font-body text-[0.75rem] text-muted-foreground mt-1">Google Drive share links are auto-converted.</p>
          </div>
          <div>
            <label className="font-body text-[0.8rem] text-muted-foreground block mb-1">Category</label>
            <select value={urlCategory} onChange={(e) => setUrlCategory(e.target.value)} className="px-3 py-2 rounded-md border border-border bg-card font-body text-[0.85rem] outline-none w-full">
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={addByUrl} disabled={addingUrl || !imageUrl.trim()} className="px-4 py-2.5 rounded-md bg-gradient-primary text-primary-foreground font-body text-[0.85rem] font-medium disabled:opacity-50 hover:brightness-110 transition-all whitespace-nowrap">
            {addingUrl ? "Adding..." : "Add Image"}
          </button>
        </div>
      </div>

      {/* Gallery Grid */}
      <div>
        <h3 className="font-display font-semibold text-[1.3rem] text-foreground mb-4">
          Gallery ({images.length} images)
        </h3>
        {images.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-lg shadow-card">
            <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-body text-muted-foreground">No gallery images yet. Upload some above!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {images.map((item) => (
              <div key={item.id} className="relative group rounded-lg overflow-hidden bg-muted aspect-[4/3]">
                {brokenImages.has(item.id) ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-2">
                    <AlertTriangle className="w-8 h-8 mb-2" />
                    <p className="font-body text-[0.75rem] text-center">Image unavailable</p>
                    <p className="font-body text-[0.6rem] text-center break-all mt-1 opacity-60">{item.url || "No URL"}</p>
                  </div>
                ) : (
                  <img
                    src={item.url}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={() => handleImageError(item.id)}
                  />
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-300 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100">
                  <span className="absolute top-2 left-2 px-2 py-1 rounded-full bg-gold/80 text-white text-[0.7rem] font-body">{item.category}</span>
                  <button onClick={() => deleteImage(item)} className="p-2 rounded-full bg-destructive text-white hover:bg-destructive/80">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminGallery;
