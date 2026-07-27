import { describe, expect, it } from "vitest";
import {
  buildEnrollmentRequestPayload,
  normalizeEnrollmentRequest,
  requestedClassLabel,
} from "./enrollmentRequests";

describe("normalizeEnrollmentRequest", () => {
  it("reads a multi-class request", () => {
    const request = normalizeEnrollmentRequest("r1", {
      studentName: "Asha",
      classes: [
        { classId: "c1", className: "Vocal", slotId: "s1", slotLabel: "Mon 6PM" },
        { classId: "c2", className: "Veena" },
      ],
    });
    expect(request.classes).toHaveLength(2);
    expect(request.classes.map((c) => c.className)).toEqual(["Vocal", "Veena"]);
    expect(request.classes[0].slotLabel).toBe("Mon 6PM");
    expect(request.classes[1].slotId).toBeUndefined();
  });

  it("synthesises one class from a LEGACY single-class lead", () => {
    const request = normalizeEnrollmentRequest("r2", {
      studentName: "Ravi",
      classId: "c9",
      className: "Bharatanatyam",
      slotId: "s9",
      slotLabel: "Sat 10AM",
    });
    expect(request.classes).toEqual([
      { classId: "c9", className: "Bharatanatyam", slotId: "s9", slotLabel: "Sat 10AM" },
    ]);
    // Legacy flat fields stay readable for old UI paths.
    expect(request.classId).toBe("c9");
    expect(request.className).toBe("Bharatanatyam");
  });

  it("mirrors classes[0] back onto the flat fields for a multi-class lead", () => {
    const request = normalizeEnrollmentRequest("r3", {
      classes: [
        { classId: "c1", className: "Vocal", slotLabel: "Mon 6PM" },
        { classId: "c2", className: "Veena" },
      ],
    });
    expect(request.classId).toBe("c1");
    expect(request.className).toBe("Vocal");
    expect(request.slotLabel).toBe("Mon 6PM");
  });

  it("is empty-safe when there is no class at all", () => {
    const request = normalizeEnrollmentRequest("r4", { studentName: "Nobody" });
    expect(request.classes).toEqual([]);
    expect(request.classId).toBe("");
  });

  it("drops class rows with no classId", () => {
    const request = normalizeEnrollmentRequest("r5", {
      classes: [{ classId: "", className: "Ghost" }, { classId: "c2", className: "Veena" }],
    });
    expect(request.classes.map((c) => c.classId)).toEqual(["c2"]);
  });
});

describe("buildEnrollmentRequestPayload", () => {
  const base = {
    studentName: " Asha ",
    age: 12,
    gender: "female" as const,
    parentName: " Meera ",
    phone: " 9876543210 ",
    address: " 4th Street ",
  };

  it("writes the classes array and mirrors the first class flat", () => {
    const payload = buildEnrollmentRequestPayload({
      ...base,
      classes: [
        { classId: "c1", className: " Vocal ", slotId: "s1", slotLabel: "Mon 6PM" },
        { classId: "c2", className: "Veena" },
      ],
    });
    expect(payload.classes).toHaveLength(2);
    expect(payload.classes[0]).toEqual({ classId: "c1", className: "Vocal", slotId: "s1", slotLabel: "Mon 6PM" });
    expect(payload.classId).toBe("c1");
    expect(payload.className).toBe("Vocal");
    expect(payload.studentName).toBe("Asha");
    expect(payload.whatsapp).toBe("9876543210"); // falls back to phone
  });

  // REGRESSION GUARD: Firestore rejects undefined outright (no
  // ignoreUndefinedProperties) — a single undefined slot field would make the
  // whole addDoc throw and the lead would silently never be created.
  it("never emits undefined anywhere in the payload", () => {
    const payload = buildEnrollmentRequestPayload({
      ...base,
      email: undefined,
      whatsapp: undefined,
      classes: [{ classId: "c1", className: "Vocal" }], // no slot at all
    });
    const seen: string[] = [];
    const walk = (value: unknown, path: string) => {
      expect(value, `${path} must not be undefined`).not.toBeUndefined();
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
      }
      if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
      seen.push(path);
    };
    walk(payload, "payload");
    expect(seen.length).toBeGreaterThan(0);
    expect("slotId" in payload.classes[0]).toBe(false);
    expect("slotLabel" in payload.classes[0]).toBe(false);
  });

  it("keeps only classes that have a classId", () => {
    const payload = buildEnrollmentRequestPayload({
      ...base,
      classes: [{ classId: "", className: "Ghost" }, { classId: "c2", className: "Veena" }],
    });
    expect(payload.classes.map((c) => c.classId)).toEqual(["c2"]);
  });
});

describe("requestedClassLabel", () => {
  it("joins every requested class with its slot", () => {
    expect(requestedClassLabel([
      { classId: "c1", className: "Vocal", slotLabel: "Mon 6PM" },
      { classId: "c2", className: "Veena" },
    ])).toBe("Vocal · Mon 6PM + Veena");
  });

  it("handles an empty list", () => {
    expect(requestedClassLabel([])).toBe("—");
  });
});
