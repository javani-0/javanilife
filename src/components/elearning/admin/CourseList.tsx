// Courses tab: grid of course cards with Edit / Preview / Delete, plus the
// "how it works" empty state.
import { useState } from "react";
import { AlertTriangle, BookOpen, ExternalLink, ImageOff, Loader2, Pencil, Plus, QrCode, Smartphone, Star, Trash2, UploadCloud, Video } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatPaiseAsRupees } from "@/lib/ecommerce/pricing";
import { deleteCourse, formatTotalDuration, type ElearnCourse } from "@/lib/elearning";
import { StatusPill, primaryButton, secondaryButton } from "./ui";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: UploadCloud, title: "Upload videos to Vimeo or YouTube", body: "Upload each lesson to Vimeo (best) or YouTube as Unlisted, and copy its link." },
  { icon: BookOpen, title: "Create the course", body: "Add the title, cover, price and how students can pay." },
  { icon: Video, title: "Add lessons", body: "Paste each video link into the curriculum, then publish." },
];

const CourseList = ({
  courses,
  state,
  onNew,
  onEdit,
}: {
  courses: ElearnCourse[];
  state: "loading" | "ready" | "error";
  onNew: () => void;
  onEdit: (course: ElearnCourse) => void;
}) => {
  const { toast } = useToast();
  const [toDelete, setToDelete] = useState<ElearnCourse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteCourse(toDelete.id);
      toast({ title: "Course deleted", description: `"${toDelete.title}" was removed. Purchase records are kept.` });
      setToDelete(null);
    } catch (error) {
      console.error("Course delete failed", error);
      toast({ title: "Could not delete the course", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (state === "loading") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading courses">
        {[0, 1, 2].map((key) => (
          <div key={key} className="overflow-hidden rounded-xl border border-border/70 bg-card">
            <Skeleton className="aspect-video w-full rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-9 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 bg-card p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive" aria-hidden="true" />
        <p className="mt-2 font-body text-sm font-semibold text-foreground">Couldn't load the courses.</p>
        <p className="mt-1 font-body text-sm text-muted-foreground">Check your connection and reload the page. If it keeps happening, your account may not have E-Learning access.</p>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="rounded-2xl border border-gold/40 bg-card p-6 shadow-sm sm:p-10">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">Create your first online course</h2>
          <p className="mt-2 font-body text-sm text-muted-foreground">Students buy the course on your site and watch the lessons right here. Three steps:</p>
        </div>
        <ol className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-xl border border-border/70 bg-ivory/60 p-4 text-left">
              <span className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-body text-sm font-semibold text-primary-foreground" aria-hidden="true">{index + 1}</span>
                <step.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </span>
              <p className="mt-3 font-body text-sm font-semibold text-foreground">{step.title}</p>
              <p className="mt-1 font-body text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 text-center">
          <button type="button" onClick={onNew} className={primaryButton}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New course
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-body text-sm text-muted-foreground">
          {courses.length} course{courses.length === 1 ? "" : "s"} · {courses.filter((course) => course.status === "published").length} published
        </p>
        <button type="button" onClick={onNew} className={primaryButton}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New course
        </button>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {courses.map((course) => (
          <li key={course.id} className="flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-card">
            <div className="relative aspect-video bg-ivory">
              {course.coverImageUrl ? (
                <img src={course.coverImageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full flex-col items-center justify-center gap-1 font-body text-xs text-muted-foreground">
                  <ImageOff className="h-6 w-6" aria-hidden="true" /> No cover yet
                </span>
              )}
              <span className="absolute left-3 top-3 flex items-center gap-1.5">
                <StatusPill status={course.status} />
                {course.featured && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-card/95 px-2 py-0.5 font-body text-[0.72rem] font-semibold text-primary ring-1 ring-gold/60">
                    <Star className="h-3 w-3 fill-gold text-gold" aria-hidden="true" /> Featured
                  </span>
                )}
              </span>
            </div>

            <div className="flex flex-1 flex-col p-4">
              <h3 className="font-display text-xl font-semibold leading-tight text-foreground">{course.title || "Untitled course"}</h3>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-body text-sm">
                <span className="font-semibold text-foreground">{course.priceInPaise > 0 ? formatPaiseAsRupees(course.priceInPaise) : "No price set"}</span>
                {course.compareAtInPaise && course.compareAtInPaise > course.priceInPaise ? (
                  <span className="text-muted-foreground line-through">{formatPaiseAsRupees(course.compareAtInPaise)}</span>
                ) : null}
                <span className="text-muted-foreground">· {course.accessDays > 0 ? `${course.accessDays} days access` : "Lifetime access"}</span>
              </p>
              <p className="mt-1 font-body text-sm tabular-nums text-muted-foreground">
                {course.lessonCount} lesson{course.lessonCount === 1 ? "" : "s"}
                {course.totalDurationSec > 0 ? ` · ${formatTotalDuration(course.totalDurationSec)}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Payment modes">
                {course.paymentModes.razorpay && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-body text-xs font-medium text-foreground"><Smartphone className="h-3 w-3" aria-hidden="true" /> Razorpay</span>
                )}
                {course.paymentModes.upi && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-body text-xs font-medium text-foreground"><QrCode className="h-3 w-3" aria-hidden="true" /> QR scan</span>
                )}
                {!course.paymentModes.razorpay && !course.paymentModes.upi && (
                  <span className="rounded-md bg-amber-50 px-2 py-0.5 font-body text-xs font-medium text-amber-900">No payment mode</span>
                )}
              </div>

              <div className="mt-auto flex items-center gap-2 pt-4">
                <button type="button" onClick={() => onEdit(course)} className={cn(primaryButton, "flex-1 py-2")}>
                  <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
                </button>
                <a href={`/learn/${course.id}`} target="_blank" rel="noreferrer" className={cn(secondaryButton, "px-3 py-2")} aria-label={`Preview ${course.title} in a new tab`}>
                  <ExternalLink className="h-4 w-4" aria-hidden="true" /> Preview
                </a>
                <button type="button" onClick={() => setToDelete(course)} className={cn(secondaryButton, "px-3 py-2 hover:border-destructive/40 hover:text-destructive")} aria-label={`Delete ${course.title}`}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => { if (!open && !deleting) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">Delete "{toDelete?.title || "this course"}"?</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              The course page, its lessons and the video links are removed for everyone, including students who bought it. Purchase records stay in Purchases. This cannot be undone.
              {toDelete?.status === "published" ? " Tip: to only hide it from new buyers, open it and press Unpublish instead." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep course</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => { event.preventDefault(); void confirmDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />} Delete course
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CourseList;
