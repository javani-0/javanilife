import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  COURSE_CATEGORIES_SETTINGS_ID,
  normalizeCourseCategoryOptions,
  normalizeProductCategoryOptions,
  PRODUCT_CATEGORIES_SETTINGS_ID,
} from "@/lib/ecommerce";
import type { CourseCategoryOption, ManagedCategoryOption } from "@/lib/ecommerce";

const useCategorySettings = <Category extends ManagedCategoryOption>(
  settingsId: string,
  normalize: (value: unknown) => Category[],
) => {
  const [categories, setCategories] = useState<Category[]>(() => normalize(undefined));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "siteSettings", settingsId),
      (snapshot) => {
        setCategories(normalize(snapshot.exists() ? snapshot.data() : undefined));
        setLoading(false);
      },
      (error) => {
        console.error(`Unable to load ${settingsId}`, error);
        setCategories(normalize(undefined));
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [normalize, settingsId]);

  return { categories, loading };
};

export const useProductCategories = () => (
  useCategorySettings<ManagedCategoryOption>(PRODUCT_CATEGORIES_SETTINGS_ID, normalizeProductCategoryOptions)
);

export const useCourseCategories = () => (
  useCategorySettings<CourseCategoryOption>(COURSE_CATEGORIES_SETTINGS_ID, normalizeCourseCategoryOptions)
);
