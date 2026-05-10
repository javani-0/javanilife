import {
  DEFAULT_COURSE_CATEGORY_OPTIONS,
  DEFAULT_PRODUCT_CATEGORY_OPTIONS,
  type CourseCategoryOption,
  type ManagedCategoryOption,
} from "./types";

export const PRODUCT_CATEGORIES_SETTINGS_ID = "productCategories";
export const COURSE_CATEGORIES_SETTINGS_ID = "courseCategories";

const getRecord = (value: unknown): Record<string, unknown> => (
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
);

const getString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const getBoolean = (value: unknown, fallback = true) => (typeof value === "boolean" ? value : fallback);
const getNumber = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

export const slugifyCategoryId = (value: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `category-${Date.now()}`;
};

const sortCategories = <Category extends ManagedCategoryOption>(categories: Category[]) => (
  [...categories].sort((first, second) => {
    const orderDifference = getNumber(first.order, 0) - getNumber(second.order, 0);
    return orderDifference || first.label.localeCompare(second.label);
  })
);

export const normalizeProductCategoryOptions = (value: unknown): ManagedCategoryOption[] => {
  const rawItems = Array.isArray(getRecord(value).items) ? getRecord(value).items as unknown[] : Array.isArray(value) ? value : [];
  const normalized = rawItems
    .map((item, index) => {
      const record = getRecord(item);
      const label = getString(record.label).trim();
      const id = slugifyCategoryId(getString(record.id, label));
      if (!label || !id) return null;

      return {
        id,
        label,
        active: getBoolean(record.active, true),
        order: getNumber(record.order, index),
      } satisfies ManagedCategoryOption;
    })
    .filter((item): item is ManagedCategoryOption => item !== null);

  return sortCategories(normalized.length > 0 ? normalized : DEFAULT_PRODUCT_CATEGORY_OPTIONS);
};

const normalizeBadgeColor = (value: unknown): CourseCategoryOption["badgeColor"] => (
  value === "gold" || value === "charcoal" || value === "red" ? value : "red"
);

export const normalizeCourseCategoryOptions = (value: unknown): CourseCategoryOption[] => {
  const rawItems = Array.isArray(getRecord(value).items) ? getRecord(value).items as unknown[] : Array.isArray(value) ? value : [];
  const defaultsById = new Map(DEFAULT_COURSE_CATEGORY_OPTIONS.map((category) => [category.id, category]));
  const normalized = rawItems
    .map((item, index) => {
      const record = getRecord(item);
      const label = getString(record.label).trim();
      const id = slugifyCategoryId(getString(record.id, label));
      if (!label || !id) return null;

      const fallback = defaultsById.get(id);
      return {
        id,
        label,
        badge: getString(record.badge, fallback?.badge || `${label} Course`).trim() || `${label} Course`,
        badgeColor: normalizeBadgeColor(record.badgeColor || fallback?.badgeColor),
        detail: getString(record.detail, fallback?.detail || "Course enrollment").trim() || "Course enrollment",
        sectionLabel: getString(record.sectionLabel, fallback?.sectionLabel || label.toUpperCase()).trim() || label.toUpperCase(),
        description: getString(record.description, fallback?.description || `Explore ${label} courses at Javani Spiritual Hub.`).trim() || `Explore ${label} courses at Javani Spiritual Hub.`,
        active: getBoolean(record.active, true),
        order: getNumber(record.order, index),
      } satisfies CourseCategoryOption;
    })
    .filter((item): item is CourseCategoryOption => item !== null);

  return sortCategories(normalized.length > 0 ? normalized : DEFAULT_COURSE_CATEGORY_OPTIONS);
};

export const getCategoryLabel = (categories: ManagedCategoryOption[], categoryId: string, fallback = "Uncategorized") => (
  categories.find((category) => category.id === categoryId)?.label || fallback
);

export const getCourseCategory = (categories: CourseCategoryOption[], categoryId: string) => (
  categories.find((category) => category.id === categoryId)
);

export const getActiveCategories = <Category extends ManagedCategoryOption>(categories: Category[]) => (
  categories.filter((category) => category.active !== false)
);
