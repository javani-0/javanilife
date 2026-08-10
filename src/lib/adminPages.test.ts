import { describe, expect, it } from "vitest";
import {
  classesForTeacher,
  firstAllowedPath,
  managerCanAccessPath,
  MANAGER_PAGES,
  pageKeyForPath,
  TEACHER_PAGES,
  teacherCanAccessPath,
} from "./adminPages";

describe("pageKeyForPath", () => {
  it("maps an admin path to its manager key", () => {
    expect(pageKeyForPath("/admin/attendance")).toBe("attendance");
    expect(pageKeyForPath("/admin/academics")).toBe("academics");
  });

  it("matches subpaths like /admin/orders/:id", () => {
    expect(pageKeyForPath("/admin/orders/abc123")).toBe("orders");
  });

  it("is null for admin-only pages with no manager key", () => {
    expect(pageKeyForPath("/admin/dashboard")).toBeNull();
    expect(pageKeyForPath("/admin/managers")).toBeNull();
  });
});

describe("managerCanAccessPath", () => {
  it("allows only the granted pages", () => {
    expect(managerCanAccessPath(["students"], "/admin/students")).toBe(true);
    expect(managerCanAccessPath(["students"], "/admin/finance")).toBe(false);
  });

  it("denies everything when no pages are granted", () => {
    expect(managerCanAccessPath([], "/admin/students")).toBe(false);
    expect(managerCanAccessPath(undefined, "/admin/students")).toBe(false);
  });
});

describe("firstAllowedPath", () => {
  it("lands a manager on their first allowed page in nav order", () => {
    expect(firstAllowedPath(["finance", "classes"])).toBe("/admin/classes");
  });

  it("is null when nothing is granted", () => {
    expect(firstAllowedPath([])).toBeNull();
  });
});

describe("teacher pages", () => {
  it("is exactly attendance + academics", () => {
    expect(TEACHER_PAGES.map((page) => page.key)).toEqual(["attendance", "academics"]);
  });

  it("lets a teacher open only those two", () => {
    expect(teacherCanAccessPath("/admin/attendance")).toBe(true);
    expect(teacherCanAccessPath("/admin/academics")).toBe(true);
  });

  // The whole point of the role: a teacher must never reach money or students.
  it("keeps a teacher out of fees, students, finance and settings", () => {
    for (const path of [
      "/admin/fee-collections",
      "/admin/students",
      "/admin/finance",
      "/admin/site-settings",
      "/admin/managers",
      "/admin/dashboard",
      "/admin/classes",
    ]) {
      expect(teacherCanAccessPath(path)).toBe(false);
    }
  });

  it("covers every teacher key with a real manager page definition", () => {
    for (const page of TEACHER_PAGES) {
      expect(MANAGER_PAGES.some((item) => item.key === page.key)).toBe(true);
    }
  });
});

describe("classesForTeacher", () => {
  const classes = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("keeps only the assigned classes", () => {
    expect(classesForTeacher(classes, ["a", "c"]).map((item) => item.id)).toEqual(["a", "c"]);
  });

  // Fail closed: a brand new teacher must not inherit the whole school.
  it("returns NOTHING when no class has been assigned yet", () => {
    expect(classesForTeacher(classes, [])).toEqual([]);
    expect(classesForTeacher(classes, undefined)).toEqual([]);
  });

  it("ignores assignments for classes that no longer exist", () => {
    expect(classesForTeacher(classes, ["a", "deleted"]).map((item) => item.id)).toEqual(["a"]);
  });
});
