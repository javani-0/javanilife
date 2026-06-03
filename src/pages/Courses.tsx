import { useState, useEffect, useMemo, type KeyboardEvent, type MouseEvent } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useContactInfo } from "@/hooks/useContactInfo";

import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SectionLabel from "@/components/SectionLabel";
import PrimaryButton from "@/components/PrimaryButton";
import SEO from "@/components/SEO";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { MessageCircle, Search, ShoppingBag, SlidersHorizontal } from "lucide-react";
import ShareButton from "@/components/ShareButton";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/hooks/use-toast";
import { useCourseCategories } from "@/hooks/useManagedCategories";
import {
  createCartItemFromCourse,
  getCourseAmountInPaise,
  getActiveCategories,
  getCourseDisplayPrice,
  isCoursePurchasable,
  normalizeCourse,
  type Course,
} from "@/lib/ecommerce";
import heroDancer1 from "@/assets/hero-dancer-1.jpg";
import heroDancer2 from "@/assets/hero-dancer-2.jpg";
import heroDancer3 from "@/assets/hero-dancer-3.jpg";

type CourseCategory = "all" | string;
type CourseSortMode = "featured" | "price-asc" | "price-desc" | "name";

const sortOptions: { label: string; value: CourseSortMode }[] = [
  { label: "Featured", value: "featured" },
  { label: "Fee: Low to High", value: "price-asc" },
  { label: "Fee: High to Low", value: "price-desc" },
  { label: "Name", value: "name" },
];

const badgeStyles: Record<string, string> = {
  red: "bg-primary text-primary-foreground",
  gold: "bg-gold text-gold-foreground",
  charcoal: "bg-charcoal text-charcoal-foreground",
};

const fieldControlClass = "h-10 sm:h-12 w-full rounded-md border border-gold/20 bg-card px-4 font-body text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-gold focus:ring-2 focus:ring-gold/20";

const SkeletonCard = () => (
  <div className="bg-card shadow-card rounded-lg overflow-hidden">
    <div className="aspect-[3/2] skeleton-shimmer" />
    <div className="p-5 sm:p-6 space-y-3">
      <div className="h-5 w-28 skeleton-shimmer rounded" />
      <div className="h-6 w-3/4 skeleton-shimmer rounded" />
      <div className="h-4 w-full skeleton-shimmer rounded" />
      <div className="h-4 w-2/3 skeleton-shimmer rounded" />
      <div className="h-10 w-40 skeleton-shimmer rounded" />
    </div>
  </div>
);

