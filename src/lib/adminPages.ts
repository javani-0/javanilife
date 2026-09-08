// ---------------------------------------------------------------------------
// Admin pages a MANAGER can be granted (req). The admin toggles these per
// manager; the keys are stored on users/{uid}.managerPages (string[]) and are
// what the Firestore rules + server endpoints check. Dashboard, Partners,
// Faculty and Managers stay admin-only by design.
// ---------------------------------------------------------------------------

export interface ManagerPage {
  key: string;
  label: string;
  path: string;
}

export const MANAGER_PAGES: ManagerPage[] = [
  { key: "enquiries", label: "Enquiries", path: "/admin/enquiries" },
  { key: "courses", label: "Courses Manager", path: "/admin/courses" },
  { key: "classes", label: "Classes Manager", path: "/admin/classes" },
  { key: "students", label: "Student Manager", path: "/admin/students" },
  { key: "attendance", label: "Attendance", path: "/admin/attendance" },
  { key: "academics", label: "Academics", path: "/admin/academics" },
  { key: "enrollments", label: "Sign Up", path: "/admin/enrollments" },
  { key: "fee-collections", label: "Fee Collections", path: "/admin/fee-collections" },
  { key: "payment-settings", label: "Payment Settings", path: "/admin/payment-settings" },
  { key: "gallery", label: "Gallery Manager", path: "/admin/gallery" },
  { key: "products", label: "Products Manager", path: "/admin/products" },
  { key: "rentals", label: "Rental Desk", path: "/admin/rentals" },
  { key: "coupons", label: "Coupons", path: "/admin/coupons" },
  { key: "delivery-settings", label: "Delivery Settings", path: "/admin/delivery-settings" },
  { key: "orders", label: "Orders Manager", path: "/admin/orders" },
  { key: "customers", label: "Customers", path: "/admin/customers" },
  { key: "finance", label: "Finance", path: "/admin/finance" },
  { key: "site-settings", label: "Site Settings", path: "/admin/site-settings" },
];

/** The page key an /admin path belongs to (handles subpaths like /admin/orders/:id). */
export const pageKeyForPath = (pathname: string): string | null => {
  const page = MANAGER_PAGES.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
  return page ? page.key : null;
};

/** Can a manager with these page keys open this /admin path? */
export const managerCanAccessPath = (pages: string[] | undefined, pathname: string): boolean => {
  const key = pageKeyForPath(pathname);
  return Boolean(key && (pages || []).includes(key));
};

/** Where a manager lands: their first allowed page (nav order), or null. */
export const firstAllowedPath = (pages: string[] | undefined): string | null =>
  MANAGER_PAGES.find((item) => (pages || []).includes(item.key))?.path || null;

// ---------------------------------------------------------------------------
// Teachers (req 1). A teacher is NOT a manager with extra keys: they get a
// fixed, two-page console and are scoped to the classes assigned to them. They
// never see fees, student records, finance or credentials.
// ---------------------------------------------------------------------------

/** The only pages a teacher may open. Fixed — not admin-configurable. */
export const TEACHER_PAGE_KEYS = ["attendance", "academics"] as const;

export const TEACHER_PAGES: ManagerPage[] = MANAGER_PAGES.filter(
  (page) => (TEACHER_PAGE_KEYS as readonly string[]).includes(page.key),
);

/**
 * Where a teacher lands after signing in. Academics, not the standalone
 * Attendance page: attendance is the first TAB inside Academics, and the
 * standalone page was removed from the nav for being a duplicate door.
 */
export const TEACHER_LANDING_PATH = "/admin/academics";

/** Can a teacher open this /admin path? */
export const teacherCanAccessPath = (pathname: string): boolean => {
  const key = pageKeyForPath(pathname);
  return Boolean(key && (TEACHER_PAGE_KEYS as readonly string[]).includes(key));
};

/**
 * The classes a teacher may work with. An EMPTY assignment list means the
 * teacher has not been given any class yet, so they see none — never all.
 * Deliberately fail-closed: the opposite would hand a new teacher the whole
 * school on their first login.
 */
export const classesForTeacher = <T extends { id: string }>(
  classes: T[],
  teacherClassIds: string[] | undefined,
): T[] => {
  const allowed = new Set(teacherClassIds || []);
  return (classes || []).filter((item) => allowed.has(item.id));
};
