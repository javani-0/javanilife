import { describe, expect, it } from "vitest";
import type { ClassDoc } from "@/lib/classes";
import {
  isJoinOpen,
  joinStatusFor,
  nextSessionsFor,
  resolveSchedule,
  type SessionOccurrence,
} from "./schedule";

const cls = (over: Partial<ClassDoc> = {}): ClassDoc => ({
  id: "c1",
  name: "Vocal",
  monthlyFeeInPaise: 100000,
  billingDayOfMonth: 5,
  active: true,
  feeType: "monthly",
  payment: { autopay: true, manual: true, full: false, emi: false, cash: false },
  scheduleDays: ["Mon", "Wed"],
  scheduleStart: "18:00",
  scheduleEnd: "19:00",
  ...over,
} as ClassDoc);

// Mon 3 Aug 2026 at 09:00 local.
const MONDAY_9AM = new Date(2026, 7, 3, 9, 0, 0);

describe("resolveSchedule", () => {
  it("uses the class weekly schedule when there are no slots", () => {
    expect(resolveSchedule(cls())).toEqual({ days: ["Mon", "Wed"], start: "18:00", end: "19:00" });
  });

  it("prefers the ENROLLED slot when the class defines slots", () => {
    const withSlots = cls({
      timeSlots: [
        { id: "s1", days: ["Tue"], start: "07:00", end: "08:00", label: "Tue 7AM" },
        { id: "s2", days: ["Sat"], start: "10:00", end: "11:30", label: "Sat 10AM" },
      ],
    });
    expect(resolveSchedule(withSlots, "s2")).toEqual({ days: ["Sat"], start: "10:00", end: "11:30" });
  });

  it("falls back to the class schedule when the slot id is unknown", () => {
    const withSlots = cls({ timeSlots: [{ id: "s1", days: ["Tue"], start: "07:00", end: "08:00", label: "x" }] });
    expect(resolveSchedule(withSlots, "missing")?.days).toEqual(["Mon", "Wed"]);
  });

  it("normalizes day spellings", () => {
    expect(resolveSchedule(cls({ scheduleDays: ["monday", "WED"] }))?.days).toEqual(["Mon", "Wed"]);
  });

  it("returns null when the class has no usable timing", () => {
    expect(resolveSchedule(cls({ scheduleDays: [], timeSlots: [] }))).toBeNull();
    expect(resolveSchedule(cls({ scheduleStart: undefined }))).toBeNull();
    expect(resolveSchedule(null)).toBeNull();
  });
});

describe("nextSessionsFor", () => {
  it("returns the upcoming sessions in order", () => {
    const sessions = nextSessionsFor(cls(), undefined, MONDAY_9AM, 3);
    expect(sessions).toHaveLength(3);
    expect(sessions[0].start.getDate()).toBe(3);  // Mon 3rd, later today
    expect(sessions[1].start.getDate()).toBe(5);  // Wed 5th
    expect(sessions[2].start.getDate()).toBe(10); // Mon 10th
    expect(sessions[0].timeLabel).toContain("6:00");
  });

  // Opening the portal mid-class must not say "next class is Wednesday".
  it("includes a session already IN PROGRESS", () => {
    const during = new Date(2026, 7, 3, 18, 30, 0);
    const sessions = nextSessionsFor(cls(), undefined, during, 2);
    expect(sessions[0].start.getDate()).toBe(3);
    expect(isJoinOpen(sessions[0], during)).toBe(true);
  });

  it("drops a session that is fully over past the late-join grace", () => {
    const after = new Date(2026, 7, 3, 19, 45, 0); // 45 min after a 19:00 end
    const sessions = nextSessionsFor(cls(), undefined, after, 1);
    expect(sessions[0].start.getDate()).toBe(5); // rolled on to Wednesday
  });

  it("handles a class that runs past midnight", () => {
    const overnight = cls({ scheduleDays: ["Mon"], scheduleStart: "23:00", scheduleEnd: "00:30" });
    const [session] = nextSessionsFor(overnight, undefined, MONDAY_9AM, 1);
    expect(session.end.getTime()).toBeGreaterThan(session.start.getTime());
    expect(session.end.getDate()).toBe(4);
  });

  it("is empty when there is no schedule", () => {
    expect(nextSessionsFor(cls({ scheduleDays: [] }), undefined, MONDAY_9AM)).toEqual([]);
  });
});

describe("isJoinOpen", () => {
  const session = (): SessionOccurrence => nextSessionsFor(cls(), undefined, MONDAY_9AM, 1)[0];

  it("is closed well before the class", () => {
    expect(isJoinOpen(session(), new Date(2026, 7, 3, 17, 0))).toBe(false);
  });

  it("opens 15 minutes before the start", () => {
    expect(isJoinOpen(session(), new Date(2026, 7, 3, 17, 44))).toBe(false);
    expect(isJoinOpen(session(), new Date(2026, 7, 3, 17, 46))).toBe(true);
  });

  it("stays open through the class and 30 minutes after", () => {
    expect(isJoinOpen(session(), new Date(2026, 7, 3, 18, 59))).toBe(true);
    expect(isJoinOpen(session(), new Date(2026, 7, 3, 19, 29))).toBe(true);
    expect(isJoinOpen(session(), new Date(2026, 7, 3, 19, 31))).toBe(false);
  });
});

describe("joinStatusFor", () => {
  it("says the class is live during the window", () => {
    const during = new Date(2026, 7, 3, 18, 10);
    const status = joinStatusFor(nextSessionsFor(cls(), undefined, during), during);
    expect(status.open).toBe(true);
    expect(status.message).toBe("Class is live now.");
  });

  it("tells the student the opening time when it is later TODAY", () => {
    const status = joinStatusFor(nextSessionsFor(cls(), undefined, MONDAY_9AM), MONDAY_9AM);
    expect(status.open).toBe(false);
    expect(status.message).toContain("Join opens at");
    expect(status.message).toContain("5:45");
  });

  it("names the next class when it is on another day", () => {
    const tuesday = new Date(2026, 7, 4, 9, 0);
    const status = joinStatusFor(nextSessionsFor(cls(), undefined, tuesday), tuesday);
    expect(status.open).toBe(false);
    expect(status.message).toContain("Next class");
  });

  it("explains a missing live link rather than pretending a class is scheduled", () => {
    const status = joinStatusFor(nextSessionsFor(cls(), undefined, MONDAY_9AM), MONDAY_9AM, false);
    expect(status.open).toBe(false);
    expect(status.message).toContain("live link will appear");
  });

  it("handles a class with no sessions at all", () => {
    expect(joinStatusFor([], MONDAY_9AM).message).toBe("No sessions scheduled yet.");
  });
});
