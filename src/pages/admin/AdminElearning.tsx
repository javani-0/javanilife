// Admin → E-Learning: Courses (list + full-page editor) and Purchases (QR
// approvals, active access, grants). Data is live from Firestore.
import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CourseEditor from "@/components/elearning/admin/CourseEditor";
import CourseList from "@/components/elearning/admin/CourseList";
import PurchasesPanel from "@/components/elearning/admin/PurchasesPanel";
import { subscribeAllCourses, subscribeStaffEnrollments, type ElearnCourse, type ElearnEnrollment } from "@/lib/elearning";
import { subscribeToPaymentSettings, type PaymentSettings } from "@/lib/settings/paymentSettings";

type LoadState = "loading" | "ready" | "error";

const AdminElearning = () => {
  const [tab, setTab] = useState("courses");
  const [courses, setCourses] = useState<ElearnCourse[]>([]);
  const [coursesState, setCoursesState] = useState<LoadState>("loading");
  const [enrollments, setEnrollments] = useState<ElearnEnrollment[]>([]);
  const [enrollmentsState, setEnrollmentsState] = useState<LoadState>("loading");
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  /** null = list; "new" = new course; otherwise the course being edited. */
  const [editing, setEditing] = useState<ElearnCourse | "new" | null>(null);

  useEffect(() => subscribeAllCourses(
    (next) => { setCourses(next); setCoursesState("ready"); },
    (error) => { console.error("Courses subscription failed", error); setCoursesState("error"); },
  ), []);
  useEffect(() => subscribeStaffEnrollments(
    {},
    (next) => { setEnrollments(next); setEnrollmentsState("ready"); },
    (error) => { console.error("Enrollments subscription failed", error); setEnrollmentsState("error"); },
  ), []);
  useEffect(() => subscribeToPaymentSettings(setPaymentSettings, (error) => console.error("Payment settings subscription failed", error)), []);

  const pending = enrollments.filter((item) => item.status === "processing").length;

  if (editing !== null) {
    return (
      <CourseEditor
        key={editing === "new" ? "new" : editing.id}
        course={editing === "new" ? null : editing}
        allCourses={courses}
        paymentSettings={paymentSettings}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-primary">Online master classes</p>
        <h1 className="mt-2 flex items-center gap-2 font-display text-3xl text-foreground">
          <GraduationCap className="h-7 w-7 text-gold" aria-hidden="true" /> E-Learning
        </h1>
        <p className="mt-1 max-w-2xl font-body text-sm text-muted-foreground">
          Sell recorded video master classes. Lessons are hosted on Vimeo and play only for students who bought the course.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto bg-muted/70 p-1">
          <TabsTrigger value="courses" className="px-4 py-2 font-body text-sm font-semibold">Courses</TabsTrigger>
          <TabsTrigger value="purchases" className="gap-2 px-4 py-2 font-body text-sm font-semibold">
            Purchases
            {pending > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground" aria-label={`${pending} waiting for approval`}>
                {pending}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="courses" className="mt-5">
          <CourseList courses={courses} state={coursesState} onNew={() => setEditing("new")} onEdit={(course) => setEditing(course)} />
        </TabsContent>
        <TabsContent value="purchases" forceMount className="mt-5 data-[state=inactive]:hidden">
          <PurchasesPanel enrollments={enrollments} state={enrollmentsState} courses={courses} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminElearning;
