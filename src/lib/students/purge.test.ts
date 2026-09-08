import { describe, expect, it } from "vitest";
import { ENROLLMENT_LINKED_COLLECTIONS, describeFailures, describeRemoved } from "./purge";

describe("ENROLLMENT_LINKED_COLLECTIONS", () => {
  // If a collection that stores per-student records is missing from this list,
  // deleting an enrolment leaves orphan rows behind — the exact bug this
  // module exists to end.
  it("covers every collection that files rows under an enrolment", () => {
    expect(ENROLLMENT_LINKED_COLLECTIONS.map((entry) => entry.collection)).toEqual([
      "feePayments",
      "attendance",
      "progressReports",
      "assignmentSubmissions",
      "certificates",
      "bills",
    ]);
    for (const entry of ENROLLMENT_LINKED_COLLECTIONS) {
      expect(entry.field).toBe("enrollmentId");
    }
  });
});

describe("describeRemoved", () => {
  it("says nothing was attached when nothing was", () => {
    expect(describeRemoved([])).toBe("nothing else was attached");
    expect(describeRemoved([{ collection: "bills", label: "bills", count: 0 }])).toBe("nothing else was attached");
  });

  it("singularises a count of one", () => {
    expect(describeRemoved([{ collection: "certificates", label: "certificates", count: 1 }])).toBe("1 certificate");
  });

  it("reads as a sentence for several collections", () => {
    expect(describeRemoved([
      { collection: "feePayments", label: "fee records", count: 3 },
      { collection: "attendance", label: "attendance days", count: 12 },
      { collection: "enrollments", label: "enrolment", count: 1 },
    ])).toBe("3 fee records, 12 attendance days and 1 enrolment");
  });
});

describe("describeFailures", () => {
  it("names what could not be removed and why", () => {
    expect(describeFailures([
      { collection: "attendance", label: "attendance days", reason: "not allowed for your role" },
    ])).toBe("attendance days (not allowed for your role)");
  });

  it("is empty when everything went through", () => {
    expect(describeFailures([])).toBe("");
  });
});
