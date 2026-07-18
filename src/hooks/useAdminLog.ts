import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { writeAdminLog } from "@/lib/adminLog";

/**
 * Fire-and-forget logger for admin/manager actions (req). Usage:
 *   const logAction = useAdminLog();
 *   logAction("Recorded fee", "Anaya (STU002) · July 2026 · ₹2,000 · cash");
 * No-ops for non-staff users; never blocks or throws into the caller.
 */
export const useAdminLog = () => {
  const { user, userProfile } = useAuth();
  return useCallback((action: string, details?: string) => {
    const role = userProfile?.role;
    if (!user || (role !== "admin" && role !== "manager")) return;
    void writeAdminLog(
      { uid: user.uid, email: user.email || userProfile?.email || "", name: userProfile?.username || "", role },
      action,
      details,
    );
  }, [user, userProfile]);
};
