import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";
import { openSquareCropper } from "@/components/SquareImageCropper";
import CategoryManager from "@/components/admin/CategoryManager";
import { Plus, Pencil, Trash2, X, Star, LayoutGrid, List, Upload, BadgeIndianRupee } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { confirmDialog } from "@/components/ConfirmDialogHost";
import { useCourseCategories } from "@/hooks/useManagedCategories";
import {
  COURSE_CATEGORIES_SETTINGS_ID,
  formatPaiseAsRupees,
  getActiveCategories,
  getCourseAmountInPaise,
  getCourseCategory,
  getCourseDisplayPrice,
  normalizeCourse,
  parsePriceToPaise,
  type Course,
  type CourseCategoryOption,
} from "@/lib/ecommerce";

interface CourseFormState {
  title: string;
  category: string;
  badge: string;
  badgeColor: CourseCategoryOption["badgeColor"];
  description: string;
  image: string;
  extra: string;
  status: string;
  featured: boolean;
  priceRupees: string;
  purchasable: boolean;
}

const defaultCourseForm: CourseFormState = {
  title: "",
  category: "grades",
  badge: "Grades Course",
  badgeColor: "red",
  description: "",
  image: "",
  extra: "",
  status: "active",
  featured: false,
  priceRupees: "",
  purchasable: true,
};

const badgeStyles: Record<string, string> = {
  red: "bg-primary text-primary-foreground",
  gold: "bg-gold text-gold-foreground",
  charcoal: "bg-charcoal text-charcoal-foreground",
};

const inputClass = "w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background";
const labelClass = "font-body text-[0.85rem] text-muted-foreground block mb-1";

const createEmptyCourseForm = (categories: CourseCategoryOption[]): CourseFormState => {
  const firstCategory = getActiveCategories(categories)[0] || categories[0];
  if (!firstCategory) return defaultCourseForm;

  return {
    ...defaultCourseForm,
    category: firstCategory.id,
    badge: firstCategory.badge,
    badgeColor: firstCategory.badgeColor,
  };
};

const getPriceInputFromCourse = (course: Course) => {
  const amountInPaise = getCourseAmountInPaise(course);
  return amountInPaise > 0 ? String(amountInPaise / 100) : "";
};

