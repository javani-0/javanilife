import type { ClassDoc } from "@/lib/classes";

// ---------------------------------------------------------------------------
// Live class schedule + join gating (req: "Live Class Schedule & Joining Links").
//
// The Join button only opens around the actual session — a permanently live
// link is both confusing ("is class on now?") and leaky. PURE + unit-tested;
// everything is derived from the class's weekly schedule or the enrolled slot.
// ---------------------------------------------------------------------------

/** Join opens this many minutes BEFORE the session starts. */
export const JOIN_OPENS_MINUTES_BEFORE = 15;
/** ...and closes this many minutes AFTER it ends (late joiners, overruns). */
export const JOIN_CLOSES_MINUTES_AFTER = 30;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ScheduleSource {
  days: string[];  // ["Mon","Wed","Fri"]
  start: string;   // "18:00" (24h)
  end: string;     // "19:00" (24h)
}

export interface SessionOccurrence {
  start: Date;
  end: Date;
  dayLabel: string;   // "Mon, 4 Aug"
  timeLabel: string;  // "6:00 PM – 7:00 PM"
  label: string;      // "Mon, 4 Aug · 6:00 PM – 7:00 PM"
}

const isTime = (value: unknown): value is string => typeof value === "string" && /^\d{1,2}:\d{2}$/.test(value);

/** Normalize a stored day token ("mon", "MONDAY", "Mon") to "Mon". */
const normalizeDay = (value: string): string => {
  const token = (value || "").trim().slice(0, 3).toLowerCase();
  return WEEKDAYS.find((day) => day.toLowerCase() === token) || "";
};

/**
 * Which schedule applies to this enrolment: the chosen SLOT when the class
 * defines slots (each slot has its own days/times), else the class-level
 * weekly schedule. Returns null when the class has no usable timing.
 */
export const resolveSchedule = (cls: ClassDoc | null | undefined, slotId?: string): ScheduleSource | null => {
  if (!cls) return null;

  const slots = cls.timeSlots || [];
  const slot = slotId ? slots.find((item) => item.id === slotId) : undefined;
  if (slot && isTime(slot.start) && isTime(slot.end)) {
    const days = (slot.days || []).map(normalizeDay).filter(Boolean);
    if (days.length > 0) return { days, start: slot.start, end: slot.end };
  }

  if (isTime(cls.scheduleStart) && isTime(cls.scheduleEnd)) {
    const days = (cls.scheduleDays || []).map(normalizeDay).filter(Boolean);
    if (days.length > 0) return { days, start: cls.scheduleStart, end: cls.scheduleEnd };
  }
  return null;
};

/**
 * A human weekly timing for a class — "Mon, Wed & Fri · 6:00 AM – 7:00 AM".
 *
 * The portal used to print `enrollment.slotLabel` and nothing else, so an
 * enrolment saved without a slot (or whose slot has since been removed from the
 * class) showed no timing at all. This falls back to the class's own schedule.
 */
export const scheduleLabelFor = (cls: ClassDoc | null | undefined, slotId?: string): string => {
  const schedule = resolveSchedule(cls, slotId);
  if (!schedule) return "";
  const days = schedule.days.length > 1
    ? `${schedule.days.slice(0, -1).join(", ")} & ${schedule.days[schedule.days.length - 1]}`
    : schedule.days[0];
  return `${days} · ${formatClockTime(schedule.start)} – ${formatClockTime(schedule.end)}`;
};

/**
 * "18:00" → "6:00 PM". Formatted by hand rather than via toLocaleTimeString:
 * `en-IN` renders the meridiem lower-case in Node and upper-case in some
 * browsers, and a label the student reads shouldn't depend on that.
 */
const formatClockTime = (time: string): string => {
  const [hours, minutes] = time.split(":").map(Number);
  const meridiem = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${meridiem}`;
};

const atTime = (day: Date, time: string): Date => {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(day);
  result.setHours(hours, minutes, 0, 0);
  return result;
};

const formatTime = (date: Date): string =>
  date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });

const formatDay = (date: Date): string =>
  date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

const buildOccurrence = (start: Date, end: Date): SessionOccurrence => {
  const dayLabel = formatDay(start);
  const timeLabel = `${formatTime(start)} – ${formatTime(end)}`;
  return { start, end, dayLabel, timeLabel, label: `${dayLabel} · ${timeLabel}` };
};

/**
 * The next `count` sessions at or after `from`. A session already in progress
 * (or inside its join-close grace) is included FIRST — otherwise a student
 * opening the page mid-class would be told the next class is next week.
 */
export const nextSessionsFor = (
  cls: ClassDoc | null | undefined,
  slotId: string | undefined,
  from: Date = new Date(),
  count = 3,
): SessionOccurrence[] => {
  const schedule = resolveSchedule(cls, slotId);
  if (!schedule) return [];

  const wanted = new Set(schedule.days);
  const sessions: SessionOccurrence[] = [];
  // Two weeks is enough to find `count` occurrences of any weekly pattern.
  for (let offset = 0; offset < 14 && sessions.length < count; offset += 1) {
    const day = new Date(from);
    day.setDate(day.getDate() + offset);
    if (!wanted.has(WEEKDAYS[day.getDay()])) continue;

    const start = atTime(day, schedule.start);
    let end = atTime(day, schedule.end);
    // An end before the start means the class runs past midnight.
    if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);

    // Skip sessions that are fully over (including the late-join grace).
    if (end.getTime() + JOIN_CLOSES_MINUTES_AFTER * 60000 < from.getTime()) continue;
    sessions.push(buildOccurrence(start, end));
  }
  return sessions;
};

/** Is the Join button live for this session right now? */
export const isJoinOpen = (session: SessionOccurrence, now: Date = new Date()): boolean => {
  const opensAt = session.start.getTime() - JOIN_OPENS_MINUTES_BEFORE * 60000;
  const closesAt = session.end.getTime() + JOIN_CLOSES_MINUTES_AFTER * 60000;
  const time = now.getTime();
  return time >= opensAt && time <= closesAt;
};

export interface JoinStatus {
  open: boolean;
  /** The session the button refers to (live one, else the next one). */
  session?: SessionOccurrence;
  /** What to show the student when the button is disabled. */
  message: string;
}

/**
 * Whether the student can join right now, and what to tell them if not.
 * `hasLink` false means the class hasn't published a live URL at all.
 */
export const joinStatusFor = (
  sessions: SessionOccurrence[],
  now: Date = new Date(),
  hasLink = true,
): JoinStatus => {
  if (!hasLink) return { open: false, message: "The live link will appear here when the class sets it up." };
  if (sessions.length === 0) return { open: false, message: "No sessions scheduled yet." };

  const live = sessions.find((session) => isJoinOpen(session, now));
  if (live) return { open: true, session: live, message: "Class is live now." };

  const upcoming = sessions.find((session) => session.start.getTime() > now.getTime());
  if (!upcoming) return { open: false, message: "No upcoming sessions." };

  const sameDay = upcoming.start.toDateString() === now.toDateString();
  return {
    open: false,
    session: upcoming,
    message: sameDay
      ? `Join opens at ${formatTime(new Date(upcoming.start.getTime() - JOIN_OPENS_MINUTES_BEFORE * 60000))}`
      : `Next class ${upcoming.label}`,
  };
};
