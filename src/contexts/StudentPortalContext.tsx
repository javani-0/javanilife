import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getClass,
  listMyFees,
  listMyEnrollments,
  type ClassDoc,
  type EnrollmentDoc,
  type FeePaymentDoc,
} from "@/lib/classes";
import { computeClassAccess, type ClassAccess } from "@/lib/portal/access";
import { DEFAULT_PORTAL_SETTINGS, subscribeToPortalSettings, type PortalSettings } from "@/lib/settings/portalSettings";

// ---------------------------------------------------------------------------
// One load for the whole student portal (req P1). Six pages need the same
// enrolments, classes, fees and access state; without this each would re-query
// Firestore on every navigation.
// ---------------------------------------------------------------------------

export interface StudentPortalState {
  loading: boolean;
  /** True once the signed-in user has at least one enrolment. */
  isStudent: boolean;
  enrollments: EnrollmentDoc[];
  classes: Record<string, ClassDoc>;
  feesByEnrollment: Record<string, FeePaymentDoc[]>;
  /** Per-class lock state, keyed by enrollment id. */
  access: Record<string, ClassAccess>;
  /** True when at least one class is locked. */
  hasLockedClass: boolean;
  refresh: () => Promise<void>;
}

const EMPTY: StudentPortalState = {
  loading: true,
  isStudent: false,
  enrollments: [],
  classes: {},
  feesByEnrollment: {},
  access: {},
  hasLockedClass: false,
  refresh: async () => {},
};

const StudentPortalContext = createContext<StudentPortalState>(EMPTY);

export const StudentPortalProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<EnrollmentDoc[]>([]);
  const [classes, setClasses] = useState<Record<string, ClassDoc>>({});
  const [fees, setFees] = useState<FeePaymentDoc[]>([]);
  // The fee lock is opt-in; until the office switches it on nothing locks.
  const [portalSettings, setPortalSettings] = useState<PortalSettings>(DEFAULT_PORTAL_SETTINGS);

  useEffect(() => subscribeToPortalSettings(setPortalSettings, () => undefined), []);

  const load = useCallback(async () => {
    if (!user) {
      setEnrollments([]); setClasses({}); setFees([]); setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [myEnrollments, myFees] = await Promise.all([
        listMyEnrollments(user.uid).catch(() => [] as EnrollmentDoc[]),
        listMyFees(user.uid).catch(() => [] as FeePaymentDoc[]),
      ]);
      setEnrollments(myEnrollments);
      setFees(myFees);

      // One fetch per DISTINCT class, not per enrolment.
      const classIds = Array.from(new Set(myEnrollments.map((item) => item.classId).filter(Boolean)));
      const loaded = await Promise.all(classIds.map((id) => getClass(id).catch(() => null)));
      const map: Record<string, ClassDoc> = {};
      loaded.forEach((cls) => { if (cls) map[cls.id] = cls; });
      setClasses(map);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const feesByEnrollment = useMemo(() => {
    const map: Record<string, FeePaymentDoc[]> = {};
    for (const fee of fees) {
      if (!fee.enrollmentId) continue;
      (map[fee.enrollmentId] ||= []).push(fee);
    }
    return map;
  }, [fees]);

  const access = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const map: Record<string, ClassAccess> = {};
    for (const enrollment of enrollments) {
      map[enrollment.id] = computeClassAccess({
        fees: feesByEnrollment[enrollment.id] || [],
        enrollmentStatus: enrollment.status,
        graceDays: portalSettings.accessGraceDays,
        lockEnabled: portalSettings.accessLockEnabled,
        today,
      });
    }
    return map;
  }, [enrollments, feesByEnrollment, portalSettings]);

  const value = useMemo<StudentPortalState>(() => ({
    loading,
    isStudent: enrollments.length > 0,
    enrollments,
    classes,
    feesByEnrollment,
    access,
    hasLockedClass: Object.values(access).some((item) => item.locked),
    refresh: load,
  }), [loading, enrollments, classes, feesByEnrollment, access, load]);

  return <StudentPortalContext.Provider value={value}>{children}</StudentPortalContext.Provider>;
};

export const useStudentPortal = (): StudentPortalState => useContext(StudentPortalContext);
