import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BookOpen, Search } from "lucide-react";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import { PageSEO } from "@/components/SEO";
import CourseCard, { CourseCardSkeleton } from "@/components/elearning/CourseCard";
import { useMyEnrollments, usePublishedCourses } from "@/components/elearning/useElearn";
import { hasActiveAccess, toMillis, type ElearnCourse } from "@/lib/elearning";
import heroTemple from "@/assets/hero-temple.jpg";
import heroDancer2 from "@/assets/hero-dancer-2.jpg";

type SortKey = "recommended" | "newest" | "price-asc" | "price-desc";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
];

const sortCourses = (list: ElearnCourse[], sort: SortKey) => {
  const copy = [...list];
  if (sort === "newest") copy.sort((a, b) => (toMillis(b.createdAt) ?? 0) - (toMillis(a.createdAt) ?? 0));
  else if (sort === "price-asc") copy.sort((a, b) => a.priceInPaise - b.priceInPaise);
  else if (sort === "price-desc") copy.sort((a, b) => b.priceInPaise - a.priceInPaise);
  return copy; // "recommended" keeps the admin's order (featured, then sortOrder).
};

const Learn = () => {
  const { search: rawSearch } = useLocation();
  const linkSearch = import.meta.env.DEV && new URLSearchParams(rawSearch).has("demo") ? rawSearch : "";
  const { courses, loading, error } = usePublishedCourses();
  const { enrollments } = useMyEnrollments();
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recommended");

  const ownedIds = useMemo(() => {
    const now = Date.now();
    return new Set(enrollments.filter((e) => hasActiveAccess(e, now)).map((e) => e.courseId));
  }, [enrollments]);

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const course of courses) {
      const label = course.category.trim();
      if (label && !seen.has(label.toLowerCase())) seen.set(label.toLowerCase(), label);
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [courses]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = courses.filter((course) => {
      if (category !== "all" && course.category.trim().toLowerCase() !== category) return false;
      if (!q) return true;
      return [course.title, course.subtitle, course.category, course.instructorName].some((field) => field.toLowerCase().includes(q));
    });
    return sortCourses(filtered, sort);
  }, [courses, category, query, sort]);

  const hasCourses = courses.length > 0;

  return (
    <>
      <PageSEO path="/learn" />
      <main>
        <PageHero
          backgroundImages={[heroTemple, heroDancer2]}
          label="E-LEARNING"
          heading="Online Courses"
          subtext="Recorded video courses from Javani Spiritual Hub. Pay once, then learn at your own pace on any device."
          breadcrumb={[{ label: "Home", path: "/" }, { label: "E-Learning" }]}
          size="compact"
        />

        <section className="bg-background pb-16 pt-8 sm:pb-24 sm:pt-12" aria-labelledby="learn-courses-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <h2 id="learn-courses-heading" className="sr-only">All online courses</h2>

            {(loading || hasCourses) && (
              <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by category">
                  {[{ value: "all", label: "All courses" }, ...categories].map((chip) => {
                    const active = category === chip.value;
                    return (
                      <button
                        key={chip.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setCategory(chip.value)}
                        className={`shrink-0 rounded-full border px-4 py-2 font-body text-[0.82rem] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.97] ${
                          active ? "border-primary bg-primary text-primary-foreground" : "border-gold/30 bg-card text-foreground hover:border-primary/50 hover:text-primary"
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-2 sm:gap-3 lg:w-[460px]">
                  <label className="relative block">
                    <span className="sr-only">Search courses</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search courses"
                      className="h-11 w-full rounded-lg border border-gold/25 bg-card pl-9 pr-3 font-body text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                  </label>
                  <label className="block">
                    <span className="sr-only">Sort courses</span>
                    <select
                      value={sort}
                      onChange={(event) => setSort(event.target.value as SortKey)}
                      className="h-11 rounded-lg border border-gold/25 bg-card px-3 font-body text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                </div>
              </div>
            )}

            {loading ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-7" aria-busy="true" aria-label="Loading courses">
                {Array.from({ length: 3 }, (_, i) => <CourseCardSkeleton key={i} />)}
              </div>
            ) : error && !hasCourses ? (
              <p className="rounded-xl border border-gold/15 bg-card p-8 text-center font-body text-sm text-muted-foreground">
                We couldn't load the courses. Please check your connection and refresh the page.
              </p>
            ) : !hasCourses ? (
              <div className="mx-auto max-w-xl rounded-2xl border border-gold/20 bg-card px-6 py-12 text-center shadow-card sm:px-10">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
                  <BookOpen className="h-6 w-6" aria-hidden="true" />
                </span>
                <h2 className="mt-5 font-display text-2xl font-semibold text-foreground sm:text-3xl">New online courses are coming soon</h2>
                <p className="mx-auto mt-3 max-w-md font-body text-sm leading-relaxed text-muted-foreground">
                  Until then, you can learn with us in person or live. See our monthly classes.
                </p>
                <Link
                  to="/classes"
                  className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-gradient-primary px-6 font-body text-sm font-semibold text-primary-foreground shadow-gold transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.97]"
                >
                  See classes
                </Link>
              </div>
            ) : visible.length === 0 ? (
              <div className="rounded-xl border border-gold/15 bg-card p-10 text-center">
                <p className="font-display text-xl font-semibold text-foreground">No courses match your search</p>
                <button
                  type="button"
                  onClick={() => { setQuery(""); setCategory("all"); }}
                  className="mt-4 rounded-md font-body text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-7">
                {visible.map((course, index) => (
                  <li key={course.id} className="motion-safe:animate-fade-up" style={{ animationDelay: `${Math.min(index, 8) * 50}ms`, animationFillMode: "both" }}>
                    <CourseCard course={course} owned={ownedIds.has(course.id)} search={linkSearch} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
      <div className="hidden sm:block"><Footer /></div>
    </>
  );
};

export default Learn;
