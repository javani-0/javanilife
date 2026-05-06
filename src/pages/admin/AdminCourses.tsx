import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";
import { Plus, Pencil, Trash2, X, Star, LayoutGrid, List, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Course {
  id: string;
  title: string;
  category: string;
  badge: string;
  badgeColor: string;
  description: string;
  image: string;
  extra?: string;
  status: string;
  featured?: boolean;
}

const emptyForm = { title: "", category: "grades", badge: "Grades Course", badgeColor: "red", description: "", image: "", extra: "", status: "active" };

const badgeStyles: Record<string, string> = {
  red: "bg-primary text-primary-foreground",
  gold: "bg-gold text-gold-foreground",
  charcoal: "bg-charcoal text-charcoal-foreground",
};

const AdminCourses = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [imageUploading, setImageUploading] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "courses"), (snap) => {
      setCourses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Course)));
    });
    return unsub;
  }, []);

  const openAdd = () => { setForm(emptyForm); setEditing(null); setShowModal(true); };
  const openEdit = (c: Course) => {
    setForm({ title: c.title, category: c.category, badge: c.badge, badgeColor: c.badgeColor, description: c.description, image: c.image, extra: c.extra || "", status: c.status });
    setEditing(c.id);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.description) { toast({ title: "Title and description required", variant: "destructive" }); return; }
    try {
      if (editing) {
        await updateDoc(doc(db, "courses", editing), form);
        toast({ title: "Course updated" });
      } else {
        await addDoc(collection(db, "courses"), form);
        toast({ title: "Course added" });
      }
      setShowModal(false);
    } catch { toast({ title: "Error saving course", variant: "destructive" }); }
  };

  const deleteCourse = async (id: string) => {
    if (!confirm("Delete this course?")) return;
    await deleteDoc(doc(db, "courses", id));
    toast({ title: "Course deleted" });
  };

  const toggleFeatured = async (c: Course) => {
    await updateDoc(doc(db, "courses", c.id), { featured: !c.featured });
    toast({ title: c.featured ? "Removed from homepage" : "Added to homepage" });
  };

  const categoryBadgeMap: Record<string, { badge: string; badgeColor: string }> = {
    grades: { badge: "Grades Course", badgeColor: "red" },
    diploma: { badge: "Diploma Course", badgeColor: "gold" },
    "pre-grade": { badge: "Pre-Grade", badgeColor: "charcoal" },
    "masterclass-workshops": { badge: "Masterclass & Workshop", badgeColor: "gold" },
    yoga: { badge: "Yoga Course", badgeColor: "charcoal" },
    konnakol: { badge: "Konnakol Course", badgeColor: "red" },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-[1.3rem] text-foreground">All Courses ({courses.length})</h3>
        <div className="flex items-center gap-3">
          <div className="flex border border-border rounded-md overflow-hidden">
            <button onClick={() => setViewMode("grid")} className={`p-2.5 ${viewMode === "grid" ? "bg-gold text-gold-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}><LayoutGrid className="w-4 h-4" /></button>
            <button onClick={() => setViewMode("table")} className={`p-2.5 ${viewMode === "table" ? "bg-gold text-gold-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}><List className="w-4 h-4" /></button>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-gradient-primary text-primary-foreground font-body text-[0.85rem] font-medium hover:brightness-110">
            <Plus className="w-4 h-4" /> Add Course
          </button>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {courses.map((c) => (
            <div key={c.id} className="bg-card shadow-card rounded-lg overflow-hidden hover:shadow-hero transition-shadow">
              {c.image && (
                <div className="aspect-[3/2] overflow-hidden">
                  <img src={c.image} alt={c.title} className="w-full h-full object-cover" loading="lazy" />
                </div>
              )}
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <span className={`inline-block px-2.5 py-1 text-[0.7rem] font-body font-medium rounded-full ${badgeStyles[c.badgeColor] || badgeStyles.red}`}>{c.badge}</span>
                  <span className={`px-2 py-1 rounded-full font-body text-[0.7rem] ${c.status === "active" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{c.status}</span>
                </div>
                <h4 className="font-display font-semibold text-[1.1rem] text-foreground mb-1">{c.title}</h4>
                <p className="font-body text-[0.8rem] text-muted-foreground line-clamp-2 mb-3">{c.description}</p>
                {c.extra && <p className="font-body text-[0.75rem] text-gold mb-3">{c.extra}</p>}
                <div className="flex items-center justify-between pt-3 border-t border-border/50">
                  <button onClick={() => toggleFeatured(c)} className="flex items-center gap-1 p-1.5 rounded hover:bg-muted" title={c.featured ? "Remove from homepage" : "Show on homepage"}>
                    <Star className={`w-4 h-4 ${c.featured ? "fill-gold text-gold" : "text-muted-foreground"}`} />
                    <span className="font-body text-[0.7rem] text-muted-foreground">{c.featured ? "Featured" : "Feature"}</span>
                  </button>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-gold"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => deleteCourse(c.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card shadow-card rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-muted/50">
                  {["Course Name", "Category", "Homepage", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 font-body font-medium text-[0.75rem] text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-3 font-body text-[0.875rem] text-foreground font-medium">{c.title}</td>
                    <td className="px-4 py-3"><span className="px-2 py-1 rounded-full bg-muted font-body text-[0.75rem] capitalize">{c.category}</span></td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleFeatured(c)} className="p-1.5 rounded hover:bg-muted" title={c.featured ? "Remove from homepage" : "Show on homepage"}>
                        <Star className={`w-4 h-4 ${c.featured ? "fill-gold text-gold" : "text-muted-foreground"}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full font-body text-[0.75rem] ${c.status === "active" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-gold"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => deleteCourse(c.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative bg-card rounded-xl shadow-hero w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-[1.3rem]">{editing ? "Edit Course" : "Add New Course"}</h3>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Course Name *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold" />
              </div>
              <div>
                <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Category</label>
                <select value={form.category} onChange={(e) => { const cat = e.target.value; const mapped = categoryBadgeMap[cat] || categoryBadgeMap.grades; setForm({ ...form, category: cat, badge: mapped.badge, badgeColor: mapped.badgeColor }); }} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none">
                  <option value="grades">Grades</option>
                  <option value="diploma">Diploma</option>
                  <option value="pre-grade">Pre-Grade</option>
                  <option value="masterclass-workshops">Masterclass & Workshops</option>
                  <option value="yoga">Yoga</option>
                  <option value="konnakol">Konnakol</option>
                </select>
              </div>
              <div>
                <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Description *</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold" />
              </div>
              <div>
                <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Course Image</label>
                {form.image && <img src={form.image} alt="Preview" className="w-full h-32 object-cover rounded-md mb-2" />}
                <div className="flex gap-2">
                  <button type="button" onClick={() => imageRef.current?.click()} disabled={imageUploading} className="flex items-center gap-2 px-3 py-2 rounded-md border border-border font-body text-[0.85rem] hover:bg-muted disabled:opacity-50">
                    <Upload className="w-4 h-4" /> {imageUploading ? "Uploading..." : "Upload Image"}
                  </button>
                  <input ref={imageRef} type="file" accept="image/*" hidden onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setImageUploading(true);
                    const fd = new FormData();
                    fd.append("file", file);
                    fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
                    try {
                      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: fd });
                      const data = await res.json();
                      setForm({ ...form, image: data.secure_url });
                    } catch { toast({ title: "Upload failed", variant: "destructive" }); }
                    setImageUploading(false);
                  }} />
                </div>
                <input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} placeholder="Or paste image URL" className="w-full mt-2 px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
              </div>
              <div>
                <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Extra Info (e.g. Age range, Duration)</label>
                <input value={form.extra} onChange={(e) => setForm({ ...form, extra: e.target.value })} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold" />
              </div>
              <div>
                <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <button onClick={handleSave} className="w-full px-4 py-2.5 rounded-md bg-gradient-primary text-primary-foreground font-body text-[0.9rem] font-medium hover:brightness-110">
                {editing ? "Update Course" : "Add Course"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AdminCourses;
