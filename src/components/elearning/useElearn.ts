// Data hooks for the public + student e-learning pages.
// Demo mode (`?demo`, DEV builds only) swaps Firestore for the sample data in
// src/lib/elearning/demo.ts. Every demo branch is guarded by `import.meta.env.DEV`
// and loads the module with a dynamic import, so production builds contain none of it.
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  subscribeCourse,
  subscribeEnrollment,
  subscribeMyEnrollments,
  subscribeProgress,
  subscribePublishedCourses,
  type ElearnCourse,
  type ElearnEnrollment,
  type ElearnProgress,
} from "@/lib/elearning";
import { defaultPaymentSettings, subscribeToPaymentSettings, type PaymentSettings } from "@/lib/settings/paymentSettings";
import type { DemoEnrollmentState } from "@/lib/elearning/demo";

type DemoModule = typeof import("@/lib/elearning/demo");

/** `?demo` / `?demo=active|processing|rejected|none` in DEV; always null in production. */
export const useDemoState = (): DemoEnrollmentState | null => {
  const { search } = useLocation();
  if (!import.meta.env.DEV) return null;
  const params = new URLSearchParams(search);
  if (!params.has("demo")) return null;
  const value = params.get("demo");
  return value === "processing" || value === "rejected" || value === "none" ? value : "active";
};

const useDemoModule = (enabled: boolean): DemoModule | null => {
  const [mod, setMod] = useState<DemoModule | null>(null);
  useEffect(() => {
    if (import.meta.env.DEV && enabled) {
      let alive = true;
      void import("@/lib/elearning/demo").then((m) => alive && setMod(m));
      return () => { alive = false; };
    }
  }, [enabled]);
  return enabled ? mod : null;
};

export const usePublishedCourses = () => {
  const demo = useDemoState();
  const demoMod = useDemoModule(!!demo);
  const [courses, setCourses] = useState<ElearnCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV && demo) {
      if (demoMod) { setCourses(demoMod.DEMO_COURSES); setLoading(false); }
      return;
    }
    setLoading(true);
    return subscribePublishedCourses(
      (list) => { setCourses(list); setLoading(false); setError(false); },
      () => { setLoading(false); setError(true); },
    );
  }, [demo, demoMod]);

  return { courses, loading, error };
};

export const useCourse = (courseId: string | undefined) => {
  const demo = useDemoState();
  const demoMod = useDemoModule(!!demo);
  const [course, setCourse] = useState<ElearnCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!courseId) { setCourse(null); setLoading(false); return; }
    if (import.meta.env.DEV && demo) {
      if (demoMod) { setCourse(demoMod.DEMO_COURSES.find((c) => c.id === courseId) ?? null); setLoading(false); }
      return;
    }
    setLoading(true);
    return subscribeCourse(
      courseId,
      (next) => { setCourse(next && next.status === "published" ? next : null); setLoading(false); setError(false); },
      () => { setLoading(false); setError(true); },
    );
  }, [courseId, demo, demoMod]);

  return { course, loading, error };
};

/** The signed-in user's enrollment + progress for one course. */
export const useMyCourseAccess = (courseId: string | undefined) => {
  const { user } = useAuth();
  const uid = user?.uid;
  const demo = useDemoState();
  const demoMod = useDemoModule(!!demo);
  const [enrollment, setEnrollment] = useState<ElearnEnrollment | null>(null);
  const [progress, setProgress] = useState<ElearnProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (import.meta.env.DEV && demo) {
      if (!demoMod) return;
      const course = demoMod.DEMO_COURSES.find((c) => c.id === courseId);
      setEnrollment(course ? demoMod.demoEnrollment(course, demo) : null);
      setProgress(course && demo === "active" ? demoMod.demoProgress(course) : null);
      setLoading(false);
      return;
    }
    if (!uid || !courseId) { setEnrollment(null); setProgress(null); setLoading(false); return; }
    setLoading(true);
    const stopEnrollment = subscribeEnrollment(uid, courseId, (next) => { setEnrollment(next); setLoading(false); }, () => setLoading(false));
    const stopProgress = subscribeProgress(uid, courseId, setProgress, () => undefined);
    return () => { stopEnrollment(); stopProgress(); };
  }, [uid, courseId, demo, demoMod]);

  return { enrollment, progress, loading, uid, isDemo: !!(import.meta.env.DEV && demo) };
};

/** All of the signed-in user's enrollments, newest first. */
export const useMyEnrollments = () => {
  const { user } = useAuth();
  const uid = user?.uid;
  const demo = useDemoState();
  const demoMod = useDemoModule(!!demo);
  const [enrollments, setEnrollments] = useState<ElearnEnrollment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (import.meta.env.DEV && demo) {
      if (!demoMod) return;
      const [first, second] = demoMod.DEMO_COURSES;
      const list = [demoMod.demoEnrollment(first, demo), demoMod.demoEnrollment(second, demo === "active" ? "processing" : demo)];
      setEnrollments(list.filter((e): e is ElearnEnrollment => !!e));
      setLoading(false);
      return;
    }
    if (!uid) { setEnrollments([]); setLoading(false); return; }
    setLoading(true);
    return subscribeMyEnrollments(uid, (list) => { setEnrollments(list); setLoading(false); }, () => setLoading(false));
  }, [uid, demo, demoMod]);

  return { enrollments, loading };
};

/** Progress for one course, only while `enabled` (an owned course). */
export const useCourseProgress = (courseId: string, enabled: boolean) => {
  const { user } = useAuth();
  const uid = user?.uid;
  const demo = useDemoState();
  const demoMod = useDemoModule(!!demo && enabled);
  const [progress, setProgress] = useState<ElearnProgress | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV && demo) {
      const course = demoMod?.DEMO_COURSES.find((c) => c.id === courseId);
      setProgress(course && enabled ? demoMod!.demoProgress(course) : null);
      return;
    }
    if (!uid || !enabled) { setProgress(null); return; }
    return subscribeProgress(uid, courseId, setProgress, () => undefined);
  }, [uid, courseId, enabled, demo, demoMod]);

  return progress;
};

export const usePaymentSettingsLive = () => {
  const demo = useDemoState();
  const [settings, setSettings] = useState<PaymentSettings>(defaultPaymentSettings);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (import.meta.env.DEV && demo) {
      // Sample payee so the QR panel can be seen in dev. Never used in production.
      setSettings({ ...defaultPaymentSettings, manualPaymentsEnabled: true, upiId: "sample-payee@upi", upiName: "Sample payee (demo)" });
      setLoaded(true);
      return;
    }
    return subscribeToPaymentSettings((next) => { setSettings(next); setLoaded(true); }, () => setLoaded(true));
  }, [demo]);
  return { settings, loaded };
};
