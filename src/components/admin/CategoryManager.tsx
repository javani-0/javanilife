import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Save, Trash2 } from "lucide-react";
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

      <div className="mt-5 space-y-2">
        {drafts.map((category) => {
          const isActive = category.active !== false;
          const isExpanded = expanded.has(category.id);
          const usageCount = usageCounts[category.id] || 0;
          const hasCourseFields = isCourseCategory(category);
          return (
            <div key={category.id} className="rounded-lg border border-border bg-background/70 overflow-hidden">
              {/* Always-visible row */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Name input */}
                <div className="flex-1 min-w-0">
                  <input
                    value={category.label}
                    onChange={(event) => updateDraft(category.id, { label: event.target.value } as Partial<Category>)}
                    className="w-full bg-transparent font-body text-[0.875rem] font-medium text-foreground outline-none border-b border-transparent focus:border-gold transition-colors placeholder:text-muted-foreground"
                    placeholder="Category name"
                  />
                  <p className="mt-0.5 font-body text-[0.7rem] text-muted-foreground">
                    {usageCount} {mode === "course" ? "course" : "product"}{usageCount !== 1 ? "s" : ""}
                    {!hasCourseFields && <span className="ml-1.5 opacity-60">· {category.id}</span>}
                  </p>
                </div>

                {/* Toggle switch */}
                <label className="flex items-center gap-1.5 cursor-pointer shrink-0" title={isActive ? "Active — click to hide" : "Hidden — click to activate"}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isActive}
                    onChange={(event) => updateDraft(category.id, { active: event.target.checked } as Partial<Category>)}
                  />
                  <div className={`relative w-8 h-[18px] rounded-full border transition-colors ${isActive ? "bg-green-500 border-green-500" : "bg-muted border-border"}`}>
                    <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform ${isActive ? "translate-x-[14px]" : "translate-x-[2px]"}`} />
                  </div>
                  <span className={`font-body text-[0.72rem] w-9 ${isActive ? "text-green-600" : "text-muted-foreground"}`}>
                    {isActive ? "Active" : "Hidden"}
                  </span>
                </label>

                {/* Expand button (course categories only) */}
                {hasCourseFields && (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(category.id)}
                    className={`shrink-0 p-1.5 rounded-md transition-colors ${
                      isExpanded ? "text-gold bg-gold/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                    aria-label={isExpanded ? "Collapse settings" : "Edit badge & section settings"}
                    title={isExpanded ? "Collapse" : "Badge & section settings"}
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                )}

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => removeCategory(category)}
                  className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label={`Delete ${category.label}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Expandable detail fields (course only) */}
              {hasCourseFields && isExpanded && (
                <div className="border-t border-border/50 bg-muted/30 px-4 py-4 space-y-3">
                  <p className={`${labelClass} mb-2`}>Badge &amp; Display</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label>
                      <span className={labelClass}>Badge Text</span>
                      <input value={(category as CourseCategoryOption).badge} onChange={(event) => updateDraft(category.id, { badge: event.target.value } as Partial<Category>)} className={`${inputClass} mt-1`} />
                    </label>
                    <label>
                      <span className={labelClass}>Badge Color</span>
                      <select value={(category as CourseCategoryOption).badgeColor} onChange={(event) => updateDraft(category.id, { badgeColor: event.target.value } as Partial<Category>)} className={`${inputClass} mt-1`}>
                        <option value="red">Red</option>
                        <option value="gold">Gold</option>
                        <option value="charcoal">Charcoal</option>
                      </select>
                    </label>
                    <label>
                      <span className={labelClass}>Detail</span>
                      <input value={(category as CourseCategoryOption).detail} onChange={(event) => updateDraft(category.id, { detail: event.target.value } as Partial<Category>)} className={`${inputClass} mt-1`} />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                    <label>
                      <span className={labelClass}>Section Label</span>
                      <input value={(category as CourseCategoryOption).sectionLabel} onChange={(event) => updateDraft(category.id, { sectionLabel: event.target.value } as Partial<Category>)} className={`${inputClass} mt-1`} />
                    </label>
                    <label>
                      <span className={labelClass}>Section Description</span>
                      <input value={(category as CourseCategoryOption).description} onChange={(event) => updateDraft(category.id, { description: event.target.value } as Partial<Category>)} className={`${inputClass} mt-1`} />
                    </label>
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