const ExtCourseCard = ({ course, delay = 0 }: { course: Course; delay?: number }) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const { ref, isVisible } = useScrollAnimation();
  const { whatsappNumber } = useContactInfo();
  const { addItem, setBuyNowItem } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();
  const purchasable = isCoursePurchasable(course);
  const whatsappMsg = encodeURIComponent(
    `Hi, I'm interested in the *${course.title}* course (${course.badge}) at Javani Spiritual Hub.\n\n${course.description}${course.extra ? `\n${course.extra}` : ""}\n\nPlease share more details.`
  );

  const openDetail = () => navigate(`/courses/${course.id}`);
  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail();
    }
  };

  const buyCourse = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!purchasable) return;

    const cartItem = createCartItemFromCourse(course);
    setBuyNowItem(cartItem);
    await addItem(cartItem);
    toast({ title: "Course ready for checkout", description: course.title });
    navigate("/checkout");
  };

  return (
    <div ref={ref} className={`${isVisible ? "animate-fade-up" : "opacity-0"}`} style={{ animationDelay: isVisible ? `${delay}s` : undefined }}>
      <div role="link" tabIndex={0} onClick={openDetail} onKeyDown={handleCardKeyDown} className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-lg border border-gold/15 bg-card shadow-[0_10px_28px_rgba(51,35,20,0.07)] transition-all duration-300 hover:-translate-y-1 hover:border-gold/40 hover:shadow-[0_14px_38px_rgba(51,35,20,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 lg:rounded-[1.1rem] lg:shadow-[0_18px_48px_rgba(51,35,20,0.08)]">
        <div className="relative aspect-square overflow-hidden bg-muted">
          {!imgLoaded && <div className="absolute inset-0 skeleton-shimmer" />}
          <img src={course.image} alt={course.title} loading="lazy" onLoad={() => setImgLoaded(true)} className={`h-full w-full object-cover transition-all duration-500 group-hover:scale-[1.035] ${imgLoaded ? "opacity-100" : "opacity-0"}`} />
          {course.status === "inactive" && (
            <div className="absolute top-3 right-3 bg-red-500 text-white px-3 py-1 text-xs font-body font-semibold rounded-full shadow-lg">
              Not Available
            </div>
          )}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5 sm:p-3">
            <span className={`rounded-full px-2.5 py-1 font-body text-[0.68rem] font-semibold shadow-sm sm:text-xs ${badgeStyles[course.badgeColor] || badgeStyles.red}`}>{course.categoryLabel || course.badge}</span>
            <ShareButton
              title={course.title}
              text={`Check out *${course.title}* (${course.badge}) at Javani Spiritual Hub — *${getCourseDisplayPrice(course)}*`}
              url={`/courses/${course.id}`}
              imageUrl={course.image}
              className="h-8 w-8 rounded-full bg-black/45 text-white hover:bg-black/65 hover:text-white"
            />
          </div>
        </div>
        <div className="flex flex-1 flex-col p-3.5 sm:p-4.5 lg:p-5">
          <h3 className="text-left font-display text-[0.98rem] font-semibold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-[1.08rem] lg:text-[1.22rem]"><span className="line-clamp-2">{course.title}</span></h3>
          <p className="mt-2 line-clamp-2 min-h-[2.6rem] text-left font-body text-xs leading-relaxed text-muted-foreground sm:text-[0.82rem]">{course.description || "Structured classical arts learning with Javani Spiritual Hub."}</p>
          {course.extra && <p className="mt-2 line-clamp-1 rounded-md bg-muted/60 px-2.5 py-1.5 font-body text-[0.72rem] font-semibold text-muted-foreground">{course.extra}</p>}
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="font-display text-[1.05rem] font-bold text-primary sm:text-[1.28rem]">{getCourseDisplayPrice(course)}</p>
            <span className={`rounded-full px-2 py-1 font-body text-[0.65rem] font-semibold ${badgeStyles[course.badgeColor] || badgeStyles.red}`}>{course.badge}</span>
          </div>
          <div className="mt-auto grid gap-2 pt-4 sm:grid-cols-2">
            <button type="button" onClick={buyCourse} disabled={!purchasable} className="flex min-h-10 items-center justify-center gap-1.5 rounded-sm bg-gradient-primary px-3 py-2 font-body text-[0.75rem] font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 sm:text-[0.82rem]">
              <ShoppingBag className="w-3 h-3 sm:w-4 sm:h-4" /> {purchasable ? "Buy Now" : "Fee Soon"}
            </button>
            <a
              href={`https://wa.me/${whatsappNumber}?text=${whatsappMsg}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-sm bg-[#25D366] px-3 py-2 font-body text-[0.75rem] font-semibold text-white transition-colors hover:bg-[#128C7E] sm:text-[0.82rem]"
            >
              <MessageCircle className="w-3 h-3 sm:w-4 sm:h-4" /> WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

const CourseSection = ({ category, title, description, courses, bgClass }: {
  category: string;
  title: string;
  description: string;
  courses: Course[];
  bgClass: string;
}) => {
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();
  return (
    <section className={`py-8 sm:py-12 md:py-16 ${bgClass}`} style={!bgClass ? { background: "hsl(var(--bg-section))" } : undefined}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div ref={headerRef} className={`${headerVisible ? "animate-fade-up" : "opacity-0"}`}>
          <SectionLabel text={category} className="mb-6" />
          <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[2.8rem] text-primary mb-3">{title}</h2>
          <p className="font-body font-light text-[0.95rem] sm:text-[1rem] text-muted-foreground mb-10 sm:mb-12 max-w-2xl">{description}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
          {courses.map((c, i) => <ExtCourseCard key={c.id} course={c} delay={i * 0.12} />)}
        </div>
      </div>
    </section>
  );
};

const tableData = [
  ["Duration", "Grade-based (1–5 yrs)", "Advanced (2 yrs)", "Flexible", "Intensive (1-3 days)", "Flexible sessions", "Progressive levels"],
  ["Certificate", "✅ Recognized", "✅ University-Linked", "❌ Not Applicable", "✅ Participation", "✅ On Completion", "✅ Grade-based"],
  ["Examination", "✅ Grade Exams", "✅ 4 semesters", "Internal exam", "❌ No Exam", "❌ No Exam", "✅ Level Tests"],
  ["Experience", "Beginners", "Intermediates", "Beginners", "All levels", "Beginners", "Intermediates"],
  ["Ideal For", "Serious learners", "Career artists", "Beginners, hobby", "Skill enhancement", "Wellness seekers", "Rhythm enthusiasts"],
];

const ComparisonTable = () => {
  const { ref, isVisible } = useScrollAnimation();
  const { whatsappNumber } = useContactInfo();
  const whatsappMsg = encodeURIComponent(
    "Hi, I'm interested in learning more about your courses at Javani Spiritual Hub. Could you please share more details?"
  );

  return (
    <section className="py-16 sm:py-20 md:py-32 bg-background">
      <div ref={ref} className={`max-w-5xl mx-auto px-4 sm:px-6 ${isVisible ? "animate-fade-up" : "opacity-0"}`}>
        <SectionLabel text="FIND YOUR TRACK" className="mb-6" />
        <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[3rem] text-foreground text-center mb-10 sm:mb-12">Which Course Is Right for You?</h2>
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[600px] border-collapse">
            <thead>
              <tr className="bg-primary text-primary-foreground">
                <th className="p-3 sm:p-4 text-left font-display font-semibold text-[0.85rem] sm:text-[0.95rem]">Feature</th>
                <th className="p-3 sm:p-4 text-left font-display font-semibold text-[0.85rem] sm:text-[0.95rem]">Grades</th>
                <th className="p-3 sm:p-4 text-left font-display font-semibold text-[0.85rem] sm:text-[0.95rem]">Diploma</th>
                <th className="p-3 sm:p-4 text-left font-display font-semibold text-[0.85rem] sm:text-[0.95rem]">Pre-Grade</th>
                <th className="p-3 sm:p-4 text-left font-display font-semibold text-[0.85rem] sm:text-[0.95rem]">Masterclass</th>
                <th className="p-3 sm:p-4 text-left font-display font-semibold text-[0.85rem] sm:text-[0.95rem]">Yoga</th>
                <th className="p-3 sm:p-4 text-left font-display font-semibold text-[0.85rem] sm:text-[0.95rem]">Konnakol</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-ivory" : "bg-card"}>
                  {row.map((cell, j) => (
                    <td key={j} className={`p-3 sm:p-4 border-l border-gold/10 ${j === 0 ? "font-display font-semibold text-foreground" : "font-body text-[0.8rem] sm:text-[0.9rem] text-muted-foreground"}`}>
                      {cell.startsWith("✅") ? (
                        <span><span className="inline-block w-5 h-5 rounded-full bg-green-100 text-green-600 text-center text-xs leading-5 mr-2">✓</span>{cell.slice(2)}</span>
                      ) : cell.startsWith("❌") ? (
                        <span><span className="inline-block w-5 h-5 rounded-full bg-red-50 text-red-400 text-center text-xs leading-5 mr-2">✗</span>{cell.slice(2)}</span>
                      ) : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-center mt-8 sm:mt-10">
          <a
            href={`https://wa.me/${whatsappNumber}?text=${whatsappMsg}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <PrimaryButton>Enquire About a Course</PrimaryButton>
          </a>
        </div>
      </div>
    </section>
  );
};

const Courses = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  // Initialise the category filter from the URL so a shared /courses?category=…
  // link opens on that category.
  const [activeFilter, setActiveFilter] = useState<CourseCategory>(() => searchParams.get("category") || "all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortMode, setSortMode] = useState<CourseSortMode>("featured");
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const { categories: courseCategories } = useCourseCategories();
  const activeCourseCategories = useMemo(() => getActiveCategories(courseCategories), [courseCategories]);
  const filters = useMemo(() => [
    { label: "All Courses", value: "all" },
    ...activeCourseCategories.map((category) => ({ label: category.label, value: category.id })),
  ], [activeCourseCategories]);

  // Select a category and reflect it in the URL (so it can be shared / restored).
  const selectCategory = (value: CourseCategory) => {
    setActiveFilter(value);
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value && value !== "all") next.set("category", value);
      else next.delete("category");
      return next;
    });
  };

  // Drop an unknown category from a shared URL once categories have loaded.
  useEffect(() => {
    if (activeFilter === "all" || filters.length <= 1) return;
    if (!filters.some((filter) => filter.value === activeFilter)) selectCategory("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Keep state in sync with back/forward navigation.
  useEffect(() => {
    const urlCategory = searchParams.get("category") || "all";
    if (urlCategory !== activeFilter) setActiveFilter(urlCategory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const activeCategoryLabel = filters.find((filter) => filter.value === activeFilter)?.label || "All Courses";
  const categoryShareUrl = activeFilter && activeFilter !== "all" ? `/courses?category=${encodeURIComponent(activeFilter)}` : "/courses";

  useEffect(() => {
    const q = query(collection(db, "courses"));
    const unsub = onSnapshot(q, (snap) => {
      setCourses(snap.docs.map((d) => normalizeCourse(d.id, d.data(), courseCategories)));
      setLoading(false);
    }, () => { setLoading(false); });
    return unsub;
  }, [courseCategories]);

  const visibleCourses = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return courses
      .filter((course) => course.status !== "inactive")
      .filter((course) => {
        if (!normalizedSearch) return true;
        return [course.title, course.description, course.badge, course.categoryLabel, course.extra]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalizedSearch));
      })
      .sort((firstCourse, secondCourse) => {
        if (sortMode === "price-asc") return getCourseAmountInPaise(firstCourse) - getCourseAmountInPaise(secondCourse);
        if (sortMode === "price-desc") return getCourseAmountInPaise(secondCourse) - getCourseAmountInPaise(firstCourse);
        if (sortMode === "name") return firstCourse.title.localeCompare(secondCourse.title);
        return Number(secondCourse.featured === true) - Number(firstCourse.featured === true) || firstCourse.title.localeCompare(secondCourse.title);
      });
  }, [courses, searchTerm, sortMode]);

  const courseSections = useMemo(() => activeCourseCategories
    .map((category, index) => ({
      category,
      bgClass: index % 2 === 0 ? "bg-background" : "",
      courses: visibleCourses.filter((course) => course.category === category.id),
    }))
    .filter((section) => (activeFilter === "all" || activeFilter === section.category.id) && section.courses.length > 0), [activeCourseCategories, activeFilter, visibleCourses]);
  const hasAny = courseSections.length > 0;

  return (
    <>
      <SEO
        title="Courses | Bharatanatyam, Kuchipudi, Carnatic Music & More | Javani Spiritual Hub"
        description="Explore grades, diploma, pre-grade, masterclass & workshops, yoga, and konnakol courses in classical Indian arts including Bharatanatyam, Kuchipudi, Carnatic Music, and more at Javani Spiritual Hub."
      />
      <main>
        <PageHero backgroundImages={[heroDancer1, heroDancer2, heroDancer3]} label="OUR COURSES" heading="Our Sacred Courses" subtext="Classical arts for every soul — from first steps to national certification." size="compact" />

        <div className="z-[500] border-b border-gold/10 bg-background py-3 shadow-[0_10px_30px_rgba(51,35,20,0.08)] sm:sticky sm:top-[80px] sm:py-4">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid gap-3 sm:grid-cols-[1fr_220px] lg:w-[560px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className={`${fieldControlClass} pl-10`}
                  placeholder="Search courses"
                />
              </label>
              <label className="relative block">
                <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as CourseSortMode)} className={`${fieldControlClass} pl-10`}>
                  {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2 lg:max-w-[600px]">
              <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:justify-end lg:overflow-visible lg:pb-0">
                {filters.map((filter) => (
                  <button key={filter.value} type="button" onClick={() => selectCategory(filter.value)} className={`shrink-0 rounded-full px-4 py-2 font-body text-[0.78rem] font-semibold transition-all duration-300 sm:text-[0.85rem] ${activeFilter === filter.value ? "bg-gradient-primary text-primary-foreground shadow-sm" : "border border-gold/20 bg-card text-muted-foreground hover:border-gold/50 hover:text-foreground"}`}>
                    {filter.label}
                  </button>
                ))}
              </div>
              <ShareButton
                title={`${activeCategoryLabel} — Javani Spiritual Hub`}
                text={activeFilter === "all" ? "Browse courses at Javani Spiritual Hub" : `Browse *${activeCategoryLabel}* courses at Javani Spiritual Hub`}
                url={categoryShareUrl}
                className="h-9 w-9 flex-shrink-0 self-start rounded-full border border-gold/20 bg-card"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <section className="py-16 sm:py-20 md:py-32 bg-background">
            <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
              {[0, 1, 2].map((item) => <SkeletonCard key={item} />)}
            </div>
          </section>
        ) : !hasAny && !loading ? (
          <div className="py-20 text-center">
            <p className="font-display text-xl text-muted-foreground">No courses available at the moment.</p>
          </div>
        ) : (
          <>
            {courseSections.map((section) => (
              <CourseSection
                key={section.category.id}
                category={section.category.sectionLabel}
                title={`${section.category.label} Courses`}
                description={section.category.description}
                courses={section.courses}
                bgClass={section.bgClass}
              />
            ))}
          </>
        )}

        <ComparisonTable />
      </main>
      <div className="hidden sm:block"><Footer /></div>
    </>
  );
};

export default Courses;
