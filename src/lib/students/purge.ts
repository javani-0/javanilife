import { collection, deleteDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { deleteEnrollment } from "@/lib/classes";

// ---------------------------------------------------------------------------
// CASCADE DELETE (req 3): when a record goes, everything hanging off it goes
// with it — and nothing belonging to anybody else is touched.
//
// An enrolment is the spine of a student's academic life: fees, attendance,
// progress reports, assignment submissions, certificates and bills all point at
// its id. Deleting only the enrolment left those rows behind, which is exactly
// how three enrolments ended up pointing at a class that no longer exists while
// their students were already gone.
//
// Every collection is deleted on its own and failures are reported rather than
// thrown: a manager may hold `students` but not `academics`, and a partial
// clean-up that TELLS you what it could not remove beats one that aborts
// half-way with no record of what happened.
// ---------------------------------------------------------------------------

export interface PurgeEntry {
  /** The Firestore collection cleaned. */
  collection: string;
  /** Plain-English name for the toast / activity log. */
  label: string;
  count: number;
}

export interface PurgeResult {
  removed: PurgeEntry[];
  /** Collections that refused the delete, with the reason. */
  failed: { collection: string; label: string; reason: string }[];
}

interface LinkedCollection {
  collection: string;
  field: string;
  label: string;
}

/** Everything keyed by an enrolment id. Order is oldest-dependency-first. */
export const ENROLLMENT_LINKED_COLLECTIONS: LinkedCollection[] = [
  { collection: "feePayments", field: "enrollmentId", label: "fee records" },
  { collection: "attendance", field: "enrollmentId", label: "attendance days" },
  { collection: "progressReports", field: "enrollmentId", label: "progress reports" },
  { collection: "assignmentSubmissions", field: "enrollmentId", label: "assignment submissions" },
  { collection: "certificates", field: "enrollmentId", label: "certificates" },
  { collection: "bills", field: "enrollmentId", label: "bills" },
];

const reasonOf = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return /permission|insufficient/i.test(message) ? "not allowed for your role" : message;
};

const deleteWhere = async (collectionName: string, field: string, value: string): Promise<number> => {
  const snapshot = await getDocs(query(collection(db, collectionName), where(field, "==", value)));
  await Promise.all(snapshot.docs.map((found) => deleteDoc(found.ref)));
  return snapshot.size;
};

/**
 * Delete one enrolment and every record that hangs off it.
 *
 * `keepEnrollment` stops short of the enrolment doc itself — used when the
 * caller deletes it another way (the server endpoint, say).
 */
export const purgeEnrollment = async (
  enrollmentId: string,
  options: { keepEnrollment?: boolean } = {},
): Promise<PurgeResult> => {
  const result: PurgeResult = { removed: [], failed: [] };
  if (!enrollmentId) return result;

  for (const linked of ENROLLMENT_LINKED_COLLECTIONS) {
    try {
      const count = await deleteWhere(linked.collection, linked.field, enrollmentId);
      if (count > 0) result.removed.push({ collection: linked.collection, label: linked.label, count });
    } catch (error) {
      console.error(`purgeEnrollment: could not clear ${linked.collection}`, error);
      result.failed.push({ collection: linked.collection, label: linked.label, reason: reasonOf(error) });
    }
  }

  if (!options.keepEnrollment) {
    // The enrolment goes LAST: if it were removed first and a dependent delete
    // then failed, the leftovers would have nothing left to identify them by.
    await deleteEnrollment(enrollmentId);
    result.removed.push({ collection: "enrollments", label: "enrolment", count: 1 });
  }

  return result;
};

/** "3 fee records, 1 certificate and the enrolment" — for toasts and the log. */
export const describeRemoved = (removed: PurgeEntry[]): string => {
  const parts = removed
    .filter((entry) => entry.count > 0)
    .map((entry) => (entry.count === 1
      ? `1 ${entry.label.replace(/s$/, "")}`
      : `${entry.count} ${entry.label}`));
  if (parts.length === 0) return "nothing else was attached";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
};

/** "attendance days (not allowed for your role)" — what could NOT be removed. */
export const describeFailures = (failed: PurgeResult["failed"]): string =>
  failed.map((entry) => `${entry.label} (${entry.reason})`).join(", ");
