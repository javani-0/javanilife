import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { slugifyCategoryId, type CourseCategoryOption, type ManagedCategoryOption } from "@/lib/ecommerce";

type CategoryDraft = ManagedCategoryOption | CourseCategoryOption;

interface CategoryManagerProps<Category extends CategoryDraft> {
  title: string;
  description: string;
  categories: Category[];
  usageCounts: Record<string, number>;
  mode: "product" | "course";
  onSave: (categories: Category[]) => Promise<void>;
}

const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 font-body text-[0.82rem] outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20";
const labelClass = "font-body text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground";

const isCourseCategory = (category: CategoryDraft): category is CourseCategoryOption => (
  "badge" in category && "detail" in category
);

const createCourseDefaults = (label: string, order: number): CourseCategoryOption => ({
  id: slugifyCategoryId(label),
  label,
  badge: `${label} Course`,
  badgeColor: "gold",
  detail: "Course enrollment",
  sectionLabel: label.toUpperCase(),
  description: `Explore ${label} courses at Javani Spiritual Hub.`,
  active: true,
  order,
});

const createProductDefaults = (label: string, order: number): ManagedCategoryOption => ({
  id: slugifyCategoryId(label),
  label,
  active: true,
  order,
});

const CategoryManager = <Category extends CategoryDraft>({
  title,
  description,
  categories,
  usageCounts,
  mode,
  onSave,
}: CategoryManagerProps<Category>) => {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Category[]>(categories);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDrafts(categories);
  }, [categories]);

  const usedIds = useMemo(() => new Set(drafts.map((category) => category.id)), [drafts]);

  const updateDraft = (id: string, patch: Partial<Category>) => {
    setDrafts((currentDrafts) => currentDrafts.map((category) => (
      category.id === id ? { ...category, ...patch } : category
    )));
  };

  const addCategory = () => {
    const label = newLabel.trim();
    if (!label) return;

    let id = slugifyCategoryId(label);
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${slugifyCategoryId(label)}-${suffix}`;
      suffix += 1;
    }

    const order = drafts.length;
    const nextCategory = mode === "course"
      ? { ...createCourseDefaults(label, order), id }
      : { ...createProductDefaults(label, order), id };

    setDrafts((currentDrafts) => [...currentDrafts, nextCategory as Category]);
    setNewLabel("");
  };

  const removeCategory = (category: Category) => {
    const usageCount = usageCounts[category.id] || 0;
    if (usageCount > 0) {
      toast({
        title: "Category is in use",
        description: `${usageCount} ${mode === "course" ? "course" : "product"}${usageCount === 1 ? "" : "s"} still use ${category.label}. Reassign them before deleting this category.`,
        variant: "destructive",
      });
      return;
    }

    setDrafts((currentDrafts) => currentDrafts.filter((item) => item.id !== category.id));
  };

  const saveCategories = async () => {
    const cleanDrafts = drafts
      .map((category, index) => ({
        ...category,
        label: category.label.trim(),
        order: index,
        active: category.active !== false,
      }))
      .filter((category) => category.label);

    if (cleanDrafts.length === 0) {
      toast({ title: "Add at least one category", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      await onSave(cleanDrafts as Category[]);
      toast({ title: "Categories saved", description: `${title} updated.` });
    } catch (error) {
      console.error("Unable to save categories", error);
      toast({ title: "Unable to save categories", description: "Check admin permissions and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-gold/15 bg-card p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold">Categories</p>
          <h2 className="mt-1 font-display text-2xl text-foreground">{title}</h2>
          <p className="mt-1 max-w-2xl font-body text-sm text-muted-foreground">{description}</p>
        </div>
        <button type="button" onClick={saveCategories} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-md bg-gold px-4 py-2.5 font-body text-sm font-semibold text-charcoal transition-colors hover:bg-gold-light disabled:opacity-60">
          <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Categories"}
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {drafts.map((category) => (
          <div key={category.id} className="rounded-lg border border-border bg-background/70 p-4">
            <div className={`grid gap-3 ${mode === "course" ? "lg:grid-cols-[1fr_1fr_150px_110px_auto]" : "lg:grid-cols-[1fr_170px_110px_auto]"}`}>
              <label>
                <span className={labelClass}>Name</span>
                <input value={category.label} onChange={(event) => updateDraft(category.id, { label: event.target.value } as Partial<Category>)} className={`${inputClass} mt-1`} />
              </label>

              {isCourseCategory(category) && (
                <>
                  <label>
                    <span className={labelClass}>Badge</span>
                    <input value={category.badge} onChange={(event) => updateDraft(category.id, { badge: event.target.value } as Partial<Category>)} className={`${inputClass} mt-1`} />
                  </label>
                  <label>
                    <span className={labelClass}>Detail</span>
                    <input value={category.detail} onChange={(event) => updateDraft(category.id, { detail: event.target.value } as Partial<Category>)} className={`${inputClass} mt-1`} />
                  </label>
                  <label>
                    <span className={labelClass}>Color</span>
                    <select value={category.badgeColor} onChange={(event) => updateDraft(category.id, { badgeColor: event.target.value } as Partial<Category>)} className={`${inputClass} mt-1`}>
                      <option value="red">Red</option>
                      <option value="gold">Gold</option>
                      <option value="charcoal">Charcoal</option>
                    </select>
                  </label>
                </>
              )}

              {!isCourseCategory(category) && (
                <div>
                  <span className={labelClass}>Slug</span>
                  <p className="mt-1 rounded-md border border-border bg-muted px-3 py-2 font-body text-[0.82rem] text-muted-foreground">{category.id}</p>
                </div>
              )}

              <label className="flex items-end gap-2 pb-2 font-body text-sm font-semibold text-foreground">
                <input type="checkbox" checked={category.active !== false} onChange={(event) => updateDraft(category.id, { active: event.target.checked } as Partial<Category>)} />
                Active
              </label>

              <button type="button" onClick={() => removeCategory(category)} className="self-end rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${category.label}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {isCourseCategory(category) && (
              <div className="mt-3 grid gap-3 lg:grid-cols-[220px_1fr]">
                <label>
                  <span className={labelClass}>Section Label</span>
                  <input value={category.sectionLabel} onChange={(event) => updateDraft(category.id, { sectionLabel: event.target.value } as Partial<Category>)} className={`${inputClass} mt-1`} />
                </label>
                <label>
                  <span className={labelClass}>Section Description</span>
                  <input value={category.description} onChange={(event) => updateDraft(category.id, { description: event.target.value } as Partial<Category>)} className={`${inputClass} mt-1`} />
                </label>
              </div>
            )}

            <p className="mt-2 font-body text-[0.72rem] text-muted-foreground">
              {usageCounts[category.id] || 0} {mode === "course" ? "courses" : "products"} using this category
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCategory(); } }} placeholder={`New ${mode} category name`} className={inputClass} />
        <button type="button" onClick={addCategory} className="inline-flex items-center justify-center gap-2 rounded-md border border-gold px-4 py-2.5 font-body text-sm font-semibold text-gold transition-colors hover:bg-gold hover:text-white">
          <Plus className="h-4 w-4" /> Add Category
        </button>
      </div>
    </section>
  );
};

export default CategoryManager;
