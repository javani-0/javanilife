import { describe, expect, it } from "vitest";
import {
  buildAttendanceId,
  groupAttendanceByMonth,
  normalizeAttendance,
  normalizeProgressReport,
  summarizeAttendance,
  type AttendanceRecord,
  type AttendanceStatus,
} from "./attendance";

const rec = (date: string, status: AttendanceStatus): AttendanceRecord => ({
  id: `e1_${date}`,
  enrollmentId: "e1",
  classId: "c1",
  className: "Vocal",
  studentUid: "u1",
  studentName: "Asha",
  studentId: "STU001",
  date,
  status,
  markedBy: "admin",
});

describe("summarizeAttendance", () => {
  it("counts each status", () => {
    const s = summarizeAttendance([
      rec("2026-07-01", "present"), rec("2026-07-02", "absent"),
      rec("2026-07-03", "late"), rec("2026-07-04", "excused"),
    ]);
    expect(s.total).toBe(4);
    expect(s.present).toBe(1);
    expect(s.absent).toBe(1);
    expect(s.late).toBe(1);
    expect(s.excused).toBe(1);
  });

  // A student who arrived 10 minutes late was there.
  it("counts LATE as attended", () => {
    expect(summarizeAttendance([rec("2026-07-01", "late"), rec("2026-07-02", "present")]).percent).toBe(100);
  });

  // An authorised absence should neither reward nor punish.
  it("removes EXCUSED from the percentage entirely", () => {
    const s = summarizeAttendance([
      rec("2026-07-01", "present"), rec("2026-07-02", "excused"), rec("2026-07-03", "absent"),
    ]);
    expect(s.percent).toBe(50); // 1 of 2 counted, not 1 of 3
  });

  it("is 0% when everything was missed", () => {
    expect(summarizeAttendance([rec("2026-07-01", "absent")]).percent).toBe(0);
  });

  it("is 0% (not NaN) with no records at all", () => {
    const s = summarizeAttendance([]);
    expect(s.percent).toBe(0);
    expect(s.total).toBe(0);
  });

  it("is 0% (not NaN) when every record is excused", () => {
    expect(summarizeAttendance([rec("2026-07-01", "excused")]).percent).toBe(0);
  });

  it("rounds to a whole percent", () => {
    const s = summarizeAttendance([
      rec("2026-07-01", "present"), rec("2026-07-02", "present"), rec("2026-07-03", "absent"),
    ]);
    expect(s.percent).toBe(67);
  });

  describe("streak", () => {
    it("counts consecutive recent attendance", () => {
      expect(summarizeAttendance([
        rec("2026-07-05", "present"), rec("2026-07-04", "late"), rec("2026-07-03", "present"),
      ]).streak).toBe(3);
    });

    it("breaks on an absence", () => {
      expect(summarizeAttendance([
        rec("2026-07-05", "present"), rec("2026-07-04", "absent"), rec("2026-07-03", "present"),
      ]).streak).toBe(1);
    });

    it("is not broken by an excused session", () => {
      expect(summarizeAttendance([
        rec("2026-07-05", "present"), rec("2026-07-04", "excused"), rec("2026-07-03", "present"),
      ]).streak).toBe(2);
    });

    it("is 0 when the most recent session was missed", () => {
      expect(summarizeAttendance([rec("2026-07-05", "absent"), rec("2026-07-04", "present")]).streak).toBe(0);
    });

    it("ignores the order records arrive in", () => {
      expect(summarizeAttendance([
        rec("2026-07-03", "present"), rec("2026-07-05", "absent"), rec("2026-07-04", "present"),
      ]).streak).toBe(0);
    });
  });
});

describe("groupAttendanceByMonth", () => {
  it("buckets by YYYY-MM and skips dateless rows", () => {
    const grouped = groupAttendanceByMonth([
      rec("2026-07-01", "present"), rec("2026-07-20", "absent"), rec("2026-08-01", "present"), rec("", "present"),
    ]);
    expect(Object.keys(grouped).sort()).toEqual(["2026-07", "2026-08"]);
    expect(grouped["2026-07"]).toHaveLength(2);
  });
});

describe("buildAttendanceId", () => {
  // Deterministic ids are what make re-marking a date an EDIT, not a duplicate.
  it("is stable for the same enrolment and date", () => {
    expect(buildAttendanceId("e1", "2026-07-01")).toBe("e1_2026-07-01");
    expect(buildAttendanceId("e1", "2026-07-01")).toBe(buildAttendanceId("e1", "2026-07-01"));
  });
});

describe("normalizeAttendance", () => {
  it("defaults an unknown status to absent rather than trusting it", () => {
    expect(normalizeAttendance("x", { status: "hacked" }).status).toBe("absent");
  });
  it("is empty-safe", () => {
    const r = normalizeAttendance("x", {});
    expect(r.date).toBe("");
    expect(r.status).toBe("absent");
  });
});

describe("normalizeProgressReport", () => {
  it("clamps skill ratings to 0–5 and drops unnamed skills", () => {
    const report = normalizeProgressReport("r1", {
      skills: [{ name: "Rhythm", rating: 9 }, { name: "", rating: 3 }, { name: "Posture", rating: -2 }],
    });
    expect(report.skills).toEqual([{ name: "Rhythm", rating: 5 }, { name: "Posture", rating: 0 }]);
  });
  it("is empty-safe", () => {
    expect(normalizeProgressReport("r1", {}).skills).toEqual([]);
  });
});
