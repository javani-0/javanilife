import { doc, getDoc, serverTimestamp, setDoc, type DocumentData } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { ClassContentLink, ClassDoc } from "./types";

// ---------------------------------------------------------------------------
// Private class content (req P1b): the live join URL, recorded classes and
// study materials.
//
// These used to live on the PUBLIC `classes` doc (`allow read: if true`), so
// anyone could scrape a meet link straight out of the catalog. They now live in
// `classContent/{classId}`, which needs a signed-in reader, and the live URL is
// additionally handed out per-student by the join-link endpoint after it checks
// enrolment + fee status.
//
// Reads FALL BACK to the legacy fields on the class doc so classes that haven't
// been re-saved since the migration keep working.
// ---------------------------------------------------------------------------

export const CLASS_CONTENT_COLLECTION = "classContent";

export interface ClassContent {
  classId: string;
  liveClassUrl: string;
  recordings: ClassContentLink[];
  materials: ClassContentLink[];
}

const getString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);

const toLinks = (value: unknown): ClassContentLink[] =>
  (Array.isArray(value) ? value : [])
    .map((row: DocumentData, index: number): ClassContentLink => ({
      id: getString(row?.id) || `link-${index + 1}`,
      title: getString(row?.title),
      url: getString(row?.url),
    }))
    .filter((link) => link.url);

export const normalizeClassContent = (classId: string, data: DocumentData = {}): ClassContent => ({
  classId,
  liveClassUrl: getString(data.liveClassUrl),
  recordings: toLinks(data.recordings),
  materials: toLinks(data.materials),
});

/**
 * The content for a class. Requires a signed-in user. Falls back to the legacy
 * fields on the class doc when no `classContent` doc exists yet.
 */
export const getClassContent = async (classId: string, fallback?: ClassDoc | null): Promise<ClassContent> => {
  const empty: ClassContent = { classId, liveClassUrl: "", recordings: [], materials: [] };
  if (!classId) return empty;

  if (auth.currentUser) {
    try {
      const snapshot = await getDoc(doc(db, CLASS_CONTENT_COLLECTION, classId));
      if (snapshot.exists()) return normalizeClassContent(classId, snapshot.data());
    } catch {
      // Fall through to the legacy fields rather than blanking the class room.
    }
  }

  if (fallback) {
    return {
      classId,
      liveClassUrl: fallback.liveClassUrl || "",
      recordings: fallback.recordings || [],
      materials: fallback.materials || [],
    };
  }
  return empty;
};

/** Staff: write the private content doc for a class. */
export const saveClassContent = async (content: ClassContent): Promise<void> => {
  await setDoc(
    doc(db, CLASS_CONTENT_COLLECTION, content.classId),
    {
      classId: content.classId,
      liveClassUrl: content.liveClassUrl || "",
      recordings: content.recordings || [],
      materials: content.materials || [],
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

/**
 * Ask the server for this enrolment's live join URL. The server re-checks
 * ownership and the fee lock, so a locked student never receives the link.
 * Throws with the server's message (402 when fee-locked).
 */
export const fetchJoinLink = async (enrollmentId: string): Promise<string> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in to join the class.");
  const idToken = await user.getIdToken();

  const response = await fetch("/api/razorpay?action=class-join-link", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ enrollmentId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || payload?.message || "Could not get the join link.");
  return getString(payload?.liveClassUrl);
};
