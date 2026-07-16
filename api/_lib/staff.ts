// ---------------------------------------------------------------------------
// Staff check shared by server endpoints: an ADMIN can do everything; a
// MANAGER (admin-created) can act only on the pages the admin switched on
// (users/{uid}.managerPages — see src/lib/adminPages.ts for the keys).
// ---------------------------------------------------------------------------

export const isStaffForPage = (
  userData: FirebaseFirestore.DocumentData | undefined,
  page: string,
): boolean => {
  const role = String(userData?.role || "");
  if (role === "admin") return true;
  if (role !== "manager") return false;
  const pages = Array.isArray(userData?.managerPages) ? userData?.managerPages : [];
  return pages.includes(page);
};
