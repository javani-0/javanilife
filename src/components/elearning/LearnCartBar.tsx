import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, X } from "lucide-react";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import { hasActiveAccess, type ElearnCourse } from "@/lib/elearning";
import { learnCart, useLearnCart } from "./learnCart";
import { useMyEnrollments } from "./useElearn";

/** The cart's master classes that can still be bought (published, paid, not owned or waiting). */
export const useCartCourses = (courses: ElearnCourse[]) => {
  const ids = useLearnCart();
  const { enrollments } = useMyEnrollments();
  return useMemo(() => {
    const blocked = new Set(enrollments.filter((e) => hasActiveAccess(e) || e.status === "processing").map((e) => e.courseId));
    return ids
      .map((id) => courses.find((course) => course.id === id))
      .filter((course): course is ElearnCourse => !!course && course.priceInPaise > 0 && !blocked.has(course.id));
  }, [ids, courses, enrollments]);
};

/** Checkout opens the first class's page with the buy window and the whole cart in it. */
export const cartCheckoutHref = (items: ElearnCourse[], search = "") => {
  const params = new URLSearchParams(search);
  params.set("cart", "1");
  return `/learn/${encodeURIComponent(items[0].id)}?${params.toString()}`;
};

/** Sticky bar at the bottom of the master classes page while the cart has classes. */
const LearnCartBar = ({ courses, search = "" }: { courses: ElearnCourse[]; search?: string }) => {
  const items = useCartCourses(courses);
  if (!items.length) return null;
  const total = items.reduce((sum, item) => sum + item.priceInPaise, 0);
  return (
    <>
    {/* Room at the page end so the bar never covers the last cards. */}
    <div className="h-24" aria-hidden="true" />
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/20 bg-card/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-4 pr-[92px] pt-3 shadow-[0_-12px_30px_-18px_rgba(51,35,20,0.45)] backdrop-blur supports-[backdrop-filter]:bg-card/85" role="region" aria-label="Your cart">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <ShoppingBag className="h-5 w-5" aria-hidden="true" />
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 font-body text-[0.7rem] font-bold text-primary-foreground">{items.length}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="whitespace-nowrap font-body text-sm font-semibold text-foreground">
            {formatPaiseAsRupees(total)} <span className="font-normal text-muted-foreground">· {items.length === 1 ? "1 class" : `${items.length} classes`}</span>
          </p>
          <p className="truncate font-body text-xs text-muted-foreground">{items.map((item) => item.title).join(", ")}</p>
        </div>
        <button type="button" onClick={() => learnCart.clear()} className="hidden min-h-11 items-center gap-1 rounded-full px-3 font-body text-xs font-semibold text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:inline-flex">
          <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear
        </button>
        <Link to={cartCheckoutHref(items, search)} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-gradient-primary px-6 font-body text-sm font-semibold text-primary-foreground shadow-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.97]">
          Checkout
        </Link>
      </div>
    </div>
    </>
  );
};

export default LearnCartBar;
