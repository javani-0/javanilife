import { formatPaiseAsRupees, parsePriceToPaise } from "./pricing";
import { getCategoryLabel } from "./categories";
import { DEFAULT_COURSE_CATEGORY_OPTIONS, type CartItem, type CourseCategoryOption } from "./types";

export interface Course {
  id: string;
  image: string;
  title: string;
  badge: string;
  badgeColor: "red" | "gold" | "charcoal" | string;
  description: string;
  category: string;
  categoryLabel?: string;
  extra?: string;
  status: string;
  featured?: boolean;
  amountInPaise?: number;
  displayPrice?: string;
  price?: string;
  purchasable?: boolean;
}

export const getCourseAmountInPaise = (course: Pick<Course, "amountInPaise" | "displayPrice" | "price">): number => {
  if (typeof course.amountInPaise === "number" && Number.isFinite(course.amountInPaise)) {
    return Math.max(0, Math.round(course.amountInPaise));
  }

  return parsePriceToPaise(course.displayPrice || course.price) || 0;
};

export const getCourseDisplayPrice = (course: Pick<Course, "amountInPaise" | "displayPrice" | "price">): string => {
  if (course.displayPrice) return course.displayPrice;
  if (course.price) return course.price.includes("₹") ? course.price : `₹${course.price}`;
  const amountInPaise = getCourseAmountInPaise(course);
  return amountInPaise > 0 ? formatPaiseAsRupees(amountInPaise, { includeSuffix: true }) : "Fee to be updated";
};

export const isCoursePurchasable = (course: Pick<Course, "status" | "purchasable" | "amountInPaise" | "price" | "displayPrice">): boolean => (
  course.status !== "inactive" && course.purchasable !== false && getCourseAmountInPaise(course) > 0
);

export const normalizeCourse = (id: string, data: Partial<Course>, categories: CourseCategoryOption[] = DEFAULT_COURSE_CATEGORY_OPTIONS): Course => {
  const category = typeof data.category === "string" && data.category.trim() ? data.category : categories[0]?.id || "grades";
  const categoryOption = categories.find((item) => item.id === category);
  const amountInPaise = getCourseAmountInPaise(data);

  return {
    id,
    image: data.image || "",
    title: data.title || "Untitled Course",
    badge: data.badge || categoryOption?.badge || "Course",
    badgeColor: data.badgeColor || categoryOption?.badgeColor || "red",
    description: data.description || "",
    category,
    categoryLabel: data.categoryLabel || getCategoryLabel(categories, category, categoryOption?.label || category),
    extra: data.extra || "",
    status: data.status || "active",
    featured: data.featured === true,
    amountInPaise,
    displayPrice: data.displayPrice || (amountInPaise ? formatPaiseAsRupees(amountInPaise, { includeSuffix: true }) : data.price),
    price: data.price,
    purchasable: data.purchasable !== false,
  };
};

export const createCartItemFromCourse = (course: Course): CartItem => ({
  productId: `course:${course.id}`,
  sourceId: course.id,
  itemType: "course",
  name: course.title,
  category: course.category,
  categoryLabel: course.categoryLabel || course.badge || "Course",
  image: course.image,
  quantity: 1,
  amountInPaise: getCourseAmountInPaise(course),
  displayPrice: getCourseDisplayPrice(course),
  stockStatus: "available",
  maxQuantity: 1,
});
