import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, type DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DEFAULT_ACCESS_GRACE_DAYS } from "@/lib/portal/access";

// ---------------------------------------------------------------------------
// Student-portal settings (siteSettings/portal). Public read / staff write via
// the existing siteSettings rule — no new collection, no rules deploy.
//
// The automatic fee lock lives here because it must be a DELIBERATE choice:
// shipping it on by default locked 38% of paying families out of the content
// they had bought (see the incident note in lib/portal/access.ts).
// ---------------------------------------------------------------------------

export const PORTAL_SETTINGS_DOC = "portal";

export interface PortalSettings {
  /** Master switch for the automatic fee-based content lock. Default OFF. */
  accessLockEnabled: boolean;
  /** Days after the due date before a class locks. */
  accessGraceDays: number;
}

export const DEFAULT_PORTAL_SETTINGS: PortalSettings = {
  accessLockEnabled: false,
  accessGraceDays: DEFAULT_ACCESS_GRACE_DAYS,
};

export const normalizePortalSettings = (data: DocumentData = {}): PortalSettings => {
  const days = Number(data.accessGraceDays);
  return {
    accessLockEnabled: data.accessLockEnabled === true,
    accessGraceDays: Number.isFinite(days) && days >= 0 ? Math.round(days) : DEFAULT_ACCESS_GRACE_DAYS,
  };
};

export const getPortalSettings = async (): Promise<PortalSettings> => {
  try {
    const snapshot = await getDoc(doc(db, "siteSettings", PORTAL_SETTINGS_DOC));
    return snapshot.exists() ? normalizePortalSettings(snapshot.data()) : DEFAULT_PORTAL_SETTINGS;
  } catch {
    // Never let a settings read failure lock students out.
    return DEFAULT_PORTAL_SETTINGS;
  }
};

export const subscribeToPortalSettings = (
  onChange: (settings: PortalSettings) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  doc(db, "siteSettings", PORTAL_SETTINGS_DOC),
  (snapshot) => onChange(snapshot.exists() ? normalizePortalSettings(snapshot.data()) : DEFAULT_PORTAL_SETTINGS),
  (error) => { onChange(DEFAULT_PORTAL_SETTINGS); onError?.(error); },
);

export const savePortalSettings = async (settings: PortalSettings): Promise<void> => {
  await setDoc(
    doc(db, "siteSettings", PORTAL_SETTINGS_DOC),
    {
      accessLockEnabled: settings.accessLockEnabled === true,
      accessGraceDays: Math.max(0, Math.round(settings.accessGraceDays)),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};
