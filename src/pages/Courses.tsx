import { useState, useEffect, useMemo, type KeyboardEvent, type MouseEvent } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useContactInfo } from "@/hooks/useContactInfo";

import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SectionLabel from "@/components/SectionLabel";
import PrimaryButton from "@/components/PrimaryButton";
import SEO from "@/components/SEO";
import { Link, useNavigate } from "react-router-dom";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { MessageCircle, ArrowLeft, ShoppingBag } from "lucide-react";
import ShareButton from "@/components/ShareButton";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/hooks/use-toast";
import { useCourseCategories } from "@/hooks/useManagedCategories";
import {
  createCartItemFromCourse,
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

const badgeStyles: Record<string, string> = {
  red: "bg-primary text-primary-foreground",
  gold: "bg-gold text-gold-foreground",
  charcoal: "bg-charcoal text-charcoal-foreground",
};

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
      <div role="link" tabIndex={0} onClick={openDetail} onKeyDown={handleCardKeyDown} className="block cursor-pointer rounded-lg focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-background">
        <div className="bg-card shadow-card rounded-lg overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-hero group flex flex-col h-full">
        <div className="aspect-square sm:aspect-[3/2] relative overflow-hidden">
          {!imgLoaded && <div className="absolute inset-0 skeleton-shimmer" />}
          <img src={course.image} alt={course.title} loading="lazy" onLoad={() => setImgLoaded(true)} className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-[1.06] ${imgLoaded ? "opacity-100" : "opacity-0"}`} />
          {course.status === "inactive" && (
            <div className="absolute top-3 right-3 bg-red-500 text-white px-3 py-1 text-xs font-body font-semibold rounded-full shadow-lg">
              Not Available
            </div>
          )}
          {/* Share button overlay */}
          <div className="absolute top-2 right-2">
            <ShareButton
              title={course.title}
              text={`Check out *${course.title}* (${course.badge}) at Javani Spiritual Hub`}
              url={`/courses/${course.id}`}
              className="bg-black/40 hover:bg-black/60 text-white hover:text-white rounded-full"
            />
          </div>
        </div>
        <div className="p-2.5 sm:p-6 flex flex-col flex-1">
          <span className={`inline-block px-2 py-0.5 text-[0.6rem] sm:text-xs font-body font-medium rounded-full mb-2 self-start ${badgeStyles[course.badgeColor] || badgeStyles.red}`}>{course.badge}</span>
          <h3 className="font-display font-semibold text-[0.75rem] sm:text-[1.4rem] text-foreground mb-2 sm:mb-4 transition-colors duration-300 group-hover:text-gold truncate">{course.title}</h3>
          <p className="mb-2 font-display text-[0.9rem] sm:text-[1.25rem] font-bold text-primary">{getCourseDisplayPrice(course)}</p>
          <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-3 flex-wrap mt-auto">
            <button type="button" onClick={buyCourse} disabled={!purchasable} className="flex flex-1 min-w-[80px] sm:min-w-[120px] items-center justify-center gap-1.5 rounded-sm bg-gradient-primary px-2 sm:px-4 py-1.5 sm:py-2 font-body text-[0.65rem] sm:text-[0.8rem] font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100">
              <ShoppingBag className="w-3 h-3 sm:w-4 sm:h-4" /> {purchasable ? "Buy Now" : "Fee Soon"}
            </button>
            <a
              href={`https://wa.me/${whatsappNumber}?text=${whatsappMsg}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-sm bg-[#25D366] text-white font-body font-medium text-[0.65rem] sm:text-[0.8rem] hover:bg-[#128C7E] transition-colors"
            >
              <MessageCircle className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">WhatsApp</span><span className="sm:hidden">WA</span>
            </a>
          </div>
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
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-8">
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
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<CourseCategory>("all");
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const { categories: courseCategories } = useCourseCategories();
  const activeCourseCategories = useMemo(() => getActiveCategories(courseCategories), [courseCategories]);
  const filters = useMemo(() => [
    { label: "All Courses", value: "all" },
    ...activeCourseCategories.map((category) => ({ label: category.label, value: category.id })),
  ], [activeCourseCategories]);

  useEffect(() => {
    const q = query(collection(db, "courses"));
    const unsub = onSnapshot(q, (snap) => {
      setCourses(snap.docs.map((d) => normalizeCourse(d.id, d.data(), courseCategories)));
      setLoading(false);
    }, () => { setLoading(false); });
    return unsub;
  }, [courseCategories]);

  const courseSections = useMemo(() => activeCourseCategories
    .map((category, index) => ({
      category,
      bgClass: index % 2 === 0 ? "bg-background" : "",
      courses: courses.filter((course) => course.category === category.id && course.status !== "inactive"),
    }))
    .filter((section) => (activeFilter === "all" || activeFilter === section.category.id) && section.courses.length > 0), [activeCourseCategories, activeFilter, courses]);
  const hasAny = courseSections.length > 0;

  useEffect(() => {
    document.body.classList.add("hide-nav-mobile");
    return () => document.body.classList.remove("hide-nav-mobile");
  }, []);

  return (
    <>
      <SEO
        title="Courses | Bharatanatyam, Kuchipudi, Carnatic Music & More | Javani Spiritual Hub"
        description="Explore grades, diploma, pre-grade, masterclass & workshops, yoga, and konnakol courses in classical Indian arts including Bharatanatyam, Kuchipudi, Carnatic Music, and more at Javani Spiritual Hub."
      />
      <main>
        {/* Mobile back arrow */}
        <button onClick={() => navigate(-1)} className="lg:hidden fixed top-4 left-4 z-[600] flex items-center justify-center w-10 h-10 rounded-full bg-black/40 text-white backdrop-blur-sm">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <PageHero backgroundImages={[heroDancer1, heroDancer2, heroDancer3]} label="OUR COURSES" heading="Our Sacred Courses" subtext="Classical arts for every soul — from first steps to national certification." />

        <div className="sticky top-0 sm:top-[80px] z-[500] bg-card shadow-sm py-3 sm:py-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap justify-center gap-2">
            {filters.map((f) => (
              <button key={f.value} onClick={() => setActiveFilter(f.value)} className={`px-4 sm:px-5 py-2 rounded-full font-body font-medium text-[0.8rem] sm:text-[0.875rem] transition-all duration-300 ${activeFilter === f.value ? "bg-gradient-primary text-primary-foreground" : "border border-ivory-dark text-muted-foreground hover:bg-ivory-dark"}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <section className="py-16 sm:py-20 md:py-32 bg-background">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
              {/* Loading - show nothing to avoid confusion */}
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