const AdminCourses = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<CourseFormState>(defaultCourseForm);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [imageUploading, setImageUploading] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { categories: courseCategories } = useCourseCategories();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "courses"), (snap) => {
      setCourses(snap.docs.map((d) => normalizeCourse(d.id, d.data(), courseCategories)));
    });
    return unsub;
  }, [courseCategories]);

  const activeCourseCategories = useMemo(() => getActiveCategories(courseCategories), [courseCategories]);
  const courseCategoryUsage = useMemo(() => courses.reduce<Record<string, number>>((usage, course) => {
    usage[course.category] = (usage[course.category] || 0) + 1;
    return usage;
  }, {}), [courses]);
  const categoryOptionsForForm = useMemo(() => {
    if (activeCourseCategories.some((category) => category.id === form.category)) return activeCourseCategories;
    const currentCategory = courseCategories.find((category) => category.id === form.category);
    return currentCategory ? [...activeCourseCategories, currentCategory] : activeCourseCategories;
  }, [activeCourseCategories, courseCategories, form.category]);
  const pricePreviewInPaise = parsePriceToPaise(form.priceRupees);
  const pricePreview = pricePreviewInPaise ? formatPaiseAsRupees(pricePreviewInPaise, { includeSuffix: true }) : "Enter fee";

  const openAdd = () => { setForm(createEmptyCourseForm(courseCategories)); setEditing(null); setShowModal(true); };
  const openEdit = (course: Course) => {
    const category = getCourseCategory(courseCategories, course.category);
    setForm({
      title: course.title,
      category: course.category,
      badge: course.badge || category?.badge || "Course",
      badgeColor: (course.badgeColor === "gold" || course.badgeColor === "charcoal" || course.badgeColor === "red" ? course.badgeColor : category?.badgeColor || "red"),
      description: course.description,
      image: course.image,
      extra: course.extra || "",
      status: course.status,
      featured: course.featured === true,
      priceRupees: getPriceInputFromCourse(course),
      purchasable: course.purchasable !== false,
    });
    setEditing(course.id);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setForm(createEmptyCourseForm(courseCategories));
  };

  const saveCourseCategories = async (categories: CourseCategoryOption[]) => {
    await setDoc(doc(db, "siteSettings", COURSE_CATEGORIES_SETTINGS_ID), {
      items: categories,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  };

  const handleSave = async () => {
    const amountInPaise = parsePriceToPaise(form.priceRupees) || 0;
    if (!form.title.trim() || !form.description.trim()) {
      toast({ title: "Title and description required", variant: "destructive" });
      return;
    }
    if (form.purchasable && amountInPaise <= 0) {
      toast({ title: "Course fee required", description: "Enter a valid fee or turn off payment for this course.", variant: "destructive" });
      return;
    }

    const category = getCourseCategory(courseCategories, form.category);
    const displayPrice = amountInPaise > 0 ? formatPaiseAsRupees(amountInPaise, { includeSuffix: true }) : "";
    const payload = {
      title: form.title.trim(),
      category: form.category,
      categoryLabel: category?.label || form.category,
      badge: form.badge.trim() || category?.badge || "Course",
      badgeColor: form.badgeColor,
      description: form.description.trim(),
      image: form.image.trim(),
      extra: form.extra.trim(),
      status: form.status,
      featured: form.featured,
      amountInPaise,
      displayPrice,
      price: displayPrice,
      purchasable: form.purchasable,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editing) {
        await updateDoc(doc(db, "courses", editing), payload);
        toast({ title: "Course updated" });
      } else {
        await addDoc(collection(db, "courses"), { ...payload, createdAt: serverTimestamp() });
        toast({ title: "Course added" });
      }
      closeModal();
    } catch (error) {
      console.error("Error saving course", error);
      toast({ title: "Error saving course", variant: "destructive" });
    }
  };

  const deleteCourse = async (id: string) => {
    if (!(await confirmDialog({ title: "Delete this course?", description: "The course is removed from the site. This can't be undone.", confirmText: "Delete course", destructive: true }))) return;
    await deleteDoc(doc(db, "courses", id));
    toast({ title: "Course deleted" });
  };

  const toggleFeatured = async (course: Course) => {
    await updateDoc(doc(db, "courses", course.id), { featured: !course.featured, updatedAt: serverTimestamp() });
    toast({ title: course.featured ? "Removed from homepage" : "Added to homepage" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">Learning</p>
          <h1 className="mt-2 font-display text-3xl text-foreground">Courses Manager</h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">Manage course cards, categories, pricing, and payment availability.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex border border-border rounded-md overflow-hidden">
            <button onClick={() => setViewMode("grid")} className={`p-2.5 ${viewMode === "grid" ? "bg-gold text-gold-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`} aria-label="Grid view"><LayoutGrid className="w-4 h-4" /></button>
            <button onClick={() => setViewMode("table")} className={`p-2.5 ${viewMode === "table" ? "bg-gold text-gold-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`} aria-label="Table view"><List className="w-4 h-4" /></button>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-gradient-primary text-primary-foreground font-body text-[0.85rem] font-medium hover:brightness-110">
            <Plus className="w-4 h-4" /> Add Course
          </button>
        </div>
      </div>

      <CategoryManager
        title="Course Categories"
        description="Add, rename, hide, or delete course categories. Course category details drive public filters, badges, and section descriptions."
        categories={courseCategories}
        usageCounts={courseCategoryUsage}
        mode="course"
        onSave={saveCourseCategories}
      />

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {courses.map((course) => (
            <div key={course.id} className="bg-card shadow-card rounded-lg overflow-hidden hover:shadow-hero transition-shadow">
              {course.image && (
                <div className="aspect-square overflow-hidden">
                  <img src={course.image} alt={course.title} className="w-full h-full object-cover" loading="lazy" />
                </div>
              )}
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <span className={`inline-block px-2.5 py-1 text-[0.7rem] font-body font-medium rounded-full ${badgeStyles[course.badgeColor] || badgeStyles.red}`}>{course.badge}</span>
                  <span className={`px-2 py-1 rounded-full font-body text-[0.7rem] ${course.status === "active" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{course.status}</span>
                </div>
                <h4 className="font-display font-semibold text-[1.1rem] text-foreground mb-1">{course.title}</h4>
                <p className="font-body text-[0.8rem] text-muted-foreground line-clamp-2 mb-3">{course.description}</p>
                {course.extra && <p className="font-body text-[0.75rem] text-gold mb-3">{course.extra}</p>}
                <p className="font-display text-[1.1rem] font-bold text-primary mb-3">{getCourseDisplayPrice(course)}</p>
                <div className="flex items-center justify-between pt-3 border-t border-border/50">
                  <button onClick={() => toggleFeatured(course)} className="flex items-center gap-1 p-1.5 rounded hover:bg-muted" title={course.featured ? "Remove from homepage" : "Show on homepage"}>
                    <Star className={`w-4 h-4 ${course.featured ? "fill-gold text-gold" : "text-muted-foreground"}`} />
                    <span className="font-body text-[0.7rem] text-muted-foreground">{course.featured ? "Featured" : "Feature"}</span>
                  </button>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(course)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-gold" aria-label={`Edit ${course.title}`}><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => deleteCourse(course.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label={`Delete ${course.title}`}><Trash2 className="w-4 h-4" /></button>
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
                  {["Course Name", "Category", "Fee", "Homepage", "Status", "Actions"].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-body font-medium text-[0.75rem] text-muted-foreground uppercase tracking-wider">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr key={course.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-3 font-body text-[0.875rem] text-foreground font-medium">{course.title}</td>
                    <td className="px-4 py-3"><span className="px-2 py-1 rounded-full bg-muted font-body text-[0.75rem]">{course.categoryLabel || course.category}</span></td>
                    <td className="px-4 py-3 font-display text-[1rem] font-bold text-primary">{getCourseDisplayPrice(course)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleFeatured(course)} className="p-1.5 rounded hover:bg-muted" title={course.featured ? "Remove from homepage" : "Show on homepage"}>
                        <Star className={`w-4 h-4 ${course.featured ? "fill-gold text-gold" : "text-muted-foreground"}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full font-body text-[0.75rem] ${course.status === "active" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{course.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(course)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-gold" aria-label={`Edit ${course.title}`}><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => deleteCourse(course.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label={`Delete ${course.title}`}><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto p-4">
          <div className="fixed inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative bg-card rounded-xl shadow-hero w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold">Course Setup</p>
                <h3 className="font-display font-semibold text-[1.3rem]">{editing ? "Edit Course" : "Add New Course"}</h3>
              </div>
              <button onClick={closeModal} aria-label="Close course form"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>Course Name *</label>
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Category</label>
                <select value={form.category} onChange={(event) => {
                  const categoryId = event.target.value;
                  const category = getCourseCategory(courseCategories, categoryId);
                  setForm({
                    ...form,
                    category: categoryId,
                    badge: category?.badge || form.badge,
                    badgeColor: category?.badgeColor || form.badgeColor,
                  });
                }} className={inputClass}>
                  {categoryOptionsForForm.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className={inputClass}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Badge</label>
                <input value={form.badge} onChange={(event) => setForm({ ...form, badge: event.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Badge Color</label>
                <select value={form.badgeColor} onChange={(event) => setForm({ ...form, badgeColor: event.target.value as CourseCategoryOption["badgeColor"] })} className={inputClass}>
                  <option value="red">Red</option>
                  <option value="gold">Gold</option>
                  <option value="charcoal">Charcoal</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Course Fee</label>
                <div className="relative">
                  <BadgeIndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={form.priceRupees} onChange={(event) => setForm({ ...form, priceRupees: event.target.value })} className={`${inputClass} pl-10`} inputMode="decimal" placeholder="1200" />
                </div>
                <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">Preview: <span className="font-semibold text-gold">{pricePreview}</span></p>
              </div>
              <label className="flex items-end gap-2 pb-2 font-body text-sm font-semibold text-foreground">
                <input type="checkbox" checked={form.purchasable} onChange={(event) => setForm({ ...form, purchasable: event.target.checked })} />
                Enable online purchase
              </label>
              <label className="flex items-end gap-2 pb-2 font-body text-sm font-semibold text-foreground">
                <input type="checkbox" checked={form.featured} onChange={(event) => setForm({ ...form, featured: event.target.checked })} />
                Featured on homepage
              </label>
              <div className="sm:col-span-2">
                <label className={labelClass}>Description *</label>
                <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={6} className={`${inputClass} resize-y leading-relaxed`} placeholder={"One point per line, e.g.\n- Improve body alignment\n- Intensive practice\n- Rhythm & laya control"} />
                <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">Tip: put each point on its own line — line breaks are preserved on the course page.</p>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Course Image</label>
                {form.image && <img src={form.image} alt="Preview" className="aspect-square w-full max-w-xs object-cover rounded-md mb-2" />}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => imageRef.current?.click()} disabled={imageUploading} className="flex items-center gap-2 px-3 py-2 rounded-md border border-border font-body text-[0.85rem] hover:bg-muted disabled:opacity-50">
                    <Upload className="w-4 h-4" /> {imageUploading ? "Uploading..." : "Upload Image"}
                  </button>
                  <input ref={imageRef} type="file" accept="image/*" hidden onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    // Enforce 1:1 — crop to square before uploading.
                    const square = await openSquareCropper(file);
                    if (!square) return;
                    setImageUploading(true);
                    const formData = new FormData();
                    formData.append("file", square);
                    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
                    try {
                      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
                      const data = await response.json();
                      if (!data.secure_url) throw new Error("No URL returned");
                      setForm((currentForm) => ({ ...currentForm, image: data.secure_url }));
                    } catch (error) {
                      console.error("Course image upload failed", error);
                      toast({ title: "Upload failed", variant: "destructive" });
                    } finally {
                      setImageUploading(false);
                      if (imageRef.current) imageRef.current.value = "";
                    }
                  }} />
                </div>
                <input value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} placeholder="Or paste image URL" className={`${inputClass} mt-2`} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Extra Info (e.g. Age range, Duration)</label>
                <input value={form.extra} onChange={(event) => setForm({ ...form, extra: event.target.value })} className={inputClass} />
              </div>
              <div className="sm:col-span-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={closeModal} className="rounded-md border border-border px-5 py-2.5 font-body text-sm font-semibold text-muted-foreground hover:bg-muted">Cancel</button>
                <button type="button" onClick={handleSave} className="rounded-md bg-gradient-primary px-5 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110">
                  {editing ? "Update Course" : "Add Course"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AdminCourses;
