import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ---------------------------------------------------------------------------
// "Progress is not visible in the student login" (req 3.3).
//
// The reports were being written and were readable — they just sat at the
// bottom of a page called "Attendance". These tests pin the new arrangement:
// Progress is its own page that LEADS with the report, and the dashboard
// carries a Progress card in its own right.
//
// Covered by component tests rather than a browser pass because student
// credentials are not available to this session (same reason as
// emi-dashboard-ui.test.tsx).
// ---------------------------------------------------------------------------

vi.mock("@/lib/firebase", () => ({ db: {}, auth: {}, default: {} }));

const listMyAttendance = vi.fn();
const listMyProgressReports = vi.fn();

vi.mock("@/lib/portal/attendance", async () => {
  const actual = await vi.importActual<typeof import("@/lib/portal/attendance")>("@/lib/portal/attendance");
  return { ...actual, listMyAttendance, listMyProgressReports };
});

// The value must be STABLE across renders: both pages load on [user], and a
// fresh object every render would re-trigger the effect forever. The real
// AuthContext hands back the same Firebase user object between renders.
vi.mock("@/contexts/AuthContext", () => {
  const value = { user: { uid: "uid1" }, userProfile: { username: "Parent" } };
  return { useAuth: () => value };
});

const portalState = {
  loading: false,
  isStudent: true,
  enrollments: [{
    id: "enr1", classId: "cls1", className: "Nattuvangam", status: "active",
    student: { name: "Samvidha" }, slotLabel: "Sat 4 PM",
  }],
  classes: {},
  feesByEnrollment: {},
  access: {},
  hasLockedClass: false,
};
vi.mock("@/contexts/StudentPortalContext", () => ({
  useStudentPortal: () => portalState,
}));

// AccountLayout pulls in the nav + hero; the page content is what matters here.
vi.mock("@/components/account/AccountLayout", () => ({
  default: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div><h1>{title}</h1>{children}</div>
  ),
}));

const report = {
  id: "r1",
  enrollmentId: "enr1",
  classId: "cls1",
  className: "Nattuvangam",
  studentUid: "uid1",
  periodLabel: "August 2026",
  grade: "A",
  skills: [{ name: "Rhythm", rating: 4 }],
  remarks: "Excellent improvement in adavus.",
};

const attendance = [
  { id: "a1", enrollmentId: "enr1", classId: "cls1", className: "Nattuvangam", studentUid: "uid1", studentName: "Samvidha", studentId: "STU1", date: "2026-08-07", status: "present", markedBy: "admin" },
  { id: "a2", enrollmentId: "enr1", classId: "cls1", className: "Nattuvangam", studentUid: "uid1", studentName: "Samvidha", studentId: "STU1", date: "2026-08-13", status: "present", markedBy: "admin" },
  { id: "a3", enrollmentId: "enr1", classId: "cls1", className: "Nattuvangam", studentUid: "uid1", studentName: "Samvidha", studentId: "STU1", date: "2026-08-14", status: "absent", markedBy: "admin" },
];

beforeEach(() => {
  listMyAttendance.mockReset().mockResolvedValue(attendance);
  listMyProgressReports.mockReset().mockResolvedValue([report]);
});

const renderPage = async (Component: React.ComponentType) => {
  render(<MemoryRouter><Component /></MemoryRouter>);
  await waitFor(() => expect(listMyProgressReports).toHaveBeenCalled());
};

/**
 * Wait for the loaded page. Re-QUERIES on every attempt: both pages swap their
 * whole subtree when the fetch resolves, so an element captured by findBy*
 * before that swap is already detached by the time it is asserted on.
 */
const settled = (text: string | RegExp) =>
  waitFor(() => expect(screen.getByText(text)).toBeInTheDocument());

describe("student Progress page", () => {
  it("is titled Progress and shows the published report", async () => {
    const { default: Progress } = await import("@/pages/account/Progress");
    await renderPage(Progress);

    expect(screen.getByText("My Progress")).toBeInTheDocument();
    await settled("Grade A");
    // "August 2026" is both the report period and the attendance month heading.
    expect(screen.getAllByText("August 2026").length).toBeGreaterThan(0);
    expect(screen.getByText("Rhythm")).toBeInTheDocument();
    expect(screen.getByText("Excellent improvement in adavus.")).toBeInTheDocument();
  });

  it("shows the attendance that backs the report up", async () => {
    const { default: Progress } = await import("@/pages/account/Progress");
    await renderPage(Progress);

    await settled("Attendance record");
    expect(screen.getByText("67%")).toBeInTheDocument(); // 2 attended of 3
    expect(screen.getByText("Latest grade")).toBeInTheDocument();
  });

  it("explains itself when nothing has been published yet", async () => {
    listMyProgressReports.mockResolvedValue([]);
    listMyAttendance.mockResolvedValue([]);
    const { default: Progress } = await import("@/pages/account/Progress");
    await renderPage(Progress);

    await settled(/No progress reports have been published yet/);
    expect(screen.getByText(/No attendance has been marked yet/)).toBeInTheDocument();
  });
});

describe("student dashboard", () => {
  it("carries Progress as its own card, linking to the page", async () => {
    const { default: StudentDashboard } = await import("@/pages/account/StudentDashboard");
    await renderPage(StudentDashboard);

    const link = await screen.findByRole("link", { name: /Progress/ });
    expect(link).toHaveAttribute("href", "/account/progress");
    await waitFor(() => expect(screen.getByText(/Latest report:/)).toBeInTheDocument());
    expect(screen.getByText(/August 2026/)).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
  });

  it("still invites the parent in before the first report exists", async () => {
    listMyProgressReports.mockResolvedValue([]);
    listMyAttendance.mockResolvedValue([]);
    const { default: StudentDashboard } = await import("@/pages/account/StudentDashboard");
    await renderPage(StudentDashboard);

    await waitFor(() => expect(screen.getByText(/Progress reports appear here as soon as/)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Progress/ })).toHaveAttribute("href", "/account/progress");
  });
});
