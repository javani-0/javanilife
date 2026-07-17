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
  { key: "enrollments", label: "Sign Up", path: "/admin/enrollments" },
  { key: "fee-collections", label: "Fee Collections", path: "/admin/fee-collections" },
  { key: "payment-settings", label: "Payment Settings", path: "/admin/payment-settings" },
  { key: "gallery", label: "Gallery Manager", path: "/admin/gallery" },
  { key: "products", label: "Products Manager", path: "/admin/products" },
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
