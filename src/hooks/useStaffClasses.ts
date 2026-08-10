import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { classesForTeacher } from "@/lib/adminPages";
import { subscribeToClasses, type ClassDoc } from "@/lib/classes";

// ---------------------------------------------------------------------------
// The classes the signed-in staff member may work with (req 1).
//
// Admins and managers see every class. A TEACHER sees only the classes
// assigned to them, so every class picker in the console is scoped the same
// way without each page re-implementing the filter.
// ---------------------------------------------------------------------------

export interface StaffClasses {
  classes: ClassDoc[];
  /** True when the viewer is a teacher (drives the empty-state wording). */
  isTeacher: boolean;
  /** A teacher with no class assigned yet — they can't do anything until one is. */
  awaitingAssignment: boolean;
}

export const useStaffClasses = (): StaffClasses => {
  const { userProfile } = useAuth();
  const [allClasses, setAllClasses] = useState<ClassDoc[]>([]);

  useEffect(() => subscribeToClasses(setAllClasses, () => undefined), []);

  const isTeacher = userProfile?.role === "teacher";

  const classes = useMemo(
    () => (isTeacher ? classesForTeacher(allClasses, userProfile?.teacherClassIds) : allClasses),
    [isTeacher, allClasses, userProfile?.teacherClassIds],
  );

  return {
    classes,
    isTeacher,
    awaitingAssignment: isTeacher && classes.length === 0,
  };
};
